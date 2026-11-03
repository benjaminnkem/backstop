import {
  actionErrorMessage,
  useActionMutation,
  useActionQuery,
} from "@agent-native/core/client/hooks";
import { IconExternalLink, IconPlus, IconX } from "@tabler/icons-react";
import { useCallback, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router";
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
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useElementWidth } from "@/hooks/use-element-width";
import { APP_TITLE } from "@/lib/app-config";
import { cn } from "@/lib/utils";
import type {
  RemediationTask,
  TaskPriority,
  TaskStatus,
} from "@shared/remediation";
import type { WorkspaceMap } from "@shared/recovery";

const PRIORITY_LABEL: Record<TaskPriority, string> = {
  urgent: "Urgent",
  high: "High",
  medium: "Medium",
  low: "Low",
};
const PRIORITY_TONE: Record<TaskPriority, string> = {
  urgent: "text-status-blocked",
  high: "text-status-at-risk",
  medium: "text-foreground/70",
  low: "text-muted-foreground",
};
const STATUS_LABEL: Record<TaskStatus, string> = {
  open: "Open",
  in_progress: "In progress",
  completed: "Completed",
  dismissed: "Dismissed",
};
const FILTERS: Array<{ id: "active" | TaskStatus | "all"; label: string }> = [
  { id: "active", label: "Active" },
  { id: "completed", label: "Completed" },
  { id: "dismissed", label: "Dismissed" },
  { id: "all", label: "All" },
];
const PRIORITY_RANK: Record<TaskPriority, number> = { urgent: 0, high: 1, medium: 2, low: 3 };
const NONE = "__none__";
const PANE_MIN_WIDTH = 900;

export function meta() {
  return [{ title: `Remediation — ${APP_TITLE}` }];
}

export default function RemediationRoute() {
  const [params, setParams] = useSearchParams();
  const workspaceParam = params.get("workspace") ?? undefined;
  const map = useActionQuery("get-workspace-map", {
    ...(workspaceParam ? { workspaceId: workspaceParam } : {}),
  });
  const workspaceId = map.data?.workspace?.id;
  const tasks = useActionQuery(
    "list-remediation-tasks",
    { ...(workspaceId ? { workspaceId } : {}) },
    { enabled: Boolean(workspaceId) },
  );
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["id"]>("active");
  const [containerRef, width] = useElementWidth<HTMLDivElement>();
  const wide = width === null || width >= PANE_MIN_WIDTH;

  const taskId = params.get("task");
  const creating = params.get("new") === "1" || (!taskId && Boolean(params.get("resource")));
  const selectedTask = tasks.data?.tasks.find((task) => task.id === taskId) ?? null;
  const paneOpen = creating || Boolean(selectedTask);

  const setPane = useCallback(
    (next: { task?: string | null; create?: boolean }) => {
      setParams(
        (previous) => {
          const url = new URLSearchParams(previous);
          url.delete("task");
          url.delete("new");
          if (!next.create) {
            url.delete("resource");
            url.delete("simulation");
          }
          if (next.task) url.set("task", next.task);
          if (next.create) url.set("new", "1");
          return url;
        },
        { replace: true },
      );
    },
    [setParams],
  );

  const visible = useMemo(() => {
    const list = (tasks.data?.tasks ?? []).filter((task) =>
      filter === "all"
        ? true
        : filter === "active"
          ? task.status === "open" || task.status === "in_progress"
          : task.status === filter,
    );
    return list.sort(
      (a, b) =>
        PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] ||
        b.updatedAt.localeCompare(a.updatedAt),
    );
  }, [tasks.data, filter]);

  if (map.isPending) {
    return (
      <div className="mx-auto flex max-w-5xl flex-col gap-3 px-6 py-8">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  if (map.isError || !map.data?.workspace) {
    return (
      <div className="mx-auto max-w-xl px-6 py-16">
        <p className="text-sm text-foreground">
          {map.isError
            ? (actionErrorMessage(map.error) ?? "The workspace could not be loaded.")
            : "No recovery workspace yet."}
        </p>
        <Button asChild variant="outline" className="mt-4">
          <Link to="/map">Open the dependency map</Link>
        </Button>
      </div>
    );
  }

  const data = map.data;
  const pane = paneOpen ? (
    <TaskPane
      key={selectedTask?.id ?? "new"}
      workspaceId={data.workspace!.id}
      resources={data.resources}
      task={creating ? null : selectedTask}
      initialResourceId={params.get("resource")}
      initialSimulationId={params.get("simulation")}
      onClose={() => setPane({})}
      onCreated={(id) => setPane({ task: id })}
    />
  ) : null;

  return (
    <div ref={containerRef} className="flex h-full min-h-0">
      <div className="flex min-w-0 flex-1 flex-col overflow-y-auto">
        <div className="mx-auto w-full max-w-5xl px-6 py-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-xl font-semibold tracking-tight text-foreground">Remediation</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Internal tasks for {data.workspace!.name}. Completing one does not change the map.
              </p>
            </div>
            <Button
              className="bg-ink text-background hover:bg-ink/85"
              onClick={() => setPane({ create: true })}
            >
              <IconPlus className="size-4" />
              New task
            </Button>
          </div>

          <div role="tablist" aria-label="Task status" className="mt-5 flex gap-1 border-b border-border">
            {FILTERS.map((item) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={filter === item.id}
                onClick={() => setFilter(item.id)}
                className={cn(
                  "-mb-px border-b-2 px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  filter === item.id
                    ? "border-brand font-medium text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                {item.label}
              </button>
            ))}
          </div>

          {tasks.isPending ? (
            <div className="mt-4 flex flex-col gap-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : tasks.isError ? (
            <p className="mt-6 text-sm text-status-blocked">
              {actionErrorMessage(tasks.error) ?? "Tasks could not be loaded."}{" "}
              <button type="button" className="underline" onClick={() => tasks.refetch()}>
                Try again
              </button>
            </p>
          ) : visible.length === 0 ? (
            <div className="mt-10 text-center">
              <p className="text-sm text-foreground">
                {filter === "active" ? "No active tasks." : "Nothing here."}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Run a scenario on the map, then record what should change.
              </p>
            </div>
          ) : (
            <table className="mt-2 w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="py-2 pe-3 font-medium">Task</th>
                  <th className="py-2 pe-3 font-medium">Priority</th>
                  <th className="py-2 pe-3 font-medium">Status</th>
                  <th className="hidden py-2 pe-3 font-medium md:table-cell">Related</th>
                  <th className="hidden py-2 font-medium lg:table-cell">Owner</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((task) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    selected={task.id === taskId}
                    onOpen={() => setPane({ task: task.id })}
                  />
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
      {wide ? (
        pane ? (
          <aside className="h-full w-96 shrink-0 overflow-y-auto border-s border-border bg-card">{pane}</aside>
        ) : null
      ) : (
        <Sheet open={paneOpen} onOpenChange={(open) => !open && setPane({})}>
          <SheetContent side="right" className="w-full overflow-y-auto p-0 sm:max-w-md">
            <SheetTitle className="sr-only">{selectedTask?.title ?? "New task"}</SheetTitle>
            {pane}
          </SheetContent>
        </Sheet>
      )}
    </div>
  );
}

function TaskRow({
  task,
  selected,
  onOpen,
}: {
  task: RemediationTask;
  selected: boolean;
  onOpen: () => void;
}) {
  const related = [task.resourceName, task.simulationName].filter(Boolean).join(" · ");
  return (
    <tr
      className={cn(
        "cursor-pointer border-t border-border hover:bg-accent/60",
        selected && "bg-accent",
      )}
      onClick={onOpen}
    >
      <td className="py-2.5 pe-3">
        <button
          type="button"
          className="text-left font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={(event) => {
            event.stopPropagation();
            onOpen();
          }}
        >
          {task.title}
        </button>
      </td>
      <td className="py-2.5 pe-3">
        <span className={cn("font-mono text-xs", PRIORITY_TONE[task.priority])}>
          {task.priority}
        </span>
      </td>
      <td className="py-2.5 pe-3 text-foreground/85">{STATUS_LABEL[task.status]}</td>
      <td className="hidden max-w-64 truncate py-2.5 pe-3 text-muted-foreground md:table-cell">
        {related || "Workspace-wide"}
      </td>
      <td className="hidden py-2.5 text-muted-foreground lg:table-cell">{task.ownerLabel ?? "—"}</td>
    </tr>
  );
}

function TaskPane({
  workspaceId,
  resources,
  task,
  initialResourceId,
  initialSimulationId,
  onClose,
  onCreated,
}: {
  workspaceId: string;
  resources: WorkspaceMap["resources"];
  task: RemediationTask | null;
  initialResourceId: string | null;
  initialSimulationId: string | null;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const [title, setTitle] = useState(task?.title ?? "");
  const [reason, setReason] = useState(task?.reason ?? "");
  const [description, setDescription] = useState(task?.description ?? "");
  const [priority, setPriority] = useState<TaskPriority>(task?.priority ?? "medium");
  const [status, setStatus] = useState<TaskStatus>(task?.status ?? "open");
  const [ownerLabel, setOwnerLabel] = useState(task?.ownerLabel ?? "");
  const [resourceId, setResourceId] = useState<string>(
    task?.resourceId ?? (initialResourceId && resources.some((r) => r.id === initialResourceId) ? initialResourceId : NONE),
  );
  const [simulationId, setSimulationId] = useState<string | null>(
    task ? task.simulationId : initialSimulationId,
  );
  const simulation = useActionQuery(
    "get-simulation",
    { workspaceId, ...(simulationId ? { simulationId } : {}) },
    { enabled: Boolean(simulationId) && !task },
  );
  const simulationName = task ? task.simulationName : simulation.data?.simulation?.name;

  const create = useActionMutation("create-remediation-task", {
    onSuccess: (result) => {
      toast.success("Task recorded. The map was not changed.");
      onCreated(result.id);
    },
    onError: (error) => toast.error(actionErrorMessage(error) ?? "The task was not recorded."),
  });
  const update = useActionMutation("update-remediation-task", {
    onSuccess: () => toast.success("Task updated."),
    onError: (error) => toast.error(actionErrorMessage(error) ?? "The task was not updated."),
  });
  const pending = create.isPending || update.isPending;
  const dirty =
    !task ||
    title !== task.title ||
    reason !== (task.reason ?? "") ||
    description !== (task.description ?? "") ||
    priority !== task.priority ||
    status !== task.status ||
    ownerLabel !== (task.ownerLabel ?? "");

  return (
    <form
      className="flex flex-col"
      onSubmit={(event) => {
        event.preventDefault();
        if (!title.trim() || pending || !dirty) return;
        if (!task) {
          create.mutate({
            workspaceId,
            title: title.trim(),
            priority,
            ...(reason.trim() ? { reason: reason.trim() } : {}),
            ...(description.trim() ? { description: description.trim() } : {}),
            ...(ownerLabel.trim() ? { ownerLabel: ownerLabel.trim() } : {}),
            ...(resourceId !== NONE ? { resourceId } : {}),
            ...(simulationId ? { simulationId } : {}),
          });
        } else {
          update.mutate({
            taskId: task.id,
            title: title.trim(),
            reason: reason.trim(),
            description: description.trim(),
            ownerLabel: ownerLabel.trim(),
            priority,
            status,
          });
        }
      }}
    >
      <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold text-foreground">{task ? "Task" : "New task"}</h2>
        <Button type="button" variant="ghost" size="icon-sm" aria-label="Close" onClick={onClose}>
          <IconX className="size-4" />
        </Button>
      </header>
      <div className="flex flex-col gap-4 px-4 py-4">
        <PaneField label="Title" htmlFor="task-title">
          <Input
            id="task-title"
            value={title}
            maxLength={160}
            placeholder="Confirm the hardware key is held by the backup administrator"
            onChange={(event) => setTitle(event.target.value)}
          />
        </PaneField>
        <PaneField label="Why it matters" htmlFor="task-reason">
          <Textarea
            id="task-reason"
            value={reason}
            maxLength={500}
            rows={3}
            onChange={(event) => setReason(event.target.value)}
          />
        </PaneField>
        <PaneField label="Details" htmlFor="task-description">
          <Textarea
            id="task-description"
            value={description}
            maxLength={1000}
            rows={3}
            onChange={(event) => setDescription(event.target.value)}
          />
        </PaneField>
        <div className="grid grid-cols-2 gap-3">
          <PaneField label="Priority">
            <Select value={priority} onValueChange={(value) => setPriority(value as TaskPriority)}>
              <SelectTrigger aria-label="Priority" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(PRIORITY_LABEL) as TaskPriority[]).map((item) => (
                  <SelectItem key={item} value={item}>
                    {PRIORITY_LABEL[item]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </PaneField>
          <PaneField label="Status">
            <Select
              value={status}
              disabled={!task}
              onValueChange={(value) => setStatus(value as TaskStatus)}
            >
              <SelectTrigger aria-label="Status" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(STATUS_LABEL) as TaskStatus[]).map((item) => (
                  <SelectItem key={item} value={item}>
                    {STATUS_LABEL[item]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </PaneField>
        </div>
        <PaneField label="Owner" htmlFor="task-owner">
          <Input
            id="task-owner"
            value={ownerLabel}
            maxLength={80}
            placeholder="IT lead"
            onChange={(event) => setOwnerLabel(event.target.value)}
          />
        </PaneField>
        <PaneField label="Resource">
          {task ? (
            <p className="text-sm text-foreground">{task.resourceName ?? "Workspace-wide"}</p>
          ) : (
            <Select value={resourceId} onValueChange={setResourceId}>
              <SelectTrigger aria-label="Resource" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Workspace-wide</SelectItem>
                {resources
                  .filter((item) => item.status !== "archived")
                  .map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          )}
        </PaneField>
        {simulationId ? (
          <PaneField label="From simulation">
            <div className="flex items-center justify-between gap-2 text-sm text-foreground">
              <span className="truncate">{simulationName ?? "Saved run"}</span>
              {!task ? (
                <Button type="button" variant="ghost" size="xs" onClick={() => setSimulationId(null)}>
                  Remove
                </Button>
              ) : null}
            </div>
          </PaneField>
        ) : null}

        <p className="rounded-lg bg-status-at-risk-soft px-3 py-2 text-xs leading-5 text-status-at-risk">
          An external change is still required. Marking this complete does not
          change a provider or the map. Record the new route on the map once it exists.
        </p>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="submit"
            className="bg-ink text-background hover:bg-ink/85"
            disabled={!title.trim() || pending || !dirty}
          >
            {pending ? "Saving…" : task ? "Save changes" : "Record task"}
          </Button>
          {task?.resourceId ? (
            <Button asChild type="button" variant="ghost" size="sm">
              <Link to={`/map?workspace=${workspaceId}&resource=${task.resourceId}`}>
                <IconExternalLink className="size-4" />
                Open on map
              </Link>
            </Button>
          ) : null}
        </div>
      </div>
    </form>
  );
}

function PaneField({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={htmlFor} className="text-xs font-medium text-muted-foreground">
        {label}
      </Label>
      {children}
    </div>
  );
}
