import { defineAction, defineActionErrors } from "@agent-native/core/action";
import { buildDeepLink } from "@agent-native/core/server";
import { ForbiddenError } from "@agent-native/core/sharing";
import { z } from "zod";

import { simulationResponseSchema } from "../shared/simulation-contract.js";
import {
  readSimulation,
  SimulationAccessError,
} from "../server/domain/simulation-run.js";

const errors = defineActionErrors("UNAUTHENTICATED", "FORBIDDEN");

export default defineAction({
  description:
    "Read a saved failure simulation. Omit simulationId to read the latest run for the workspace. Statuses are model results, not live provider state.",
  schema: z.object({
    workspaceId: z.string().optional().describe("Recovery workspace id."),
    simulationId: z
      .string()
      .optional()
      .describe("Saved simulation id. Omit for the latest run."),
  }),
  outputSchema: simulationResponseSchema,
  errors,
  readOnly: true,
  http: { method: "GET" },
  link: ({ result }) =>
    result.simulation
      ? {
          url: buildDeepLink({
            app: "backstop",
            view: "map",
            params: {
              workspace: result.simulation.workspaceId,
              simulation: result.simulation.id,
            },
          }),
          label: result.simulation.name,
        }
      : {
          url: buildDeepLink({ app: "backstop", view: "map" }),
          label: "Recovery map",
        },
  run: async ({ workspaceId, simulationId }, ctx) => {
    if (!ctx?.userEmail) {
      errors.noWrite("Sign in before reading a simulation.", "UNAUTHENTICATED", {
        statusCode: 401,
      });
      throw new Error("Not signed in");
    }
    try {
      return { simulation: await readSimulation({ workspaceId, simulationId }) };
    } catch (error) {
      if (error instanceof SimulationAccessError || error instanceof ForbiddenError) {
        errors.noWrite("That simulation is not available.", "FORBIDDEN", {
          statusCode: 403,
        });
      }
      throw error;
    }
  },
});
