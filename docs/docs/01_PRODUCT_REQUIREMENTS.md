# BACKSTOP — Product Requirements Document

**Version:** 1.0 · Hackathon build specification  
**Audience:** product, engineering, design, QA and coding agents  
**Working tagline:** Test the way back in before you need it.

## 1. Elevator pitch

BACKSTOP is an agent-native recovery-readiness workbench. It lets small digital teams **map how their critical online services are accessed, administered and recovered**, simulate loss of an account/device/person, reveal dependency chains and potential recovery deadlocks, and agree on remediation. The user and AI agent operate on the same graph, simulation records, tasks and test history.

## 2. Problem and stakes

A company can depend on several SaaS products whose login, MFA, recovery email and administration routes share the same device or person. Losing that prerequisite can affect multiple critical services. Teams often have no lightweight way to rehearse this failure without touching live credentials or infrastructure.

BACKSTOP answers: (a) What breaks if X becomes unavailable? (b) Which services still have an independent **access** route? (c) Which services have a separate **recovery** route? (d) Which claims are unverified? (e) What work reduces exposure? (f) Has the plan actually been tested?

## 3. Target audience

Small teams (roughly 3–25 people) relying on cloud services without dedicated business-continuity or identity teams. Secondary users: IT generalists, founders, agency operators and operations leads.

## 4. Core user story

> As the person responsible for my team's operational access, I want to see and rehearse the dependencies behind our critical services so I can address single points of failure **before** they cause a lockout.

## 5. Primary workflow

1. Open or create a workspace.
2. Add services, accounts, administrators, devices and recovery resources.
3. **Map how services are accessed, administered and recovered.** This means **manually entering dependency relationships**; it is *not* OAuth/API integration with every platform.
4. Select a preconfigured failure (e.g., primary phone lost) or choose a custom resource/capability outage.
5. Run a deterministic simulation.
6. Inspect status per resource **and capability**, linked to the exact dependency path and confidence.
7. Ask the AI agent to explain the impact and identify improvements.
8. Approve agent-created remediation tasks or create them manually.
9. Update recovery routes and rerun the scenario to show improvement.
10. Record human-confirmed recovery tests; generate a sensitive, exportable runbook.

## 6. Product entities

- **Workspace**: authorised team's data boundary.
- **Resource**: service, identity provider, email, account, device, person, recovery method, password vault or backup location.
- **Capability**: separate `access`, `recovery`, `administration` paths for a resource.
- **Dependency group**: a set of prerequisites for one target capability, either all required or any one sufficient. Multiple groups for the same target capability are **alternative routes**.
- **Dependency link**: the referenced prerequisite resource+capability, with `verified`, `assumed` or `unknown` confidence.
- **Simulation run**: immutable snapshot/result of a chosen failure.
- **Impact**: computed capability status, explanation and cause path.
- **Remediation task**: action to make a path more independent or better verified.
- **Recovery test**: explicit human-recorded proof of a recovery method working or failing.
- **Runbook**: generated document from current workspace and supporting records.

## 7. MVP capabilities and acceptance criteria

### 7.1 Resource inventory

Add, edit, list and archive resources with name, kind, criticality, owner label, notes and capability setup. Provide one **fictional** starter workspace and a reset option. Never store actual passwords, backup codes, authenticator seeds, private keys or session tokens.

**Acceptance:** A first-time visitor can see useful seed data; edits persist and update the graph.

### 7.2 Interactive dependency map

Create/edit/delete links, distinguish `access`, `recovery`, `administration`, support `ALL`/`ANY` inside a group, and alternative groups. Allow selecting a node, inspecting inbound/outbound dependencies and highlighting one simulation's causal path. Show verified vs assumed vs unknown.

**Acceptance:** A new independent path can be added in the UI, persisted, and reflected in a repeat simulation.

### 7.3 Failure simulator

Scenarios: lost admin phone; company email unavailable; IdP unavailable; administrator absent; password manager unavailable. The engine must operate on explicit resource/capability failure seeds and handle independent alternatives, multi-hop propagation, incomplete data and potential cycles. **No LLM-calculated blast radii.**

Statuses: `blocked`, `at_risk`, `available`, `unknown`. `available` means the **evaluated capability route** is available under entered assumptions, **not** the external service is objectively up.

**Acceptance:** The same graph + same scenario produces the same statuses and paths; all alternatives must be blocked before an `ANY` group is considered blocked.

### 7.4 Recovery-analysis agent

Understands the current selected resource/simulation; reads shared data via actions; runs the deterministic engine; explains returned paths and uncertainty; creates remediation tasks on explicit user approval. Must not claim to update provider settings.

**Acceptance:** Agent and UI invoke the same action layer and the records persist.

### 7.5 Remediation workbench

Task list with priority, status (`open`, `in_progress`, `completed`, `dismissed`), owner, resource and related simulation. Editing a task **does not** automatically change the underlying dependency graph. Applying a suggested graph change is a distinct user-approved operation.

**Acceptance:** Agent creates a task; it appears immediately in the UI; user can edit it.

### 7.6 Recovery tests

Human records method, tester, date, evidence notes and `passed` / `failed` / `not_tested`. An agent may suggest a test, but may never mark it passed on its own.

**Acceptance:** UI clearly distinguishes 'documented' vs 'tested successfully'.

### 7.7 Emergency runbook

Readable/exportable internal document with critical systems, owners, relevant access/recovery paths, confidence labels, recovery procedures, outstanding tasks and testing history. No secrets, no fabricated provider instructions.

**Acceptance:** Export is generated from persisted data; missing data is labeled; no confidential tokens appear.

## 8. Example journey

Fictional Northstar Studio: administrator phone supports the everyday sign-in of Workspace Email; the code host and cloud platform rely on Workspace Email; domain management has phone **or** hardware-key routes. A phone-loss simulation blocks everyday email access and downstream dependent access, but leaves domain management accessible via the hardware key. The agent proposes adding a **verified independent** email access route; the user edits the graph; the repeated simulation improves. A separate recovery-loop warning remains visible if email recovery and vault access depend on each other.

## 9. Out of scope / hard boundaries

- No automatic provider discovery, OAuth, live access probes or credentials.
- No changing AWS/GitHub/Google/Cloudflare settings.
- No threat detection, incident response, identity governance or compliance certification.
- No claim that the simulation proves real-world recoverability.
- No complex enterprise role hierarchies, billing, mobile-native app or real-time integrations.

## 10. Success metrics for the hackathon

- Main phone-loss demonstration completes end-to-end without manual resets or mocked agent action outputs.
- Every simulated impact has an explainable path; ambiguous relationships remain visibly uncertain.
- UI and agent changes affect one persisted dataset.
- First-time user can understand what a failure exposes within 30 seconds.
- A public demo shows failure → explanation → approved remediation → rerun → runbook in about 90 seconds.

## 11. Nonfunctional requirements

- Workspace isolation on all database reads/writes and exports.
- Deterministic reproducibility of simulations, including historical snapshots.
- Graceful no-data and incomplete-data handling.
- Responsive desktop-first interface and keyboard-accessible core controls.
- Error/status feedback for all mutations and long operations.
- Do not expose private operational maps through public URLs.

## 12. Product north star

> When the normal way in stops working, do we actually have another way in?
