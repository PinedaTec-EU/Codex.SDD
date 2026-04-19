import test from "node:test";
import assert from "node:assert/strict";
import { buildSidebarHtml } from "../src-vscode/sidebarViewContent";

test("buildSidebarHtml shows the bootstrap block when prompts are missing before the first user story", () => {
  const html = buildSidebarHtml({
    hasWorkspace: true,
    showCreateForm: false,
    busyMessage: null,
    promptsInitialized: false,
    settingsConfigured: true,
    settingsMessage: null,
    categories: ["workflow", "ux"],
    userStories: []
  });

  assert.match(html, /Initialize prompts before the first user story/);
  assert.match(html, /Bootstrap Prompts/);
  assert.doesNotMatch(html, /aria-label="Initialize repo prompts"/);
  assert.doesNotMatch(html, /data-command="showCreateForm"/);
  assert.doesNotMatch(html, /Workflow backlog/);
});

test("buildSidebarHtml shows a single prominent create action when prompts are initialized and there are no user stories", () => {
  const html = buildSidebarHtml({
    hasWorkspace: true,
    showCreateForm: false,
    busyMessage: null,
    promptsInitialized: true,
    settingsConfigured: true,
    settingsMessage: null,
    categories: ["workflow", "ux"],
    userStories: []
  });

  assert.match(html, /Create your first user story/);
  assert.match(html, /Create User Story/);
  assert.doesNotMatch(html, /aria-label="Reinitialize repo prompts"/);
  assert.doesNotMatch(html, /aria-label="Create new user story"/);
  assert.doesNotMatch(html, /Workflow backlog/);
});

test("buildSidebarHtml renders the embedded creation form inside the sidebar", () => {
  const html = buildSidebarHtml({
    hasWorkspace: true,
    showCreateForm: true,
    busyMessage: null,
    promptsInitialized: true,
    settingsConfigured: true,
    settingsMessage: null,
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
    busyMessage: null,
    promptsInitialized: true,
    settingsConfigured: true,
    settingsMessage: null,
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
  assert.match(html, /aria-label="Create new user story"/);
  assert.doesNotMatch(html, /Repo prompts ready/);
  assert.doesNotMatch(html, /Open Prompt Templates/);
});

test("buildSidebarHtml uses compact actions instead of a separate create card when stories already exist", () => {
  const html = buildSidebarHtml({
    hasWorkspace: true,
    showCreateForm: false,
    busyMessage: null,
    promptsInitialized: true,
    settingsConfigured: true,
    settingsMessage: null,
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

  assert.match(html, /compact-actions/);
  assert.match(html, /aria-label="Create new user story"/);
  assert.match(html, /aria-label="Delete US-0001"/);
  assert.match(html, /story-card--active story-card--phase-refinement/);
  assert.match(html, /story-card__phase-number">3</);
  assert.doesNotMatch(html, /Start another user story/);
  assert.doesNotMatch(html, /Keep the backlog focused on active work/);
});

test("buildSidebarHtml keeps the phase rail for user stories that are still in progress", () => {
  const html = buildSidebarHtml({
    hasWorkspace: true,
    showCreateForm: false,
    busyMessage: null,
    promptsInitialized: true,
    settingsConfigured: true,
    settingsMessage: null,
    categories: ["workflow"],
    userStories: [{
      usId: "US-0002",
      title: "Waiting story",
      category: "workflow",
      currentPhase: "technical-design",
      status: "waiting-user",
      mainArtifactPath: "/tmp/us.md",
      directoryPath: "/tmp/us.US-0002",
      workBranch: null
    }],
  });

  assert.match(html, /story-card--active story-card--phase-technical-design/);
  assert.match(html, /<span class="story-card__phase-number">4<\/span>/);
});

test("buildSidebarHtml hides the phase rail for completed user stories", () => {
  const html = buildSidebarHtml({
    hasWorkspace: true,
    showCreateForm: false,
    busyMessage: null,
    promptsInitialized: true,
    settingsConfigured: true,
    settingsMessage: null,
    categories: ["workflow"],
    userStories: [{
      usId: "US-0003",
      title: "Completed story",
      category: "workflow",
      currentPhase: "pr-preparation",
      status: "completed",
      mainArtifactPath: "/tmp/us.md",
      directoryPath: "/tmp/us.US-0003",
      workBranch: null
    }],
  });

  assert.doesNotMatch(html, /<button class="story-card story-card--active/);
  assert.doesNotMatch(html, /<span class="story-card__phase-number">/);
});

test("buildSidebarHtml shows a bootstrap block above the backlog when prompts are missing", () => {
  const html = buildSidebarHtml({
    hasWorkspace: true,
    showCreateForm: false,
    busyMessage: null,
    promptsInitialized: false,
    settingsConfigured: true,
    settingsMessage: null,
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

  assert.match(html, /Initialize missing repo prompts/);
  assert.match(html, /Bootstrap Prompts/);
  assert.match(html, /aria-label="Initialize repo prompts before creating a user story"/);
});

test("buildSidebarHtml exposes a visible settings warning when execution is not configured", () => {
  const html = buildSidebarHtml({
    hasWorkspace: true,
    showCreateForm: false,
    busyMessage: null,
    promptsInitialized: false,
    settingsConfigured: false,
    settingsMessage: "SpecForge.AI is not configured for the current provider. Missing base URL, API key, model.",
    categories: [],
    userStories: []
  });

  assert.match(html, /Configuration Required/);
  assert.match(html, /SpecForge\.AI settings are incomplete/);
  assert.match(html, /Configure Settings/);
  assert.match(html, /⚠/);
});

test("buildSidebarHtml surfaces the model warning when the deterministic fallback is active", () => {
  const html = buildSidebarHtml({
    hasWorkspace: true,
    showCreateForm: false,
    busyMessage: null,
    promptsInitialized: false,
    settingsConfigured: false,
    settingsMessage: "SpecForge.AI needs an SLM/LLM execution provider before workflow stages can run. Select an OpenAI-compatible provider and configure base URL, API key, and model.",
    categories: [],
    userStories: [{
      usId: "US-0001",
      title: "Workflow graph",
      category: "workflow",
      currentPhase: "capture",
      status: "active",
      mainArtifactPath: "/tmp/us.md",
      directoryPath: "/tmp/us.US-0001",
      workBranch: null
    }]
  });

  assert.match(html, /SLM\/LLM execution provider/);
  assert.match(html, /Configure Settings/);
});

test("buildSidebarHtml shows a busy indicator and disables actions while a sidebar operation is running", () => {
  const html = buildSidebarHtml({
    hasWorkspace: true,
    showCreateForm: false,
    busyMessage: "Bootstrapping repo prompts...",
    promptsInitialized: false,
    settingsConfigured: true,
    settingsMessage: null,
    categories: ["workflow"],
    userStories: []
  });

  assert.match(html, /Working/);
  assert.match(html, /Bootstrapping repo prompts\.\.\./);
  assert.match(html, /const busy = true/);
});
