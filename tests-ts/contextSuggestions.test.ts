import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { suggestContextFiles } from "../src-vscode/contextSuggestions";
import type { UserStoryWorkflowDetails } from "../src-vscode/backendClient";

test("suggestContextFiles mixes heuristic matches with repo neighbors", async () => {
  const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "specforge-context-suggest-"));
  try {
    await fs.mkdir(path.join(workspaceRoot, "src/SpecForge.Domain/Application"), { recursive: true });
    await fs.mkdir(path.join(workspaceRoot, "tests/SpecForge.Domain.Tests/Application"), { recursive: true });
    await fs.mkdir(path.join(workspaceRoot, "doc"), { recursive: true });
    await fs.mkdir(path.join(workspaceRoot, ".specs"), { recursive: true });

    await fs.writeFile(path.join(workspaceRoot, "src/SpecForge.Domain/Application/WorkflowRunner.cs"), "// source");
    await fs.writeFile(path.join(workspaceRoot, "src/SpecForge.Domain/Application/TelemetrySnapshot.cs"), "// neighbor");
    await fs.writeFile(path.join(workspaceRoot, "tests/SpecForge.Domain.Tests/Application/WorkflowRunnerTests.cs"), "// tests");
    await fs.writeFile(path.join(workspaceRoot, "doc/workflow-canonico-fase-1.md"), "# workflow");
    await fs.writeFile(path.join(workspaceRoot, ".specs/ignored.md"), "ignored");

    const suggestions = await suggestContextFiles(workspaceRoot, buildWorkflow(), `
      Add tests for the workflow runner and explain the affected execution flow.
    `);

    assert.ok(suggestions.some((item) => item.relativePath === "tests/SpecForge.Domain.Tests/Application/WorkflowRunnerTests.cs"));
    assert.ok(suggestions.some((item) => item.relativePath === "src/SpecForge.Domain/Application/WorkflowRunner.cs"));
    assert.ok(suggestions.some((item) => item.source === "neighborhood"));
    assert.ok(suggestions.every((item) => !item.relativePath.startsWith(".specs/")));
  } finally {
    await fs.rm(workspaceRoot, { recursive: true, force: true });
  }
});

function buildWorkflow(): UserStoryWorkflowDetails {
  return {
    usId: "US-0001",
    title: "Add workflow runner tests",
    category: "tests",
    status: "waiting-user",
    currentPhase: "clarification",
    directoryPath: "/tmp/us.US-0001",
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
    clarification: {
      status: "needs_clarification",
      tolerance: "balanced",
      reason: "The repo area affected by the tests is unclear.",
      items: [
        {
          index: 1,
          question: "Which repository area should the tests target?",
          answer: null
        }
      ]
    },
    events: [],
    contextFilesDirectoryPath: "/tmp/context",
    contextFiles: [],
    attachmentsDirectoryPath: "/tmp/attachments",
    attachments: []
  };
}
