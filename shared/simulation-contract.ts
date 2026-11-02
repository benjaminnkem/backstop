import { z } from "zod";

import { capabilitySchema, confidenceSchema } from "./recovery.js";

export const simulationStatusSchema = z.enum([
  "available",
  "blocked",
  "at_risk",
  "unknown",
]);

const summarySchema = z.object({
  available: z.number().int(),
  blocked: z.number().int(),
  at_risk: z.number().int(),
  unknown: z.number().int(),
});

const pathNodeSchema = z.object({
  resourceId: z.string(),
  slug: z.string(),
  name: z.string(),
  capability: capabilitySchema,
});

export const simulationRecordSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  name: z.string(),
  createdAt: z.string(),
  summary: summarySchema,
  warnings: z.array(z.string()),
  failed: z.array(
    z.object({
      resourceId: z.string(),
      slug: z.string(),
      name: z.string(),
      capability: capabilitySchema,
    }),
  ),
  impacts: z.array(
    z.object({
      resourceId: z.string(),
      slug: z.string(),
      name: z.string(),
      capability: capabilitySchema,
      status: simulationStatusSchema,
      confidence: confidenceSchema,
      explanation: z.string(),
      causalPath: z.array(pathNodeSchema),
    }),
  ),
});

export const simulationResponseSchema = z.object({
  simulation: simulationRecordSchema.nullable(),
});

export const runSimulationResultSchema = z.object({
  simulation: simulationRecordSchema,
  _receipt: z
    .object({
      changed: z.boolean(),
      verified: z.boolean(),
      summary: z.string(),
    })
    .optional(),
});

export type SimulationRecord = z.infer<typeof simulationRecordSchema>;
