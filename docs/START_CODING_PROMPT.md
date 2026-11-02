# Paste this into your coding agent after unpacking the ZIP

We are building **BACKSTOP**, an Agent-Native hackathon application. Read every file in `docs/`, especially `01_PRODUCT_REQUIREMENTS.md`, `02_ARCHITECTURE.md`, `03_DATA_MODEL.md`, `04_SIMULATION_SPEC.md`, `05_AGENT_ACTIONS.md`, `07_SECURITY_PRIVACY.md`, and `10_BUILD_PLAN.md`. Also read `AGENTS.md` and `.agents/skills/recovery-analysis/SKILL.md`.

Start with the **official Agent-Native Chat scaffold** in a new `backstop` directory. Confirm Node.js and pnpm versions, generate the app with the command in README, then read the actual generated `AGENTS.md`, routes, database schema, action conventions and session/org helpers. **Do not assume the reference pack is executable scaffolding.**

Implement **P0** only first:

1. PostgreSQL/Drizzle resource, resource-capability, dependency group/link and simulation tables with migrations.
2. Import the fictional `fixtures/northstar-studio.json` seed graph.
3. A pure TypeScript deterministic simulation engine, tests for ALL/ANY/alternative groups/multi-hop/unknown/cycles and per-capability states.
4. Shared `defineAction()` resource/map and simulation actions with tenant authorization.
5. React Flow dependency map, scenario runner, impact inspection/highlight.
6. Embedded agent that reads the same graph and invokes actual actions rather than reasoning about data from prompts.
7. Show the exact phone-loss before/after demo with persistent graph changes and a clear confidence note.

Do not build external SaaS OAuth, store credentials, implement live security scanning or claim provider changes. Ask no broad design questions; follow specs, record unresolved ambiguities in `docs/11_DECISIONS_RISKS.md` and use conservative behavior. Keep the app running, verify every core flow, and report actual implemented work and test results rather than claiming completion without evidence.
