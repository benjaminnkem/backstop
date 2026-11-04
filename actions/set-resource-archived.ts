import { defineAction, defineActionErrors } from "@agent-native/core/action";
import { buildDeepLink } from "@agent-native/core/server";
import { assertAccess } from "@agent-native/core/sharing";
import { z } from "zod";

import { graphEditFailure, setResourceArchived } from "../server/domain/graph-edit.js";

const errors = defineActionErrors("UNAUTHENTICATED", "FORBIDDEN", "VALIDATION_ERROR", "OVERLAP");

export default defineAction({
  description:
    "Archive or restore a resource on the recovery map. An archived resource leaves future simulations and the runbook; any route that still needs it evaluates as unknown. Saved runs are not rewritten. Call only when the user asks.",
  schema: z.object({
    workspaceId: z.string().optional().describe("Recovery workspace id. Omit to edit this team's sample map."),
    resourceId: z.string().describe("Resource id or slug."),
    archived: z.boolean().default(true).describe("true to archive, false to restore."),
  }),
  outputSchema: z.object({
    id: z.string(),
    workspaceId: z.string(),
    name: z.string(),
    archived: z.boolean(),
    dependentRoutes: z.number().int(),
    _receipt: z
      .object({ changed: z.boolean(), verified: z.boolean(), summary: z.string(), subject: z.string().optional() })
      .optional(),
  }),
  errors,
  link: ({ result }) => ({
    url: buildDeepLink({ app: "backstop", view: "map", params: { workspace: result.workspaceId } }),
    label: result.name,
  }),
  run: async (args, ctx) => {
    if (!ctx?.userEmail) {
      errors.noWrite("Sign in before editing the map.", "UNAUTHENTICATED", { statusCode: 401 });
      throw new Error("Not signed in");
    }
    try {
      if (args.workspaceId) await assertAccess("recovery-workspace", args.workspaceId, "editor");
      const saved = await setResourceArchived(args);
      const note =
        saved.archived && saved.dependentRoutes > 0
          ? ` ${saved.dependentRoutes} route${saved.dependentRoutes === 1 ? " still needs" : "s still need"} it and will evaluate as unknown.`
          : "";
      return {
        ...saved,
        _receipt: {
          changed: true,
          verified: true,
          subject: saved.id,
          summary: `${saved.archived ? "Archived" : "Restored"} ${saved.name}.${note} Saved runs are unchanged.`,
        },
      };
    } catch (error) {
      const failure = graphEditFailure(error);
      if (failure) errors.noWrite(failure.message, failure.code, { statusCode: failure.statusCode });
      throw error;
    }
  },
});
