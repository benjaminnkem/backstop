# Decisions, Risks and Open Questions

## Locked decisions

- BACKSTOP is a **manual dependency mapping + failure simulation** product, not an external account integration.
- Agent-Native is the framework; do not build a parallel agent infrastructure.
- React + TypeScript frontend, Drizzle/Postgres domain layer, React Flow graph.
- Graph status per **capability** rather than naive single online/offline state.
- Explicit baseline capabilities with `independent`, `dependent`, `unknown` modes.
- Alternative groups are OR; within-group `ALL`/`ANY` controls prerequisite requirements.
- Missing data must not render as confirmed safe.
- Pure deterministic simulation, no LLM-calculated blast radius.
- Human approval for remediation changes and human-confirmed recovery tests.
- No credentials, external service changes or provider scanning.
- Fictional Northstar Studio demo, with before/after graph impact.
- Domain tables use the `recovery_` prefix. Agent-Native Chat already owns a `resources` table for agent files, so the product tables are `recovery_workspaces`, `recovery_resources`, `recovery_capabilities`, `recovery_dependency_groups`, `recovery_dependency_links`, `recovery_simulation_runs`, and `recovery_simulation_impacts`.
- A recovery workspace is the ownable team boundary (`ownableColumns` plus shares). Child rows store the same `owner_email` and `org_id` and are read only after access to that workspace is checked. `tenant_key` is `org:<orgId>` or `user:<email>` so the Northstar seed is unique per team. Stable fixture ids are stored as `slug`, and row ids are UUIDs.

## Risks and mitigations

| Risk | Severity | Mitigation |
|---|---|---|
| Simulator incorrectly handles alternative routes | Critical | Explicit truth tables and tests before UI |
| Model shows a false “secure” green status | Critical | Unknown baseline + per-capability status labels |
| Agent invents provider settings | High | Tool-grounded prompts + no external API claims |
| Ambiguous cycle means a false lockout | High | Cycle as warning, not automatic failure |
| Workspace leakage | Critical | Scoped server actions + cross-tenant tests |
| Real secrets uploaded | Critical | Strong UI warnings + exclude fields + testing |
| UI/agent maintain separate copies of state | High | Shared defineAction domain layer |
| Scope explosion before deadline | High | P0-first strict triage |
| No reliable demo | High | Fictional seed, repeatable demo reset, early rehearsal |
| Framework API changes | Medium | Inspect generated starter; use official docs |

## Open technical questions

- Exact storage/access helpers in **this** generated scaffold (version-dependent).
- Whether Chat starter's sharing/org model needs a lightweight workspace wrapper.
- Whether runbooks should be generated on demand or snapshot-persisted.
- Exact UI cache invalidation or polling mechanisms in generated template.
- If model confidence is assumed, should `at_risk` or `unknown` take precedence in a specific edge case? Document/test the final precedence policy.
- Cycle path display strategy and layout performance for >100 nodes.
- Specific deployment provider and model API/provider configuration.

## What cannot be claimed

- “Proves your accounts can be recovered.”
- “Tests live providers.”
- “Automatically secures your accounts.”
- “No other company has ever built this.”
- “Security certified.”
