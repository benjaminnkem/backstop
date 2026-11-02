# Build Plan, Prioritization and Team Handoff

**As of Nov 2, 2026:** The deadline is one week away. Build a strong **vertical slice** before optional screens.

## Priority tiers

### P0 — Must ship

1. Official Agent-Native Chat scaffold boots and connects to its database.
2. Resource/capability/dependency data model + fictional fixture.
3. `get-workspace-map`, resource/link mutation actions.
4. Deterministic simulator with ALL/ANY and alternate-route logic, confidence and cycle warnings.
5. Graph/map UI with select/highlight.
6. One scenario runner with persisted results.
7. Agent uses simulation action + real results to explain impact.
8. A user changes the graph and a rerun reflects the change.
9. Polished public demo and actual submission.

### P1 — Strong additions

- Remediation task board and action.
- Runbook display/export.
- Recovery test records with human confirmation.
- Clear error/empty states and workspace authorization tests.

### P2 — Only if time remains

- Multiple custom simulation presets.
- Comparative run timelines and scenario bookmarking.
- Rich graph editing animations.
- Team invitation and sophisticated permissions.

**Never implement for MVP:** external SaaS OAuth, credential storage, automatic external setting updates, enterprise GRC, billing and live security probes.

## Suggested implementation milestones

| Date | Build focus | Exit condition |
|---|---|---|
| Nov 2 | Scaffold, schema, seed, verified action conventions | App boots with persisted fictional graph |
| Nov 3 | Simulator + tests | Phone-loss, ALL/ANY, cycles and unknowns correct |
| Nov 4 | Graph UI and path highlighting | Editing graph changes simulation input |
| Nov 5 | Agent integration + navigation context | Agent calls real actions and explains results |
| Nov 6 | Remediation, runbook, error states | End-to-end workflow complete |
| Nov 7 | QA, deployment, demo rehearsal | Repeatable vertical slice without hidden steps |
| Nov 8 | Clips recording + final fixes | Public demo verified incognito |
| Nov 9 | Submit early, confirm receipt | Final submission received |

These dates are planning targets, not framework guarantees.

## Parallel team split (if two developers)

**Developer A — Domain/backend/agent**
- Schema, seed import, action layer and tenant scopes.
- Pure simulator, confidence/cycle logic and unit tests.
- Agent context/action wiring, runbook generation.

**Developer B — Frontend/experience**
- Layout, graph nodes/edges, inspector, simulation overlay.
- Scenario picker, result drill-down and task screens.
- Microcopy, loading/error, demo visual polish and recording.

**Integration checkpoints:** agree on `examples/domain-types.ts` first. Freeze key output fields by Nov 3 to avoid parallel schema drift. Run the full demo together daily.

## Definition of done

- [ ] A new workspace or sample workspace opens cleanly.
- [ ] Graph objects are persisted and editable.
- [ ] Simulation calculates per-capability results deterministically.
- [ ] Independent alternatives and missing data are treated correctly.
- [ ] A potential recovery loop is visible without false lockout claims.
- [ ] Agent can inspect map and call the simulation action.
- [ ] Agent creates remediation task only on approval.
- [ ] Human can model improved route and rerun.
- [ ] Recovery tests and runbook do not claim unverified success.
- [ ] No credentials or real sensitive org data are used.
- [ ] Auth/workspace scoping verified.
- [ ] Clips demo is public and submitted before deadline.
