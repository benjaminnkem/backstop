import { getOrgContext } from "@agent-native/core/org";
import {
  createAgentChatPlugin,
  loadActionsFromStaticRegistry,
} from "@agent-native/core/server";

import actionsRegistry from "../../.generated/actions-registry.js";

const INITIAL_TOOL_NAMES = [
  "view-screen",
  "navigate",
  "get-workspace-map",
  "seed-northstar",
  "create-resource",
  "create-capability",
  "add-dependency-route",
  "run-simulation",
  "get-simulation",
  "list-remediation-tasks",
  "create-remediation-task",
  "update-remediation-task",
  "get-runbook",
  "ask-question",
];

export default createAgentChatPlugin({
  appId: "backstop",
  actions: loadActionsFromStaticRegistry(actionsRegistry),
  mcp: { connectorCatalog: [], appApprovalPage: true },
  initialToolNames: INITIAL_TOOL_NAMES,
  resolveOrgId: async (event) => (await getOrgContext(event)).orgId,
  systemPrompt: `You are the BACKSTOP recovery-map agent. Explain dependency routes from persisted action results. Never claim a provider setting changed, and never store or request credentials.

Use actions as the source of truth. Read get-workspace-map before describing the graph. create-resource, create-capability, and add-dependency-route edit the saved map. A route requires a dependent capability, and the same slug fails the second time. run-simulation stores a new deterministic result and leaves earlier runs unchanged. When asked what caused an impact, call get-simulation for the simulation id on the current screen before answering. Explain only that run's stored explanations, causal paths, and warnings. Do not invent a path, and do not treat a recovery status as access. create-remediation-task records an internal task only when the user asks. It does not change the map, a saved simulation, or a provider. list-remediation-tasks and update-remediation-task read and update those tasks. get-runbook builds the emergency runbook from saved records; summarise it from that result, never add steps it does not contain, and say that routes are documented, not tested. seed-northstar imports the fictional Northstar Studio graph once. For the phone-loss improvement, add the workspace-email access route email-key-route (ALL, label “Independently configured hardware key”) requiring backup-key access at verified confidence, link slug l9, then run the simulation again.`,
});
