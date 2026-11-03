import { defineAction } from "@agent-native/core/action";
import { readAppState } from "@agent-native/core/application-state";
import { ForbiddenError } from "@agent-native/core/sharing";
import { z } from "zod";

import {
  readSimulation,
  SimulationAccessError,
} from "../server/domain/simulation-run.js";

export default defineAction({
  description:
    "Read the current screen. On the recovery map this includes the open simulation id and summary counts. Call get-simulation before explaining impact.",
  schema: z.object({}),
  http: false,
  readOnly: true,
  run: async () => {
    const navigation = await readAppState("navigation");
    const screen: Record<string, unknown> = {};
    if (navigation) screen.navigation = navigation;

    const ids = navigationIds(navigation);
    if (ids.view === "map" || ids.workspaceId || ids.simulationId) {
      screen.simulation = await visibleSimulation(ids);
    }

    if (Object.keys(screen).length === 0) {
      return "No application state found. Is the app running?";
    }
    return screen;
  },
});

function navigationIds(navigation: unknown): {
  view?: string | undefined;
  workspaceId?: string | undefined;
  simulationId?: string | undefined;
} {
  if (!navigation || typeof navigation !== "object") return {};
  const record = navigation as Record<string, unknown>;
  const text = (key: string) =>
    typeof record[key] === "string" && record[key] ? String(record[key]) : undefined;
  return {
    view: text("view"),
    workspaceId: text("workspaceId"),
    simulationId: text("simulationId"),
  };
}

async function visibleSimulation(ids: {
  workspaceId?: string | undefined;
  simulationId?: string | undefined;
}) {
  try {
    const saved = await readSimulation({
      workspaceId: ids.workspaceId,
      simulationId: ids.simulationId,
    });
    if (!saved) return null;
    return {
      id: saved.id,
      workspaceId: saved.workspaceId,
      name: saved.name,
      summary: saved.summary,
      failed: saved.failed.map((item) => ({
        name: item.name,
        capability: item.capability,
      })),
      next: "Call get-simulation with this id before explaining. Use its stored explanations, causal paths, and warnings.",
    };
  } catch (error) {
    if (error instanceof ForbiddenError || error instanceof SimulationAccessError) {
      return null;
    }
    throw error;
  }
}
