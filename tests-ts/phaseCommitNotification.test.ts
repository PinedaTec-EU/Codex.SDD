import { strict as assert } from "node:assert";
import test from "node:test";
import { buildPhaseCommitNotification } from "../src-vscode/phaseCommitNotification";

test("buildPhaseCommitNotification returns null when no commit was created", () => {
  assert.equal(buildPhaseCommitNotification("US-0001", null), null);
  assert.equal(buildPhaseCommitNotification("US-0001", {
    isGitWorkspace: true,
    commitCreated: false,
    commitSha: null,
    message: null,
    stagedPaths: []
  }), null);
});

test("buildPhaseCommitNotification formats output log and VS Code notification text", () => {
  const notification = buildPhaseCommitNotification("US-0001", {
    isGitWorkspace: true,
    commitCreated: true,
    commitSha: "1234567890abcdef",
    message: "US-0001 review: done pass",
    stagedPaths: ["a.md", "b.md"]
  });

  assert.deepEqual(notification, {
    shortSha: "1234567890ab",
    logMessage: "Workflow 'US-0001' created git commit 1234567890ab: US-0001 review: done pass. Files: 2.",
    userMessage: "US-0001 phase commit created: 1234567890ab"
  });
});
