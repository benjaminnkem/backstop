# Official Sources and Verification Notes

Checked **November 2, 2026**. Exact APIs may change; the generated project and current docs are authoritative at build time.

## Hackathon

- Official event: https://www.builder.io/hackathon
- Official rules: https://www.builder.io/hackathon/rules

Key verified facts: build with Agent-Native; final deadline Nov 9, 2026 at 11:59 PM PT (Nov 10 07:59 UTC); public Clips demo; scoring weights 40/20/20/20; team participation allowed; public repo/deployment encouraged but not required; disclose preexisting work.

## Agent-Native framework

- Creating templates: https://www.agent-native.com/docs/creating-templates/
- Getting started: https://www.agent-native.com/docs/getting-started/
- Actions overview: https://www.agent-native.com/docs/actions-overview/
- Agent surfaces: https://www.agent-native.com/docs/agent-surfaces/
- Database: https://www.agent-native.com/docs/server-database/
- Frames/embedded agent panel: https://www.agent-native.com/docs/frames/
- Framework repository: https://github.com/BuilderIO/agent-native

Confirmed by official docs: scaffold with `npx --yes @agent-native/core@latest create backstop --standalone --template chat`; current stated minimum Node.js 22.22; actions via `defineAction()`/Zod; shared UI/agent action surface; Drizzle/PostgreSQL/PGlite; navigation app state; agent panel from framework; use actual template for auth/workspace specifics.

## Source of domain assumptions

The simulated resource network in fixtures is a **fictional example**, not a claim about default settings in GitHub, Google, AWS, Cloudflare or any other provider. Actual authentication/recovery support differs by account, subscription and policy. User must model and verify actual settings before relying on a runbook.
