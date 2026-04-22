import * as vscode from "vscode";
import * as fs from "node:fs";
import { showUserStoryDetails } from "./detailsPanel";
import { activateExtension, deactivateExtension, type ExtensionActions, type ExtensionHost } from "./extensionRuntime";
import { getSpecForgeSettings } from "./extensionSettings";
import {
  appendSpecForgeDebugLog,
  appendSpecForgeLog,
  getSpecForgeOutputChannel,
  setSpecForgeDebugLoggingEnabled,
  showSpecForgeOutput
} from "./outputChannel";
import { readRuntimeVersionAsync } from "./runtimeVersion";
import { hasActiveWorkflowPlayback, notifyWorkflowFileChanged, openWorkflowView, refreshWorkflowViews } from "./workflowPanel";
import { SidebarViewProvider } from "./sidebarView";
import {
  approveCurrentPhase,
  continuePhase,
  configureBackendHostRoot,
  createUserStoryFromInput,
  disposeBackendClients,
  initializeRepoPrompts,
  importUserStoryFromMarkdown,
  getOrCreateBackendClient,
  resetBackendClient,
  openPromptTemplates,
  openMainArtifact,
  restartUserStoryFromSource,
  requestRegression,
  deleteUserStory
} from "./specsExplorer";
import { getUserWorkspacePreferencesPath, readUserWorkspacePreferences, setStarredUserStory } from "./userWorkspacePreferences";
import type { UserStorySummary } from "./backendClient";

let previousAttentionSnapshot = new Map<string, string>();

export function activate(context: vscode.ExtensionContext): void {
  configureBackendHostRoot(context.extensionUri.fsPath);
  setSpecForgeDebugLoggingEnabled(context.extensionMode === vscode.ExtensionMode.Development);
  context.subscriptions.push(getSpecForgeOutputChannel());
  void logActivationVersionAsync(context);
  appendSpecForgeDebugLog(`Extension activated in mode '${vscode.ExtensionMode[context.extensionMode]}'.`);
  const sidebarProvider = new SidebarViewProvider(context.extensionUri, async () => {
    await refreshWorkspaceUiAsync("sidebar:onDidCreateUserStory");
  });
  const refreshableProvider = { refresh: () => sidebarProvider.refresh() };
  activateExtension(context, createVsCodeHost(), refreshableProvider, createExtensionActions(refreshableProvider, sidebarProvider));
  const refreshWorkspaceUiAsync = async (reason: string) => {
    if (reason.startsWith("watcher:") && hasActiveWorkflowPlayback()) {
      appendSpecForgeDebugLog(`Skipping workspace UI refresh while workflow playback is active. reason='${reason}'.`);
      return;
    }

    appendSpecForgeDebugLog(`Refreshing workspace UI. reason='${reason}'.`);
    sidebarProvider.refresh();
    await refreshWorkflowViews(reason);
    await notifyAttentionChangesAsync();
  };

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider("specForge.userStories", sidebarProvider),
    createWorkspaceWatcher(refreshWorkspaceUiAsync),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (!event.affectsConfiguration("specForge")) {
        return;
      }

      const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (workspaceRoot) {
        resetBackendClient(workspaceRoot);
      }

      void refreshWorkspaceUiAsync("configurationChanged");
    })
  );

  void autoOpenStarredUserStoryAsync(sidebarProvider);
}

export function deactivate(): void {
  deactivateExtension({
    disposeBackendClients
  });
}

async function logActivationVersionAsync(context: vscode.ExtensionContext): Promise<void> {
  const manifestVersion = readManifestVersion(context);
  const runtimeVersion = await readRuntimeVersionAsync();
  appendSpecForgeLog(
    `Extension version manifest='${manifestVersion}' runtime='${runtimeVersion ?? "unknown"}'.`
  );
}

function createVsCodeHost(): ExtensionHost {
  return {
    registerTreeDataProvider: () => new vscode.Disposable(() => undefined),
    registerCommand: (command, callback) => vscode.commands.registerCommand(command, callback)
  };
}

function readManifestVersion(context: vscode.ExtensionContext): string {
  const rawVersion = context.extension.packageJSON?.version;
  return typeof rawVersion === "string" && rawVersion.trim().length > 0
    ? rawVersion.trim()
    : "unknown";
}

function createExtensionActions(explorerProvider: { refresh(): void }, sidebarProvider: SidebarViewProvider): ExtensionActions {
  return {
    createUserStoryFromInput,
    importUserStoryFromMarkdown,
    initializeRepoPrompts,
    openPromptTemplates,
    openWorkflowView: async (summary) => {
      const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!workspaceRoot || !summary || typeof summary !== "object" || !("usId" in summary)) {
        return;
      }

      await openWorkflowView(
        workspaceRoot,
        summary as UserStorySummary,
        () => getOrCreateBackendClient(workspaceRoot),
        {
          refreshExplorer: async () => {
            explorerProvider.refresh();
            await notifyAttentionChangesAsync();
          },
          setActiveWorkflowUsId: (usId) => {
            sidebarProvider.setActiveWorkflowUsId(usId);
          },
          notifyAttention: (message) => {
            if (getSpecForgeSettings().attentionNotificationsEnabled) {
              void vscode.window.showInformationMessage(message);
            }
          },
          stopBackend: (root) => {
            resetBackendClient(root);
          }
        }
      );
    },
    openMainArtifact,
    showUserStoryDetails,
    approveCurrentPhase,
    requestRegression,
    restartUserStoryFromSource,
    deleteUserStory,
    continuePhase,
    disposeBackendClients,
    showOutput: async () => {
      showSpecForgeOutput(false);
    }
  };
}

async function notifyAttentionChangesAsync(): Promise<void> {
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!workspaceRoot || !getSpecForgeSettings().attentionNotificationsEnabled) {
    return;
  }

  const summaries = await getOrCreateBackendClient(workspaceRoot).listUserStories();
  appendSpecForgeDebugLog(`notifyAttentionChangesAsync loaded ${summaries.length} user story summary item(s).`);
  const nextSnapshot = new Map<string, string>();

  for (const summary of summaries) {
    const fingerprint = `${summary.currentPhase}:${summary.status}`;
    nextSnapshot.set(summary.usId, fingerprint);
    if (previousAttentionSnapshot.get(summary.usId) === fingerprint) {
      continue;
    }

    if (summary.status === "waiting-user") {
      void vscode.window.showInformationMessage(`${summary.usId} is waiting for user attention at ${summary.currentPhase}.`);
    } else if (summary.status === "blocked") {
      void vscode.window.showWarningMessage(`${summary.usId} is blocked at ${summary.currentPhase}.`);
    } else if (summary.status === "completed") {
      void vscode.window.showInformationMessage(`${summary.usId} completed the workflow.`);
    }
  }

  previousAttentionSnapshot = nextSnapshot;
}

function createWorkspaceWatcher(onChange: (reason: string) => Promise<void>): vscode.Disposable {
  const disposables: vscode.Disposable[] = [];
  let debounceHandle: NodeJS.Timeout | undefined;

  const scheduleRefresh = (uri?: vscode.Uri) => {
    if (!getSpecForgeSettings().watcherEnabled) {
      appendSpecForgeDebugLog(`Watcher ignored change because watcher is disabled. path='${uri?.fsPath ?? "unknown"}'.`);
      return;
    }

    if (uri && /(?:^|[\\/])runtime\.yaml$/i.test(uri.fsPath)) {
      appendSpecForgeDebugLog(`Watcher ignored runtime heartbeat file. path='${uri.fsPath}'.`);
      return;
    }

    if (uri) {
      notifyWorkflowFileChanged(uri.fsPath);
    }

    appendSpecForgeDebugLog(`Watcher scheduled refresh. path='${uri?.fsPath ?? "unknown"}'.`);

    if (debounceHandle) {
      clearTimeout(debounceHandle);
    }

    debounceHandle = setTimeout(() => {
      void onChange(`watcher:${uri?.fsPath ?? "unknown"}`);
    }, 300);
  };

  const markdownWatcher = vscode.workspace.createFileSystemWatcher("**/.specs/us/**/*.md");
  const yamlWatcher = vscode.workspace.createFileSystemWatcher("**/.specs/us/**/*.yaml");

  for (const watcher of [markdownWatcher, yamlWatcher]) {
    watcher.onDidChange(scheduleRefresh, undefined, disposables);
    watcher.onDidCreate(scheduleRefresh, undefined, disposables);
    watcher.onDidDelete(scheduleRefresh, undefined, disposables);
    disposables.push(watcher);
  }

  return new vscode.Disposable(() => {
    if (debounceHandle) {
      clearTimeout(debounceHandle);
    }

    for (const disposable of disposables) {
      disposable.dispose();
    }
  });
}

async function autoOpenStarredUserStoryAsync(sidebarProvider: SidebarViewProvider): Promise<void> {
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!workspaceRoot) {
    return;
  }

  const preferences = await readUserWorkspacePreferences(workspaceRoot);
  if (!preferences.starredUserStoryId) {
    return;
  }

  try {
    const summary = await getOrCreateBackendClient(workspaceRoot).getUserStorySummary(preferences.starredUserStoryId);
    await openWorkflowView(
      workspaceRoot,
      summary,
      () => getOrCreateBackendClient(workspaceRoot),
      {
        refreshExplorer: async () => {
          await vscode.commands.executeCommand("specForge.refreshUserStories");
          await notifyAttentionChangesAsync();
        },
        setActiveWorkflowUsId: (usId) => {
          sidebarProvider.setActiveWorkflowUsId(usId);
        },
        notifyAttention: (message) => {
          if (getSpecForgeSettings().attentionNotificationsEnabled) {
            void vscode.window.showInformationMessage(message);
          }
        },
        stopBackend: (root) => {
          resetBackendClient(root);
        }
      }
    );
  } catch {
    await clearMissingStarredUserStoryAsync(workspaceRoot);
  }
}

async function clearMissingStarredUserStoryAsync(workspaceRoot: string): Promise<void> {
  await setStarredUserStory(workspaceRoot, null);
  try {
    await fs.promises.rm(getUserWorkspacePreferencesPath(workspaceRoot), { force: true });
  } catch {
    // Best effort cleanup only.
  }
}
