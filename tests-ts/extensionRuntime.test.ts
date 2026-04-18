import test from "node:test";
import assert from "node:assert/strict";
import {
  activateExtension,
  deactivateExtension,
  type DisposableLike,
  type ExplorerProviderLike,
  type ExtensionActions,
  type ExtensionContextLike,
  type ExtensionHost
} from "../src-vscode/extensionRuntime";

function createDisposable(): DisposableLike {
  return {
    dispose() {
      return undefined;
    }
  };
}

function createHarness() {
  const registeredCommands = new Map<string, (...args: unknown[]) => unknown>();
  const actionCalls: string[] = [];
  let refreshCount = 0;
  let registeredViewId: string | null = null;

  const context: ExtensionContextLike = {
    subscriptions: []
  };

  const explorerProvider: ExplorerProviderLike = {
    refresh() {
      refreshCount += 1;
    }
  };

  const host: ExtensionHost = {
    registerTreeDataProvider(viewId) {
      registeredViewId = viewId;
      return createDisposable();
    },
    registerCommand(command, callback) {
      registeredCommands.set(command, callback);
      return createDisposable();
    }
  };

  const actions: ExtensionActions = {
    async createUserStoryFromInput() {
      actionCalls.push("createUserStoryFromInput");
    },
    async importUserStoryFromMarkdown() {
      actionCalls.push("importUserStoryFromMarkdown");
    },
    async initializeRepoPrompts() {
      actionCalls.push("initializeRepoPrompts");
    },
    async openPromptTemplates() {
      actionCalls.push("openPromptTemplates");
    },
    async openWorkflowView(summary) {
      actionCalls.push(`openWorkflowView:${String(summary)}`);
    },
    async openMainArtifact(summary) {
      actionCalls.push(`openMainArtifact:${String(summary)}`);
    },
    async showUserStoryDetails(summary) {
      actionCalls.push(`showUserStoryDetails:${String(summary)}`);
    },
    async approveCurrentPhase(summary) {
      actionCalls.push(`approveCurrentPhase:${String(summary)}`);
    },
    async requestRegression(summary) {
      actionCalls.push(`requestRegression:${String(summary)}`);
    },
    async restartUserStoryFromSource(summary) {
      actionCalls.push(`restartUserStoryFromSource:${String(summary)}`);
    },
    async continuePhase(summary) {
      actionCalls.push(`continuePhase:${String(summary)}`);
    },
    disposeBackendClients() {
      actionCalls.push("disposeBackendClients");
    }
  };

  return {
    context,
    explorerProvider,
    host,
    actions,
    actionCalls,
    registeredCommands,
    getRefreshCount: () => refreshCount,
    getRegisteredViewId: () => registeredViewId
  };
}

test("activateExtension registers the tree provider and all expected commands", () => {
  const harness = createHarness();

  activateExtension(harness.context, harness.host, harness.explorerProvider, harness.actions);

  assert.equal(harness.getRegisteredViewId(), "specForge.userStories");
  assert.deepEqual([...harness.registeredCommands.keys()].sort((left, right) => left.localeCompare(right)), [
    "specForge.approveCurrentPhase",
    "specForge.continuePhase",
    "specForge.createUserStory",
    "specForge.importUserStory",
    "specForge.initializeRepoPrompts",
    "specForge.openMainArtifact",
    "specForge.openPromptTemplates",
    "specForge.openWorkflowView",
    "specForge.refreshUserStories",
    "specForge.requestRegression",
    "specForge.restartUserStoryFromSource",
    "specForge.showUserStoryDetails"
  ]);
  assert.equal(harness.context.subscriptions.length, 13);
});

test("mutating commands refresh the explorer after the action completes", async () => {
  const harness = createHarness();
  activateExtension(harness.context, harness.host, harness.explorerProvider, harness.actions);

  await harness.registeredCommands.get("specForge.createUserStory")?.();
  await harness.registeredCommands.get("specForge.importUserStory")?.();
  await harness.registeredCommands.get("specForge.initializeRepoPrompts")?.();
  await harness.registeredCommands.get("specForge.approveCurrentPhase")?.("US-0001");
  await harness.registeredCommands.get("specForge.requestRegression")?.("US-0001");
  await harness.registeredCommands.get("specForge.restartUserStoryFromSource")?.("US-0001");
  await harness.registeredCommands.get("specForge.continuePhase")?.("US-0001");

  assert.deepEqual(harness.actionCalls, [
    "createUserStoryFromInput",
    "importUserStoryFromMarkdown",
    "initializeRepoPrompts",
    "approveCurrentPhase:US-0001",
    "requestRegression:US-0001",
    "restartUserStoryFromSource:US-0001",
    "continuePhase:US-0001"
  ]);
  assert.equal(harness.getRefreshCount(), 7);
});

test("read-only commands do not refresh and forward the provided summary", async () => {
  const harness = createHarness();
  activateExtension(harness.context, harness.host, harness.explorerProvider, harness.actions);

  await harness.registeredCommands.get("specForge.openPromptTemplates")?.();
  await harness.registeredCommands.get("specForge.openWorkflowView")?.("US-0001");
  await harness.registeredCommands.get("specForge.openMainArtifact")?.("US-0002");
  await harness.registeredCommands.get("specForge.showUserStoryDetails")?.("US-0003");
  await harness.registeredCommands.get("specForge.refreshUserStories")?.();

  assert.deepEqual(harness.actionCalls, [
    "openPromptTemplates",
    "openWorkflowView:US-0001",
    "openMainArtifact:US-0002",
    "showUserStoryDetails:US-0003"
  ]);
  assert.equal(harness.getRefreshCount(), 1);
});

test("deactivateExtension disposes backend clients", () => {
  const harness = createHarness();

  deactivateExtension(harness.actions);

  assert.deepEqual(harness.actionCalls, ["disposeBackendClients"]);
});
