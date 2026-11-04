import { defineAction, defineActionErrors } from "@agent-native/core/action";
import { buildDeepLink } from "@agent-native/core/server";
import { ForbiddenError } from "@agent-native/core/sharing";
import { z } from "zod";

import { NorthstarResetError, resetNorthstar } from "../server/domain/workspace-map.js";

const errors = defineActionErrors("UNAUTHENTICATED", "FORBIDDEN", "VALIDATION_ERROR");

export default defineAction({
  description:
    "Reset the fictional Northstar Studio sample to its imported state. Deletes its saved runs, tasks, recovery tests, and map edits. Only works on the fictional sample. Call only when the user explicitly asks to reset the sample.",
  schema: z.object({
    confirm: z.literal(true).describe("Must be true. The user has asked to reset the sample team."),
  }),
  outputSchema: z.object({
    id: z.string(),
    name: z.string(),
    resourceCount: z.number().int(),
    capabilityCount: z.number().int(),
    groupCount: z.number().int(),
    linkCount: z.number().int(),
    _receipt: z
      .object({ changed: z.boolean(), verified: z.boolean(), summary: z.string() })
      .optional(),
  }),
  errors,
  link: ({ result }) => ({
    url: buildDeepLink({ app: "backstop", view: "map", params: { workspace: result.id } }),
    label: result.name,
  }),
  run: async (_args, ctx) => {
    const userEmail = ctx?.userEmail;
    if (!userEmail) {
      errors.noWrite("Sign in before resetting the sample.", "UNAUTHENTICATED", { statusCode: 401 });
      throw new Error("Not signed in");
    }
    try {
      const reset = await resetNorthstar({ userEmail, orgId: ctx?.orgId ?? null });
      return {
        ...reset,
        _receipt: {
          changed: true,
          verified: true,
          summary: `Reset ${reset.name} to its imported state with ${reset.resourceCount} resources.`,
        },
      };
    } catch (error) {
      if (error instanceof NorthstarResetError) {
        errors.noWrite(error.message, "VALIDATION_ERROR", { statusCode: 400 });
      }
      if (error instanceof ForbiddenError) {
        errors.noWrite("That recovery workspace is not available.", "FORBIDDEN", { statusCode: 403 });
      }
      throw error;
    }
  },
});
