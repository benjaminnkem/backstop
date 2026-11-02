/**
 * Educational, deterministic reference evaluator. Not production-certified.
 * Implement snapshot validation, authorization, rich causal paths, and
 * transaction persistence in the real Agent-Native app.
 */
import type {
  GraphSnapshot, FailureSeed, SimulationResult, Status, Capability, DependencyLink,
} from './domain-types';
const key = (r: string, c: Capability) => `${r}/${c}`;

function all(states: Status[]): Status {
  if (!states.length) return 'unknown';
  if (states.includes('blocked')) return 'blocked';
  if (states.includes('unknown')) return 'unknown';
  if (states.includes('at_risk')) return 'at_risk';
  return 'available';
}
function any(states: Status[]): Status {
  if (!states.length) return 'unknown';
  if (states.includes('available')) return 'available';
  if (states.includes('at_risk')) return 'at_risk';
  if (states.includes('unknown')) return 'unknown';
  return 'blocked';
}
function withConfidence(state: Status, confidence: DependencyLink['confidence']): Status {
  if (confidence === 'verified') return state;
  if (confidence === 'unknown') return 'unknown';
  return 'at_risk';
}

/** Find directed cycles on configured recovery capabilities, for warnings only. */
function findRecoveryCycles(graph: GraphSnapshot): string[] {
  const groupById = new Map(graph.groups.map(g => [g.id, g]));
  const edges = new Map<string, string[]>();
  for (const link of graph.links) {
    const group = groupById.get(link.groupId);
    if (!group || group.capability !== 'recovery') continue;
    if (link.prerequisiteCapability !== 'recovery') continue;
    const from = key(group.resourceId, group.capability);
    const to = key(link.prerequisiteResourceId, link.prerequisiteCapability);
    edges.set(from, [...(edges.get(from) ?? []), to]);
  }
  const found = new Set<string>();
  const seen = new Set<string>();
  const active: string[] = [];
  function visit(node: string) {
    const at = active.indexOf(node);
    if (at !== -1) {
      const cyc = active.slice(at).concat(node);
      found.add(cyc.join(' -> '));
      return;
    }
    if (seen.has(node)) return;
    seen.add(node);
    active.push(node);
    for (const next of edges.get(node) ?? []) visit(next);
    active.pop();
  }
  for (const node of edges.keys()) visit(node);
  return [...found].sort().map(p => `Potential recovery loop: ${p}`);
}

export function simulate(graph: GraphSnapshot, failed: FailureSeed[]): SimulationResult {
  const caps = [...graph.capabilities].sort((a, b) => key(a.resourceId,a.capability).localeCompare(key(b.resourceId,b.capability)));
  const failedKeys = new Set(failed.map(f => key(f.resourceId, f.capability)));
  const groupIndex = new Map<string, typeof graph.groups>();
  for (const group of graph.groups) {
    const k = key(group.resourceId, group.capability);
    groupIndex.set(k, [...(groupIndex.get(k) ?? []), group]);
  }
  const linksByGroup = new Map<string, typeof graph.links>();
  for (const link of graph.links) {
    linksByGroup.set(link.groupId, [...(linksByGroup.get(link.groupId) ?? []), link]);
  }
  let current = new Map<string, Status>();
  for (const c of caps) {
    const k = key(c.resourceId,c.capability);
    current.set(k, failedKeys.has(k) ? 'blocked'
      : c.mode === 'independent' ? (c.confidence === 'verified' ? 'available' : c.confidence === 'assumed' ? 'at_risk' : 'unknown')
      : 'unknown');
  }
  // Synchronous fixed-point evaluation avoids order-dependent changes.
  const bound = caps.length * 4 + 8;
  let converged = false;
  for (let iteration = 0; iteration < bound; iteration++) {
    const next = new Map(current);
    for (const c of caps) {
      const k = key(c.resourceId,c.capability);
      if (failedKeys.has(k) || c.mode !== 'dependent') continue;
      const routes = groupIndex.get(k) ?? [];
      if (!routes.length) { next.set(k, 'unknown'); continue; }
      const routeStates = routes.map(group => {
        const deps = linksByGroup.get(group.id) ?? [];
        if (!deps.length) return 'unknown' as Status;
        const states: Status[] = deps.map(d => withConfidence(
          current.get(key(d.prerequisiteResourceId,d.prerequisiteCapability)) ?? 'unknown', d.confidence));
        return group.requirementMode === 'ALL' ? all(states) : any(states);
      });
      const status = any(routeStates);
      next.set(k, c.confidence === 'verified' ? status : c.confidence === 'assumed' ? 'at_risk' : 'unknown');
    }
    if (caps.every(c => next.get(key(c.resourceId,c.capability)) === current.get(key(c.resourceId,c.capability)))) {
      current = next; converged = true; break;
    }
    current = next;
  }
  const warnings = findRecoveryCycles(graph);
  if (!converged) warnings.push('Engine did not converge; inspect graph and baseline configuration.');
  const impacts = caps.map(c => ({
    resourceId: c.resourceId,
    capability: c.capability,
    status: current.get(key(c.resourceId,c.capability)) ?? 'unknown',
    reasons: failedKeys.has(key(c.resourceId,c.capability)) ? ['Explicit scenario failure seed']
      : [`Derived from ${c.mode} capability and entered dependencies`],
  }));
  const summary = { available: 0, blocked: 0, at_risk: 0, unknown: 0 };
  for (const impact of impacts) summary[impact.status] += 1;
  return { impacts, warnings, summary };
}
