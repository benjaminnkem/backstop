import { sendToAgentChat } from "@agent-native/core/client/agent-chat";
import {
  actionErrorMessage,
  useActionMutation,
  useActionQuery,
} from "@agent-native/core/client/hooks";
import { IconKey, IconMessage, IconRoute } from "@tabler/icons-react";
import { useMemo } from "react";
import { useSearchParams } from "react-router";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { APP_TITLE } from "@/lib/app-config";
import type { WorkspaceMap } from "@shared/recovery";
import type { SimulationRecord } from "@shared/simulation-contract";

const KIND_LABEL: Record<WorkspaceMap["resources"][number]["kind"], string> = {
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

export function meta() {
  return [{ title: `Dependency map — ${APP_TITLE}` }];
}

export default function MapRoute() {
  const [params, setParams] = useSearchParams();
  const workspaceId = params.get("workspace") ?? undefined;
  const simulationId = params.get("simulation") ?? undefined;
  const selectedId = params.get("resource");
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
      toast.error(
        actionErrorMessage(error) ?? "The simulation did not finish.",
      );
    },
  });
  const seed = useActionMutation("seed-northstar", {
    onSuccess: (result) => {
      setParams({ workspace: result.id });
    },
    onError: (error) => {
      toast.error(
        actionErrorMessage(error) ?? "Could not open the sample team.",
      );
    },
  });
  const recordRoute = useActionMutation("add-dependency-route", {
    onError: (error) => {
      toast.error(
        actionErrorMessage(error) ?? "The route was not recorded.",
      );
    },
  });

  if (map.isPending) {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-3 px-6 py-8">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  if (map.isError) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-10">
        <p className="text-base text-[#15372F]">
          {actionErrorMessage(map.error) ??
            "The recovery map could not be loaded."}
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
        <IconKey className="size-8 text-[#15745B]" strokeWidth={1.6} />
        <h1 className="mt-4 text-3xl font-semibold tracking-tight text-[#15372F]">
          Add the first critical service
        </h1>
        <p className="mt-3 text-base leading-7 text-[#15372F]/80">
          Start with the fictional Northstar Studio map. It shows how a phone,
          an email account, and a hardware key depend on each other. Nothing
          here signs in to a live provider.
        </p>
        <Button
          className="mt-6 w-fit bg-[#15745B] text-white hover:bg-[#115C48]"
          disabled={seed.isPending}
          onClick={() => seed.mutate({})}
        >
          {seed.isPending ? "Opening sample team…" : "Explore sample team"}
        </Button>
      </div>
    );
  }

  const simulation =
    run.data?.simulation ??
    latest.data?.simulation ??
    null;
  return (
    <MapDocument
      data={data}
      simulation={simulation}
      running={run.isPending}
      selectedId={selectedId}
      recordingRoute={recordRoute.isPending}
      onRunPhoneLoss={() =>
        run.mutate({
          workspaceId: data.workspace!.id,
          name: "Primary administrator loses phone",
          failed: [{ resourceId: "admin-phone", capability: "access" }],
        })
      }
      onRecordKeyRoute={() =>
        recordRoute.mutate({
          workspaceId: data.workspace!.id,
          resourceId: "workspace-email",
          capability: "access",
          groupSlug: "email-key-route",
          requirementMode: "ALL",
          label: "Independently configured hardware key",
          linkSlug: "l9",
          prerequisiteResourceId: "backup-key",
          prerequisiteCapability: "access",
          confidence: "verified",
        })
      }
      onSelect={(resourceId) => {
        const next = new URLSearchParams(params);
        next.set("workspace", data.workspace!.id);
        if (selectedId === resourceId) next.delete("resource");
        else next.set("resource", resourceId);
        setParams(next);
      }}
    />
  );
}

function MapDocument({
  data,
  simulation,
  running,
  recordingRoute,
  selectedId,
  onRunPhoneLoss,
  onRecordKeyRoute,
  onSelect,
}: {
  data: WorkspaceMap;
  simulation: SimulationRecord | null;
  running: boolean;
  recordingRoute: boolean;
  selectedId: string | null;
  onRunPhoneLoss: () => void;
  onRecordKeyRoute: () => void;
  onSelect: (resourceId: string) => void;
}) {
  const byResource = useMemo(() => indexMap(data), [data]);
  const impacts = useMemo(() => {
    const indexed = new Map<string, SimulationRecord["impacts"][number]>();
    for (const impact of simulation?.impacts ?? []) {
      indexed.set(`${impact.resourceId}/${impact.capability}`, impact);
    }
    return indexed;
  }, [simulation]);
  const highlighted = useMemo(() => {
    const ids = new Set<string>();
    if (!selectedId || !simulation) return ids;
    for (const impact of simulation.impacts) {
      if (impact.resourceId !== selectedId) continue;
      for (const node of impact.causalPath) ids.add(node.resourceId);
    }
    return ids;
  }, [selectedId, simulation]);
  const canRunPhoneLoss = data.resources.some(
    (resource) => resource.slug === "admin-phone",
  );
  const keyRouteRecorded = data.groups.some(
    (group) => group.slug === "email-key-route",
  );
  const canRecordKeyRoute =
    !keyRouteRecorded &&
    data.resources.some((resource) => resource.slug === "workspace-email") &&
    data.resources.some((resource) => resource.slug === "backup-key");
  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-8">
      <p className="text-sm text-[#15745B]">
        {data.workspace?.fictional ? "Fictional team" : "Workspace"}
      </p>
      <h1 className="mt-1 text-3xl font-semibold tracking-tight text-[#15372F]">
        {data.workspace?.name}
      </h1>
      <p className="mt-3 max-w-2xl text-base leading-7 text-[#15372F]/80">
        Each block is one resource. Routes under a capability are alternatives:
        any one route can carry that capability. Inside a route, ALL means every
        prerequisite is required, and ANY means one is enough.
      </p>
      <div className="mt-6 flex flex-col gap-3">
        <div className="flex flex-wrap gap-3">
          <Button
            className="w-fit bg-[#15372F] text-white hover:bg-[#0E2420]"
            disabled={!canRunPhoneLoss || running}
            onClick={onRunPhoneLoss}
          >
            {running
              ? "Evaluating documented paths…"
              : "Lost administrator phone"}
          </Button>
          {canRecordKeyRoute ? (
            <Button
              variant="outline"
              className="w-fit"
              disabled={recordingRoute}
              onClick={onRecordKeyRoute}
            >
              {recordingRoute
                ? "Recording route…"
                : "Record hardware-key route"}
            </Button>
          ) : null}
        </div>
        {simulation ? (
          <SimulationSummary simulation={simulation} />
        ) : (
          <p className="text-sm text-[#15372F]/70">
            Run a failure to see which modelled routes remain. Results stay on
            this workspace.
          </p>
        )}
      </div>
      <ul className="mt-8 flex flex-col gap-3">
        {data.resources.map((resource) => (
          <li key={resource.id}>
            <article
              className={
                selectedId === resource.id
                  ? "rounded-[12px] border border-[#15745B] bg-[#F7F8F5] p-4"
                  : highlighted.has(resource.id)
                    ? "rounded-[12px] border border-[#8A5A00] bg-white p-4"
                    : "rounded-[12px] border border-[#15372F]/15 bg-white p-4"
              }
            >
              <button
                type="button"
                className="flex w-full items-start justify-between gap-4 text-left outline-none focus-visible:ring-2 focus-visible:ring-[#15745B]"
                aria-pressed={selectedId === resource.id}
                onClick={() => onSelect(resource.id)}
              >
                <span>
                  <span className="block text-lg font-medium text-[#15372F]">
                    {resource.name}
                  </span>
                  <span className="mt-1 block text-sm text-[#15372F]/70">
                    {KIND_LABEL[resource.kind]} · {resource.criticality}
                    {resource.ownerLabel ? ` · ${resource.ownerLabel}` : ""}
                  </span>
                </span>
                <IconRoute
                  className="mt-1 size-4 shrink-0 text-[#15745B]"
                  strokeWidth={1.6}
                />
              </button>
              <div className="mt-4 flex flex-col gap-4">
                {(byResource.get(resource.id) ?? []).map((capability) => {
                  const impact = impacts.get(
                    `${resource.id}/${capability.capability}`,
                  );
                  return (
                  <section key={capability.id}>
                    <h2 className="text-sm font-medium text-[#15372F]">
                      {capability.capability} · {capability.mode} ·{" "}
                      {capability.confidence}
                      {impact ? (
                        <StatusWord status={impact.status} />
                      ) : null}
                    </h2>
                    {impact ? (
                      <p className="mt-1 text-sm leading-6 text-[#15372F]/80">
                        {impact.explanation}
                      </p>
                    ) : null}
                    {capability.groups.length === 0 ? (
                      <p className="mt-1 text-sm text-[#15372F]/70">
                        No dependency group is recorded for this capability.
                      </p>
                    ) : (
                      <ol className="mt-2 flex flex-col gap-2">
                        {capability.groups.map((group, index) => (
                          <li key={group.id} className="text-sm text-[#15372F]">
                            {index > 0 ? (
                              <span className="mb-1 block text-[#15745B]">
                                or
                              </span>
                            ) : null}
                            <span className="font-medium">
                              {group.requirementMode}
                            </span>{" "}
                            {group.label}
                            <ul className="mt-1 list-disc ps-5 text-[#15372F]/80">
                              {group.links.map((link) => (
                                <li key={link.id}>
                                  requires {link.prerequisiteName} ·{" "}
                                  {link.prerequisiteCapability} ·{" "}
                                  {link.confidence}
                                </li>
                              ))}
                            </ul>
                          </li>
                        ))}
                      </ol>
                    )}
                  </section>
                  );
                })}
              </div>
            </article>
          </li>
        ))}
      </ul>
      <p className="mt-8 text-sm leading-6 text-[#15372F]/70">
        {data.disclaimer}
      </p>
    </div>
  );
}

function SimulationSummary({ simulation }: { simulation: SimulationRecord }) {
  const { summary } = simulation;
  return (
    <div className="rounded-[12px] border border-[#15372F]/15 bg-[#F7F8F5] px-4 py-3">
      <p className="text-sm font-medium text-[#15372F]">{simulation.name}</p>
      <p className="mt-1 text-sm leading-6 text-[#15372F]/80">
        {summary.blocked} blocked, {summary.available} available,{" "}
        {summary.at_risk} at risk, {summary.unknown} unknown. These counts are
        per capability in the model.
      </p>
      {simulation.warnings.map((warning) => (
        <p key={warning} className="mt-2 text-sm leading-6 text-[#8A5A00]">
          {warning}
        </p>
      ))}
      <p className="mt-2 text-sm text-[#15372F]/70">
        This result stays saved. Editing the map does not rewrite it. Select a
        resource to mark the causal path. A recovery status does not change
        access.
      </p>
      <Button
        variant="outline"
        className="mt-3 w-fit"
        onClick={() => askWhatCausedThis(simulation)}
      >
        <IconMessage className="size-4" strokeWidth={1.6} />
        Ask what caused this
      </Button>
    </div>
  );
}

function askWhatCausedThis(simulation: SimulationRecord) {
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

function StatusWord({ status }: { status: SimulationRecord["impacts"][number]["status"] }) {
  const tone =
    status === "available"
      ? "text-[#15745B]"
      : status === "blocked"
        ? "text-[#9B2C2C]"
        : status === "at_risk"
          ? "text-[#8A5A00]"
          : "text-[#5C6562]";
  const label = status === "at_risk" ? "at risk" : status;
  return <span className={`ms-2 font-semibold ${tone}`}>{label}</span>;
}

function indexMap(data: WorkspaceMap) {
  const names = new Map(data.resources.map((resource) => [resource.id, resource.name]));
  const linksByGroup = new Map<string, WorkspaceMap["links"]>();
  for (const link of data.links) {
    const list = linksByGroup.get(link.groupId) ?? [];
    list.push(link);
    linksByGroup.set(link.groupId, list);
  }
  const groupsByTarget = new Map<string, WorkspaceMap["groups"]>();
  for (const group of data.groups) {
    const key = `${group.resourceId}:${group.capability}`;
    const list = groupsByTarget.get(key) ?? [];
    list.push(group);
    groupsByTarget.set(key, list);
  }
  const byResource = new Map<
    string,
    Array<
      WorkspaceMap["capabilities"][number] & {
        groups: Array<
          WorkspaceMap["groups"][number] & {
            links: Array<
              WorkspaceMap["links"][number] & { prerequisiteName: string }
            >;
          }
        >;
      }
    >
  >();
  for (const capability of data.capabilities) {
    const groups = (
      groupsByTarget.get(`${capability.resourceId}:${capability.capability}`) ??
      []
    ).map((group) => ({
      ...group,
      links: (linksByGroup.get(group.id) ?? []).map((link) => ({
        ...link,
        prerequisiteName:
          names.get(link.prerequisiteResourceId) ?? "Unknown resource",
      })),
    }));
    const list = byResource.get(capability.resourceId) ?? [];
    list.push({ ...capability, groups });
    byResource.set(capability.resourceId, list);
  }
  return byResource;
}
