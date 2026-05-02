import test from "node:test";
import assert from "node:assert/strict";
import {
  canPauseWorkflowExecutionPhase,
  normalizePlaybackStateAfterManualWorkflowChange,
  resolveExecutionModelResponsePreview,
  resolveNextWorkflowExecutionPhaseId,
  resolveWorkflowExecutionPhaseId
} from "../src-vscode/workflowPlaybackState";
import { resolvePreferredSelectedWorkflowPhaseId } from "../src-vscode/workflowPhaseSelection";

test("normalizePlaybackStateAfterManualWorkflowChange clears stale paused overlays after manual workflow actions", () => {
  assert.equal(normalizePlaybackStateAfterManualWorkflowChange("idle"), "idle");
  assert.equal(normalizePlaybackStateAfterManualWorkflowChange("paused"), "idle");
  assert.equal(normalizePlaybackStateAfterManualWorkflowChange("stopping"), "idle");
  assert.equal(normalizePlaybackStateAfterManualWorkflowChange("playing"), "playing");
});

test("workflow playback helpers resolve executable and next pauseable phases", () => {
  assert.equal(resolveWorkflowExecutionPhaseId("capture"), "refinement");
  assert.equal(resolveWorkflowExecutionPhaseId("technical-design"), "implementation");
  assert.equal(resolveWorkflowExecutionPhaseId("review"), "release-approval");
  assert.equal(resolveWorkflowExecutionPhaseId("pr-preparation"), null);
  assert.equal(resolveWorkflowExecutionPhaseId("unknown"), null);
  assert.equal(resolveNextWorkflowExecutionPhaseId("refinement"), "spec");
  assert.equal(resolveNextWorkflowExecutionPhaseId("pr-preparation"), null);
  assert.equal(canPauseWorkflowExecutionPhase("implementation"), true);
  assert.equal(canPauseWorkflowExecutionPhase("capture"), false);
});

test("resolveExecutionModelResponsePreview keeps only the latest model status message", () => {
  assert.equal(
    resolveExecutionModelResponsePreview("  Thinking...\n\nChecking files  "),
    "Thinking... Checking files"
  );
  assert.equal(resolveExecutionModelResponsePreview(" \n\t "), null);
  assert.equal(
    resolveExecutionModelResponsePreview(`${"x".repeat(901)}`),
    `${"x".repeat(900)}...`
  );
});

test("resolvePreferredSelectedWorkflowPhaseId keeps the real last phase selected after workflow completion", () => {
  const workflow = {
    usId: "US-0001",
    title: "Workflow",
    category: "travel",
    status: "completed",
    currentPhase: "pr-preparation",
    directoryPath: "/tmp/us",
    workBranch: "feature/us-0001",
    mainArtifactPath: "/tmp/us.md",
    timelinePath: "/tmp/timeline.md",
    rawTimeline: "",
    phases: [],
    controls: {
      canContinue: false,
      canApprove: false,
      requiresApproval: false,
      blockingReason: "workflow_completed",
      canRestartFromSource: false,
      regressionTargets: [],
      rewindTargets: []
    },
    refinement: null,
    events: [],
    attachmentsDirectoryPath: "/tmp/attachments",
    attachments: []
  };

  assert.equal(resolvePreferredSelectedWorkflowPhaseId(workflow, "pr-preparation"), "pr-preparation");
  assert.equal(resolvePreferredSelectedWorkflowPhaseId(workflow, "completed"), "completed");
});
