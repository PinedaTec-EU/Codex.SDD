import test from "node:test";
import assert from "node:assert/strict";
import { buildSidebarHtml } from "../src-vscode/sidebarViewContent";

test("buildSidebarHtml shows a single prominent create action when there are no user stories", () => {
  const html = buildSidebarHtml({
    hasWorkspace: true,
    showCreateForm: false,
    promptsInitialized: false,
    categories: ["workflow", "ux"],
    userStories: []
  });

  assert.match(html, /Create your first user story/);
  assert.match(html, /Create User Story/);
  assert.match(html, /Initialize Repo Prompts/);
  assert.doesNotMatch(html, /Workflow backlog/);
  assert.doesNotMatch(html, /Open Prompt Templates/);
});

test("buildSidebarHtml renders the embedded creation form inside the sidebar", () => {
  const html = buildSidebarHtml({
    hasWorkspace: true,
    showCreateForm: true,
    promptsInitialized: false,
    categories: ["workflow", "ux"],
    userStories: []
  });

  assert.match(html, /Create from the sidebar/);
  assert.match(html, /create-user-story-form/);
  assert.match(html, /<textarea name="sourceText"/);
  assert.match(html, /<option value="workflow">workflow<\/option>/);
});

test("buildSidebarHtml exposes prompt templates when repo prompts are initialized", () => {
  const html = buildSidebarHtml({
    hasWorkspace: true,
    showCreateForm: false,
    promptsInitialized: true,
    categories: ["workflow"],
    userStories: [{
      usId: "US-0001",
      title: "Workflow graph",
      category: "workflow",
      currentPhase: "refinement",
      status: "waiting-user",
      mainArtifactPath: "/tmp/us.md",
      directoryPath: "/tmp/us.US-0001",
      workBranch: null
    }],
  });

  assert.match(html, /Repo prompts ready/);
  assert.match(html, /Open Prompt Templates/);
  assert.doesNotMatch(html, /Initialize Repo Prompts/);
});
