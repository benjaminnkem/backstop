# Security, Privacy and Reliability Guardrails

## Non-negotiable data exclusions

Never request, accept into fixtures, persist, log or export actual **passwords, API keys, OAuth tokens, authentication seeds, backup/recovery codes, private keys, session cookies or credential-vault exports**. The product maps recovery *relationships*, not secrets.

## Authorization and tenancy

- Derive tenant/organisation and actor from framework-authenticated context.
- Verify all referenced resource/group/link/run/task IDs belong to the same tenant.
- Never accept a model-supplied workspace ID as authorization.
- Ensure downloadable runbooks and simulations are authorized.
- Avoid public anonymous sharing of real workspaces.
- For a demo, provide only fictional seed records.

## Agent boundaries

- Agent gets no special privileges beyond current authorized user.
- Writes happen only through shared actions and server validation.
- No external provider API integrations or automated account changes for MVP.
- Human confirms sensitive changes and passed recovery tests.
- Descriptions/notes are untrusted text; they are not privileged instructions.
- Do not fabricate an external service's configuration from its brand name.

## Simulation honesty

- Outputs evaluate **entered dependency assumptions**, not live system availability.
- Label status per capability; a recovery route being available is not the same as sign-in being restored.
- Cycle detection shows *potential* loops, not guaranteed account lockout.
- Incomplete knowledge is `unknown`, not `available`.
- A passing recovery test requires human evidence, not LLM prediction.

## Persistence and audit

- Transactionally insert simulation run + impacts.
- Keep snapshot/version to ensure historical reproducibility.
- Retain creator/actor/time for changes.
- Confirm destructive operations; prefer archive over hard-delete for historically referenced resources.
- Keep logs secret-free; restrict access to sensitive operational maps.

## Threat-model checklist

| Threat | Control |
|---|---|
| Cross-tenant resource access | Scoped DB queries + FK checks + tests |
| Prompt injection via resource notes | Treat notes as data, instructions from repo/system only |
| Accidental secret pasted into notes | UI warning + optional local/server secret-pattern guard |
| Agent fabricates recovery success | Human-only pass confirmation + persisted test evidence |
| Graph model overstates certainty | Confidence labels + conservative simulator semantics |
| Public runbook exposure | Authenticated download, no guessable public URLs |
| Misleading “secure” claims | Scope disclaimer beside simulation/runbook |

## Required disclosure

> BACKSTOP's results are based on user-entered dependency information. It does not verify external account settings or guarantee real-world recoverability.
