import { describe, expect, it } from "vitest";

import { buildLedger, describeRun, waysIn } from "./readiness.js";
import type { WorkspaceMap } from "./recovery.js";
import type { SimulationRecord } from "./simulation-contract.js";

const map: WorkspaceMap = {
  workspace: { id: "w", name: "T", fictional: true, seedKey: null },
  resources: [
    { id: "phone", slug: "phone", name: "Admin phone", kind: "device", criticality: "high", ownerLabel: null, description: null, status: "active" },
    { id: "key", slug: "key", name: "Hardware key", kind: "recovery_method", criticality: "high", ownerLabel: null, description: null, status: "active" },
    { id: "email", slug: "email", name: "Email", kind: "email", criticality: "critical", ownerLabel: null, description: null, status: "active" },
    { id: "code", slug: "code", name: "Code host", kind: "service", criticality: "critical", ownerLabel: null, description: null, status: "active" },
  ],
  capabilities: [
    { id: "1", resourceId: "phone", capability: "access", mode: "independent", confidence: "verified", notes: null },
    { id: "2", resourceId: "key", capability: "access", mode: "independent", confidence: "verified", notes: null },
    { id: "3", resourceId: "email", capability: "access", mode: "dependent", confidence: "verified", notes: null },
    { id: "4", resourceId: "code", capability: "access", mode: "dependent", confidence: "verified", notes: null },
  ],
  groups: [
    { id: "g1", slug: "g1", resourceId: "email", capability: "access", requirementMode: "ALL", label: "Phone login" },
    { id: "g2", slug: "g2", resourceId: "email", capability: "access", requirementMode: "ALL", label: "Key login" },
    { id: "g3", slug: "g3", resourceId: "code", capability: "access", requirementMode: "ALL", label: "SSO" },
  ],
  links: [
    { id: "l1", slug: "l1", groupId: "g1", prerequisiteResourceId: "phone", prerequisiteCapability: "access", confidence: "verified", notes: null },
    { id: "l2", slug: "l2", groupId: "g2", prerequisiteResourceId: "key", prerequisiteCapability: "access", confidence: "verified", notes: null },
    { id: "l3", slug: "l3", groupId: "g3", prerequisiteResourceId: "email", prerequisiteCapability: "access", confidence: "verified", notes: null },
  ],
  disclaimer: "",
};

const impact = (resourceId: string, name: string, status: "available" | "blocked" | "unknown") => ({
  resourceId,
  slug: resourceId,
  name,
  capability: "access" as const,
  status,
  confidence: "verified" as const,
  explanation: "",
  causalPath: [],
});

const run: SimulationRecord = {
  id: "s",
  workspaceId: "w",
  name: "Phone lost",
  createdAt: "2026-11-03T00:00:00Z",
  summary: { available: 3, blocked: 1, at_risk: 0, unknown: 0 },
  warnings: [],
  failed: [{ resourceId: "phone", slug: "phone", name: "Admin phone", capability: "access" }],
  impacts: [
    impact("phone", "Admin phone", "blocked"),
    impact("key", "Hardware key", "available"),
    impact("email", "Email", "available"),
    impact("code", "Code host", "available"),
  ],
};

describe("waysIn", () => {
  it("counts each ALL route once and each ANY prerequisite separately", () => {
    expect(waysIn([{ requirementMode: "ALL", linkCount: 2 }])).toBe(1);
    expect(waysIn([{ requirementMode: "ANY", linkCount: 2 }, { requirementMode: "ALL", linkCount: 1 }])).toBe(3);
  });
});

describe("buildLedger", () => {
  it("puts dependent critical systems first and counts their ways in", () => {
    const rows = buildLedger(map, run);
    expect(rows.map((row) => row.name)).toEqual(["Code host", "Email", "Admin phone", "Hardware key"]);
    expect(rows[1]).toMatchObject({ accessWays: 2, through: ["Admin phone", "Hardware key"] });
    expect(rows[2]).toMatchObject({ accessMode: "independent", accessWays: null });
  });
});

describe("describeRun", () => {
  it("restates the saved run without adding causes", () => {
    expect(describeRun(map, run)).toEqual([
      "With Admin phone access unavailable, nothing else in the model is blocked.",
      "Email access stays available through another recorded route.",
    ]);
  });

  it("lists other blocked capabilities", () => {
    const worse = {
      ...run,
      impacts: [impact("phone", "Admin phone", "blocked"), impact("email", "Email", "blocked"), impact("code", "Code host", "blocked")],
    };
    expect(describeRun(map, worse)[0]).toBe(
      "With Admin phone access unavailable, 2 of 2 other capabilities are blocked: Email access and Code host access.",
    );
  });
});
