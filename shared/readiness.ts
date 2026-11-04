import type { Capability, WorkspaceMap } from "./recovery.js";
import type { RecoveryTest } from "./recovery-tests.js";
import type { SimulationRecord } from "./simulation-contract.js";

type Status = SimulationRecord["impacts"][number]["status"];

const CAPABILITY_WORD: Record<Capability, string> = {
  access: "access",
  recovery: "recovery",
  administration: "administration",
};
const CRITICALITY_RANK = { critical: 0, high: 1, medium: 2, low: 3 } as const;
const STATUS_RANK: Record<Status, number> = { blocked: 0, at_risk: 1, unknown: 2, available: 3 };

const keyOf = (resourceId: string, capability: Capability) => `${resourceId}/${capability}`;

/** How many independent ways a dependent capability can be met. */
export function waysIn(
  groups: Array<{ requirementMode: "ALL" | "ANY"; linkCount: number }>,
): number {
  return groups.reduce(
    (total, group) => total + (group.requirementMode === "ANY" ? Math.max(1, group.linkCount) : 1),
    0,
  );
}

export interface LedgerRow {
  resourceId: string;
  name: string;
  criticality: WorkspaceMap["resources"][number]["criticality"];
  /** null when access is independent or not recorded. */
  accessWays: number | null;
  accessMode: "independent" | "dependent" | "unknown" | "missing";
  through: string[];
  recoveryWays: number | null;
  recoveryMode: "independent" | "dependent" | "unknown" | "missing";
  worst: { status: Status; capability: Capability } | null;
  /** Most recent person-recorded result on any of this system's capabilities. */
  tested: { outcome: "passed" | "failed"; testedOn: string | null } | null;
}

/** One row per active resource: how many ways in, through what, and the last result. */
export function buildLedger(
  map: WorkspaceMap,
  simulation: SimulationRecord | null,
  tests: RecoveryTest[] = [],
): LedgerRow[] {
  const names = new Map(map.resources.map((item) => [item.id, item.name]));
  const links = new Map<string, WorkspaceMap["links"]>();
  for (const link of map.links) {
    const list = links.get(link.groupId) ?? [];
    list.push(link);
    links.set(link.groupId, list);
  }
  const impacts = simulation?.impacts ?? [];
  const describe = (resourceId: string, capability: Capability) => {
    const record = map.capabilities.find(
      (item) => item.resourceId === resourceId && item.capability === capability,
    );
    if (!record) return { mode: "missing" as const, ways: null, through: [] as string[] };
    if (record.mode !== "dependent") return { mode: record.mode, ways: null, through: [] };
    const groups = map.groups.filter(
      (group) => group.resourceId === resourceId && group.capability === capability,
    );
    const through = new Set<string>();
    for (const group of groups) {
      for (const link of links.get(group.id) ?? []) {
        through.add(names.get(link.prerequisiteResourceId) ?? "Unrecorded resource");
      }
    }
    return {
      mode: "dependent" as const,
      ways: waysIn(
        groups.map((group) => ({
          requirementMode: group.requirementMode,
          linkCount: (links.get(group.id) ?? []).length,
        })),
      ),
      through: [...through],
    };
  };

  return map.resources
    .filter((item) => item.status !== "archived")
    .map((resource) => {
      const access = describe(resource.id, "access");
      const recovery = describe(resource.id, "recovery");
      const own = impacts
        .filter((item) => item.resourceId === resource.id)
        .sort((a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status]);
      return {
        resourceId: resource.id,
        name: resource.name,
        criticality: resource.criticality,
        accessWays: access.ways,
        accessMode: access.mode,
        through: access.through,
        recoveryWays: recovery.ways,
        recoveryMode: recovery.mode,
        worst: own[0] ? { status: own[0].status, capability: own[0].capability } : null,
        tested: latestResult(tests, resource.id),
      };
    })
    .sort(
      (a, b) =>
        CRITICALITY_RANK[a.criticality] - CRITICALITY_RANK[b.criticality] ||
        // Dependent systems first: they are the ones a failure can reach.
        Number(a.accessMode !== "dependent") - Number(b.accessMode !== "dependent") ||
        a.name.localeCompare(b.name),
    );
}

function latestResult(tests: RecoveryTest[], resourceId: string): LedgerRow["tested"] {
  const results = tests
    .filter((test) => test.resourceId === resourceId && test.outcome !== "planned")
    .sort((a, b) => (b.testedOn ?? b.createdAt).localeCompare(a.testedOn ?? a.createdAt));
  const first = results[0];
  if (!first || first.outcome === "planned") return null;
  return { outcome: first.outcome, testedOn: first.testedOn };
}

/** Plain sentences that restate a saved run. No inference beyond the stored result. */
export function describeRun(
  map: WorkspaceMap,
  simulation: SimulationRecord,
): string[] {
  const failed = new Set(simulation.failed.map((item) => keyOf(item.resourceId, item.capability)));
  const label = (item: { name: string; capability: Capability }) =>
    `${item.name} ${CAPABILITY_WORD[item.capability]}`;
  const sentences: string[] = [];

  const failedText = joinList(simulation.failed.map(label));
  const total = simulation.impacts.filter(
    (item) => !failed.has(keyOf(item.resourceId, item.capability)),
  ).length;
  const blocked = simulation.impacts.filter(
    (item) => item.status === "blocked" && !failed.has(keyOf(item.resourceId, item.capability)),
  );
  if (blocked.length === 0) {
    sentences.push(
      `With ${failedText} unavailable, nothing else in the model is blocked.`,
    );
  } else {
    const shown = blocked.slice(0, 3).map(label);
    const more = blocked.length - shown.length;
    sentences.push(
      `With ${failedText} unavailable, ${blocked.length} of ${total} other capabilities ${blocked.length === 1 ? "is" : "are"} blocked: ${joinList(more > 0 ? [...shown, `${more} more`] : shown)}.`,
    );
  }

  // A capability survives when one of its routes needed the failed item, yet it stays available.
  const groupsTouchingFailure = new Set(
    map.links
      .filter((link) => failed.has(keyOf(link.prerequisiteResourceId, link.prerequisiteCapability)))
      .map((link) => link.groupId),
  );
  const exposed = new Set(
    map.groups
      .filter((group) => groupsTouchingFailure.has(group.id))
      .map((group) => keyOf(group.resourceId, group.capability)),
  );
  const survivors = simulation.impacts.filter(
    (item) => item.status === "available" && exposed.has(keyOf(item.resourceId, item.capability)),
  );
  if (survivors.length > 0) {
    sentences.push(
      `${capitalise(joinList(survivors.map(label)))} ${survivors.length === 1 ? "stays" : "stay"} available through another recorded route.`,
    );
  }

  const unknown = simulation.impacts.filter((item) => item.status === "unknown");
  if (unknown.length > 0) {
    sentences.push(
      `${unknown.length} ${unknown.length === 1 ? "capability stays" : "capabilities stay"} unknown.`,
    );
  }
  const loops = simulation.warnings.filter((warning) => /loop/i.test(warning)).length;
  if (loops > 0) {
    sentences.push(
      `${loops === 1 ? "One potential recovery loop is" : `${loops} potential recovery loops are`} flagged. A loop is not proof of lockout.`,
    );
  }
  return sentences;
}

function joinList(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
