import { isUniqueViolation } from "@agent-native/core/db";
import { accessFilter, assertAccess } from "@agent-native/core/sharing";
import { and, asc, count, desc, eq } from "drizzle-orm";

import {
  SAMPLE_DISCLAIMER,
  workspaceMapSchema,
} from "../../shared/recovery.js";
import { getDb } from "../db/index.js";
import {
  recoveryCapabilities,
  recoveryDependencyGroups,
  recoveryDependencyLinks,
  recoveryRemediationTasks,
  recoveryResources,
  recoverySimulationImpacts,
  recoverySimulationRuns,
  recoveryTests,
  recoveryWorkspaceShares,
  recoveryWorkspaces,
} from "../db/schema.js";
import { loadNorthstarFixture } from "./northstar-fixture.js";

export interface Actor {
  userEmail: string;
  orgId: string | null;
}

const NORTHSTAR_SEED = "northstar";
const LIST_LIMIT = 500;

export function tenantKeyFor(actor: Actor): string {
  return actor.orgId ? `org:${actor.orgId}` : `user:${actor.userEmail}`;
}

export async function seedNorthstar(actor: Actor) {
  const fixture = loadNorthstarFixture();
  const db = getDb();
  const existing = await findSeed(actor);
  if (existing) {
    return {
      id: existing.id,
      name: existing.name,
      created: false,
      ...(await countsFor(existing.id)),
    };
  }

  const now = new Date().toISOString();
  const tenantKey = tenantKeyFor(actor);
  const workspaceId = crypto.randomUUID();

  try {
    await db.transaction(async (tx) => {
      await tx.insert(recoveryWorkspaces).values({
        id: workspaceId,
        name: fixture.workspace.name,
        seedKey: NORTHSTAR_SEED,
        tenantKey,
        fictional: true,
        ownerEmail: actor.userEmail,
        orgId: actor.orgId,
        visibility: actor.orgId ? "org" : "private",
        createdAt: now,
        updatedAt: now,
      });
      await insertFixtureGraph(tx, actor, workspaceId, now);
    });
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    const raced = await findSeed(actor);
    if (!raced) throw error;
    return {
      id: raced.id,
      name: raced.name,
      created: false,
      ...(await countsFor(raced.id)),
    };
  }

  return {
    id: workspaceId,
    name: fixture.workspace.name,
    created: true,
    ...(await countsFor(workspaceId)),
  };
}

export async function readWorkspaceMap(workspaceId?: string) {
  const db = getDb();
  const empty = {
    workspace: null,
    resources: [],
    capabilities: [],
    groups: [],
    links: [],
    disclaimer: SAMPLE_DISCLAIMER,
  };

  let workspace: {
    id: string;
    name: string;
    fictional: boolean;
    seedKey: string | null;
  } | null = null;

  if (workspaceId) {
    await assertAccess("recovery-workspace", workspaceId, "viewer");
    const [row] = await db
      .select({
        id: recoveryWorkspaces.id,
        name: recoveryWorkspaces.name,
        fictional: recoveryWorkspaces.fictional,
        seedKey: recoveryWorkspaces.seedKey,
      })
      .from(recoveryWorkspaces)
      .where(eq(recoveryWorkspaces.id, workspaceId))
      .limit(1);
    workspace = row ?? null;
  } else {
    const rows = await db
      .select({
        id: recoveryWorkspaces.id,
        name: recoveryWorkspaces.name,
        fictional: recoveryWorkspaces.fictional,
        seedKey: recoveryWorkspaces.seedKey,
      })
      .from(recoveryWorkspaces)
      .where(accessFilter(recoveryWorkspaces, recoveryWorkspaceShares))
      .orderBy(desc(recoveryWorkspaces.createdAt))
      .limit(20);
    workspace =
      rows.find((row) => row.seedKey === NORTHSTAR_SEED) ?? rows[0] ?? null;
  }

  if (!workspace) return workspaceMapSchema.parse(empty);

  const [resources, capabilities, groups, links] = await Promise.all([
    db
      .select({
        id: recoveryResources.id,
        slug: recoveryResources.slug,
        name: recoveryResources.name,
        kind: recoveryResources.kind,
        criticality: recoveryResources.criticality,
        ownerLabel: recoveryResources.ownerLabel,
        description: recoveryResources.description,
        status: recoveryResources.status,
      })
      .from(recoveryResources)
      .where(eq(recoveryResources.workspaceId, workspace.id))
      .orderBy(asc(recoveryResources.name))
      .limit(LIST_LIMIT),
    db
      .select({
        id: recoveryCapabilities.id,
        resourceId: recoveryCapabilities.resourceId,
        capability: recoveryCapabilities.capability,
        mode: recoveryCapabilities.mode,
        confidence: recoveryCapabilities.confidence,
        notes: recoveryCapabilities.notes,
      })
      .from(recoveryCapabilities)
      .where(eq(recoveryCapabilities.workspaceId, workspace.id))
      .limit(LIST_LIMIT),
    db
      .select({
        id: recoveryDependencyGroups.id,
        slug: recoveryDependencyGroups.slug,
        resourceId: recoveryDependencyGroups.resourceId,
        capability: recoveryDependencyGroups.capability,
        requirementMode: recoveryDependencyGroups.requirementMode,
        label: recoveryDependencyGroups.label,
      })
      .from(recoveryDependencyGroups)
      .where(eq(recoveryDependencyGroups.workspaceId, workspace.id))
      .limit(LIST_LIMIT),
    db
      .select({
        id: recoveryDependencyLinks.id,
        slug: recoveryDependencyLinks.slug,
        groupId: recoveryDependencyLinks.groupId,
        prerequisiteResourceId: recoveryDependencyLinks.prerequisiteResourceId,
        prerequisiteCapability: recoveryDependencyLinks.prerequisiteCapability,
        confidence: recoveryDependencyLinks.confidence,
        notes: recoveryDependencyLinks.notes,
      })
      .from(recoveryDependencyLinks)
      .where(eq(recoveryDependencyLinks.workspaceId, workspace.id))
      .limit(LIST_LIMIT),
  ]);

  return workspaceMapSchema.parse({
    workspace,
    resources,
    capabilities,
    groups,
    links,
    disclaimer: SAMPLE_DISCLAIMER,
  });
}


type Tx = Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];

/** Insert the fictional Northstar graph into an existing workspace row. */
async function insertFixtureGraph(tx: Tx, actor: Actor, workspaceId: string, now: string) {
  const fixture = loadNorthstarFixture();
  const resourceIds = new Map(
    fixture.resources.map((resource) => [resource.id, crypto.randomUUID()]),
  );
  const groupIds = new Map(
    fixture.groups.map((group) => [group.id, crypto.randomUUID()]),
  );
  await tx.insert(recoveryResources).values(
    fixture.resources.map((resource) => ({
      id: resourceIds.get(resource.id)!,
      workspaceId,
      slug: resource.id,
      name: resource.name,
      kind: resource.kind,
      criticality: resource.criticality,
      ownerLabel: resource.owner ?? null,
      description: null,
      status: "active" as const,
      ownerEmail: actor.userEmail,
      orgId: actor.orgId,
      createdAt: now,
      updatedAt: now,
    })),
  );
  if (fixture.capabilities.length > 0) {
    await tx.insert(recoveryCapabilities).values(
      fixture.capabilities.map((capability) => ({
        id: crypto.randomUUID(),
        workspaceId,
        resourceId: resourceIds.get(capability.resourceId)!,
        capability: capability.capability,
        mode: capability.mode,
        confidence: capability.confidence,
        notes: null,
        ownerEmail: actor.userEmail,
        orgId: actor.orgId,
        updatedAt: now,
      })),
    );
  }
  if (fixture.groups.length > 0) {
    await tx.insert(recoveryDependencyGroups).values(
      fixture.groups.map((group) => ({
        id: groupIds.get(group.id)!,
        workspaceId,
        resourceId: resourceIds.get(group.resourceId)!,
        slug: group.id,
        capability: group.capability,
        requirementMode: group.requirementMode,
        label: group.label,
        ownerEmail: actor.userEmail,
        orgId: actor.orgId,
        createdAt: now,
      })),
    );
  }
  if (fixture.links.length > 0) {
    await tx.insert(recoveryDependencyLinks).values(
      fixture.links.map((link) => ({
        id: crypto.randomUUID(),
        workspaceId,
        groupId: groupIds.get(link.groupId)!,
        slug: link.id,
        prerequisiteResourceId: resourceIds.get(
          link.prerequisiteResourceId,
        )!,
        prerequisiteCapability: link.prerequisiteCapability,
        confidence: link.confidence,
        notes: null,
        lastVerifiedAt: null,
        ownerEmail: actor.userEmail,
        orgId: actor.orgId,
        createdAt: now,
      })),
    );
  }
}

/**
 * Put the fictional sample back to its imported state: delete its runs, tasks,
 * tests, and edits, then import the fixture again into the same workspace, so
 * links and sharing keep working. Refuses any workspace that is not the sample.
 */
export async function resetNorthstar(actor: Actor) {
  const existing = await findSeed(actor);
  if (!existing) {
    throw new NorthstarResetError("There is no sample team to reset. Import it first.");
  }
  await assertAccess("recovery-workspace", existing.id, "editor");
  const db = getDb();
  const now = new Date().toISOString();
  await db.transaction(async (tx) => {
    const [locked] = await tx
      .select({ id: recoveryWorkspaces.id, fictional: recoveryWorkspaces.fictional, seedKey: recoveryWorkspaces.seedKey })
      .from(recoveryWorkspaces)
      .where(
        and(
          eq(recoveryWorkspaces.id, existing.id),
          accessFilter(recoveryWorkspaces, recoveryWorkspaceShares),
        ),
      )
      .for("update")
      .limit(1);
    if (!locked || !locked.fictional || locked.seedKey !== NORTHSTAR_SEED) {
      throw new NorthstarResetError("Only the fictional sample team can be reset.");
    }
    const id = existing.id;
    // Children before parents, so every foreign key is satisfied.
    await tx.delete(recoveryTests).where(eq(recoveryTests.workspaceId, id));
    await tx.delete(recoveryRemediationTasks).where(eq(recoveryRemediationTasks.workspaceId, id));
    await tx.delete(recoverySimulationImpacts).where(eq(recoverySimulationImpacts.workspaceId, id));
    await tx.delete(recoverySimulationRuns).where(eq(recoverySimulationRuns.workspaceId, id));
    await tx.delete(recoveryDependencyLinks).where(eq(recoveryDependencyLinks.workspaceId, id));
    await tx.delete(recoveryDependencyGroups).where(eq(recoveryDependencyGroups.workspaceId, id));
    await tx.delete(recoveryCapabilities).where(eq(recoveryCapabilities.workspaceId, id));
    await tx.delete(recoveryResources).where(eq(recoveryResources.workspaceId, id));
    await insertFixtureGraph(tx, actor, id, now);
    await tx.update(recoveryWorkspaces).set({ updatedAt: now }).where(eq(recoveryWorkspaces.id, id));
  });
  return { id: existing.id, name: existing.name, ...(await countsFor(existing.id)) };
}

export class NorthstarResetError extends Error {}

async function findSeed(actor: Actor) {
  const db = getDb();
  const tenantScope = actor.orgId
    ? eq(recoveryWorkspaces.orgId, actor.orgId)
    : eq(recoveryWorkspaces.ownerEmail, actor.userEmail);
  const [row] = await db
    .select({
      id: recoveryWorkspaces.id,
      name: recoveryWorkspaces.name,
    })
    .from(recoveryWorkspaces)
    .where(
      and(
        eq(recoveryWorkspaces.tenantKey, tenantKeyFor(actor)),
        eq(recoveryWorkspaces.seedKey, NORTHSTAR_SEED),
        tenantScope,
      ),
    )
    .limit(1);
  return row ?? null;
}

async function countsFor(workspaceId: string) {
  const db = getDb();
  const [resources, capabilities, groups, links] = await Promise.all([
    db
      .select({ value: count() })
      .from(recoveryResources)
      .where(eq(recoveryResources.workspaceId, workspaceId)),
    db
      .select({ value: count() })
      .from(recoveryCapabilities)
      .where(eq(recoveryCapabilities.workspaceId, workspaceId)),
    db
      .select({ value: count() })
      .from(recoveryDependencyGroups)
      .where(eq(recoveryDependencyGroups.workspaceId, workspaceId)),
    db
      .select({ value: count() })
      .from(recoveryDependencyLinks)
      .where(eq(recoveryDependencyLinks.workspaceId, workspaceId)),
  ]);
  return {
    resourceCount: Number(resources[0]?.value ?? 0),
    capabilityCount: Number(capabilities[0]?.value ?? 0),
    groupCount: Number(groups[0]?.value ?? 0),
    linkCount: Number(links[0]?.value ?? 0),
  };
}
