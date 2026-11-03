import { sendToAgentChat } from "@agent-native/core/client/agent-chat";
import {
  actionErrorMessage,
  useActionMutation,
  useActionQuery,
} from "@agent-native/core/client/hooks";
import { IconArrowRight, IconMessage, IconPlayerPlay } from "@tabler/icons-react";
import { useMemo } from "react";
import { Link, useNavigate } from "react-router";
import { toast } from "sonner";

import { CAPABILITY_LABEL, indexMap } from "@/components/map/map-model";
import { StatusBadge } from "@/components/map/status";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { APP_TITLE } from "@/lib/app-config";

const SEO_TITLE = `${APP_TITLE} — Recovery readiness`;
const SEO_DESCRIPTION =
  "Map how your team gets back into critical accounts, then test what a lost phone or a dead inbox would block.";

export function meta() {
  return [
    { title: SEO_TITLE },
    { name: "description", content: SEO_DESCRIPTION },
    { property: "og:title", content: SEO_TITLE },
    { property: "og:description", content: SEO_DESCRIPTION },
    { name: "twitter:card", content: "summary" },
    { name: "twitter:title", content: SEO_TITLE },
    { name: "twitter:description", content: SEO_DESCRIPTION },
  ];
}

export default function OverviewRoute() {
  const navigate = useNavigate();
  const map = useActionQuery("get-workspace-map", {});
  const workspaceId = map.data?.workspace?.id;
  const latest = useActionQuery(
    "get-simulation",
    { ...(workspaceId ? { workspaceId } : {}) },
    { enabled: Boolean(workspaceId) },
  );
  const tasks = useActionQuery(
    "list-remediation-tasks",
    { ...(workspaceId ? { workspaceId } : {}) },
    { enabled: Boolean(workspaceId) },
  );
  const seed = useActionMutation("seed-northstar", {
    onSuccess: (result) => navigate(`/map?workspace=${result.id}`),
    onError: (error) =>
      toast.error(actionErrorMessage(error) ?? "Could not open the sample team."),
  });

  const data = map.data;
  const model = useMemo(() => {
    if (!data?.workspace) return null;
    const indexed = indexMap(data);
    const names = new Map(data.resources.map((item) => [item.id, item.name]));
    const active = data.resources.filter((item) => item.status !== "archived");
    const singleRoute: Array<{ resourceId: string; label: string }> = [];
    const unmapped: Array<{ resourceId: string; label: string }> = [];
    let unverified = 0;
    for (const [resourceId, capabilities] of indexed) {
      for (const capability of capabilities) {
        const label = `${names.get(resourceId)} · ${CAPABILITY_LABEL[capability.capability].toLowerCase()}`;
        if (capability.confidence !== "verified") unverified += 1;
        if (capability.mode !== "dependent") continue;
        if (capability.groups.length === 0) unmapped.push({ resourceId, label });
        else if (capability.groups.length === 1) {
          // One ANY route with several prerequisites still has alternatives.
          const only = capability.groups[0]!;
          if (!(only.requirementMode === "ANY" && only.links.length > 1)) {
            singleRoute.push({ resourceId, label });
          }
        }
        unverified += capability.groups
          .flatMap((group) => group.links)
          .filter((link) => link.confidence !== "verified").length;
      }
    }
    return {
      critical: active.filter((item) => item.criticality === "critical").length,
      dependencies: data.links.length,
      singleRoute,
      unmapped,
      unverified,
    };
  }, [data]);

  if (map.isPending) {
    return (
      <div className="mx-auto flex max-w-5xl flex-col gap-4 px-6 py-8">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }
  if (map.isError) {
    return (
      <div className="mx-auto max-w-xl px-6 py-16">
        <p className="text-sm text-foreground">
          {actionErrorMessage(map.error) ?? "The workspace could not be loaded."}
        </p>
        <Button className="mt-4" variant="outline" onClick={() => map.refetch()}>
          Try again
        </Button>
      </div>
    );
  }
  if (!data?.workspace || !model) {
    return (
      <div className="mx-auto flex min-h-[70vh] max-w-xl flex-col justify-center px-6 py-12">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          When the normal way in stops working, is there another way in?
        </h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          Map how your team signs in and recovers critical accounts, then test
          what a lost phone or an unavailable inbox would block. Nothing here
          connects to a live provider or stores a credential.
        </p>
        <div className="mt-6 flex flex-wrap gap-2">
          <Button
            className="bg-brand text-brand-foreground hover:bg-brand/90"
            disabled={seed.isPending}
            onClick={() => seed.mutate({})}
          >
            {seed.isPending ? "Opening sample team…" : "Explore sample team"}
          </Button>
          <Button variant="outline" onClick={askToMapResource}>
            <IconMessage className="size-4" strokeWidth={1.6} />
            Map your first service
          </Button>
        </div>
      </div>
    );
  }

  const simulation = latest.data?.simulation ?? null;
  const openTasks = (tasks.data?.tasks ?? []).filter(
    (task) => task.status === "open" || task.status === "in_progress",
  );
  const urgent = openTasks.filter((task) => task.priority === "urgent" || task.priority === "high");
  const ws = data.workspace;

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium text-brand">
            {ws.fictional ? "Fictional sample team" : "Workspace"}
          </p>
          <h1 className="mt-0.5 text-2xl font-semibold tracking-tight text-foreground">{ws.name}</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={askToMapResource}>
            <IconMessage className="size-4" strokeWidth={1.6} />
            Map a resource
          </Button>
          <Button asChild className="bg-brand text-brand-foreground hover:bg-brand/90">
            <Link to={`/map?workspace=${ws.id}`}>
              <IconPlayerPlay className="size-4" strokeWidth={1.8} />
              Run a failure simulation
            </Link>
          </Button>
        </div>
      </div>

      <dl className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-5">
        <Metric label="Critical resources" value={model.critical} />
        <Metric label="Modelled dependencies" value={model.dependencies} />
        <Metric label="Single-route capabilities" value={model.singleRoute.length} tone={model.singleRoute.length > 0 ? "warn" : undefined} />
        <Metric label="Unverified or unmapped" value={model.unverified + model.unmapped.length} tone={model.unverified + model.unmapped.length > 0 ? "warn" : undefined} />
        <Metric label="Open high-priority tasks" value={urgent.length} />
      </dl>

      <div className="mt-6 grid gap-4 lg:grid-cols-[3fr_2fr]">
        <section className="rounded-xl border border-border bg-card p-4" aria-labelledby="latest-heading">
          <div className="flex items-center justify-between gap-3">
            <h2 id="latest-heading" className="text-sm font-semibold text-foreground">
              Latest simulation
            </h2>
            {simulation ? (
              <Link
                to={`/map?workspace=${ws.id}&simulation=${simulation.id}`}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                Open on map <IconArrowRight className="size-3" />
              </Link>
            ) : null}
          </div>
          {latest.isPending ? (
            <Skeleton className="mt-3 h-20 w-full" />
          ) : simulation ? (
            <>
              <p className="mt-2 text-base font-medium text-foreground">{simulation.name}</p>
              <p className="text-xs text-muted-foreground">
                {new Date(simulation.createdAt).toLocaleString()} · counts are per capability in the model
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {(["blocked", "at_risk", "unknown", "available"] as const).map((status) => (
                  <span key={status} className="flex items-center gap-1.5 text-sm text-foreground">
                    <span className="font-semibold tabular-nums">{simulation.summary[status]}</span>
                    <StatusBadge status={status} />
                  </span>
                ))}
              </div>
              {simulation.warnings.length > 0 ? (
                <p className="mt-3 text-xs leading-5 text-status-at-risk">{simulation.warnings[0]}</p>
              ) : null}
            </>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">
              No run yet. Start with a lost administrator phone.
            </p>
          )}
        </section>

        <section className="rounded-xl border border-border bg-card p-4" aria-labelledby="weak-heading">
          <h2 id="weak-heading" className="text-sm font-semibold text-foreground">
            Where the model is thin
          </h2>
          {model.singleRoute.length === 0 && model.unmapped.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">
              Every dependent capability has more than one recorded route.
            </p>
          ) : (
            <ul className="mt-2 flex flex-col gap-1">
              {model.unmapped.map((item) => (
                <WeakSpot key={`u-${item.label}`} workspaceId={ws.id} item={item} note="No route recorded" />
              ))}
              {model.singleRoute.map((item) => (
                <WeakSpot key={`s-${item.label}`} workspaceId={ws.id} item={item} note="One route" />
              ))}
            </ul>
          )}
          <Link
            to={`/remediation?workspace=${ws.id}`}
            className="mt-3 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            {openTasks.length} open {openTasks.length === 1 ? "task" : "tasks"} <IconArrowRight className="size-3" />
          </Link>
        </section>
      </div>

      <p className="mt-6 text-xs leading-5 text-muted-foreground">
        {data.disclaimer} A simulation does not prove that a real account can be recovered.
      </p>
    </div>
  );
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "warn" | undefined;
}) {
  return (
    <div className="flex flex-col rounded-xl border border-border bg-card px-4 py-3">
      <dt className="order-2 mt-1 text-xs text-muted-foreground">{label}</dt>
      <dd
        className={
          tone === "warn"
            ? "order-1 text-2xl font-semibold tabular-nums text-status-at-risk"
            : "order-1 text-2xl font-semibold tabular-nums text-foreground"
        }
      >
        {value}
      </dd>
    </div>
  );
}

function WeakSpot({
  workspaceId,
  item,
  note,
}: {
  workspaceId: string;
  item: { resourceId: string; label: string };
  note: string;
}) {
  return (
    <li>
      <Link
        to={`/map?workspace=${workspaceId}&resource=${item.resourceId}`}
        className="flex items-center justify-between gap-3 rounded-md px-2 py-1.5 text-sm hover:bg-accent"
      >
        <span className="truncate text-foreground">{item.label}</span>
        <span className="shrink-0 text-xs text-muted-foreground">{note}</span>
      </Link>
    </li>
  );
}

function askToMapResource() {
  sendToAgentChat({
    message:
      "Help me add a critical service to the recovery map. Ask me how people sign in to it and how it is recovered, then record it.",
    submit: false,
    openSidebar: true,
  });
}
