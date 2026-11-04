import dagre from "@dagrejs/dagre";
import { MarkerType, type Edge, type Node } from "@xyflow/react";

import type { Capability, WorkspaceMap } from "@shared/recovery";
import type { SimulationRecord } from "@shared/simulation-contract";

export type Impact = SimulationRecord["impacts"][number];
export type SimStatus = Impact["status"];
export type MapResource = WorkspaceMap["resources"][number];
export type MapCapability = WorkspaceMap["capabilities"][number];
export type MapLink = WorkspaceMap["links"][number] & {
  prerequisiteName: string;
};
export type MapGroup = WorkspaceMap["groups"][number] & { links: MapLink[] };
export type IndexedCapability = MapCapability & { groups: MapGroup[] };

export const KIND_LABEL: Record<MapResource["kind"], string> = {
  service: "Service",
  identity_provider: "Identity provider",
  email: "Email",
  account: "Account",
  device: "Device",
  person: "Person",
  recovery_method: "Recovery method",
  credential_vault: "Password vault",
  backup_location: "Backup location",
};

export const CAPABILITY_LABEL: Record<Capability, string> = {
  access: "Access",
  recovery: "Recovery",
  administration: "Admin",
};

export const CAPABILITY_ORDER: Capability[] = [
  "access",
  "recovery",
  "administration",
];

export const key = (resourceId: string, capability: Capability) =>
  `${resourceId}/${capability}`;

/** Capabilities per resource with their routes and prerequisite names. */
export function indexMap(data: WorkspaceMap) {
  const names = new Map(
    data.resources.map((item) => [
      item.id,
      item.status === "archived" ? `${item.name} (archived)` : item.name,
    ]),
  );
  const linksByGroup = new Map<string, MapLink[]>();
  for (const link of data.links) {
    const list = linksByGroup.get(link.groupId) ?? [];
    list.push({
      ...link,
      prerequisiteName:
        names.get(link.prerequisiteResourceId) ?? "Unknown resource",
    });
    linksByGroup.set(link.groupId, list);
  }
  const groupsByTarget = new Map<string, MapGroup[]>();
  for (const group of data.groups) {
    const k = key(group.resourceId, group.capability);
    const list = groupsByTarget.get(k) ?? [];
    list.push({ ...group, links: linksByGroup.get(group.id) ?? [] });
    groupsByTarget.set(k, list);
  }
  const byResource = new Map<string, IndexedCapability[]>();
  for (const capability of data.capabilities) {
    const list = byResource.get(capability.resourceId) ?? [];
    list.push({
      ...capability,
      groups: groupsByTarget.get(key(capability.resourceId, capability.capability)) ?? [],
    });
    byResource.set(capability.resourceId, list);
  }
  for (const list of byResource.values()) {
    list.sort(
      (a, b) =>
        CAPABILITY_ORDER.indexOf(a.capability) -
        CAPABILITY_ORDER.indexOf(b.capability),
    );
  }
  return byResource;
}

export function indexImpacts(simulation: SimulationRecord | null) {
  const map = new Map<string, Impact>();
  for (const impact of simulation?.impacts ?? []) {
    map.set(key(impact.resourceId, impact.capability), impact);
  }
  return map;
}

/** Capability keys on the explanatory path for the chosen impacts. */
export function pathKeys(impacts: Impact[]): Set<string> {
  const keys = new Set<string>();
  for (const impact of impacts) {
    keys.add(key(impact.resourceId, impact.capability));
    for (const node of impact.causalPath) {
      keys.add(key(node.resourceId, node.capability));
    }
  }
  return keys;
}

export interface ResourceNodeData extends Record<string, unknown> {
  resource: MapResource;
  capabilities: Array<{
    capability: Capability;
    mode: MapCapability["mode"];
    confidence: MapCapability["confidence"];
    status: SimStatus | null;
    failed: boolean;
    onPath: boolean;
  }>;
  selected: boolean;
  onPath: boolean;
  dimmed: boolean;
}

export interface RouteEdgeData extends Record<string, unknown> {
  capability: Capability;
  requirementMode: "ALL" | "ANY";
  confidence: MapLink["confidence"];
  groupLabel: string;
  onPath: boolean;
  blocked: boolean;
}

export const NODE_WIDTH = 272;
const NODE_BASE_HEIGHT = 66;
const ROW_HEIGHT = 26;

export function buildGraph(input: {
  data: WorkspaceMap;
  indexed: Map<string, IndexedCapability[]>;
  impacts: Map<string, Impact>;
  simulation: SimulationRecord | null;
  selectedId: string | null;
  highlight: Set<string>;
}): { nodes: Node<ResourceNodeData>[]; edges: Edge<RouteEdgeData>[] } {
  const { data, indexed, impacts, simulation, selectedId, highlight } = input;
  const failed = new Set(
    (simulation?.failed ?? []).map((item) => key(item.resourceId, item.capability)),
  );
  const hasHighlight = highlight.size > 0;
  const resources = data.resources.filter((item) => item.status !== "archived");
  const visible = new Set(resources.map((item) => item.id));

  const graph = new dagre.graphlib.Graph();
  graph.setGraph({ rankdir: "LR", nodesep: 28, ranksep: 96, marginx: 24, marginy: 24 });
  graph.setDefaultEdgeLabel(() => ({}));

  const nodes: Node<ResourceNodeData>[] = resources.map((resource) => {
    const capabilities = (indexed.get(resource.id) ?? []).map((capability) => {
      const k = key(resource.id, capability.capability);
      return {
        capability: capability.capability,
        mode: capability.mode,
        confidence: capability.confidence,
        status: impacts.get(k)?.status ?? null,
        failed: failed.has(k),
        onPath: highlight.has(k),
      };
    });
    const onPath = capabilities.some((item) => item.onPath);
    const height = NODE_BASE_HEIGHT + Math.max(1, capabilities.length) * ROW_HEIGHT;
    graph.setNode(resource.id, { width: NODE_WIDTH, height });
    return {
      id: resource.id,
      type: "resource",
      position: { x: 0, y: 0 },
      width: NODE_WIDTH,
      height,
      data: {
        resource,
        capabilities,
        selected: resource.id === selectedId,
        onPath,
        dimmed: hasHighlight && !onPath && resource.id !== selectedId,
      },
    };
  });

  const groupById = new Map(data.groups.map((group) => [group.id, group]));
  const edges: Edge<RouteEdgeData>[] = [];
  for (const link of data.links) {
    const group = groupById.get(link.groupId);
    if (!group) continue;
    if (!visible.has(group.resourceId) || !visible.has(link.prerequisiteResourceId)) {
      continue;
    }
    const target = key(group.resourceId, group.capability);
    const source = key(link.prerequisiteResourceId, link.prerequisiteCapability);
    const onPath = highlight.has(target) && highlight.has(source);
    const sourceStatus = impacts.get(source)?.status;
    graph.setEdge(link.prerequisiteResourceId, group.resourceId);
    edges.push({
      id: link.id,
      source: link.prerequisiteResourceId,
      target: group.resourceId,
      type: "route",
      markerEnd: {
        type: MarkerType.ArrowClosed,
        width: 14,
        height: 14,
        color: onPath
          ? "hsl(var(--bs-path))"
          : sourceStatus === "blocked"
            ? "hsl(var(--bs-blocked) / 0.7)"
            : "hsl(var(--muted-foreground) / 0.5)",
      },
      data: {
        capability: group.capability,
        requirementMode: group.requirementMode,
        confidence: link.confidence,
        groupLabel: group.label,
        onPath,
        blocked: sourceStatus === "blocked",
      },
      zIndex: onPath ? 2 : 0,
    });
  }

  dagre.layout(graph);
  for (const node of nodes) {
    const laid = graph.node(node.id);
    if (!laid) continue;
    node.position = {
      x: laid.x - (node.width ?? NODE_WIDTH) / 2,
      y: laid.y - (node.height ?? 0) / 2,
    };
  }
  return { nodes, edges };
}
