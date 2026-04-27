import test from "node:test";
import assert from "node:assert/strict";
import { buildWorkflowAuditHtml, buildWorkflowHtml } from "../src-vscode/workflowView";

test("buildWorkflowHtml renders phase detail for the selected phase", () => {
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
        expectsHumanIntervention: false,
        isApproved: false,
        isCurrent: false,
        state: "completed",
        artifactPath: null,
        executePromptPath: null,
        approvePromptPath: null,
        executeSystemPromptPath: null,
        approveSystemPromptPath: null
      },
      {
        phaseId: "refinement",
        title: "Refinement",
        order: 1,
        requiresApproval: true,
        expectsHumanIntervention: true,
        isApproved: false,
        isCurrent: true,
        state: "current",
        artifactPath: "/tmp/01-refinement.md",
        operationLogPath: "/tmp/01-refinement.ops.md",
        executePromptPath: "/tmp/refinement.execute.md",
        approvePromptPath: "/tmp/refinement.approve.md",
        executeSystemPromptPath: "/tmp/refinement.execute.system.md",
        approveSystemPromptPath: "/tmp/refinement.approve.system.md"
      }
    ],
    controls: {
      canContinue: false,
      canApprove: true,
      requiresApproval: true,
      blockingReason: "refinement_pending_user_approval",
      canRestartFromSource: true,
      regressionTargets: [],
      rewindTargets: []
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
        durationMs: 4876,
        execution: {
          providerKind: "openai-compatible",
          model: "gpt-4.1-mini",
          profileName: "light",
          baseUrl: "https://api.example.test/v1"
        }
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
    selectedOperationContent: "# Artifact Operation Log · refinement\n\n## 2026-04-18T10:05:00Z · `alice`\n\n- Source Artifact: `/tmp/01-refinement.md`\n- Result Artifact: `/tmp/01-refinement.v02.md`\n- Prompt:\n```text\nPlease constrain export columns.\n```",
    contextSuggestions: [],
    settingsConfigured: true,
    settingsMessage: null
  }, "idle");

  assert.match(html, /US-0001 · Workflow view/);
  assert.match(html, /Workflow Constellation/);
  assert.match(html, /phase-graph/);
  assert.match(html, /phase-node refinement phase-tone-waiting-user selected phase-node--current/);
  assert.doesNotMatch(html, /data-command="togglePhasePause"[^>]*data-phase-id="refinement"/);
  assert.doesNotMatch(html, /class="phase-pause-toggle"/);
  assert.doesNotMatch(html, /Execution cannot continue yet/);
  assert.doesNotMatch(html, /Workflow Blocked/);
  assert.match(html, /--phase-pending: rgba\(255, 255, 255, 0\.04\);/);
  assert.match(html, /phase-current-rail/);
  assert.match(html, /phase-current-rail__label">Current</);
  assert.match(html, /phase-viewing-rail phase-viewing-rail--current">/);
  assert.match(html, /phase-viewing-rail__label">Viewing</);
  assert.match(html, /token token--attention">waiting-user</);
  assert.match(html, /<div class="phase-slug">Shape approved scope<\/div>/);
  assert.match(html, /<span class="token">Shape approved scope<\/span>/);
  assert.match(html, /currentFlow/);
  assert.match(html, /currentPulse/);
  assert.match(html, /<h2>Refinement<\/h2>/);
  assert.match(html, /Open Artifact/);
  assert.match(html, /Open Execute Prompt/);
  assert.match(html, /Open Execute System Prompt/);
  assert.match(html, /Open Approve Prompt/);
  assert.match(html, /Open Approve System Prompt/);
  assert.match(html, /detail-card-shell[^]*detail-actions--phase-header[^]*data-command="approve"[^>]*>Approve</);
  assert.match(html, /data-open-reject-modal/);
  assert.match(html, /data-reject-target-phase="refinement"/);
  assert.match(html, /data-reject-mode="operate-current"/);
  assert.match(html, /<h3>Approval Branch<\/h3>/);
  assert.match(html, /data-approval-base-branch-input/);
  assert.match(html, /value="main"/);
  assert.doesNotMatch(html, /data-command="restart">Reject</);
  assert.match(html, /workflow-action-button--document[^]*Open Artifact/);
  assert.match(html, /workflow-action-button--document[^]*Open Execute Prompt/);
  assert.match(html, /workflow-action-button--document[^]*Open Execute System Prompt/);
  assert.match(html, /workflow-action-button--document[^]*Open Approve Prompt/);
  assert.match(html, /workflow-action-button--document[^]*Open Approve System Prompt/);
  assert.match(html, /id="submit-phase-input" class="workflow-action-button workflow-action-button--progress"/);
  assert.match(html, /Open Operation Log/);
  assert.doesNotMatch(html, /action-btn--approve/);
  assert.doesNotMatch(html, /action-btn--reject/);
  assert.match(html, /data-open-workflow-files/);
  assert.doesNotMatch(html, /aria-label="Rewind workflow to selected phase"/);
  assert.doesNotMatch(html, />Reset</);
  assert.doesNotMatch(html, /debugResetToCapture/);
  assert.match(html, /Workflow-level files are grouped here instead of repeating them in every phase detail\./);
  assert.match(html, /<h4>User Story<\/h4>/);
  assert.match(html, /us\.md/);
  assert.match(html, /Add Files/);
  assert.match(html, /class="workflow-action-button workflow-action-button--document" data-command="attachFiles" data-kind="context" data-attach-files-button>Add Files</);
  assert.match(html, /Context Files/);
  assert.match(html, /User Story Info/);
  assert.match(html, /data-file-drop-zone/);
  assert.match(html, /data-drop-kind="context"/);
  assert.match(html, /data-drop-kind="attachment"/);
  assert.match(html, /draggable="true"/);
  assert.match(html, /service\.cs/);
  assert.match(html, /api-notes\.md/);
  assert.match(html, /phase-duration-pill/);
  assert.match(html, /Phase duration/);
  assert.match(html, /4\.88 s/);
  assert.match(html, /token-summary/);
  assert.match(html, /<div class="token-summary__header">Tokens<\/div>/);
  assert.doesNotMatch(html, /<h3>Workflow Dashboard<\/h3>/);
  assert.doesNotMatch(html, /<h3>Usage by Model<\/h3>/);
  assert.doesNotMatch(html, /<h3>Usage by Phase<\/h3>/);
  assert.match(html, /<h3>Operate Current Spec<\/h3>/);
  assert.match(html, /Apply via Model/);
  assert.match(html, /Current operation log/);
  assert.match(html, /alice/);
  assert.match(html, /model light \/ gpt-4\.1-mini/);
  assert.match(html, /Input \/ Output/);
  assert.match(html, />321 \/ 144</);
  assert.match(html, /Total/);
  assert.match(html, />465</);
  assert.match(html, /Model/);
  assert.match(html, /light \/ gpt-4\.1-mini/);
  assert.match(html, /Response Speed/);
  assert.match(html, /29\.5 tok\/s/);
  assert.doesNotMatch(html, /<h3>Workflow Files<\/h3>/);
  assert.match(html, /attachment-item--dragging/);
  assert.match(html, /command: "setFileKind"/);
  assert.match(html, /vscode\.getState\(\)/);
  assert.match(html, /workflowFilesOpen/);
  assert.match(html, /vscode\.setState\(/);
  assert.match(html, /approvalBaseBranchDraft/);
  assert.match(html, /approvalBaseBranchAccepted/);
  assert.match(html, /approvalWorkBranchDraft/);
  assert.match(html, /workflow-reject-textarea/);
  assert.match(html, /data-submit-reject/);
  assert.match(html, /specforge-ai:auto-scroll-phase:/);
  assert.match(html, /centerFocusedPhaseInGraph/);
  assert.match(html, /const selectedPhaseNode = document\.querySelector\("\.phase-node\.selected"\);/);
  assert.match(html, /focusedPhaseNode\.offsetTop/);
  assert.match(html, /graphPanel\.scrollTop = Math\.max\(0, targetTop\)/);
  assert.doesNotMatch(html, /Audit Stream/);
});

test("buildWorkflowAuditHtml renders workflow audit content in a standalone panel view", () => {
  const html = buildWorkflowAuditHtml({
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
    phases: [],
    controls: {
      canContinue: false,
      canApprove: true,
      requiresApproval: true,
      blockingReason: "refinement_pending_user_approval",
      canRestartFromSource: true,
      regressionTargets: [],
      rewindTargets: []
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
        durationMs: 4876,
        execution: {
          providerKind: "openai-compatible",
          model: "gpt-4.1-mini",
          profileName: "light",
          baseUrl: "https://api.example.test/v1"
        }
      }
    ],
    attachmentsDirectoryPath: "/tmp/attachments",
    attachments: []
  }, {
    selectedPhaseId: "refinement",
    selectedArtifactContent: null,
    contextSuggestions: [],
    settingsConfigured: true,
    settingsMessage: null,
    modelProfiles: [
      {
        name: "light",
        model: "gpt-4.1-mini"
      }
    ]
  });

  assert.match(html, /<div class="audit-stream">/);
  assert.match(html, /Generated refinement artifact\./);
  assert.match(html, /phase_completed[^]*badge\">system</);
  assert.match(html, /phase_completed[^]*badge\">refinement</);
  assert.match(html, /model light \/ gpt-4\.1-mini/);
  assert.doesNotMatch(html, /Audit Stream<\/h2>/);
});

test("buildWorkflowHtml relies on delegated command handlers without per-node duplicate listeners", () => {
  const html = buildWorkflowHtml({
    usId: "US-0001",
    title: "Workflow view",
    category: "workflow",
    status: "active",
    currentPhase: "review",
    directoryPath: "/tmp/us.US-0001",
    workBranch: null,
    mainArtifactPath: "/tmp/us.md",
    timelinePath: "/tmp/timeline.md",
    rawTimeline: "raw timeline",
    phases: [
      {
        phaseId: "review",
        title: "Review",
        order: 5,
        requiresApproval: true,
        expectsHumanIntervention: true,
        isApproved: false,
        isCurrent: true,
        state: "current",
        artifactPath: "/tmp/04-review.md",
        executePromptPath: null,
        approvePromptPath: null,
        executeSystemPromptPath: null,
        approveSystemPromptPath: null
      }
    ],
    controls: {
      canContinue: false,
      canApprove: true,
      requiresApproval: true,
      blockingReason: "review_failed",
      canRestartFromSource: true,
      regressionTargets: ["implementation"],
      rewindTargets: []
    },
    clarification: null,
    events: [],
    attachmentsDirectoryPath: "/tmp/attachments",
    attachments: []
  }, {
    selectedPhaseId: "review",
    selectedArtifactContent: "review",
    contextSuggestions: [],
    settingsConfigured: true,
    settingsMessage: null
  }, "idle");

  assert.match(html, /document\.addEventListener\("click"/);
  assert.match(html, /document\.addEventListener\("keydown"/);
  assert.doesNotMatch(html, /querySelectorAll\("\[data-command\]"\)/);
});

test("buildWorkflowHtml paused overlay persistence key includes startedAt to avoid stale dismiss state", () => {
  const html = buildWorkflowHtml({
    usId: "US-0001",
    title: "Workflow view",
    category: "workflow",
    status: "active",
    currentPhase: "implementation",
    directoryPath: "/tmp/us.US-0001",
    workBranch: null,
    mainArtifactPath: "/tmp/us.md",
    timelinePath: "/tmp/timeline.md",
    rawTimeline: "raw timeline",
    phases: [
      {
        phaseId: "implementation",
        title: "Implementation",
        order: 4,
        requiresApproval: false,
        expectsHumanIntervention: false,
        isApproved: false,
        isCurrent: true,
        state: "current",
        artifactPath: "/tmp/03-implementation.md",
        executePromptPath: null,
        approvePromptPath: null,
        executeSystemPromptPath: null,
        approveSystemPromptPath: null
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
    clarification: null,
    events: [],
    attachmentsDirectoryPath: "/tmp/attachments",
    attachments: []
  }, {
    selectedPhaseId: "review",
    selectedArtifactContent: null,
    contextSuggestions: [],
    settingsConfigured: true,
    settingsMessage: null,
    executionPhaseId: "implementation",
    playbackStartedAtMs: 123456
  }, "paused");

  assert.match(html, /buildExecutionOverlayStateKey\([^)]*executionOverlay\.dataset\.startedAtMs/);
  assert.match(html, /specforge-ai:execution-overlay:.*startedAtMs/);
});

test("buildWorkflowHtml renders iteration lineage with input and output artifacts", () => {
  const html = buildWorkflowHtml({
    usId: "US-0200",
    title: "Iteration lineage",
    category: "workflow",
    status: "active",
    currentPhase: "implementation",
    directoryPath: "/tmp/us.US-0200",
    workBranch: "feature/us-0200-lineage",
    mainArtifactPath: "/tmp/us.md",
    timelinePath: "/tmp/timeline.md",
    rawTimeline: "raw timeline",
    phases: [
      {
        phaseId: "implementation",
        title: "Implementation",
        order: 4,
        requiresApproval: false,
        expectsHumanIntervention: false,
        isApproved: false,
        isCurrent: true,
        state: "current",
        artifactPath: "/tmp/03-implementation.v02.md",
        operationLogPath: "/tmp/03-implementation.ops.md",
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
    clarification: null,
    events: [],
    phaseIterations: [
      {
        iterationKey: "implementation:1:2026-04-25T10:00:00Z:phase_completed",
        attempt: 1,
        phaseId: "implementation",
        timestampUtc: "2026-04-25T10:00:00Z",
        code: "phase_completed",
        actor: "system",
        summary: "Generated implementation artifact.",
        outputArtifactPath: "/tmp/03-implementation.md",
        inputArtifactPath: "/tmp/02-technical-design.md",
        contextArtifactPaths: [],
        operationLogPath: null,
        operationPrompt: null,
        usage: null,
        durationMs: 1000,
        execution: null
      },
      {
        iterationKey: "implementation:2:2026-04-25T11:00:00Z:artifact_operated",
        attempt: 2,
        phaseId: "implementation",
        timestampUtc: "2026-04-25T11:00:00Z",
        code: "artifact_operated",
        actor: "alice",
        summary: "Applied failed review corrections.",
        outputArtifactPath: "/tmp/03-implementation.v02.md",
        inputArtifactPath: "/tmp/03-implementation.md",
        contextArtifactPaths: ["/tmp/04-review.md"],
        operationLogPath: "/tmp/03-implementation.ops.md",
        operationPrompt: "Apply the failed review corrections.",
        usage: {
          inputTokens: 10,
          outputTokens: 20,
          totalTokens: 30
        },
        durationMs: 1200,
        execution: {
          providerKind: "openai-compatible",
          model: "gpt-4.1-mini",
          profileName: "light",
          baseUrl: "https://api.example.test/v1"
        }
      }
    ],
    attachmentsDirectoryPath: "/tmp/attachments",
    attachments: []
  }, {
    selectedPhaseId: "implementation",
    selectedIterationKey: "implementation:2:2026-04-25T11:00:00Z:artifact_operated",
    expandedIterationPhaseIds: [],
    selectedArtifactContent: "# impl v2",
    selectedIterationContextArtifacts: [
      {
        path: "/tmp/04-review.md",
        content: "# Review\n\n- Result: `fail`\n- Fix the empty state."
      }
    ],
    contextSuggestions: [],
    settingsConfigured: true,
    settingsMessage: null,
    modelProfiles: [
      {
        name: "light",
        model: "gpt-4.1-mini"
      }
    ]
  }, "idle");

  assert.match(html, /class="iteration-rail-toggle"/);
  assert.match(html, /aria-label="Expand phase iterations"/);
  assert.match(html, /iteration-rail-toggle__icon/);
  assert.match(html, /iteration-rail--collapsed/);
  assert.match(html, /Iteration 2 ·/);
  assert.doesNotMatch(html, /Iteration 1 · 2026-04-25T10:00:00Z/);
  assert.match(html, /Input Artifact/);
  assert.match(html, /Output Artifact/);
  assert.match(html, /Open Input/);
  assert.match(html, /Open Output/);
  assert.match(html, /Open Operation Log/);
  assert.match(html, /Context Artifacts/);
  assert.match(html, /04-review\.md/);
  assert.match(html, /Fix the empty state\./);
  assert.match(html, /Apply the failed review corrections\./);
});

test("buildWorkflowHtml expands phase iteration tree when the phase is opened", () => {
  const html = buildWorkflowHtml({
    usId: "US-0003",
    title: "Expanded iterations",
    kind: "feature",
    category: "prompts",
    status: "active",
    currentPhase: "review",
    directoryPath: "/tmp/us-0003",
    workBranch: null,
    mainArtifactPath: "/tmp/US-0003.md",
    timelinePath: "/tmp/timeline.md",
    rawTimeline: "",
    phases: [
      {
        phaseId: "review",
        title: "Review",
        order: 5,
        requiresApproval: true,
        expectsHumanIntervention: true,
        isApproved: false,
        isCurrent: true,
        state: "current",
        artifactPath: "/tmp/04-review.v02.md",
        operationLogPath: "/tmp/04-review.ops.md",
        executePromptPath: null,
        approvePromptPath: null
      }
    ],
    controls: {
      canContinue: false,
      canApprove: false,
      requiresApproval: true,
      blockingReason: null,
      canRestartFromSource: false,
      regressionTargets: ["implementation"],
      rewindTargets: []
    },
    clarification: null,
    approvalQuestions: [],
    events: [],
    phaseIterations: [
      {
        iterationKey: "review:1:2026-04-25T10:00:00Z:phase_completed",
        attempt: 1,
        phaseId: "review",
        timestampUtc: "2026-04-25T10:00:00Z",
        code: "phase_completed",
        actor: "system",
        summary: "Initial review.",
        outputArtifactPath: "/tmp/04-review.md",
        inputArtifactPath: "/tmp/03-implementation.md",
        contextArtifactPaths: [],
        operationLogPath: null,
        operationPrompt: null,
        usage: null,
        durationMs: 1000,
        execution: null
      },
      {
        iterationKey: "review:2:2026-04-25T11:00:00Z:phase_completed",
        attempt: 2,
        phaseId: "review",
        timestampUtc: "2026-04-25T11:00:00Z",
        code: "phase_completed",
        actor: "system",
        summary: "Corrected review.",
        outputArtifactPath: "/tmp/04-review.v02.md",
        inputArtifactPath: "/tmp/03-implementation.v02.md",
        contextArtifactPaths: [],
        operationLogPath: null,
        operationPrompt: null,
        usage: null,
        durationMs: 1100,
        execution: null
      }
    ],
    contextFilesDirectoryPath: "/tmp/context",
    contextFiles: [],
    attachmentsDirectoryPath: "/tmp/attachments",
    attachments: []
  }, {
    selectedPhaseId: "review",
    selectedIterationKey: "review:1:2026-04-25T10:00:00Z:phase_completed",
    expandedIterationPhaseIds: ["review"],
    selectedArtifactContent: "# review",
    contextSuggestions: [],
    settingsConfigured: true,
    settingsMessage: null
  }, "idle");

  assert.match(html, /aria-label="Collapse phase iterations"/);
  assert.match(html, /iteration-rail-toggle__icon--expanded/);
  assert.match(html, /iteration-rail--expanded/);
  assert.match(html, /Iteration 2 · 2026-04-25T11:00:00Z/);
  assert.match(html, /Iteration 1 · 2026-04-25T10:00:00Z/);
});

test("buildWorkflowHtml shows touches even when a phase has no token usage", () => {
  const html = buildWorkflowHtml({
    usId: "US-0001",
    title: "Touch visibility",
    kind: "feature",
    category: "prompts",
    status: "active",
    currentPhase: "technical-design",
    directoryPath: "/tmp/us-0001",
    workBranch: null,
    mainArtifactPath: "/tmp/US-0001.md",
    timelinePath: "/tmp/timeline.md",
    rawTimeline: "",
    phases: [
      {
        phaseId: "capture",
        title: "Capture",
        order: 0,
        requiresApproval: false,
        expectsHumanIntervention: false,
        isApproved: true,
        isCurrent: false,
        state: "completed",
        artifactPath: "/tmp/US-0001.md",
        operationLogPath: null,
        executePromptPath: null,
        approvePromptPath: null
      },
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
      canRestartFromSource: false,
      regressionTargets: [],
      rewindTargets: []
    },
    clarification: null,
    approvalQuestions: [],
    events: [
      {
        timestampUtc: "2026-04-25T10:00:00Z",
        code: "workflow_rewound",
        actor: "alice",
        phase: "technical-design",
        summary: "Rewound here.",
        artifacts: [],
        usage: null,
        durationMs: null,
        execution: null
      },
      {
        timestampUtc: "2026-04-25T10:10:00Z",
        code: "phase_completed",
        actor: "system",
        phase: "technical-design",
        summary: "Generated technical design.",
        artifacts: ["/tmp/02-technical-design.md"],
        usage: null,
        durationMs: 900,
        execution: null
      }
    ],
    phaseIterations: [
      {
        iterationKey: "technical-design:1:2026-04-25T10:10:00Z:phase_completed",
        attempt: 1,
        phaseId: "technical-design",
        timestampUtc: "2026-04-25T10:10:00Z",
        code: "phase_completed",
        actor: "system",
        summary: "Generated technical design.",
        outputArtifactPath: "/tmp/02-technical-design.md",
        inputArtifactPath: "/tmp/01-refinement.md",
        contextArtifactPaths: [],
        operationLogPath: null,
        operationPrompt: null,
        usage: null,
        durationMs: 900,
        execution: null
      }
    ],
    contextFilesDirectoryPath: "/tmp/context",
    contextFiles: [],
    attachmentsDirectoryPath: "/tmp/attachments",
    attachments: []
  }, {
    selectedPhaseId: "technical-design",
    selectedArtifactContent: "# td",
    contextSuggestions: [],
    settingsConfigured: true,
    settingsMessage: null
  }, "idle");

  assert.match(html, /Touches/);
  assert.match(html, /Total/);
  assert.match(html, />2</);
  assert.match(html, /Rewinds Here/);
  assert.match(html, /Tokens/);
  assert.match(html, /Input \/ Output/);
  assert.match(html, />n\/a</);
  assert.match(html, /Iterations/);
  assert.match(html, />1</);
});

test("buildWorkflowHtml always shows duration touches and tokens for visual consistency", () => {
  const html = buildWorkflowHtml({
    usId: "US-0002",
    title: "Consistent phase metrics",
    kind: "feature",
    category: "prompts",
    status: "active",
    currentPhase: "refinement",
    directoryPath: "/tmp/us-0002",
    workBranch: null,
    mainArtifactPath: "/tmp/US-0002.md",
    timelinePath: "/tmp/timeline.md",
    rawTimeline: "",
    phases: [
      {
        phaseId: "capture",
        title: "Capture",
        order: 0,
        requiresApproval: false,
        expectsHumanIntervention: false,
        isApproved: true,
        isCurrent: false,
        state: "completed",
        artifactPath: "/tmp/US-0002.md",
        operationLogPath: null,
        executePromptPath: null,
        approvePromptPath: null
      },
      {
        phaseId: "refinement",
        title: "Refinement",
        order: 2,
        requiresApproval: true,
        expectsHumanIntervention: true,
        isApproved: false,
        isCurrent: true,
        state: "current",
        artifactPath: "/tmp/01-refinement.md",
        operationLogPath: null,
        executePromptPath: null,
        approvePromptPath: null
      }
    ],
    controls: {
      canContinue: false,
      canApprove: false,
      requiresApproval: true,
      blockingReason: null,
      canRestartFromSource: false,
      regressionTargets: [],
      rewindTargets: []
    },
    clarification: null,
    approvalQuestions: [],
    events: [],
    phaseIterations: [],
    contextFilesDirectoryPath: "/tmp/context",
    contextFiles: [],
    attachmentsDirectoryPath: "/tmp/attachments",
    attachments: []
  }, {
    selectedPhaseId: "refinement",
    selectedArtifactContent: "# refinement",
    contextSuggestions: [],
    settingsConfigured: true,
    settingsMessage: null
  }, "idle");

  assert.match(html, /Duration/);
  assert.match(html, /Touches/);
  assert.match(html, /Tokens/);
  assert.match(html, />n\/a</);
  assert.match(html, /<span class="token-summary__value">0<\/span>/);
  assert.match(html, /Operated/);
  assert.match(html, /Started/);
  assert.match(html, /Rewinds Here/);
  assert.match(html, /Regressions Here/);
});

test("buildWorkflowHtml shows rewind on prior phase cards and pause only on later phases", () => {
  const html = buildWorkflowHtml({
    usId: "US-0100",
    title: "Phase card controls",
    category: "workflow",
    status: "active",
    currentPhase: "technical-design",
    directoryPath: "/tmp/us.US-0100",
    workBranch: "feature/us-0100-phase-controls",
    mainArtifactPath: "/tmp/us.md",
    timelinePath: "/tmp/timeline.md",
    rawTimeline: "raw timeline",
    phases: [
      {
        phaseId: "capture",
        title: "Capture",
        order: 0,
        requiresApproval: false,
        expectsHumanIntervention: false,
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
        expectsHumanIntervention: true,
        isApproved: true,
        isCurrent: false,
        state: "completed",
        artifactPath: "/tmp/01-refinement.md",
        executePromptPath: null,
        approvePromptPath: null
      },
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
        executePromptPath: null,
        approvePromptPath: null
      },
      {
        phaseId: "implementation",
        title: "Implementation",
        order: 4,
        requiresApproval: false,
        expectsHumanIntervention: false,
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
      canRestartFromSource: true,
      regressionTargets: [],
      rewindTargets: ["refinement"]
    },
    clarification: null,
    events: [],
    attachmentsDirectoryPath: "/tmp/attachments",
    attachments: [],
    contextFilesDirectoryPath: "/tmp/context",
    contextFiles: []
  }, {
    selectedPhaseId: "technical-design",
    selectedArtifactContent: "## Technical Design",
    contextSuggestions: [],
    settingsConfigured: true,
    settingsMessage: null
  }, "idle");

  assert.match(html, /data-phase-id="capture"[\s\S]*data-phase-rewind-button/);
  assert.match(html, /data-phase-id="capture"[\s\S]*A1\.25 1\.25 0 0 1 7\.25 4/);
  assert.match(html, /data-phase-id="refinement"[\s\S]*data-phase-rewind-button/);
  assert.doesNotMatch(html, /data-phase-id="technical-design"[\s\S]*data-phase-rewind-button/);
  assert.match(html, /data-phase-id="implementation"[\s\S]*data-phase-pause-button/);
  assert.doesNotMatch(html, /aria-label="Rewind workflow to selected phase"/);
  assert.doesNotMatch(html, /debugResetToCapture/);
});

test("buildWorkflowHtml shows ready instead of executing when the current phase is idle", () => {
  const html = buildWorkflowHtml({
    usId: "US-0001",
    title: "Idle ready state",
    category: "workflow",
    status: "active",
    currentPhase: "technical-design",
    directoryPath: "/tmp/us.US-0001",
    workBranch: null,
    mainArtifactPath: "/tmp/us.md",
    timelinePath: "/tmp/timeline.md",
    rawTimeline: "raw timeline",
    phases: [
      {
        phaseId: "technical-design",
        title: "Technical Design",
        order: 0,
        requiresApproval: false,
        expectsHumanIntervention: false,
        isApproved: true,
        isCurrent: true,
        state: "current",
        artifactPath: "/tmp/02-technical-design.md",
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
    selectedPhaseId: "technical-design",
    selectedArtifactContent: "## Technical Design",
    contextSuggestions: [],
    settingsConfigured: true,
    settingsMessage: null
  }, "idle");

  assert.match(html, /token token--success">ready</);
  assert.match(html, /token token--success">ready</);
  assert.doesNotMatch(html, /token token--active">executing</);
});

test("buildWorkflowHtml wires release-approval reject modal to rewind into review", () => {
  const html = buildWorkflowHtml({
    usId: "US-0099",
    title: "Release rejection flow",
    category: "workflow",
    status: "waiting-user",
    currentPhase: "release-approval",
    directoryPath: "/tmp/us.US-0099",
    workBranch: "feature/us-0099-release-reject",
    mainArtifactPath: "/tmp/us.md",
    timelinePath: "/tmp/timeline.md",
    rawTimeline: "raw timeline",
    phases: [
      {
        phaseId: "review",
        title: "Review",
        order: 0,
        requiresApproval: false,
        expectsHumanIntervention: false,
        isApproved: false,
        isCurrent: false,
        state: "completed",
        artifactPath: "/tmp/04-review.md",
        executePromptPath: null,
        approvePromptPath: null,
        executeSystemPromptPath: null,
        approveSystemPromptPath: null
      },
      {
        phaseId: "release-approval",
        title: "Release Approval",
        order: 1,
        requiresApproval: true,
        expectsHumanIntervention: true,
        isApproved: false,
        isCurrent: true,
        state: "current",
        artifactPath: null,
        executePromptPath: null,
        approvePromptPath: "/tmp/release-approval.approve.md",
        executeSystemPromptPath: null,
        approveSystemPromptPath: "/tmp/release-approval.approve.system.md"
      }
    ],
    controls: {
      canContinue: false,
      canApprove: true,
      requiresApproval: true,
      blockingReason: "release-approval_pending_user_approval",
      canRestartFromSource: true,
      regressionTargets: ["implementation", "technical-design", "refinement"],
      rewindTargets: ["review"]
    },
    clarification: null,
    events: [],
    attachmentsDirectoryPath: "/tmp/attachments",
    attachments: []
  }, {
    selectedPhaseId: "release-approval",
    selectedArtifactContent: null,
    contextSuggestions: [],
    settingsConfigured: true,
    settingsMessage: null
  }, "idle");

  assert.match(html, /data-open-reject-modal/);
  assert.match(html, /data-reject-target-phase="review"/);
  assert.match(html, /data-reject-mode="rewind-and-operate"/);
  assert.match(html, /Reject Release Approval/);
  assert.match(html, /Reject, Rewind, and Apply/);
});

test("buildWorkflowHtml allows inspecting a selected phase while playback is paused", () => {
  const html = buildWorkflowHtml({
    usId: "US-0001",
    title: "Paused release approval",
    category: "workflow",
    status: "waiting-user",
    currentPhase: "release-approval",
    directoryPath: "/tmp/us.US-0001",
    workBranch: "feature/us-0001-paused-release",
    mainArtifactPath: "/tmp/us.md",
    timelinePath: "/tmp/timeline.md",
    rawTimeline: "raw timeline",
    phases: [
      {
        phaseId: "review",
        title: "Review",
        order: 5,
        requiresApproval: false,
        expectsHumanIntervention: false,
        isApproved: false,
        isCurrent: false,
        state: "completed",
        artifactPath: "/tmp/04-review.md",
        executePromptPath: "/tmp/review.execute.md",
        approvePromptPath: null,
        executeSystemPromptPath: "/tmp/review.execute.system.md",
        approveSystemPromptPath: null
      },
      {
        phaseId: "release-approval",
        title: "Release Approval",
        order: 6,
        requiresApproval: true,
        expectsHumanIntervention: true,
        isApproved: false,
        isCurrent: true,
        state: "current",
        artifactPath: null,
        executePromptPath: null,
        approvePromptPath: "/tmp/release-approval.approve.md",
        executeSystemPromptPath: null,
        approveSystemPromptPath: "/tmp/release-approval.approve.system.md"
      }
    ],
    controls: {
      canContinue: false,
      canApprove: true,
      requiresApproval: true,
      blockingReason: "release-approval_pending_user_approval",
      canRestartFromSource: true,
      regressionTargets: ["implementation"],
      rewindTargets: ["review"]
    },
    clarification: null,
    events: [],
    attachmentsDirectoryPath: "/tmp/attachments",
    attachments: [],
    contextFilesDirectoryPath: "/tmp/context",
    contextFiles: []
  }, {
    selectedPhaseId: "review",
    selectedArtifactContent: "## Review\nReview content",
    contextSuggestions: [],
    settingsConfigured: true,
    settingsMessage: null,
    executionPhaseId: "release-approval"
  }, "paused");

  assert.match(html, /runner:paused/);
  assert.match(html, /phase-node release-approval phase-tone-paused phase-node--current/);
  assert.match(html, /phase-node review phase-tone-completed selected/);
  assert.match(html, /<h2>Review<\/h2>/);
  assert.match(html, /Review content/);
  assert.doesNotMatch(html, /Reject Release Approval/);
});

test("buildWorkflowHtml requires explicit base-branch acceptance before approve when the flag is enabled", () => {
  const html = buildWorkflowHtml({
    usId: "US-0042",
    title: "Approval branch validation",
    category: "workflow",
    status: "waiting-user",
    currentPhase: "refinement",
    directoryPath: "/tmp/us.US-0042",
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
        expectsHumanIntervention: false,
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
        expectsHumanIntervention: true,
        isApproved: false,
        isCurrent: true,
        state: "current",
        artifactPath: "/tmp/01-spec.md",
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
      regressionTargets: [],
      rewindTargets: []
    },
    clarification: null,
    events: [],
    contextFilesDirectoryPath: "/tmp/context",
    contextFiles: [],
    attachmentsDirectoryPath: "/tmp/attachments",
    attachments: []
  }, {
    selectedPhaseId: "refinement",
    selectedArtifactContent: "## Refinement\nBody",
    contextSuggestions: [],
    settingsConfigured: true,
    settingsMessage: null,
    approvalBaseBranchProposal: "develop",
    requireExplicitApprovalBranchAcceptance: true
  }, "idle");

  assert.match(html, /data-command="approve"[^>]*data-approve-button[^>]*disabled[^>]*>Approve</);
  assert.match(html, /data-require-explicit-approval-branch-acceptance="true"/);
  assert.match(html, /value="develop"/);
  assert.match(html, /data-approval-branch-accept>Accept</);
  assert.match(html, /Accepted/);
  assert.match(html, /approval-branch__accepted\[hidden\]/);
  assert.match(html, /for="approval-work-branch">Work Branch</);
  assert.match(html, /data-approval-work-branch-input/);
  assert.match(html, /Approve stays disabled until you accept this branch value explicitly\./);
});

test("buildWorkflowHtml shows readonly work branch in refinement detail once the branch already exists", () => {
  const html = buildWorkflowHtml({
    usId: "US-0101",
    title: "Existing work branch",
    category: "workflow",
    status: "waiting-user",
    currentPhase: "release-approval",
    directoryPath: "/tmp/us.US-0101",
    workBranch: "feature/us-0101-existing-work-branch",
    mainArtifactPath: "/tmp/us.md",
    timelinePath: "/tmp/timeline.md",
    rawTimeline: "raw timeline",
    phases: [
      {
        phaseId: "refinement",
        title: "Refinement",
        order: 1,
        requiresApproval: true,
        expectsHumanIntervention: true,
        isApproved: true,
        isCurrent: false,
        state: "completed",
        artifactPath: "/tmp/01-spec.md",
        executePromptPath: "/tmp/refinement.execute.md",
        approvePromptPath: "/tmp/refinement.approve.md"
      },
      {
        phaseId: "release-approval",
        title: "Release Approval",
        order: 6,
        requiresApproval: true,
        expectsHumanIntervention: true,
        isApproved: false,
        isCurrent: true,
        state: "current",
        artifactPath: "/tmp/06-release-approval.md",
        executePromptPath: "/tmp/release-approval.execute.md",
        approvePromptPath: "/tmp/release-approval.approve.md"
      }
    ],
    controls: {
      canContinue: false,
      canApprove: true,
      requiresApproval: true,
      blockingReason: "release-approval_pending_user_approval",
      canRestartFromSource: true,
      regressionTargets: []
    },
    clarification: null,
    approvalQuestions: [],
    events: [],
    attachmentsDirectoryPath: "/tmp/attachments",
    attachments: [],
    contextFilesDirectoryPath: "/tmp/context",
    contextFiles: []
  }, {
    selectedPhaseId: "refinement",
    selectedArtifactContent: "# Spec",
    contextSuggestions: [],
    settingsConfigured: true,
    settingsMessage: null
  }, "idle");

  assert.match(html, /<h3>Approval Branch<\/h3>/);
  assert.match(html, /value="feature\/us-0101-existing-work-branch"/);
  assert.match(html, /data-approval-work-branch-input[^>]*readonly/);
  assert.match(html, /already been created for this user story and is now shown here as read only\./);
  assert.doesNotMatch(html, /for="approval-base-branch">Base Branch<\/label>/);
});

test("buildWorkflowHtml keeps disabled approve visible for refinement when approval is still pending", () => {
  const html = buildWorkflowHtml({
    usId: "US-0099",
    title: "Pending approval questions",
    category: "workflow",
    status: "waiting-user",
    currentPhase: "refinement",
    directoryPath: "/tmp/us.US-0099",
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
        expectsHumanIntervention: false,
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
        expectsHumanIntervention: true,
        isApproved: false,
        isCurrent: true,
        state: "current",
        artifactPath: "/tmp/01-spec.md",
        executePromptPath: "/tmp/refinement.execute.md",
        approvePromptPath: "/tmp/refinement.approve.md"
      }
    ],
    controls: {
      canContinue: false,
      canApprove: false,
      requiresApproval: true,
      blockingReason: "refinement_pending_user_approval",
      canRestartFromSource: true,
      regressionTargets: [],
      rewindTargets: []
    },
    clarification: null,
    approvalQuestions: [
      {
        index: 1,
        question: "Is the scope precise enough?",
        status: "pending",
        isResolved: false,
        answer: null,
        answeredBy: null,
        answeredAtUtc: null
      }
    ],
    events: [],
    contextFilesDirectoryPath: "/tmp/context",
    contextFiles: [],
    attachmentsDirectoryPath: "/tmp/attachments",
    attachments: []
  }, {
    selectedPhaseId: "refinement",
    selectedArtifactContent: "# Spec · US-0099 · v01",
    selectedOperationContent: null,
    contextSuggestions: [],
    settingsConfigured: true,
    settingsMessage: null
  }, "idle");

  assert.match(html, /data-command="approve"[^>]*disabled[^>]*>Approve</);
  assert.match(html, /<h3>Approval Branch<\/h3>/);
  assert.match(html, /Approve stays disabled until all human approval questions are resolved below\./);
});

test("buildWorkflowHtml prefers backend-normalized approval questions over markdown parsing", () => {
  const html = buildWorkflowHtml({
    usId: "US-0100",
    title: "Backend approval normalization",
    category: "workflow",
    status: "waiting-user",
    currentPhase: "refinement",
    directoryPath: "/tmp/us.US-0100",
    workBranch: null,
    mainArtifactPath: "/tmp/us.md",
    timelinePath: "/tmp/timeline.md",
    rawTimeline: "raw timeline",
    phases: [
      {
        phaseId: "refinement",
        title: "Refinement",
        order: 1,
        requiresApproval: true,
        expectsHumanIntervention: true,
        isApproved: false,
        isCurrent: true,
        state: "current",
        artifactPath: "/tmp/01-spec.md",
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
      regressionTargets: [],
      rewindTargets: []
    },
    clarification: null,
    approvalQuestions: [
      {
        index: 1,
        question: "Does runtime inherit persisted state?",
        status: "resolved",
        isResolved: true,
        answer: "Yes.",
        answeredBy: "Analyst",
        answeredAtUtc: "2024-05-21T10:00:00Z"
      }
    ],
    events: [],
    contextFilesDirectoryPath: "/tmp/context",
    contextFiles: [],
    attachmentsDirectoryPath: "/tmp/attachments",
    attachments: []
  }, {
    selectedPhaseId: "refinement",
    selectedArtifactContent: `
## Human Approval Questions
- [ ] Does runtime inherit persisted state?
  - Answer: Yes.
`,
    selectedOperationContent: null,
    contextSuggestions: [],
    settingsConfigured: true,
    settingsMessage: null
  }, "idle");

  assert.match(html, /approval-question-item__status">Resolved<\/span>/);
  assert.doesNotMatch(html, /approval-question-item__status">Pending<\/span>/);
});

test("buildWorkflowHtml hides reject when current phase has no regression targets and enables continue after approved non-destructive rewind", () => {
  const html = buildWorkflowHtml({
    usId: "US-0099",
    title: "Rewind state",
    category: "workflow",
    status: "active",
    currentPhase: "refinement",
    directoryPath: "/tmp/us.US-0099",
    workBranch: "feature/us-0099-rewind-state",
    mainArtifactPath: "/tmp/us.md",
    timelinePath: "/tmp/timeline.md",
    rawTimeline: "raw timeline",
    phases: [
      {
        phaseId: "capture",
        title: "Capture",
        order: 0,
        requiresApproval: false,
        expectsHumanIntervention: false,
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
        expectsHumanIntervention: true,
        isApproved: true,
        isCurrent: true,
        state: "current",
        artifactPath: "/tmp/01-spec.md",
        executePromptPath: "/tmp/refinement.execute.md",
        approvePromptPath: "/tmp/refinement.approve.md"
      },
      {
        phaseId: "technical-design",
        title: "Technical Design",
        order: 2,
        requiresApproval: false,
        expectsHumanIntervention: false,
        isApproved: false,
        isCurrent: false,
        state: "pending",
        artifactPath: "/tmp/02-technical-design.md",
        executePromptPath: "/tmp/technical-design.execute.md",
        approvePromptPath: null
      }
    ],
    controls: {
      canContinue: true,
      canApprove: false,
      requiresApproval: true,
      blockingReason: null,
      canRestartFromSource: true,
      regressionTargets: [],
      rewindTargets: ["clarification"]
    },
    clarification: null,
    events: [],
    contextFilesDirectoryPath: "/tmp/context",
    contextFiles: [],
    attachmentsDirectoryPath: "/tmp/attachments",
    attachments: []
  }, {
    selectedPhaseId: "refinement",
    selectedArtifactContent: "## Refinement\nBody",
    contextSuggestions: [],
    settingsConfigured: true,
    settingsMessage: null
  }, "idle");

  assert.doesNotMatch(html, /data-command="restart">Reject</);
  assert.doesNotMatch(html, /data-command="regress"[^>]*>Reject</);
  assert.match(html, /data-command="play" aria-label="Play workflow"/);
  assert.doesNotMatch(html, /data-command="play" aria-label="Play workflow"[^>]*disabled/);
});

test("buildWorkflowHtml shows phase actions in the selected detail only for the current phase", () => {
  const html = buildWorkflowHtml({
    usId: "US-0020",
    title: "Approval placement",
    category: "workflow",
    status: "waiting-user",
    currentPhase: "refinement",
    directoryPath: "/tmp/us.US-0020",
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
        expectsHumanIntervention: false,
        isApproved: false,
        isCurrent: false,
        state: "completed",
        artifactPath: null,
        executePromptPath: null,
        approvePromptPath: null
      },
      {
        phaseId: "refinement",
        title: "Spec",
        order: 1,
        requiresApproval: true,
        expectsHumanIntervention: true,
        isApproved: false,
        isCurrent: true,
        state: "current",
        artifactPath: "/tmp/01-spec.md",
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
    events: [],
    contextFilesDirectoryPath: "/tmp/context",
    contextFiles: [],
    attachmentsDirectoryPath: "/tmp/attachments",
    attachments: []
  }, {
    selectedPhaseId: "capture",
    selectedArtifactContent: null,
    contextSuggestions: [],
    settingsConfigured: true,
    settingsMessage: null
  }, "idle");

  assert.doesNotMatch(html, /data-command="approve">Approve</);
  assert.doesNotMatch(html, /data-command="restart">Reject</);
  assert.doesNotMatch(html, /phase-node-actions/);
  assert.match(html, /phase-node capture phase-tone-completed selected/);
  assert.match(html, /phase-viewing-rail">/);
  assert.doesNotMatch(html, /phase-viewing-rail phase-viewing-rail--current">/);
  assert.match(html, /phase-viewing-rail__label">Viewing</);
  assert.match(html, /phase-node refinement phase-tone-waiting-user phase-node--current/);
  assert.match(html, /phase-current-rail__label">Current</);
});

test("buildWorkflowHtml ignores placeholder approval questions and renders copy icons", () => {
  const html = buildWorkflowHtml({
    usId: "US-0099",
    title: "Approval parsing",
    category: "workflow",
    status: "waiting-user",
    currentPhase: "refinement",
    directoryPath: "/tmp/us.US-0099",
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
        expectsHumanIntervention: false,
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
        expectsHumanIntervention: true,
        isApproved: false,
        isCurrent: true,
        state: "current",
        artifactPath: "/tmp/01-spec.md",
        operationLogPath: null,
        executePromptPath: "/tmp/refinement.execute.md",
        approvePromptPath: "/tmp/refinement.approve.md"
      }
    ],
    controls: {
      canContinue: false,
      canApprove: false,
      requiresApproval: true,
      blockingReason: "refinement_pending_user_approval",
      canRestartFromSource: true,
      regressionTargets: []
    },
    clarification: null,
    approvalQuestions: [
      {
        index: 1,
        question: "Confirm outbound contract for omitted fields?",
        status: "resolved",
        isResolved: true,
        answer: "Omit them from the payload.",
        answeredBy: "tester",
        answeredAtUtc: "2026-04-22T13:20:00Z"
      }
    ],
    events: [],
    contextFilesDirectoryPath: "/tmp/context",
    contextFiles: [],
    attachmentsDirectoryPath: "/tmp/attachments",
    attachments: []
  }, {
    selectedPhaseId: "refinement",
    selectedArtifactContent: "# Spec · US-0099 · v01",
    contextSuggestions: [],
    settingsConfigured: true,
    settingsMessage: null
  }, "idle");

  assert.doesNotMatch(html, /approval-question-item__body">\.\.\.</);
  assert.match(html, /approval-question-item__body">Confirm outbound contract for omitted fields\?/);
  assert.match(html, /copy-question-button__icon--copy/);
  assert.match(html, /copy-question-button__icon--done/);
});

test("buildWorkflowHtml uses descriptive secondary labels for capture and clarification", () => {
  const html = buildWorkflowHtml({
    usId: "US-0001",
    title: "US-0001 · Clarification view",
    category: "workflow",
    status: "active",
    currentPhase: "clarification",
    directoryPath: "/tmp/us.US-0001",
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
        expectsHumanIntervention: false,
        isApproved: false,
        isCurrent: false,
        state: "completed",
        artifactPath: null,
        executePromptPath: null,
        approvePromptPath: null
      },
      {
        phaseId: "clarification",
        title: "Refinement",
        order: 1,
        requiresApproval: false,
        expectsHumanIntervention: true,
        isApproved: false,
        isCurrent: true,
        state: "current",
        artifactPath: "/tmp/00-clarification.md",
        executePromptPath: "/tmp/clarification.execute.md",
        approvePromptPath: null
      }
    ],
    controls: {
      canContinue: true,
      canApprove: false,
      requiresApproval: false,
      blockingReason: null,
      canRestartFromSource: true,
      regressionTargets: []
    },
    clarification: {
      status: "needs_clarification",
      tolerance: "balanced",
      reason: "More user detail is required.",
      items: []
    },
    events: [],
    contextFilesDirectoryPath: "/tmp/context",
    contextFiles: [],
    attachmentsDirectoryPath: "/tmp/attachments",
    attachments: []
  }, {
    selectedPhaseId: "clarification",
    selectedArtifactContent: "## Refinement",
    contextSuggestions: [],
    settingsConfigured: true,
    settingsMessage: null
  }, "idle");

  assert.match(html, /<h1>US-0001 · Clarification view<\/h1>/);
  assert.match(html, /phase-node capture[^]*?<div class="phase-slug">Capture story intent<\/div>/);
  assert.match(html, /phase-node clarification[^]*?<div class="phase-slug">Resolve open questions<\/div>/);
  assert.match(html, /<h2>Refinement<\/h2>/);
  assert.match(html, /<span class="token">Resolve open questions<\/span>/);
});

test("buildWorkflowHtml does not render the legacy debug reset action", () => {
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
      expectsHumanIntervention: true,
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

  assert.doesNotMatch(html, /Reset to Capture/);
  assert.doesNotMatch(html, /data-command="debugResetToCapture"/);
});

test("buildWorkflowHtml disables execution controls when settings are incomplete without duplicating the sidebar warning", () => {
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
      expectsHumanIntervention: false,
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

  assert.doesNotMatch(html, /SpecForge\.AI settings are incomplete/);
  assert.doesNotMatch(html, /Configuration Required/);
  assert.match(html, /data-command="play"[^>]*disabled/);
  assert.match(html, /data-command="continue"[^>]*disabled/);
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
        expectsHumanIntervention: false,
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
        expectsHumanIntervention: true,
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
  assert.match(html, /data-anchor-phase-id="refinement"/);
  assert.match(html, /Executing Refinement/);
  assert.match(html, /shuffleMessages/);
  assert.match(html, /formatOverlayElapsed/);
  assert.match(html, /restoreExecutionOverlayState/);
  assert.match(html, /persistExecutionOverlayState/);
  assert.match(html, /sessionStorage/);
  assert.match(
    html,
    /if \(overlayTone === "playing"\) \{\s*clearExecutionOverlayDismissed\(dismissKey\);\s*\}\s*if \(overlayTone !== "playing" && dismissible && isExecutionOverlayDismissed\(dismissKey\)\)/
  );
  assert.match(html, /if \(messageElement && shuffledMessages\.length > 0\)/);
  assert.match(html, /const positionExecutionOverlay = \(\) =>/);
  assert.match(html, /window\.addEventListener\("resize", positionExecutionOverlay\)/);
  assert.match(html, /window\.removeEventListener\("resize", positionExecutionOverlay\)/);
  assert.match(html, /executionOverlay\.style\.left = nextLeft \+ "px"/);
  assert.match(html, /executionOverlay\.style\.top = nextTop \+ "px"/);
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
        expectsHumanIntervention: false,
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
        expectsHumanIntervention: true,
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
        expectsHumanIntervention: true,
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
        expectsHumanIntervention: false,
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
        expectsHumanIntervention: true,
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
        expectsHumanIntervention: true,
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

test("buildWorkflowHtml computes deterministic two-column graph positions with overlap and same-column spacing", () => {
  const html = buildWorkflowHtml({
    usId: "US-0099",
    title: "Graph layout",
    category: "workflow",
    status: "active",
    currentPhase: "capture",
    directoryPath: "/tmp/us.US-0099",
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
        expectsHumanIntervention: false,
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
        expectsHumanIntervention: true,
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
        expectsHumanIntervention: true,
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

  assert.match(html, /phase-node capture[\s\S]*?--phase-left-desktop:/);
  assert.match(html, /phase-node clarification[\s\S]*?--phase-left-desktop:/);
  assert.match(html, /phase-node refinement[\s\S]*?--phase-left-desktop:/);
  assert.match(html, /phase-graph" aria-label="Workflow graph" style="--graph-width-desktop:/);
});

test("buildWorkflowHtml routes graph links around cards using rounded orthogonal segments", () => {
  const html = buildWorkflowHtml({
    usId: "US-0042",
    title: "Graph routing",
    category: "workflow",
    status: "active",
    currentPhase: "review",
    directoryPath: "/tmp/us.US-0042",
    workBranch: null,
    mainArtifactPath: "/tmp/us.md",
    timelinePath: "/tmp/timeline.md",
    rawTimeline: "raw timeline",
    phases: [
      {
        phaseId: "implementation",
        title: "Implementation",
        order: 4,
        requiresApproval: false,
        expectsHumanIntervention: false,
        isApproved: false,
        isCurrent: false,
        state: "completed",
        artifactPath: "/tmp/03-implementation.md",
        executePromptPath: null,
        approvePromptPath: null
      },
      {
        phaseId: "review",
        title: "Review",
        order: 5,
        requiresApproval: false,
        expectsHumanIntervention: false,
        isApproved: false,
        isCurrent: true,
        state: "blocked",
        artifactPath: "/tmp/04-review.md",
        executePromptPath: null,
        approvePromptPath: null
      },
      {
        phaseId: "release-approval",
        title: "Release Approval",
        order: 6,
        requiresApproval: true,
        expectsHumanIntervention: true,
        isApproved: false,
        isCurrent: false,
        state: "pending",
        artifactPath: null,
        executePromptPath: null,
        approvePromptPath: null
      }
    ],
    controls: {
      canContinue: false,
      canApprove: false,
      requiresApproval: false,
      blockingReason: "review_failed",
      canRestartFromSource: false,
      regressionTargets: ["implementation"],
      rewindTargets: []
    },
    clarification: null,
    events: [],
    attachmentsDirectoryPath: "/tmp/attachments",
    attachments: []
  }, {
    selectedPhaseId: "review",
    selectedArtifactContent: "## Review",
    contextSuggestions: [],
    settingsConfigured: true,
    settingsMessage: null
  }, "idle");

  assert.match(html, /class="completed" d="M [^"]* C [^"]*"/);
  assert.match(html, /class="reverse-active" d="M [^"]* C [^"]* S [^"]*"/);
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
        expectsHumanIntervention: false,
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
        expectsHumanIntervention: true,
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
        expectsHumanIntervention: true,
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
        expectsHumanIntervention: false,
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
  assert.match(html, /<div class="graph-stage graph-stage--overlay-active graph-stage--overlay-blocking">/);
  assert.match(
    html,
    /if \(overlayTone === "playing"\) {\s+clearExecutionOverlayDismissed\(dismissKey\);\s+}\s+if \(overlayTone !== "playing" && dismissible && isExecutionOverlayDismissed\(dismissKey\)\)/
  );
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
        expectsHumanIntervention: false,
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
  assert.match(html, /data-anchor-phase-id="review"/);
  assert.match(html, /<div class="graph-stage graph-stage--overlay-active">/);
  assert.match(html, /\.graph-stage\.graph-stage--overlay-active \.phase-graph[\s\S]*filter: blur\(2px\) saturate\(0\.85\) brightness\(0\.78\);/);
  assert.match(html, /\.graph-stage\.graph-stage--overlay-blocking \.phase-graph[\s\S]*pointer-events: none;/);
  assert.doesNotMatch(html, /<div class="graph-stage graph-stage--overlay-active graph-stage--overlay-blocking">/);
  assert.match(html, /graphStage\.classList\.remove\("graph-stage--overlay-active"\)/);
  assert.doesNotMatch(html, /document\.addEventListener\("pointerdown"/);
});

test("buildWorkflowHtml shows pending execution settings as a dismissable overlay when an execution context still exists", () => {
  const html = buildWorkflowHtml({
    usId: "US-0011",
    title: "Pending settings overlay",
    category: "workflow",
    status: "completed",
    currentPhase: "completed",
    directoryPath: "/tmp/us.US-0011",
    workBranch: "feature/us-0011",
    mainArtifactPath: "/tmp/us.md",
    timelinePath: "/tmp/timeline.md",
    rawTimeline: "raw timeline",
    phases: [
      {
        phaseId: "completed",
        title: "Completed",
        order: 0,
        requiresApproval: false,
        expectsHumanIntervention: false,
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
    selectedPhaseId: "completed",
    selectedArtifactContent: null,
    contextSuggestions: [],
    settingsConfigured: true,
    settingsMessage: null,
    executionPhaseId: "completed",
    executionSettingsPending: true,
    executionSettingsPendingMessage: "Execution settings changed while this phase was running. SpecForge.AI will reload the setup after the workflow enters the next phase."
  }, "idle");

  assert.match(html, /execution-overlay execution-overlay--pending-settings/);
  assert.match(html, /Execution setup pending/);
  assert.match(html, /SpecForge\.AI Configuration/);
  assert.match(html, /data-dismissible="true"/);
  assert.match(html, /Open SpecForge Configuration/);
  assert.match(html, /<div class="graph-stage graph-stage--overlay-active">/);
});

test("buildWorkflowHtml hides pending execution settings when there is no active execution context", () => {
  const html = buildWorkflowHtml({
    usId: "US-0012",
    title: "No stale settings overlay",
    category: "workflow",
    status: "completed",
    currentPhase: "completed",
    directoryPath: "/tmp/us.US-0012",
    workBranch: "feature/us-0012",
    mainArtifactPath: "/tmp/us.md",
    timelinePath: "/tmp/timeline.md",
    rawTimeline: "raw timeline",
    phases: [
      {
        phaseId: "completed",
        title: "Completed",
        order: 0,
        requiresApproval: false,
        expectsHumanIntervention: false,
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
    selectedPhaseId: "completed",
    selectedArtifactContent: null,
    contextSuggestions: [],
    settingsConfigured: true,
    settingsMessage: null,
    executionSettingsPending: true,
    executionSettingsPendingMessage: "Execution settings changed while this phase was running. SpecForge.AI will reload the setup after the workflow enters the next phase."
  }, "idle");

  assert.doesNotMatch(html, /execution-overlay execution-overlay--pending-settings/);
  assert.doesNotMatch(html, /Execution setup pending/);
});

test("buildWorkflowHtml anchors paused state to the ad hoc paused phase when provided", () => {
  const html = buildWorkflowHtml({
    usId: "US-0015",
    title: "Phase pause anchor",
    category: "workflow",
    status: "active",
    currentPhase: "refinement",
    directoryPath: "/tmp/us.US-0015",
    workBranch: null,
    mainArtifactPath: "/tmp/us.md",
    timelinePath: "/tmp/timeline.md",
    rawTimeline: "raw timeline",
    phases: [
      {
        phaseId: "refinement",
        title: "Refinement",
        order: 0,
        requiresApproval: false,
        expectsHumanIntervention: true,
        isApproved: false,
        isCurrent: true,
        state: "current",
        artifactPath: null,
        executePromptPath: null,
        approvePromptPath: null
      },
      {
        phaseId: "technical-design",
        title: "Technical Design",
        order: 1,
        requiresApproval: false,
        expectsHumanIntervention: false,
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
    selectedPhaseId: "technical-design",
    selectedArtifactContent: null,
    contextSuggestions: [],
    settingsConfigured: true,
    settingsMessage: null,
    executionPhaseId: "technical-design",
    pausedPhaseIds: ["technical-design"]
  }, "paused");

  assert.match(html, /Paused before Technical Design/);
  assert.match(html, /data-anchor-phase-id="technical-design"/);
  assert.match(html, /phase-node technical-design phase-tone-paused selected/);
  assert.match(html, /phase-pause-toggle phase-pause-toggle--armed/);
  assert.match(html, /aria-pressed="true"/);
});

test("buildWorkflowHtml pauses before implementation when technical design is the current phase", () => {
  const html = buildWorkflowHtml({
    usId: "US-0019",
    title: "Technical design pause handoff",
    category: "workflow",
    status: "active",
    currentPhase: "technical-design",
    directoryPath: "/tmp/us.US-0019",
    workBranch: null,
    mainArtifactPath: "/tmp/us.md",
    timelinePath: "/tmp/timeline.md",
    rawTimeline: "raw timeline",
    phases: [
      {
        phaseId: "technical-design",
        title: "Technical Design",
        order: 0,
        requiresApproval: false,
        expectsHumanIntervention: false,
        isApproved: false,
        isCurrent: true,
        state: "current",
        artifactPath: null,
        executePromptPath: null,
        approvePromptPath: null
      },
      {
        phaseId: "implementation",
        title: "Implementation",
        order: 1,
        requiresApproval: false,
        expectsHumanIntervention: false,
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
    selectedPhaseId: "technical-design",
    selectedArtifactContent: null,
    contextSuggestions: [],
    settingsConfigured: true,
    settingsMessage: null,
    pausedPhaseIds: ["implementation"],
    executionPhaseId: "implementation"
  }, "paused");

  assert.match(html, /Paused before Implementation/);
  assert.match(html, /data-anchor-phase-id="implementation"/);
  assert.match(html, /phase-node implementation phase-tone-paused selected phase-node--current/);
  assert.doesNotMatch(html, /phase-node technical-design[^"]*phase-node--current/);
  assert.match(html, /phase-current-rail__label">Current</);
  assert.match(html, /<h2>Implementation<\/h2>/);
  assert.match(html, /data-command="continue"[^>]*>Continue</);
});

test("buildWorkflowHtml prefers configured overlay model label over stale historical execution labels", () => {
  const html = buildWorkflowHtml({
    usId: "US-0020",
    title: "Overlay model routing",
    category: "workflow",
    status: "active",
    currentPhase: "technical-design",
    directoryPath: "/tmp/us.US-0020",
    workBranch: null,
    mainArtifactPath: "/tmp/us.md",
    timelinePath: "/tmp/timeline.md",
    rawTimeline: "raw timeline",
    phases: [
      {
        phaseId: "technical-design",
        title: "Technical Design",
        order: 0,
        requiresApproval: false,
        expectsHumanIntervention: false,
        isApproved: false,
        isCurrent: true,
        state: "current",
        artifactPath: null,
        executePromptPath: null,
        approvePromptPath: null
      },
      {
        phaseId: "implementation",
        title: "Implementation",
        order: 1,
        requiresApproval: false,
        expectsHumanIntervention: false,
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
    approvalQuestions: [],
    events: [
      {
        timestampUtc: "2026-04-24T07:00:00Z",
        code: "phase_completed",
        actor: "system",
        phase: "implementation",
        summary: "Old implementation run.",
        artifacts: [],
        usage: null,
        durationMs: null,
        execution: {
          providerKind: "openai-compatible",
          model: "qwen3.6:27b",
          profileName: "reviewer",
          baseUrl: "http://localhost:11434/v1"
        }
      }
    ],
    attachmentsDirectoryPath: "/tmp/attachments",
    attachments: []
  }, {
    selectedPhaseId: "technical-design",
    selectedArtifactContent: null,
    contextSuggestions: [],
    settingsConfigured: true,
    settingsMessage: null,
    executionPhaseId: "implementation",
    modelProfiles: [
      { name: "codex-main", model: "codex" },
      { name: "reviewer", model: "qwen3.6:27b" }
    ],
    phaseModelAssignments: {
      defaultProfileName: "light",
      captureProfileName: null,
      clarificationProfileName: null,
      refinementProfileName: null,
      technicalDesignProfileName: "codex-main",
      implementationProfileName: "codex-main",
      reviewProfileName: "reviewer",
      releaseApprovalProfileName: null,
      prPreparationProfileName: null
    }
  }, "playing");

  assert.match(html, /Executing Implementation/);
  assert.match(html, /execution-overlay__phase-model">codex-main \/ codex</);
});

test("buildWorkflowHtml shows implementation loop limit banner and manual extra pass action", () => {
  const html = buildWorkflowHtml({
    usId: "US-0099",
    title: "Implementation loop limit",
    category: "workflow",
    status: "active",
    currentPhase: "implementation",
    directoryPath: "/tmp/us.US-0099",
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
        expectsHumanIntervention: false,
        isApproved: false,
        isCurrent: true,
        state: "current",
        artifactPath: "/tmp/03-implementation.md",
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
      regressionTargets: []
    },
    clarification: null,
    events: [
      {
        timestampUtc: "2026-04-18T10:00:00Z",
        code: "phase_completed",
        actor: "system",
        phase: "implementation",
        summary: "Generated implementation artifact.",
        artifacts: ["/tmp/03-implementation.md"],
        usage: null,
        durationMs: null
      },
      {
        timestampUtc: "2026-04-18T10:10:00Z",
        code: "artifact_operated",
        actor: "system",
        phase: "implementation",
        summary: "Applied implementation corrections.",
        artifacts: ["/tmp/03-implementation.v02.md"],
        usage: null,
        durationMs: null
      }
    ],
    attachmentsDirectoryPath: "/tmp/attachments",
    attachments: []
  }, {
    selectedPhaseId: "implementation",
    selectedArtifactContent: null,
    contextSuggestions: [],
    settingsConfigured: true,
    settingsMessage: null,
    maxImplementationReviewCycles: 2
  }, "idle");

  assert.match(html, /Implementation Loop Paused/);
  assert.match(html, /reached the configured limit \(2\)/);
  assert.match(html, /Run One Extra Review Pass/);
  assert.match(html, /icon-button--attention/);
  assert.doesNotMatch(html, /data-command="play"[^>]*disabled/);
});

test("buildWorkflowHtml prefers assigned overlay profile over stale history when configured model is blank", () => {
  const html = buildWorkflowHtml({
    usId: "US-0016",
    title: "Native implementation profile",
    category: "workflow",
    status: "active",
    currentPhase: "technical-design",
    directoryPath: "/tmp/us.US-0016",
    workBranch: null,
    mainArtifactPath: "/tmp/us.md",
    timelinePath: "/tmp/timeline.md",
    rawTimeline: "raw timeline",
    phases: [
      {
        phaseId: "technical-design",
        title: "Technical Design",
        order: 0,
        requiresApproval: false,
        expectsHumanIntervention: false,
        isApproved: false,
        isCurrent: true,
        state: "current",
        artifactPath: null,
        executePromptPath: null,
        approvePromptPath: null
      },
      {
        phaseId: "implementation",
        title: "Implementation",
        order: 1,
        requiresApproval: false,
        expectsHumanIntervention: false,
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
    approvalQuestions: [],
    events: [
      {
        timestampUtc: "2026-04-24T07:00:00Z",
        code: "phase_completed",
        actor: "system",
        phase: "implementation",
        summary: "Old implementation run.",
        artifacts: [],
        usage: null,
        durationMs: null,
        execution: {
          providerKind: "openai-compatible",
          model: "qwen3.6:27b",
          profileName: "reviewer",
          baseUrl: "http://localhost:11434/v1"
        }
      }
    ],
    attachmentsDirectoryPath: "/tmp/attachments",
    attachments: []
  }, {
    selectedPhaseId: "technical-design",
    selectedArtifactContent: null,
    contextSuggestions: [],
    settingsConfigured: true,
    settingsMessage: null,
    executionPhaseId: "implementation",
    modelProfiles: [
      { name: "codex-main", model: "" },
      { name: "reviewer", model: "qwen3.6:27b" }
    ],
    phaseModelAssignments: {
      defaultProfileName: "light",
      captureProfileName: null,
      clarificationProfileName: null,
      refinementProfileName: null,
      technicalDesignProfileName: "codex-main",
      implementationProfileName: "codex-main",
      reviewProfileName: "reviewer",
      releaseApprovalProfileName: null,
      prPreparationProfileName: null
    }
  }, "playing");

  assert.match(html, /Executing Implementation/);
  assert.match(html, /execution-overlay__phase-model">codex-main</);
  assert.doesNotMatch(html, /execution-overlay__phase-model">reviewer \/ qwen3\.6:27b</);
});

test("buildWorkflowHtml uses phase routing instead of stale history for every execution overlay phase", () => {
  const phaseTitles = new Map([
    ["capture", "Capture"],
    ["clarification", "Clarification"],
    ["refinement", "Refinement"],
    ["technical-design", "Technical Design"],
    ["implementation", "Implementation"],
    ["review", "Review"],
    ["release-approval", "Release Approval"],
    ["pr-preparation", "PR Preparation"]
  ]);
  const assignmentKeys = new Map([
    ["capture", "captureProfileName"],
    ["clarification", "clarificationProfileName"],
    ["refinement", "refinementProfileName"],
    ["technical-design", "technicalDesignProfileName"],
    ["implementation", "implementationProfileName"],
    ["review", "reviewProfileName"],
    ["release-approval", "releaseApprovalProfileName"],
    ["pr-preparation", "prPreparationProfileName"]
  ]);

  for (const [phaseId, title] of phaseTitles) {
    const assignedProfile = `${phaseId}-runner`;
    const phaseModelAssignments = {
      defaultProfileName: "light",
      captureProfileName: "capture-runner",
      clarificationProfileName: "clarification-runner",
      refinementProfileName: "refinement-runner",
      technicalDesignProfileName: "technical-design-runner",
      implementationProfileName: "implementation-runner",
      reviewProfileName: "review-runner",
      releaseApprovalProfileName: "release-approval-runner",
      prPreparationProfileName: "pr-preparation-runner"
    };
    const assignmentKey = assignmentKeys.get(phaseId);
    assert.equal(
      assignmentKey ? phaseModelAssignments[assignmentKey as keyof typeof phaseModelAssignments] : null,
      assignedProfile
    );

    const html = buildWorkflowHtml({
      usId: "US-0017",
      title: "Phase routing overlay",
      category: "workflow",
      status: "active",
      currentPhase: "capture",
      directoryPath: "/tmp/us.US-0017",
      workBranch: null,
      mainArtifactPath: "/tmp/us.md",
      timelinePath: "/tmp/timeline.md",
      rawTimeline: "raw timeline",
      phases: [...phaseTitles].map(([candidatePhaseId, candidateTitle], index) => ({
        phaseId: candidatePhaseId,
        title: candidateTitle,
        order: index,
        requiresApproval: false,
        expectsHumanIntervention: false,
        isApproved: false,
        isCurrent: candidatePhaseId === "capture",
        state: candidatePhaseId === "capture" ? "current" : "pending",
        artifactPath: null,
        executePromptPath: null,
        approvePromptPath: null
      })),
      controls: {
        canContinue: true,
        canApprove: false,
        requiresApproval: false,
        blockingReason: null,
        canRestartFromSource: false,
        regressionTargets: []
      },
      clarification: null,
      approvalQuestions: [],
      events: [
        {
          timestampUtc: "2026-04-24T07:00:00Z",
          code: "phase_completed",
          actor: "system",
          phase: phaseId,
          summary: "Stale run.",
          artifacts: [],
          usage: null,
          durationMs: null,
          execution: {
            providerKind: "openai-compatible",
            model: "qwen3.6:27b",
            profileName: "reviewer",
            baseUrl: "http://localhost:11434/v1"
          }
        }
      ],
      attachmentsDirectoryPath: "/tmp/attachments",
      attachments: []
    }, {
      selectedPhaseId: "capture",
      selectedArtifactContent: null,
      contextSuggestions: [],
      settingsConfigured: true,
      settingsMessage: null,
      executionPhaseId: phaseId,
      modelProfiles: [
        { name: assignedProfile, model: "" },
        { name: "reviewer", model: "qwen3.6:27b" }
      ],
      phaseModelAssignments
    }, "playing");

    assert.match(html, new RegExp(`Executing ${title}`));
    assert.match(html, new RegExp(`execution-overlay__phase-model">${assignedProfile}<`));
    assert.doesNotMatch(html, /execution-overlay__phase-model">reviewer \/ qwen3\.6:27b</);
  }
});

test("buildWorkflowHtml prefers assigned phase model over stale execution history in selected phase metrics", () => {
  const html = buildWorkflowHtml({
    usId: "US-0099",
    title: "Release approval metrics",
    category: "workflow",
    status: "waiting-user",
    currentPhase: "release-approval",
    directoryPath: "/tmp/us.US-0099",
    workBranch: "feature/us-0099",
    mainArtifactPath: "/tmp/us.md",
    timelinePath: "/tmp/timeline.md",
    rawTimeline: "raw timeline",
    phases: [
      {
        phaseId: "release-approval",
        title: "Release Approval",
        order: 6,
        requiresApproval: true,
        expectsHumanIntervention: true,
        isApproved: false,
        isCurrent: true,
        state: "current",
        artifactPath: "/tmp/06-release-approval.md",
        executePromptPath: null,
        approvePromptPath: "/tmp/release-approval.approve.md"
      }
    ],
    controls: {
      canContinue: false,
      canApprove: true,
      requiresApproval: true,
      blockingReason: "release-approval_pending_user_approval",
      canRestartFromSource: false,
      regressionTargets: []
    },
    clarification: null,
    approvalQuestions: [],
    events: [
      {
        timestampUtc: "2026-04-24T08:00:00Z",
        code: "phase_completed",
        actor: "system",
        phase: "release-approval",
        summary: "Recorded with stale runtime label.",
        artifacts: ["/tmp/06-release-approval.md"],
        usage: null,
        durationMs: null,
        execution: {
          providerKind: "codex",
          model: "codex-cli",
          profileName: null,
          baseUrl: null
        }
      }
    ],
    attachmentsDirectoryPath: "/tmp/attachments",
    attachments: []
  }, {
    selectedPhaseId: "release-approval",
    selectedArtifactContent: "## Release Approval",
    contextSuggestions: [],
    settingsConfigured: true,
    settingsMessage: null,
    modelProfiles: [
      { name: "release-approval-runner", model: "gpt-5.5" }
    ],
    phaseModelAssignments: {
      defaultProfileName: null,
      captureProfileName: null,
      clarificationProfileName: null,
      refinementProfileName: null,
      technicalDesignProfileName: null,
      implementationProfileName: null,
      reviewProfileName: null,
      releaseApprovalProfileName: "release-approval-runner",
      prPreparationProfileName: null
    }
  }, "idle");

  assert.match(html, /token-summary__label">Model<\/span>\s*<span class="token-summary__value">release-approval-runner \/ gpt-5\.5<\/span>/);
  assert.doesNotMatch(html, /token-summary__label">Model<\/span>\s*<span class="token-summary__value">codex-cli<\/span>/);
});

test("buildWorkflowHtml only shows phase pause buttons for unexecuted pending phases", () => {
  const html = buildWorkflowHtml({
    usId: "US-0016",
    title: "Pending phase pauses",
    category: "workflow",
    status: "active",
    currentPhase: "refinement",
    directoryPath: "/tmp/us.US-0016",
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
        expectsHumanIntervention: false,
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
        requiresApproval: false,
        expectsHumanIntervention: true,
        isApproved: false,
        isCurrent: true,
        state: "current",
        artifactPath: null,
        executePromptPath: null,
        approvePromptPath: null
      },
      {
        phaseId: "technical-design",
        title: "Technical Design",
        order: 2,
        requiresApproval: false,
        expectsHumanIntervention: false,
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
    selectedPhaseId: "technical-design",
    selectedArtifactContent: null,
    contextSuggestions: [],
    settingsConfigured: true,
    settingsMessage: null,
    pausedPhaseIds: ["technical-design"]
  }, "idle");

  assert.doesNotMatch(html, /data-command="togglePhasePause"[^>]*data-phase-id="capture"/);
  assert.doesNotMatch(html, /data-command="togglePhasePause"[^>]*data-phase-id="refinement"/);
  assert.match(html, /data-command="togglePhasePause"[^>]*data-phase-id="technical-design"/);
  assert.match(html, /phase-pause-toggle phase-pause-toggle--armed/);
});

test("buildWorkflowHtml shows phase pause buttons again after a rewind makes later phases pending", () => {
  const html = buildWorkflowHtml({
    usId: "US-0017",
    title: "Rewind pause recovery",
    category: "workflow",
    status: "active",
    currentPhase: "refinement",
    directoryPath: "/tmp/us.US-0017",
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
        expectsHumanIntervention: false,
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
        requiresApproval: false,
        expectsHumanIntervention: true,
        isApproved: false,
        isCurrent: true,
        state: "current",
        artifactPath: null,
        executePromptPath: null,
        approvePromptPath: null
      },
      {
        phaseId: "technical-design",
        title: "Technical Design",
        order: 2,
        requiresApproval: false,
        expectsHumanIntervention: false,
        isApproved: false,
        isCurrent: false,
        state: "pending",
        artifactPath: null,
        executePromptPath: null,
        approvePromptPath: null
      },
      {
        phaseId: "implementation",
        title: "Implementation",
        order: 3,
        requiresApproval: false,
        expectsHumanIntervention: false,
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
    selectedPhaseId: "technical-design",
    selectedArtifactContent: null,
    contextSuggestions: [],
    settingsConfigured: true,
    settingsMessage: null
  }, "idle");

  assert.doesNotMatch(html, /data-command="togglePhasePause"[^>]*data-phase-id="capture"/);
  assert.match(html, /data-command="togglePhasePause"[^>]*data-phase-id="technical-design"/);
  assert.match(html, /data-command="togglePhasePause"[^>]*data-phase-id="implementation"/);
});

test("buildWorkflowHtml shows pause buttons after a reset from capture onward but never on capture", () => {
  const html = buildWorkflowHtml({
    usId: "US-0018",
    title: "Reset pause recovery",
    category: "workflow",
    status: "active",
    currentPhase: "capture",
    directoryPath: "/tmp/us.US-0018",
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
        expectsHumanIntervention: false,
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
        expectsHumanIntervention: true,
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
        requiresApproval: false,
        expectsHumanIntervention: true,
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

  assert.doesNotMatch(html, /data-command="togglePhasePause"[^>]*data-phase-id="capture"/);
  assert.match(html, /data-command="togglePhasePause"[^>]*data-phase-id="clarification"/);
  assert.match(html, /data-command="togglePhasePause"[^>]*data-phase-id="refinement"/);
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
      expectsHumanIntervention: true,
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

  assert.match(html, /<div class="shell" data-workflow-shell data-us-id="US-0014">/);
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
        expectsHumanIntervention: true,
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
  assert.match(html, /token token--attention">waiting-user</);
  assert.match(html, /token token--attention">runner:paused</);
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
        expectsHumanIntervention: false,
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
        expectsHumanIntervention: true,
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
  assert.match(html, /token token--blocked">blocked</);
  assert.match(html, /phase-node capture phase-tone-completed/);
});

test("buildWorkflowHtml marks a phase blocked when its model security precheck fails", () => {
  const html = buildWorkflowHtml({
    usId: "US-0099",
    title: "Model security precheck",
    category: "workflow",
    status: "active",
    currentPhase: "technical-design",
    directoryPath: "/tmp/us.US-0099",
    workBranch: null,
    mainArtifactPath: "/tmp/us.md",
    timelinePath: "/tmp/timeline.md",
    rawTimeline: "raw timeline",
    phases: [
      {
        phaseId: "technical-design",
        title: "Technical Design",
        order: 0,
        requiresApproval: false,
        expectsHumanIntervention: false,
        isApproved: true,
        isCurrent: true,
        state: "current",
        artifactPath: "/tmp/02-technical-design.md",
        executePromptPath: null,
        approvePromptPath: null,
        executionReadiness: {
          phaseId: "technical-design",
          canExecute: true,
          blockingReason: null,
          requiredPermissions: {
            modelExecutionRequired: true,
            repositoryAccess: "read",
            workspaceWriteAccess: false
          },
          assignedModelSecurity: {
            providerKind: "openai-compatible",
            model: "gpt-lite",
            profileName: "default",
            repositoryAccess: "read",
            nativeCliRequired: false,
            nativeCliAvailable: true
          },
          validationMessage: "Phase permission precheck passed."
        }
      },
      {
        phaseId: "implementation",
        title: "Implementation",
        order: 1,
        requiresApproval: false,
        expectsHumanIntervention: false,
        isApproved: false,
        isCurrent: false,
        state: "pending",
        artifactPath: null,
        executePromptPath: null,
        approvePromptPath: null,
        executionReadiness: {
          phaseId: "implementation",
          canExecute: false,
          blockingReason: "implementation_requires_repository_write_access",
          requiredPermissions: {
            modelExecutionRequired: true,
            repositoryAccess: "read-write",
            workspaceWriteAccess: true
          },
          assignedModelSecurity: {
            providerKind: "openai-compatible",
            model: "gpt-lite",
            profileName: "default",
            repositoryAccess: "read",
            nativeCliRequired: false,
            nativeCliAvailable: true
          },
          validationMessage: "Phase permission precheck failed because the assigned model only has repository access 'read' but phase 'Implementation' requires 'read-write'."
        }
      }
    ],
    controls: {
      canContinue: false,
      canApprove: false,
      requiresApproval: false,
      blockingReason: "implementation_requires_repository_write_access",
      canRestartFromSource: false,
      regressionTargets: [],
      executionPhase: "implementation",
      executionReadiness: {
        phaseId: "implementation",
        canExecute: false,
        blockingReason: "implementation_requires_repository_write_access",
        requiredPermissions: {
          modelExecutionRequired: true,
          repositoryAccess: "read-write",
          workspaceWriteAccess: true
        },
        assignedModelSecurity: {
          providerKind: "openai-compatible",
          model: "gpt-lite",
          profileName: "default",
          repositoryAccess: "read",
          nativeCliRequired: false,
          nativeCliAvailable: true
        },
        validationMessage: "Phase permission precheck failed."
      }
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

  assert.match(html, /phase-node implementation phase-tone-blocked selected/);
  assert.match(html, /<h3>Phase Security<\/h3>/);
  assert.match(html, /required read-write/);
  assert.match(html, /assigned read/);
  assert.match(html, /Phase permission precheck failed because the assigned model only has repository access &#39;read&#39; but phase &#39;Implementation&#39; requires &#39;read-write&#39;/);
  assert.doesNotMatch(html, /phase-tag[^"]*">model /);
  assert.doesNotMatch(html, /security blocked/);
});

test("buildWorkflowHtml renders rerun review action when review failed and the workflow is idle", () => {
  const html = buildWorkflowHtml({
    usId: "US-0100",
    title: "Review rerun",
    category: "workflow",
    status: "active",
    currentPhase: "review",
    directoryPath: "/tmp/us.US-0100",
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
        expectsHumanIntervention: false,
        isApproved: false,
        isCurrent: true,
        state: "current",
        artifactPath: "/tmp/04-review.md",
        executePromptPath: "/tmp/review.execute.md",
        approvePromptPath: null,
        executionReadiness: {
          phaseId: "review",
          canExecute: true,
          blockingReason: null,
          requiredPermissions: {
            modelExecutionRequired: true,
            repositoryAccess: "read-write",
            workspaceWriteAccess: true
          },
          assignedModelSecurity: {
            providerKind: "codex",
            model: "gpt-5",
            profileName: "reviewer",
            repositoryAccess: "read-write",
            nativeCliRequired: true,
            nativeCliAvailable: true
          },
          validationMessage: "Phase security precheck passed."
        }
      }
    ],
    controls: {
      canContinue: false,
      canApprove: false,
      requiresApproval: false,
      blockingReason: "review_failed",
      canRestartFromSource: false,
      regressionTargets: []
    },
    clarification: null,
    events: [],
    attachmentsDirectoryPath: "/tmp/attachments",
    attachments: []
  }, {
    selectedPhaseId: "review",
    selectedArtifactContent: "# Review",
    contextSuggestions: [],
    settingsConfigured: true,
    settingsMessage: null
  }, "idle");

  assert.match(html, /phase-node review phase-tone-blocked selected phase-node--current/);
  assert.match(html, /token token--blocked">blocked</);
  assert.match(html, /data-command="continue"[^>]*>Rerun Review</);
  assert.doesNotMatch(html, /data-command="continue"[^>]*disabled[^>]*>Rerun Review</);
  assert.match(html, /token token--blocked">blocked</);
  assert.match(html, /workflow-action-button workflow-action-button--attention" type="button" data-open-review-approve-anyway-modal>Approve Anyway</);
});

test("buildWorkflowHtml shows active execution state while rerunning a failed review", () => {
  const html = buildWorkflowHtml({
    usId: "US-0101",
    title: "Review rerun playing",
    category: "workflow",
    status: "active",
    currentPhase: "review",
    directoryPath: "/tmp/us.US-0101",
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
        expectsHumanIntervention: false,
        isApproved: false,
        isCurrent: true,
        state: "current",
        artifactPath: "/tmp/04-review.md",
        executePromptPath: "/tmp/review.execute.md",
        approvePromptPath: null
      }
    ],
    controls: {
      canContinue: false,
      canApprove: false,
      requiresApproval: false,
      blockingReason: "review_failed",
      canRestartFromSource: false,
      regressionTargets: []
    },
    clarification: null,
    events: [],
    attachmentsDirectoryPath: "/tmp/attachments",
    attachments: []
  }, {
    selectedPhaseId: "review",
    selectedArtifactContent: "# Review",
    contextSuggestions: [],
    settingsConfigured: true,
    settingsMessage: null,
    executionPhaseId: "review"
  }, "playing");

  assert.match(html, /phase-node review phase-tone-active selected phase-node--current/);
  assert.match(html, /token token--active">executing</);
  assert.match(html, /data-tone="playing"/);
  assert.match(html, /Executing Review/);
});

test("buildWorkflowHtml keeps execution disabled when the workflow is open without an SLM or LLM provider", () => {
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
      expectsHumanIntervention: false,
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
    settingsMessage: "SpecForge.AI needs at least one configured model profile before workflow stages can run."
  }, "idle");

  assert.doesNotMatch(html, /configured model profile/);
  assert.match(html, /data-command="play"[^>]*disabled/);
  assert.match(html, /data-command="continue"[^>]*disabled/);
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
        expectsHumanIntervention: false,
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
        expectsHumanIntervention: true,
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
  assert.match(html, /badge token--attention/);
  assert.match(html, /The capture is still too vague/);
  assert.match(html, /data-clarification-answer/);
  assert.match(html, /A backoffice operator\./);
  assert.match(html, /Submit Answers/);
  assert.match(html, /id="submit-clarification-answers" class="workflow-action-button workflow-action-button--progress"/);
  assert.match(html, /submitClarificationAnswers/);
  assert.match(html, /Raw Artifact/);
  assert.match(html, /markdown-preview--raw-artifact/);
  assert.match(html, /The raw artifact stays visible here to preserve model context beyond the structured clarification questions below\./);
  assert.match(html, /needs_clarification/);
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
        expectsHumanIntervention: true,
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
  assert.match(html, /workflow-action-button--document" data-command="attachFiles" data-kind="context">Add Context Files</);
  assert.match(html, /tests\/SpecForge\.Domain\.Tests\/WorkflowRunnerTests\.cs/);
  assert.match(html, /Add to Context/);
  assert.match(html, /workflow-action-button workflow-action-button--document workflow-action-button--compact" data-command="addSuggestedContextFile"/);
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
        expectsHumanIntervention: false,
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
        expectsHumanIntervention: true,
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
        expectsHumanIntervention: true,
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

test("buildWorkflowHtml renders refinement approval questions from the workflow DTO", () => {
  const html = buildWorkflowHtml({
    usId: "US-0014",
    title: "Refinement approval questions",
    category: "workflow",
    status: "waiting-user",
    currentPhase: "refinement",
    directoryPath: "/tmp/us.US-0014",
    workBranch: null,
    mainArtifactPath: "/tmp/us.md",
    timelinePath: "/tmp/timeline.md",
    rawTimeline: "raw timeline",
    phases: [
      {
        phaseId: "refinement",
        title: "Refinement",
        order: 2,
        requiresApproval: true,
        expectsHumanIntervention: true,
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
    approvalQuestions: [
      {
        index: 1,
        question: "Which id pattern should be used for articles.json?",
        status: "pending",
        isResolved: false,
        answer: null,
        answeredBy: null,
        answeredAtUtc: null
      },
      {
        index: 2,
        question: "Can the en-US translation be generated automatically?",
        status: "pending",
        isResolved: false,
        answer: null,
        answeredBy: null,
        answeredAtUtc: null
      }
    ],
    events: [],
    attachmentsDirectoryPath: "/tmp/attachments",
    attachments: []
  }, {
    selectedPhaseId: "refinement",
    selectedArtifactContent: `# Spec · US-0014 · v01

## Acceptance Criteria
- [ ] Review the outcome`,
    contextSuggestions: [],
    settingsConfigured: true,
    settingsMessage: null
  }, "idle");

  assert.match(html, /<h3>Human Approval Questions<\/h3>/);
  assert.match(html, /Which id pattern should be used for articles\.json\?/);
  assert.match(html, /Can the en-US translation be generated automatically\?/);
  assert.match(html, /approval-question-item__index">1</);
  assert.match(html, /These are the open decisions the approver still needs to resolve before freezing the spec baseline\./);
});

test("buildWorkflowHtml renders approve action for release approval from canonical phase controls", () => {
  const html = buildWorkflowHtml({
    usId: "US-0098",
    title: "Release approval action",
    category: "workflow",
    status: "waiting-user",
    currentPhase: "release-approval",
    directoryPath: "/tmp/us.US-0098",
    workBranch: "feature/us-0098-release-approval",
    mainArtifactPath: "/tmp/us.md",
    timelinePath: "/tmp/timeline.md",
    rawTimeline: "raw timeline",
    phases: [
      {
        phaseId: "release-approval",
        title: "Release Approval",
        order: 6,
        requiresApproval: true,
        expectsHumanIntervention: true,
        isApproved: false,
        isCurrent: true,
        state: "current",
        artifactPath: "/tmp/06-release-approval.md",
        executePromptPath: "/tmp/release-approval.execute.md",
        approvePromptPath: "/tmp/release-approval.approve.md"
      }
    ],
    controls: {
      canContinue: false,
      canApprove: true,
      requiresApproval: true,
      blockingReason: "release-approval_pending_user_approval",
      canRestartFromSource: true,
      regressionTargets: []
    },
    clarification: null,
    approvalQuestions: [],
    events: [],
    attachmentsDirectoryPath: "/tmp/attachments",
    attachments: []
  }, {
    selectedPhaseId: "release-approval",
    selectedArtifactContent: "## Release Approval\nReady for approval.",
    contextSuggestions: [],
    settingsConfigured: true,
    settingsMessage: null
  }, "idle");

  assert.match(html, /data-command="approve"[^>]*>Approve</);
});

test("buildWorkflowHtml renders refinement clarification questions from a blocking artifact", () => {
  const html = buildWorkflowHtml({
    usId: "US-0015",
    title: "Refinement clarification fallback",
    category: "workflow",
    status: "waiting-user",
    currentPhase: "refinement",
    directoryPath: "/tmp/us.US-0015",
    workBranch: null,
    mainArtifactPath: "/tmp/us.md",
    timelinePath: "/tmp/timeline.md",
    rawTimeline: "raw timeline",
    phases: [
      {
        phaseId: "refinement",
        title: "Refinement",
        order: 2,
        requiresApproval: true,
        expectsHumanIntervention: true,
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
    events: [],
    attachmentsDirectoryPath: "/tmp/attachments",
    attachments: []
  }, {
    selectedPhaseId: "refinement",
    selectedArtifactContent: `State
draft

Decision
needs_clarification

Reason
The story is clear, but some data contract details remain unresolved.

Questions
What value should image receive when it is unavailable?
What format should publisheddate use?
Should texts contain only title and excerpt?`,
    contextSuggestions: [],
    settingsConfigured: true,
    settingsMessage: null
  }, "idle");

  assert.match(html, /<h3>Refinement Questions<\/h3>/);
  assert.match(html, /needs_clarification/);
  assert.match(html, /The story is clear, but some data contract details remain unresolved\./);
  assert.match(html, /What value should image receive when it is unavailable\?/);
  assert.match(html, /What format should publisheddate use\?/);
  assert.match(html, /Should texts contain only title and excerpt\?/);
  assert.match(html, /id="submit-refinement-questions"/);
  assert.match(html, /Apply Answers via Model/);
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
        expectsHumanIntervention: false,
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
        expectsHumanIntervention: true,
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
        expectsHumanIntervention: true,
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
        expectsHumanIntervention: true,
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
        expectsHumanIntervention: false,
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
        expectsHumanIntervention: false,
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
        expectsHumanIntervention: true,
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
        expectsHumanIntervention: false,
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

  assert.match(html, /phase-node clarification[\s\S]*?--phase-left-desktop: 400px; --phase-top-desktop: 142px;/);
  assert.match(html, /phase-node technical-design[\s\S]*?--phase-left-desktop: 400px; --phase-top-desktop: 498px;/);
  assert.match(html, /phase-node implementation[\s\S]*?--phase-left-desktop: 38px; --phase-top-desktop: 600px;/);
  assert.match(html, /phase-node review[\s\S]*?--phase-left-desktop: 38px; --phase-top-desktop: 778px;/);
  assert.match(html, /phase-node review[\s\S]*?--phase-left-mobile: 16px; --phase-top-mobile: 736px;/);
  assert.match(html, /phase-node release-approval[\s\S]*?--phase-left-desktop: 400px; --phase-top-desktop: 880px;/);
  assert.match(html, /viewBox="0 0 \d+ \d+"/);
});

test("buildWorkflowHtml renders completed phase reopen controls and lock state", () => {
  const html = buildWorkflowHtml({
    usId: "US-0200",
    title: "Completed workflow",
    category: "workflow",
    status: "completed",
    currentPhase: "pr-preparation",
    directoryPath: "/tmp/us.US-0200",
    workBranch: "feature/us-0200-completed",
    mainArtifactPath: "/tmp/us.md",
    timelinePath: "/tmp/timeline.md",
    rawTimeline: "raw timeline",
    pullRequest: {
      status: "published",
      title: "done(us-0200): prepare pull request",
      isDraft: false,
      number: 42,
      url: "https://github.com/acme/specforge/pull/42",
      remoteBranch: "feature/us-0200-completed",
      publishedAtUtc: "2026-04-27T06:21:49.968Z"
    },
    phases: [
      {
        phaseId: "pr-preparation",
        title: "PR Preparation",
        order: 7,
        requiresApproval: false,
        expectsHumanIntervention: false,
        isApproved: true,
        isCurrent: false,
        state: "completed",
        artifactPath: "/tmp/06-pr-preparation.md",
        executePromptPath: null,
        approvePromptPath: null
      },
      {
        phaseId: "completed",
        title: "Completed",
        order: 8,
        requiresApproval: false,
        expectsHumanIntervention: false,
        isApproved: true,
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
      blockingReason: "workflow_completed",
      canRestartFromSource: false,
      regressionTargets: [],
      rewindTargets: ["review", "pr-preparation"]
    },
    clarification: null,
    events: [],
    attachmentsDirectoryPath: "/tmp/attachments",
    attachments: []
  }, {
    selectedPhaseId: "completed",
    selectedArtifactContent: null,
    contextSuggestions: [],
    settingsConfigured: true,
    settingsMessage: null,
    completedUsLockOnCompleted: true
  }, "idle");

  assert.match(html, /phase-node pr-preparation phase-tone-completed/);
  assert.match(html, /phase-node completed phase-tone-completed selected phase-node--current/);
  assert.match(html, /<div class="phase-slug">Workflow finished<\/div>/);
  assert.match(html, /data-command="openExternalUrl" data-url="https:\/\/github.com\/acme\/specforge\/pull\/42"/);
  assert.match(html, /View PR #42/);
  assert.match(html, /<h3>Workflow Dashboard<\/h3>/);
  assert.match(html, /<h3>Usage by Model<\/h3>/);
  assert.match(html, /<h3>Usage by Phase<\/h3>/);
  assert.match(html, /Completed and locked/);
  assert.match(html, /Reopen Completed Workflow/);
  assert.match(html, /detail-card--completed-reopen/);
  assert.match(html, /detail-card__summary-icon/);
  assert.match(html, /data-completed-reopen-reason/);
  assert.match(html, /<option value="defect">re-open by defect<\/option>/);
  assert.match(html, /Select a reopen reason to see the destination phase\./);
  assert.match(html, /id="completed-reopen-description"/);
  assert.match(html, /data-submit-completed-reopen disabled>Open</);
  assert.doesNotMatch(html, /data-phase-rewind-button/);
  assert.match(html, /detail-card-shell[^]*detail-card--phase-overview[^]*detail-card--completed-reopen[^]*<h3>Workflow Dashboard<\/h3>/);
});

test("buildWorkflowHtml keeps completed reopen collapsed when completed has no own data", () => {
  const html = buildWorkflowHtml({
    usId: "US-0201",
    title: "Completed workflow without completed telemetry",
    category: "workflow",
    status: "completed",
    currentPhase: "pr-preparation",
    directoryPath: "/tmp/us.US-0201",
    workBranch: "feature/us-0201-completed",
    mainArtifactPath: "/tmp/us.md",
    timelinePath: "/tmp/timeline.md",
    rawTimeline: "raw timeline",
    phases: [
      {
        phaseId: "pr-preparation",
        title: "PR Preparation",
        order: 7,
        requiresApproval: false,
        expectsHumanIntervention: false,
        isApproved: true,
        isCurrent: false,
        state: "completed",
        artifactPath: "/tmp/06-pr-preparation.md",
        executePromptPath: null,
        approvePromptPath: null
      },
      {
        phaseId: "completed",
        title: "Completed",
        order: 8,
        requiresApproval: false,
        expectsHumanIntervention: false,
        isApproved: true,
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
      blockingReason: "workflow_completed",
      canRestartFromSource: false,
      regressionTargets: [],
      rewindTargets: []
    },
    clarification: null,
    events: [],
    attachmentsDirectoryPath: "/tmp/attachments",
    attachments: []
  }, {
    selectedPhaseId: "completed",
    selectedArtifactContent: null,
    contextSuggestions: [],
    settingsConfigured: true,
    settingsMessage: null,
    completedUsLockOnCompleted: true
  }, "idle");

  assert.match(html, /detail-card--completed-reopen/);
  assert.doesNotMatch(html, /detail-card--completed-reopen[^>]* open>/);
});

test("buildWorkflowHtml expands completed reopen when completed has own data", () => {
  const html = buildWorkflowHtml({
    usId: "US-0202",
    title: "Completed workflow with completed telemetry",
    category: "workflow",
    status: "completed",
    currentPhase: "pr-preparation",
    directoryPath: "/tmp/us.US-0202",
    workBranch: "feature/us-0202-completed",
    mainArtifactPath: "/tmp/us.md",
    timelinePath: "/tmp/timeline.md",
    rawTimeline: "raw timeline",
    phases: [
      {
        phaseId: "completed",
        title: "Completed",
        order: 8,
        requiresApproval: false,
        expectsHumanIntervention: false,
        isApproved: true,
        isCurrent: true,
        state: "current",
        artifactPath: "/tmp/completed.md",
        operationLogPath: null,
        executePromptPath: null,
        approvePromptPath: null
      }
    ],
    controls: {
      canContinue: false,
      canApprove: false,
      requiresApproval: false,
      blockingReason: "workflow_completed",
      canRestartFromSource: false,
      regressionTargets: [],
      rewindTargets: []
    },
    clarification: null,
    events: [
      {
        timestampUtc: "2026-04-27T08:00:00Z",
        code: "phase_completed",
        actor: "system",
        phase: "completed",
        summary: "Workflow completion was recorded.",
        artifacts: ["/tmp/completed.md"],
        usage: null,
        durationMs: null,
        execution: null
      }
    ],
    attachmentsDirectoryPath: "/tmp/attachments",
    attachments: []
  }, {
    selectedPhaseId: "completed",
    selectedArtifactContent: "Completed artifact",
    contextSuggestions: [],
    settingsConfigured: true,
    settingsMessage: null,
    completedUsLockOnCompleted: true
  }, "idle");

  assert.match(html, /detail-card--completed-reopen/);
});

test("buildWorkflowHtml keeps the hero header above a dedicated scrolling body", () => {
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
    phases: [{
      phaseId: "implementation",
      title: "Implementation",
      order: 4,
      requiresApproval: false,
      expectsHumanIntervention: false,
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
    selectedPhaseId: "implementation",
    selectedArtifactContent: null,
    contextSuggestions: [],
    settingsConfigured: true,
    settingsMessage: null
  }, "idle");

  assert.match(html, /body \{[\s\S]*height: 100vh;[\s\S]*overflow: hidden;/);
  assert.match(html, /\.shell \{[\s\S]*grid-template-rows: auto minmax\(0, 1fr\);[\s\S]*overflow: hidden;/);
  assert.match(html, /\.shell-body \{[\s\S]*overflow: hidden;/);
  assert.match(html, /<div class="shell-body">[\s\S]*<section class="layout">[\s\S]*<div class="layout-main">/);
  assert.match(html, /\.layout-main > \* \{[\s\S]*height: 100%;/);
  assert.match(html, /\.detail-panel \{[\s\S]*display: block;[\s\S]*height: 100%;[\s\S]*overflow-y: auto;/);
  assert.match(html, /\.hero \{[\s\S]*position: relative;[\s\S]*z-index: 30;/);
  assert.match(html, /const graphPanel = document\.querySelector\(/);
  assert.match(html, /const detailPanel = document\.querySelector\(/);
  assert.match(html, /const centerFocusedPhaseInGraph = \(\) => \{/);
  assert.match(html, /focusedPhaseNode\.offsetTop/);
  assert.match(html, /graphScrollTop:/);
  assert.match(html, /detailScrollTop:/);
  assert.match(html, /graphPanel\.addEventListener\("scroll"/);
  assert.match(html, /detailPanel\.addEventListener\("scroll"/);
  assert.doesNotMatch(html, /data-audit-panel/);
  assert.doesNotMatch(html, /data-audit-toggle/);
  assert.doesNotMatch(html, /audit-panel__body/);
  assert.match(html, /persistWorkflowScrollState\(\);[\s\S]*vscode\.postMessage\(\{/);
});
