import test from "node:test";
import assert from "node:assert/strict";
import { buildWorkflowHtml } from "../src-vscode/workflowView";

test("buildWorkflowHtml renders phase detail and audit stream for the selected phase", () => {
  const html = buildWorkflowHtml({
    usId: "US-0001",
    title: "Workflow view",
    category: "workflow",
    status: "waiting-user",
    currentPhase: "refinement",
    workBranch: "feature/us-0001-workflow-view",
    mainArtifactPath: "/tmp/us.md",
    timelinePath: "/tmp/timeline.md",
    rawTimeline: "raw timeline",
    phases: [
      {
        phaseId: "capture",
        title: "Capture",
        order: 0,
        requiresApproval: false,
        isApproved: false,
        isCurrent: false,
        state: "completed",
        artifactPath: null
      },
      {
        phaseId: "refinement",
        title: "Refinement",
        order: 1,
        requiresApproval: true,
        isApproved: false,
        isCurrent: true,
        state: "current",
        artifactPath: "/tmp/01-refinement.md"
      }
    ],
    controls: {
      canContinue: false,
      canApprove: true,
      requiresApproval: true,
      blockingReason: "refinement_pending_user_approval",
      canRestartFromSource: true,
      regressionTargets: []
    },
    events: [
      {
        timestampUtc: "2026-04-18T10:00:00Z",
        code: "phase_completed",
        actor: "system",
        phase: "refinement",
        summary: "Generated refinement artifact.",
        artifacts: ["/tmp/01-refinement.md"]
      }
    ]
  }, {
    selectedPhaseId: "refinement",
    selectedArtifactContent: "## Refinement\nBody"
  }, "idle");

  assert.match(html, /US-0001 · Workflow view/);
  assert.match(html, /Workflow Constellation/);
  assert.match(html, /phase-graph/);
  assert.match(html, /phase-node refinement current selected/);
  assert.match(html, /Generated refinement artifact\./);
  assert.match(html, /## Refinement/);
  assert.match(html, /Open Artifact/);
});
