import { runMigrations } from "@agent-native/core/db";

const timestampDefault = `to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;

export default runMigrations(
  [
    {
      version: 1,
      name: "recovery_graph_tables",
      sql: `
CREATE TABLE IF NOT EXISTS recovery_workspaces (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  seed_key TEXT,
  tenant_key TEXT NOT NULL,
  fictional BOOLEAN NOT NULL DEFAULT false,
  owner_email TEXT NOT NULL DEFAULT 'local@localhost',
  org_id TEXT,
  visibility TEXT NOT NULL DEFAULT 'private',
  created_at TEXT NOT NULL DEFAULT (${timestampDefault}),
  updated_at TEXT NOT NULL DEFAULT (${timestampDefault})
);
CREATE UNIQUE INDEX IF NOT EXISTS recovery_workspaces_tenant_seed
  ON recovery_workspaces (tenant_key, seed_key);
CREATE INDEX IF NOT EXISTS recovery_workspaces_owner
  ON recovery_workspaces (owner_email, created_at);

CREATE TABLE IF NOT EXISTS recovery_workspace_shares (
  id TEXT PRIMARY KEY,
  resource_id TEXT NOT NULL,
  principal_type TEXT NOT NULL,
  principal_id TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'viewer',
  created_by TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (${timestampDefault}),
  notified_at TEXT
);

CREATE TABLE IF NOT EXISTS recovery_resources (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES recovery_workspaces (id),
  slug TEXT NOT NULL,
  name TEXT NOT NULL,
  kind TEXT NOT NULL,
  criticality TEXT NOT NULL,
  owner_label TEXT,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  owner_email TEXT NOT NULL,
  org_id TEXT,
  created_at TEXT NOT NULL DEFAULT (${timestampDefault}),
  updated_at TEXT NOT NULL DEFAULT (${timestampDefault}),
  CONSTRAINT recovery_resources_kind CHECK (kind IN ('service', 'identity_provider', 'email', 'account', 'device', 'person', 'recovery_method', 'credential_vault', 'backup_location')),
  CONSTRAINT recovery_resources_criticality CHECK (criticality IN ('critical', 'high', 'medium', 'low')),
  CONSTRAINT recovery_resources_status CHECK (status IN ('active', 'archived'))
);
CREATE UNIQUE INDEX IF NOT EXISTS recovery_resources_workspace_slug
  ON recovery_resources (workspace_id, slug);
CREATE INDEX IF NOT EXISTS recovery_resources_workspace_status
  ON recovery_resources (workspace_id, status);

CREATE TABLE IF NOT EXISTS recovery_capabilities (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES recovery_workspaces (id),
  resource_id TEXT NOT NULL REFERENCES recovery_resources (id),
  capability TEXT NOT NULL,
  mode TEXT NOT NULL,
  confidence TEXT NOT NULL,
  notes TEXT,
  owner_email TEXT NOT NULL,
  org_id TEXT,
  updated_at TEXT NOT NULL DEFAULT (${timestampDefault}),
  CONSTRAINT recovery_capabilities_capability CHECK (capability IN ('access', 'recovery', 'administration')),
  CONSTRAINT recovery_capabilities_mode CHECK (mode IN ('independent', 'dependent', 'unknown')),
  CONSTRAINT recovery_capabilities_confidence CHECK (confidence IN ('verified', 'assumed', 'unknown'))
);
CREATE UNIQUE INDEX IF NOT EXISTS recovery_capabilities_resource_capability
  ON recovery_capabilities (resource_id, capability);
CREATE INDEX IF NOT EXISTS recovery_capabilities_workspace
  ON recovery_capabilities (workspace_id);

CREATE TABLE IF NOT EXISTS recovery_dependency_groups (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES recovery_workspaces (id),
  resource_id TEXT NOT NULL REFERENCES recovery_resources (id),
  slug TEXT NOT NULL,
  capability TEXT NOT NULL,
  requirement_mode TEXT NOT NULL,
  label TEXT NOT NULL,
  owner_email TEXT NOT NULL,
  org_id TEXT,
  created_at TEXT NOT NULL DEFAULT (${timestampDefault}),
  CONSTRAINT recovery_dependency_groups_capability CHECK (capability IN ('access', 'recovery', 'administration')),
  CONSTRAINT recovery_dependency_groups_mode CHECK (requirement_mode IN ('ALL', 'ANY'))
);
CREATE UNIQUE INDEX IF NOT EXISTS recovery_dependency_groups_workspace_slug
  ON recovery_dependency_groups (workspace_id, slug);
CREATE INDEX IF NOT EXISTS recovery_dependency_groups_target
  ON recovery_dependency_groups (resource_id, capability);

CREATE TABLE IF NOT EXISTS recovery_dependency_links (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES recovery_workspaces (id),
  group_id TEXT NOT NULL REFERENCES recovery_dependency_groups (id),
  slug TEXT NOT NULL,
  prerequisite_resource_id TEXT NOT NULL REFERENCES recovery_resources (id),
  prerequisite_capability TEXT NOT NULL,
  confidence TEXT NOT NULL,
  notes TEXT,
  last_verified_at TEXT,
  owner_email TEXT NOT NULL,
  org_id TEXT,
  created_at TEXT NOT NULL DEFAULT (${timestampDefault}),
  CONSTRAINT recovery_dependency_links_capability CHECK (prerequisite_capability IN ('access', 'recovery', 'administration')),
  CONSTRAINT recovery_dependency_links_confidence CHECK (confidence IN ('verified', 'assumed', 'unknown'))
);
CREATE UNIQUE INDEX IF NOT EXISTS recovery_dependency_links_workspace_slug
  ON recovery_dependency_links (workspace_id, slug);
CREATE UNIQUE INDEX IF NOT EXISTS recovery_dependency_links_group_prereq
  ON recovery_dependency_links (group_id, prerequisite_resource_id, prerequisite_capability);
CREATE INDEX IF NOT EXISTS recovery_dependency_links_workspace
  ON recovery_dependency_links (workspace_id);

CREATE TABLE IF NOT EXISTS recovery_simulation_runs (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES recovery_workspaces (id),
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'completed',
  input_json TEXT NOT NULL,
  graph_snapshot_json TEXT NOT NULL,
  summary_json TEXT NOT NULL,
  created_by TEXT NOT NULL,
  owner_email TEXT NOT NULL,
  org_id TEXT,
  created_at TEXT NOT NULL DEFAULT (${timestampDefault}),
  CONSTRAINT recovery_simulation_runs_status CHECK (status IN ('completed', 'failed'))
);
CREATE INDEX IF NOT EXISTS recovery_simulation_runs_workspace_created
  ON recovery_simulation_runs (workspace_id, created_at);

CREATE TABLE IF NOT EXISTS recovery_simulation_impacts (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES recovery_workspaces (id),
  simulation_id TEXT NOT NULL REFERENCES recovery_simulation_runs (id),
  resource_id TEXT NOT NULL REFERENCES recovery_resources (id),
  capability TEXT NOT NULL,
  status TEXT NOT NULL,
  explanation TEXT NOT NULL,
  causal_path_json TEXT NOT NULL,
  confidence TEXT NOT NULL,
  owner_email TEXT NOT NULL,
  org_id TEXT,
  created_at TEXT NOT NULL DEFAULT (${timestampDefault}),
  CONSTRAINT recovery_simulation_impacts_capability CHECK (capability IN ('access', 'recovery', 'administration')),
  CONSTRAINT recovery_simulation_impacts_status CHECK (status IN ('available', 'blocked', 'at_risk', 'unknown')),
  CONSTRAINT recovery_simulation_impacts_confidence CHECK (confidence IN ('verified', 'assumed', 'unknown'))
);
CREATE INDEX IF NOT EXISTS recovery_simulation_impacts_run
  ON recovery_simulation_impacts (simulation_id);
CREATE INDEX IF NOT EXISTS recovery_simulation_impacts_workspace
  ON recovery_simulation_impacts (workspace_id);
`,
    },
  ],
  { table: "backstop_migrations" },
);
