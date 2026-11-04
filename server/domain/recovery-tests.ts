import { accessFilter, assertAccess, ForbiddenError } from "@agent-native/core/sharing";
import { and, desc, eq, or } from "drizzle-orm";

import type { Capability } from "../../shared/recovery.js";
import { recoveryTestSchema, type TestOutcome } from "../../shared/recovery-tests.js";
import { getDb } from "../db/index.js";
import {
  recoveryCapabilities,
  recoveryDependencyGroups,
  recoveryResources,
  recoveryTests,
  recoveryWorkspaceShares,
  recoveryWorkspaces,
} from "../db/schema.js";
import { findSecretText } from "./secrets.js";
import type { Actor } from "./workspace-map.js";

const NORTHSTAR_SEED = "northstar";
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export class RecoveryTestInputError extends Error {}
export class RecoveryTestAccessError extends Error {}
/** Raised when a pass or fail is recorded without a person confirming it. */
export class RecoveryTestConfirmationError extends Error {}

type Tx = Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];

export interface ResultAuthority {
  /** True only for a call from the app UI, never for the agent or an API client. */
  fromHumanSurface: boolean;
  /** The person ticked "I performed or watched this test". */
  humanConfirmed: boolean;
}

export interface RecordTestInput {
  workspaceId?: string | undefined;
  resourceId: string;
  capability: Capability;
  groupId?: string | undefined;
  method: string;
  testerLabel?: string | undefined;
  testedOn?: string | undefined;
  outcome: TestOutcome;
  evidenceNotes?: string | undefined;
}

export interface UpdateTestInput {
  testId: string;
  method?: string | undefined;
  testerLabel?: string | undefined;
  testedOn?: string | undefined;
  outcome?: TestOutcome | undefined;
  evidenceNotes?: string | undefined;
}

export async function listRecoveryTests(input: {
  workspaceId?: string | undefined;
  resourceId?: string | undefined;
}) {
  const workspace = await resolveWorkspace(input.workspaceId, "viewer");
  const db = getDb();
  const rows = await db
    .select({
      id: recoveryTests.id,
      workspaceId: recoveryTests.workspaceId,
      resourceId: recoveryTests.resourceId,
      resourceName: recoveryResources.name,
      capability: recoveryTests.capability,
      groupId: recoveryTests.groupId,
      routeLabel: recoveryDependencyGroups.label,
      method: recoveryTests.method,
      testerLabel: recoveryTests.testerLabel,
      testedOn: recoveryTests.testedOn,
      outcome: recoveryTests.outcome,
      evidenceNotes: recoveryTests.evidenceNotes,
      confirmedByHuman: recoveryTests.confirmedByHuman,
      createdAt: recoveryTests.createdAt,
      updatedAt: recoveryTests.updatedAt,
    })
    .from(recoveryTests)
    .innerJoin(recoveryResources, eq(recoveryResources.id, recoveryTests.resourceId))
    .leftJoin(recoveryDependencyGroups, eq(recoveryDependencyGroups.id, recoveryTests.groupId))
    .where(
      and(
        eq(recoveryTests.workspaceId, workspace.id),
        input.resourceId
          ? or(
              eq(recoveryTests.resourceId, input.resourceId),
              eq(recoveryResources.slug, input.resourceId),
            )
          : undefined,
      ),
    )
    .orderBy(desc(recoveryTests.createdAt))
    .limit(200);
  return {
    workspaceId: workspace.id,
    tests: rows.map((row) => recoveryTestSchema.parse(row)),
  };
}

export async function recordRecoveryTest(
  actor: Actor,
  authority: ResultAuthority,
  input: RecordTestInput,
) {
  rejectSecrets([input.method, input.testerLabel, input.evidenceNotes]);
  assertResultAuthority(input.outcome, authority);
  const method = requiredText(input.method, 240, "Method");
  const testerLabel = optionalText(input.testerLabel, 80);
  const evidenceNotes = optionalText(input.evidenceNotes, 1000);
  const testedOn = parseDate(input.testedOn);
  if (input.outcome !== "planned" && !testedOn) {
    throw new RecoveryTestInputError("Add the date the test was performed.");
  }
  const workspace = await resolveWorkspace(input.workspaceId, "editor");
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const db = getDb();
  let resourceId = "";
  await db.transaction(async (tx) => {
    await lockWorkspace(tx, workspace.id);
    resourceId = await resourceInWorkspace(tx, workspace.id, input.resourceId);
    const [capability] = await tx
      .select({ id: recoveryCapabilities.id })
      .from(recoveryCapabilities)
      .where(
        and(
          eq(recoveryCapabilities.resourceId, resourceId),
          eq(recoveryCapabilities.capability, input.capability),
        ),
      )
      .limit(1);
    if (!capability) {
      throw new RecoveryTestInputError(
        `That resource has no ${input.capability} capability recorded.`,
      );
    }
    let groupId: string | null = null;
    if (input.groupId) {
      const [group] = await tx
        .select({ id: recoveryDependencyGroups.id })
        .from(recoveryDependencyGroups)
        .where(
          and(
            eq(recoveryDependencyGroups.workspaceId, workspace.id),
            eq(recoveryDependencyGroups.resourceId, resourceId),
            eq(recoveryDependencyGroups.capability, input.capability),
            or(
              eq(recoveryDependencyGroups.id, input.groupId),
              eq(recoveryDependencyGroups.slug, input.groupId),
            ),
          ),
        )
        .limit(1);
      if (!group) throw new RecoveryTestInputError("That route is not on this capability.");
      groupId = group.id;
    }
    await tx.insert(recoveryTests).values({
      id,
      workspaceId: workspace.id,
      resourceId,
      capability: input.capability,
      groupId,
      method,
      testerLabel,
      testedOn,
      outcome: input.outcome,
      evidenceNotes,
      confirmedByHuman: input.outcome !== "planned",
      createdBy: actor.userEmail,
      ownerEmail: actor.userEmail,
      orgId: actor.orgId,
      createdAt: now,
      updatedAt: now,
    });
    const [saved] = await tx
      .select({ id: recoveryTests.id })
      .from(recoveryTests)
      .where(eq(recoveryTests.id, id))
      .limit(1);
    if (!saved) throw new Error("The test insert did not return a row.");
  });
  return {
    id,
    workspaceId: workspace.id,
    resourceId,
    capability: input.capability,
    outcome: input.outcome,
  };
}

export async function updateRecoveryTest(authority: ResultAuthority, input: UpdateTestInput) {
  rejectSecrets([input.method, input.testerLabel, input.evidenceNotes]);
  if (input.outcome) assertResultAuthority(input.outcome, authority);
  const patch = {
    ...(input.method !== undefined ? { method: requiredText(input.method, 240, "Method") } : {}),
    ...(input.testerLabel !== undefined ? { testerLabel: optionalText(input.testerLabel, 80) } : {}),
    ...(input.testedOn !== undefined ? { testedOn: parseDate(input.testedOn) } : {}),
    ...(input.evidenceNotes !== undefined
      ? { evidenceNotes: optionalText(input.evidenceNotes, 1000) }
      : {}),
    ...(input.outcome !== undefined
      ? { outcome: input.outcome, confirmedByHuman: input.outcome !== "planned" }
      : {}),
  };
  if (Object.keys(patch).length === 0) {
    throw new RecoveryTestInputError("Choose a field to change.");
  }
  const db = getDb();
  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select({
        id: recoveryTests.id,
        workspaceId: recoveryTests.workspaceId,
        resourceId: recoveryTests.resourceId,
        capability: recoveryTests.capability,
        outcome: recoveryTests.outcome,
        testedOn: recoveryTests.testedOn,
      })
      .from(recoveryTests)
      .where(eq(recoveryTests.id, input.testId))
      .limit(1);
    if (!existing) throw new RecoveryTestAccessError("That recovery test is not available.");
    await assertAccess("recovery-workspace", existing.workspaceId, "editor");
    await lockWorkspace(tx, existing.workspaceId);
    // Editing any detail of a recorded result is itself a result change.
    if (existing.outcome !== "planned" && !authority.fromHumanSurface) {
      throw new RecoveryTestConfirmationError(
        "Only a person can change a recorded test result. Open the test in the app.",
      );
    }
    const nextOutcome = (patch.outcome ?? existing.outcome) as TestOutcome;
    const nextDate = "testedOn" in patch ? patch.testedOn : existing.testedOn;
    if (nextOutcome !== "planned" && !nextDate) {
      throw new RecoveryTestInputError("Add the date the test was performed.");
    }
    await tx
      .update(recoveryTests)
      .set({ ...patch, updatedAt: new Date().toISOString() })
      .where(eq(recoveryTests.id, existing.id));
    return {
      id: existing.id,
      workspaceId: existing.workspaceId,
      resourceId: existing.resourceId,
      capability: existing.capability as Capability,
      outcome: nextOutcome,
    };
  });
}

/** passed and failed need a person, in the app, who says they performed or watched it. */
export function assertResultAuthority(outcome: TestOutcome, authority: ResultAuthority) {
  if (outcome === "planned") return;
  if (!authority.fromHumanSurface) {
    throw new RecoveryTestConfirmationError(
      "Only a person can record a test result. Suggest the test as planned, then record the outcome in the app.",
    );
  }
  if (!authority.humanConfirmed) {
    throw new RecoveryTestConfirmationError(
      "Confirm that you performed or watched this test before recording a result.",
    );
  }
}

export function recoveryTestFailure(error: unknown): {
  code: "VALIDATION_ERROR" | "FORBIDDEN" | "CONFIRMATION_REQUIRED";
  statusCode: 400 | 403;
  message: string;
} | null {
  if (error instanceof RecoveryTestInputError) {
    return { code: "VALIDATION_ERROR", statusCode: 400, message: error.message };
  }
  if (error instanceof RecoveryTestConfirmationError) {
    return { code: "CONFIRMATION_REQUIRED", statusCode: 403, message: error.message };
  }
  if (error instanceof RecoveryTestAccessError || error instanceof ForbiddenError) {
    return { code: "FORBIDDEN", statusCode: 403, message: "That recovery workspace is not available." };
  }
  return null;
}

async function resolveWorkspace(workspaceId: string | undefined, role: "viewer" | "editor") {
  const db = getDb();
  if (workspaceId) {
    await assertAccess("recovery-workspace", workspaceId, role);
    const [row] = await db
      .select({ id: recoveryWorkspaces.id })
      .from(recoveryWorkspaces)
      .where(
        and(
          eq(recoveryWorkspaces.id, workspaceId),
          accessFilter(recoveryWorkspaces, recoveryWorkspaceShares),
        ),
      )
      .limit(1);
    if (!row) throw new RecoveryTestAccessError("That recovery workspace is not available.");
    return row;
  }
  const rows = await db
    .select({ id: recoveryWorkspaces.id, seedKey: recoveryWorkspaces.seedKey })
    .from(recoveryWorkspaces)
    .where(accessFilter(recoveryWorkspaces, recoveryWorkspaceShares))
    .orderBy(desc(recoveryWorkspaces.createdAt))
    .limit(20);
  const row = rows.find((item) => item.seedKey === NORTHSTAR_SEED) ?? rows[0];
  if (!row) {
    throw new RecoveryTestInputError("No recovery workspace yet. Import the sample team first.");
  }
  await assertAccess("recovery-workspace", row.id, role);
  return { id: row.id };
}

async function lockWorkspace(tx: Tx, workspaceId: string) {
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
  if (!locked) throw new RecoveryTestAccessError("That recovery workspace is not available.");
}

async function resourceInWorkspace(tx: Tx, workspaceId: string, idOrSlug: string) {
  const [row] = await tx
    .select({ id: recoveryResources.id })
    .from(recoveryResources)
    .where(
      and(
        eq(recoveryResources.workspaceId, workspaceId),
        or(eq(recoveryResources.id, idOrSlug), eq(recoveryResources.slug, idOrSlug)),
      ),
    )
    .limit(1);
  if (!row) throw new RecoveryTestInputError("That resource is not on this map.");
  return row.id;
}

function rejectSecrets(values: Array<string | null | undefined>) {
  if (values.some((value) => findSecretText(value))) {
    throw new RecoveryTestInputError(
      "That text looks like a credential. Describe the test without secrets.",
    );
  }
}

function requiredText(value: string, max: number, label: string) {
  const text = value.trim();
  if (!text || text.length > max) {
    throw new RecoveryTestInputError(`${label} must be 1–${max} characters.`);
  }
  return text;
}

function optionalText(value: string | null | undefined, max: number) {
  if (value == null) return null;
  const text = value.trim();
  if (!text) return null;
  if (text.length > max) throw new RecoveryTestInputError(`Keep that to ${max} characters.`);
  return text;
}

function parseDate(value: string | undefined) {
  if (value === undefined) return null;
  const text = value.trim();
  if (!text) return null;
  if (!DATE.test(text) || Number.isNaN(Date.parse(`${text}T00:00:00Z`))) {
    throw new RecoveryTestInputError("Use a date like 2026-11-04.");
  }
  // One day of leeway so "today" works in every time zone.
  const latest = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  if (text > latest) {
    throw new RecoveryTestInputError("A test date cannot be in the future.");
  }
  return text;
}
