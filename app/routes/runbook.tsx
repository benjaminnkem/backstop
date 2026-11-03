import { actionErrorMessage, useActionQuery } from "@agent-native/core/client/hooks";
import { IconAlertTriangle, IconDownload, IconPrinter } from "@tabler/icons-react";
import { Link, useSearchParams } from "react-router";

import { CAPABILITY_LABEL, KIND_LABEL } from "@/components/map/map-model";
import { ConfidenceTag, StatusBadge } from "@/components/map/status";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { APP_TITLE } from "@/lib/app-config";
import { cn } from "@/lib/utils";
import type { Runbook } from "@shared/runbook";

export function meta() {
  return [{ title: `Runbook — ${APP_TITLE}` }];
}

export default function RunbookRoute() {
  const [params] = useSearchParams();
  const workspaceId = params.get("workspace") ?? undefined;
  const simulationId = params.get("simulation") ?? undefined;
  const runbook = useActionQuery("get-runbook", {
    ...(workspaceId ? { workspaceId } : {}),
    ...(simulationId ? { simulationId } : {}),
  });

  if (runbook.isPending) {
    return (
      <div className="mx-auto flex max-w-3xl flex-col gap-4 px-6 py-8">
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  if (runbook.isError) {
    return (
      <div className="mx-auto max-w-xl px-6 py-16">
        <p className="text-sm text-foreground">
          {actionErrorMessage(runbook.error) ?? "The runbook could not be built."}
        </p>
        <div className="mt-4 flex gap-2">
          <Button variant="outline" onClick={() => runbook.refetch()}>
            Try again
          </Button>
          <Button asChild variant="ghost">
            <Link to="/map">Open the dependency map</Link>
          </Button>
        </div>
      </div>
    );
  }
  return <RunbookDocument book={runbook.data} />;
}

function RunbookDocument({ book }: { book: Runbook }) {
  const generated = new Date(book.generatedAt).toLocaleString();
  return (
    <article data-print-root className="mx-auto w-full max-w-3xl px-6 py-8 print:max-w-none print:px-0 print:py-0">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="inline-flex items-center rounded-md bg-status-blocked-soft px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-status-blocked">
            Confidential · internal use only
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
            Emergency access runbook
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {book.workspace.name}
            {book.workspace.fictional ? " (fictional sample)" : ""} · generated {generated} from the recorded map
          </p>
        </div>
        <div className="flex gap-2 print:hidden">
          <Button variant="outline" onClick={() => downloadMarkdown(book)}>
            <IconDownload className="size-4" />
            Markdown
          </Button>
          <Button variant="outline" onClick={() => window.print()}>
            <IconPrinter className="size-4" />
            Print or PDF
          </Button>
        </div>
      </header>

      <p className="mt-5 flex gap-2 rounded-lg bg-status-at-risk-soft px-3 py-2.5 text-sm leading-6 text-status-at-risk">
        <IconAlertTriangle className="mt-1 size-4 shrink-0" strokeWidth={1.8} />
        {book.testing}
      </p>

      <Section title="Critical systems and ways in">
        <div className="flex flex-col gap-4">
          {book.systems.map((system) => (
            <div key={system.resourceId} className="break-inside-avoid rounded-xl border border-border bg-card p-4 print:rounded-none print:border-x-0 print:border-t-0 print:px-0">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="text-base font-semibold text-foreground">{system.name}</h3>
                <p className="text-xs text-muted-foreground">
                  {KIND_LABEL[system.kind]} · {system.criticality} · owner:{" "}
                  {system.owner ?? <span className="font-medium text-status-at-risk">not recorded</span>}
                </p>
              </div>
              {system.description ? (
                <p className="mt-1 text-sm leading-6 text-foreground/85">{system.description}</p>
              ) : null}
              {system.capabilities.length === 0 ? (
                <p className="mt-2 text-sm text-status-unknown">No capability is recorded.</p>
              ) : (
                <dl className="mt-3 flex flex-col gap-3">
                  {system.capabilities.map((capability) => (
                    <div key={capability.capability}>
                      <dt className="flex flex-wrap items-center gap-2 text-sm font-medium text-foreground">
                        {CAPABILITY_LABEL[capability.capability]}
                        <span className="text-xs font-normal text-muted-foreground">{capability.mode}</span>
                        <ConfidenceTag confidence={capability.confidence} />
                        {capability.status ? <StatusBadge status={capability.status} /> : null}
                      </dt>
                      <dd className="mt-1 text-sm leading-6 text-foreground/85">
                        {capability.mode === "independent" ? (
                          <p className="text-muted-foreground">Independent: no prerequisite is recorded.</p>
                        ) : null}
                        {capability.routes.length > 0 ? (
                          <ol className="flex flex-col gap-0.5">
                            {capability.routes.map((route, index) => (
                              <li key={`${route.label}-${index}`}>
                                {index > 0 ? <span className="me-1 font-medium text-brand">or</span> : null}
                                {route.label}
                                <span className="text-muted-foreground">
                                  {" — needs "}
                                  {route.prerequisites.length === 0
                                    ? "no prerequisite recorded"
                                    : route.prerequisites
                                        .map(
                                          (item) =>
                                            `${item.name} ${item.capability}${item.confidence === "verified" ? "" : ` (${item.confidence})`}`,
                                        )
                                        .join(route.requirementMode === "ALL" ? " and " : " or ")}
                                </span>
                              </li>
                            ))}
                          </ol>
                        ) : null}
                        {capability.note ? (
                          <p className="mt-0.5 text-status-at-risk">{capability.note}</p>
                        ) : null}
                      </dd>
                    </div>
                  ))}
                </dl>
              )}
            </div>
          ))}
        </div>
      </Section>

      <Section title="Gaps in the record">
        {book.gaps.length === 0 ? (
          <p className="text-sm text-muted-foreground">No gaps found in the recorded map.</p>
        ) : (
          <ul className="flex flex-col gap-1 text-sm text-foreground/85">
            {book.gaps.map((gap, index) => (
              <li key={`${gap.text}-${index}`} className="flex gap-2">
                <span aria-hidden className="text-status-at-risk">•</span>
                {gap.resourceId ? (
                  <Link className="hover:underline print:no-underline" to={`/map?workspace=${book.workspace.id}&resource=${gap.resourceId}`}>
                    {gap.text}
                  </Link>
                ) : (
                  gap.text
                )}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Latest simulation">
        {!book.simulation ? (
          <p className="text-sm text-muted-foreground">No simulation has been run.</p>
        ) : (
          <div className="text-sm leading-6 text-foreground/85">
            <p className="font-medium text-foreground">
              {book.simulation.name}{" "}
              <span className="font-normal text-muted-foreground">
                · {new Date(book.simulation.createdAt).toLocaleString()}
              </span>
            </p>
            <p>Assumed unavailable: {book.simulation.assumedUnavailable.join(", ") || "none recorded"}.</p>
            <p>
              Per capability in the model: {book.simulation.summary.blocked} blocked,{" "}
              {book.simulation.summary.at_risk} at risk, {book.simulation.summary.unknown} unknown,{" "}
              {book.simulation.summary.available} available.
            </p>
            {book.simulation.blocked.length > 0 ? (
              <p>Blocked: {book.simulation.blocked.join(", ")}.</p>
            ) : null}
            {book.simulation.warnings.map((warning) => (
              <p key={warning} className="mt-1 text-status-at-risk">{warning}</p>
            ))}
          </div>
        )}
      </Section>

      <Section title="Open remediation tasks">
        {book.tasks.length === 0 ? (
          <p className="text-sm text-muted-foreground">No open tasks.</p>
        ) : (
          <ul className="flex flex-col gap-2 text-sm">
            {book.tasks.map((task) => (
              <li key={task.id} className="break-inside-avoid">
                <p className="font-medium text-foreground">{task.title}</p>
                <p className="text-xs text-muted-foreground">
                  {[task.priority, task.status.replace("_", " "), task.owner ? `owner: ${task.owner}` : null, task.resource]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                {task.reason ? <p className="text-foreground/85">{task.reason}</p> : null}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Testing history">
        <p className="text-sm text-muted-foreground">{book.testing}</p>
      </Section>

      <footer className="mt-10 border-t border-border pt-4 text-xs leading-5 text-muted-foreground">
        {book.disclaimer} A simulation does not prove a real account can be recovered. This runbook contains no credentials.
      </footer>
    </article>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className={cn("mt-8 break-inside-avoid-page")}>
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">{title}</h2>
      {children}
    </section>
  );
}

function downloadMarkdown(book: Runbook) {
  const blob = new Blob([book.markdown], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const slug = book.workspace.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  link.href = url;
  link.download = `${slug || "workspace"}-runbook.md`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
