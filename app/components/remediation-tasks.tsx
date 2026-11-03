import {
  actionErrorMessage,
  useActionMutation,
  useActionQuery,
} from "@agent-native/core/client/hooks";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { TaskPriority, TaskStatus } from "@shared/remediation";

const PRIORITY_LABEL: Record<TaskPriority, string> = {
  urgent: "Urgent",
  high: "High",
  medium: "Medium",
  low: "Low",
};

const STATUS_LABEL: Record<TaskStatus, string> = {
  open: "Open",
  in_progress: "In progress",
  completed: "Completed",
  dismissed: "Dismissed",
};

export function RemediationTasks({
  workspaceId,
  simulationId,
  resourceId,
}: {
  workspaceId: string;
  simulationId?: string | undefined;
  resourceId?: string | undefined;
}) {
  const tasks = useActionQuery("list-remediation-tasks", { workspaceId });
  const [title, setTitle] = useState("");
  const [reason, setReason] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const create = useActionMutation("create-remediation-task", {
    onSuccess: () => {
      setTitle("");
      setReason("");
    },
    onError: (error) => {
      toast.error(actionErrorMessage(error) ?? "The task was not recorded.");
    },
  });
  const update = useActionMutation("update-remediation-task", {
    onError: (error) => {
      toast.error(actionErrorMessage(error) ?? "The task was not updated.");
    },
  });

  return (
    <section className="mt-10">
      <h2 className="text-xl font-semibold tracking-tight text-[#15372F]">
        Remediation
      </h2>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-[#15372F]/75">
        A task is an internal note. Completing it does not change the map or a
        saved simulation. A provider change still has to be recorded as its own
        route.
      </p>
      <form
        className="mt-4 flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          const nextTitle = title.trim();
          if (!nextTitle || create.isPending) return;
          create.mutate({
            workspaceId,
            title: nextTitle,
            priority,
            ...(reason.trim() ? { reason: reason.trim() } : {}),
            ...(simulationId ? { simulationId } : {}),
            ...(resourceId ? { resourceId } : {}),
          });
        }}
      >
        <div className="flex flex-col gap-2">
          <Label htmlFor="remediation-title">Task</Label>
          <Input
            id="remediation-title"
            value={title}
            maxLength={160}
            placeholder="Confirm the hardware key is held by the backup administrator"
            onChange={(event) => setTitle(event.target.value)}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="remediation-reason">Why it matters</Label>
          <Input
            id="remediation-reason"
            value={reason}
            maxLength={500}
            onChange={(event) => setReason(event.target.value)}
          />
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-2">
            <Label htmlFor="remediation-priority">Priority</Label>
            <select
              id="remediation-priority"
              className="h-9 rounded-[10px] border border-[#15372F]/20 bg-white px-2 text-sm text-[#15372F]"
              value={priority}
              onChange={(event) => setPriority(event.target.value as TaskPriority)}
            >
              {(Object.keys(PRIORITY_LABEL) as TaskPriority[]).map((item) => (
                <option key={item} value={item}>
                  {PRIORITY_LABEL[item]}
                </option>
              ))}
            </select>
          </div>
          <Button
            type="submit"
            className="bg-[#15372F] text-white hover:bg-[#0E2420]"
            disabled={!title.trim() || create.isPending}
          >
            {create.isPending ? "Recording task…" : "Create remediation"}
          </Button>
        </div>
      </form>
      {tasks.isPending ? (
        <p className="mt-4 text-sm text-[#15372F]/70">Loading tasks…</p>
      ) : tasks.isError ? (
        <p className="mt-4 text-sm text-[#9B2C2C]">
          {actionErrorMessage(tasks.error) ?? "Tasks could not be loaded."}
        </p>
      ) : tasks.data.tasks.length === 0 ? (
        <p className="mt-4 text-sm text-[#15372F]/70">No remediation tasks yet.</p>
      ) : (
        <ul className="mt-4 flex flex-col gap-3">
          {tasks.data.tasks.map((task) => (
            <li
              key={task.id}
              className="rounded-[12px] border border-[#15372F]/15 bg-white p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-medium text-[#15372F]">{task.title}</p>
                  <p className="mt-1 text-sm text-[#15372F]/70">
                    {PRIORITY_LABEL[task.priority]}
                    {task.resourceName ? ` · ${task.resourceName}` : ""}
                    {task.simulationName ? ` · ${task.simulationName}` : ""}
                  </p>
                  {task.reason ? (
                    <p className="mt-2 text-sm leading-6 text-[#15372F]/80">
                      {task.reason}
                    </p>
                  ) : null}
                </div>
                <label className="text-sm text-[#15372F]">
                  <span className="sr-only">Status for {task.title}</span>
                  <select
                    className="h-9 rounded-[10px] border border-[#15372F]/20 bg-white px-2"
                    value={task.status}
                    disabled={update.isPending}
                    onChange={(event) =>
                      update.mutate({
                        taskId: task.id,
                        status: event.target.value as TaskStatus,
                      })
                    }
                  >
                    {(Object.keys(STATUS_LABEL) as TaskStatus[]).map((item) => (
                      <option key={item} value={item}>
                        {STATUS_LABEL[item]}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
