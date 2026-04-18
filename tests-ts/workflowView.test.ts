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
        artifacts: ["/tmp/01-refinement.md"],
        usage: {
          inputTokens: 321,
          outputTokens: 144,
          totalTokens: 465
        },
        durationMs: 4876
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
  assert.match(html, /<h2>Refinement<\/h2>/);
  assert.match(html, /Open Artifact/);
  assert.match(html, /Open Execute Prompt/);
  assert.match(html, /Open Approve Prompt/);
  assert.match(html, /Attach Files/);
  assert.match(html, /api-notes\.md/);
  assert.match(html, /Duration/);
  assert.match(html, /4\.88 s/);
  assert.match(html, /Input\/Output Tokens/);
  assert.match(html, />321 \/ 144</);
  assert.match(html, /Total Tokens/);
  assert.match(html, />465</);
  assert.match(html, /Response Speed/);
  assert.match(html, /29\.5 tok\/s/);
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
  assert.match(html, /data-command="play"[^>]*disabled/);
  assert.doesNotMatch(html, /data-command="continue"/);
});

test("buildWorkflowHtml animates the next link while autoplay is running", () => {
  const html = buildWorkflowHtml({
    usId: "US-0003",
    title: "Autoplay graph",
    category: "workflow",
    status: "active",
    currentPhase: "capture",
    directoryPath: "/tmp/us.US-0003",
    workBranch: null,
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
        isCurrent: true,
        state: "current",
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
        isCurrent: false,
        state: "pending",
        artifactPath: null,
        executePromptPath: null,
        approvePromptPath: null
      }
    ],
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
    settingsConfigured: true,
    settingsMessage: null
  }, "playing");

  assert.match(html, /graph-links path\.executing/);
  assert.match(html, /<path class="executing"/);
});

test("buildWorkflowHtml warns when the workflow is open without an SLM or LLM provider", () => {
  const html = buildWorkflowHtml({
    usId: "US-0002",
    title: "Workflow view",
    category: "workflow",
    status: "active",
    currentPhase: "capture",
    directoryPath: "/tmp/us.US-0002",
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
    settingsMessage: "SpecForge.AI needs an SLM/LLM execution provider before workflow stages can run. Select an OpenAI-compatible provider and configure base URL, API key, and model."
  }, "idle");

  assert.match(html, /SLM\/LLM execution provider/);
  assert.match(html, /data-command="play"[^>]*disabled/);
  assert.doesNotMatch(html, /data-command="continue"/);
});

test("buildWorkflowHtml spaces same-column phases far enough apart to avoid overlap", () => {
  const html = buildWorkflowHtml({
    usId: "US-0002",
    title: "Workflow layout",
    category: "workflow",
    status: "active",
    currentPhase: "implementation",
    directoryPath: "/tmp/us.US-0002",
    workBranch: "feature/us-0002-layout",
    mainArtifactPath: "/tmp/us.md",
    timelinePath: "/tmp/timeline.md",
    rawTimeline: "raw timeline",
    phases: [
      {
        phaseId: "capture",
        title: "Capture",
        order: 0,
        requiresApproval: false,
        isApproved: true,
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
        isApproved: true,
        isCurrent: false,
        state: "completed",
        artifactPath: null,
        executePromptPath: null,
        approvePromptPath: null
      },
      {
        phaseId: "technical-design",
        title: "Technical Design",
        order: 2,
        requiresApproval: true,
        isApproved: true,
        isCurrent: false,
        state: "completed",
        artifactPath: null,
        executePromptPath: null,
        approvePromptPath: null
      },
      {
        phaseId: "implementation",
        title: "Implementation",
        order: 3,
        requiresApproval: false,
        isApproved: false,
        isCurrent: true,
        state: "current",
        artifactPath: null,
        executePromptPath: null,
        approvePromptPath: null
      },
      {
        phaseId: "review",
        title: "Review",
        order: 4,
        requiresApproval: false,
        isApproved: false,
        isCurrent: false,
        state: "pending",
        artifactPath: null,
        executePromptPath: null,
        approvePromptPath: null
      },
      {
        phaseId: "release-approval",
        title: "Release Approval",
        order: 5,
        requiresApproval: true,
        isApproved: false,
        isCurrent: false,
        state: "pending",
        artifactPath: null,
        executePromptPath: null,
        approvePromptPath: null
      },
      {
        phaseId: "pr-preparation",
        title: "PR Preparation",
        order: 6,
        requiresApproval: false,
        isApproved: false,
        isCurrent: false,
        state: "pending",
        artifactPath: null,
        executePromptPath: null,
        approvePromptPath: null
      }
    ],
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
    selectedPhaseId: "implementation",
    selectedArtifactContent: null,
    settingsConfigured: true,
    settingsMessage: null
  }, "idle");

  assert.match(html, /\.phase-node\.technical-design \{ left: 392px; top: 352px; \}/);
  assert.match(html, /\.phase-node\.implementation \{ left: 18px; top: 462px; \}/);
  assert.match(html, /\.phase-node\.review \{ left: 18px; top: 652px; \}/);
  assert.match(html, /viewBox="0 0 700 1104"/);
});
