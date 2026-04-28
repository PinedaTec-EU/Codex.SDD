import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  getUserWorkspacePreferencesPath,
  readUserWorkspacePreferences,
  setPausedWorkflowPhaseIds,
  setStarredUserStory,
  setUserWorkspaceUiPreferences,
  setWorkflowGraphLayoutMode
} from "../src-vscode/userWorkspacePreferences";

test("user workspace preferences persist a starred user story per local user", async () => {
  const workspaceRoot = await fs.promises.mkdtemp(path.join(os.tmpdir(), "specforge-prefs-"));

  await setStarredUserStory(workspaceRoot, "US-0042");
  const preferences = await readUserWorkspacePreferences(workspaceRoot);

  assert.equal(preferences.starredUserStoryId, "US-0042");
  assert.match(getUserWorkspacePreferencesPath(workspaceRoot), /\.specs\/users\/.+\/vscode-preferences\.json$/);
});

test("user workspace preferences clear the starred user story when unset", async () => {
  const workspaceRoot = await fs.promises.mkdtemp(path.join(os.tmpdir(), "specforge-prefs-"));

  await setStarredUserStory(workspaceRoot, "US-0007");
  await setStarredUserStory(workspaceRoot, null);
  const preferences = await readUserWorkspacePreferences(workspaceRoot);

  assert.equal(preferences.starredUserStoryId, null);
});

test("user workspace preferences persist paused workflow phase ids per user story", async () => {
  const workspaceRoot = await fs.promises.mkdtemp(path.join(os.tmpdir(), "specforge-prefs-"));

  await setPausedWorkflowPhaseIds(workspaceRoot, "US-0042", ["implementation", "review", "implementation"]);
  const preferences = await readUserWorkspacePreferences(workspaceRoot);

  assert.deepEqual(preferences.pausedWorkflowPhaseIdsByUsId["US-0042"], ["implementation", "review"]);
});

test("user workspace preferences persist user-only workflow UX flags", async () => {
  const workspaceRoot = await fs.promises.mkdtemp(path.join(os.tmpdir(), "specforge-prefs-"));

  await setUserWorkspaceUiPreferences(workspaceRoot, {
    watcherEnabled: false,
    attentionNotificationsEnabled: false,
    contextSuggestionsEnabled: false,
    workflowGraphLayoutMode: "horizontal"
  });
  const preferences = await readUserWorkspacePreferences(workspaceRoot);

  assert.equal(preferences.watcherEnabled, false);
  assert.equal(preferences.attentionNotificationsEnabled, false);
  assert.equal(preferences.contextSuggestionsEnabled, false);
  assert.equal(preferences.workflowGraphLayoutMode, "horizontal");
});

test("user workspace preferences fall back to legacy workspace settings when user flags are absent", async () => {
  const workspaceRoot = await fs.promises.mkdtemp(path.join(os.tmpdir(), "specforge-prefs-"));

  await setStarredUserStory(workspaceRoot, "US-0008");
  const preferences = await readUserWorkspacePreferences(workspaceRoot, {
    watcherEnabled: false,
    attentionNotificationsEnabled: false,
    contextSuggestionsEnabled: false
  });

  assert.equal(preferences.starredUserStoryId, "US-0008");
  assert.equal(preferences.watcherEnabled, false);
  assert.equal(preferences.attentionNotificationsEnabled, false);
  assert.equal(preferences.contextSuggestionsEnabled, false);
  assert.equal(preferences.workflowGraphLayoutMode, "vertical");
});

test("user workspace preferences persist graph layout mode independently", async () => {
  const workspaceRoot = await fs.promises.mkdtemp(path.join(os.tmpdir(), "specforge-prefs-"));

  await setWorkflowGraphLayoutMode(workspaceRoot, "horizontal");
  const preferences = await readUserWorkspacePreferences(workspaceRoot);

  assert.equal(preferences.workflowGraphLayoutMode, "horizontal");
});
