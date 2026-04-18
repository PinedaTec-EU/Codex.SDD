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
  assert.match(html, /SpecForge\.AI/);
  assert.match(html, /Create User Story/);
  assert.match(html, /aria-label="Initialize repo prompts"/);
  assert.doesNotMatch(html, /Workflow backlog/);
  assert.doesNotMatch(html, /Repo prompts ready/);
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

test("buildSidebarHtml exposes a compact prompt reset action when repo prompts are initialized", () => {
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

  assert.match(html, /aria-label="Reinitialize repo prompts"/);
  assert.doesNotMatch(html, /Repo prompts ready/);
  assert.doesNotMatch(html, /Open Prompt Templates/);
});

test("buildSidebarHtml wraps the create action in its own card when stories already exist", () => {
  const html = buildSidebarHtml({
    hasWorkspace: true,
    showCreateForm: false,
    promptsInitialized: false,
    categories: ["workflow"],
    userStories: [{
      usId: "US-0001",
      title: "Workflow graph",
      category: "workflow",
      currentPhase: "refinement",
      status: "active",
      mainArtifactPath: "/tmp/us.md",
      directoryPath: "/tmp/us.US-0001",
      workBranch: null
    }],
  });

  assert.match(html, /Start another user story/);
  assert.match(html, /Keep the backlog focused on active work/);
  assert.doesNotMatch(html, /compact-actions/);
});
