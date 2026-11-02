# Deployment and Operational Checklist

## Local development

1. Confirm Node.js satisfies the official Agent-Native minimum (as checked on Nov 2, 2026: Node.js 22.22+).
2. Run the official Chat template scaffold from `README.md`.
3. Install dependencies and start the generated app with its documented command.
4. Use the scaffold's local PGlite/database setup and migrations.
5. Keep LLM/model keys in server-only environment or the framework's approved credentials store. Do not commit `.env`.
6. Import only synthetic Northstar Studio demo fixtures.
7. Run unit tests and the complete scripted demo.

## Before production-style deployment

- [ ] Persistent PostgreSQL configured; no ephemeral demo-only database for private team workspaces.
- [ ] Auth/session setup works on intended host.
- [ ] All action calls derive workspace identity from auth context and enforce ownership.
- [ ] Secrets configured server-side and not included in frontend bundles.
- [ ] Application host uses HTTPS.
- [ ] Resource and dependency input validation is enabled.
- [ ] Simulation history and runbook exports have appropriate access controls.
- [ ] No actual recovery secrets in logs, data, screenshots or demo.
- [ ] Test failure/restart behavior for DB and agent provider.
- [ ] Confirm the real URLs and image assets load in the demo environment.

## Demo deployment strategy

A public fictional demo workspace can be used for viewing and recording, but it must not expose private team data. For the hackathon, the rules encourage a deployment but require a **public Clips recording** of a real, functioning app; a deployment alone is not the submission. Use a durable seeded demo environment and verify it in a fresh browser session.

## Minimal operational logging

Log action type, synthetic trace ID, success/failure, execution duration and allowed, non-sensitive record IDs. Avoid logging resource notes, map exports, session tokens, passwords or provider credentials.

## Rollback and recovery

Document how to roll back a failed migration and restore the demo dataset. Do not claim a production-ready disaster recovery strategy if it has not been tested.
