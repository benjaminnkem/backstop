import { defineAction, defineActionErrors } from "@agent-native/core/action";
import { buildDeepLink } from "@agent-native/core/server";
import { z } from "zod";

import { seedNorthstarResultSchema } from "../shared/recovery.js";
import { seedNorthstar } from "../server/domain/workspace-map.js";

const errors = defineActionErrors("UNAUTHENTICATED");

export default defineAction({
  description:
    "Import the fictional Northstar Studio recovery map once for this team. Idempotent: a second call returns the existing workspace.",
  schema: z.object({}),
  outputSchema: seedNorthstarResultSchema,
  errors,
  link: ({ result }) => ({
    url: buildDeepLink({
      app: "backstop",
      view: "map",
      params: { workspace: result.id },
    }),
    label: "Open recovery map",
  }),
  run: async (_args, ctx) => {
    const userEmail = ctx?.userEmail;
    if (!userEmail) {
      errors.noWrite("Sign in before importing the sample team.", "UNAUTHENTICATED", {
        statusCode: 401,
      });
      throw new Error("Not signed in");
    }
    const saved = await seedNorthstar({
      userEmail,
      orgId: ctx?.orgId ?? null,
    });
    return {
      ...saved,
      _receipt: {
        changed: saved.created,
        verified: true,
        summary: saved.created
          ? `Imported ${saved.name} with ${saved.resourceCount} resources.`
          : `${saved.name} was already imported.`,
      },
    };
  },
});
