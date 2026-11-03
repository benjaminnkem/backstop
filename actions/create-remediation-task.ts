import { defineAction, defineActionErrors } from "@agent-native/core/action";
import { buildDeepLink } from "@agent-native/core/server";
import { assertAccess } from "@agent-native/core/sharing";
import { z } from "zod";

import {
  remediationTaskWriteResultSchema,
  taskPrioritySchema,
} from "../shared/remediation.js";
import {
  createRemediationTask,
  remediationFailure,
} from "../server/domain/remediation.js";

const errors = defineActionErrors("UNAUTHENTICATED", "FORBIDDEN", "VALIDATION_ERROR");

export default defineAction({
  description:
    "Record one internal remediation task. Does not change the dependency map, a saved simulation, or a provider. Call only after the user asks for the task.",
  schema: z.object({
    workspaceId: z
      .string()
      .optional()
      .describe("Recovery workspace id. Omit to use this team's sample map."),
    title: z.string().trim().min(1).max(160).describe("Task title."),
    reason: z
      .string()
      .trim()
      .min(1)
      .max(500)
      .optional()
      .describe("Why this task matters. Do not include credentials."),
    description: z
      .string()
      .trim()
      .min(1)
      .max(1000)
      .optional()
      .describe("Optional detail. Do not include credentials."),
    priority: taskPrioritySchema
      .default("medium")
      .describe("urgent, high, medium, or low."),
    resourceId: z
      .string()
      .optional()
      .describe("Related resource id or slug. Omit when the task is workspace-wide."),
    simulationId: z
      .string()
      .optional()
      .describe("Related saved simulation id. Omit when the task is not about a run."),
    ownerLabel: z
      .string()
      .trim()
      .min(1)
      .max(80)
      .optional()
      .describe("Display label for who should do the work. Not an access grant."),
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
      errors.noWrite("Sign in before recording a remediation task.", "UNAUTHENTICATED", {
        statusCode: 401,
      });
      throw new Error("Not signed in");
    }
    try {
      if (args.workspaceId) {
        await assertAccess("recovery-workspace", args.workspaceId, "editor");
      }
      const saved = await createRemediationTask(
        { userEmail, orgId: ctx?.orgId ?? null },
        args,
      );
      return {
        ...saved,
        _receipt: {
          changed: true,
          verified: true,
          subject: saved.id,
          summary: `Recorded “${saved.title}”. The map was not changed.`,
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
