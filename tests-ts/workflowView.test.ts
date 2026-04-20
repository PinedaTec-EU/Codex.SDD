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
    clarification: null,
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
    contextFilesDirectoryPath: "/tmp/context",
    contextFiles: [
      {
        name: "service.cs",
        path: "/tmp/context/service.cs"
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
    contextSuggestions: [],
    settingsConfigured: true,
    settingsMessage: null
  }, "idle");

  assert.match(html, /US-0001 · Workflow view/);
  assert.match(html, /Workflow Constellation/);
  assert.match(html, /phase-graph/);
  assert.match(html, /phase-node refinement phase-tone-waiting-user selected/);
  assert.match(html, /phase-tag phase-tag--waiting-user">waiting-user</);
  assert.match(html, /currentFlow/);
  assert.match(html, /currentPulse/);
  assert.match(html, /Generated refinement artifact\./);
  assert.match(html, /<h2>Refinement<\/h2>/);
  assert.match(html, /Open Artifact/);
  assert.match(html, /Open Execute Prompt/);
  assert.match(html, /Open Approve Prompt/);
  assert.match(html, /data-open-workflow-files/);
  assert.doesNotMatch(html, />Reset</);
  assert.doesNotMatch(html, /debugResetToCapture/);
  assert.match(html, /Workflow-level files are grouped here instead of repeating them in every phase detail\./);
  assert.match(html, /<h4>User Story<\/h4>/);
  assert.match(html, /us\.md/);
  assert.match(html, /Add Files/);
  assert.match(html, /Context Files/);
  assert.match(html, /User Story Info/);
  assert.match(html, /data-file-drop-zone/);
  assert.match(html, /data-drop-kind="context"/);
  assert.match(html, /data-drop-kind="attachment"/);
  assert.match(html, /draggable="true"/);
  assert.match(html, /service\.cs/);
  assert.match(html, /api-notes\.md/);
  assert.match(html, /Duration/);
  assert.match(html, /4\.88 s/);
  assert.match(html, /Input\/Output Tokens/);
  assert.match(html, />321 \/ 144</);
  assert.match(html, /Total Tokens/);
  assert.match(html, />465</);
  assert.match(html, /Response Speed/);
  assert.match(html, /29\.5 tok\/s/);
  assert.doesNotMatch(html, /<h3>Workflow Files<\/h3>/);
  assert.match(html, /attachment-item--dragging/);
  assert.match(html, /command: "setFileKind"/);
  assert.match(html, /vscode\.getState\(\)/);
  assert.match(html, /workflowFilesOpen/);
  assert.match(html, /vscode\.setState\(/);
});

test("buildWorkflowHtml shows the debug reset action only in debug mode", () => {
  const html = buildWorkflowHtml({
    usId: "US-0099",
    title: "Debug workflow",
    category: "workflow",
    status: "waiting-user",
    currentPhase: "refinement",
    directoryPath: "/tmp/us.US-0099",
    workBranch: null,
    mainArtifactPath: "/tmp/us.md",
    timelinePath: "/tmp/timeline.md",
    rawTimeline: "raw timeline",
    phases: [{
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
    }],
    controls: {
      canContinue: false,
      canApprove: true,
      requiresApproval: true,
      blockingReason: "refinement_pending_user_approval",
      canRestartFromSource: true,
      regressionTargets: []
    },
    clarification: null,
    events: [],
    attachmentsDirectoryPath: "/tmp/attachments",
    attachments: []
  }, {
    selectedPhaseId: "refinement",
    selectedArtifactContent: "## Refinement",
    contextSuggestions: [],
    settingsConfigured: true,
    settingsMessage: null,
    debugMode: true
  }, "idle");

  assert.match(html, /Reset to Capture/);
  assert.match(html, /data-command="debugResetToCapture"/);
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
    clarification: null,
    events: [],
    attachmentsDirectoryPath: "/tmp/attachments",
    attachments: []
  }, {
    selectedPhaseId: "capture",
    selectedArtifactContent: null,
    contextSuggestions: [],
    settingsConfigured: false,
    settingsMessage: "SpecForge.AI is not configured for the current provider. Missing base URL, API key, model."
  }, "idle");

  assert.match(html, /SpecForge\.AI settings are incomplete/);
  assert.match(html, /Configure Settings/);
  assert.match(html, /data-command="play"[^>]*disabled/);
  assert.doesNotMatch(html, /data-command="continue"/);
});

test("buildWorkflowHtml animates the current execution phase while autoplay is running", () => {
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
    clarification: null,
    events: [],
    attachmentsDirectoryPath: "/tmp/attachments",
    attachments: []
  }, {
    selectedPhaseId: "capture",
    selectedArtifactContent: null,
    contextSuggestions: [],
    executionPhaseId: "refinement",
    completedPhaseIds: ["capture"],
    settingsConfigured: true,
    settingsMessage: null
  }, "playing");

  assert.match(html, /graph-links path\.executing/);
  assert.match(html, /<path class="executing"/);
  assert.match(html, /data-execution-overlay/);
  assert.match(html, /Executing Refinement/);
  assert.match(html, /shuffleMessages/);
  assert.match(html, /formatOverlayElapsed/);
  assert.match(html, /restoreExecutionOverlayState/);
  assert.match(html, /persistExecutionOverlayState/);
  assert.match(html, /sessionStorage/);
  assert.match(html, /if \(overlayTone !== "playing" && graphStage\)/);
});

test("buildWorkflowHtml shows clarification as the active execution step from capture", () => {
  const html = buildWorkflowHtml({
    usId: "US-0004",
    title: "Capture autoplay",
    category: "workflow",
    status: "active",
    currentPhase: "capture",
    directoryPath: "/tmp/us.US-0004",
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
        phaseId: "clarification",
        title: "Clarification",
        order: 1,
        requiresApproval: false,
        isApproved: false,
        isCurrent: false,
        state: "pending",
        artifactPath: null,
        executePromptPath: null,
        approvePromptPath: null
      },
      {
        phaseId: "refinement",
        title: "Refinement",
        order: 2,
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
    clarification: null,
    events: [],
    attachmentsDirectoryPath: "/tmp/attachments",
    attachments: []
  }, {
    selectedPhaseId: "capture",
    selectedArtifactContent: null,
    contextSuggestions: [],
    executionPhaseId: "clarification",
    completedPhaseIds: ["capture"],
    settingsConfigured: true,
    settingsMessage: null
  }, "playing");

  assert.match(html, /<path class="executing"/);
  assert.match(html, /phase-node clarification phase-tone-active/);
  assert.match(html, /Executing Clarification/);
  assert.match(html, /phase-node capture phase-tone-completed/);
});

test("buildWorkflowHtml keeps clarification visible in the graph even before any clarification history exists", () => {
  const html = buildWorkflowHtml({
    usId: "US-0004A",
    title: "Clarification always visible",
    category: "workflow",
    status: "active",
    currentPhase: "capture",
    directoryPath: "/tmp/us.US-0004A",
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
        phaseId: "clarification",
        title: "Clarification",
        order: 1,
        requiresApproval: false,
        isApproved: false,
        isCurrent: false,
        state: "pending",
        artifactPath: null,
        executePromptPath: null,
        approvePromptPath: null
      },
      {
        phaseId: "refinement",
        title: "Refinement",
        order: 2,
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
    clarification: null,
    events: [],
    attachmentsDirectoryPath: "/tmp/attachments",
    attachments: []
  }, {
    selectedPhaseId: "capture",
    selectedArtifactContent: null,
    contextSuggestions: [],
    settingsConfigured: true,
    settingsMessage: null
  }, "idle");

  assert.match(html, /phase-node clarification /);
  assert.match(html, /<h3>Clarification<\/h3>/);
});

test("buildWorkflowHtml advances the execution overlay to refinement after clarification passes", () => {
  const html = buildWorkflowHtml({
    usId: "US-0005",
    title: "Clarification to refinement",
    category: "workflow",
    status: "active",
    currentPhase: "capture",
    directoryPath: "/tmp/us.US-0005",
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
        phaseId: "clarification",
        title: "Clarification",
        order: 1,
        requiresApproval: false,
        isApproved: false,
        isCurrent: false,
        state: "pending",
        artifactPath: "/tmp/00-clarification.md",
        executePromptPath: null,
        approvePromptPath: null
      },
      {
        phaseId: "refinement",
        title: "Refinement",
        order: 2,
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
    clarification: null,
    events: [],
    attachmentsDirectoryPath: "/tmp/attachments",
    attachments: []
  }, {
    selectedPhaseId: "capture",
    selectedArtifactContent: null,
    contextSuggestions: [],
    executionPhaseId: "refinement",
    completedPhaseIds: ["capture", "clarification"],
    settingsConfigured: true,
    settingsMessage: null
  }, "playing");

  assert.match(html, /Executing Refinement/);
  assert.match(html, /phase-node clarification phase-tone-completed/);
  assert.match(html, /phase-node refinement phase-tone-active/);
});

test("buildWorkflowHtml embeds a broad rotating execution message catalog for long runs", () => {
  const html = buildWorkflowHtml({
    usId: "US-0009",
    title: "Long execution",
    category: "workflow",
    status: "active",
    currentPhase: "implementation",
    directoryPath: "/tmp/us.US-0009",
    workBranch: null,
    mainArtifactPath: "/tmp/us.md",
    timelinePath: "/tmp/timeline.md",
    rawTimeline: "raw timeline",
    phases: [
      {
        phaseId: "implementation",
        title: "Implementation",
        order: 0,
        requiresApproval: false,
        isApproved: false,
        isCurrent: true,
        state: "current",
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
    clarification: null,
    events: [],
    attachmentsDirectoryPath: "/tmp/attachments",
    attachments: []
  }, {
    selectedPhaseId: "implementation",
    selectedArtifactContent: null,
    contextSuggestions: [],
    settingsConfigured: true,
    settingsMessage: null
  }, "playing");

  assert.match(html, /data-tone="playing"/);
  assert.match(html, /data-execution-message/);
  assert.match(html, /data-execution-elapsed/);
  assert.match(html, /data-show-elapsed="true"/);
  assert.match(html, /Trying to keep the patch surgical instead of theatrical\./);
  assert.match(html, /Untangling edge cases before they untangle the plan\./);
  assert.match(html, /Math\.random/);
  assert.match(html, /graph-stage--overlay-active/);
});

test("buildWorkflowHtml shows paused execution overlay above the graph", () => {
  const html = buildWorkflowHtml({
    usId: "US-0010",
    title: "Paused execution",
    category: "workflow",
    status: "waiting-user",
    currentPhase: "review",
    directoryPath: "/tmp/us.US-0010",
    workBranch: null,
    mainArtifactPath: "/tmp/us.md",
    timelinePath: "/tmp/timeline.md",
    rawTimeline: "raw timeline",
    phases: [
      {
        phaseId: "review",
        title: "Review",
        order: 0,
        requiresApproval: false,
        isApproved: false,
        isCurrent: true,
        state: "current",
        artifactPath: null,
        executePromptPath: null,
        approvePromptPath: null
      }
    ],
    controls: {
      canContinue: false,
      canApprove: false,
      requiresApproval: false,
      blockingReason: null,
      canRestartFromSource: false,
      regressionTargets: []
    },
    clarification: null,
    events: [],
    attachmentsDirectoryPath: "/tmp/attachments",
    attachments: []
  }, {
    selectedPhaseId: "review",
    selectedArtifactContent: null,
    contextSuggestions: [],
    settingsConfigured: true,
    settingsMessage: null
  }, "paused");

  assert.match(html, /execution-overlay execution-overlay--paused/);
  assert.match(html, /Paused after Review/);
  assert.match(html, /Playback is paused at the phase boundary/);
  assert.doesNotMatch(html, /<span class="execution-overlay__elapsed"/);
  assert.match(html, /data-show-elapsed="false"/);
  assert.match(html, /\.graph-stage\.graph-stage--overlay-active \.phase-graph[\s\S]*pointer-events: none;/);
  assert.match(html, /graphStage\.classList\.remove\("graph-stage--overlay-active"\)/);
  assert.match(html, /document\.addEventListener\("pointerdown"/);
});

test("buildWorkflowHtml locks background interaction while the workflow files modal is open", () => {
  const html = buildWorkflowHtml({
    usId: "US-0014",
    title: "Modal lock",
    category: "workflow",
    status: "active",
    currentPhase: "refinement",
    directoryPath: "/tmp/us.US-0014",
    workBranch: null,
    mainArtifactPath: "/tmp/us.md",
    timelinePath: "/tmp/timeline.md",
    rawTimeline: "raw timeline",
    phases: [{
      phaseId: "refinement",
      title: "Refinement",
      order: 0,
      requiresApproval: true,
      isApproved: false,
      isCurrent: true,
      state: "current",
      artifactPath: "/tmp/01-refinement.md",
      executePromptPath: "/tmp/refinement.execute.md",
      approvePromptPath: "/tmp/refinement.approve.md"
    }],
    controls: {
      canContinue: false,
      canApprove: true,
      requiresApproval: true,
      blockingReason: "refinement_pending_user_approval",
      canRestartFromSource: true,
      regressionTargets: []
    },
    clarification: null,
    events: [],
    attachmentsDirectoryPath: "/tmp/attachments",
    attachments: []
  }, {
    selectedPhaseId: "refinement",
    selectedArtifactContent: "## Refinement",
    contextSuggestions: [],
    settingsConfigured: true,
    settingsMessage: null
  }, "idle");

  assert.match(html, /<div class="shell" data-workflow-shell>/);
  assert.match(html, /\.shell\.shell--interaction-locked[\s\S]*pointer-events: none;/);
  assert.match(html, /workflowShell\.classList\.toggle\("shell--interaction-locked", open\)/);
});

test("buildWorkflowHtml highlights waiting-user and runner paused hero tokens as attention states", () => {
  const html = buildWorkflowHtml({
    usId: "US-0011",
    title: "Attention tokens",
    category: "workflow",
    status: "waiting-user",
    currentPhase: "clarification",
    directoryPath: "/tmp/us.US-0011",
    workBranch: null,
    mainArtifactPath: "/tmp/us.md",
    timelinePath: "/tmp/timeline.md",
    rawTimeline: "raw timeline",
    phases: [
      {
        phaseId: "clarification",
        title: "Clarification",
        order: 0,
        requiresApproval: false,
        isApproved: false,
        isCurrent: true,
        state: "current",
        artifactPath: null,
        executePromptPath: null,
        approvePromptPath: null
      }
    ],
    controls: {
      canContinue: false,
      canApprove: false,
      requiresApproval: false,
      blockingReason: "clarification_pending_answers",
      canRestartFromSource: false,
      regressionTargets: []
    },
    clarification: null,
    events: [],
    attachmentsDirectoryPath: "/tmp/attachments",
    attachments: []
  }, {
    selectedPhaseId: "clarification",
    selectedArtifactContent: null,
    contextSuggestions: [],
    settingsConfigured: true,
    settingsMessage: null
  }, "paused");

  assert.match(html, /token token--attention">waiting-user</);
  assert.match(html, /token token--attention">runner:paused</);
  assert.match(html, /phase-node clarification phase-tone-paused selected/);
  assert.match(html, /phase-tag phase-tag--paused">paused</);
});

test("buildWorkflowHtml reuses sidebar status colors in graph nodes and hero tokens", () => {
  const html = buildWorkflowHtml({
    usId: "US-0012",
    title: "Shared phase semantics",
    category: "workflow",
    status: "blocked",
    currentPhase: "technical-design",
    directoryPath: "/tmp/us.US-0012",
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
        isCurrent: false,
        state: "completed",
        artifactPath: null,
        executePromptPath: null,
        approvePromptPath: null
      },
      {
        phaseId: "technical-design",
        title: "Technical Design",
        order: 1,
        requiresApproval: true,
        isApproved: false,
        isCurrent: true,
        state: "current",
        artifactPath: null,
        executePromptPath: null,
        approvePromptPath: null
      }
    ],
    controls: {
      canContinue: false,
      canApprove: false,
      requiresApproval: false,
      blockingReason: "provider_error",
      canRestartFromSource: false,
      regressionTargets: []
    },
    clarification: null,
    events: [],
    attachmentsDirectoryPath: "/tmp/attachments",
    attachments: []
  }, {
    selectedPhaseId: "technical-design",
    selectedArtifactContent: null,
    contextSuggestions: [],
    settingsConfigured: true,
    settingsMessage: null
  }, "idle");

  assert.match(html, /\.token\.token--active/);
  assert.match(html, /\.token\.token--paused/);
  assert.match(html, /\.token\.token--blocked/);
  assert.match(html, /token token--blocked">blocked</);
  assert.match(html, /phase-node technical-design phase-tone-blocked selected/);
  assert.match(html, /phase-tag phase-tag--blocked">blocked</);
  assert.match(html, /phase-node capture phase-tone-completed/);
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
    clarification: null,
    events: [],
    attachmentsDirectoryPath: "/tmp/attachments",
    attachments: []
  }, {
    selectedPhaseId: "capture",
    selectedArtifactContent: null,
    contextSuggestions: [],
    settingsConfigured: false,
    settingsMessage: "SpecForge.AI needs an SLM/LLM execution provider before workflow stages can run. Select an OpenAI-compatible provider and configure base URL, API key, and model."
  }, "idle");

  assert.match(html, /SLM\/LLM execution provider/);
  assert.match(html, /data-command="play"[^>]*disabled/);
  assert.doesNotMatch(html, /data-command="continue"/);
});

test("buildWorkflowHtml renders clarification questions and embedded answer inputs", () => {
  const html = buildWorkflowHtml({
    usId: "US-0004",
    title: "Clarification flow",
    category: "workflow",
    status: "waiting-user",
    currentPhase: "clarification",
    directoryPath: "/tmp/us.US-0004",
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
        isCurrent: false,
        state: "completed",
        artifactPath: null,
        executePromptPath: null,
        approvePromptPath: null
      },
      {
        phaseId: "clarification",
        title: "Clarification",
        order: 1,
        requiresApproval: false,
        isApproved: false,
        isCurrent: true,
        state: "current",
        artifactPath: "/tmp/00-clarification.md",
        executePromptPath: "/tmp/clarification.execute.md",
        approvePromptPath: null
      }
    ],
    controls: {
      canContinue: false,
      canApprove: false,
      requiresApproval: false,
      blockingReason: "clarification_pending_answers",
      canRestartFromSource: false,
      regressionTargets: []
    },
    clarification: {
      status: "needs_clarification",
      tolerance: "balanced",
      reason: "The capture is still too vague to infer a valid refinement.",
      items: [
        { index: 1, question: "Who triggers the workflow?", answer: "A backoffice operator." },
        { index: 2, question: "What input and output should be expected?", answer: null }
      ]
    },
    events: [],
    attachmentsDirectoryPath: "/tmp/attachments",
    attachments: []
  }, {
    selectedPhaseId: "clarification",
    selectedArtifactContent: "## Decision\nneeds_clarification",
    contextSuggestions: [],
    settingsConfigured: true,
    settingsMessage: null
  }, "idle");

  assert.match(html, /<h3>Clarification<\/h3>/);
  assert.match(html, /needs_clarification/);
  assert.match(html, /The capture is still too vague/);
  assert.match(html, /data-clarification-answer/);
  assert.match(html, /A backoffice operator\./);
  assert.match(html, /Submit Answers/);
  assert.match(html, /submitClarificationAnswers/);
});

test("buildWorkflowHtml proposes manual and suggested context files during clarification", () => {
  const html = buildWorkflowHtml({
    usId: "US-0013",
    title: "Clarification context",
    category: "tests",
    status: "waiting-user",
    currentPhase: "clarification",
    directoryPath: "/tmp/us.US-0013",
    workBranch: null,
    mainArtifactPath: "/tmp/us.md",
    timelinePath: "/tmp/timeline.md",
    rawTimeline: "raw timeline",
    phases: [
      {
        phaseId: "clarification",
        title: "Clarification",
        order: 1,
        requiresApproval: false,
        isApproved: false,
        isCurrent: true,
        state: "current",
        artifactPath: "/tmp/00-clarification.md",
        executePromptPath: "/tmp/clarification.execute.md",
        approvePromptPath: null
      }
    ],
    controls: {
      canContinue: false,
      canApprove: false,
      requiresApproval: false,
      blockingReason: "clarification_pending_answers",
      canRestartFromSource: false,
      regressionTargets: []
    },
    clarification: {
      status: "needs_clarification",
      tolerance: "balanced",
      reason: "The request mentions tests but not the target module.",
      items: []
    },
    events: [],
    contextFilesDirectoryPath: "/tmp/context",
    contextFiles: [],
    attachmentsDirectoryPath: "/tmp/attachments",
    attachments: []
  }, {
    selectedPhaseId: "clarification",
    selectedArtifactContent: "## Decision\nneeds_clarification",
    contextSuggestions: [
      {
        path: "/repo/tests/SpecForge.Domain.Tests/WorkflowRunnerTests.cs",
        relativePath: "tests/SpecForge.Domain.Tests/WorkflowRunnerTests.cs",
        reason: "Matches clarification keywords: tests, workflow.",
        source: "heuristic",
        score: 42
      }
    ],
    settingsConfigured: true,
    settingsMessage: null
  }, "idle");

  assert.match(html, /Need more repo context\?/);
  assert.match(html, /Add Context Files/);
  assert.match(html, /tests\/SpecForge\.Domain\.Tests\/WorkflowRunnerTests\.cs/);
  assert.match(html, /Add to Context/);
  assert.match(html, /Matches clarification keywords: tests, workflow\./);
});

test("buildWorkflowHtml keeps clarification visible after the model skips additional clarification questions", () => {
  const html = buildWorkflowHtml({
    usId: "US-0005",
    title: "Direct refinement flow",
    category: "workflow",
    status: "waiting-user",
    currentPhase: "refinement",
    directoryPath: "/tmp/us.US-0005",
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
        isCurrent: false,
        state: "completed",
        artifactPath: null,
        executePromptPath: null,
        approvePromptPath: null
      },
      {
        phaseId: "clarification",
        title: "Clarification",
        order: 1,
        requiresApproval: false,
        isApproved: false,
        isCurrent: false,
        state: "completed",
        artifactPath: null,
        executePromptPath: "/tmp/clarification.execute.md",
        approvePromptPath: null
      },
      {
        phaseId: "refinement",
        title: "Refinement",
        order: 2,
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
    clarification: {
      status: "ready_for_refinement",
      tolerance: "balanced",
      reason: "The user story is concrete enough to proceed to refinement.",
      items: []
    },
    events: [
      {
        timestampUtc: "2026-04-18T09:59:00Z",
        code: "clarification_passed",
        actor: "system",
        phase: "clarification",
        summary: "Clarification pre-flight passed. Advancing to refinement.",
        artifacts: ["/tmp/00-clarification.md"],
        usage: null,
        durationMs: null
      },
      {
        timestampUtc: "2026-04-18T10:00:00Z",
        code: "phase_completed",
        actor: "system",
        phase: "refinement",
        summary: "Generated refinement artifact.",
        artifacts: ["/tmp/01-refinement.md"],
        usage: null,
        durationMs: null
      }
    ],
    attachmentsDirectoryPath: "/tmp/attachments",
    attachments: []
  }, {
    selectedPhaseId: "refinement",
    selectedArtifactContent: "## Refinement\nBody",
    contextSuggestions: [],
    settingsConfigured: true,
    settingsMessage: null
  }, "idle");

  assert.match(html, /phase-node clarification phase-tone-completed/);
  assert.match(html, /phase-node refinement phase-tone-waiting-user selected/);
  assert.match(html, /<h3>Clarification<\/h3>/);
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
        phaseId: "clarification",
        title: "Clarification",
        order: 1,
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
        phaseId: "technical-design",
        title: "Technical Design",
        order: 3,
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
        order: 4,
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
        order: 5,
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
        order: 6,
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
        order: 7,
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
    clarification: null,
    events: [],
    attachmentsDirectoryPath: "/tmp/attachments",
    attachments: []
  }, {
    selectedPhaseId: "implementation",
    selectedArtifactContent: null,
    contextSuggestions: [],
    settingsConfigured: true,
    settingsMessage: null
  }, "idle");

  assert.match(html, /\.phase-node\.clarification \{ left: \d+px; top: \d+px; \}/);
  assert.match(html, /\.phase-node\.technical-design \{ left: \d+px; top: \d+px; \}/);
  assert.match(html, /\.phase-node\.implementation \{ left: \d+px; top: \d+px; \}/);
  assert.match(html, /\.phase-node\.review \{ left: \d+px; top: \d+px; \}/);
  assert.match(html, /viewBox="0 0 \d+ \d+"/);
});
