import test from "node:test";
import assert from "node:assert/strict";
import type { UserStorySummary } from "../src-vscode/backendClient";
import {
  nextUserStoryIdFromSummaries,
  normalizeCategory,
  parseYamlSequence
} from "../src-vscode/explorerModel";

function createSummary(usId: string): UserStorySummary {
  return {
    usId,
    title: usId,
    category: "workflow",
    directoryPath: `/tmp/${usId}`,
    mainArtifactPath: `/tmp/${usId}/us.md`,
    currentPhase: "capture",
    status: "draft",
    workBranch: null
  };
}

test("normalizeCategory trims, lowercases, and falls back to uncategorized", () => {
  assert.equal(normalizeCategory("  UX "), "ux");
  assert.equal(normalizeCategory(""), "uncategorized");
  assert.equal(normalizeCategory(undefined), "uncategorized");
});

test("parseYamlSequence extracts unique normalized values from a yaml section", () => {
  const yaml = [
    "provider: deterministic",
    "categories:",
    "  - Workflow",
    "  - ux",
    "  - workflow",
    "",
    "prompts:",
    "  version: 1"
  ].join("\n");

  assert.deepEqual(parseYamlSequence(yaml, "categories"), ["ux", "workflow"]);
});

test("nextUserStoryIdFromSummaries increments the highest numeric id", () => {
  const summaries = [
    createSummary("US-0007"),
    createSummary("US-0012"),
    createSummary("INVALID")
  ];

  assert.equal(nextUserStoryIdFromSummaries(summaries), "US-0013");
});
