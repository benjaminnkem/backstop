import { z } from "zod";

export const taskPrioritySchema = z.enum(["urgent", "high", "medium", "low"]);
export const taskStatusSchema = z.enum([
  "open",
  "in_progress",
  "completed",
  "dismissed",
]);

export type TaskPriority = z.infer<typeof taskPrioritySchema>;
export type TaskStatus = z.infer<typeof taskStatusSchema>;

const receiptSchema = z
  .object({
    changed: z.boolean(),
    verified: z.union([z.boolean(), z.literal("unverified")]),
    summary: z.string(),
    subject: z.string().optional(),
  })
  .optional();

export const remediationTaskSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  reason: z.string().nullable(),
  priority: taskPrioritySchema,
  status: taskStatusSchema,
  ownerLabel: z.string().nullable(),
  resourceId: z.string().nullable(),
  resourceName: z.string().nullable(),
  simulationId: z.string().nullable(),
  simulationName: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const listRemediationTasksResultSchema = z.object({
  workspaceId: z.string(),
  tasks: z.array(remediationTaskSchema),
});

export const remediationTaskWriteResultSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  title: z.string(),
  status: taskStatusSchema,
  priority: taskPrioritySchema,
  _receipt: receiptSchema,
});

export type RemediationTask = z.infer<typeof remediationTaskSchema>;
