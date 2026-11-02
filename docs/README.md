# BACKSTOP · Product and Technical Pack

**Tagline:** Test the way back in before you need it.

**Purpose:** Implementation-ready specifications, design contracts, reference TypeScript and demo fixtures for a recovery-readiness simulator for small digital teams. **This is a specification pack, not a finished Agent-Native application.**

## Start here

1. Read `docs/01_PRODUCT_REQUIREMENTS.md`, `docs/02_ARCHITECTURE.md` and `docs/04_SIMULATION_SPEC.md` together.
2. Scaffold a fresh Agent-Native Chat application using `docs/10_BUILD_PLAN.md`.
3. Inspect the actual generated `AGENTS.md`, routes, database and action examples **before** transferring these contracts to the app.
4. Implement the deterministic simulation engine before building the full visual interface.
5. Use `fixtures/northstar-studio.json` to seed a fictional demo workspace.
6. Add agent support via shared `defineAction()` actions, not a separate LLM-only backend.

## Contents

| Path | Purpose |
|---|---|
| `docs/01_PRODUCT_REQUIREMENTS.md` | Full PRD, goals, user journeys, MVP boundaries and acceptance criteria |
| `docs/02_ARCHITECTURE.md` | Stack, framework contracts and data flows |
| `docs/03_DATA_MODEL.md` | Entities, field contracts, relationships, tenancy and migration notes |
| `docs/04_SIMULATION_SPEC.md` | Precise graph semantics, status propagation and recovery-loop behavior |
| `docs/05_AGENT_ACTIONS.md` | Shared action contracts and agent rules |
| `docs/06_UI_UX_SPEC.md` | Screens, interactions, visual design system, empty/error states |
| `docs/07_SECURITY_PRIVACY.md` | Security, privacy, tenant isolation and honest claims |
| `docs/08_TEST_PLAN.md` | Unit/integration/e2e test cases and expected outcomes |
| `docs/09_DEMO_SUBMISSION.md` | Judging alignment, recording script, rules checklist |
| `docs/10_BUILD_PLAN.md` | Prioritized tasks, teammate splits and deadlines |
| `docs/11_DECISIONS_RISKS.md` | Design decisions, risk register and open questions |
| `docs/12_OFFICIAL_REFERENCES.md` | Verified official URLs and verification notes |
| `docs/13_DEPLOYMENT_OPERATIONS.md` | Local development, release and deployment checklist |
| `.env.example` | Non-secret configuration reference (follow generated scaffold) |
| `VALIDATION.md` | Verified fixtures and explicit limitations |
| `AGENTS.md` | Instructions for an AI coding assistant |
| `.agents/skills/recovery-analysis/SKILL.md` | Domain-specific agent skill |
| `examples/domain-types.ts` | Framework-independent TypeScript reference types |
| `examples/reference-simulator.ts` | Illustrative deterministic evaluator (not production certified) |
| `examples/reference-simulator.test.ts` | Unit test cases (Vitest style) |
| `fixtures/northstar-studio.json` | Fictional resource/dependency seed graph |
| `diagrams/architecture.mmd` | Mermaid architecture diagram |
| `diagrams/data-model.mmd` | Mermaid ERD |
| `START_CODING_PROMPT.md` | Developer/coding-agent kick-off prompt |
| `BACKSTOP_Full_Technical_Spec.pdf` | Readable compiled specifications for teammates |

## Confirmed scope

**Manual mapping, not platform login integrations.** Users describe how access, recovery and administration work. BACKSTOP does not sign in to GitHub, AWS, Google Workspace, etc., and it stores no secrets.

**Deterministic simulation.** Code calculates dependency outcomes. The AI explains results, creates tasks and edits records only through authorized actions.

**Differentiate access and recovery.** An account's everyday access can be blocked while a separately modelled recovery route is still viable. Never silently interpret a recoverable account as currently signed in.

## Current hackathon deadlines (verified against the official rules on Nov 2, 2026)

- Final submission: **Monday November 9, 2026 at 11:59 PM Pacific Time**.
- Equivalent UTC: **November 10 at 07:59 UTC**; equivalent West Africa Time: **November 10 at 08:59 WAT**.
- Public **Clips** demo viewable without login required; **submitting the clip itself is not the submission**.
- Work must include meaningful new development during the event from October 27 onward; identify pre-existing code/assets.

Rules: https://www.builder.io/hackathon/rules

## Disclaimers

- This pack contains **reference contracts and examples**, not a deployed app or penetration-tested cybersecurity tool.
- Framework versions evolve. Use current scaffold and official docs for precise API signatures.
- Never use real organisational recovery secrets in sample data, screenshots, tests or the demo.
