# UI/UX Specification

## Experience principle

The **graph is the product**, not an ornament next to a chatbot. The app should show a before/after failure simulation with direct manipulation, backed by traceable source data and persistent actions.

## Information architecture

Primary sidebar: `Overview`, `Dependency Map`, `Simulations`, `Remediation`, `Recovery Tests`, `Runbook`, `Settings`. Agent panel integrated, preferably collapsible.

## Screen 1 — Overview

- Header: workspace switcher, team name, last model update.
- Metrics: critical resources; modelled dependencies; possible single points of failure; unknown paths; untested recovery methods; open urgent tasks.
- Recent simulation card (exact scenario, status, timestamp).
- Primary CTA: **Run a failure simulation**.
- Secondary CTA: **Map a resource**.
- No arbitrary or misleading “security score”.

## Screen 2 — Dependency Map (hero experience)

- Interactive React Flow canvas: service/account/device/person/recovery-resource nodes.
- Typed directional edges: login/access, recovery, administration.
- Group badges: ALL / ANY and route alternatives.
- Confidence markers: verified / assumed / unknown.
- Right inspector: selected node, criticality, owner, capabilities, routes, evidence/test status.
- Controls: add resource, add link, filter capability, zoom/fit, legend, graph search.
- Optional simulation overlay: red blocked, amber at risk, green available, grey unknown; **always clarify these are per-capability model statuses**.
- Clicking an impact highlights the exact explanatory path.

## Screen 3 — Failure Simulations

- Scenario picker: lost phone, email unavailable, IdP down, administrator unavailable, vault unavailable, custom.
- Custom scenario chooses **resource + capability**, not arbitrary account owner.
- Before running, show what is being assumed unavailable.
- Results: summary counts, status tabs, list of affected resources, path explanations, cycle warnings, model limitations.
- CTA: **Ask agent to explain**, **Create remediation**, **Compare with previous run**.

## Screen 4 — Remediation

- Table or task board with priority, status, owner, reason and related resource/simulation.
- Side pane with “why this matters” and “external change still required” note.
- Changing task status never changes simulation assumptions automatically.
- Link to graph edit flow to record a new configured route.

## Screen 5 — Recovery Tests

- Methods by service, latest outcome, who confirmed, when and notes.
- Strong distinction: **documented**, **planned**, **tested passed**, **tested failed**.
- Explicit human confirmation for `passed`.

## Screen 6 — Runbook

- Document layout with organisation scope, critical systems/owners, verified and unverified paths, emergency steps from recorded data, tasks, test history and export.
- Label runbook confidential; no public anonymous link for a real workspace.
- Show unknown data rather than guessing recovery procedures.

## Visual design direction

- High-contrast, restrained SaaS UI; deep evergreen ink, off-white/charcoal backgrounds, restrained semantic colours.
- Graph should feel precise and interactive, not like a decorative network animation.
- Clear microcopy: “blocked access”, “recovery route available in model”, “untested”, “unknown”, “assumed”.
- Accessible typography, state labels not conveyed only by colour, keyboard-accessible inspector/controls.
- Responsive: desktop primarily, small screens show a readable list fallback for graph.

## Suggested UI tokens (not hard requirements)

- Ink: `#15372F`; accent `#15745B`; surface `#F7F8F5`.
- Semantic: red blocked, amber at-risk, green available, neutral grey unknown.
- Radius: medium (`10–14px`); spacing scale 4/8/12/16/24/32.
- Avoid neon gradients, animated backgrounds and vanity charts.

## Empty/loading/error states

- New workspace: “Add your first critical service” or “Explore sample team”.
- Incomplete graph: “Recovery requirements are not yet modelled for these 3 services.”
- Simulation loading: “Evaluating documented paths…” (avoid claiming live provider checking).
- Data conflict: “This resource was changed; refresh before editing.”
- Error: actionable explanation + retry; avoid silently swallowing failed actions.

## Demo-first interaction storyboard

1. Seed graph visible.
2. Click **Lost administrator phone**.
3. Blocked access paths animate/highlight.
4. User asks agent for root cause; response uses persisted path details.
5. Agent creates internal tasks with explicit approval.
6. User models an independent email login route after confirming it exists.
7. Rerun; blast radius shrinks.
8. Generate evidence-labelled runbook.
