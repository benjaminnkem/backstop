import { defineAction, defineActionErrors } from "@agent-native/core/action";
import { buildDeepLink } from "@agent-native/core/server";
import { ForbiddenError } from "@agent-native/core/sharing";
import { z } from "zod";

import { buildRunbook, runbookSchema } from "../shared/runbook.js";
import { listRemediationTasks, remediationFailure } from "../server/domain/remediation.js";
import { readSimulation, SimulationAccessError } from "../server/domain/simulation-run.js";
import { readWorkspaceMap } from "../server/domain/workspace-map.js";

const errors = defineActionErrors("UNAUTHENTICATED", "FORBIDDEN", "VALIDATION_ERROR");

export default defineAction({
  description:
    "Build the emergency runbook from persisted records: critical systems, owners, recorded routes with confidence, gaps, the latest (or chosen) simulation, and open tasks. Includes Markdown for export. It never adds procedures that are not recorded, and contains no credentials.",
  schema: z.object({
    workspaceId: z
      .string()
      .optional()
      .describe("Recovery workspace id. Omit to use this team's sample map."),
    simulationId: z
      .string()
      .optional()
      .describe("Saved simulation to include. Omit for the latest run."),
  }),
  outputSchema: runbookSchema,
  errors,
  readOnly: true,
  http: { method: "GET" },
  link: ({ result }) => ({
    url: buildDeepLink({
      app: "backstop",
      view: "runbook",
      params: { workspace: result.workspace.id },
    }),
    label: `${result.workspace.name} runbook`,
  }),
  run: async ({ workspaceId, simulationId }, ctx) => {
    if (!ctx?.userEmail) {
      errors.noWrite("Sign in before reading a runbook.", "UNAUTHENTICATED", {
        statusCode: 401,
      });
      throw new Error("Not signed in");
    }
    try {
      const map = await readWorkspaceMap(workspaceId);
      if (!map.workspace) {
        errors.noWrite(
          "No recovery workspace yet. Import the sample team first.",
          "VALIDATION_ERROR",
          { statusCode: 400 },
        );
        throw new Error("No workspace");
      }
      const id = map.workspace.id;
      const chosen = await readSimulation({ workspaceId: id, simulationId });
      // A run id from another workspace is ignored rather than mixed in.
      const simulation = chosen && chosen.workspaceId === id ? chosen : null;
      const { tasks } = await listRemediationTasks({ workspaceId: id });
      return buildRunbook({ map, simulation, tasks, now: new Date() });
    } catch (error) {
      if (error instanceof SimulationAccessError || error instanceof ForbiddenError) {
        errors.noWrite("That recovery workspace is not available.", "FORBIDDEN", {
          statusCode: 403,
        });
      }
      const failure = remediationFailure(error);
      if (failure) {
        errors.noWrite(failure.message, failure.code, { statusCode: failure.statusCode });
      }
      throw error;
    }
  },
});
