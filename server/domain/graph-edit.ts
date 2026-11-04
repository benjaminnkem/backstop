import { isUniqueViolation } from "@agent-native/core/db";
import {
  accessFilter,
  assertAccess,
  ForbiddenError,
} from "@agent-native/core/sharing";
import { and, desc, eq, inArray, or } from "drizzle-orm";

import type {
  Capability,
  CapabilityMode,
  Confidence,
  RequirementMode,
} from "../../shared/recovery.js";
import { assertSlug, slugFromName } from "../../shared/slugs.js";
import { getDb } from "../db/index.js";
import {
  recoveryCapabilities,
  recoveryDependencyGroups,
  recoveryDependencyLinks,
  recoveryResources,
  recoveryTests,
  recoveryWorkspaceShares,
  recoveryWorkspaces,
} from "../db/schema.js";
import { findSecretText } from "./secrets.js";
import type { Actor } from "./workspace-map.js";

const NORTHSTAR_SEED = "northstar";

export class GraphEditInputError extends Error {}
export class GraphEditConflictError extends Error {}
export class GraphEditAccessError extends Error {}

interface WorkspaceRef {
  id: string;
  name: string;
}

export interface CreateResourceInput {
  workspaceId?: string | undefined;
  name: string;
  kind: typeof recoveryResources.$inferInsert.kind;
  criticality: typeof recoveryResources.$inferInsert.criticality;
  slug?: string | undefined;
  ownerLabel?: string | undefined;
  notes?: string | undefined;
}

export interface CreateCapabilityInput {
  workspaceId?: string | undefined;
  resourceId: string;
  capability: Capability;
  mode: CapabilityMode;
  confidence: Confidence;
  notes?: string | undefined;
}

export interface AddDependencyRouteInput {
  workspaceId?: string | undefined;
  resourceId: string;
  capability: Capability;
  groupSlug: string;
  requirementMode: RequirementMode;
  label: string;
  linkSlug: string;
  prerequisiteResourceId: string;
  prerequisiteCapability: Capability;
  confidence: Confidence;
  notes?: string | undefined;
}

export async function createResource(actor: Actor, input: CreateResourceInput) {
  rejectSecrets([input.name, input.ownerLabel, input.notes, input.slug]);
  const name = requiredText(input.name, 120, "Name");
  const slug = input.slug?.trim()
    ? parseSlug(input.slug)
    : parseSlug(slugFromName(name));
  const ownerLabel = optionalText(input.ownerLabel, 80);
  const notes = optionalText(input.notes, 500);
  const workspace = await resolveWorkspace(input.workspaceId);
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  const db = getDb();
  try {
    await db.transaction(async (tx) => {
      await lockWorkspace(tx, workspace.id);
      await tx.insert(recoveryResources).values({
        id,
        workspaceId: workspace.id,
        slug,
        name,
        kind: input.kind,
        criticality: input.criticality,
        ownerLabel,
        description: notes,
        status: "active",
        ownerEmail: actor.userEmail,
        orgId: actor.orgId,
        createdAt: now,
        updatedAt: now,
      });
      const [saved] = await tx
        .select({ id: recoveryResources.id })
        .from(recoveryResources)
        .where(eq(recoveryResources.id, id))
        .limit(1);
      if (!saved) {
        throw new Error("The resource insert did not return a row.");
      }
    });
  } catch (error) {
    rethrowUnique(error, "A resource with that slug already exists.");
  }
  return {
    id,
    workspaceId: workspace.id,
    slug,
    name,
    nextRequiredAction: "create-capability" as const,
  };
}

export async function createCapability(
  actor: Actor,
  input: CreateCapabilityInput,
) {
  rejectSecrets([input.notes]);
  const notes = optionalText(input.notes, 500);
  const workspace = await resolveWorkspace(input.workspaceId);
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  const db = getDb();
  let resourceId = "";
  try {
    await db.transaction(async (tx) => {
      await lockWorkspace(tx, workspace.id);
      const resource = await resourceInWorkspace(tx, workspace.id, input.resourceId);
      if (!resource) {
        throw new GraphEditInputError("That resource is not on this map.");
      }
      if (resource.status === "archived") {
        throw new GraphEditInputError("That resource is archived.");
      }
      resourceId = resource.id;
      await tx.insert(recoveryCapabilities).values({
        id,
        workspaceId: workspace.id,
        resourceId: resource.id,
        capability: input.capability,
        mode: input.mode,
        confidence: input.confidence,
        notes,
        ownerEmail: actor.userEmail,
        orgId: actor.orgId,
        updatedAt: now,
      });
      const [saved] = await tx
        .select({ id: recoveryCapabilities.id })
        .from(recoveryCapabilities)
        .where(eq(recoveryCapabilities.id, id))
        .limit(1);
      if (!saved) {
        throw new Error("The capability insert did not return a row.");
      }
    });
  } catch (error) {
    rethrowUnique(
      error,
      "That capability is already recorded for this resource.",
    );
  }
  return {
    id,
    workspaceId: workspace.id,
    resourceId,
    capability: input.capability,
    mode: input.mode,
    confidence: input.confidence,
    ...(input.mode === "dependent"
      ? { nextRequiredAction: "add-dependency-route" as const }
      : {}),
  };
}

export async function addDependencyRoute(
  actor: Actor,
  input: AddDependencyRouteInput,
) {
  rejectSecrets([input.label, input.notes, input.groupSlug, input.linkSlug]);
  const label = requiredText(input.label, 160, "Label");
  const notes = optionalText(input.notes, 500);
  const groupSlug = parseSlug(input.groupSlug);
  const linkSlug = parseSlug(input.linkSlug);
  const workspace = await resolveWorkspace(input.workspaceId);
  const now = new Date().toISOString();
  const groupId = crypto.randomUUID();
  const linkId = crypto.randomUUID();
  const db = getDb();
  let resourceId = "";
  try {
    await db.transaction(async (tx) => {
      await lockWorkspace(tx, workspace.id);
      const target = await resourceInWorkspace(tx, workspace.id, input.resourceId);
      const prerequisite = await resourceInWorkspace(
        tx,
        workspace.id,
        input.prerequisiteResourceId,
      );
      if (!target || !prerequisite) {
        throw new GraphEditInputError(
          "The route resources must already be on this map.",
        );
      }
      if (target.status === "archived" || prerequisite.status === "archived") {
        throw new GraphEditInputError("Archived resources cannot take a new route.");
      }
      if (
        target.id === prerequisite.id &&
        input.capability === input.prerequisiteCapability
      ) {
        throw new GraphEditInputError(
          "A route cannot require the same resource capability it unlocks.",
        );
      }
      const [targetCapability] = await tx
        .select({ mode: recoveryCapabilities.mode })
        .from(recoveryCapabilities)
        .where(
          and(
            eq(recoveryCapabilities.resourceId, target.id),
            eq(recoveryCapabilities.capability, input.capability),
          ),
        )
        .limit(1);
      if (!targetCapability) {
        throw new GraphEditInputError(
          "Record the target capability before adding a route.",
        );
      }
      if (targetCapability.mode !== "dependent") {
        throw new GraphEditInputError(
          "Record the capability as dependent before adding a route. Independent and unknown capabilities ignore dependency groups.",
        );
      }
      const [prerequisiteCapability] = await tx
        .select({ id: recoveryCapabilities.id })
        .from(recoveryCapabilities)
        .where(
          and(
            eq(recoveryCapabilities.resourceId, prerequisite.id),
            eq(recoveryCapabilities.capability, input.prerequisiteCapability),
          ),
        )
        .limit(1);
      if (!prerequisiteCapability) {
        throw new GraphEditInputError(
          "Record the prerequisite capability before linking it.",
        );
      }
      resourceId = target.id;
      await tx.insert(recoveryDependencyGroups).values({
        id: groupId,
        workspaceId: workspace.id,
        resourceId: target.id,
        slug: groupSlug,
        capability: input.capability,
        requirementMode: input.requirementMode,
        label,
        ownerEmail: actor.userEmail,
        orgId: actor.orgId,
        createdAt: now,
      });
      await tx.insert(recoveryDependencyLinks).values({
        id: linkId,
        workspaceId: workspace.id,
        groupId,
        slug: linkSlug,
        prerequisiteResourceId: prerequisite.id,
        prerequisiteCapability: input.prerequisiteCapability,
        confidence: input.confidence,
        notes,
        lastVerifiedAt: null,
        ownerEmail: actor.userEmail,
        orgId: actor.orgId,
        createdAt: now,
      });
      const [saved] = await tx
        .select({ id: recoveryDependencyLinks.id })
        .from(recoveryDependencyLinks)
        .where(eq(recoveryDependencyLinks.id, linkId))
        .limit(1);
      if (!saved) {
        throw new Error("The route insert did not return a row.");
      }
    });
  } catch (error) {
    rethrowUnique(error, "That route slug is already recorded in this workspace.");
  }
  return {
    id: groupId,
    workspaceId: workspace.id,
    resourceId,
    groupSlug,
    linkId,
    linkSlug,
    label,
  };
}

/**
 * Archive or restore a resource. Archived resources leave future runs; a route
 * that still needs one evaluates as unknown. Saved runs are not rewritten.
 */
export async function setResourceArchived(input: {
  workspaceId?: string | undefined;
  resourceId: string;
  archived: boolean;
}) {
  const workspace = await resolveWorkspace(input.workspaceId);
  const db = getDb();
  return db.transaction(async (tx) => {
    await lockWorkspace(tx, workspace.id);
    const resource = await resourceInWorkspace(tx, workspace.id, input.resourceId);
    if (!resource) throw new GraphEditInputError("That resource is not on this map.");
    const next = input.archived ? "archived" : "active";
    if (resource.status !== next) {
      await tx
        .update(recoveryResources)
        .set({ status: next, updatedAt: new Date().toISOString() })
        .where(eq(recoveryResources.id, resource.id));
    }
    const dependents = await tx
      .select({ groupId: recoveryDependencyLinks.groupId })
      .from(recoveryDependencyLinks)
      .where(
        and(
          eq(recoveryDependencyLinks.workspaceId, workspace.id),
          eq(recoveryDependencyLinks.prerequisiteResourceId, resource.id),
        ),
      );
    const [saved] = await tx
      .select({ status: recoveryResources.status, name: recoveryResources.name })
      .from(recoveryResources)
      .where(eq(recoveryResources.id, resource.id))
      .limit(1);
    if (!saved || saved.status !== next) throw new Error("The resource status did not save.");
    return {
      id: resource.id,
      workspaceId: workspace.id,
      name: saved.name,
      archived: input.archived,
      dependentRoutes: new Set(dependents.map((item) => item.groupId)).size,
    };
  });
}

/** Remove one route (a dependency group and its links). Saved runs are not rewritten. */
export async function removeDependencyRoute(input: {
  workspaceId?: string | undefined;
  groupId: string;
}) {
  const workspace = await resolveWorkspace(input.workspaceId);
  const db = getDb();
  return db.transaction(async (tx) => {
    await lockWorkspace(tx, workspace.id);
    const [group] = await tx
      .select({
        id: recoveryDependencyGroups.id,
        label: recoveryDependencyGroups.label,
        resourceId: recoveryDependencyGroups.resourceId,
      })
      .from(recoveryDependencyGroups)
      .where(
        and(
          eq(recoveryDependencyGroups.workspaceId, workspace.id),
          or(
            eq(recoveryDependencyGroups.id, input.groupId),
            eq(recoveryDependencyGroups.slug, input.groupId),
          ),
        ),
      )
      .limit(1);
    if (!group) throw new GraphEditInputError("That route is not on this map.");
    // A test of this route stays on record; it just no longer names the route.
    await tx
      .update(recoveryTests)
      .set({ groupId: null })
      .where(inArray(recoveryTests.groupId, [group.id]));
    await tx.delete(recoveryDependencyLinks).where(eq(recoveryDependencyLinks.groupId, group.id));
    await tx.delete(recoveryDependencyGroups).where(eq(recoveryDependencyGroups.id, group.id));
    const [left] = await tx
      .select({ id: recoveryDependencyGroups.id })
      .from(recoveryDependencyGroups)
      .where(eq(recoveryDependencyGroups.id, group.id))
      .limit(1);
    if (left) throw new Error("The route was not removed.");
    return {
      id: group.id,
      workspaceId: workspace.id,
      resourceId: group.resourceId,
      label: group.label,
    };
  });
}

export function graphEditFailure(error: unknown): {
  code: "VALIDATION_ERROR" | "OVERLAP" | "FORBIDDEN";
  statusCode: 400 | 409 | 403;
  message: string;
} | null {
  if (error instanceof GraphEditInputError) {
    return { code: "VALIDATION_ERROR", statusCode: 400, message: error.message };
  }
  if (error instanceof GraphEditConflictError) {
    return { code: "OVERLAP", statusCode: 409, message: error.message };
  }
  if (error instanceof GraphEditAccessError || error instanceof ForbiddenError) {
    return {
      code: "FORBIDDEN",
      statusCode: 403,
      message: "That recovery workspace is not available.",
    };
  }
  return null;
}

async function resolveWorkspace(
  workspaceId?: string | undefined,
): Promise<WorkspaceRef> {
  const db = getDb();
  if (workspaceId) {
    await assertAccess("recovery-workspace", workspaceId, "editor");
    const [row] = await db
      .select({ id: recoveryWorkspaces.id, name: recoveryWorkspaces.name })
      .from(recoveryWorkspaces)
      .where(
        and(
          eq(recoveryWorkspaces.id, workspaceId),
          accessFilter(recoveryWorkspaces, recoveryWorkspaceShares),
        ),
      )
      .limit(1);
    if (!row) throw new GraphEditAccessError("That recovery workspace is not available.");
    return row;
  }
  const rows = await db
    .select({
      id: recoveryWorkspaces.id,
      name: recoveryWorkspaces.name,
      seedKey: recoveryWorkspaces.seedKey,
    })
    .from(recoveryWorkspaces)
    .where(accessFilter(recoveryWorkspaces, recoveryWorkspaceShares))
    .orderBy(desc(recoveryWorkspaces.createdAt))
    .limit(20);
  const row = rows.find((item) => item.seedKey === NORTHSTAR_SEED) ?? rows[0];
  if (!row) {
    throw new GraphEditInputError("Import the sample team before editing the map.");
  }
  await assertAccess("recovery-workspace", row.id, "editor");
  return { id: row.id, name: row.name };
}

async function lockWorkspace(
  tx: Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0],
  workspaceId: string,
) {
  const [locked] = await tx
    .select({ id: recoveryWorkspaces.id })
    .from(recoveryWorkspaces)
    .where(
      and(
        eq(recoveryWorkspaces.id, workspaceId),
        accessFilter(recoveryWorkspaces, recoveryWorkspaceShares),
      ),
    )
    .for("update")
    .limit(1);
  if (!locked) {
    throw new GraphEditAccessError("That recovery workspace is not available.");
  }
}

async function resourceInWorkspace(
  tx: Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0],
  workspaceId: string,
  idOrSlug: string,
) {
  const columns = {
    id: recoveryResources.id,
    slug: recoveryResources.slug,
    status: recoveryResources.status,
  };
  const [byId] = await tx
    .select(columns)
    .from(recoveryResources)
    .where(
      and(
        eq(recoveryResources.workspaceId, workspaceId),
        eq(recoveryResources.id, idOrSlug),
      ),
    )
    .limit(1);
  if (byId) return byId;
  const [bySlug] = await tx
    .select(columns)
    .from(recoveryResources)
    .where(
      and(
        eq(recoveryResources.workspaceId, workspaceId),
        eq(recoveryResources.slug, idOrSlug),
      ),
    )
    .limit(1);
  return bySlug ?? null;
}

function rejectSecrets(values: Array<string | null | undefined>) {
  if (values.some((value) => findSecretText(value))) {
    throw new GraphEditInputError(
      "That text looks like a credential. Keep secrets out of the recovery map.",
    );
  }
}

function requiredText(value: string, max: number, label: string): string {
  const text = value.trim();
  if (!text || text.length > max) {
    throw new GraphEditInputError(`${label} must be 1–${max} characters.`);
  }
  return text;
}

function optionalText(
  value: string | null | undefined,
  max: number,
): string | null {
  if (value == null) return null;
  const text = value.trim();
  if (!text) return null;
  if (text.length > max) {
    throw new GraphEditInputError(`Keep that note to ${max} characters.`);
  }
  return text;
}

function parseSlug(slug: string): string {
  try {
    return assertSlug(slug);
  } catch (error) {
    throw new GraphEditInputError(
      error instanceof Error ? error.message : "Use a valid slug.",
    );
  }
}

function rethrowUnique(error: unknown, message: string): never {
  if (
    error instanceof GraphEditInputError ||
    error instanceof GraphEditAccessError ||
    error instanceof GraphEditConflictError
  ) {
    throw error;
  }
  if (uniqueViolation(error)) {
    throw new GraphEditConflictError(message);
  }
  throw error;
}

function uniqueViolation(error: unknown): boolean {
  if (isUniqueViolation(error)) return true;
  if (error && typeof error === "object" && "cause" in error) {
    return uniqueViolation((error as { cause: unknown }).cause);
  }
  return false;
}

