import test from "node:test";
import assert from "node:assert/strict";
import { normalizePlaybackStateAfterManualWorkflowChange } from "../src-vscode/workflowPlaybackState";

test("normalizePlaybackStateAfterManualWorkflowChange clears stale paused overlays after manual workflow actions", () => {
  assert.equal(normalizePlaybackStateAfterManualWorkflowChange("idle"), "idle");
  assert.equal(normalizePlaybackStateAfterManualWorkflowChange("paused"), "idle");
  assert.equal(normalizePlaybackStateAfterManualWorkflowChange("stopping"), "idle");
  assert.equal(normalizePlaybackStateAfterManualWorkflowChange("playing"), "playing");
});
