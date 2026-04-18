import test from "node:test";
import assert from "node:assert/strict";
import type { UserStorySummary } from "../src-vscode/backendClient";
import {
  groupUserStoriesByCategory,
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

test("groupUserStoriesByCategory normalizes categories and sorts categories and user stories", () => {
  const summaries: UserStorySummary[] = [
    { ...createSummary("US-0003"), category: " UX " },
    { ...createSummary("US-0002"), category: "" },
    { ...createSummary("US-0001"), category: "workflow" },
    { ...createSummary("US-0004"), category: "ux" }
  ];

  assert.deepEqual(groupUserStoriesByCategory(summaries), [
    {
      category: "uncategorized",
      summaries: [{ ...createSummary("US-0002"), category: "" }]
    },
    {
      category: "ux",
      summaries: [
        { ...createSummary("US-0003"), category: " UX " },
        { ...createSummary("US-0004"), category: "ux" }
      ]
    },
    {
      category: "workflow",
      summaries: [{ ...createSummary("US-0001"), category: "workflow" }]
    }
  ]);
});
