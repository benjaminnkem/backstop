import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { northstarFixtureSchema } from "./recovery.js";
import {
  simulate,
  type FailureSeed,
  type SimulationGraph,
  type SimulationStatus,
} from "./simulate.js";

const fixture = northstarFixtureSchema.parse(
  JSON.parse(
    readFileSync(
      new URL("../docs/fixtures/northstar-studio.json", import.meta.url),
      "utf8",
    ),
  ),
);

function graph(
  mode: "ALL" | "ANY",
  confidence: "verified" | "assumed" | "unknown" = "verified",
): SimulationGraph {
  return {
    capabilities: [
      dependent("a"),
      root("b"),
      root("c"),
    ],
    groups: [
      {
        id: "g",
        resourceId: "a",
        capability: "access",
        requirementMode: mode,
        label: "route",
      },
    ],
    links: [
      {
        id: "lb",
        groupId: "g",
        prerequisiteResourceId: "b",
        prerequisiteCapability: "access",
        confidence,
      },
      {
        id: "lc",
        groupId: "g",
        prerequisiteResourceId: "c",
        prerequisiteCapability: "access",
        confidence: "verified",
      },
    ],
  };
}

function root(id: string) {
  return {
    resourceId: id,
    capability: "access" as const,
    mode: "independent" as const,
    confidence: "verified" as const,
  };
}

function dependent(id: string, capability: "access" | "recovery" = "access") {
  return {
    resourceId: id,
    capability,
    mode: "dependent" as const,
    confidence: "verified" as const,
  };
}

function status(
  snapshot: SimulationGraph,
  failed: FailureSeed[],
  id = "a",
  capability: "access" | "recovery" = "access",
): SimulationStatus {
  const impact = simulate(snapshot, failed).impacts.find(
    (item) => item.resourceId === id && item.capability === capability,
  );
  if (!impact) throw new Error(`Missing ${id}/${capability}`);
  return impact.status;
}

function northstarGraph(): SimulationGraph {
  return {
    capabilities: fixture.capabilities,
    groups: fixture.groups,
    links: fixture.links,
  };
}

function accessByStatus(snapshot: SimulationGraph, failed: FailureSeed[]) {
  const result = simulate(snapshot, failed, {
    label: (id) =>
      fixture.resources.find((resource) => resource.id === id)?.name ?? id,
  });
  const blocked = result.impacts
    .filter((impact) => impact.capability === "access" && impact.status === "blocked")
    .map((impact) => impact.resourceId)
    .sort();
  const available = result.impacts
    .filter(
      (impact) => impact.capability === "access" && impact.status === "available",
    )
    .map((impact) => impact.resourceId)
    .sort();
  return { result, blocked, available };
}

describe("recovery simulation", () => {
  it("blocks an ALL route when one required prerequisite fails", () => {
    expect(status(graph("ALL"), [{ resourceId: "b", capability: "access" }])).toBe(
      "blocked",
    );
  });

  it("keeps an ANY route available when one alternative survives", () => {
    expect(status(graph("ANY"), [{ resourceId: "b", capability: "access" }])).toBe(
      "available",
    );
  });

  it("blocks an ANY route when every alternative fails", () => {
    expect(
      status(graph("ANY"), [
        { resourceId: "b", capability: "access" },
        { resourceId: "c", capability: "access" },
      ]),
    ).toBe("blocked");
  });

  it("stays available when a second group survives", () => {
    const snapshot = graph("ALL");
    snapshot.groups.push({
      id: "g2",
      resourceId: "a",
      capability: "access",
      requirementMode: "ALL",
      label: "other route",
    });
    snapshot.links.push({
      id: "ld",
      groupId: "g2",
      prerequisiteResourceId: "c",
      prerequisiteCapability: "access",
      confidence: "verified",
    });
    expect(status(snapshot, [{ resourceId: "b", capability: "access" }])).toBe(
      "available",
    );
  });

  it("does not confirm a block from an assumed link alone", () => {
    expect(
      status(graph("ALL", "assumed"), [{ resourceId: "b", capability: "access" }]),
    ).toBe("at_risk");
    expect(
      status(graph("ALL", "assumed"), [
        { resourceId: "b", capability: "access" },
        { resourceId: "c", capability: "access" },
      ]),
    ).toBe("blocked");
  });

  it("treats an unknown link as unknown unless another verified route is open", () => {
    expect(
      status(graph("ALL", "unknown"), [{ resourceId: "b", capability: "access" }]),
    ).toBe("unknown");
  });

  it("does not mark a missing prerequisite available", () => {
    const snapshot = graph("ANY");
    snapshot.capabilities = snapshot.capabilities.filter(
      (capability) => capability.resourceId !== "c",
    );
    expect(status(snapshot, [{ resourceId: "b", capability: "access" }])).toBe(
      "unknown",
    );
  });

  it("keeps a dependent capability unknown when it has no group", () => {
    const snapshot: SimulationGraph = {
      capabilities: [dependent("a"), root("b")],
      groups: [],
      links: [],
    };
    expect(status(snapshot, [])).toBe("unknown");
  });

  it("blocks downstream access across multiple hops", () => {
    const snapshot: SimulationGraph = {
      capabilities: [dependent("email"), dependent("code"), root("phone")],
      groups: [
        {
          id: "email-phone",
          resourceId: "email",
          capability: "access",
          requirementMode: "ALL",
          label: "phone",
        },
        {
          id: "code-email",
          resourceId: "code",
          capability: "access",
          requirementMode: "ALL",
          label: "email",
        },
      ],
      links: [
        {
          id: "l1",
          groupId: "email-phone",
          prerequisiteResourceId: "phone",
          prerequisiteCapability: "access",
          confidence: "verified",
        },
        {
          id: "l2",
          groupId: "code-email",
          prerequisiteResourceId: "email",
          prerequisiteCapability: "access",
          confidence: "verified",
        },
      ],
    };
    const result = simulate(snapshot, [
      { resourceId: "phone", capability: "access" },
    ]);
    expect(status(snapshot, [{ resourceId: "phone", capability: "access" }], "code")).toBe(
      "blocked",
    );
    const code = result.impacts.find((impact) => impact.resourceId === "code");
    expect(code?.causalPath.map((node) => node.resourceId)).toEqual([
      "phone",
      "email",
      "code",
    ]);
  });

  it("keeps recovery available when access is blocked", () => {
    const snapshot: SimulationGraph = {
      capabilities: [
        dependent("email"),
        {
          resourceId: "email",
          capability: "recovery",
          mode: "independent",
          confidence: "verified",
        },
        root("phone"),
      ],
      groups: [
        {
          id: "login",
          resourceId: "email",
          capability: "access",
          requirementMode: "ALL",
          label: "phone login",
        },
      ],
      links: [
        {
          id: "l1",
          groupId: "login",
          prerequisiteResourceId: "phone",
          prerequisiteCapability: "access",
          confidence: "verified",
        },
      ],
    };
    const failed: FailureSeed[] = [{ resourceId: "phone", capability: "access" }];
    expect(status(snapshot, failed, "email", "access")).toBe("blocked");
    expect(status(snapshot, failed, "email", "recovery")).toBe("available");
  });

  it("warns on a recovery cycle and does not call it a lockout", () => {
    const snapshot: SimulationGraph = {
      capabilities: [
        dependent("email", "recovery"),
        dependent("vault", "recovery"),
      ],
      groups: [
        {
          id: "email-vault",
          resourceId: "email",
          capability: "recovery",
          requirementMode: "ALL",
          label: "vault",
        },
        {
          id: "vault-email",
          resourceId: "vault",
          capability: "recovery",
          requirementMode: "ALL",
          label: "email",
        },
      ],
      links: [
        {
          id: "l1",
          groupId: "email-vault",
          prerequisiteResourceId: "vault",
          prerequisiteCapability: "recovery",
          confidence: "verified",
        },
        {
          id: "l2",
          groupId: "vault-email",
          prerequisiteResourceId: "email",
          prerequisiteCapability: "recovery",
          confidence: "verified",
        },
      ],
    };
    const result = simulate(snapshot, []);
    expect(result.impacts.every((impact) => impact.status !== "blocked")).toBe(
      true,
    );
    expect(result.warnings.join(" ")).toContain("Potential recovery loop");
    expect(result.warnings.join(" ")).toContain("not proof of lockout");
    expect(result.warnings.join(" ").toLowerCase()).not.toContain("proven lockout");
  });

  it("returns the same result when links are reversed", () => {
    const first = graph("ANY");
    const second: SimulationGraph = {
      ...first,
      links: [...first.links].reverse(),
      groups: [...first.groups].reverse(),
    };
    const failed: FailureSeed[] = [{ resourceId: "b", capability: "access" }];
    expect(simulate(first, failed)).toEqual(simulate(second, failed));
  });

  it("matches the Northstar phone-loss access outcome", () => {
    const names = new Map(
      fixture.resources.map((resource) => [resource.id, resource.name]),
    );
    const { result, blocked, available } = accessByStatus(northstarGraph(), [
      { resourceId: "admin-phone", capability: "access" },
    ]);
    expect(blocked).toEqual([
      "admin-phone",
      "cloud-host",
      "code-host",
      "password-vault",
      "workspace-email",
    ]);
    expect(available).toEqual([
      "backup-admin",
      "backup-key",
      "domain-registrar",
    ]);
    const email = result.impacts.find(
      (impact) =>
        impact.resourceId === "workspace-email" && impact.capability === "access",
    );
    expect(email?.causalPath.map((node) => node.resourceId)).toEqual([
      "admin-phone",
      "workspace-email",
    ]);
    expect(email?.explanation).toContain("Normal login using administrator phone");
    expect(email?.explanation).toContain(names.get("admin-phone"));
    const registrar = result.impacts.find(
      (impact) =>
        impact.resourceId === "domain-registrar" &&
        impact.capability === "access",
    );
    expect(registrar?.causalPath.map((node) => node.resourceId)).toEqual([
      "backup-key",
      "domain-registrar",
    ]);
    const recovery = result.impacts.filter(
      (impact) => impact.capability === "recovery",
    );
    expect(recovery.every((impact) => impact.status !== "blocked")).toBe(true);
    expect(result.warnings.join(" ")).toContain("Potential recovery loop");
    expect(result.warnings.join(" ")).toContain("not proof of lockout");
  });

  it("clears the phone-loss cascade after an independent email route is added", () => {
    const snapshot = northstarGraph();
    const improvement = fixture.demoImprovement;
    if (!improvement) throw new Error("Northstar fixture is missing the demo improvement.");
    snapshot.groups.push({
      id: improvement.group.id,
      resourceId: improvement.resourceId,
      capability: improvement.capability,
      requirementMode: improvement.group.requirementMode,
      label: improvement.group.label,
    });
    snapshot.links.push({
      id: improvement.link.id,
      groupId: improvement.group.id,
      prerequisiteResourceId: improvement.link.prerequisiteResourceId,
      prerequisiteCapability: improvement.link.prerequisiteCapability,
      confidence: improvement.link.confidence,
    });
    const { blocked, available } = accessByStatus(snapshot, [
      { resourceId: "admin-phone", capability: "access" },
    ]);
    expect(blocked).toEqual(["admin-phone"]);
    expect(available).toEqual([
      "backup-admin",
      "backup-key",
      "cloud-host",
      "code-host",
      "domain-registrar",
      "password-vault",
      "workspace-email",
    ]);
  });

  it("does not fail other capabilities on the same resource unless they are seeded", () => {
    const snapshot = northstarGraph();
    const result = simulate(snapshot, [
      { resourceId: "admin-phone", capability: "access" },
    ]);
    const phoneRecovery = result.impacts.find(
      (impact) =>
        impact.resourceId === "admin-phone" && impact.capability === "recovery",
    );
    expect(phoneRecovery).toBeUndefined();
  });
});
