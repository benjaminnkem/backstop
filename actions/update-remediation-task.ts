import { defineAction, defineActionErrors } from "@agent-native/core/action";
import { buildDeepLink } from "@agent-native/core/server";
import { z } from "zod";

import {
  remediationTaskWriteResultSchema,
  taskPrioritySchema,
  taskStatusSchema,
} from "../shared/remediation.js";
import {
  updateRemediationTask,
  remediationFailure,
} from "../server/domain/remediation.js";

const errors = defineActionErrors("UNAUTHENTICATED", "FORBIDDEN", "VALIDATION_ERROR");

export default defineAction({
  description:
    "Update a remediation task's title, reason, priority, owner label, or status. Does not change the dependency map or a saved simulation.",
  schema: z.object({
    taskId: z.string().describe("Remediation task id."),
    title: z.string().trim().min(1).max(160).optional(),
    reason: z.string().trim().max(500).optional(),
    description: z.string().trim().max(1000).optional(),
    priority: taskPrioritySchema.optional(),
    status: taskStatusSchema
      .optional()
      .describe("open, in_progress, completed, or dismissed."),
    ownerLabel: z.string().trim().max(80).optional(),
  }),
  outputSchema: remediationTaskWriteResultSchema,
  errors,
  link: ({ result }) => ({
    url: buildDeepLink({
      app: "backstop",
      view: "map",
      params: { workspace: result.workspaceId },
    }),
    label: result.title,
  }),
  run: async (args, ctx) => {
    const userEmail = ctx?.userEmail;
    if (!userEmail) {
      errors.noWrite("Sign in before updating a remediation task.", "UNAUTHENTICATED", {
        statusCode: 401,
      });
      throw new Error("Not signed in");
    }
    try {
      // updateRemediationTask asserts editor access before writing.
      const saved = await updateRemediationTask(args);
      return {
        ...saved,
        _receipt: {
          changed: true,
          verified: true,
          subject: saved.id,
          summary: `Updated “${saved.title}” to ${saved.status}. The map was not changed.`,
        },
      };
    } catch (error) {
      const failure = remediationFailure(error);
      if (failure) {
        errors.noWrite(failure.message, failure.code, {
          statusCode: failure.statusCode,
        });
      }
      throw error;
    }
  },
});
