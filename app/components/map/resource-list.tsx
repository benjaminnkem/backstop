import { cn } from "@/lib/utils";

import type { ResourceNodeData } from "./map-model";
import { CAPABILITY_LABEL, KIND_LABEL } from "./map-model";
import { StatusBadge } from "./status";

/** Readable list fallback for the graph on narrow screens. */
export function ResourceList({
  nodes,
  onSelect,
}: {
  nodes: Array<{ id: string; data: ResourceNodeData }>;
  onSelect: (id: string) => void;
}) {
  return (
    <ul className="flex flex-col gap-2 p-4" aria-label="Resources">
      {nodes.map(({ id, data }) => (
        <li key={id}>
          <button
            type="button"
            aria-pressed={data.selected}
            onClick={() => onSelect(id)}
            className={cn(
              "w-full rounded-xl border bg-card px-3 py-2.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand",
              data.selected
                ? "border-brand"
                : data.onPath
                  ? "border-path"
                  : "border-border",
            )}
          >
            <span className="block text-sm font-semibold text-foreground">
              {data.resource.name}
            </span>
            <span className="block text-xs text-muted-foreground">
              {KIND_LABEL[data.resource.kind]} · {data.resource.criticality}
            </span>
            <span className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
              {data.capabilities.map((item) => (
                <span key={item.capability} className="flex items-center gap-1.5 text-xs text-foreground/85">
                  {CAPABILITY_LABEL[item.capability]}
                  {item.status ? (
                    <StatusBadge status={item.status} />
                  ) : (
                    <span className="text-muted-foreground">not run</span>
                  )}
                </span>
              ))}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
