import { defineAction, defineActionErrors } from "@agent-native/core/action";
import { buildDeepLink } from "@agent-native/core/server";
import { assertAccess } from "@agent-native/core/sharing";
import { z } from "zod";

import {
  capabilityModeSchema,
  capabilitySchema,
  confidenceSchema,
  createCapabilityResultSchema,
} from "../shared/recovery.js";
import {
  createCapability,
  graphEditFailure,
} from "../server/domain/graph-edit.js";

const errors = defineActionErrors(
  "UNAUTHENTICATED",
  "FORBIDDEN",
  "VALIDATION_ERROR",
  "OVERLAP",
);

export default defineAction({
  description:
    "Record one access, recovery, or administration capability on a resource. Duplicate capability fails. Dependent mode needs add-dependency-route before a simulation can call it available.",
  schema: z.object({
    workspaceId: z
      .string()
      .optional()
      .describe("Recovery workspace id. Omit to edit this team's sample map."),
    resourceId: z
      .string()
      .describe("Resource id or slug, such as workspace-email."),
    capability: capabilitySchema.describe("access, recovery, or administration."),
    mode: capabilityModeSchema.describe(
      "independent, dependent, or unknown. independent ignores dependency groups.",
    ),
    confidence: confidenceSchema.describe("verified, assumed, or unknown."),
    notes: z
      .string()
      .trim()
      .min(1)
      .max(500)
      .optional()
      .describe("Optional note. Do not include credentials."),
  }),
  outputSchema: createCapabilityResultSchema,
  errors,
  link: ({ result }) => ({
    url: buildDeepLink({
      app: "backstop",
      view: "map",
      params: { workspace: result.workspaceId, resource: result.resourceId },
    }),
    label: `${result.capability} capability`,
  }),
  run: async (
    { workspaceId, resourceId, capability, mode, confidence, notes },
    ctx,
  ) => {
    const userEmail = ctx?.userEmail;
    if (!userEmail) {
      errors.noWrite("Sign in before editing the recovery map.", "UNAUTHENTICATED", {
        statusCode: 401,
      });
      throw new Error("Not signed in");
    }
    try {
      if (workspaceId) {
        await assertAccess("recovery-workspace", workspaceId, "editor");
      }
      const saved = await createCapability(
        { userEmail, orgId: ctx?.orgId ?? null },
        { workspaceId, resourceId, capability, mode, confidence, notes },
      );
      return {
        ...saved,
        _receipt: {
          changed: true,
          verified: true,
          subject: saved.workspaceId,
          summary: `Recorded ${saved.capability} as ${saved.mode}.`,
        },
      };
    } catch (error) {
      const failure = graphEditFailure(error);
      if (failure) {
        errors.noWrite(failure.message, failure.code, {
          statusCode: failure.statusCode,
        });
      }
      throw error;
    }
  },
});
