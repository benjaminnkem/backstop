import { defineAction, defineActionErrors } from "@agent-native/core/action";
import { buildDeepLink } from "@agent-native/core/server";
import { z } from "zod";

import { capabilitySchema } from "../shared/recovery.js";
import { recoveryTestWriteResultSchema, testOutcomeSchema } from "../shared/recovery-tests.js";
import { recordRecoveryTest, recoveryTestFailure } from "../server/domain/recovery-tests.js";

const errors = defineActionErrors(
  "UNAUTHENTICATED",
  "FORBIDDEN",
  "VALIDATION_ERROR",
  "CONFIRMATION_REQUIRED",
);

export default defineAction({
  description:
    "Record a recovery test for one capability. The agent may only suggest a test with outcome planned, and only when the user asks. passed or failed can be recorded only by a person in the app who confirms they performed or watched it. Does not change the map or a provider.",
  schema: z.object({
    workspaceId: z.string().optional().describe("Recovery workspace id. Omit to use this team's sample map."),
    resourceId: z.string().describe("Resource id or slug, such as workspace-email."),
    capability: capabilitySchema.describe("access, recovery, or administration."),
    groupId: z.string().optional().describe("Route (group) id or slug that was tested. Omit for the capability as a whole."),
    method: z.string().trim().min(1).max(240).describe("How the test is done, without credentials."),
    testerLabel: z.string().trim().max(80).optional().describe("Who tests it. A display label, not an access grant."),
    testedOn: z.string().optional().describe("YYYY-MM-DD the test was performed. Required for passed or failed."),
    outcome: testOutcomeSchema.default("planned").describe("planned for a suggestion. passed and failed are for a person in the app only."),
    evidenceNotes: z.string().trim().max(1000).optional().describe("What was observed. No credentials or codes."),
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
    const userEmail = ctx?.userEmail;
    if (!userEmail) {
      errors.noWrite("Sign in before recording a recovery test.", "UNAUTHENTICATED", { statusCode: 401 });
      throw new Error("Not signed in");
    }
    try {
      const saved = await recordRecoveryTest(
        { userEmail, orgId: ctx?.orgId ?? null },
        { fromHumanSurface: ctx?.caller === "frontend", humanConfirmed: humanConfirmed === true },
        input,
      );
      return {
        ...saved,
        _receipt: {
          changed: true,
          verified: true,
          subject: saved.id,
          summary:
            saved.outcome === "planned"
              ? "Planned a recovery test. Nothing is marked tested yet."
              : `Recorded a ${saved.outcome} test result confirmed by a person.`,
        },
      };
    } catch (error) {
      const failure = recoveryTestFailure(error);
      if (failure) errors.noWrite(failure.message, failure.code, { statusCode: failure.statusCode });
      throw error;
    }
  },
});
