# Chat — Agent Guide

Chat is the minimal chat-first agent-native app. `/` redirects to shared sign-in, then `/home`, the editable Get started page. Chat lives at `/chat`; new chats start there. Actions carry capabilities; screens exist only for durable workflows.

## Skills

Search with `rg --hidden --follow`; read the exact linked guide before deeper work. `.agents/skills/build-an-app/SKILL.md` — start here for vague requests to create a domain app. `.agents/skills/adding-a-feature/SKILL.md` — cross-area feature checklist. Data/integrations: `.agents/skills/actions/SKILL.md`, `.agents/skills/storing-data/SKILL.md`, `.agents/skills/security/SKILL.md`, `.agents/skills/secrets/SKILL.md`, `.agents/skills/sharing/SKILL.md`. UI: `.agents/skills/frontend-design/SKILL.md`, `.agents/skills/shadcn-ui/SKILL.md`, `.agents/skills/client-side-routing/SKILL.md`. Agent context/workflows: `.agents/skills/context-awareness/SKILL.md`, `.agents/skills/real-time-sync/SKILL.md`, `.agents/skills/reliable-mutations/SKILL.md`, `.agents/skills/performance/SKILL.md`, `.agents/skills/delegate-to-agent/SKILL.md`. Framework: `.agents/skills/agent-native-docs/SKILL.md`, `.agents/skills/agent-native-toolkit/SKILL.md`, `.agents/skills/customizing-agent-native/SKILL.md`.

Use local docs only (no web research): `pnpm action docs-search --query "<topic>"`, `pnpm action docs-search --slug "<slug>"`, `pnpm action docs-search --list`, `pnpm action source-search --query "<pattern>"`, `pnpm action source-search --path <path>`, or `pnpm action source-search --list`. For external-agent integrations, read `pnpm action docs-search --slug "external-agents"`.

## Core rules

- UI feedback: target 100 ms, never exceed 400 ms; acknowledge before network work.
- Normal app data must flow through actions. Keep actions deterministic and focused; use agent chat/AgentSidebar for AI work and follow-ups in the same thread. Keep structured state in SQL and large files in configured storage; persist references only.
- For external integrations, inspect the workspace/provider connection catalog first; reuse its scoped resolver. Never hardcode credentials, webhook URLs, or private/customer data.
- Never fabricate. Report failures and recover; verify writes by reading the row or screen. Navigation is in `<current-screen>`; use `view-screen` for fresh visible-record details.

For custom branding, keep `server/plugins/agent-native-email-branding.ts` aligned: `app.name` appears in transactional email and optional `app.logoUrl` must be an absolute HTTPS URL.

## Application state

- `navigation` describes the view and selected ids. Chat is `chat` at `/chat` and `/chat/<threadId>`; the Get started page is `home` at `/home`; `/` opens shared sign-in/signup.
- Use `navigate` when supported and `view-screen` for a fresh read of visible details; basic navigation is already in `<current-screen>`.

## Building a domain app

Choose the primary workflow and route before editing. Add a domain route under `app/routes/` and set `app.homePath` in `server/plugins/agent-native-email-branding.ts` with `defineAppConfig`. The default Get started page lives at `/home`, and Chat stays at `/chat`; edit `app/routes/home.tsx` when replacing that page with a domain-specific home. Add a static link in `app/components/layout/Sidebar.tsx` before `ChatThreadsSection`; `Header.tsx` uses `APP_TITLE` elsewhere. Shared sidebar and AgentInspector remain.

Use `adding-a-feature` for functional parity and `frontend-design` for a user-facing screen. Keep feature guidance here; do not rewrite `README.md` or `DESIGN.md`. After all edits, run one typecheck, one doctor check, and one browser smoke of the primary workflow, including overlap rejection, cancellation freeing the slot, and authenticated landing. Skip production build and extra test suites.

Before building common workspace or agent UI, read `agent-native-toolkit`; for supported customization, read `customizing-agent-native`.

- Guarded verification: run `pnpm agent-native:doctor`; fix findings before done.

## BACKSTOP

Recovery map at `/map`. Chat stays at `/chat`. No provider OAuth, stored credentials, or claim that a simulation changed an account. `available` is the model. Recovery does not grant access. Missing groups are not independence.

One Northstar sample per team (`org:<id>` or `user:<email>`). `seed-northstar` is idempotent. Domain tables are `recovery_*`.

Screens: `/home` is the Overview (`home`), `/map` the graph workspace (`map`), `/remediation` the task table (`remediation`), `/runbook` the emergency runbook (`runbook`). The `workspace`, `resource`, and `simulation` params are those ids; `/map` also takes `capability` to focus one causal path, and `/remediation` takes `task`. Scenario presets live in `shared/scenarios.ts` and only appear when their resource exists. Map UI uses `bs-*` tokens in `app/global.css`; do not hardcode colours.

Isolation: `pnpm check:isolation` runs two synthetic users through every action; all of the second user's attempts on the first's workspace must be refused.

Status is per capability. `blocked` means every recorded route is blocked. A recovery cycle warns and is not a lockout. Saved runs stay when the map changes. Ask what caused this sends the visible run id. Call `get-simulation` before explaining.

| Action | Purpose |
| --- | --- |
| `get-workspace-map` | Read one workspace graph. |
| `seed-northstar` | Import Northstar Studio once. |
| `reset-northstar` | Reset the fictional sample (`confirm: true`). Only when the user asks. |
| `create-resource` | Add a resource. Then `create-capability`. |
| `create-capability` | Record access, recovery, or administration. |
| `add-dependency-route` | Add one route on a dependent capability. |
| `remove-dependency-route` | Remove one route when the user asks. |
| `set-resource-archived` | Archive or restore. Routes needing an archived resource evaluate as unknown. |
| `run-simulation` | Persist a new run. Accepts ids or slugs. |
| `get-simulation` | Read one saved run, or the latest. |
| `list-remediation-tasks` | Read internal tasks. They do not change the map. |
| `create-remediation-task` | Record a task only when the user asks. |
| `update-remediation-task` | Change status, priority, or label. |
| `get-runbook` | Build the runbook from saved records, with Markdown. |
| `list-recovery-tests` | Read tests. No record means documented, not tested. |
| `record-recovery-test` | Agent may only plan (`planned`). Passed or failed needs a person in the UI. |
| `update-recovery-test` | Agent may edit a planned test, never a result. |
| `navigate` | Open `map` with workspace, resource, and simulation ids. |
