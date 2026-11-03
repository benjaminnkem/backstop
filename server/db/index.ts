import { createGetDb } from "@agent-native/core/db";
import { registerIdentityColumns } from "@agent-native/core/org";
import { registerShareableResource } from "@agent-native/core/sharing";

import * as schema from "./schema.js";

export const getDb = createGetDb(schema);
export { schema };

registerShareableResource({
  type: "recovery-workspace",
  resourceTable: schema.recoveryWorkspaces,
  sharesTable: schema.recoveryWorkspaceShares,
  displayName: "Recovery workspace",
  titleColumn: "name",
  allowPublic: false,
  requireOrgMemberForUserShares: true,
  getResourcePath: (workspace) => `/map?workspace=${workspace.id}`,
  getDb,
});

registerIdentityColumns([
  {
    table: "recovery_simulation_runs",
    column: "created_by",
    emailChange: "retain",
    offboard: "retain",
    reason:
      "Historical attribution for who ran a simulation. The address is not an access grant.",
  },
  {
    table: "recovery_remediation_tasks",
    column: "created_by",
    emailChange: "retain",
    offboard: "retain",
    reason:
      "Historical attribution for who recorded a remediation task. The address is not an access grant.",
  },
]);
