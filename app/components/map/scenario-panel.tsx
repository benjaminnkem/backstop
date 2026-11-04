import { IconAlertTriangle, IconMessage, IconPlayerPlay } from "@tabler/icons-react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { Capability, WorkspaceMap } from "@shared/recovery";
import type { ResolvedScenario } from "@shared/scenarios";
import type { SimulationRecord } from "@shared/simulation-contract";

import { CAPABILITY_LABEL, type IndexedCapability, type SimStatus } from "./map-model";
import { STATUS_LABEL, StatusBadge } from "./status";

const CUSTOM = "custom";
const STATUS_ORDER: SimStatus[] = ["blocked", "at_risk", "unknown", "available"];

export function ScenarioPanel({
  data,
  indexed,
  scenarios,
  simulation,
  running,
  selectedId,
  onRun,
  onSelectImpact,
  onAsk,
  rail,
  headerAction,
  footer,
}: {
  rail: boolean;
  headerAction?: React.ReactNode;
  footer?: React.ReactNode;
  data: WorkspaceMap;
  indexed: Map<string, IndexedCapability[]>;
  scenarios: ResolvedScenario[];
  simulation: SimulationRecord | null;
  running: boolean;
  selectedId: string | null;
  onRun: (input: {
    name: string;
    failed: { resourceId: string; capability: Capability };
  }) => void;
  onSelectImpact: (resourceId: string, capability: Capability) => void;
  onAsk: (simulation: SimulationRecord) => void;
}) {
  const [choice, setChoice] = useState<string>(scenarios[0]?.id ?? CUSTOM);
  const resources = data.resources.filter((item) => item.status !== "archived");
  const [customResource, setCustomResource] = useState<string>("");
  const [customCapability, setCustomCapability] = useState<Capability | "">("");
  const customCapabilities = customResource
    ? (indexed.get(customResource) ?? []).map((item) => item.capability)
    : [];
  const names = useMemo(
    () => new Map(data.resources.map((item) => [item.id, item.name])),
    [data.resources],
  );

  const preset = scenarios.find((item) => item.id === choice);
  const pending: { name: string; failed: { resourceId: string; capability: Capability } } | null =
    preset
      ? { name: preset.name, failed: preset.failed }
      : customResource && customCapability
        ? {
            name: `${names.get(customResource) ?? "Resource"} ${CAPABILITY_LABEL[customCapability].toLowerCase()} unavailable`,
            failed: { resourceId: customResource, capability: customCapability },
          }
        : null;

  const impacts = useMemo(() => {
    const list = [...(simulation?.impacts ?? [])].filter(
      (item) => item.status !== "available",
    );
    list.sort(
      (a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status),
    );
    return list;
  }, [simulation]);

  return (
    <aside
      className={cn(
        "flex flex-col bg-background",
        rail
          ? "h-full w-80 shrink-0 overflow-y-auto border-e border-border"
          : "w-full border-b border-border",
      )}
    >
      <div className="border-b border-border px-4 py-4">
        <div className="flex items-start justify-between gap-2">
          <h1 className="text-lg font-semibold tracking-tight text-foreground">
            {data.workspace?.name}
          </h1>
          {headerAction}
        </div>
        {data.workspace?.fictional ? (
          <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">fictional sample</p>
        ) : null}
      </div>

      <section className="border-b border-border px-4 py-4" aria-labelledby="scenario-heading">
        <h2 id="scenario-heading" className="text-sm font-semibold text-foreground">
          Failure scenario
        </h2>
        <div role="radiogroup" aria-labelledby="scenario-heading" className="mt-3 flex flex-col gap-1">
          {scenarios.map((item) => (
            <ScenarioOption
              key={item.id}
              checked={choice === item.id}
              label={item.name}
              hint={item.summary}
              onSelect={() => setChoice(item.id)}
            />
          ))}
          <ScenarioOption
            checked={choice === CUSTOM}
            label="Custom"
            hint="Choose one resource and capability."
            onSelect={() => setChoice(CUSTOM)}
          />
        </div>
        {choice === CUSTOM ? (
          <div className="mt-3 grid grid-cols-[1fr_auto] gap-2">
            <Select
              value={customResource}
              onValueChange={(value) => {
                setCustomResource(value);
                const first = (indexed.get(value) ?? [])[0]?.capability ?? "";
                setCustomCapability(first);
              }}
            >
              <SelectTrigger aria-label="Resource" className="h-8 w-full text-xs">
                <SelectValue placeholder="Resource" />
              </SelectTrigger>
              <SelectContent>
                {resources.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={customCapability}
              disabled={customCapabilities.length === 0}
              onValueChange={(value) => setCustomCapability(value as Capability)}
            >
              <SelectTrigger aria-label="Capability" className="h-8 w-28 text-xs">
                <SelectValue placeholder="Capability" />
              </SelectTrigger>
              <SelectContent>
                {customCapabilities.map((item) => (
                  <SelectItem key={item} value={item}>
                    {CAPABILITY_LABEL[item]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}
        <p className="mt-3 text-xs leading-5 text-muted-foreground">
          {pending ? (
            <>
              Assumed unavailable:{" "}
              <span className="font-medium text-foreground">
                {names.get(pending.failed.resourceId)} ·{" "}
                {CAPABILITY_LABEL[pending.failed.capability].toLowerCase()}
              </span>
            </>
          ) : (
            "Choose what to assume unavailable."
          )}
        </p>
        <Button
          className="mt-3 w-full bg-ink text-background hover:bg-ink/85"
          disabled={!pending || running}
          onClick={() => pending && onRun(pending)}
        >
          <IconPlayerPlay className="size-4" strokeWidth={1.8} />
          {running ? "Evaluating documented paths…" : "Run simulation"}
        </Button>
      </section>

      {simulation ? (
        <section className="flex flex-col gap-3 px-4 py-4" aria-labelledby="result-heading">
          <div>
            <h2 id="result-heading" className="text-sm font-semibold text-foreground">
              {simulation.name}
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Saved {formatTime(simulation.createdAt)} · counts are per capability
            </p>
          </div>
          <p className="font-mono text-xs leading-5 text-foreground">
            {STATUS_ORDER.map((status, index) => (
              <span key={status}>
                {index > 0 ? <span className="text-muted-foreground"> · </span> : null}
                <span
                  className={
                    status === "blocked" && simulation.summary.blocked > 0
                      ? "text-status-blocked"
                      : status === "at_risk" && simulation.summary.at_risk > 0
                        ? "text-status-at-risk"
                        : undefined
                  }
                >
                  {simulation.summary[status]} {STATUS_LABEL[status].toLowerCase()}
                </span>
              </span>
            ))}
          </p>
          {simulation.warnings.map((warning) => (
            <p
              key={warning}
              className="flex gap-2 rounded-lg bg-status-at-risk-soft px-2.5 py-2 text-xs leading-5 text-status-at-risk"
            >
              <IconAlertTriangle className="mt-0.5 size-3.5 shrink-0" strokeWidth={1.8} />
              {warning}
            </p>
          ))}
          {impacts.length > 0 ? (
            <ul className="flex flex-col gap-0.5" aria-label="Affected capabilities">
              {impacts.map((impact) => (
                <li key={`${impact.resourceId}/${impact.capability}`}>
                  <button
                    type="button"
                    onClick={() => onSelectImpact(impact.resourceId, impact.capability)}
                    className={cn(
                      "flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      selectedId === impact.resourceId && "bg-accent",
                    )}
                  >
                    <span className="min-w-0 truncate text-foreground">
                      {impact.name}
                      <span className="text-muted-foreground">
                        {" "}
                        · {CAPABILITY_LABEL[impact.capability].toLowerCase()}
                      </span>
                    </span>
                    <StatusBadge status={impact.status} />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-muted-foreground">
              Every modelled capability keeps an available route.
            </p>
          )}
          <Button variant="outline" size="sm" className="w-full" onClick={() => onAsk(simulation)}>
            <IconMessage className="size-4" strokeWidth={1.6} />
            Ask agent to explain
          </Button>
        </section>
      ) : (
        <p className="px-4 py-4 text-xs leading-5 text-muted-foreground">
          Run a scenario to see which modelled routes remain. Each run is saved
          and stays unchanged when the map is edited.
        </p>
      )}

      {footer}
      <p className="mt-auto border-t border-border px-4 py-3 text-[11px] leading-4 text-muted-foreground">
        {data.disclaimer} Statuses describe the model, not a live provider.
      </p>
    </aside>
  );
}

function ScenarioOption({
  checked,
  label,
  hint,
  onSelect,
}: {
  checked: boolean;
  label: string;
  hint: string;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      onClick={onSelect}
      className={cn(
        "flex items-start gap-2.5 rounded-lg border px-2.5 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        checked ? "border-border bg-accent" : "border-transparent hover:bg-accent/60",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "mt-0.5 flex size-3.5 shrink-0 items-center justify-center rounded-full border",
          checked ? "border-foreground" : "border-muted-foreground/50",
        )}
      >
        {checked ? <span className="size-1.5 rounded-full bg-foreground" /> : null}
      </span>
      <span className="min-w-0">
        <span className="block text-xs font-medium text-foreground">{label}</span>
        <span className="block text-[11px] leading-4 text-muted-foreground">{hint}</span>
      </span>
    </button>
  );
}

function formatTime(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
