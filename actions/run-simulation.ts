import { defineAction, defineActionErrors } from "@agent-native/core/action";
import { buildDeepLink } from "@agent-native/core/server";
import { assertAccess, ForbiddenError } from "@agent-native/core/sharing";
import { z } from "zod";

import { capabilitySchema } from "../shared/recovery.js";
import { runSimulationResultSchema } from "../shared/simulation-contract.js";
import {
  runWorkspaceSimulation,
  SimulationAccessError,
  SimulationInputError,
} from "../server/domain/simulation-run.js";

const errors = defineActionErrors(
  "UNAUTHENTICATED",
  "FORBIDDEN",
  "VALIDATION_ERROR",
  "SIMULATION_ERROR",
);

export default defineAction({
  description:
    "Run a deterministic failure simulation on a saved recovery map and store the result. Statuses describe the model, not a live provider. A recovery route does not make access available.",
  schema: z.object({
    workspaceId: z
      .string()
      .optional()
      .describe("Recovery workspace id. Omit to use this team's sample map."),
    name: z
      .string()
      .trim()
      .min(1)
      .max(160)
      .default("Failure simulation")
      .describe("Name stored with this run."),
    failed: z
      .array(
        z.object({
          resourceId: z
            .string()
            .describe("Resource id or slug, such as admin-phone."),
          capability: capabilitySchema,
        }),
      )
      .min(1)
      .max(20)
      .describe("Capabilities the scenario marks failed."),
  }),
  outputSchema: runSimulationResultSchema,
  errors,
  link: ({ result }) => ({
    url: buildDeepLink({
      app: "backstop",
      view: "map",
      params: {
        workspace: result.simulation.workspaceId,
        simulation: result.simulation.id,
      },
    }),
    label: result.simulation.name,
  }),
  run: async ({ workspaceId, name, failed }, ctx) => {
    const userEmail = ctx?.userEmail;
    if (!userEmail) {
      errors.noWrite("Sign in before running a simulation.", "UNAUTHENTICATED", {
        statusCode: 401,
      });
      throw new Error("Not signed in");
    }
    try {
      if (workspaceId) {
        await assertAccess("recovery-workspace", workspaceId, "editor");
      }
      const simulation = await runWorkspaceSimulation(
        { userEmail, orgId: ctx?.orgId ?? null },
        { workspaceId, name, failed },
      );
      const blocked = simulation.summary.blocked;
      return {
        simulation,
        _receipt: {
          changed: true,
          verified: true,
          summary: `Saved “${simulation.name}” with ${blocked} blocked ${blocked === 1 ? "capability" : "capabilities"}.`,
        },
      };
    } catch (error) {
      if (error instanceof SimulationInputError) {
        errors.noWrite(error.message, "VALIDATION_ERROR", { statusCode: 400 });
      }
      if (error instanceof SimulationAccessError || error instanceof ForbiddenError) {
        errors.noWrite("That recovery workspace is not available.", "FORBIDDEN", {
          statusCode: 403,
        });
      }
      throw error;
    }
  },
});
