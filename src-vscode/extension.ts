import * as vscode from "vscode";
import { showUserStoryDetails } from "./detailsPanel";
import { activateExtension, deactivateExtension, type ExtensionActions, type ExtensionHost } from "./extensionRuntime";
import { getSpecForgeSettings } from "./extensionSettings";
import { openWorkflowView, refreshWorkflowViews } from "./workflowPanel";
import { SidebarViewProvider } from "./sidebarView";
import {
  approveCurrentPhase,
  continuePhase,
  createUserStoryFromInput,
  disposeBackendClients,
  initializeRepoPrompts,
  importUserStoryFromMarkdown,
  getOrCreateBackendClient,
  resetBackendClient,
  openPromptTemplates,
  openMainArtifact,
  restartUserStoryFromSource,
  requestRegression
} from "./specsExplorer";

let previousAttentionSnapshot = new Map<string, string>();

export function activate(context: vscode.ExtensionContext): void {
  const sidebarProvider = new SidebarViewProvider(context.extensionUri, async () => {
    await refreshWorkspaceUiAsync();
  });
  const refreshableProvider = { refresh: () => sidebarProvider.refresh() };
  activateExtension(context, createVsCodeHost(), refreshableProvider, createExtensionActions(refreshableProvider));
  const refreshWorkspaceUiAsync = async () => {
    sidebarProvider.refresh();
    await refreshWorkflowViews();
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

      sidebarProvider.refresh();
    })
  );
}

export function deactivate(): void {
  deactivateExtension({
    disposeBackendClients
  });
}

function createVsCodeHost(): ExtensionHost {
  return {
    registerTreeDataProvider: () => new vscode.Disposable(() => undefined),
    registerCommand: (command, callback) => vscode.commands.registerCommand(command, callback)
  };
}

function createExtensionActions(explorerProvider: { refresh(): void }): ExtensionActions {
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
        summary as any,
        () => getOrCreateBackendClient(workspaceRoot),
        {
          refreshExplorer: async () => {
            explorerProvider.refresh();
            await notifyAttentionChangesAsync();
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
    continuePhase,
    disposeBackendClients
  };
}

async function notifyAttentionChangesAsync(): Promise<void> {
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!workspaceRoot || !getSpecForgeSettings().attentionNotificationsEnabled) {
    return;
  }

  const summaries = await getOrCreateBackendClient(workspaceRoot).listUserStories();
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

function createWorkspaceWatcher(onChange: () => Promise<void>): vscode.Disposable {
  const disposables: vscode.Disposable[] = [];
  let debounceHandle: NodeJS.Timeout | undefined;

  const scheduleRefresh = () => {
    if (!getSpecForgeSettings().watcherEnabled) {
      return;
    }

    if (debounceHandle) {
      clearTimeout(debounceHandle);
    }

    debounceHandle = setTimeout(() => {
      void onChange();
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
