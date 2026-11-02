import { readFileSync } from "node:fs";

import {
  northstarFixtureSchema,
  type NorthstarFixture,
} from "../../shared/recovery.js";
import { findSecretText } from "./secrets.js";

let cached: NorthstarFixture | null = null;

export function loadNorthstarFixture(): NorthstarFixture {
  if (cached) return cached;
  const raw = readFileSync(
    new URL("../../docs/fixtures/northstar-studio.json", import.meta.url),
    "utf8",
  );
  const fixture = northstarFixtureSchema.parse(JSON.parse(raw));
  const texts = [
    fixture.workspace.name,
    ...fixture.resources.flatMap((resource) => [
      resource.name,
      resource.owner ?? "",
    ]),
    ...fixture.groups.map((group) => group.label),
  ];
  if (texts.some((text) => findSecretText(text))) {
    throw new Error("Northstar fixture contains a secret-shaped value.");
  }
  const resourceIds = new Set(fixture.resources.map((resource) => resource.id));
  const groupIds = new Set(fixture.groups.map((group) => group.id));
  for (const capability of fixture.capabilities) {
    if (!resourceIds.has(capability.resourceId)) {
      throw new Error(
        `Capability references missing resource ${capability.resourceId}.`,
      );
    }
  }
  for (const group of fixture.groups) {
    if (!resourceIds.has(group.resourceId)) {
      throw new Error(`Group ${group.id} references a missing resource.`);
    }
  }
  for (const link of fixture.links) {
    if (!groupIds.has(link.groupId)) {
      throw new Error(`Link ${link.id} references a missing group.`);
    }
    if (!resourceIds.has(link.prerequisiteResourceId)) {
      throw new Error(`Link ${link.id} references a missing prerequisite.`);
    }
  }
  const groupsByTarget = new Map<string, number>();
  for (const group of fixture.groups) {
    const key = `${group.resourceId}:${group.capability}`;
    groupsByTarget.set(key, (groupsByTarget.get(key) ?? 0) + 1);
  }
  for (const capability of fixture.capabilities) {
    if (capability.mode !== "dependent") continue;
    const count =
      groupsByTarget.get(`${capability.resourceId}:${capability.capability}`) ??
      0;
    if (count === 0) {
      throw new Error(
        `${capability.resourceId} ${capability.capability} is dependent with no group.`,
      );
    }
  }
  cached = fixture;
  return fixture;
}
