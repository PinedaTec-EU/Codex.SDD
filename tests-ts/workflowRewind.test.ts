import test from "node:test";
import assert from "node:assert/strict";
import { buildTimelineRewindPhaseHistory, resolveTimelineRewindTargetPhase } from "../src-vscode/workflowRewind";

test("buildTimelineRewindPhaseHistory ignores explicit rewind events and preserves the execution storyline", () => {
  const workflow = {
    usId: "US-0100",
    title: "Workflow",
    category: "workflow",
    status: "active",
    currentPhase: "review",
    directoryPath: "/tmp/us",
    workBranch: "feature/us-0100",
    mainArtifactPath: "/tmp/us.md",
    timelinePath: "/tmp/timeline.md",
    rawTimeline: "",
    phases: [],
    controls: {
      canContinue: false,
      canApprove: false,
      requiresApproval: false,
      blockingReason: null,
      canRestartFromSource: true,
      regressionTargets: [],
      rewindTargets: ["technical-design", "implementation"]
    },
    clarification: null,
    events: [
      { timestampUtc: "2026-04-27T08:00:00Z", code: "phase_completed", actor: "system", phase: "clarification", summary: null, artifacts: [], usage: null, durationMs: null, execution: null },
      { timestampUtc: "2026-04-27T08:10:00Z", code: "phase_completed", actor: "system", phase: "refinement", summary: null, artifacts: [], usage: null, durationMs: null, execution: null },
      { timestampUtc: "2026-04-27T08:20:00Z", code: "phase_completed", actor: "system", phase: "technical-design", summary: null, artifacts: [], usage: null, durationMs: null, execution: null },
      { timestampUtc: "2026-04-27T08:30:00Z", code: "phase_completed", actor: "system", phase: "implementation", summary: null, artifacts: [], usage: null, durationMs: null, execution: null },
      { timestampUtc: "2026-04-27T08:40:00Z", code: "workflow_rewound", actor: "alice", phase: "technical-design", summary: null, artifacts: [], usage: null, durationMs: null, execution: null },
      { timestampUtc: "2026-04-27T08:50:00Z", code: "artifact_operated", actor: "alice", phase: "implementation", summary: null, artifacts: [], usage: null, durationMs: null, execution: null },
      { timestampUtc: "2026-04-27T09:00:00Z", code: "phase_completed", actor: "system", phase: "review", summary: null, artifacts: [], usage: null, durationMs: null, execution: null }
    ],
    attachmentsDirectoryPath: "/tmp/attachments",
    attachments: []
  };

  assert.deepEqual(buildTimelineRewindPhaseHistory(workflow), [
    "capture",
    "clarification",
    "refinement",
    "technical-design",
    "implementation",
    "review"
  ]);
});

test("resolveTimelineRewindTargetPhase walks backwards through the effective timeline", () => {
  const workflow = {
    usId: "US-0101",
    title: "Workflow",
    category: "workflow",
    status: "active",
    currentPhase: "review",
    directoryPath: "/tmp/us",
    workBranch: "feature/us-0101",
    mainArtifactPath: "/tmp/us.md",
    timelinePath: "/tmp/timeline.md",
    rawTimeline: "",
    phases: [],
    controls: {
      canContinue: false,
      canApprove: false,
      requiresApproval: false,
      blockingReason: null,
      canRestartFromSource: true,
      regressionTargets: [],
      rewindTargets: ["technical-design", "implementation"]
    },
    clarification: null,
    events: [
      { timestampUtc: "2026-04-27T08:00:00Z", code: "phase_completed", actor: "system", phase: "clarification", summary: null, artifacts: [], usage: null, durationMs: null, execution: null },
      { timestampUtc: "2026-04-27T08:10:00Z", code: "phase_completed", actor: "system", phase: "refinement", summary: null, artifacts: [], usage: null, durationMs: null, execution: null },
      { timestampUtc: "2026-04-27T08:20:00Z", code: "phase_completed", actor: "system", phase: "technical-design", summary: null, artifacts: [], usage: null, durationMs: null, execution: null },
      { timestampUtc: "2026-04-27T08:30:00Z", code: "phase_completed", actor: "system", phase: "implementation", summary: null, artifacts: [], usage: null, durationMs: null, execution: null },
      { timestampUtc: "2026-04-27T09:00:00Z", code: "phase_completed", actor: "system", phase: "review", summary: null, artifacts: [], usage: null, durationMs: null, execution: null }
    ],
    attachmentsDirectoryPath: "/tmp/attachments",
    attachments: []
  };

  assert.equal(resolveTimelineRewindTargetPhase(workflow, "review"), "implementation");
  assert.equal(resolveTimelineRewindTargetPhase(workflow, "implementation"), "technical-design");
  assert.equal(resolveTimelineRewindTargetPhase(workflow, "capture"), null);
});
