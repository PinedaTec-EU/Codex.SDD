#!/usr/bin/env node

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

const { buildWorkflowHtml } = require("../dist/workflowView.js");

const repoRoot = path.resolve(__dirname, "..");
const docsImageDir = path.join(repoRoot, "doc", "images");
const edgeBinary = "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge";

if (!fs.existsSync(edgeBinary)) {
  throw new Error(`Microsoft Edge was not found at '${edgeBinary}'.`);
}

if (!fs.existsSync(docsImageDir)) {
  fs.mkdirSync(docsImageDir, { recursive: true });
}

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "specforge-doc-screens-"));

const sharedPhases = [
  {
    phaseId: "capture",
    title: "Capture",
    order: 0,
    requiresApproval: false,
    expectsHumanIntervention: false,
    isApproved: true,
    isCurrent: false,
    state: "completed",
    artifactPath: "/tmp/specforge/capture.md",
    operationLogPath: null,
    executePromptPath: "/tmp/specforge/prompts/capture.execute.md",
    approvePromptPath: null
  },
  {
    phaseId: "clarification",
    title: "Clarification",
    order: 1,
    requiresApproval: false,
    expectsHumanIntervention: true,
    isApproved: true,
    isCurrent: false,
    state: "completed",
    artifactPath: "/tmp/specforge/clarification.md",
    operationLogPath: null,
    executePromptPath: "/tmp/specforge/prompts/clarification.execute.md",
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
    artifactPath: "/tmp/specforge/01-spec.md",
    operationLogPath: "/tmp/specforge/01-spec.ops.md",
    executePromptPath: "/tmp/specforge/prompts/refinement.execute.md",
    approvePromptPath: "/tmp/specforge/prompts/refinement.approve.md"
  },
  {
    phaseId: "technical-design",
    title: "Technical Design",
    order: 3,
    requiresApproval: false,
    expectsHumanIntervention: false,
    isApproved: false,
    isCurrent: false,
    state: "pending",
    artifactPath: "/tmp/specforge/02-technical-design.md",
    operationLogPath: null,
    executePromptPath: "/tmp/specforge/prompts/technical-design.execute.md",
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
    artifactPath: "/tmp/specforge/03-implementation.md",
    operationLogPath: null,
    executePromptPath: "/tmp/specforge/prompts/implementation.execute.md",
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
    artifactPath: "/tmp/specforge/04-review.md",
    operationLogPath: null,
    executePromptPath: "/tmp/specforge/prompts/review.execute.md",
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
    artifactPath: "/tmp/specforge/05-release-approval.md",
    operationLogPath: null,
    executePromptPath: "/tmp/specforge/prompts/release-approval.execute.md",
    approvePromptPath: "/tmp/specforge/prompts/release-approval.approve.md"
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
    artifactPath: "/tmp/specforge/06-pr-preparation.md",
    operationLogPath: null,
    executePromptPath: "/tmp/specforge/prompts/pr-preparation.execute.md",
    approvePromptPath: null
  }
];

const baseWorkflow = {
  usId: "US-1427",
  title: "Workflow detail that makes phase execution and checkpoints obvious",
  kind: "feature",
  category: "developer-experience",
  status: "waiting-user",
  currentPhase: "refinement",
  directoryPath: "/tmp/specforge/us.US-1427",
  workBranch: "feature/us-1427-workflow-visibility",
  mainArtifactPath: "/tmp/specforge/us.md",
  timelinePath: "/tmp/specforge/timeline.md",
  rawTimeline: "raw timeline fallback",
  phases: sharedPhases,
  controls: {
    canContinue: false,
    canApprove: true,
    requiresApproval: true,
    blockingReason: "refinement_pending_user_approval",
    canRestartFromSource: true,
    regressionTargets: ["clarification"],
    rewindTargets: ["clarification", "refinement"]
  },
  clarification: {
    status: "completed",
    tolerance: "balanced",
    reason: null,
    items: [
      {
        index: 1,
        question: "Which workflow surfaces must stay in sync?",
        answer: "Sidebar rails, graph cards, and phase detail badges."
      },
      {
        index: 2,
        question: "What should be obvious in the workflow view?",
        answer: "Current phase, waiting-user checkpoints, execution model, and next likely action."
      }
    ]
  },
  approvalQuestions: [
    {
      index: 1,
      question: "Should review stay on a dedicated stronger model profile?",
      status: "resolved",
      isResolved: true,
      answer: "Yes. Keep review on a separate profile with repository read access.",
      answeredBy: "jmr",
      answeredAtUtc: "2026-04-23T09:42:00Z"
    },
    {
      index: 2,
      question: "Do we force explicit branch acceptance before approving refinement?",
      status: "pending",
      isResolved: false,
      answer: null,
      answeredBy: null,
      answeredAtUtc: null
    }
  ],
  events: [
    {
      timestampUtc: "2026-04-23T08:12:00Z",
      code: "phase_completed",
      actor: "planner",
      phase: "capture",
      summary: "Captured the initial user story and persisted the baseline workflow files.",
      artifacts: ["/tmp/specforge/capture.md"],
      usage: {
        inputTokens: 542,
        outputTokens: 201,
        totalTokens: 743
      },
      durationMs: 4211,
      execution: {
        providerKind: "openai-compatible",
        model: "gpt-4.1-mini",
        profileName: "planner",
        baseUrl: "https://api.example.test/v1"
      }
    },
    {
      timestampUtc: "2026-04-23T08:19:00Z",
      code: "phase_completed",
      actor: "planner",
      phase: "clarification",
      summary: "Condensed scope questions and captured the answers needed before refinement.",
      artifacts: ["/tmp/specforge/clarification.md"],
      usage: {
        inputTokens: 891,
        outputTokens: 331,
        totalTokens: 1222
      },
      durationMs: 6880,
      execution: {
        providerKind: "openai-compatible",
        model: "gpt-4.1-mini",
        profileName: "planner",
        baseUrl: "https://api.example.test/v1"
      }
    },
    {
      timestampUtc: "2026-04-23T08:31:00Z",
      code: "phase_completed",
      actor: "planner",
      phase: "refinement",
      summary: "Produced the refinement baseline and surfaced one approval question for the operator.",
      artifacts: ["/tmp/specforge/01-spec.md"],
      usage: {
        inputTokens: 2301,
        outputTokens: 1656,
        totalTokens: 3957
      },
      durationMs: 20991,
      execution: {
        providerKind: "openai-compatible",
        model: "gpt-4.1-mini",
        profileName: "planner",
        baseUrl: "https://api.example.test/v1"
      }
    },
    {
      timestampUtc: "2026-04-23T08:36:00Z",
      code: "phase_operated",
      actor: "jmr",
      phase: "refinement",
      summary: "Requested a tighter visual narrative and stronger emphasis on execution metadata.",
      artifacts: ["/tmp/specforge/01-spec.v02.md"],
      usage: {
        inputTokens: 814,
        outputTokens: 287,
        totalTokens: 1101
      },
      durationMs: 9480,
      execution: {
        providerKind: "openai-compatible",
        model: "gpt-4.1-mini",
        profileName: "planner",
        baseUrl: "https://api.example.test/v1"
      }
    }
  ],
  contextFilesDirectoryPath: "/tmp/specforge/context",
  contextFiles: [
    {
      name: "src-vscode/workflowView.ts",
      path: "/tmp/specforge/context/src-vscode/workflowView.ts"
    },
    {
      name: "tests-ts/workflowView.test.ts",
      path: "/tmp/specforge/context/tests-ts/workflowView.test.ts"
    }
  ],
  attachmentsDirectoryPath: "/tmp/specforge/attachments",
  attachments: [
    {
      name: "vision-notes.md",
      path: "/tmp/specforge/attachments/vision-notes.md"
    },
    {
      name: "ui-reference.png",
      path: "/tmp/specforge/attachments/ui-reference.png"
    }
  ]
};

function standaloneHtml(html) {
  return html.replace(
    "<head>",
    `<head>
  <style>
    :root {
      --vscode-editor-foreground: #e7edf5;
      --vscode-font-family: "Avenir Next", "Segoe UI", sans-serif;
      --vscode-input-background: #101820;
      --vscode-input-foreground: #f4f7fb;
      --vscode-input-border: rgba(255,255,255,0.12);
    }
    body {
      overflow: hidden;
    }
  </style>
  <script>
    if (typeof window.acquireVsCodeApi !== "function") {
      window.acquireVsCodeApi = function () {
        let state = {};
        return {
          postMessage: function () {},
          getState: function () { return state; },
          setState: function (next) { state = next || {}; return state; }
        };
      };
    }
  </script>`
  );
}

function buildWorkflow(config) {
  return {
    workflow: JSON.parse(JSON.stringify(config.workflow)),
    state: JSON.parse(JSON.stringify(config.state)),
    playbackState: config.playbackState
  };
}

const screens = [
  {
    name: "workflow-overview",
    windowSize: "1680,1240",
    ...buildWorkflow({
      workflow: baseWorkflow,
      state: {
        selectedPhaseId: "refinement",
        selectedArtifactContent: `# Refinement Baseline

## Goal
Make the workflow view feel deliberate, premium, and operationally trustworthy.

## Acceptance Criteria
- The execution model is visible in the phase metrics.
- Waiting-user states are obvious from the graph and the detail panel.
- The operator can inspect iterations and operation logs without leaving the view.`,
        selectedOperationContent: `# Artifact Operation Log · refinement

## 2026-04-23T08:36:00Z · \`jmr\`

- Source Artifact: \`/tmp/specforge/01-spec.md\`
- Result Artifact: \`/tmp/specforge/01-spec.v02.md\`
- Prompt:
\`\`\`text
Reframe the workflow screen so model routing and approval checkpoints are explicit.
\`\`\``,
        contextSuggestions: [],
        settingsConfigured: true,
        settingsMessage: null,
        runtimeVersion: "runner 0.3.2",
        phaseModelAssignments: {
          defaultProfileName: "planner",
          implementationProfileName: "codex-main",
          reviewProfileName: "claude-review"
        },
        approvalBaseBranchProposal: "main",
        approvalWorkBranchProposal: "feature/us-1427-workflow-visibility",
        requireExplicitApprovalBranchAcceptance: true
      },
      playbackState: "idle"
    })
  },
  {
    name: "workflow-clarification-context",
    windowSize: "1680,1820",
    ...buildWorkflow({
      workflow: {
        ...baseWorkflow,
        status: "waiting-user",
        currentPhase: "clarification",
        phases: baseWorkflow.phases.map((phase) => ({
          ...phase,
          isCurrent: phase.phaseId === "clarification",
          state: phase.phaseId === "capture"
            ? "completed"
            : phase.phaseId === "clarification"
              ? "current"
              : "pending"
        })),
        controls: {
          ...baseWorkflow.controls,
          canContinue: false,
          canApprove: false,
          requiresApproval: false,
          blockingReason: "needs_clarification",
          regressionTargets: [],
          rewindTargets: ["capture", "clarification"]
        },
        clarification: {
          status: "pending",
          tolerance: "balanced",
          reason: "The workflow needs concrete repo context before it can produce a trustworthy refinement artifact.",
          items: [
            {
              index: 1,
              question: "Which exact card should display the execution model for the phase?",
              answer: null
            },
            {
              index: 2,
              question: "Should the doc show overview screenshots only or also detail screenshots?",
              answer: null
            }
          ]
        }
      },
      state: {
        selectedPhaseId: "clarification",
        selectedArtifactContent: `# Clarification

The workflow is blocked until the operator confirms where the model should surface in the refinement metrics and what screenshots belong in the documentation.`,
        contextSuggestions: [
          {
            path: "/tmp/specforge/context/src-vscode/workflowView.ts",
            relativePath: "src-vscode/workflowView.ts",
            reason: "Contains the token-summary card and the workflow detail composition.",
            score: 0.96,
            source: "heuristic"
          },
          {
            path: "/tmp/specforge/context/tests-ts/workflowView.test.ts",
            relativePath: "tests-ts/workflowView.test.ts",
            reason: "Locks the current workflow layout and can validate the screenshot-driving state.",
            score: 0.84,
            source: "neighborhood"
          }
        ],
        settingsConfigured: true,
        settingsMessage: null,
        runtimeVersion: "runner 0.3.2",
        phaseModelAssignments: {
          defaultProfileName: "planner",
          implementationProfileName: "codex-main",
          reviewProfileName: "claude-review"
        }
      },
      playbackState: "idle"
    })
  },
  {
    name: "workflow-playback-overlay",
    windowSize: "1680,1180",
    ...buildWorkflow({
      workflow: {
        ...baseWorkflow,
        status: "active",
        currentPhase: "capture",
        phases: baseWorkflow.phases.map((phase) => ({
          ...phase,
          isCurrent: phase.phaseId === "capture",
          state: phase.phaseId === "capture" ? "current" : "pending"
        })),
        controls: {
          ...baseWorkflow.controls,
          canContinue: true,
          canApprove: false,
          requiresApproval: false,
          blockingReason: null
        }
      },
      state: {
        selectedPhaseId: "capture",
        selectedArtifactContent: `# Capture

The workflow has started playback and is advancing into the next executable phase.`,
        contextSuggestions: [],
        settingsConfigured: true,
        settingsMessage: null,
        runtimeVersion: "runner 0.3.2",
        phaseModelAssignments: {
          defaultProfileName: "planner",
          implementationProfileName: "codex-main",
          reviewProfileName: "claude-review"
        },
        executionPhaseId: "clarification",
        completedPhaseIds: ["capture"],
        playbackStartedAtMs: 1763890200000
      },
      playbackState: "playing"
    })
  }
];

function renderScreenshot(screen) {
  const html = standaloneHtml(buildWorkflowHtml(screen.workflow, screen.state, screen.playbackState));
  const htmlPath = path.join(tempDir, `${screen.name}.html`);
  const pngPath = path.join(docsImageDir, `${screen.name}.png`);
  const edgeProfileDir = path.join(tempDir, `${screen.name}.edge-profile`);

  fs.writeFileSync(htmlPath, html, "utf8");
  fs.mkdirSync(edgeProfileDir, { recursive: true });

  const child = spawn(
    edgeBinary,
    [
      "--headless",
      "--disable-gpu",
      `--user-data-dir=${edgeProfileDir}`,
      "--hide-scrollbars",
      "--run-all-compositor-stages-before-draw",
      "--virtual-time-budget=2500",
      `--window-size=${screen.windowSize}`,
      `--screenshot=${pngPath}`,
      `file://${htmlPath}`
    ],
    {
      detached: true,
      stdio: "ignore"
    }
  );

  child.unref();
  waitForFile(pngPath, 30_000);

  try {
    process.kill(-child.pid, "SIGKILL");
  } catch {
    // Ignore cleanup failures once the screenshot has been written.
  }

  console.log(`wrote ${path.relative(repoRoot, pngPath)}`);
}

function waitForFile(filePath, timeoutMs) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (fs.existsSync(filePath) && fs.statSync(filePath).size > 0) {
      return;
    }

    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 200);
  }

  throw new Error(`Timed out waiting for screenshot '${filePath}'.`);
}

for (const screen of screens) {
  renderScreenshot(screen);
}
