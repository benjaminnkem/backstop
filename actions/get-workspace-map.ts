import { defineAction, defineActionErrors } from "@agent-native/core/action";
import { buildDeepLink } from "@agent-native/core/server";
import { ForbiddenError } from "@agent-native/core/sharing";
import { z } from "zod";

import { workspaceMapSchema } from "../shared/recovery.js";
import { readWorkspaceMap } from "../server/domain/workspace-map.js";

const errors = defineActionErrors("UNAUTHENTICATED", "FORBIDDEN");

export default defineAction({
  description:
    "Read one recovery workspace graph: resources, capabilities, dependency groups, and links. Omitting workspaceId returns the Northstar sample when this team has one.",
  schema: z.object({
    workspaceId: z
      .string()
      .optional()
      .describe("Recovery workspace id. Omit to open this team's sample map."),
  }),
  outputSchema: workspaceMapSchema,
  errors,
  readOnly: true,
  http: { method: "GET" },
  link: ({ result }) => ({
    url: buildDeepLink({
      app: "backstop",
      view: "map",
      params: result.workspace ? { workspace: result.workspace.id } : {},
    }),
    label: result.workspace?.name ?? "Recovery map",
  }),
  run: async ({ workspaceId }, ctx) => {
    if (!ctx?.userEmail) {
      errors.noWrite("Sign in before reading a recovery map.", "UNAUTHENTICATED", {
        statusCode: 401,
      });
      throw new Error("Not signed in");
    }
    try {
      return await readWorkspaceMap(workspaceId);
    } catch (error) {
      if (!(error instanceof ForbiddenError)) throw error;
      errors.noWrite("That recovery workspace is not available.", "FORBIDDEN", {
        statusCode: 403,
      });
      throw error;
    }
  },
});
