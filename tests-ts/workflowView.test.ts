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
    directoryPath: "/tmp/us.US-0001",
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
        artifactPath: null,
        executePromptPath: null,
        approvePromptPath: null
      },
      {
        phaseId: "refinement",
        title: "Refinement",
        order: 1,
        requiresApproval: true,
        isApproved: false,
        isCurrent: true,
        state: "current",
        artifactPath: "/tmp/01-refinement.md",
        executePromptPath: "/tmp/refinement.execute.md",
        approvePromptPath: "/tmp/refinement.approve.md"
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
    ],
    attachmentsDirectoryPath: "/tmp/attachments",
    attachments: [
      {
        name: "api-notes.md",
        path: "/tmp/attachments/api-notes.md"
      }
    ]
  }, {
    selectedPhaseId: "refinement",
    selectedArtifactContent: "## Refinement\nBody",
    settingsConfigured: true,
    settingsMessage: null
  }, "idle");

  assert.match(html, /US-0001 · Workflow view/);
  assert.match(html, /Workflow Constellation/);
  assert.match(html, /phase-graph/);
  assert.match(html, /phase-node refinement current selected/);
  assert.match(html, /currentFlow/);
  assert.match(html, /currentPulse/);
  assert.match(html, /Generated refinement artifact\./);
  assert.match(html, /## Refinement/);
  assert.match(html, /Open Artifact/);
  assert.match(html, /Open Execute Prompt/);
  assert.match(html, /Open Approve Prompt/);
  assert.match(html, /Attach Files/);
  assert.match(html, /api-notes\.md/);
});

test("buildWorkflowHtml shows configuration warning and disables execution controls when settings are incomplete", () => {
  const html = buildWorkflowHtml({
    usId: "US-0001",
    title: "Workflow view",
    category: "workflow",
    status: "active",
    currentPhase: "capture",
    directoryPath: "/tmp/us.US-0001",
    workBranch: null,
    mainArtifactPath: "/tmp/us.md",
    timelinePath: "/tmp/timeline.md",
    rawTimeline: "raw timeline",
    phases: [{
      phaseId: "capture",
      title: "Capture",
      order: 0,
      requiresApproval: false,
      isApproved: false,
      isCurrent: true,
      state: "current",
      artifactPath: null,
      executePromptPath: null,
      approvePromptPath: null
    }],
    controls: {
      canContinue: true,
      canApprove: false,
      requiresApproval: false,
      blockingReason: null,
      canRestartFromSource: false,
      regressionTargets: []
    },
    events: [],
    attachmentsDirectoryPath: "/tmp/attachments",
    attachments: []
  }, {
    selectedPhaseId: "capture",
    selectedArtifactContent: null,
    settingsConfigured: false,
    settingsMessage: "SpecForge.AI is not configured for the current provider. Missing base URL, API key, model."
  }, "idle");

  assert.match(html, /SpecForge\.AI settings are incomplete/);
  assert.match(html, /Configure Settings/);
  assert.match(html, /<button data-command="play" disabled>/);
  assert.match(html, /<button data-command="continue" disabled>/);
});
