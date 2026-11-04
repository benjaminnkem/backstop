import { defineAction, defineActionErrors } from "@agent-native/core/action";
import { buildDeepLink } from "@agent-native/core/server";
import { z } from "zod";

import { recoveryTestWriteResultSchema, testOutcomeSchema } from "../shared/recovery-tests.js";
import { recoveryTestFailure, updateRecoveryTest } from "../server/domain/recovery-tests.js";

const errors = defineActionErrors(
  "UNAUTHENTICATED",
  "FORBIDDEN",
  "VALIDATION_ERROR",
  "CONFIRMATION_REQUIRED",
);

export default defineAction({
  description:
    "Update a recovery test. The agent may edit a planned test's method, tester, or notes. Only a person in the app can set or change a passed or failed result.",
  schema: z.object({
    testId: z.string().describe("Recovery test id."),
    method: z.string().trim().min(1).max(240).optional(),
    testerLabel: z.string().trim().max(80).optional(),
    testedOn: z.string().optional().describe("YYYY-MM-DD."),
    outcome: testOutcomeSchema.optional(),
    evidenceNotes: z.string().trim().max(1000).optional(),
    humanConfirmed: z
      .boolean()
      .optional()
      .describe("Set only by the app UI when a person ticks that they performed or watched the test."),
  }),
  outputSchema: recoveryTestWriteResultSchema,
  errors,
  link: ({ result }) => ({
    url: buildDeepLink({
      app: "backstop",
      view: "map",
      params: { workspace: result.workspaceId, resource: result.resourceId },
    }),
    label: "Recovery test",
  }),
  run: async ({ humanConfirmed, ...input }, ctx) => {
    if (!ctx?.userEmail) {
      errors.noWrite("Sign in before updating a recovery test.", "UNAUTHENTICATED", { statusCode: 401 });
      throw new Error("Not signed in");
    }
    try {
      const saved = await updateRecoveryTest(
        { fromHumanSurface: ctx.caller === "frontend", humanConfirmed: humanConfirmed === true },
        input,
      );
      return {
        ...saved,
        _receipt: {
          changed: true,
          verified: true,
          subject: saved.id,
          summary: `Updated the recovery test (${saved.outcome}).`,
        },
      };
    } catch (error) {
      const failure = recoveryTestFailure(error);
      if (failure) errors.noWrite(failure.message, failure.code, { statusCode: failure.statusCode });
      throw error;
    }
  },
});
