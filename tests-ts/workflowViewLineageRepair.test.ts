import test from "node:test";
import assert from "node:assert/strict";
import { buildWorkflowHtml } from "../src-vscode/workflowView";

test("buildWorkflowHtml does not synthesize phase iterations from repaired history", () => {
  const html = buildWorkflowHtml({
    usId: "US-0001",
    title: "Repaired workflow",
    category: "workflow",
    status: "active",
    currentPhase: "technical-design",
    directoryPath: "/tmp/us",
    workBranch: null,
    mainArtifactPath: "/tmp/us.md",
    timelinePath: "/tmp/timeline.md",
    rawTimeline: "",
    phases: [
      {
        phaseId: "technical-design",
        title: "Technical Design",
        order: 3,
        requiresApproval: false,
        expectsHumanIntervention: false,
        isApproved: false,
        isCurrent: true,
        state: "current",
        artifactPath: "/tmp/02-technical-design.md",
        operationLogPath: null,
        executePromptPath: null,
        approvePromptPath: null
      }
    ],
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
      { timestampUtc: "2026-04-24T10:17:56.451Z", code: "phase_completed", actor: "system", phase: "technical-design", summary: "Generated artifact.", artifacts: ["/tmp/02-technical-design.md"], usage: null, durationMs: null, execution: null },
      { timestampUtc: "2026-04-30T08:50:02.380Z", code: "workflow_repaired", actor: "alice", phase: "technical-design", summary: "Deprecated inconsistent artifacts.", artifacts: ["/tmp/deprecated/03-implementation.md"], usage: null, durationMs: null, execution: null }
    ],
    phaseIterations: [],
    attachmentsDirectoryPath: "/tmp/attachments",
    attachments: []
  }, {
    selectedPhaseId: "technical-design",
    selectedArtifactContent: null,
    selectedOperationContent: null,
    contextSuggestions: [],
    settingsConfigured: true,
    settingsMessage: null,
    expandedIterationPhaseIds: ["technical-design"]
  }, "idle");

  assert.doesNotMatch(html, /workflow_repaired/);
  assert.doesNotMatch(html, /Iteration 1/);
});
