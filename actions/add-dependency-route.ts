import { defineAction, defineActionErrors } from "@agent-native/core/action";
import { buildDeepLink } from "@agent-native/core/server";
import { assertAccess } from "@agent-native/core/sharing";
import { z } from "zod";

import {
  addDependencyRouteResultSchema,
  capabilitySchema,
  confidenceSchema,
  requirementModeSchema,
} from "../shared/recovery.js";
import {
  addDependencyRoute,
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
    "Add one alternative dependency route: a group plus one prerequisite link. The target capability must already be dependent. Duplicate slugs fail. Saved simulations stay unchanged.",
  schema: z.object({
    workspaceId: z
      .string()
      .optional()
      .describe("Recovery workspace id. Omit to edit this team's sample map."),
    resourceId: z
      .string()
      .describe("Target resource id or slug, such as workspace-email."),
    capability: capabilitySchema.describe("Capability this route can satisfy."),
    groupSlug: z
      .string()
      .trim()
      .min(1)
      .max(64)
      .describe(
        "Stable group slug, unique in the workspace. A second write with this slug fails.",
      ),
    requirementMode: requirementModeSchema.describe(
      "ALL requires every link. ANY accepts one. This action records one link.",
    ),
    label: z.string().trim().min(1).max(160).describe("Route label shown on the map."),
    linkSlug: z
      .string()
      .trim()
      .min(1)
      .max(64)
      .describe("Stable link slug, unique in the workspace."),
    prerequisiteResourceId: z
      .string()
      .describe("Prerequisite resource id or slug, such as backup-key."),
    prerequisiteCapability: capabilitySchema.describe(
      "Prerequisite capability, usually access.",
    ),
    confidence: confidenceSchema.describe(
      "verified, assumed, or unknown. Assumed does not confirm available or blocked.",
    ),
    notes: z
      .string()
      .trim()
      .min(1)
      .max(500)
      .optional()
      .describe("Optional note. Do not include credentials."),
  }),
  outputSchema: addDependencyRouteResultSchema,
  errors,
  link: ({ result }) => ({
    url: buildDeepLink({
      app: "backstop",
      view: "map",
      params: { workspace: result.workspaceId, resource: result.resourceId },
    }),
    label: result.label,
  }),
  run: async (args, ctx) => {
    const userEmail = ctx?.userEmail;
    if (!userEmail) {
      errors.noWrite("Sign in before editing the recovery map.", "UNAUTHENTICATED", {
        statusCode: 401,
      });
      throw new Error("Not signed in");
    }
    try {
      if (args.workspaceId) {
        await assertAccess("recovery-workspace", args.workspaceId, "editor");
      }
      const saved = await addDependencyRoute(
        { userEmail, orgId: ctx?.orgId ?? null },
        args,
      );
      return {
        ...saved,
        _receipt: {
          changed: true,
          verified: true,
          subject: saved.workspaceId,
          summary: `Recorded “${saved.label}”. Earlier simulations stay saved.`,
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
