import {
  Background,
  BaseEdge,
  Controls,
  EdgeLabelRenderer,
  getBezierPath,
  Handle,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Edge,
  type EdgeProps,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import { memo, useEffect, useMemo } from "react";

import { cn } from "@/lib/utils";

import {
  CAPABILITY_LABEL,
  KIND_LABEL,
  type ResourceNodeData,
  type RouteEdgeData,
} from "./map-model";
import { StatusBadge } from "./status";

type ResourceNode = Node<ResourceNodeData & { onSelect: (id: string) => void }>;
type RouteEdge = Edge<RouteEdgeData>;

const ResourceNodeView = memo(function ResourceNodeView({
  data,
}: NodeProps<ResourceNode>) {
  const { resource, capabilities, selected, onPath, dimmed, onSelect } = data;
  const anyFailed = capabilities.some((item) => item.failed);
  return (
    <>
      <Handle type="target" position={Position.Left} isConnectable={false} />
      <button
        type="button"
        aria-pressed={selected}
        aria-label={`${resource.name}, ${KIND_LABEL[resource.kind]}`}
        onClick={() => onSelect(resource.id)}
        className={cn(
          "flex h-full w-full flex-col rounded-xl border bg-card px-3 py-2.5 text-left text-card-foreground shadow-sm transition-[opacity,box-shadow,border-color] duration-150",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-canvas",
          selected
            ? "border-brand ring-2 ring-brand/30"
            : onPath
              ? "border-path ring-2 ring-path/25"
              : "border-border hover:border-muted-foreground/50",
          dimmed && "opacity-45",
        )}
      >
        <span className="flex items-start justify-between gap-2">
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold text-foreground">
              {resource.name}
            </span>
            <span className="mt-0.5 block truncate text-xs text-muted-foreground">
              {KIND_LABEL[resource.kind]} · {resource.criticality}
            </span>
          </span>
          {anyFailed ? (
            <span className="shrink-0 rounded-md bg-status-blocked px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-background">
              Failed
            </span>
          ) : null}
        </span>
        <span className="mt-2 flex flex-col gap-1">
          {capabilities.length === 0 ? (
            <span className="text-xs text-muted-foreground">
              No capability recorded
            </span>
          ) : (
            capabilities.map((item) => (
              <span
                key={item.capability}
                className={cn(
                  "flex h-5.5 items-center justify-between gap-2 rounded-md px-1.5 text-xs",
                  item.onPath && "bg-path/10",
                )}
              >
                <span className="flex min-w-0 items-center gap-1.5 text-foreground/85">
                  {CAPABILITY_LABEL[item.capability]}
                  {item.mode === "independent" ? (
                    <span className="text-[10px] text-muted-foreground">
                      independent
                    </span>
                  ) : null}
                  {item.confidence !== "verified" ? (
                    <span className="text-[10px] text-status-at-risk">
                      {item.confidence}
                    </span>
                  ) : null}
                </span>
                {item.status ? (
                  <StatusBadge status={item.status} />
                ) : (
                  <span className="text-[11px] text-muted-foreground">
                    Not run
                  </span>
                )}
              </span>
            ))
          )}
        </span>
      </button>
      <Handle type="source" position={Position.Right} isConnectable={false} />
    </>
  );
});

const DASH: Record<RouteEdgeData["capability"], string | undefined> = {
  access: undefined,
  recovery: "6 4",
  administration: "2 4",
};

function RouteEdgeView({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  markerEnd,
  data,
}: EdgeProps<RouteEdge>) {
  // A backward edge (part of a cycle) loops below both nodes instead of
  // curving off the canvas.
  const backward = sourceX > targetX - 24;
  const [path, labelX, labelY] = backward
    ? loopPath(sourceX, sourceY, targetX, targetY)
    : getBezierPath({
        sourceX,
        sourceY,
        targetX,
        targetY,
        sourcePosition,
        targetPosition,
      });
  if (!data) return null;
  const stroke = data.onPath
    ? "hsl(var(--bs-path))"
    : data.blocked
      ? "hsl(var(--bs-blocked) / 0.7)"
      : "hsl(var(--muted-foreground) / 0.5)";
  const tags = [
    data.capability !== "access" ? CAPABILITY_LABEL[data.capability] : null,
    data.requirementMode === "ANY" ? "ANY" : null,
    data.confidence !== "verified" ? data.confidence : null,
  ].filter(Boolean);
  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        {...(markerEnd ? { markerEnd } : {})}
        style={{
          stroke,
          strokeWidth: data.onPath ? 2.5 : 1.5,
          strokeDasharray: DASH[data.capability],
        }}
      />
      {tags.length > 0 ? (
        <EdgeLabelRenderer>
          <span
            title={data.groupLabel}
            className={cn(
              "nodrag nopan pointer-events-auto absolute rounded-md border bg-card px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground",
              data.onPath ? "border-path text-foreground" : "border-border",
            )}
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            }}
          >
            {tags.join(" · ")}
          </span>
        </EdgeLabelRenderer>
      ) : null}
    </>
  );
}

function loopPath(
  sx: number,
  sy: number,
  tx: number,
  ty: number,
): [string, number, number] {
  const depth = Math.max(sy, ty) + 90;
  const midX = (sx + tx) / 2;
  const path = `M ${sx} ${sy} C ${sx + 70} ${sy}, ${sx + 70} ${depth}, ${midX} ${depth} S ${tx - 70} ${ty}, ${tx} ${ty}`;
  return [path, midX, depth];
}

const noop = () => {};

const nodeTypes = { resource: ResourceNodeView };
const edgeTypes = { route: RouteEdgeView };

function GraphCanvas({
  nodes,
  edges,
  onSelect,
  onClear,
  inspectorOpen,
}: {
  nodes: Node<ResourceNodeData>[];
  edges: Edge<RouteEdgeData>[];
  onSelect: (id: string) => void;
  onClear: () => void;
  inspectorOpen: boolean;
}) {
  const flow = useReactFlow();
  const withHandlers = useMemo(
    () => nodes.map((node) => ({ ...node, data: { ...node.data, onSelect } })),
    [nodes, onSelect],
  );
  const shapeKey = nodes.map((node) => node.id).join("|");
  useEffect(() => {
    const frame = requestAnimationFrame(() =>
      flow.fitView({
        duration: 200,
        // Leave room for the inspector so it never covers a node.
        padding: inspectorOpen
          ? { top: "56px", bottom: "56px", left: "32px", right: "392px" }
          : { top: "56px", bottom: "56px", left: "32px", right: "72px" },
      }),
    );
    return () => cancelAnimationFrame(frame);
  }, [shapeKey, inspectorOpen, flow]);

  return (
    <ReactFlow<ResourceNode, RouteEdge>
      className="backstop-flow"
      nodes={withHandlers}
      edges={edges}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      nodesDraggable={false}
      nodesConnectable={false}
      nodesFocusable={false}
      edgesFocusable={false}
      elementsSelectable={false}
      // Without a node handler React Flow sets pointer-events: none on
      // non-selectable nodes. The button inside each node does the selecting.
      onNodeClick={noop}
      onPaneClick={(event) => {
        const target = event.target as HTMLElement | null;
        if (target?.closest(".react-flow__node")) return;
        onClear();
      }}
      fitView
      fitViewOptions={{ padding: 0.15 }}
      minZoom={0.3}
      maxZoom={1.6}
      proOptions={{ hideAttribution: true }}
    >
      <Background gap={20} size={1} />
      <Controls showInteractive={false} position="bottom-left" />
    </ReactFlow>
  );
}

export function DependencyGraph(props: {
  nodes: Node<ResourceNodeData>[];
  edges: Edge<RouteEdgeData>[];
  onSelect: (id: string) => void;
  onClear: () => void;
  inspectorOpen: boolean;
}) {
  return (
    <ReactFlowProvider>
      <GraphCanvas {...props} />
    </ReactFlowProvider>
  );
}

export function GraphLegend() {
  return (
    <div className="pointer-events-none absolute left-3 top-3 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-border bg-card/95 px-3 py-2 text-[11px] text-muted-foreground shadow-sm">
      <LegendLine label="Access" />
      <LegendLine label="Recovery" dash="6 4" />
      <LegendLine label="Admin" dash="2 4" />
      <span className="flex items-center gap-1.5">
        <span className="h-0.5 w-5 rounded bg-path" />
        Causal path
      </span>
      <span>Prerequisite → dependent</span>
    </div>
  );
}

function LegendLine({ label, dash }: { label: string; dash?: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <svg width="20" height="4" aria-hidden>
        <line
          x1="0"
          y1="2"
          x2="20"
          y2="2"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeDasharray={dash}
        />
      </svg>
      {label}
    </span>
  );
}
