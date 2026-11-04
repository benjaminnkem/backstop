import { actionErrorMessage, useActionQuery } from "@agent-native/core/client/hooks";
import { IconDownload, IconPrinter } from "@tabler/icons-react";
import { Link, useSearchParams } from "react-router";

import { CAPABILITY_LABEL, KIND_LABEL } from "@/components/map/map-model";
import { StatusBadge } from "@/components/map/status";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { APP_TITLE } from "@/lib/app-config";
import { cn } from "@/lib/utils";
import type { Runbook } from "@shared/runbook";

type System = Runbook["systems"][number];
type CapabilityEntry = System["capabilities"][number];

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
      <div className="mx-auto flex max-w-3xl flex-col gap-4 px-8 py-10">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  if (runbook.isError) {
    return (
      <div className="mx-auto max-w-xl px-8 py-16">
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
  const loopWarnings = book.simulation?.warnings.filter((item) => /loop/i.test(item)) ?? [];
  const openOwnerGaps = book.gaps.filter((gap) => /no recorded owner/.test(gap.text)).length;
  const singleRoutes = book.systems
    .flatMap((system) => system.capabilities)
    .filter((capability) => capability.note?.startsWith("Only one")).length;
  return (
    <article
      data-print-root
      className="mx-auto w-full max-w-3xl px-8 py-10 text-foreground print:max-w-none print:px-0 print:py-0"
    >
      <div className="flex items-baseline justify-between gap-4 font-mono text-[11px] uppercase tracking-[0.08em]">
        <span className="text-muted-foreground">Emergency access runbook</span>
        <span className="text-status-blocked">Confidential · internal</span>
      </div>

      <header className="mt-3 flex flex-wrap items-end justify-between gap-4 border-b-2 border-foreground pb-4">
        <h1 className="text-3xl font-semibold tracking-tight">{book.workspace.name}</h1>
        <div className="flex gap-1 print:hidden">
          <Button variant="ghost" size="sm" onClick={() => downloadMarkdown(book)}>
            <IconDownload className="size-4" />
            Markdown
          </Button>
          <Button variant="ghost" size="sm" onClick={() => window.print()}>
            <IconPrinter className="size-4" />
            Print
          </Button>
        </div>
      </header>

      <dl className="mt-4 grid grid-cols-[7rem_1fr] gap-x-4 gap-y-1 font-mono text-xs">
        <dt className="text-muted-foreground">Source</dt>
        <dd>recorded recovery map{book.workspace.fictional ? " · fictional sample team" : ""}</dd>
        <dt className="text-muted-foreground">Generated</dt>
        <dd>{stamp(book.generatedAt)}</dd>
        <dt className="text-muted-foreground">Run</dt>
        <dd>
          {book.simulation
            ? `${book.simulation.name} · ${stamp(book.simulation.createdAt)}`
            : "none"}
        </dd>
        <dt className="text-muted-foreground">Testing</dt>
        <dd className={book.testHistory.length === 0 ? "text-status-at-risk" : undefined}>
          {book.testHistory.length === 0
            ? "documented, not tested — no recovery test results recorded"
            : testingLine(book)}
        </dd>
      </dl>

      <Section number="1" title="Systems and ways in">
        <ol className="border-t border-border">
          {book.systems.map((system, index) => (
            <SystemEntry key={system.resourceId} system={system} index={index + 1} workspaceId={book.workspace.id} />
          ))}
        </ol>
      </Section>

      <Section number="2" title="Gaps">
        <p className="text-sm leading-6">
          {singleRoutes} {singleRoutes === 1 ? "capability relies" : "capabilities rely"} on a single recorded route
          {" · "}
          {openOwnerGaps} key {openOwnerGaps === 1 ? "system has" : "systems have"} no owner
          {" · "}
          {loopWarnings.length} recovery {loopWarnings.length === 1 ? "loop" : "loops"}
        </p>
        {book.gaps.length > 0 ? (
          <ul className="mt-3 space-y-1 text-sm text-muted-foreground">
            {book.gaps.map((gap, index) => (
              <li key={`${gap.text}-${index}`} className="flex gap-2">
                <span aria-hidden className="font-mono">–</span>
                {gap.resourceId ? (
                  <Link
                    to={`/map?workspace=${book.workspace.id}&resource=${gap.resourceId}`}
                    className="hover:text-foreground hover:underline print:no-underline"
                  >
                    {gap.text}
                  </Link>
                ) : (
                  gap.text
                )}
              </li>
            ))}
          </ul>
        ) : null}
      </Section>

      <Section number="3" title="Latest run">
        {!book.simulation ? (
          <p className="text-sm text-muted-foreground">No scenario has been run.</p>
        ) : (
          <dl className="grid grid-cols-[9rem_1fr] gap-x-4 gap-y-2 text-sm">
            <dt className="text-muted-foreground">Scenario</dt>
            <dd>{book.simulation.name}</dd>
            <dt className="text-muted-foreground">Assumed unavailable</dt>
            <dd>{book.simulation.assumedUnavailable.join(", ") || "none recorded"}</dd>
            <dt className="text-muted-foreground">Result</dt>
            <dd className="font-mono text-xs leading-6">
              <span className={book.simulation.summary.blocked ? "text-status-blocked" : undefined}>
                {book.simulation.summary.blocked} blocked
              </span>
              {" · "}
              {book.simulation.summary.at_risk} at risk · {book.simulation.summary.unknown} unknown ·{" "}
              {book.simulation.summary.available} available
              <span className="font-sans text-muted-foreground"> — per capability, in the model</span>
            </dd>
            {book.simulation.blocked.length > 0 ? (
              <>
                <dt className="text-muted-foreground">Blocked</dt>
                <dd>{book.simulation.blocked.join(", ")}</dd>
              </>
            ) : null}
            {book.simulation.warnings.length > 0 ? (
              <>
                <dt className="text-muted-foreground">Warnings</dt>
                <dd className="space-y-1">
                  {book.simulation.warnings.map((warning) => (
                    <p key={warning}>{warning}</p>
                  ))}
                </dd>
              </>
            ) : null}
          </dl>
        )}
      </Section>

      <Section number="4" title="Open tasks">
        {book.tasks.length === 0 ? (
          <p className="text-sm text-muted-foreground">No open tasks.</p>
        ) : (
          <ul className="border-t border-border text-sm">
            {book.tasks.map((task) => (
              <li key={task.id} className="grid grid-cols-[4.5rem_1fr_auto] items-baseline gap-4 border-b border-border py-2">
                <span
                  className={cn(
                    "font-mono text-xs",
                    task.priority === "urgent"
                      ? "text-status-blocked"
                      : task.priority === "high"
                        ? "text-status-at-risk"
                        : "text-muted-foreground",
                  )}
                >
                  {task.priority}
                </span>
                <span>
                  {task.title}
                  {task.reason ? (
                    <span className="block text-xs text-muted-foreground">{task.reason}</span>
                  ) : null}
                </span>
                <span className="text-xs text-muted-foreground">
                  {task.status.replace("_", " ")}
                  {task.owner ? ` · ${task.owner}` : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section number="5" title="Testing history">
        <p className="text-sm text-muted-foreground">{book.testing}</p>
        {book.testHistory.length > 0 ? (
          <ul className="mt-3 border-t border-border text-sm">
            {book.testHistory.map((test) => (
              <li
                key={test.id}
                className="grid break-inside-avoid grid-cols-[6.5rem_4rem_1fr] items-baseline gap-4 border-b border-border py-2"
              >
                <span className="font-mono text-xs text-muted-foreground">{test.testedOn ?? "not yet"}</span>
                <span className={cn("font-mono text-xs", OUTCOME_TONE[test.outcome])}>{test.outcome}</span>
                <span>
                  {test.resource} {test.capability}
                  {test.route ? <span className="text-muted-foreground"> · {test.route}</span> : null}
                  <span className="block text-xs text-muted-foreground">
                    {test.method}
                    {test.tester ? ` · ${test.tester}` : ""}
                    {test.evidence ? ` · ${test.evidence}` : ""}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </Section>

      <footer className="mt-12 border-t border-border pt-4 text-xs leading-5 text-muted-foreground">
        {book.disclaimer} A simulation does not prove a real account can be recovered. This document
        contains no credentials.
      </footer>
    </article>
  );
}

function SystemEntry({
  system,
  index,
  workspaceId,
}: {
  system: System;
  index: number;
  workspaceId: string;
}) {
  return (
    <li className="grid break-inside-avoid grid-cols-[2.25rem_1fr] border-b border-border py-5">
      <span className="font-mono text-sm text-muted-foreground tabular-nums">{String(index).padStart(2, "0")}</span>
      <div className="min-w-0">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h3 className="text-base font-semibold">
            <Link
              to={`/map?workspace=${workspaceId}&resource=${system.resourceId}`}
              className="hover:underline print:no-underline"
            >
              {system.name}
            </Link>
          </h3>
          <p className="text-xs text-muted-foreground">
            {KIND_LABEL[system.kind]} · {system.criticality} ·{" "}
            {system.owner ? (
              `owner ${system.owner}`
            ) : (
              <span className="text-status-at-risk">owner not recorded</span>
            )}
          </p>
        </div>
        {system.description ? (
          <p className="mt-1 text-sm leading-6 text-muted-foreground">{system.description}</p>
        ) : null}
        {system.capabilities.length === 0 ? (
          <p className="mt-3 text-sm text-status-unknown">No access, recovery, or administration is recorded.</p>
        ) : (
          <div className="mt-3 space-y-4">
            {system.capabilities.map((capability) => (
              <CapabilityBlock key={capability.capability} capability={capability} />
            ))}
          </div>
        )}
      </div>
    </li>
  );
}

function CapabilityBlock({ capability }: { capability: CapabilityEntry }) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-4">
        <h4 className="text-sm font-medium">
          {CAPABILITY_LABEL[capability.capability]}
          <span className="ms-2 font-mono text-[11px] font-normal text-muted-foreground">
            {capability.mode}
            {capability.confidence !== "verified" ? ` · ${capability.confidence}` : ""}
          </span>
        </h4>
        {capability.status ? <StatusBadge status={capability.status} /> : null}
      </div>
      {capability.mode === "independent" ? (
        <p className="mt-1 text-sm text-muted-foreground">Independent. Nothing else is needed.</p>
      ) : capability.routes.length > 0 ? (
        <table className="mt-1.5 w-full table-fixed text-sm">
          <colgroup>
            <col className="w-6" />
            <col className="w-[46%]" />
            <col />
            <col className="w-20" />
          </colgroup>
          <tbody>
            {capability.routes.map((route, index) => (
              <tr key={`${route.label}-${index}`} className="align-baseline">
                <td className="py-0.5 font-mono text-xs text-muted-foreground">
                  {String.fromCharCode(65 + index)}
                </td>
                <td className="py-0.5 pe-4">{route.label}</td>
                <td className="py-0.5 pe-4 text-muted-foreground">
                  {route.prerequisites.length === 0
                    ? "no prerequisite recorded"
                    : route.prerequisites
                        .map((item) =>
                          item.capability === "access" ? item.name : `${item.name} (${item.capability})`,
                        )
                        .join(route.requirementMode === "ALL" ? " + " : " or ")}
                </td>
                <td
                  className={cn(
                    "py-0.5 text-right font-mono text-[11px]",
                    route.prerequisites.every((item) => item.confidence === "verified")
                      ? "text-muted-foreground"
                      : "text-status-at-risk",
                  )}
                >
                  {route.prerequisites.every((item) => item.confidence === "verified")
                    ? "verified"
                    : route.prerequisites.find((item) => item.confidence !== "verified")?.confidence}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
      {capability.note ? (
        <p className="mt-1 ps-6 font-mono text-[11px] text-status-at-risk">↳ {noteText(capability.note)}</p>
      ) : null}
      <p className={cn("mt-1 ps-6 font-mono text-[11px]", capability.test ? OUTCOME_TONE[capability.test.outcome] : "text-muted-foreground")}>
        {capability.test
          ? capability.test.outcome === "planned"
            ? `test planned — ${capability.test.method}`
            : `tested ${capability.test.outcome} ${capability.test.testedOn ?? ""}${capability.test.tester ? ` · ${capability.test.tester}` : ""}`
          : "not tested"}
      </p>
    </div>
  );
}

const OUTCOME_TONE = {
  planned: "text-muted-foreground",
  passed: "text-status-available",
  failed: "text-status-blocked",
} as const;

function testingLine(book: Runbook) {
  const latest = book.systems.flatMap((system) => system.capabilities).map((item) => item.test?.outcome);
  const passed = latest.filter((item) => item === "passed").length;
  const failed = latest.filter((item) => item === "failed").length;
  const untested = latest.filter((item) => item !== "passed" && item !== "failed").length;
  return `${passed} passed · ${failed} failed · ${untested} of ${latest.length} not tested`;
}

function noteText(note: string) {
  if (note.startsWith("Only one")) return "only recorded route — no alternative modelled";
  if (note.startsWith("Dependent")) return "no route recorded";
  return note.toLowerCase().replace(/\.$/, "");
}

function Section({
  number,
  title,
  children,
}: {
  number: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-10">
      <h2 className="mb-3 flex items-baseline gap-3 text-base font-semibold">
        <span className="font-mono text-sm font-normal text-muted-foreground">{number}</span>
        {title}
      </h2>
      {children}
    </section>
  );
}

function stamp(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
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
