import test from "node:test";
import assert from "node:assert/strict";
import {
  buildApprovePhaseArguments,
  buildRequestRegressionArguments,
  buildRestartUserStoryArguments,
  parseToolContent
} from "../src-vscode/backendClientModel";

test("buildApprovePhaseArguments omits empty optional base branch", () => {
  assert.deepEqual(buildApprovePhaseArguments("/repo", "US-0001"), {
    workspaceRoot: "/repo",
    usId: "US-0001"
  });

  assert.deepEqual(buildApprovePhaseArguments("/repo", "US-0001", "main"), {
    workspaceRoot: "/repo",
    usId: "US-0001",
    baseBranch: "main"
  });
});

test("buildRequestRegressionArguments only includes non-empty reasons", () => {
  assert.deepEqual(buildRequestRegressionArguments("/repo", "US-0001", "refinement"), {
    workspaceRoot: "/repo",
    usId: "US-0001",
    targetPhase: "refinement"
  });

  assert.deepEqual(buildRequestRegressionArguments("/repo", "US-0001", "refinement", "Needs redesign"), {
    workspaceRoot: "/repo",
    usId: "US-0001",
    targetPhase: "refinement",
    reason: "Needs redesign"
  });
});

test("buildRestartUserStoryArguments only includes non-empty reasons", () => {
  assert.deepEqual(buildRestartUserStoryArguments("/repo", "US-0001", " "), {
    workspaceRoot: "/repo",
    usId: "US-0001"
  });

  assert.deepEqual(buildRestartUserStoryArguments("/repo", "US-0001", "Source changed"), {
    workspaceRoot: "/repo",
    usId: "US-0001",
    reason: "Source changed"
  });
});

test("parseToolContent returns parsed text payload and rejects invalid payloads", () => {
  assert.deepEqual(parseToolContent("list_user_stories", {
    content: [
      { text: "{\"items\":[{\"usId\":\"US-0001\"}]}" }
    ]
  }), {
    items: [{ usId: "US-0001" }]
  });

  assert.throws(
    () => parseToolContent("list_user_stories", { content: [{}] }),
    /Tool 'list_user_stories' returned an invalid MCP payload\./
  );
});
