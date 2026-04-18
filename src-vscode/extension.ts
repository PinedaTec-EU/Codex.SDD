import * as vscode from "vscode";
import { showUserStoryDetails } from "./detailsPanel";
import { activateExtension, deactivateExtension, type ExtensionActions, type ExtensionHost } from "./extensionRuntime";
import { openWorkflowView } from "./workflowPanel";
import {
  SpecsExplorerProvider,
  approveCurrentPhase,
  continuePhase,
  createUserStoryFromInput,
  disposeBackendClients,
  initializeRepoPrompts,
  importUserStoryFromMarkdown,
  getOrCreateBackendClient,
  openPromptTemplates,
  openMainArtifact,
  restartUserStoryFromSource,
  requestRegression
} from "./specsExplorer";

export function activate(context: vscode.ExtensionContext): void {
  const explorerProvider = new SpecsExplorerProvider();
  activateExtension(context, createVsCodeHost(), explorerProvider, createExtensionActions());
}

export function deactivate(): void {
  deactivateExtension(createExtensionActions());
}

function createVsCodeHost(): ExtensionHost {
  return {
    registerTreeDataProvider: (viewId, provider) => vscode.window.registerTreeDataProvider(
      viewId,
      provider as unknown as vscode.TreeDataProvider<unknown>
    ),
    registerCommand: (command, callback) => vscode.commands.registerCommand(command, callback)
  };
}

function createExtensionActions(): ExtensionActions {
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

      await openWorkflowView(workspaceRoot, summary as any, getOrCreateBackendClient(workspaceRoot));
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
