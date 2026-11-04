#!/usr/bin/env node
/**
 * Workspace isolation check. Two synthetic users act through the real action
 * layer against the local database. Bob must be refused every read and write
 * on Alice's workspace, and must get his own sample when he imports one.
 *
 * Run with the dev database available: `pnpm check:isolation`.
 * It creates data only for the two synthetic *.isolation.test users.
 */
import { spawnSync } from "node:child_process";

const stamp = Date.now().toString(36);
const ALICE = `alice-${stamp}@isolation.test`;
const BOB = `bob-${stamp}@isolation.test`;

let failures = 0;
let passes = 0;

function action(user, name, args = {}) {
  const result = spawnSync("pnpm", ["-s", "action", name, JSON.stringify(args)], {
    env: { ...process.env, AGENT_USER_EMAIL: user },
    encoding: "utf8",
    timeout: 120_000,
  });
  return {
    ok: result.status === 0,
    out: `${result.stdout ?? ""}${result.stderr ?? ""}`,
  };
}

function idFrom(text, field = "id") {
  const match = text.match(new RegExp(`${field}: '([^']+)'`));
  if (!match) throw new Error(`No ${field} in output:\n${text}`);
  return match[1];
}

function expectOk(label, result) {
  if (result.ok) {
    passes += 1;
    console.log(`  ok    ${label}`);
  } else {
    failures += 1;
    console.log(`  FAIL  ${label}\n${result.out}`);
  }
  return result;
}

function expectRefused(label, result) {
  // A refusal must fail, and must not leak Alice's data in its output.
  // It must be refused for access, not for some unrelated validation error.
  const forAccess = /not available|forbidden|403/i.test(result.out);
  const leaked = /Northstar Studio|Workspace email/.test(result.out) && !/not available/.test(result.out);
  if (!result.ok && forAccess && !leaked) {
    passes += 1;
    console.log(`  ok    refused: ${label}`);
  } else {
    failures += 1;
    console.log(`  FAIL  ${label} was not refused\n${result.out}`);
  }
}

console.log(`Alice: ${ALICE}\nBob:   ${BOB}\n`);
console.log("Alice sets up a workspace");
const seed = expectOk("Alice imports the sample team", action(ALICE, "seed-northstar"));
const workspaceId = idFrom(seed.out);
const run = expectOk(
  "Alice runs a scenario",
  action(ALICE, "run-simulation", {
    workspaceId,
    name: "Isolation check",
    failed: [{ resourceId: "admin-phone", capability: "access" }],
  }),
);
const simulationId = idFrom(run.out);
const task = expectOk(
  "Alice records a task",
  action(ALICE, "create-remediation-task", { workspaceId, title: "Isolation check task", priority: "low" }),
);
const taskId = idFrom(task.out);
const test = expectOk(
  "Alice plans a recovery test",
  action(ALICE, "record-recovery-test", {
    workspaceId,
    resourceId: "workspace-email",
    capability: "access",
    method: "Isolation check method",
  }),
);
const testId = idFrom(test.out);

console.log("\nBob tries to read Alice's workspace");
expectRefused("read the map", action(BOB, "get-workspace-map", { workspaceId }));
expectRefused("read the saved run", action(BOB, "get-simulation", { simulationId }));
expectRefused("list tasks", action(BOB, "list-remediation-tasks", { workspaceId }));
expectRefused("list recovery tests", action(BOB, "list-recovery-tests", { workspaceId }));
expectRefused("build the runbook", action(BOB, "get-runbook", { workspaceId }));

console.log("\nBob tries to change Alice's workspace");
expectRefused("run a scenario", action(BOB, "run-simulation", {
  workspaceId,
  failed: [{ resourceId: "admin-phone", capability: "access" }],
}));
expectRefused("add a resource", action(BOB, "create-resource", {
  workspaceId,
  name: "Bob's service",
  kind: "service",
  criticality: "low",
}));
expectRefused("add a route", action(BOB, "add-dependency-route", {
  workspaceId,
  resourceId: "workspace-email",
  capability: "access",
  groupSlug: `bob-${stamp}`,
  requirementMode: "ALL",
  label: "Bob's route",
  linkSlug: `bob-${stamp}-link`,
  prerequisiteResourceId: "backup-key",
  prerequisiteCapability: "access",
  confidence: "verified",
}));
expectRefused("remove a route", action(BOB, "remove-dependency-route", { workspaceId, groupId: "email-access-phone" }));
expectRefused("archive a resource", action(BOB, "set-resource-archived", { workspaceId, resourceId: "workspace-email" }));
expectRefused("record a task", action(BOB, "create-remediation-task", { workspaceId, title: "Bob's task" }));
expectRefused("update Alice's task by id", action(BOB, "update-remediation-task", { taskId, status: "dismissed" }));
expectRefused("plan a test", action(BOB, "record-recovery-test", {
  workspaceId,
  resourceId: "workspace-email",
  capability: "access",
  method: "Bob's method",
}));
expectRefused("update Alice's test by id", action(BOB, "update-recovery-test", { testId, method: "Changed by Bob" }));

console.log("\nBob's own workspace is separate");
const bobSeed = expectOk("Bob imports his own sample team", action(BOB, "seed-northstar"));
const bobWorkspaceId = idFrom(bobSeed.out);
if (bobWorkspaceId === workspaceId) {
  failures += 1;
  console.log("  FAIL  Bob received Alice's workspace");
} else {
  passes += 1;
  console.log("  ok    Bob's workspace id differs from Alice's");
}
const bobTasks = expectOk("Bob lists his own tasks", action(BOB, "list-remediation-tasks", {}));
if (/Isolation check task/.test(bobTasks.out)) {
  failures += 1;
  console.log("  FAIL  Alice's task appears in Bob's default workspace");
} else {
  passes += 1;
  console.log("  ok    Alice's task is not in Bob's workspace");
}

console.log("\nAlice's data is unchanged");
const aliceTasks = expectOk("Alice lists her tasks", action(ALICE, "list-remediation-tasks", { workspaceId }));
if (/dismissed/.test(aliceTasks.out) || !/Isolation check task/.test(aliceTasks.out)) {
  failures += 1;
  console.log("  FAIL  Alice's task changed");
} else {
  passes += 1;
  console.log("  ok    Alice's task is still open");
}
const aliceMap = expectOk("Alice reads her map", action(ALICE, "get-workspace-map", { workspaceId }));
if (/Bob's service|Bob's route/.test(aliceMap.out)) {
  failures += 1;
  console.log("  FAIL  Bob's edits reached Alice's map");
} else {
  passes += 1;
  console.log("  ok    Alice's map has no edits from Bob");
}

console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures === 0 ? 0 : 1);
