import { z } from "zod";

export const capabilitySchema = z.enum([
  "access",
  "recovery",
  "administration",
]);
export const confidenceSchema = z.enum(["verified", "assumed", "unknown"]);
export const capabilityModeSchema = z.enum([
  "independent",
  "dependent",
  "unknown",
]);
export const requirementModeSchema = z.enum(["ALL", "ANY"]);
export const resourceKindSchema = z.enum([
  "service",
  "identity_provider",
  "email",
  "account",
  "device",
  "person",
  "recovery_method",
  "credential_vault",
  "backup_location",
]);
export const criticalitySchema = z.enum([
  "critical",
  "high",
  "medium",
  "low",
]);
export const resourceStatusSchema = z.enum(["active", "archived"]);

export const SAMPLE_DISCLAIMER =
  "Synthetic sample. These are not statements about real provider default configurations.";

const textField = z.string().min(1);

export const northstarFixtureSchema = z.object({
  workspace: z.object({
    id: textField,
    name: textField,
    fictional: z.literal(true),
  }),
  resources: z
    .array(
      z.object({
        id: textField,
        name: textField,
        kind: resourceKindSchema,
        criticality: criticalitySchema,
        owner: z.string().optional(),
      }),
    )
    .min(1),
  capabilities: z.array(
    z.object({
      resourceId: textField,
      capability: capabilitySchema,
      mode: capabilityModeSchema,
      confidence: confidenceSchema,
    }),
  ),
  groups: z.array(
    z.object({
      id: textField,
      resourceId: textField,
      capability: capabilitySchema,
      requirementMode: requirementModeSchema,
      label: textField,
    }),
  ),
  links: z.array(
    z.object({
      id: textField,
      groupId: textField,
      prerequisiteResourceId: textField,
      prerequisiteCapability: capabilitySchema,
      confidence: confidenceSchema,
    }),
  ),
  disclaimer: z.string().optional(),
});

export type NorthstarFixture = z.infer<typeof northstarFixtureSchema>;

export const mapResourceSchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  kind: resourceKindSchema,
  criticality: criticalitySchema,
  ownerLabel: z.string().nullable(),
  description: z.string().nullable(),
  status: resourceStatusSchema,
});

export const mapCapabilitySchema = z.object({
  id: z.string(),
  resourceId: z.string(),
  capability: capabilitySchema,
  mode: capabilityModeSchema,
  confidence: confidenceSchema,
  notes: z.string().nullable(),
});

export const mapGroupSchema = z.object({
  id: z.string(),
  slug: z.string(),
  resourceId: z.string(),
  capability: capabilitySchema,
  requirementMode: requirementModeSchema,
  label: z.string(),
});

export const mapLinkSchema = z.object({
  id: z.string(),
  slug: z.string(),
  groupId: z.string(),
  prerequisiteResourceId: z.string(),
  prerequisiteCapability: capabilitySchema,
  confidence: confidenceSchema,
  notes: z.string().nullable(),
});

export const workspaceMapSchema = z.object({
  workspace: z
    .object({
      id: z.string(),
      name: z.string(),
      fictional: z.boolean(),
      seedKey: z.string().nullable(),
    })
    .nullable(),
  resources: z.array(mapResourceSchema),
  capabilities: z.array(mapCapabilitySchema),
  groups: z.array(mapGroupSchema),
  links: z.array(mapLinkSchema),
  disclaimer: z.string(),
});

export type WorkspaceMap = z.infer<typeof workspaceMapSchema>;

export const seedNorthstarResultSchema = z.object({
  id: z.string(),
  name: z.string(),
  created: z.boolean(),
  resourceCount: z.number().int(),
  capabilityCount: z.number().int(),
  groupCount: z.number().int(),
  linkCount: z.number().int(),
  _receipt: z
    .object({
      changed: z.boolean(),
      verified: z.union([z.boolean(), z.literal("unverified")]),
      summary: z.string(),
    })
    .optional(),
});
