import { defineAction, defineActionErrors } from "@agent-native/core/action";
import { buildDeepLink } from "@agent-native/core/server";
import { assertAccess } from "@agent-native/core/sharing";
import { z } from "zod";

import {
  createResourceResultSchema,
  criticalitySchema,
  resourceKindSchema,
} from "../shared/recovery.js";
import { createResource, graphEditFailure } from "../server/domain/graph-edit.js";

const errors = defineActionErrors(
  "UNAUTHENTICATED",
  "FORBIDDEN",
  "VALIDATION_ERROR",
  "OVERLAP",
);

export default defineAction({
  description:
    "Add one resource to a recovery map. Does not create capabilities or assume any route is available. A duplicate slug fails. Call create-capability next.",
  schema: z.object({
    workspaceId: z
      .string()
      .optional()
      .describe("Recovery workspace id. Omit to edit this team's sample map."),
    name: z.string().trim().min(1).max(120).describe("Resource name."),
    kind: resourceKindSchema.describe(
      "service, identity_provider, email, account, device, person, recovery_method, credential_vault, or backup_location.",
    ),
    criticality: criticalitySchema.describe(
      "critical, high, medium, or low.",
    ),
    slug: z
      .string()
      .trim()
      .min(1)
      .max(64)
      .optional()
      .describe(
        "Stable slug, unique in the workspace. Omit to derive one from the name. A second write with the same slug fails.",
      ),
    ownerLabel: z
      .string()
      .trim()
      .min(1)
      .max(80)
      .optional()
      .describe("Display label for who looks after this resource. Not an access grant."),
    notes: z
      .string()
      .trim()
      .min(1)
      .max(500)
      .optional()
      .describe("Optional note. Do not include credentials."),
  }),
  outputSchema: createResourceResultSchema,
  errors,
  link: ({ result }) => ({
    url: buildDeepLink({
      app: "backstop",
      view: "map",
      params: { workspace: result.workspaceId, resource: result.id },
    }),
    label: result.name,
  }),
  run: async (
    { workspaceId, name, kind, criticality, slug, ownerLabel, notes },
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
      const saved = await createResource(
        { userEmail, orgId: ctx?.orgId ?? null },
        { workspaceId, name, kind, criticality, slug, ownerLabel, notes },
      );
      return {
        ...saved,
        _receipt: {
          changed: true,
          verified: true,
          subject: saved.workspaceId,
          summary: `Added ${saved.name}. No capability is assumed available.`,
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
