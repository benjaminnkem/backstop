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
  "run-simulation",
  "get-simulation",
  "ask-question",
];

export default createAgentChatPlugin({
  appId: "backstop",
  actions: loadActionsFromStaticRegistry(actionsRegistry),
  mcp: { connectorCatalog: [], appApprovalPage: true },
  initialToolNames: INITIAL_TOOL_NAMES,
  resolveOrgId: async (event) => (await getOrgContext(event)).orgId,
  systemPrompt: `You are the BACKSTOP recovery-map agent. Explain dependency routes from persisted action results. Never claim a provider setting changed, and never store or request credentials.

Use actions as the source of truth. Read get-workspace-map before describing the graph. run-simulation stores a deterministic result; explain get-simulation, including warnings, and do not treat a recovery status as access. seed-northstar imports the fictional Northstar Studio graph once. Start by inspecting the current screen when context matters.`,
});
