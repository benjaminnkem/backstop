import { describe, expect, it } from "vitest";

import { latestTestByCapability, type RecoveryTest } from "../../shared/recovery-tests.js";
import { assertResultAuthority, RecoveryTestConfirmationError } from "./recovery-tests.js";

describe("assertResultAuthority", () => {
  const agent = { fromHumanSurface: false, humanConfirmed: true };
  const unconfirmed = { fromHumanSurface: true, humanConfirmed: false };
  const person = { fromHumanSurface: true, humanConfirmed: true };

  it("lets anyone plan a test", () => {
    expect(() => assertResultAuthority("planned", agent)).not.toThrow();
  });

  it("never lets the agent record a pass or a fail, even if it claims confirmation", () => {
    expect(() => assertResultAuthority("passed", agent)).toThrow(RecoveryTestConfirmationError);
    expect(() => assertResultAuthority("failed", agent)).toThrow(RecoveryTestConfirmationError);
  });

  it("needs the person to confirm they performed or watched it", () => {
    expect(() => assertResultAuthority("passed", unconfirmed)).toThrow(/Confirm/);
    expect(() => assertResultAuthority("passed", person)).not.toThrow();
  });
});

describe("latestTestByCapability", () => {
  const base: RecoveryTest = {
    id: "a",
    workspaceId: "w",
    resourceId: "email",
    resourceName: "Email",
    capability: "access",
    groupId: null,
    routeLabel: null,
    method: "Sign in with the key",
    testerLabel: null,
    testedOn: "2026-10-01",
    outcome: "failed",
    evidenceNotes: null,
    confirmedByHuman: true,
    createdAt: "2026-10-01T10:00:00Z",
    updatedAt: "2026-10-01T10:00:00Z",
  };

  it("keeps the most recent test per capability", () => {
    const latest = latestTestByCapability([
      base,
      { ...base, id: "b", testedOn: "2026-11-02", outcome: "passed", createdAt: "2026-11-02T10:00:00Z" },
      { ...base, id: "c", capability: "recovery", outcome: "planned", testedOn: null },
    ]);
    expect(latest.get("email/access")?.id).toBe("b");
    expect(latest.get("email/recovery")?.id).toBe("c");
  });
});
