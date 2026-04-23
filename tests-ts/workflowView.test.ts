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
        operationLogPath: "/tmp/01-refinement.ops.md",
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
  assert.match(html, /--phase-pending: rgba\(255, 255, 255, 0\.04\);/);
  assert.match(html, /phase-current-rail/);
  assert.match(html, /phase-current-rail__label">Current</);
  assert.match(html, /phase-tag phase-tag--waiting-user">waiting-user</);
  assert.match(html, /<div class="phase-slug">US<\/div>/);
  assert.match(html, /<span class="token">spec<\/span>/);
  assert.match(html, /currentFlow/);
  assert.match(html, /currentPulse/);
  assert.match(html, /Generated refinement artifact\./);
  assert.match(html, /<h2>Refinement<\/h2>/);
  assert.match(html, /Open Artifact/);
  assert.match(html, /Open Execute Prompt/);
  assert.match(html, /Open Approve Prompt/);
  assert.match(html, /detail-card-shell[^]*detail-actions--phase-header[^]*data-command="approve"[^>]*>Approve</);
  assert.match(html, /<h3>Approval Branch<\/h3>/);
  assert.match(html, /data-approval-base-branch-input/);
  assert.match(html, /value="main"/);
  assert.doesNotMatch(html, /data-command="restart">Reject</);
  assert.match(html, /workflow-action-button--document[^]*Open Artifact/);
  assert.match(html, /workflow-action-button--document[^]*Open Execute Prompt/);
  assert.match(html, /workflow-action-button--document[^]*Open Approve Prompt/);
  assert.match(html, /id="submit-phase-input" class="workflow-action-button workflow-action-button--progress"/);
  assert.match(html, /Open Operation Log/);
  assert.doesNotMatch(html, /action-btn--approve/);
  assert.doesNotMatch(html, /action-btn--reject/);
  assert.match(html, /data-open-workflow-files/);
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
  assert.match(html, /<h3>Operate Current Spec<\/h3>/);
  assert.match(html, /Apply via Model/);
  assert.match(html, /Current operation log/);
  assert.match(html, /alice/);
  assert.match(html, /model light \/ gpt-4\.1-mini/);
  assert.match(html, /Input \/ Output/);
  assert.match(html, />321 \/ 144</);
  assert.match(html, /Total/);
  assert.match(html, />465</);
  assert.match(html, /Response Speed/);
  assert.match(html, /29\.5 tok\/s/);
  assert.match(html, /phase_completed[^]*badge\">system</);
  assert.match(html, /phase_completed[^]*badge\">refinement</);
  assert.doesNotMatch(html, /<h3>Workflow Files<\/h3>/);
  assert.match(html, /attachment-item--dragging/);
  assert.match(html, /command: "setFileKind"/);
  assert.match(html, /vscode\.getState\(\)/);
  assert.match(html, /workflowFilesOpen/);
  assert.match(html, /vscode\.setState\(/);
  assert.match(html, /approvalBaseBranchDraft/);
  assert.match(html, /approvalBaseBranchAccepted/);
  assert.match(html, /approvalWorkBranchDraft/);
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
    events: [],
    contextFilesDirectoryPath: "/tmp/context",
    contextFiles: [],
    attachmentsDirectoryPath: "/tmp/attachments",
    attachments: []
  }, {
    selectedPhaseId: "refinement",
    selectedArtifactContent: `
## Human Approval Questions
- [ ] Is the scope precise enough?
`,
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
    events: [],
    contextFilesDirectoryPath: "/tmp/context",
    contextFiles: [],
    attachmentsDirectoryPath: "/tmp/attachments",
    attachments: []
  }, {
    selectedPhaseId: "refinement",
    selectedArtifactContent: `# Spec · US-0099 · v01

## Human Approval Questions
- [ ] ...
- [ ] Confirm outbound contract for omitted fields?
  - Answer: Omit them from the payload.
  - Answered By: tester
  - Answered At: 2026-04-22T13:20:00Z
`,
    contextSuggestions: [],
    settingsConfigured: true,
    settingsMessage: null
  }, "idle");

  assert.doesNotMatch(html, /approval-question-item__body">\.\.\.</);
  assert.match(html, /approval-question-item__body">Confirm outbound contract for omitted fields\?/);
  assert.match(html, /copy-question-button__icon--copy/);
  assert.match(html, /copy-question-button__icon--done/);
});

test("buildWorkflowHtml uses US as the secondary label for capture and clarification", () => {
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
  assert.match(html, /phase-node capture[^]*?<div class="phase-slug">US<\/div>/);
  assert.match(html, /phase-node clarification[^]*?<div class="phase-slug">US<\/div>/);
  assert.match(html, /<h2>Refinement<\/h2>/);
  assert.match(html, /<span class="token">US<\/span>/);
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
  assert.match(html, /workflow-action-button--danger" type="button" data-command="debugResetToCapture"/);
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
  assert.match(html, /workflow-action-button--progress" data-command="openSettings"/);
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
  assert.match(html, /if \(overlayTone === "playing"\) \{\s*clearExecutionOverlayDismissed\(dismissKey\);\s*\} else if \(dismissible && isExecutionOverlayDismissed\(dismissKey\)\)/);
  assert.match(html, /if \(messageElement && shuffledMessages\.length > 0\)/);
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

  assert.match(html, /phase-node capture[\s\S]*?--phase-left-desktop:/);
  assert.match(html, /phase-node clarification[\s\S]*?--phase-left-desktop:/);
  assert.match(html, /phase-node refinement[\s\S]*?--phase-left-desktop:/);
  assert.match(html, /phase-graph" aria-label="Workflow graph" style="--graph-width-desktop:/);
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
    settingsMessage: "SpecForge.AI needs at least one configured model profile before workflow stages can run."
  }, "idle");

  assert.match(html, /configured model profile/);
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

test("buildWorkflowHtml renders refinement approval questions from the spec artifact", () => {
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
    selectedArtifactContent: `# Spec · US-0014 · v01

## Preguntas para aprobación humana
1. Which id pattern should be used for articles.json?
2. Can the en-US translation be generated automatically?

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

  assert.match(html, /phase-node clarification[\s\S]*?--phase-left-desktop: 400px; --phase-top-desktop: 166px;/);
  assert.match(html, /phase-node technical-design[\s\S]*?--phase-left-desktop: 400px; --phase-top-desktop: 590px;/);
  assert.match(html, /phase-node implementation[\s\S]*?--phase-left-desktop: 38px; --phase-top-desktop: 716px;/);
  assert.match(html, /phase-node review[\s\S]*?--phase-left-desktop: 38px; --phase-top-desktop: 928px;/);
  assert.match(html, /phase-node review[\s\S]*?--phase-left-mobile: 16px; --phase-top-mobile: 886px;/);
  assert.match(html, /phase-node release-approval[\s\S]*?--phase-left-desktop: 400px; --phase-top-desktop: 1054px;/);
  assert.match(html, /viewBox="0 0 \d+ \d+"/);
});
