import { defineAction, defineActionErrors } from "@agent-native/core/action";
import { buildDeepLink } from "@agent-native/core/server";
import { assertAccess } from "@agent-native/core/sharing";
import { z } from "zod";

import { graphEditFailure, removeDependencyRoute } from "../server/domain/graph-edit.js";

const errors = defineActionErrors("UNAUTHENTICATED", "FORBIDDEN", "VALIDATION_ERROR", "OVERLAP");

export default defineAction({
  description:
    "Remove one recorded route (a dependency group and its links) from the map. Use when a route no longer exists. Saved simulations are not rewritten. Call only when the user asks.",
  schema: z.object({
    workspaceId: z.string().optional().describe("Recovery workspace id. Omit to edit this team's sample map."),
    groupId: z.string().describe("Route (dependency group) id or slug."),
  }),
  outputSchema: z.object({
    id: z.string(),
    workspaceId: z.string(),
    resourceId: z.string(),
    label: z.string(),
    _receipt: z
      .object({ changed: z.boolean(), verified: z.boolean(), summary: z.string(), subject: z.string().optional() })
      .optional(),
  }),
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
    if (!ctx?.userEmail) {
      errors.noWrite("Sign in before editing the map.", "UNAUTHENTICATED", { statusCode: 401 });
      throw new Error("Not signed in");
    }
    try {
      if (args.workspaceId) await assertAccess("recovery-workspace", args.workspaceId, "editor");
      const removed = await removeDependencyRoute(args);
      return {
        ...removed,
        _receipt: {
          changed: true,
          verified: true,
          subject: removed.id,
          summary: `Removed the route “${removed.label}”. Run the scenario again to see the effect.`,
        },
      };
    } catch (error) {
      const failure = graphEditFailure(error);
      if (failure) errors.noWrite(failure.message, failure.code, { statusCode: failure.statusCode });
      throw error;
    }
  },
});
