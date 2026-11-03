import { accessFilter, assertAccess, ForbiddenError } from "@agent-native/core/sharing";
import { and, desc, eq } from "drizzle-orm";

import type { TaskPriority, TaskStatus } from "../../shared/remediation.js";
import { remediationTaskSchema } from "../../shared/remediation.js";
import { getDb } from "../db/index.js";
import {
  recoveryRemediationTasks,
  recoveryResources,
  recoverySimulationRuns,
  recoveryWorkspaceShares,
  recoveryWorkspaces,
} from "../db/schema.js";
import { findSecretText } from "./secrets.js";
import type { Actor } from "./workspace-map.js";

const NORTHSTAR_SEED = "northstar";

export class RemediationInputError extends Error {}
export class RemediationAccessError extends Error {}

export interface CreateTaskInput {
  workspaceId?: string | undefined;
  title: string;
  description?: string | undefined;
  reason?: string | undefined;
  priority: TaskPriority;
  resourceId?: string | undefined;
  simulationId?: string | undefined;
  ownerLabel?: string | undefined;
}

export interface UpdateTaskInput {
  taskId: string;
  title?: string | undefined;
  description?: string | undefined;
  reason?: string | undefined;
  priority?: TaskPriority | undefined;
  status?: TaskStatus | undefined;
  ownerLabel?: string | undefined;
}

export async function listRemediationTasks(input: {
  workspaceId?: string | undefined;
  status?: TaskStatus | undefined;
}) {
  const workspace = await resolveWorkspace(input.workspaceId, "viewer");
  const db = getDb();
  const rows = await db
    .select({
      id: recoveryRemediationTasks.id,
      workspaceId: recoveryRemediationTasks.workspaceId,
      title: recoveryRemediationTasks.title,
      description: recoveryRemediationTasks.description,
      reason: recoveryRemediationTasks.reason,
      priority: recoveryRemediationTasks.priority,
      status: recoveryRemediationTasks.status,
      ownerLabel: recoveryRemediationTasks.ownerLabel,
      resourceId: recoveryRemediationTasks.resourceId,
      resourceName: recoveryResources.name,
      simulationId: recoveryRemediationTasks.simulationId,
      simulationName: recoverySimulationRuns.name,
      createdAt: recoveryRemediationTasks.createdAt,
      updatedAt: recoveryRemediationTasks.updatedAt,
    })
    .from(recoveryRemediationTasks)
    .leftJoin(
      recoveryResources,
      eq(recoveryResources.id, recoveryRemediationTasks.resourceId),
    )
    .leftJoin(
      recoverySimulationRuns,
      eq(recoverySimulationRuns.id, recoveryRemediationTasks.simulationId),
    )
    .where(
      and(
        eq(recoveryRemediationTasks.workspaceId, workspace.id),
        input.status
          ? eq(recoveryRemediationTasks.status, input.status)
          : undefined,
      ),
    )
    .orderBy(desc(recoveryRemediationTasks.createdAt))
    .limit(100);
  return {
    workspaceId: workspace.id,
    tasks: rows.map((row) => remediationTaskSchema.parse(row)),
  };
}

export async function createRemediationTask(actor: Actor, input: CreateTaskInput) {
  rejectSecrets([
    input.title,
    input.description,
    input.reason,
    input.ownerLabel,
  ]);
  const title = requiredText(input.title, 160, "Title");
  const description = optionalText(input.description, 1000);
  const reason = optionalText(input.reason, 500);
  const ownerLabel = optionalText(input.ownerLabel, 80);
  const workspace = await resolveWorkspace(input.workspaceId, "editor");
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  const db = getDb();
  await db.transaction(async (tx) => {
    await lockWorkspace(tx, workspace.id);
    const resourceId = input.resourceId
      ? await resourceInWorkspace(tx, workspace.id, input.resourceId)
      : null;
    const simulationId = input.simulationId
      ? await simulationInWorkspace(tx, workspace.id, input.simulationId)
      : null;
    await tx.insert(recoveryRemediationTasks).values({
      id,
      workspaceId: workspace.id,
      resourceId,
      simulationId,
      title,
      description,
      reason,
      priority: input.priority,
      status: "open",
      ownerLabel,
      createdBy: actor.userEmail,
      ownerEmail: actor.userEmail,
      orgId: actor.orgId,
      createdAt: now,
      updatedAt: now,
    });
    const [saved] = await tx
      .select({ id: recoveryRemediationTasks.id })
      .from(recoveryRemediationTasks)
      .where(eq(recoveryRemediationTasks.id, id))
      .limit(1);
    if (!saved) throw new Error("The task insert did not return a row.");
  });
  return {
    id,
    workspaceId: workspace.id,
    title,
    status: "open" as const,
    priority: input.priority,
  };
}

export async function updateRemediationTask(input: UpdateTaskInput) {
  rejectSecrets([
    input.title,
    input.description,
    input.reason,
    input.ownerLabel,
  ]);
  const patch = {
    ...(input.title !== undefined
      ? { title: requiredText(input.title, 160, "Title") }
      : {}),
    ...(input.description !== undefined
      ? { description: optionalText(input.description, 1000) }
      : {}),
    ...(input.reason !== undefined
      ? { reason: optionalText(input.reason, 500) }
      : {}),
    ...(input.ownerLabel !== undefined
      ? { ownerLabel: optionalText(input.ownerLabel, 80) }
      : {}),
    ...(input.priority !== undefined ? { priority: input.priority } : {}),
    ...(input.status !== undefined ? { status: input.status } : {}),
  };
  if (Object.keys(patch).length === 0) {
    throw new RemediationInputError("Choose a task field to change.");
  }
  const db = getDb();
  const now = new Date().toISOString();
  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select({
        id: recoveryRemediationTasks.id,
        workspaceId: recoveryRemediationTasks.workspaceId,
      })
      .from(recoveryRemediationTasks)
      .where(eq(recoveryRemediationTasks.id, input.taskId))
      .limit(1);
    if (!existing) {
      throw new RemediationAccessError("That remediation task is not available.");
    }
    await assertAccess("recovery-workspace", existing.workspaceId, "editor");
    await lockWorkspace(tx, existing.workspaceId);
    await tx
      .update(recoveryRemediationTasks)
      .set({ ...patch, updatedAt: now })
      .where(eq(recoveryRemediationTasks.id, existing.id));
    const [row] = await tx
      .select({
        id: recoveryRemediationTasks.id,
        workspaceId: recoveryRemediationTasks.workspaceId,
        title: recoveryRemediationTasks.title,
        status: recoveryRemediationTasks.status,
        priority: recoveryRemediationTasks.priority,
      })
      .from(recoveryRemediationTasks)
      .where(eq(recoveryRemediationTasks.id, existing.id))
      .limit(1);
    if (!row) throw new Error("The task update did not return a row.");
    return {
      id: row.id,
      workspaceId: row.workspaceId,
      title: row.title,
      status: row.status as TaskStatus,
      priority: row.priority as TaskPriority,
    };
  });
}

export function remediationFailure(error: unknown): {
  code: "VALIDATION_ERROR" | "FORBIDDEN";
  statusCode: 400 | 403;
  message: string;
} | null {
  if (error instanceof RemediationInputError) {
    return { code: "VALIDATION_ERROR", statusCode: 400, message: error.message };
  }
  if (error instanceof RemediationAccessError || error instanceof ForbiddenError) {
    return {
      code: "FORBIDDEN",
      statusCode: 403,
      message: "That recovery workspace is not available.",
    };
  }
  return null;
}

async function resolveWorkspace(
  workspaceId: string | undefined,
  role: "viewer" | "editor",
) {
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
    if (!row) {
      throw new RemediationAccessError("That recovery workspace is not available.");
    }
    return row;
  }
  const rows = await db
    .select({
      id: recoveryWorkspaces.id,
      seedKey: recoveryWorkspaces.seedKey,
    })
    .from(recoveryWorkspaces)
    .where(accessFilter(recoveryWorkspaces, recoveryWorkspaceShares))
    .orderBy(desc(recoveryWorkspaces.createdAt))
    .limit(20);
  const row = rows.find((item) => item.seedKey === NORTHSTAR_SEED) ?? rows[0];
  if (!row) {
    throw new RemediationInputError(
      "No recovery workspace yet. Import the sample team first.",
    );
  }
  await assertAccess("recovery-workspace", row.id, role);
  return { id: row.id };
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
    throw new RemediationAccessError("That recovery workspace is not available.");
  }
}

async function resourceInWorkspace(
  tx: Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0],
  workspaceId: string,
  idOrSlug: string,
) {
  const [byId] = await tx
    .select({ id: recoveryResources.id })
    .from(recoveryResources)
    .where(
      and(
        eq(recoveryResources.workspaceId, workspaceId),
        eq(recoveryResources.id, idOrSlug),
      ),
    )
    .limit(1);
  if (byId) return byId.id;
  const [bySlug] = await tx
    .select({ id: recoveryResources.id })
    .from(recoveryResources)
    .where(
      and(
        eq(recoveryResources.workspaceId, workspaceId),
        eq(recoveryResources.slug, idOrSlug),
      ),
    )
    .limit(1);
  if (!bySlug) {
    throw new RemediationInputError("That resource is not on this map.");
  }
  return bySlug.id;
}

async function simulationInWorkspace(
  tx: Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0],
  workspaceId: string,
  simulationId: string,
) {
  const [row] = await tx
    .select({ id: recoverySimulationRuns.id })
    .from(recoverySimulationRuns)
    .where(
      and(
        eq(recoverySimulationRuns.workspaceId, workspaceId),
        eq(recoverySimulationRuns.id, simulationId),
      ),
    )
    .limit(1);
  if (!row) {
    throw new RemediationInputError("That simulation is not on this map.");
  }
  return row.id;
}

function rejectSecrets(values: Array<string | null | undefined>) {
  if (values.some((value) => findSecretText(value))) {
    throw new RemediationInputError(
      "That text looks like a credential. Keep secrets out of remediation tasks.",
    );
  }
}

function requiredText(value: string, max: number, label: string): string {
  const text = value.trim();
  if (!text || text.length > max) {
    throw new RemediationInputError(`${label} must be 1–${max} characters.`);
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
    throw new RemediationInputError(`Keep that note to ${max} characters.`);
  }
  return text;
}
