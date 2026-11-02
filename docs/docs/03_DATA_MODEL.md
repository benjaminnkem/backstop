# Data Model and Persistence Contract

## Guiding principles

1. Every tenant-owned table is workspace/org scoped using scaffold ownership conventions.
2. Resource identity differs from a capability. A cloud service may be reachable for normal users but not administrable by its operator.
3. **No dependency is not the same as proven independence.** Each capability has an explicit `mode`: `independent`, `dependent`, or `unknown`.
4. Mutations must preserve historical simulations; prefer archiving/soft deletion for referenced resources.
5. In a simulation, treat the graph as a snapshot to prevent later edits from rewriting history.

## Logical tables

### `resources`

`id`, `workspace_id` (or `org_id` mapped to scaffold), `name`, `kind`, `criticality`, `owner_label`, `description`, `status`, `created_at`, `updated_at`.

**Kinds:** `service`, `identity_provider`, `email`, `account`, `device`, `person`, `recovery_method`, `credential_vault`, `backup_location`.

**Criticality:** `critical`, `high`, `medium`, `low`.

### `resource_capabilities`

`id`, `workspace_id`, `resource_id`, `capability`, `mode`, `confidence`, `notes`, `updated_at`.

**Capabilities:** `access`, `recovery`, `administration`.

**Mode:** `independent` (explicitly documented independent route), `dependent` (requires at least one dependency group), `unknown` (insufficiently documented).

Root-mode `independent` is a **model assertion**, not live verification. `confidence` tracks verified/assumed/unknown.

### `dependency_groups`

`id`, `workspace_id`, `resource_id`, `capability`, `requirement_mode`, `label`, `created_at`.

One group is one path to support the capability. Groups targeting the same `(resource, capability)` are **OR alternatives**. Links inside a group use `ALL` or `ANY` according to `requirement_mode`.

### `dependency_links`

`id`, `workspace_id`, `group_id`, `prerequisite_resource_id`, `prerequisite_capability`, `confidence`, `notes`, `last_verified_at`.

The prerequisite and group target must belong to the *same* workspace.

### `simulation_runs`

`id`, `workspace_id`, `name`, `input_json`, `graph_snapshot_json` (or version reference), `summary_json`, `created_by`, `created_at`, `status`.

Store failed resource IDs **and capabilities**. Graph snapshot enables an honest replay of historical results.

### `simulation_impacts`

`id`, `workspace_id`, `simulation_id`, `resource_id`, `capability`, `status`, `explanation`, `causal_path_json`, `confidence`, `created_at`.

### `remediation_tasks`

`id`, `workspace_id`, `resource_id?`, `simulation_id?`, `title`, `description`, `reason`, `priority`, `status`, `owner_label?`, `created_by`, `created_at`, `updated_at`.

### `recovery_tests`

`id`, `workspace_id`, `resource_id`, `method_label`, `outcome`, `human_confirmed_by`, `tested_at`, `evidence_notes?`, `created_at`.

`outcome`: `passed`, `failed`, `not_tested`. Agent cannot independently set `passed`.

### `runbook_exports` (optional after core demo works)

`id`, `workspace_id`, `created_by`, `created_at`, `source_snapshot_json`, `file_storage_key?`, `status`.

Can instead generate on demand to avoid excessive scope.

## Constraints and indexes

- Foreign keys for group → target resource; link → group+prerequisite; impact → run+resource.
- Unique `resource_capabilities(resource_id, capability)`.
- Unique `dependency_links(group_id, prerequisite_resource_id, prerequisite_capability)`.
- Prevent empty dependent groups or treat them as `unknown` consistently.
- Index `(workspace_id, status)` on tasks and resources; `(workspace_id, created_at)` on simulations.
- Workspace ownership must be checked on read and write; constraints alone do not authorize access.
- Transactions for multi-row simulation creation.
- Do not store secrets; validate notes against accidental secret entry where feasible.

## Example state distinction

| Resource | Capability | Status | Interpretation |
|---|---|---|---|
| Company email | access | blocked | Everyday login route unavailable due to phone-loss scenario |
| Company email | recovery | available | Separate recovery route is documented as available; recovery still requires an actual human process |
| Cloud hosting | access | blocked | Depends on company email's access capability |
| Domain registrar | access | available | Hardware key survives as independent alternative |

A `recovery: available` result does **not** automatically convert `access: blocked` to `access: available` or claim a real-world account has been recovered.

## Migration notes

The schema in this pack is a **logical contract**, not copy/paste production SQL. Use the generated Drizzle conventions for `orgId`, `ownerEmail`, schema exposure, table migrations, and provider-specific column types. Treat changing the generated scaffold's auth tables as a last resort.
