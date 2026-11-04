import { z } from "zod";

import { capabilitySchema } from "./recovery.js";

/**
 * planned: someone intends to test this route.
 * passed / failed: a person performed or watched the test and recorded it.
 * A route with no record is documented, not tested.
 */
export const testOutcomeSchema = z.enum(["planned", "passed", "failed"]);
export type TestOutcome = z.infer<typeof testOutcomeSchema>;

export const recoveryTestSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  resourceId: z.string(),
  resourceName: z.string(),
  capability: capabilitySchema,
  groupId: z.string().nullable(),
  routeLabel: z.string().nullable(),
  method: z.string(),
  testerLabel: z.string().nullable(),
  testedOn: z.string().nullable(),
  outcome: testOutcomeSchema,
  evidenceNotes: z.string().nullable(),
  confirmedByHuman: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type RecoveryTest = z.infer<typeof recoveryTestSchema>;

export const listRecoveryTestsResultSchema = z.object({
  workspaceId: z.string(),
  tests: z.array(recoveryTestSchema),
});

export const recoveryTestWriteResultSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  resourceId: z.string(),
  capability: capabilitySchema,
  outcome: testOutcomeSchema,
  _receipt: z
    .object({
      changed: z.boolean(),
      verified: z.union([z.boolean(), z.literal("unverified")]),
      summary: z.string(),
      subject: z.string().optional(),
    })
    .optional(),
});

export const OUTCOME_LABEL: Record<TestOutcome, string> = {
  planned: "Planned",
  passed: "Tested · passed",
  failed: "Tested · failed",
};

/** The most recent record per resource capability, newest test date first. */
export function latestTestByCapability(tests: RecoveryTest[]): Map<string, RecoveryTest> {
  const sorted = [...tests].sort((a, b) =>
    (b.testedOn ?? b.createdAt).localeCompare(a.testedOn ?? a.createdAt) ||
    b.createdAt.localeCompare(a.createdAt),
  );
  const latest = new Map<string, RecoveryTest>();
  for (const test of sorted) {
    const key = `${test.resourceId}/${test.capability}`;
    if (!latest.has(key)) latest.set(key, test);
  }
  return latest;
}
