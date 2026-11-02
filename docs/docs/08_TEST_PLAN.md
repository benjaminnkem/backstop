# QA, Test Cases and Acceptance Gates

## Test pyramid

### Pure deterministic simulator (unit)

| ID | Setup | Expected |
|---|---|---|
| SIM-01 | A depends ALL on B; B failed | A blocked |
| SIM-02 | A depends ANY on B or C; B failed, C independent | A available |
| SIM-03 | ANY alternatives B,C both failed | A blocked |
| SIM-04 | One of two route groups succeeds | A available |
| SIM-05 | B→C→D chain with D failed | All dependent capabilities blocked |
| SIM-06 | A access blocked, A recovery independent | Access blocked; recovery available |
| SIM-07 | Only uncertain/assumed prerequisite | at_risk/unknown; no fabricated certainty |
| SIM-08 | Missing baseline configuration | unknown |
| SIM-09 | Circular dependencies without independent route | Terminates; flags potential cycle |
| SIM-10 | Circle with separate verified alternative | Alternative path remains available |
| SIM-11 | Same graph reordered | Identical deterministic results |
| SIM-12 | Rerun after independent route added | Number blocked falls accordingly |

### Actions/database (integration)

- Resource, group and link CRUD persist through actions.
- Foreign-key and workspace checks reject cross-tenant references.
- Simulation and impacts persist atomically (failure rolls back).
- User can retrieve old run whose results remain stable after editing live graph.
- Agent invokes same action as UI; no parallel fake endpoint.
- Task creation is internal; no claim of external provider changes.
- Recovery-test `passed` requires explicit user confirmation.
- Runbook includes uncertainty and never outputs secrets.
- Invalid enum/empty group/unknown ID returns helpful validation error.

### User experience (E2E)

1. Open fictional Northstar Studio.
2. Inspect email dependencies and verify phone/hardware key are represented correctly.
3. Run phone-loss simulation.
4. Verify domain registrar remains available via key; email access and dependent services are blocked.
5. Ask agent “Why is code hosting affected?” and verify explanation points to email → phone path.
6. Create a remediation task and verify it appears in board.
7. Add independent verified email access path **after explicitly modelling it as configured**.
8. Rerun and verify blocked count falls.
9. Generate runbook and inspect no invented/tested claims.
10. Record test success via a human-confirmed control; verify timestamps.

## Acceptance gates / P0

- No false green state for unknown baseline.
- No false blocked state when independent verified ANY alternative remains.
- No secrets in fixtures, logs or runbook.
- No cross-tenant data access.
- Graph edits persist and drive the actual simulator.
- Agent explanation uses simulator output rather than hallucinated reasoning.
- Public demonstration shows actual working application, not prerecorded UI mockups.

## Performance targets (pragmatic, not contractual)

For sample graph 8–20 resources, simulation should feel immediate. Avoid loading animations that pretend to perform external scanning. Test a larger synthetic graph (e.g. 100 resources) for no hang and stable result, but do not optimize prematurely.
