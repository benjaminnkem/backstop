import { defineAction, defineActionErrors } from "@agent-native/core/action";
import { assertAccess } from "@agent-native/core/sharing";
import { z } from "zod";

import {
  listRemediationTasksResultSchema,
  taskStatusSchema,
} from "../shared/remediation.js";
import {
  listRemediationTasks,
  remediationFailure,
} from "../server/domain/remediation.js";

const errors = defineActionErrors("UNAUTHENTICATED", "FORBIDDEN", "VALIDATION_ERROR");

export default defineAction({
  description:
    "List remediation tasks for a recovery workspace. A task is an internal note. It does not change the dependency map or a provider.",
  schema: z.object({
    workspaceId: z
      .string()
      .optional()
      .describe("Recovery workspace id. Omit to use this team's sample map."),
    status: taskStatusSchema
      .optional()
      .describe("open, in_progress, completed, or dismissed."),
  }),
  outputSchema: listRemediationTasksResultSchema,
  errors,
  readOnly: true,
  http: { method: "GET" },
  run: async ({ workspaceId, status }, ctx) => {
    if (!ctx?.userEmail) {
      errors.noWrite("Sign in before reading remediation tasks.", "UNAUTHENTICATED", {
        statusCode: 401,
      });
      throw new Error("Not signed in");
    }
    try {
      if (workspaceId) {
        await assertAccess("recovery-workspace", workspaceId, "viewer");
      }
      return await listRemediationTasks({ workspaceId, status });
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
