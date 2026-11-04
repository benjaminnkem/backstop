import { defineAction, defineActionErrors } from "@agent-native/core/action";
import { assertAccess } from "@agent-native/core/sharing";
import { z } from "zod";

import { listRecoveryTestsResultSchema } from "../shared/recovery-tests.js";
import { listRecoveryTests, recoveryTestFailure } from "../server/domain/recovery-tests.js";

const errors = defineActionErrors("UNAUTHENTICATED", "FORBIDDEN", "VALIDATION_ERROR", "CONFIRMATION_REQUIRED");

export default defineAction({
  description:
    "List recorded recovery tests. planned means intended; passed and failed were recorded by a person. A route with no test is documented, not tested.",
  schema: z.object({
    workspaceId: z.string().optional().describe("Recovery workspace id. Omit to use this team's sample map."),
    resourceId: z.string().optional().describe("Only tests for this resource id or slug."),
  }),
  outputSchema: listRecoveryTestsResultSchema,
  errors,
  readOnly: true,
  http: { method: "GET" },
  run: async (args, ctx) => {
    if (!ctx?.userEmail) {
      errors.noWrite("Sign in before reading recovery tests.", "UNAUTHENTICATED", { statusCode: 401 });
      throw new Error("Not signed in");
    }
    try {
      const workspaceId = args.workspaceId;
      if (workspaceId) await assertAccess("recovery-workspace", workspaceId, "viewer");
      return await listRecoveryTests(args);
    } catch (error) {
      const failure = recoveryTestFailure(error);
      if (failure) errors.noWrite(failure.message, failure.code, { statusCode: failure.statusCode });
      throw error;
    }
  },
});
