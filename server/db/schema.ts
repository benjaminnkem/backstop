import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  pgTable,
  text,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import {
  createSharesTable,
  ownableColumns,
} from "@agent-native/core/db/schema";

const timestamp = (name: string) =>
  text(name)
    .notNull()
    .default(
      sql`(to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))`,
    );

/**
 * Team recovery map. The framework already owns a `resources` table for
 * agent files, so domain tables use the `recovery_` prefix.
 * `tenant_key` is `org:<orgId>` or `user:<email>` and is not an identity column.
 */
export const recoveryWorkspaces = pgTable(
  "recovery_workspaces",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    seedKey: text("seed_key"),
    tenantKey: text("tenant_key").notNull(),
    fictional: boolean("fictional").notNull().default(false),
    ...ownableColumns(),
    createdAt: timestamp("created_at"),
    updatedAt: timestamp("updated_at"),
  },
  (table) => [
    uniqueIndex("recovery_workspaces_tenant_seed").on(
      table.tenantKey,
      table.seedKey,
    ),
    index("recovery_workspaces_owner").on(table.ownerEmail, table.createdAt),
  ],
);

export const recoveryWorkspaceShares = createSharesTable(
  "recovery_workspace_shares",
);

export const recoveryResources = pgTable(
  "recovery_resources",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => recoveryWorkspaces.id),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    kind: text("kind").notNull(),
    criticality: text("criticality").notNull(),
    ownerLabel: text("owner_label"),
    description: text("description"),
    status: text("status").notNull().default("active"),
    ownerEmail: text("owner_email").notNull(),
    orgId: text("org_id"),
    createdAt: timestamp("created_at"),
    updatedAt: timestamp("updated_at"),
  },
  (table) => [
    uniqueIndex("recovery_resources_workspace_slug").on(
      table.workspaceId,
      table.slug,
    ),
    index("recovery_resources_workspace_status").on(
      table.workspaceId,
      table.status,
    ),
    check(
      "recovery_resources_kind",
      sql`${table.kind} in ('service', 'identity_provider', 'email', 'account', 'device', 'person', 'recovery_method', 'credential_vault', 'backup_location')`,
    ),
    check(
      "recovery_resources_criticality",
      sql`${table.criticality} in ('critical', 'high', 'medium', 'low')`,
    ),
    check(
      "recovery_resources_status",
      sql`${table.status} in ('active', 'archived')`,
    ),
  ],
);

export const recoveryCapabilities = pgTable(
  "recovery_capabilities",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => recoveryWorkspaces.id),
    resourceId: text("resource_id")
      .notNull()
      .references(() => recoveryResources.id),
    capability: text("capability").notNull(),
    mode: text("mode").notNull(),
    confidence: text("confidence").notNull(),
    notes: text("notes"),
    ownerEmail: text("owner_email").notNull(),
    orgId: text("org_id"),
    updatedAt: timestamp("updated_at"),
  },
  (table) => [
    uniqueIndex("recovery_capabilities_resource_capability").on(
      table.resourceId,
      table.capability,
    ),
    index("recovery_capabilities_workspace").on(table.workspaceId),
    check(
      "recovery_capabilities_capability",
      sql`${table.capability} in ('access', 'recovery', 'administration')`,
    ),
    check(
      "recovery_capabilities_mode",
      sql`${table.mode} in ('independent', 'dependent', 'unknown')`,
    ),
    check(
      "recovery_capabilities_confidence",
      sql`${table.confidence} in ('verified', 'assumed', 'unknown')`,
    ),
  ],
);

export const recoveryDependencyGroups = pgTable(
  "recovery_dependency_groups",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => recoveryWorkspaces.id),
    resourceId: text("resource_id")
      .notNull()
      .references(() => recoveryResources.id),
    slug: text("slug").notNull(),
    capability: text("capability").notNull(),
    requirementMode: text("requirement_mode").notNull(),
    label: text("label").notNull(),
    ownerEmail: text("owner_email").notNull(),
    orgId: text("org_id"),
    createdAt: timestamp("created_at"),
  },
  (table) => [
    uniqueIndex("recovery_dependency_groups_workspace_slug").on(
      table.workspaceId,
      table.slug,
    ),
    index("recovery_dependency_groups_target").on(
      table.resourceId,
      table.capability,
    ),
    check(
      "recovery_dependency_groups_capability",
      sql`${table.capability} in ('access', 'recovery', 'administration')`,
    ),
    check(
      "recovery_dependency_groups_mode",
      sql`${table.requirementMode} in ('ALL', 'ANY')`,
    ),
  ],
);

export const recoveryDependencyLinks = pgTable(
  "recovery_dependency_links",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => recoveryWorkspaces.id),
    groupId: text("group_id")
      .notNull()
      .references(() => recoveryDependencyGroups.id),
    slug: text("slug").notNull(),
    prerequisiteResourceId: text("prerequisite_resource_id")
      .notNull()
      .references(() => recoveryResources.id),
    prerequisiteCapability: text("prerequisite_capability").notNull(),
    confidence: text("confidence").notNull(),
    notes: text("notes"),
    lastVerifiedAt: text("last_verified_at"),
    ownerEmail: text("owner_email").notNull(),
    orgId: text("org_id"),
    createdAt: timestamp("created_at"),
  },
  (table) => [
    uniqueIndex("recovery_dependency_links_workspace_slug").on(
      table.workspaceId,
      table.slug,
    ),
    uniqueIndex("recovery_dependency_links_group_prereq").on(
      table.groupId,
      table.prerequisiteResourceId,
      table.prerequisiteCapability,
    ),
    index("recovery_dependency_links_workspace").on(table.workspaceId),
    check(
      "recovery_dependency_links_capability",
      sql`${table.prerequisiteCapability} in ('access', 'recovery', 'administration')`,
    ),
    check(
      "recovery_dependency_links_confidence",
      sql`${table.confidence} in ('verified', 'assumed', 'unknown')`,
    ),
  ],
);

export const recoverySimulationRuns = pgTable(
  "recovery_simulation_runs",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => recoveryWorkspaces.id),
    name: text("name").notNull(),
    status: text("status").notNull().default("completed"),
    inputJson: text("input_json").notNull(),
    graphSnapshotJson: text("graph_snapshot_json").notNull(),
    summaryJson: text("summary_json").notNull(),
    createdBy: text("created_by").notNull(),
    ownerEmail: text("owner_email").notNull(),
    orgId: text("org_id"),
    createdAt: timestamp("created_at"),
  },
  (table) => [
    index("recovery_simulation_runs_workspace_created").on(
      table.workspaceId,
      table.createdAt,
    ),
    check(
      "recovery_simulation_runs_status",
      sql`${table.status} in ('completed', 'failed')`,
    ),
  ],
);

export const recoverySimulationImpacts = pgTable(
  "recovery_simulation_impacts",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => recoveryWorkspaces.id),
    simulationId: text("simulation_id")
      .notNull()
      .references(() => recoverySimulationRuns.id),
    resourceId: text("resource_id")
      .notNull()
      .references(() => recoveryResources.id),
    capability: text("capability").notNull(),
    status: text("status").notNull(),
    explanation: text("explanation").notNull(),
    causalPathJson: text("causal_path_json").notNull(),
    confidence: text("confidence").notNull(),
    ownerEmail: text("owner_email").notNull(),
    orgId: text("org_id"),
    createdAt: timestamp("created_at"),
  },
  (table) => [
    index("recovery_simulation_impacts_run").on(table.simulationId),
    index("recovery_simulation_impacts_workspace").on(table.workspaceId),
    check(
      "recovery_simulation_impacts_capability",
      sql`${table.capability} in ('access', 'recovery', 'administration')`,
    ),
    check(
      "recovery_simulation_impacts_status",
      sql`${table.status} in ('available', 'blocked', 'at_risk', 'unknown')`,
    ),
    check(
      "recovery_simulation_impacts_confidence",
      sql`${table.confidence} in ('verified', 'assumed', 'unknown')`,
    ),
  ],
);

export const recoveryRemediationTasks = pgTable(
  "recovery_remediation_tasks",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => recoveryWorkspaces.id),
    resourceId: text("resource_id").references(() => recoveryResources.id),
    simulationId: text("simulation_id").references(
      () => recoverySimulationRuns.id,
    ),
    title: text("title").notNull(),
    description: text("description"),
    reason: text("reason"),
    priority: text("priority").notNull().default("medium"),
    status: text("status").notNull().default("open"),
    ownerLabel: text("owner_label"),
    createdBy: text("created_by").notNull(),
    ownerEmail: text("owner_email").notNull(),
    orgId: text("org_id"),
    createdAt: timestamp("created_at"),
    updatedAt: timestamp("updated_at"),
  },
  (table) => [
    index("recovery_remediation_tasks_workspace_status").on(
      table.workspaceId,
      table.status,
    ),
    check(
      "recovery_remediation_tasks_priority",
      sql`${table.priority} in ('urgent', 'high', 'medium', 'low')`,
    ),
    check(
      "recovery_remediation_tasks_status",
      sql`${table.status} in ('open', 'in_progress', 'completed', 'dismissed')`,
    ),
  ],
);
