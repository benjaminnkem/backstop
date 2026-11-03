import { sendToAgentChat } from "@agent-native/core/client/agent-chat";
import {
  actionErrorMessage,
  useActionMutation,
  useActionQuery,
} from "@agent-native/core/client/hooks";
import { IconKey } from "@tabler/icons-react";
import { useCallback, useEffect, useMemo } from "react";
import { useSearchParams } from "react-router";
import { toast } from "sonner";

import { DependencyGraph, GraphLegend } from "@/components/map/dependency-graph";
import { Inspector } from "@/components/map/inspector";
import {
  buildGraph,
  indexImpacts,
  indexMap,
  pathKeys,
} from "@/components/map/map-model";
import { ResourceList } from "@/components/map/resource-list";
import { ScenarioPanel } from "@/components/map/scenario-panel";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { useElementWidth } from "@/hooks/use-element-width";
import { APP_TITLE } from "@/lib/app-config";
import { capabilitySchema, type Capability, type WorkspaceMap } from "@shared/recovery";
import { resolveScenarios } from "@shared/scenarios";
import type { SimulationRecord } from "@shared/simulation-contract";

/** Below this content width the graph becomes a list. */
const CANVAS_MIN_WIDTH = 900;

export function meta() {
  return [{ title: `Dependency map — ${APP_TITLE}` }];
}

export default function MapRoute() {
  const [params, setParams] = useSearchParams();
  const workspaceId = params.get("workspace") ?? undefined;
  const simulationId = params.get("simulation") ?? undefined;
  const map = useActionQuery("get-workspace-map", {
    ...(workspaceId ? { workspaceId } : {}),
  });
  const latest = useActionQuery("get-simulation", {
    ...(workspaceId ? { workspaceId } : {}),
    ...(simulationId ? { simulationId } : {}),
  });
  const run = useActionMutation("run-simulation", {
    onSuccess: (result) => {
      const next = new URLSearchParams(params);
      next.set("workspace", result.simulation.workspaceId);
      next.set("simulation", result.simulation.id);
      setParams(next);
    },
    onError: (error) => {
      toast.error(actionErrorMessage(error) ?? "The simulation did not finish.");
    },
  });
  const seed = useActionMutation("seed-northstar", {
    onSuccess: (result) => setParams({ workspace: result.id }),
    onError: (error) => {
      toast.error(actionErrorMessage(error) ?? "Could not open the sample team.");
    },
  });

  if (map.isPending) {
    return (
      <div className="flex h-full">
        <div className="flex w-80 flex-col gap-3 border-e border-border p-4">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-9 w-full" />
        </div>
        <div className="flex-1 bg-canvas p-8">
          <Skeleton className="h-full w-full rounded-xl" />
        </div>
      </div>
    );
  }

  if (map.isError) {
    return (
      <div className="mx-auto max-w-xl px-6 py-16">
        <p className="text-base text-foreground">
          {actionErrorMessage(map.error) ?? "The recovery map could not be loaded."}
        </p>
        <Button className="mt-4" variant="outline" onClick={() => map.refetch()}>
          Try again
        </Button>
      </div>
    );
  }

  const data = map.data;
  if (!data?.workspace) {
    return (
      <div className="mx-auto flex min-h-[70vh] w-full max-w-xl flex-col justify-center px-6 py-12">
        <IconKey className="size-8 text-brand" strokeWidth={1.6} />
        <h1 className="mt-4 text-2xl font-semibold tracking-tight text-foreground">
          Add your first critical service
        </h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          Or start with the fictional Northstar Studio team. It shows how a
          phone, an email account, and a hardware key depend on each other.
          Nothing here signs in to a live provider.
        </p>
        <Button
          className="mt-6 w-fit bg-ink text-background hover:bg-ink/85"
          disabled={seed.isPending}
          onClick={() => seed.mutate({})}
        >
          {seed.isPending ? "Opening sample team…" : "Explore sample team"}
        </Button>
      </div>
    );
  }

  const simulation = run.data?.simulation ?? latest.data?.simulation ?? null;
  return (
    <MapWorkspace
      data={data}
      workspaceId={data.workspace.id}
      simulation={simulation}
      running={run.isPending}
      onRun={(input) =>
        run.mutate({
          workspaceId: data.workspace!.id,
          name: input.name,
          failed: [input.failed],
        })
      }
    />
  );
}

function MapWorkspace({
  data,
  workspaceId,
  simulation,
  running,
  onRun,
}: {
  data: WorkspaceMap;
  workspaceId: string;
  simulation: SimulationRecord | null;
  running: boolean;
  onRun: (input: {
    name: string;
    failed: { resourceId: string; capability: Capability };
  }) => void;
}) {
  const [params, setParams] = useSearchParams();
  const selectedId = params.get("resource");
  const parsedCapability = capabilitySchema.safeParse(params.get("capability"));
  const focusCapability = parsedCapability.success ? parsedCapability.data : null;
  const [containerRef, width] = useElementWidth<HTMLDivElement>();
  const wide = width === null || width >= CANVAS_MIN_WIDTH;

  const indexed = useMemo(() => indexMap(data), [data]);
  const impacts = useMemo(() => indexImpacts(simulation), [simulation]);
  const scenarios = useMemo(
    () => resolveScenarios(data.resources, data.capabilities),
    [data.resources, data.capabilities],
  );
  const selected = data.resources.find((item) => item.id === selectedId) ?? null;

  const highlight = useMemo(() => {
    if (!selectedId || !simulation) return new Set<string>();
    const own = simulation.impacts.filter((item) => item.resourceId === selectedId);
    const focused = focusCapability
      ? own.filter((item) => item.capability === focusCapability)
      : own.filter((item) => item.status !== "available");
    return pathKeys(focused.length > 0 ? focused : own);
  }, [selectedId, simulation, focusCapability]);

  const graph = useMemo(
    () => buildGraph({ data, indexed, impacts, simulation, selectedId, highlight }),
    [data, indexed, impacts, simulation, selectedId, highlight],
  );

  const select = useCallback(
    (resourceId: string | null, capability?: Capability | null) => {
      setParams(
        (previous) => {
          const next = new URLSearchParams(previous);
          next.set("workspace", workspaceId);
          if (resourceId) next.set("resource", resourceId);
          else next.delete("resource");
          if (capability) next.set("capability", capability);
          else next.delete("capability");
          return next;
        },
        { replace: true },
      );
    },
    [setParams, workspaceId],
  );
  const toggle = useCallback(
    (resourceId: string) => select(resourceId === selectedId ? null : resourceId),
    [select, selectedId],
  );
  const clear = useCallback(() => select(null), [select]);

  useEffect(() => {
    if (!selectedId) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") clear();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedId, clear]);

  const inspector = selected ? (
    <Inspector
      key={selected.id}
      workspaceId={workspaceId}
      simulationId={simulation?.id}
      resource={selected}
      resources={data.resources}
      indexed={indexed}
      impacts={impacts}
      focusCapability={focusCapability}
      onFocusCapability={(capability) => select(selected.id, capability)}
      onClose={clear}
      onSelect={(id) => select(id)}
    />
  ) : null;

  const panel = (
    <ScenarioPanel
      rail={wide}
      data={data}
      indexed={indexed}
      scenarios={scenarios}
      simulation={simulation}
      running={running}
      selectedId={selectedId}
      onRun={onRun}
      onSelectImpact={(resourceId, capability) => select(resourceId, capability)}
      onAsk={askAgentToExplain}
    />
  );

  return (
    <div ref={containerRef} className="h-full min-h-0">
      {wide ? (
        <div className="flex h-full min-h-0">
          {panel}
          <div className="relative min-w-0 flex-1 bg-canvas">
            {graph.nodes.length === 0 ? (
              <p className="p-8 text-sm text-muted-foreground">
                No resources are mapped yet.
              </p>
            ) : (
              <DependencyGraph
                nodes={graph.nodes}
                edges={graph.edges}
                onSelect={toggle}
                onClear={clear}
                inspectorOpen={Boolean(selected)}
              />
            )}
            <GraphLegend />
            {inspector ? (
              <aside
                aria-label={`${selected?.name} details`}
                className="absolute inset-y-3 end-3 w-[22rem] overflow-hidden rounded-xl border border-border bg-card shadow-lg"
              >
                {inspector}
              </aside>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="h-full overflow-y-auto">
          {panel}
          <ResourceList nodes={graph.nodes} onSelect={toggle} />
          <Sheet open={Boolean(selected)} onOpenChange={(open) => !open && clear()}>
            <SheetContent side="right" className="w-full p-0 sm:max-w-md">
              <SheetTitle className="sr-only">{selected?.name ?? "Resource"}</SheetTitle>
              {inspector}
            </SheetContent>
          </Sheet>
        </div>
      )}
    </div>
  );
}

function askAgentToExplain(simulation: SimulationRecord) {
  sendToAgentChat({
    message: "What caused this impact?",
    context: JSON.stringify({
      workspaceId: simulation.workspaceId,
      simulationId: simulation.id,
    }),
    contextLabel: simulation.name,
    submit: true,
    openSidebar: true,
  });
}
