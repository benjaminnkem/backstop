import { sendToAgentChat } from "@agent-native/core/client/agent-chat";
import {
  actionErrorMessage,
  useActionMutation,
  useActionQuery,
} from "@agent-native/core/client/hooks";
import { IconArrowRight } from "@tabler/icons-react";
import { useMemo } from "react";
import { Link, useNavigate } from "react-router";
import { toast } from "sonner";

import { StatusBadge } from "@/components/map/status";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { APP_TITLE } from "@/lib/app-config";
import { cn } from "@/lib/utils";
import { buildLedger, describeRun, type LedgerRow } from "@shared/readiness";

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

const PRIORITY_TONE: Record<string, string> = {
  urgent: "text-status-blocked",
  high: "text-status-at-risk",
  medium: "text-muted-foreground",
  low: "text-muted-foreground",
};

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
  const simulation = latest.data?.simulation ?? null;
  const ledger = useMemo(
    () => (data?.workspace ? buildLedger(data, simulation) : []),
    [data, simulation],
  );
  const summary = useMemo(
    () => (data?.workspace && simulation ? describeRun(data, simulation) : []),
    [data, simulation],
  );

  if (map.isPending) {
    return (
      <div className="mx-auto flex max-w-4xl flex-col gap-4 px-8 py-10">
        <Skeleton className="h-7 w-56" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  if (map.isError) {
    return (
      <div className="mx-auto max-w-xl px-8 py-16">
        <p className="text-sm text-foreground">
          {actionErrorMessage(map.error) ?? "The workspace could not be loaded."}
        </p>
        <Button className="mt-4" variant="outline" onClick={() => map.refetch()}>
          Try again
        </Button>
      </div>
    );
  }
  if (!data?.workspace) {
    return (
      <div className="mx-auto flex min-h-[70vh] max-w-2xl flex-col justify-center px-8 py-12">
        <h1 className="text-3xl font-semibold leading-tight tracking-tight text-foreground">
          When the normal way in stops working, is there another way in?
        </h1>
        <p className="mt-4 max-w-xl text-base leading-7 text-muted-foreground">
          Write down how your team signs in to and recovers each critical
          account. Then see what a lost phone or an unavailable inbox would
          block. Nothing here connects to a provider or stores a credential.
        </p>
        <div className="mt-8 flex flex-wrap gap-2">
          <Button
            className="bg-ink text-background hover:bg-ink/85"
            disabled={seed.isPending}
            onClick={() => seed.mutate({})}
          >
            {seed.isPending ? "Opening sample team…" : "Open the sample team"}
          </Button>
          <Button variant="ghost" onClick={askToMapResource}>
            Map your first service with the agent
          </Button>
        </div>
      </div>
    );
  }

  const ws = data.workspace;
  const openTasks = (tasks.data?.tasks ?? [])
    .filter((task) => task.status === "open" || task.status === "in_progress")
    .slice(0, 5);

  return (
    <div className="mx-auto w-full max-w-4xl px-8 py-10">
      <header className="flex flex-wrap items-baseline justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          {ws.name}
          {ws.fictional ? (
            <span className="ms-3 align-middle font-mono text-xs font-normal text-muted-foreground">
              fictional sample
            </span>
          ) : null}
        </h1>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={askToMapResource}>
            Map a resource
          </Button>
          <Button asChild size="sm" className="bg-ink text-background hover:bg-ink/85">
            <Link to={`/map?workspace=${ws.id}`}>Run a scenario</Link>
          </Button>
        </div>
      </header>

      <section className="mt-8 border-y border-border py-6" aria-label="Latest simulation">
        {latest.isPending ? (
          <Skeleton className="h-14 w-full" />
        ) : simulation ? (
          <>
            <p className="max-w-3xl text-lg leading-8 text-foreground">{summary.join(" ")}</p>
            <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-xs text-muted-foreground">
              <span>{simulation.name}</span>
              <span aria-hidden>·</span>
              <time dateTime={simulation.createdAt}>{formatStamp(simulation.createdAt)}</time>
              <span aria-hidden>·</span>
              <span>run {simulation.id.slice(0, 4)}</span>
              <Link
                to={`/map?workspace=${ws.id}&simulation=${simulation.id}`}
                className="ms-auto flex items-center gap-1 font-sans text-foreground/80 hover:text-foreground"
              >
                Open on map <IconArrowRight className="size-3.5" />
              </Link>
            </p>
          </>
        ) : (
          <p className="text-lg leading-8 text-muted-foreground">
            No scenario has been run yet.{" "}
            <Link to={`/map?workspace=${ws.id}`} className="text-foreground underline underline-offset-4">
              Start with a lost administrator phone.
            </Link>
          </p>
        )}
      </section>

      <section className="mt-10" aria-labelledby="ledger-heading">
        <div className="flex items-baseline justify-between gap-4">
          <h2 id="ledger-heading" className="text-base font-semibold text-foreground">
            Ways in
          </h2>
          <p className="font-mono text-xs text-muted-foreground">
            <Dots count={1} /> = one recorded route<span className="ms-4 text-status-at-risk">●</span> = the only one
          </p>
        </div>
        <table className="mt-3 w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted-foreground">
              <th className="py-2 pe-4 font-normal">System</th>
              <th className="py-2 pe-4 font-normal">Access</th>
              <th className="hidden py-2 pe-4 font-normal md:table-cell">Through</th>
              <th className="py-2 pe-4 font-normal">Recovery</th>
              <th className="py-2 text-right font-normal">Last run</th>
            </tr>
          </thead>
          <tbody>
            {ledger.map((row) => (
              <LedgerLine
                key={row.resourceId}
                row={row}
                onOpen={() => navigate(`/map?workspace=${ws.id}&resource=${row.resourceId}`)}
              />
            ))}
          </tbody>
        </table>
      </section>

      <section className="mt-12" aria-labelledby="work-heading">
        <div className="flex items-baseline justify-between gap-4">
          <h2 id="work-heading" className="text-base font-semibold text-foreground">
            Open work
          </h2>
          <Link
            to={`/remediation?workspace=${ws.id}`}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            All tasks <IconArrowRight className="size-3" />
          </Link>
        </div>
        {openTasks.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">No open tasks.</p>
        ) : (
          <ul className="mt-3 border-t border-border">
            {openTasks.map((task) => (
              <li key={task.id} className="border-b border-border">
                <Link
                  to={`/remediation?workspace=${ws.id}&task=${task.id}`}
                  className="grid grid-cols-[4.5rem_1fr_auto] items-baseline gap-4 py-2.5 text-sm hover:bg-accent/40"
                >
                  <span className={cn("font-mono text-xs", PRIORITY_TONE[task.priority])}>
                    {task.priority}
                  </span>
                  <span className="truncate text-foreground">{task.title}</span>
                  <span className="text-xs text-muted-foreground">{task.ownerLabel ?? "no owner"}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="mt-12 text-xs leading-5 text-muted-foreground">
        {data.disclaimer} A simulation does not prove that a real account can be recovered.
      </p>
    </div>
  );
}

function LedgerLine({ row, onOpen }: { row: LedgerRow; onOpen: () => void }) {
  return (
    <tr className="cursor-pointer border-b border-border hover:bg-accent/40" onClick={onOpen}>
      <td className="py-2.5 pe-4">
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onOpen();
          }}
          className="text-left font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {row.name}
        </button>
        <span className="ms-2 font-mono text-[11px] text-muted-foreground">{row.criticality}</span>
      </td>
      <td className="py-2.5 pe-4">
        <Ways mode={row.accessMode} count={row.accessWays} />
      </td>
      <td
        className="hidden max-w-56 truncate py-2.5 pe-4 text-muted-foreground md:table-cell"
        title={row.through.join(", ") || undefined}
      >
        {row.through.length > 0 ? row.through.join(" · ") : <span className="text-muted-foreground/60">—</span>}
      </td>
      <td className="py-2.5 pe-4">
        <Ways mode={row.recoveryMode} count={row.recoveryWays} />
      </td>
      <td className="py-2.5 text-right">
        {row.worst ? (
          <span className="inline-flex items-center gap-1.5">
            <StatusBadge status={row.worst.status} />
            {row.worst.status !== "available" && row.worst.capability !== "access" ? (
              <span className="font-mono text-[11px] text-muted-foreground">{row.worst.capability}</span>
            ) : null}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">not run</span>
        )}
      </td>
    </tr>
  );
}

function Ways({ mode, count }: { mode: LedgerRow["accessMode"]; count: number | null }) {
  if (mode === "missing") return <span className="text-muted-foreground/60">—</span>;
  if (mode === "independent") {
    return <span className="font-mono text-xs text-muted-foreground">independent</span>;
  }
  if (mode === "unknown") {
    return <span className="font-mono text-xs text-status-unknown">not recorded</span>;
  }
  if (!count) return <span className="font-mono text-xs text-status-blocked">no route</span>;
  return (
    <span aria-label={`${count} recorded ${count === 1 ? "route" : "routes"}`}>
      <Dots count={count} warn={count === 1} />
    </span>
  );
}

function Dots({ count, warn = false }: { count: number; warn?: boolean }) {
  return (
    <span
      aria-hidden
      className={cn("font-mono text-xs tracking-[0.2em]", warn ? "text-status-at-risk" : "text-foreground")}
    >
      {"●".repeat(Math.min(count, 6))}
    </span>
  );
}

function formatStamp(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function askToMapResource() {
  sendToAgentChat({
    message:
      "Help me add a critical service to the recovery map. Ask me how people sign in to it and how it is recovered, then record it.",
    submit: false,
    openSidebar: true,
  });
}
