import test from "node:test";
import assert from "node:assert/strict";
import {
  buildTimelineRewindPhaseHistory,
  buildTimelineRewindPoints,
  resolveTimelineRewindDecision,
  resolveTimelineRewindTargetPhase
} from "../src-vscode/workflowRewind";

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
    refinement: null,
    events: [
      { timestampUtc: "2026-04-27T08:00:00Z", code: "phase_completed", actor: "system", phase: "refinement", summary: null, artifacts: [], usage: null, durationMs: null, execution: null },
      { timestampUtc: "2026-04-27T08:10:00Z", code: "phase_completed", actor: "system", phase: "spec", summary: null, artifacts: [], usage: null, durationMs: null, execution: null },
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
    "refinement",
    "spec",
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
    refinement: null,
    events: [
      { timestampUtc: "2026-04-27T08:00:00Z", code: "phase_completed", actor: "system", phase: "refinement", summary: null, artifacts: [], usage: null, durationMs: null, execution: null },
      { timestampUtc: "2026-04-27T08:10:00Z", code: "phase_completed", actor: "system", phase: "spec", summary: null, artifacts: [], usage: null, durationMs: null, execution: null },
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

test("resolveTimelineRewindDecision blocks the reopened landing phase", () => {
  const workflow = {
    usId: "US-0102",
    title: "Workflow",
    category: "workflow",
    status: "active",
    currentPhase: "technical-design",
    directoryPath: "/tmp/us",
    workBranch: "feature/us-0102",
    mainArtifactPath: "/tmp/us.md",
    timelinePath: "/tmp/timeline.md",
    rawTimeline: "",
    phases: [],
    controls: {
      canContinue: true,
      canApprove: false,
      requiresApproval: false,
      blockingReason: null,
      canRestartFromSource: true,
      regressionTargets: [],
      rewindTargets: ["spec"]
    },
    refinement: null,
    events: [
      { timestampUtc: "2026-04-27T08:00:00Z", code: "phase_completed", actor: "system", phase: "spec", summary: null, artifacts: [], usage: null, durationMs: null, execution: null },
      { timestampUtc: "2026-04-27T09:00:00Z", code: "workflow_reopened", actor: "alice", phase: "technical-design", summary: null, artifacts: [], usage: null, durationMs: null, execution: null }
    ],
    attachmentsDirectoryPath: "/tmp/attachments",
    attachments: []
  };

  const decision = resolveTimelineRewindDecision(workflow, "technical-design");

  assert.equal(decision.allowed, false);
  assert.equal(decision.reasonCode, "reopened-landing");
  assert.match(decision.reasonMessage ?? "", /reopened from a completed state/);
});

test("resolveTimelineRewindDecision blocks ambiguous implementation review history", () => {
  const workflow = {
    usId: "US-0103",
    title: "Workflow",
    category: "workflow",
    status: "active",
    currentPhase: "review",
    directoryPath: "/tmp/us",
    workBranch: "feature/us-0103",
    mainArtifactPath: "/tmp/us.md",
    timelinePath: "/tmp/timeline.md",
    rawTimeline: "",
    phases: [],
    controls: {
      canContinue: true,
      canApprove: false,
      requiresApproval: false,
      blockingReason: null,
      canRestartFromSource: true,
      regressionTargets: [],
      rewindTargets: ["technical-design", "implementation"]
    },
    refinement: null,
    events: [
      { timestampUtc: "2026-04-27T08:00:00Z", code: "phase_completed", actor: "system", phase: "technical-design", summary: null, artifacts: [], usage: null, durationMs: null, execution: null },
      { timestampUtc: "2026-04-27T08:10:00Z", code: "phase_completed", actor: "system", phase: "implementation", summary: null, artifacts: [], usage: null, durationMs: null, execution: null },
      { timestampUtc: "2026-04-27T08:20:00Z", code: "phase_completed", actor: "system", phase: "review", summary: null, artifacts: [], usage: null, durationMs: null, execution: null }
    ],
    phaseIterations: [
      { iterationKey: "implementation:1", attempt: 1, phaseId: "implementation", timestampUtc: "2026-04-27T08:10:00Z", code: "phase_completed", actor: "system", summary: null, inputArtifactPath: null, contextArtifactPaths: [], outputArtifactPath: "/tmp/impl.md", operationLogPath: null, operationPrompt: null, usage: null, durationMs: null, execution: null },
      { iterationKey: "review:1", attempt: 1, phaseId: "review", timestampUtc: "2026-04-27T08:20:00Z", code: "phase_completed", actor: "system", summary: null, inputArtifactPath: null, contextArtifactPaths: [], outputArtifactPath: "/tmp/review.md", operationLogPath: null, operationPrompt: null, usage: null, durationMs: null, execution: null },
      { iterationKey: "implementation:2", attempt: 2, phaseId: "implementation", timestampUtc: "2026-04-27T08:30:00Z", code: "phase_completed", actor: "system", summary: null, inputArtifactPath: null, contextArtifactPaths: [], outputArtifactPath: "/tmp/impl2.md", operationLogPath: null, operationPrompt: null, usage: null, durationMs: null, execution: null }
    ],
    attachmentsDirectoryPath: "/tmp/attachments",
    attachments: []
  };

  const decision = resolveTimelineRewindDecision(workflow, "review");
  const points = buildTimelineRewindPoints(workflow, "review");

  assert.equal(decision.allowed, false);
  assert.equal(decision.reasonCode, "ambiguous-implementation-review");
  assert.match(decision.reasonMessage ?? "", /multiple iterations/);
  assert.equal(points.some((point) => point.phaseId === "implementation" && !point.canSelect), true);
});

test("buildTimelineRewindPoints carries iteration identity for repeated temporal positions", () => {
  const workflow = {
    usId: "US-0104",
    title: "Workflow",
    category: "workflow",
    status: "active",
    currentPhase: "release-approval",
    directoryPath: "/tmp/us",
    workBranch: "feature/us-0104",
    mainArtifactPath: "/tmp/us.md",
    timelinePath: "/tmp/timeline.md",
    rawTimeline: "",
    phases: [
      { phaseId: "release-approval", title: "Release Approval", order: 6, requiresApproval: true, expectsHumanIntervention: true, isApproved: false, isCurrent: true, state: "current", artifactPath: "/tmp/release.md", operationLogPath: null, executePromptPath: null, approvePromptPath: null }
    ],
    controls: {
      canContinue: true,
      canApprove: false,
      requiresApproval: false,
      blockingReason: null,
      canRestartFromSource: true,
      regressionTargets: [],
      rewindTargets: ["release-approval"]
    },
    refinement: null,
    events: [
      { timestampUtc: "2026-04-27T08:00:00Z", code: "phase_completed", actor: "system", phase: "release-approval", summary: null, artifacts: [], usage: null, durationMs: null, execution: null },
      { timestampUtc: "2026-04-27T08:10:00Z", code: "phase_completed", actor: "system", phase: "pr-preparation", summary: null, artifacts: [], usage: null, durationMs: null, execution: null },
      { timestampUtc: "2026-04-27T08:20:00Z", code: "phase_completed", actor: "system", phase: "release-approval", summary: null, artifacts: [], usage: null, durationMs: null, execution: null }
    ],
    phaseIterations: [
      { iterationKey: "release:1", attempt: 1, phaseId: "release-approval", timestampUtc: "2026-04-27T08:00:00Z", code: "phase_completed", actor: "system", summary: null, inputArtifactPath: null, contextArtifactPaths: [], outputArtifactPath: "/tmp/release1.md", operationLogPath: null, operationPrompt: null, usage: null, durationMs: null, execution: null },
      { iterationKey: "release:2", attempt: 2, phaseId: "release-approval", timestampUtc: "2026-04-27T08:20:00Z", code: "phase_completed", actor: "system", summary: null, inputArtifactPath: null, contextArtifactPaths: [], outputArtifactPath: "/tmp/release2.md", operationLogPath: null, operationPrompt: null, usage: null, durationMs: null, execution: null }
    ],
    attachmentsDirectoryPath: "/tmp/attachments",
    attachments: []
  };

  const points = buildTimelineRewindPoints(workflow, "release-approval");
  const firstReleasePoint = points.find((point) => point.iterationKey === "release:1");
  const secondReleasePoint = points.find((point) => point.iterationKey === "release:2");

  assert.equal(firstReleasePoint?.canSelect, true);
  assert.equal(firstReleasePoint?.label, "Release Approval");
  assert.equal(secondReleasePoint?.isCurrent, true);
  assert.equal(secondReleasePoint?.label, "Release Approval #2");
});

test("buildTimelineRewindPhaseHistory starts at the latest lineage repair", () => {
  const workflow = {
    usId: "US-0105",
    title: "Workflow",
    category: "workflow",
    status: "active",
    currentPhase: "technical-design",
    directoryPath: "/tmp/us",
    workBranch: "feature/us-0105",
    mainArtifactPath: "/tmp/us.md",
    timelinePath: "/tmp/timeline.md",
    rawTimeline: "",
    phases: [],
    controls: {
      canContinue: true,
      canApprove: false,
      requiresApproval: false,
      blockingReason: null,
      canRestartFromSource: true,
      regressionTargets: [],
      rewindTargets: []
    },
    refinement: null,
    events: [
      { timestampUtc: "2026-04-27T08:00:00Z", code: "phase_completed", actor: "system", phase: "implementation", summary: null, artifacts: [], usage: null, durationMs: null, execution: null },
      { timestampUtc: "2026-04-27T08:10:00Z", code: "phase_completed", actor: "system", phase: "review", summary: null, artifacts: [], usage: null, durationMs: null, execution: null },
      { timestampUtc: "2026-04-27T08:20:00Z", code: "workflow_repaired", actor: "alice", phase: "technical-design", summary: null, artifacts: [], usage: null, durationMs: null, execution: null }
    ],
    attachmentsDirectoryPath: "/tmp/attachments",
    attachments: []
  };

  assert.deepEqual(buildTimelineRewindPhaseHistory(workflow), [
    "capture",
    "technical-design"
  ]);
});
