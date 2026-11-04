import {
  actionErrorMessage,
  useActionMutation,
  useActionQuery,
} from "@agent-native/core/client/hooks";
import { IconChecklist, IconPlus, IconRoute, IconX } from "@tabler/icons-react";
import { useState } from "react";
import { Link } from "react-router";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { Capability, Confidence, RequirementMode } from "@shared/recovery";
import { slugFromName } from "@shared/slugs";

import {
  CAPABILITY_LABEL,
  key,
  KIND_LABEL,
  type Impact,
  type IndexedCapability,
  type MapResource,
} from "./map-model";
import { RecoveryTestsPanel } from "./recovery-tests-panel";
import { ConfidenceTag, StatusBadge } from "./status";

export function Inspector({
  workspaceId,
  simulationId,
  resource,
  resources,
  indexed,
  impacts,
  focusCapability,
  onFocusCapability,
  onClose,
  onSelect,
}: {
  workspaceId: string;
  simulationId: string | undefined;
  resource: MapResource;
  resources: MapResource[];
  indexed: Map<string, IndexedCapability[]>;
  impacts: Map<string, Impact>;
  focusCapability: Capability | null;
  onFocusCapability: (capability: Capability | null) => void;
  onClose: () => void;
  onSelect: (resourceId: string) => void;
}) {
  const capabilities = indexed.get(resource.id) ?? [];
  const tasks = useActionQuery("list-remediation-tasks", { workspaceId });
  const removeRoute = useActionMutation("remove-dependency-route", {
    onSuccess: (result) => toast.success(`Removed “${result.label}”. Run the scenario again to see the effect.`),
    onError: (error) => toast.error(actionErrorMessage(error) ?? "The route was not removed."),
  });
  const archive = useActionMutation("set-resource-archived", {
    onSuccess: (result) => {
      toast.success(
        result.dependentRoutes > 0
          ? `Archived ${result.name}. ${result.dependentRoutes} route${result.dependentRoutes === 1 ? " needs" : "s need"} it and will evaluate as unknown.`
          : `Archived ${result.name}.`,
      );
      onClose();
    },
    onError: (error) => toast.error(actionErrorMessage(error) ?? "The resource was not archived."),
  });
  const [confirmArchive, setConfirmArchive] = useState(false);
  const dependentCount = new Set(
    [...indexed.values()]
      .flat()
      .flatMap((capability) => capability.groups)
      .filter((group) => group.links.some((link) => link.prerequisiteResourceId === resource.id))
      .map((group) => group.id),
  ).size;
  const resourceTasks = (tasks.data?.tasks ?? []).filter(
    (task) =>
      task.resourceId === resource.id &&
      (task.status === "open" || task.status === "in_progress"),
  );
  const taskParams = new URLSearchParams({ workspace: workspaceId, resource: resource.id });
  if (simulationId) taskParams.set("simulation", simulationId);

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <h2 className="truncate text-base font-semibold text-foreground">{resource.name}</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {KIND_LABEL[resource.kind]} · {resource.criticality}
            {resource.ownerLabel ? ` · ${resource.ownerLabel}` : ""}
          </p>
        </div>
        <Button variant="ghost" size="icon-sm" aria-label="Close inspector" onClick={onClose}>
          <IconX className="size-4" />
        </Button>
      </header>

      <div className="flex-1 overflow-y-auto">
        {resource.description ? (
          <p className="border-b border-border px-4 py-3 text-sm leading-6 text-foreground/85">
            {resource.description}
          </p>
        ) : null}

        {capabilities.length === 0 ? (
          <p className="px-4 py-4 text-sm text-muted-foreground">
            No access, recovery, or administration capability is recorded yet.
          </p>
        ) : (
          capabilities.map((capability) => (
            <CapabilitySection
              key={capability.id}
              capability={capability}
              impact={impacts.get(key(resource.id, capability.capability)) ?? null}
              focused={focusCapability === capability.capability}
              onFocus={() =>
                onFocusCapability(
                  focusCapability === capability.capability ? null : capability.capability,
                )
              }
              onSelect={onSelect}
              onRemoveRoute={async (groupId) => {
                await removeRoute.mutateAsync({ workspaceId, groupId });
              }}
            />
          ))
        )}

        <AddRouteForm
          workspaceId={workspaceId}
          resource={resource}
          capabilities={capabilities}
          resources={resources}
          indexed={indexed}
        />

        <RecoveryTestsPanel
          workspaceId={workspaceId}
          resource={resource}
          capabilities={capabilities}
        />

        <section className="px-4 py-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground">Open tasks</h3>
            <Button asChild variant="ghost" size="xs">
              <Link to={`/remediation?${taskParams.toString()}`}>
                <IconChecklist className="size-3" />
                New task
              </Link>
            </Button>
          </div>
          {resourceTasks.length === 0 ? (
            <p className="mt-2 text-xs text-muted-foreground">No open tasks for this resource.</p>
          ) : (
            <ul className="mt-2 flex flex-col gap-1.5">
              {resourceTasks.map((task) => (
                <li key={task.id}>
                  <Link
                    to={`/remediation?workspace=${workspaceId}&task=${task.id}`}
                    className="block rounded-md border border-border px-2.5 py-1.5 text-xs text-foreground hover:bg-accent"
                  >
                    {task.title}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="border-t border-border px-4 py-4">
          {confirmArchive ? (
            <div className="flex flex-col gap-2">
              <p className="text-xs leading-5 text-foreground">
                Archive {resource.name}? It leaves the map, the runbook and future runs.
                {dependentCount > 0
                  ? ` ${dependentCount} route${dependentCount === 1 ? " needs" : "s need"} it and will evaluate as unknown.`
                  : ""}{" "}
                Saved runs stay as they are. You can restore it later.
              </p>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline-destructive"
                  disabled={archive.isPending}
                  onClick={() => archive.mutate({ workspaceId, resourceId: resource.id, archived: true })}
                >
                  {archive.isPending ? "Archiving…" : "Archive"}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setConfirmArchive(false)}>
                  Keep it
                </Button>
              </div>
            </div>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground"
              onClick={() => setConfirmArchive(true)}
            >
              Archive resource
            </Button>
          )}
        </section>
      </div>
    </div>
  );
}

function CapabilitySection({
  capability,
  impact,
  focused,
  onFocus,
  onSelect,
  onRemoveRoute,
}: {
  capability: IndexedCapability;
  impact: Impact | null;
  focused: boolean;
  onFocus: () => void;
  onSelect: (resourceId: string) => void;
  onRemoveRoute: (groupId: string) => Promise<void>;
}) {
  return (
    <section className="border-b border-border px-4 py-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          {CAPABILITY_LABEL[capability.capability]}
          <span className="text-xs font-normal text-muted-foreground">{capability.mode}</span>
          <ConfidenceTag confidence={capability.confidence} />
        </h3>
        {impact ? <StatusBadge status={impact.status} /> : null}
      </div>
      {impact ? (
        <>
          <p className="mt-2 text-sm leading-6 text-foreground/85">{impact.explanation}</p>
          {impact.causalPath.some(
            (node) =>
              node.resourceId !== impact.resourceId ||
              node.capability !== impact.capability,
          ) ? (
            <div className="mt-2">
              <Button
                variant="outline"
                size="xs"
                aria-pressed={focused}
                onClick={onFocus}
                className={cn(focused && "border-path text-foreground")}
              >
                <IconRoute className="size-3" />
                {focused ? "Showing path on map" : "Show path on map"}
              </Button>
              {focused ? (
                <ol className="mt-2 flex flex-wrap items-center gap-1 text-xs">
                  {impact.causalPath.map((node, index) => (
                    <li key={`${node.resourceId}/${node.capability}/${index}`} className="flex items-center gap-1">
                      {index > 0 ? <span className="text-muted-foreground">←</span> : null}
                      <button
                        type="button"
                        className="rounded border border-path/50 bg-path/10 px-1.5 py-0.5 text-foreground hover:bg-path/20"
                        onClick={() => onSelect(node.resourceId)}
                      >
                        {node.name} · {CAPABILITY_LABEL[node.capability].toLowerCase()}
                      </button>
                    </li>
                  ))}
                </ol>
              ) : null}
            </div>
          ) : null}
        </>
      ) : null}
      {capability.mode !== "dependent" ? (
        <p className="mt-2 text-xs text-muted-foreground">
          {capability.mode === "independent"
            ? "Independent: no prerequisite route is needed."
            : "How this works is not recorded, so it stays unknown."}
        </p>
      ) : capability.groups.length === 0 ? (
        <p className="mt-2 text-xs text-status-unknown">
          Dependent, but no route is recorded. Add one below.
        </p>
      ) : (
        <ol className="mt-3 flex flex-col gap-1.5" aria-label="Routes">
          {capability.groups.map((group, index) => (
            <li key={group.id}>
              {index > 0 ? (
                <p className="my-1 ps-2.5 font-mono text-[11px] text-muted-foreground">or</p>
              ) : null}
              <div className="rounded-lg border border-border bg-canvas px-2.5 py-2">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-xs text-foreground">
                    <span className="me-2 font-mono text-[10px] text-muted-foreground">
                      {group.requirementMode}
                    </span>
                    {group.label}
                  </p>
                  <RemoveRoute groupId={group.id} label={group.label} onRemove={onRemoveRoute} />
                </div>
                <ul className="mt-1.5 flex flex-col gap-1">
                  {group.links.map((link) => (
                    <li key={link.id} className="flex items-center justify-between gap-2 text-xs">
                      <button
                        type="button"
                        className="truncate text-left text-foreground/85 underline-offset-2 hover:underline"
                        onClick={() => onSelect(link.prerequisiteResourceId)}
                      >
                        needs {link.prerequisiteName} ·{" "}
                        {CAPABILITY_LABEL[link.prerequisiteCapability].toLowerCase()}
                      </button>
                      <ConfidenceTag confidence={link.confidence} />
                    </li>
                  ))}
                </ul>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function RemoveRoute({
  groupId,
  label,
  onRemove,
}: {
  groupId: string;
  label: string;
  onRemove: (groupId: string) => Promise<void>;
}) {
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  if (!confirming) {
    return (
      <button
        type="button"
        aria-label={`Remove route ${label}`}
        className="shrink-0 text-[11px] text-muted-foreground hover:text-foreground"
        onClick={() => setConfirming(true)}
      >
        Remove
      </button>
    );
  }
  return (
    <span className="flex shrink-0 items-center gap-2 text-[11px]">
      <button
        type="button"
        disabled={pending}
        className="font-medium text-status-blocked hover:underline"
        onClick={async () => {
          setPending(true);
          try {
            await onRemove(groupId);
          } catch {
            // The mutation's own error handler reports the failure.
          } finally {
            setPending(false);
            setConfirming(false);
          }
        }}
      >
        {pending ? "Removing…" : "Confirm"}
      </button>
      <button type="button" className="text-muted-foreground" onClick={() => setConfirming(false)}>
        Cancel
      </button>
    </span>
  );
}

function AddRouteForm({
  workspaceId,
  resource,
  capabilities,
  resources,
  indexed,
}: {
  workspaceId: string;
  resource: MapResource;
  capabilities: IndexedCapability[];
  resources: MapResource[];
  indexed: Map<string, IndexedCapability[]>;
}) {
  const dependent = capabilities.filter((item) => item.mode === "dependent");
  const [open, setOpen] = useState(false);
  const [capability, setCapability] = useState<Capability | "">(
    dependent[0]?.capability ?? "",
  );
  const [label, setLabel] = useState("");
  const [mode, setMode] = useState<RequirementMode>("ALL");
  const [prerequisite, setPrerequisite] = useState("");
  const [prerequisiteCapability, setPrerequisiteCapability] = useState<Capability | "">("");
  const [confidence, setConfidence] = useState<Confidence>("assumed");
  const record = useActionMutation("add-dependency-route", {
    onSuccess: () => {
      toast.success("Route recorded. Run the scenario again to see its effect.");
      setLabel("");
      setPrerequisite("");
      setPrerequisiteCapability("");
      setOpen(false);
    },
    onError: (error) => {
      toast.error(actionErrorMessage(error) ?? "The route was not recorded.");
    },
  });
  const prerequisiteOptions = resources.filter(
    (item) => item.id !== resource.id && item.status !== "archived",
  );
  const prerequisiteCapabilities = prerequisite
    ? (indexed.get(prerequisite) ?? []).map((item) => item.capability)
    : [];
  const ready = capability && label.trim() && prerequisite && prerequisiteCapability;

  if (dependent.length === 0) return null;

  if (!open) {
    return (
      <div className="border-b border-border px-4 py-3">
        <Button variant="outline" size="sm" className="w-full" onClick={() => setOpen(true)}>
          <IconPlus className="size-4" />
          Add a route
        </Button>
      </div>
    );
  }

  return (
    <form
      className="flex flex-col gap-3 border-b border-border px-4 py-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (!ready || record.isPending) return;
        const base = safeSlug(label);
        const suffix = Math.random().toString(36).slice(2, 6);
        record.mutate({
          workspaceId,
          resourceId: resource.id,
          capability,
          groupSlug: `${base}-${suffix}`,
          linkSlug: `${base}-${suffix}-link`,
          requirementMode: mode,
          label: label.trim(),
          prerequisiteResourceId: prerequisite,
          prerequisiteCapability,
          confidence,
        });
      }}
    >
      <div>
        <h3 className="text-sm font-semibold text-foreground">Add a route</h3>
        <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
          Record a route that already exists. Recording it here does not change the provider.
        </p>
      </div>
      <Field label="Carries">
        <Select value={capability} onValueChange={(value) => setCapability(value as Capability)}>
          <SelectTrigger aria-label="Capability this route carries" className="h-8 w-full text-xs">
            <SelectValue placeholder="Capability" />
          </SelectTrigger>
          <SelectContent>
            {dependent.map((item) => (
              <SelectItem key={item.capability} value={item.capability}>
                {CAPABILITY_LABEL[item.capability]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <Field label="Route label" htmlFor="route-label">
        <Input
          id="route-label"
          value={label}
          maxLength={160}
          placeholder="Independently configured hardware key"
          className="h-8 text-xs"
          onChange={(event) => setLabel(event.target.value)}
        />
      </Field>
      <div className="grid grid-cols-[1fr_auto] gap-2">
        <Field label="Needs">
          <Select
            value={prerequisite}
            onValueChange={(value) => {
              setPrerequisite(value);
              setPrerequisiteCapability((indexed.get(value) ?? [])[0]?.capability ?? "");
            }}
          >
            <SelectTrigger aria-label="Prerequisite resource" className="h-8 w-full text-xs">
              <SelectValue placeholder="Resource" />
            </SelectTrigger>
            <SelectContent>
              {prerequisiteOptions.map((item) => (
                <SelectItem key={item.id} value={item.id}>
                  {item.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Capability">
          <Select
            value={prerequisiteCapability}
            disabled={prerequisiteCapabilities.length === 0}
            onValueChange={(value) => setPrerequisiteCapability(value as Capability)}
          >
            <SelectTrigger aria-label="Prerequisite capability" className="h-8 w-28 text-xs">
              <SelectValue placeholder="—" />
            </SelectTrigger>
            <SelectContent>
              {prerequisiteCapabilities.map((item) => (
                <SelectItem key={item} value={item}>
                  {CAPABILITY_LABEL[item]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Requires">
          <Select value={mode} onValueChange={(value) => setMode(value as RequirementMode)}>
            <SelectTrigger aria-label="Requirement mode" className="h-8 w-full text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">ALL prerequisites</SelectItem>
              <SelectItem value="ANY">ANY prerequisite</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="Confidence">
          <Select value={confidence} onValueChange={(value) => setConfidence(value as Confidence)}>
            <SelectTrigger aria-label="Confidence" className="h-8 w-full text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="verified">Verified</SelectItem>
              <SelectItem value="assumed">Assumed</SelectItem>
              <SelectItem value="unknown">Unknown</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      </div>
      <div className="flex gap-2">
        <Button
          type="submit"
          size="sm"
          className="flex-1 bg-ink text-background hover:bg-ink/85"
          disabled={!ready || record.isPending}
        >
          {record.isPending ? "Recording route…" : "Record route"}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <Label htmlFor={htmlFor} className="text-[11px] font-medium text-muted-foreground">
        {label}
      </Label>
      {children}
    </div>
  );
}

function safeSlug(label: string) {
  try {
    return slugFromName(label).slice(0, 48);
  } catch {
    return "route";
  }
}
