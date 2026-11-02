import { accessFilter, assertAccess } from "@agent-native/core/sharing";
import { and, desc, eq } from "drizzle-orm";

import type { Capability } from "../../shared/recovery.js";
import { simulationRecordSchema } from "../../shared/simulation-contract.js";
import type { SimulationRecord } from "../../shared/simulation-contract.js";
import { simulate } from "../../shared/simulate.js";
import { getDb } from "../db/index.js";
import {
  recoveryCapabilities,
  recoveryDependencyGroups,
  recoveryDependencyLinks,
  recoveryResources,
  recoverySimulationImpacts,
  recoverySimulationRuns,
  recoveryWorkspaceShares,
  recoveryWorkspaces,
} from "../db/schema.js";

export interface Actor {
  userEmail: string;
  orgId: string | null;
}

export interface SimulationRequest {
  workspaceId?: string | undefined;
  name: string;
  failed: Array<{ resourceId: string; capability: Capability }>;
}

interface ResourceRow {
  id: string;
  slug: string;
  name: string;
}

export async function runWorkspaceSimulation(
  actor: Actor,
  request: SimulationRequest,
): Promise<SimulationRecord> {
  const workspace = await resolveWorkspace(request.workspaceId);
  if (!workspace) {
    throw new SimulationAccessError("That recovery workspace is not available.");
  }
  await assertAccess("recovery-workspace", workspace.id, "editor");
  const graph = await loadGraph(workspace.id);
  const seeds = resolveSeeds(graph.resources, graph.capabilities, request.failed);
  const output = simulate(
    {
      capabilities: graph.capabilities,
      groups: graph.groups,
      links: graph.links,
    },
    seeds.map((seed) => ({
      resourceId: seed.resourceId,
      capability: seed.capability,
    })),
    { label: (resourceId) => graph.names.get(resourceId) ?? resourceId },
  );
  const now = new Date().toISOString();
  const simulationId = crypto.randomUUID();
  const names = graph.names;
  const slugs = graph.slugs;
  const failed = seeds.map((seed) => ({
    resourceId: seed.resourceId,
    slug: slugs.get(seed.resourceId) ?? seed.resourceId,
    name: names.get(seed.resourceId) ?? seed.resourceId,
    capability: seed.capability,
  }));
  const impacts = output.impacts.map((impact) => ({
    resourceId: impact.resourceId,
    slug: slugs.get(impact.resourceId) ?? impact.resourceId,
    name: names.get(impact.resourceId) ?? impact.resourceId,
    capability: impact.capability,
    status: impact.status,
    confidence: impact.confidence,
    explanation: impact.explanation,
    causalPath: impact.causalPath.map((node) => ({
      resourceId: node.resourceId,
      slug: slugs.get(node.resourceId) ?? node.resourceId,
      name: names.get(node.resourceId) ?? node.resourceId,
      capability: node.capability,
    })),
  }));
  const record = simulationRecordSchema.parse({
    id: simulationId,
    workspaceId: workspace.id,
    name: request.name,
    createdAt: now,
    summary: output.summary,
    warnings: output.warnings,
    failed,
    impacts,
  });

  const db = getDb();
  await db.transaction(async (tx) => {
    const [locked] = await tx
      .select({ id: recoveryWorkspaces.id })
      .from(recoveryWorkspaces)
      .where(
        and(
          eq(recoveryWorkspaces.id, workspace.id),
          accessFilter(recoveryWorkspaces, recoveryWorkspaceShares),
        ),
      )
      .for("update")
      .limit(1);
    if (!locked) {
      throw new SimulationAccessError("That recovery workspace is not available.");
    }
    await tx.insert(recoverySimulationRuns).values({
      id: record.id,
      workspaceId: workspace.id,
      name: record.name,
      status: "completed",
      inputJson: JSON.stringify({ failed: record.failed }),
      graphSnapshotJson: JSON.stringify({
        resources: graph.resources,
        capabilities: graph.capabilities,
        groups: graph.groups,
        links: graph.links,
      }),
      summaryJson: JSON.stringify({
        summary: record.summary,
        warnings: record.warnings,
      }),
      createdBy: actor.userEmail,
      ownerEmail: actor.userEmail,
      orgId: actor.orgId,
      createdAt: now,
    });
    if (record.impacts.length > 0) {
      await tx.insert(recoverySimulationImpacts).values(
        record.impacts.map((impact) => ({
          id: crypto.randomUUID(),
          workspaceId: workspace.id,
          simulationId: record.id,
          resourceId: impact.resourceId,
          capability: impact.capability,
          status: impact.status,
          explanation: impact.explanation,
          causalPathJson: JSON.stringify(impact.causalPath),
          confidence: impact.confidence,
          ownerEmail: actor.userEmail,
          orgId: actor.orgId,
          createdAt: now,
        })),
      );
    }
  });
  return record;
}

export async function readSimulation(input: {
  workspaceId?: string | undefined;
  simulationId?: string | undefined;
}): Promise<SimulationRecord | null> {
  const db = getDb();
  if (input.simulationId) {
    const [run] = await db
      .select()
      .from(recoverySimulationRuns)
      .where(eq(recoverySimulationRuns.id, input.simulationId))
      .limit(1);
    if (!run) return null;
    await assertAccess("recovery-workspace", run.workspaceId, "viewer");
    return hydrate(run);
  }
  const workspace = await resolveWorkspace(input.workspaceId);
  if (!workspace) return null;
  const [run] = await db
    .select()
    .from(recoverySimulationRuns)
    .where(eq(recoverySimulationRuns.workspaceId, workspace.id))
    .orderBy(desc(recoverySimulationRuns.createdAt))
    .limit(1);
  if (!run) return null;
  return hydrate(run);
}

export class SimulationAccessError extends Error {}

export class SimulationInputError extends Error {}

async function resolveWorkspace(workspaceId?: string) {
  const db = getDb();
  if (workspaceId) {
    await assertAccess("recovery-workspace", workspaceId, "viewer");
    const [row] = await db
      .select({
        id: recoveryWorkspaces.id,
        name: recoveryWorkspaces.name,
      })
      .from(recoveryWorkspaces)
      .where(
        and(
          eq(recoveryWorkspaces.id, workspaceId),
          accessFilter(recoveryWorkspaces, recoveryWorkspaceShares),
        ),
      )
      .limit(1);
    return row ?? null;
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
  return rows.find((row) => row.seedKey === "northstar") ?? rows[0] ?? null;
}

async function loadGraph(workspaceId: string) {
  const db = getDb();
  const [resources, capabilities, groups, links] = await Promise.all([
    db
      .select({
        id: recoveryResources.id,
        slug: recoveryResources.slug,
        name: recoveryResources.name,
      })
      .from(recoveryResources)
      .where(eq(recoveryResources.workspaceId, workspaceId))
      .limit(500),
    db
      .select({
        resourceId: recoveryCapabilities.resourceId,
        capability: recoveryCapabilities.capability,
        mode: recoveryCapabilities.mode,
        confidence: recoveryCapabilities.confidence,
      })
      .from(recoveryCapabilities)
      .where(eq(recoveryCapabilities.workspaceId, workspaceId))
      .limit(500),
    db
      .select({
        id: recoveryDependencyGroups.id,
        resourceId: recoveryDependencyGroups.resourceId,
        capability: recoveryDependencyGroups.capability,
        requirementMode: recoveryDependencyGroups.requirementMode,
        label: recoveryDependencyGroups.label,
      })
      .from(recoveryDependencyGroups)
      .where(eq(recoveryDependencyGroups.workspaceId, workspaceId))
      .limit(500),
    db
      .select({
        id: recoveryDependencyLinks.id,
        groupId: recoveryDependencyLinks.groupId,
        prerequisiteResourceId: recoveryDependencyLinks.prerequisiteResourceId,
        prerequisiteCapability: recoveryDependencyLinks.prerequisiteCapability,
        confidence: recoveryDependencyLinks.confidence,
      })
      .from(recoveryDependencyLinks)
      .where(eq(recoveryDependencyLinks.workspaceId, workspaceId))
      .limit(1000),
  ]);
  return {
    resources,
    names: new Map(resources.map((resource) => [resource.id, resource.name])),
    slugs: new Map(resources.map((resource) => [resource.id, resource.slug])),
    capabilities: capabilities.map((capability) => ({
      resourceId: capability.resourceId,
      capability: capability.capability as Capability,
      mode: capability.mode as "independent" | "dependent" | "unknown",
      confidence: capability.confidence as "verified" | "assumed" | "unknown",
    })),
    groups: groups.map((group) => ({
      id: group.id,
      resourceId: group.resourceId,
      capability: group.capability as Capability,
      requirementMode: group.requirementMode as "ALL" | "ANY",
      label: group.label,
    })),
    links: links.map((link) => ({
      id: link.id,
      groupId: link.groupId,
      prerequisiteResourceId: link.prerequisiteResourceId,
      prerequisiteCapability: link.prerequisiteCapability as Capability,
      confidence: link.confidence as "verified" | "assumed" | "unknown",
    })),
  };
}

function resolveSeeds(
  resources: ResourceRow[],
  capabilities: Array<{ resourceId: string; capability: Capability }>,
  failed: SimulationRequest["failed"],
) {
  const modelled = new Set(
    capabilities.map((capability) => `${capability.resourceId}/${capability.capability}`),
  );
  const seen = new Set<string>();
  const seeds: Array<{ resourceId: string; capability: Capability }> = [];
  for (const seed of failed) {
    const resource = resources.find(
      (item) => item.id === seed.resourceId || item.slug === seed.resourceId,
    );
    if (!resource) {
      throw new SimulationInputError(`Unknown resource "${seed.resourceId}".`);
    }
    const key = `${resource.id}/${seed.capability}`;
    if (!modelled.has(key)) {
      throw new SimulationInputError(
        `${resource.name} has no ${seed.capability} capability in the model.`,
      );
    }
    if (seen.has(key)) continue;
    seen.add(key);
    seeds.push({ resourceId: resource.id, capability: seed.capability });
  }
  if (seeds.length === 0) {
    throw new SimulationInputError("Choose at least one failed capability.");
  }
  return seeds;
}

async function hydrate(
  run: typeof recoverySimulationRuns.$inferSelect,
): Promise<SimulationRecord> {
  const db = getDb();
  const [impacts, resources] = await Promise.all([
    db
      .select()
      .from(recoverySimulationImpacts)
      .where(eq(recoverySimulationImpacts.simulationId, run.id))
      .limit(500),
    db
      .select({
        id: recoveryResources.id,
        slug: recoveryResources.slug,
        name: recoveryResources.name,
      })
      .from(recoveryResources)
      .where(eq(recoveryResources.workspaceId, run.workspaceId))
      .limit(500),
  ]);
  const names = new Map(resources.map((resource) => [resource.id, resource]));
  const summary = JSON.parse(run.summaryJson) as {
    summary: SimulationRecord["summary"];
    warnings: string[];
  };
  const input = JSON.parse(run.inputJson) as {
    failed: SimulationRecord["failed"];
  };
  return simulationRecordSchema.parse({
    id: run.id,
    workspaceId: run.workspaceId,
    name: run.name,
    createdAt: run.createdAt,
    summary: summary.summary,
    warnings: summary.warnings,
    failed: input.failed.map((seed) => ({
      ...seed,
      name: names.get(seed.resourceId)?.name ?? seed.name,
      slug: names.get(seed.resourceId)?.slug ?? seed.slug,
    })),
    impacts: impacts.map((impact) => {
      const resource = names.get(impact.resourceId);
      const causalPath = JSON.parse(impact.causalPathJson) as SimulationRecord["impacts"][number]["causalPath"];
      return {
        resourceId: impact.resourceId,
        slug: resource?.slug ?? impact.resourceId,
        name: resource?.name ?? impact.resourceId,
        capability: impact.capability,
        status: impact.status,
        confidence: impact.confidence,
        explanation: impact.explanation,
        causalPath: causalPath.map((node) => ({
          ...node,
          name: names.get(node.resourceId)?.name ?? node.name,
          slug: names.get(node.resourceId)?.slug ?? node.slug,
        })),
      };
    }),
  });
}
