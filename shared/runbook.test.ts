import { describe, expect, it } from "vitest";

import type { WorkspaceMap } from "./recovery.js";
import { buildRunbook, TESTING_NOT_RECORDED } from "./runbook.js";

const map: WorkspaceMap = {
  workspace: { id: "w1", name: "Test Team", fictional: true, seedKey: null },
  resources: [
    { id: "phone", slug: "phone", name: "Admin phone", kind: "device", criticality: "high", ownerLabel: "IT", description: null, status: "active" },
    { id: "email", slug: "email", name: "Email", kind: "email", criticality: "critical", ownerLabel: null, description: null, status: "active" },
    { id: "old", slug: "old", name: "Old box", kind: "service", criticality: "critical", ownerLabel: null, description: null, status: "archived" },
  ],
  capabilities: [
    { id: "c1", resourceId: "phone", capability: "access", mode: "independent", confidence: "verified", notes: null },
    { id: "c2", resourceId: "email", capability: "access", mode: "dependent", confidence: "verified", notes: null },
    { id: "c3", resourceId: "email", capability: "recovery", mode: "dependent", confidence: "assumed", notes: null },
  ],
  groups: [
    { id: "g1", slug: "g1", resourceId: "email", capability: "access", requirementMode: "ALL", label: "Login with phone" },
  ],
  links: [
    { id: "l1", slug: "l1", groupId: "g1", prerequisiteResourceId: "phone", prerequisiteCapability: "access", confidence: "verified", notes: null },
  ],
  disclaimer: "Synthetic sample.",
};

describe("buildRunbook", () => {
  const book = buildRunbook({ map, simulation: null, tasks: [], now: new Date("2026-11-03T12:00:00Z") });

  it("orders systems by criticality and leaves out archived resources", () => {
    expect(book.systems.map((item) => item.name)).toEqual(["Email", "Admin phone"]);
  });

  it("labels missing data instead of guessing", () => {
    const texts = book.gaps.map((gap) => gap.text);
    expect(texts).toContain("Email has no recorded owner.");
    expect(texts).toContain("Email access: only one recorded route.");
    expect(texts).toContain("Email recovery: no route is recorded.");
    expect(texts).toContain("Email recovery: capability is assumed.");
    expect(book.markdown).toContain("owner: **not recorded**");
  });

  it("states that nothing is tested and that no run exists", () => {
    expect(book.testing).toBe(TESTING_NOT_RECORDED);
    expect(book.markdown).toContain("No simulation has been run.");
    expect(book.markdown).toContain("Confidential");
  });

  it("is deterministic for the same records and time", () => {
    const again = buildRunbook({ map, simulation: null, tasks: [], now: new Date("2026-11-03T12:00:00Z") });
    expect(again.markdown).toBe(book.markdown);
  });
});
