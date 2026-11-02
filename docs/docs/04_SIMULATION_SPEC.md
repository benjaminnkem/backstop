# Deterministic Simulation: Formal Specification

## 1. Contract

**Input:** one workspace-scoped graph snapshot + a list of failed `(resourceId, capability)` seeds.  
**Output:** stable status for each resource/capability, linked causal paths, uncertainty signals, possible recovery cycles and transparent summary counts.  
**Non-goal:** claiming actual external provider state; the engine evaluates **user-entered assumptions**.

## 2. Status vocabulary

- `available` — an adequate documented route remains available under model assumptions.
- `blocked` — all documented routes for the capability are confirmed blocked by this scenario.
- `at_risk` — a relevant dependency is assumed, or the outcome is otherwise contingent on an unverified relationship.
- `unknown` — missing/insufficient model detail prevents determination.

These are **capability statuses**, not guarantees about external service uptime.

## 3. Capability baselines

Every resource capability has a baseline mode:

- `independent`: available unless failed in the scenario; if confidence unverified, classify conservatively.
- `dependent`: evaluate its dependency groups; no groups is `unknown`.
- `unknown`: remains `unknown` absent explicit information; never assume safe.

## 4. Dependency semantics

`dependency_groups` for one target `(resource, capability)` are alternative **routes** (logical OR). Inside each group, the `requirement_mode` is either `ALL` or `ANY` across its prerequisite links.

### ALL truth table

| Prerequisite states | Group result |
|---|---|
| All available | Available |
| Any blocked, even if others available/unknown | Blocked |
| No blocked, but any unknown | Unknown |
| No blocked/unknown, but any at-risk | At risk |

### ANY truth table

| Prerequisite states | Group result |
|---|---|
| At least one available | Available |
| None available; at least one at-risk | At risk |
| None available/at-risk; at least one unknown | Unknown |
| All blocked | Blocked |

### Multiple alternative groups (OR)

If any group is available, capability is available. Else, at-risk beats unknown, unknown beats blocked; capability is blocked only when **all** groups are blocked.

### Confidence handling

An unverified (`assumed`) dependency must not, by itself, yield a confirmed **blocked** or **available** result. Propagate `at_risk` when the uncertain dependency matters; an `unknown` link yields `unknown` unless another fully verified independent route is available. A conservative policy is more important than showing optimistic green statuses.

## 5. Propagation algorithm

1. Validate graph and failed capability seeds.
2. Create one evaluation node for each configured `(resource, capability)`.
3. Initialise seeds `blocked`; documented independent roots `available`; unknown/dependent nodes `unknown`.
4. Evaluate each dependent node using groups and prerequisite capability states.
5. Repeat synchronously until results stop changing (fixed point).
6. Detect strongly connected components / cycles and annotate potential recovery loops.
7. Generate per-impact dependency paths and explanations.
8. Store graph snapshot, seeds, statuses, causal paths and summary transactionally.

**Cycles:** A cycle is **not automatically a lockout**. An independent alternative may resolve it. Cycles without known external roots may remain `unknown` and should be highlighted for investigation. Ensure convergence and a safe iteration limit.

## 6. Explicit failure seeds

Phone lost should seed `phone/access = blocked` (and any other user-selected phone capabilities). It should **not** automatically seed every service account owned by that person as blocked.

Person unavailable should be tied to explicit capability dependencies rather than inferring arbitrary outages from owner labels.

## 7. Output example

```json
{
  "failed": [{ "resourceId": "admin-phone", "capability": "access" }],
  "impacts": [
    { "resourceId": "workspace-email", "capability": "access", "status": "blocked", "path": ["admin-phone/access", "workspace-email/access"] },
    { "resourceId": "domain-registrar", "capability": "access", "status": "available", "path": ["backup-key/access", "domain-registrar/access"] }
  ],
  "warnings": ["Potential email ↔ vault recovery loop"]
}
```

## 8. Path explanations

Every impacted node should name the route/group and the relevant prerequisite(s). Multiple paths may explain a block. Do not hallucinate external security settings. In the UI, clicking an impact highlights its explanatory chain.

## 9. Simulation versus verified recovery

Important: `recovery: available` means a route appears available **in the model**. It does not mean someone has successfully completed that recovery procedure. Tested status comes only from `recovery_tests` with human confirmation.

## 10. Test matrix

- ALL prerequisite blocks → dependent blocked.
- ANY has surviving independent alternative → available.
- ALL ANY alternatives blocked → dependent blocked.
- Two alternative groups, one survives → available.
- Multi-hop access cascade → downstream blocked.
- Access blocked but recovery available → both states preserved.
- Assumed/unknown route → no false certainty.
- Missing capability config → unknown, never green.
- Circular recovery dependencies terminate and warn.
- Different record ordering → same outputs.
- Workspace isolation prevents cross-tenant graph contamination.
- Rerunning after added independent route reduces the relevant impact.
