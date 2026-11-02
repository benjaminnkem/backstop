# BACKSTOP Coding-Agent Instructions

**Before writing code:** read `README.md`, `docs/04_SIMULATION_SPEC.md`, `docs/07_SECURITY_PRIVACY.md` and the generated Agent-Native scaffold's own `AGENTS.md`. This pack is not a drop-in replacement for the generated runtime.

## Required product behavior

- Manual mapping only. Do not build provider OAuth integrations.
- Do not request, accept, store or reveal passwords, backup codes, TOTP seeds, private keys or API tokens.
- Keep `access`, `recovery` and `administration` as distinct capabilities.
- Model independent, dependent and unknown baselines explicitly; missing edges are not evidence of safety.
- Multiple groups for a target capability are **OR routes**; links within group follow ALL/ANY.
- Run graph simulation in pure TypeScript code, not with LLM reasoning.
- Identify potential cycles; never claim a cycle proves lockout.
- Respect verified/assumed/unknown confidence; avoid false certainty.
- Agent and UI use shared `defineAction` functions and authorized database records.
- Derive tenant scope from authenticated action context, not user/agent input IDs.
- Never mark recovery test passed without human confirmation.
- Do not claim external account settings were changed.
- Preserve historical simulation results/snapshots.

## Implementation workflow

1. Inspect official starter and existing action/schema patterns.
2. Add Drizzle tables using scaffold migration conventions.
3. Implement a pure, unit-tested simulation engine.
4. Wrap it in workspace-scoped shared actions.
5. Build graph UI with path inspector; publish screen selection through app state.
6. Connect embedded agent and test action use.
7. Add remediation/runbook, QA and demo.

## Communication

Explain exact dependency paths; state assumptions and unknowns. Avoid generic cybersecurity claims. Report actual action success/failure. Do not invent statuses, accounts, tests or external configuration.
