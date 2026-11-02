import {
  actionErrorMessage,
  useActionMutation,
  useActionQuery,
} from "@agent-native/core/client/hooks";
import { IconKey, IconRoute } from "@tabler/icons-react";
import { useMemo } from "react";
import { useSearchParams } from "react-router";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { APP_TITLE } from "@/lib/app-config";
import type { WorkspaceMap } from "@shared/recovery";

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
  const selectedId = params.get("resource");
  const map = useActionQuery("get-workspace-map", {
    ...(workspaceId ? { workspaceId } : {}),
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

  return (
    <MapDocument
      data={data}
      selectedId={selectedId}
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
  selectedId,
  onSelect,
}: {
  data: WorkspaceMap;
  selectedId: string | null;
  onSelect: (resourceId: string) => void;
}) {
  const byResource = useMemo(() => indexMap(data), [data]);
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
      <ul className="mt-8 flex flex-col gap-3">
        {data.resources.map((resource) => (
          <li key={resource.id}>
            <article
              className={
                selectedId === resource.id
                  ? "rounded-[12px] border border-[#15745B] bg-[#F7F8F5] p-4"
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
                {(byResource.get(resource.id) ?? []).map((capability) => (
                  <section key={capability.id}>
                    <h2 className="text-sm font-medium text-[#15372F]">
                      {capability.capability} · {capability.mode} ·{" "}
                      {capability.confidence}
                    </h2>
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
                ))}
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
