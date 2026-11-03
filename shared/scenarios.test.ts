import { describe, expect, it } from "vitest";

import { resolveScenarios } from "./scenarios.js";

const resources = [
  { id: "r-phone", slug: "admin-phone", status: "active" },
  { id: "r-email", slug: "workspace-email", status: "active" },
  { id: "r-vault", slug: "password-vault", status: "archived" },
];
const capabilities = [
  { resourceId: "r-phone", capability: "access" as const },
  { resourceId: "r-email", capability: "access" as const },
  { resourceId: "r-vault", capability: "access" as const },
];

describe("resolveScenarios", () => {
  it("keeps only presets whose resource and capability exist", () => {
    const ids = resolveScenarios(resources, capabilities).map((item) => item.id);
    expect(ids).toEqual(["lost-phone", "email-down"]);
  });

  it("resolves slugs to resource ids", () => {
    const [phone] = resolveScenarios(resources, capabilities);
    expect(phone?.failed).toEqual({ resourceId: "r-phone", capability: "access" });
  });

  it("skips a preset when the capability is missing", () => {
    const ids = resolveScenarios(resources, [
      { resourceId: "r-phone", capability: "recovery" },
    ]).map((item) => item.id);
    expect(ids).toEqual([]);
  });
});
