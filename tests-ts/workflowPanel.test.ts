import test from "node:test";
import assert from "node:assert/strict";
import {
  canPauseWorkflowExecutionPhase,
  normalizePlaybackStateAfterManualWorkflowChange,
  resolveNextWorkflowExecutionPhaseId,
  resolveWorkflowExecutionPhaseId
} from "../src-vscode/workflowPlaybackState";

test("normalizePlaybackStateAfterManualWorkflowChange clears stale paused overlays after manual workflow actions", () => {
  assert.equal(normalizePlaybackStateAfterManualWorkflowChange("idle"), "idle");
  assert.equal(normalizePlaybackStateAfterManualWorkflowChange("paused"), "idle");
  assert.equal(normalizePlaybackStateAfterManualWorkflowChange("stopping"), "idle");
  assert.equal(normalizePlaybackStateAfterManualWorkflowChange("playing"), "playing");
});

test("workflow playback helpers resolve executable and next pauseable phases", () => {
  assert.equal(resolveWorkflowExecutionPhaseId("capture"), "clarification");
  assert.equal(resolveWorkflowExecutionPhaseId("technical-design"), "implementation");
  assert.equal(resolveWorkflowExecutionPhaseId("review"), "release-approval");
  assert.equal(resolveWorkflowExecutionPhaseId("pr-preparation"), null);
  assert.equal(resolveWorkflowExecutionPhaseId("unknown"), null);
  assert.equal(resolveNextWorkflowExecutionPhaseId("clarification"), "refinement");
  assert.equal(resolveNextWorkflowExecutionPhaseId("pr-preparation"), null);
  assert.equal(canPauseWorkflowExecutionPhase("implementation"), true);
  assert.equal(canPauseWorkflowExecutionPhase("capture"), false);
});
