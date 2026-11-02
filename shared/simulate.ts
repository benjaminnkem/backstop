import type {
  Capability,
  CapabilityMode,
  Confidence,
  RequirementMode,
} from "./recovery.js";

export type SimulationStatus = "available" | "blocked" | "at_risk" | "unknown";

export interface SimulationCapability {
  resourceId: string;
  capability: Capability;
  mode: CapabilityMode;
  confidence: Confidence;
}

export interface SimulationGroup {
  id: string;
  resourceId: string;
  capability: Capability;
  requirementMode: RequirementMode;
  label: string;
}

export interface SimulationLink {
  id: string;
  groupId: string;
  prerequisiteResourceId: string;
  prerequisiteCapability: Capability;
  confidence: Confidence;
}

export interface SimulationGraph {
  capabilities: SimulationCapability[];
  groups: SimulationGroup[];
  links: SimulationLink[];
}

export interface FailureSeed {
  resourceId: string;
  capability: Capability;
}

export interface CausalNode {
  resourceId: string;
  capability: Capability;
}

export interface SimulationImpact {
  resourceId: string;
  capability: Capability;
  status: SimulationStatus;
  confidence: Confidence;
  explanation: string;
  reasons: string[];
  causalPath: CausalNode[];
}

export interface SimulationOutput {
  impacts: SimulationImpact[];
  warnings: string[];
  summary: Record<SimulationStatus, number>;
}

export interface SimulateOptions {
  label?: (resourceId: string) => string;
}

const STATUSES: SimulationStatus[] = [
  "available",
  "blocked",
  "at_risk",
  "unknown",
];

function nodeKey(resourceId: string, capability: Capability): string {
  return `${resourceId}/${capability}`;
}

function combineAll(states: SimulationStatus[]): SimulationStatus {
  if (states.length === 0) return "unknown";
  if (states.includes("blocked")) return "blocked";
  if (states.includes("unknown")) return "unknown";
  if (states.includes("at_risk")) return "at_risk";
  return "available";
}

function combineAny(states: SimulationStatus[]): SimulationStatus {
  if (states.length === 0) return "unknown";
  if (states.includes("available")) return "available";
  if (states.includes("at_risk")) return "at_risk";
  if (states.includes("unknown")) return "unknown";
  return "blocked";
}

function withConfidence(
  state: SimulationStatus,
  confidence: Confidence,
): SimulationStatus {
  if (confidence === "verified") return state;
  if (confidence === "unknown") return "unknown";
  return "at_risk";
}

function byId<T extends { id: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * Evaluate a recovery graph. The same graph and failure seeds always return
 * the same statuses, explanations, and paths. A cycle is reported; it is not
 * treated as a lockout.
 */
export function simulate(
  graph: SimulationGraph,
  failed: FailureSeed[],
  options: SimulateOptions = {},
): SimulationOutput {
  const label = options.label ?? ((resourceId: string) => resourceId);
  const capabilities = [...graph.capabilities].sort((a, b) =>
    nodeKey(a.resourceId, a.capability).localeCompare(
      nodeKey(b.resourceId, b.capability),
    ),
  );
  const failedKeys = new Set(
    failed.map((seed) => nodeKey(seed.resourceId, seed.capability)),
  );
  const groupsByTarget = new Map<string, SimulationGroup[]>();
  for (const group of byId(graph.groups)) {
    const key = nodeKey(group.resourceId, group.capability);
    groupsByTarget.set(key, [...(groupsByTarget.get(key) ?? []), group]);
  }
  const linksByGroup = new Map<string, SimulationLink[]>();
  for (const link of byId(graph.links)) {
    linksByGroup.set(link.groupId, [
      ...(linksByGroup.get(link.groupId) ?? []),
      link,
    ]);
  }
  const capabilityByKey = new Map(
    capabilities.map((capability) => [
      nodeKey(capability.resourceId, capability.capability),
      capability,
    ]),
  );

  const current = new Map<string, SimulationStatus>();
  for (const capability of capabilities) {
    const key = nodeKey(capability.resourceId, capability.capability);
    current.set(key, initialStatus(capability, failedKeys.has(key)));
  }

  const bound = capabilities.length * 4 + 8;
  let converged = false;
  for (let iteration = 0; iteration < bound; iteration += 1) {
    const next = new Map(current);
    for (const capability of capabilities) {
      const key = nodeKey(capability.resourceId, capability.capability);
      if (failedKeys.has(key) || capability.mode !== "dependent") continue;
      next.set(key, dependentStatus(capability, current, groupsByTarget, linksByGroup));
    }
    const stable = capabilities.every(
      (capability) =>
        next.get(nodeKey(capability.resourceId, capability.capability)) ===
        current.get(nodeKey(capability.resourceId, capability.capability)),
    );
    current.clear();
    for (const [key, status] of next) current.set(key, status);
    if (stable) {
      converged = true;
      break;
    }
  }

  const impacts = capabilities.map((capability) =>
    explainImpact(
      capability,
      current,
      failedKeys,
      groupsByTarget,
      linksByGroup,
      capabilityByKey,
      label,
    ),
  );
  const summary: Record<SimulationStatus, number> = {
    available: 0,
    blocked: 0,
    at_risk: 0,
    unknown: 0,
  };
  for (const impact of impacts) summary[impact.status] += 1;
  const warnings = findCycles(graph, label);
  if (!converged) {
    warnings.push(
      "Evaluation did not settle. Inspect the graph before treating any status as final. A cycle is not proof of lockout.",
    );
  }
  return { impacts, warnings, summary };
}

function initialStatus(
  capability: SimulationCapability,
  failed: boolean,
): SimulationStatus {
  if (failed) return "blocked";
  if (capability.mode !== "independent") return "unknown";
  if (capability.confidence === "verified") return "available";
  if (capability.confidence === "assumed") return "at_risk";
  return "unknown";
}

function linkState(
  link: SimulationLink,
  current: Map<string, SimulationStatus>,
): SimulationStatus {
  return withConfidence(
    current.get(
      nodeKey(link.prerequisiteResourceId, link.prerequisiteCapability),
    ) ?? "unknown",
    link.confidence,
  );
}

function groupState(
  group: SimulationGroup,
  current: Map<string, SimulationStatus>,
  linksByGroup: Map<string, SimulationLink[]>,
): SimulationStatus {
  const links = linksByGroup.get(group.id) ?? [];
  const states = links.map((link) => linkState(link, current));
  return group.requirementMode === "ALL" ? combineAll(states) : combineAny(states);
}

function dependentStatus(
  capability: SimulationCapability,
  current: Map<string, SimulationStatus>,
  groupsByTarget: Map<string, SimulationGroup[]>,
  linksByGroup: Map<string, SimulationLink[]>,
): SimulationStatus {
  const groups =
    groupsByTarget.get(nodeKey(capability.resourceId, capability.capability)) ??
    [];
  if (groups.length === 0) return "unknown";
  const routeStatus = combineAny(
    groups.map((group) => groupState(group, current, linksByGroup)),
  );
  if (capability.confidence === "verified") return routeStatus;
  if (capability.confidence === "assumed") return "at_risk";
  return "unknown";
}

function explainImpact(
  capability: SimulationCapability,
  current: Map<string, SimulationStatus>,
  failedKeys: Set<string>,
  groupsByTarget: Map<string, SimulationGroup[]>,
  linksByGroup: Map<string, SimulationLink[]>,
  capabilityByKey: Map<string, SimulationCapability>,
  label: (resourceId: string) => string,
): SimulationImpact {
  const key = nodeKey(capability.resourceId, capability.capability);
  const status = current.get(key) ?? "unknown";
  const node = {
    resourceId: capability.resourceId,
    capability: capability.capability,
  };
  if (failedKeys.has(key)) {
    return {
      ...node,
      status,
      confidence: capability.confidence,
      explanation: "The scenario marks this capability failed.",
      reasons: ["Explicit scenario failure seed"],
      causalPath: [node],
    };
  }
  if (capability.mode === "independent") {
    return {
      ...node,
      status,
      confidence: capability.confidence,
      explanation: independentExplanation(status),
      reasons: [`Independent baseline is ${capability.confidence}`],
      causalPath: [node],
    };
  }
  if (capability.mode === "unknown") {
    return {
      ...node,
      status: "unknown",
      confidence: capability.confidence,
      explanation:
        "This capability is unknown. Missing detail is not treated as safe.",
      reasons: ["Unknown capability baseline"],
      causalPath: [node],
    };
  }

  const groups = groupsByTarget.get(key) ?? [];
  if (groups.length === 0) {
    return {
      ...node,
      status,
      confidence: capability.confidence,
      explanation:
        "This capability is dependent, and no route is recorded. Missing routes are not treated as safe.",
      reasons: ["Dependent capability with no group"],
      causalPath: [node],
    };
  }

  const routeStatus = combineAny(
    groups.map((group) => groupState(group, current, linksByGroup)),
  );
  const reasons = groups.map((group) => {
    const links = linksByGroup.get(group.id) ?? [];
    const parts = links.map(
      (link) =>
        `${label(link.prerequisiteResourceId)} ${link.prerequisiteCapability} is ${linkState(link, current)} (${link.confidence})`,
    );
    return `${group.requirementMode} ${group.label}: ${parts.join("; ") || "no prerequisites"}`;
  });
  return {
    ...node,
    status,
    confidence: capability.confidence,
    explanation: dependentExplanation(
      capability,
      status,
      routeStatus,
      groups,
      current,
      linksByGroup,
      label,
    ),
    reasons,
    causalPath: causalPath(
      capability,
      routeStatus,
      current,
      groupsByTarget,
      linksByGroup,
      capabilityByKey,
      failedKeys,
      new Set(),
    ),
  };
}

function independentExplanation(status: SimulationStatus): string {
  if (status === "available") {
    return "Independent route. The scenario does not fail it.";
  }
  if (status === "at_risk") {
    return "Independent baseline is assumed, so this is at risk rather than confirmed available.";
  }
  return "Independent baseline is unknown. Missing detail is not treated as safe.";
}

function dependentExplanation(
  capability: SimulationCapability,
  status: SimulationStatus,
  routeStatus: SimulationStatus,
  groups: SimulationGroup[],
  current: Map<string, SimulationStatus>,
  linksByGroup: Map<string, SimulationLink[]>,
  label: (resourceId: string) => string,
): string {
  if (capability.confidence === "assumed") {
    return `This capability is assumed, so the model will not confirm the route result (${routeStatus}).`;
  }
  if (capability.confidence === "unknown") {
    return "This capability baseline is unknown. Missing detail is not treated as safe.";
  }
  const decisive = groups.filter(
    (group) => groupState(group, current, linksByGroup) === routeStatus,
  );
  const described = (decisive.length > 0 ? decisive : groups)
    .map((group) => `“${group.label}” (${group.requirementMode})`)
    .join(", ");
  const named = groups
    .flatMap((group) => linksByGroup.get(group.id) ?? [])
    .filter((link) => linkState(link, current) === routeStatus)
    .map(
      (link) =>
        `${label(link.prerequisiteResourceId)} ${link.prerequisiteCapability}`,
    );
  const via = [...new Set(named)].join(", ");
  if (status === "available") {
    return via
      ? `A recorded route stays available: ${described}. It uses ${via}.`
      : `A recorded route stays available: ${described}.`;
  }
  if (status === "blocked") {
    return via
      ? `Every recorded route is blocked: ${described}. Blocked by ${via}.`
      : `Every recorded route is blocked: ${described}.`;
  }
  if (status === "at_risk") {
    return `An assumed relationship decides this result: ${described}. This is not a confirmed block or a confirmed open route.`;
  }
  return `A prerequisite is unknown, so this stays unknown: ${described}. Missing detail is not treated as safe.`;
}

function causalPath(
  capability: SimulationCapability,
  routeStatus: SimulationStatus,
  current: Map<string, SimulationStatus>,
  groupsByTarget: Map<string, SimulationGroup[]>,
  linksByGroup: Map<string, SimulationLink[]>,
  capabilityByKey: Map<string, SimulationCapability>,
  failedKeys: Set<string>,
  stack: Set<string>,
): CausalNode[] {
  const key = nodeKey(capability.resourceId, capability.capability);
  const node = {
    resourceId: capability.resourceId,
    capability: capability.capability,
  };
  if (stack.has(key) || failedKeys.has(key) || capability.mode !== "dependent") {
    return [node];
  }
  stack.add(key);
  const groups = (groupsByTarget.get(key) ?? []).filter(
    (group) => groupState(group, current, linksByGroup) === routeStatus,
  );
  const chosen = groups.length > 0 ? groups : (groupsByTarget.get(key) ?? []);
  const upstream: CausalNode[] = [];
  for (const group of chosen) {
    const links = (linksByGroup.get(group.id) ?? []).filter(
      (link) => linkState(link, current) === routeStatus,
    );
    const picked = links.length > 0 ? links : (linksByGroup.get(group.id) ?? []);
    for (const link of picked) {
      const prerequisite = capabilityByKey.get(
        nodeKey(link.prerequisiteResourceId, link.prerequisiteCapability),
      );
      if (!prerequisite) {
        upstream.push({
          resourceId: link.prerequisiteResourceId,
          capability: link.prerequisiteCapability,
        });
        continue;
      }
      const prerequisiteKey = nodeKey(
        prerequisite.resourceId,
        prerequisite.capability,
      );
      const prerequisiteGroups = groupsByTarget.get(prerequisiteKey) ?? [];
      const prerequisiteRoute =
        prerequisite.mode === "dependent" && prerequisiteGroups.length > 0
          ? combineAny(
              prerequisiteGroups.map((item) =>
                groupState(item, current, linksByGroup),
              ),
            )
          : (current.get(prerequisiteKey) ?? "unknown");
      upstream.push(
        ...causalPath(
          prerequisite,
          prerequisiteRoute,
          current,
          groupsByTarget,
          linksByGroup,
          capabilityByKey,
          failedKeys,
          stack,
        ),
      );
    }
  }
  stack.delete(key);
  return dedupe([...upstream, node]);
}

function dedupe(nodes: CausalNode[]): CausalNode[] {
  const seen = new Set<string>();
  const result: CausalNode[] = [];
  for (const node of nodes) {
    const key = nodeKey(node.resourceId, node.capability);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(node);
  }
  return result;
}

function findCycles(
  graph: SimulationGraph,
  label: (resourceId: string) => string,
): string[] {
  const groupById = new Map(graph.groups.map((group) => [group.id, group]));
  const edges = new Map<string, string[]>();
  for (const link of byId(graph.links)) {
    const group = groupById.get(link.groupId);
    if (!group) continue;
    const from = nodeKey(group.resourceId, group.capability);
    const to = nodeKey(link.prerequisiteResourceId, link.prerequisiteCapability);
    edges.set(from, [...(edges.get(from) ?? []), to]);
  }
  const cycles: string[][] = [];
  const seen = new Set<string>();
  const active: string[] = [];
  const visit = (node: string) => {
    const at = active.indexOf(node);
    if (at !== -1) {
      cycles.push(active.slice(at));
      return;
    }
    if (seen.has(node)) return;
    seen.add(node);
    active.push(node);
    for (const next of edges.get(node) ?? []) visit(next);
    active.pop();
  };
  for (const node of [...edges.keys()].sort()) visit(node);
  return [...new Set(cycles.map((cycle) => canonicalCycle(cycle, label)))].sort();
}

function canonicalCycle(
  nodes: string[],
  label: (resourceId: string) => string,
): string {
  const recovery = nodes.every((node) => node.endsWith("/recovery"));
  let best = nodes;
  for (let index = 0; index < nodes.length; index += 1) {
    const rotated = nodes.slice(index).concat(nodes.slice(0, index));
    if (rotated.join("\0") < best.join("\0")) best = rotated;
  }
  const reversed = [best[0]!, ...best.slice(1).reverse()];
  if (reversed.join("\0") < best.join("\0")) best = reversed;
  const title = recovery ? "Potential recovery loop" : "Potential dependency cycle";
  const described = best
    .map((node) => {
      const split = node.lastIndexOf("/");
      return `${label(node.slice(0, split))} ${node.slice(split + 1)}`;
    })
    .join(" ↔ ");
  return `${title}: ${described}. A cycle is not proof of lockout.`;
}

export const SIMULATION_STATUSES = STATUSES;
