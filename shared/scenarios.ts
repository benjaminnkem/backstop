import type { Capability } from "./recovery.js";

export interface ScenarioPreset {
  id: string;
  name: string;
  summary: string;
  /** Resource slugs to try, in order. The first one on the map is used. */
  candidates: Array<{ slug: string; capability: Capability }>;
}

/** PRD 7.3 scenarios. Each one fails one capability on a known resource. */
export const SCENARIO_PRESETS: ScenarioPreset[] = [
  {
    id: "lost-phone",
    name: "Primary administrator loses phone",
    summary: "The administrator's phone cannot be used to sign in.",
    candidates: [{ slug: "admin-phone", capability: "access" }],
  },
  {
    id: "email-down",
    name: "Company email unavailable",
    summary: "Nobody can sign in to the workspace email account.",
    candidates: [{ slug: "workspace-email", capability: "access" }],
  },
  {
    id: "idp-down",
    name: "Identity provider unavailable",
    summary: "Single sign-on cannot complete a login.",
    candidates: [
      { slug: "identity-provider", capability: "access" },
      { slug: "idp", capability: "access" },
      { slug: "sso", capability: "access" },
    ],
  },
  {
    id: "admin-absent",
    name: "Secondary administrator unavailable",
    summary: "The backup administrator cannot be reached.",
    candidates: [{ slug: "backup-admin", capability: "access" }],
  },
  {
    id: "vault-down",
    name: "Password vault unavailable",
    summary: "Nobody can open the shared password vault.",
    candidates: [{ slug: "password-vault", capability: "access" }],
  },
];

export interface ResolvedScenario {
  id: string;
  name: string;
  summary: string;
  failed: { resourceId: string; capability: Capability };
}

/** Keep only presets whose resource and capability exist on this map. */
export function resolveScenarios(
  resources: Array<{ id: string; slug: string; status?: string }>,
  capabilities: Array<{ resourceId: string; capability: Capability }>,
): ResolvedScenario[] {
  const bySlug = new Map(
    resources
      .filter((resource) => resource.status !== "archived")
      .map((resource) => [resource.slug, resource.id]),
  );
  const has = new Set(
    capabilities.map((item) => `${item.resourceId}/${item.capability}`),
  );
  const resolved: ResolvedScenario[] = [];
  for (const preset of SCENARIO_PRESETS) {
    for (const candidate of preset.candidates) {
      const resourceId = bySlug.get(candidate.slug);
      if (!resourceId || !has.has(`${resourceId}/${candidate.capability}`)) {
        continue;
      }
      resolved.push({
        id: preset.id,
        name: preset.name,
        summary: preset.summary,
        failed: { resourceId, capability: candidate.capability },
      });
      break;
    }
  }
  return resolved;
}
