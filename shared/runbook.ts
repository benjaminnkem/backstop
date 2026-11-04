import { z } from "zod";

import {
  capabilitySchema,
  capabilityModeSchema,
  confidenceSchema,
  criticalitySchema,
  requirementModeSchema,
  resourceKindSchema,
  type WorkspaceMap,
} from "./recovery.js";
import type { RemediationTask } from "./remediation.js";
import { latestTestByCapability, type RecoveryTest } from "./recovery-tests.js";
import {
  simulationStatusSchema,
  type SimulationRecord,
} from "./simulation-contract.js";

/** An emergency runbook assembled only from persisted records. */
export const runbookSchema = z.object({
  workspace: z.object({ id: z.string(), name: z.string(), fictional: z.boolean() }),
  generatedAt: z.string(),
  systems: z.array(
    z.object({
      resourceId: z.string(),
      name: z.string(),
      kind: resourceKindSchema,
      criticality: criticalitySchema,
      owner: z.string().nullable(),
      description: z.string().nullable(),
      capabilities: z.array(
        z.object({
          capability: capabilitySchema,
          mode: capabilityModeSchema,
          confidence: confidenceSchema,
          status: simulationStatusSchema.nullable(),
          routes: z.array(
            z.object({
              label: z.string(),
              requirementMode: requirementModeSchema,
              prerequisites: z.array(
                z.object({
                  name: z.string(),
                  capability: capabilitySchema,
                  confidence: confidenceSchema,
                }),
              ),
            }),
          ),
          note: z.string().nullable(),
          test: z
            .object({
              outcome: z.enum(["planned", "passed", "failed"]),
              testedOn: z.string().nullable(),
              method: z.string(),
              tester: z.string().nullable(),
            })
            .nullable(),
        }),
      ),
    }),
  ),
  gaps: z.array(z.object({ resourceId: z.string().nullable(), text: z.string() })),
  simulation: z
    .object({
      id: z.string(),
      name: z.string(),
      createdAt: z.string(),
      summary: z.object({
        available: z.number(),
        blocked: z.number(),
        at_risk: z.number(),
        unknown: z.number(),
      }),
      warnings: z.array(z.string()),
      assumedUnavailable: z.array(z.string()),
      blocked: z.array(z.string()),
    })
    .nullable(),
  tasks: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      priority: z.string(),
      status: z.string(),
      owner: z.string().nullable(),
      resource: z.string().nullable(),
      reason: z.string().nullable(),
    }),
  ),
  testing: z.string(),
  testHistory: z.array(
    z.object({
      id: z.string(),
      resource: z.string(),
      capability: capabilitySchema,
      route: z.string().nullable(),
      outcome: z.enum(["planned", "passed", "failed"]),
      testedOn: z.string().nullable(),
      method: z.string(),
      tester: z.string().nullable(),
      evidence: z.string().nullable(),
    }),
  ),
  disclaimer: z.string(),
  markdown: z.string(),
});

export type Runbook = z.infer<typeof runbookSchema>;

const CRITICALITY_RANK = { critical: 0, high: 1, medium: 2, low: 3 } as const;
const CAPABILITY_RANK = { access: 0, recovery: 1, administration: 2 } as const;
const CAPABILITY_TEXT = {
  access: "Access",
  recovery: "Recovery",
  administration: "Administration",
} as const;
const STATUS_TEXT = {
  available: "available in model",
  blocked: "blocked in model",
  at_risk: "at risk in model",
  unknown: "unknown",
} as const;

export const TESTING_NOT_RECORDED =
  "No recovery test results are recorded. Every route below is documented, not tested.";

export function buildRunbook(input: {
  map: WorkspaceMap;
  simulation: SimulationRecord | null;
  tasks: RemediationTask[];
  tests?: RecoveryTest[];
  now: Date;
}): Runbook {
  const { map, simulation, tasks, now } = input;
  const tests = input.tests ?? [];
  const latestTest = latestTestByCapability(tests);
  if (!map.workspace) throw new Error("A runbook needs a workspace.");
  const names = new Map(
    map.resources.map((item) => [
      item.id,
      item.status === "archived" ? `${item.name} (archived)` : item.name,
    ]),
  );
  const status = new Map(
    (simulation?.impacts ?? []).map((item) => [`${item.resourceId}/${item.capability}`, item.status]),
  );
  const linksByGroup = new Map<string, WorkspaceMap["links"]>();
  for (const link of map.links) {
    const list = linksByGroup.get(link.groupId) ?? [];
    list.push(link);
    linksByGroup.set(link.groupId, list);
  }
  const gaps: Runbook["gaps"] = [];
  const active = map.resources
    .filter((item) => item.status !== "archived")
    .sort(
      (a, b) =>
        CRITICALITY_RANK[a.criticality] - CRITICALITY_RANK[b.criticality] ||
        a.name.localeCompare(b.name),
    );

  const systems: Runbook["systems"] = active.map((resource) => {
    if (!resource.ownerLabel && (resource.criticality === "critical" || resource.criticality === "high")) {
      gaps.push({ resourceId: resource.id, text: `${resource.name} has no recorded owner.` });
    }
    const capabilities = map.capabilities
      .filter((item) => item.resourceId === resource.id)
      .sort((a, b) => CAPABILITY_RANK[a.capability] - CAPABILITY_RANK[b.capability])
      .map((capability) => {
        const groups = map.groups.filter(
          (group) => group.resourceId === resource.id && group.capability === capability.capability,
        );
        const routes = groups.map((group) => ({
          label: group.label,
          requirementMode: group.requirementMode,
          prerequisites: (linksByGroup.get(group.id) ?? []).map((link) => ({
            name: names.get(link.prerequisiteResourceId) ?? "Unrecorded resource",
            capability: link.prerequisiteCapability,
            confidence: link.confidence,
          })),
        }));
        const label = `${resource.name} ${CAPABILITY_TEXT[capability.capability].toLowerCase()}`;
        let note: string | null = null;
        if (capability.mode === "unknown") {
          note = "How this works is not recorded.";
          gaps.push({ resourceId: resource.id, text: `${label}: how it works is not recorded.` });
        } else if (capability.mode === "dependent" && routes.length === 0) {
          note = "Dependent, but no route is recorded.";
          gaps.push({ resourceId: resource.id, text: `${label}: no route is recorded.` });
        } else if (capability.mode === "dependent" && routes.length === 1) {
          const only = routes[0]!;
          if (!(only.requirementMode === "ANY" && only.prerequisites.length > 1)) {
            note = "Only one recorded route. No alternative is modelled.";
            gaps.push({ resourceId: resource.id, text: `${label}: only one recorded route.` });
          }
        }
        const unverified = routes.flatMap((route) => route.prerequisites).filter((item) => item.confidence !== "verified");
        if (capability.confidence !== "verified" || unverified.length > 0) {
          gaps.push({
            resourceId: resource.id,
            text: `${label}: ${capability.confidence !== "verified" ? `capability is ${capability.confidence}` : `${unverified.length} prerequisite${unverified.length === 1 ? " is" : "s are"} not verified`}.`,
          });
        }
        const test = latestTest.get(`${resource.id}/${capability.capability}`);
        return {
          capability: capability.capability,
          mode: capability.mode,
          confidence: capability.confidence,
          status: status.get(`${resource.id}/${capability.capability}`) ?? null,
          routes,
          note,
          test: test
            ? {
                outcome: test.outcome,
                testedOn: test.testedOn,
                method: test.method,
                tester: test.testerLabel,
              }
            : null,
        };
      });
    if (capabilities.length === 0) {
      gaps.push({ resourceId: resource.id, text: `${resource.name}: no capability is recorded.` });
    }
    return {
      resourceId: resource.id,
      name: resource.name,
      kind: resource.kind,
      criticality: resource.criticality,
      owner: resource.ownerLabel,
      description: resource.description,
      capabilities,
    };
  });

  const runbookSimulation: Runbook["simulation"] = simulation
    ? {
        id: simulation.id,
        name: simulation.name,
        createdAt: simulation.createdAt,
        summary: simulation.summary,
        warnings: simulation.warnings,
        assumedUnavailable: simulation.failed.map(
          (item) => `${item.name} ${CAPABILITY_TEXT[item.capability].toLowerCase()}`,
        ),
        blocked: simulation.impacts
          .filter((item) => item.status === "blocked")
          .map((item) => `${item.name} ${CAPABILITY_TEXT[item.capability].toLowerCase()}`),
      }
    : null;

  const openTasks: Runbook["tasks"] = tasks
    .filter((task) => task.status === "open" || task.status === "in_progress")
    .map((task) => ({
      id: task.id,
      title: task.title,
      priority: task.priority,
      status: task.status,
      owner: task.ownerLabel,
      resource: task.resourceName,
      reason: task.reason,
    }));

  const base = {
    workspace: {
      id: map.workspace.id,
      name: map.workspace.name,
      fictional: map.workspace.fictional,
    },
    generatedAt: now.toISOString(),
    systems,
    gaps,
    simulation: runbookSimulation,
    tasks: openTasks,
    testing: testingSummary(systems, tests),
    testHistory: [...tests]
      .sort((a, b) => (b.testedOn ?? b.createdAt).localeCompare(a.testedOn ?? a.createdAt))
      .map((test) => ({
        id: test.id,
        resource: test.resourceName,
        capability: test.capability,
        route: test.routeLabel,
        outcome: test.outcome,
        testedOn: test.testedOn,
        method: test.method,
        tester: test.testerLabel,
        evidence: test.evidenceNotes,
      })),
    disclaimer: map.disclaimer,
  };
  return { ...base, markdown: renderMarkdown(base) };
}

function testingSummary(systems: Runbook["systems"], tests: RecoveryTest[]): string {
  if (tests.length === 0) return TESTING_NOT_RECORDED;
  const capabilities = systems.flatMap((system) => system.capabilities);
  const latest = capabilities.map((capability) => capability.test?.outcome ?? null);
  const passed = latest.filter((item) => item === "passed").length;
  const failed = latest.filter((item) => item === "failed").length;
  const planned = latest.filter((item) => item === "planned").length;
  const untested = latest.filter((item) => item === null || item === "planned").length;
  return `Latest results: ${passed} passed, ${failed} failed, ${planned} planned. ${untested} of ${capabilities.length} capabilities are documented, not tested. Results were recorded by people; the model does not verify them.`;
}

function renderMarkdown(book: Omit<Runbook, "markdown">): string {
  const lines: string[] = [];
  lines.push(`# Emergency access runbook — ${book.workspace.name}`);
  lines.push("");
  lines.push(`**Confidential. Internal use only.** Generated ${book.generatedAt} from the recorded recovery map.`);
  if (book.workspace.fictional) lines.push("", "_Fictional sample team._");
  lines.push("", `> ${book.testing}`, "");

  lines.push("## Critical systems and ways in", "");
  for (const system of book.systems) {
    lines.push(`### ${system.name}`);
    lines.push(`${system.criticality} · owner: ${system.owner ?? "**not recorded**"}`);
    if (system.description) lines.push("", system.description);
    if (system.capabilities.length === 0) lines.push("", "- No capability is recorded.");
    for (const capability of system.capabilities) {
      const state = capability.status ? ` — ${STATUS_TEXT[capability.status]} in latest run` : "";
      lines.push("", `**${CAPABILITY_TEXT[capability.capability]}** (${capability.mode}, ${capability.confidence})${state}`);
      if (capability.mode === "independent") lines.push("- Independent: no prerequisite is recorded.");
      capability.routes.forEach((route, index) => {
        const needs = route.prerequisites
          .map((item) => `${item.name} ${item.capability} (${item.confidence})`)
          .join(route.requirementMode === "ALL" ? " and " : " or ");
        lines.push(`${index === 0 ? "-" : "- or"} ${route.label}: needs ${needs || "no prerequisite recorded"}`);
      });
      if (capability.note) lines.push(`- ⚠ ${capability.note}`);
      lines.push(
        capability.test
          ? `- Test: ${capability.test.outcome}${capability.test.testedOn ? ` on ${capability.test.testedOn}` : ""} — ${capability.test.method}${capability.test.tester ? ` (${capability.test.tester})` : ""}`
          : "- Test: documented, not tested",
      );
    }
    lines.push("");
  }

  lines.push("## Gaps in the record", "");
  if (book.gaps.length === 0) lines.push("No gaps found in the recorded map.");
  for (const gap of book.gaps) lines.push(`- ${gap.text}`);
  lines.push("");

  lines.push("## Latest simulation", "");
  if (!book.simulation) {
    lines.push("No simulation has been run.");
  } else {
    const s = book.simulation;
    lines.push(`**${s.name}** — ${s.createdAt}`);
    lines.push(`Assumed unavailable: ${s.assumedUnavailable.join(", ") || "none recorded"}.`);
    lines.push(`Per capability in the model: ${s.summary.blocked} blocked, ${s.summary.at_risk} at risk, ${s.summary.unknown} unknown, ${s.summary.available} available.`);
    if (s.blocked.length > 0) lines.push(`Blocked: ${s.blocked.join(", ")}.`);
    for (const warning of s.warnings) lines.push(`- ⚠ ${warning}`);
  }
  lines.push("");

  lines.push("## Open remediation tasks", "");
  if (book.tasks.length === 0) lines.push("No open tasks.");
  for (const task of book.tasks) {
    const meta = [task.priority, task.status.replace("_", " "), task.owner ? `owner: ${task.owner}` : null, task.resource]
      .filter(Boolean)
      .join(" · ");
    lines.push(`- ${task.title} (${meta})${task.reason ? ` — ${task.reason}` : ""}`);
  }
  lines.push("", "## Testing history", "", book.testing, "");
  for (const test of book.testHistory) {
    lines.push(
      `- ${test.testedOn ?? "not yet"} · ${test.outcome} · ${test.resource} ${test.capability}${test.route ? ` (${test.route})` : ""} — ${test.method}${test.tester ? ` · ${test.tester}` : ""}${test.evidence ? ` · ${test.evidence}` : ""}`,
    );
  }
  lines.push("", "---", "", book.disclaimer);
  lines.push("A simulation does not prove a real account can be recovered. This runbook contains no credentials.");
  return `${lines.join("\n")}\n`;
}
