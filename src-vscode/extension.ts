import * as vscode from "vscode";
import { showUserStoryDetails } from "./detailsPanel";
import {
  SpecsExplorerProvider,
  approveCurrentPhase,
  continuePhase,
  createUserStoryFromInput,
  disposeBackendClients,
  initializeRepoPrompts,
  importUserStoryFromMarkdown,
  openMainArtifact
} from "./specsExplorer";

export function activate(context: vscode.ExtensionContext): void {
  const explorerProvider = new SpecsExplorerProvider();

  context.subscriptions.push(
    vscode.window.registerTreeDataProvider("specForge.userStories", explorerProvider),
    vscode.commands.registerCommand("specForge.refreshUserStories", () => {
      explorerProvider.refresh();
    }),
    vscode.commands.registerCommand("specForge.createUserStory", async () => {
      await createUserStoryFromInput();
      explorerProvider.refresh();
    }),
    vscode.commands.registerCommand("specForge.importUserStory", async () => {
      await importUserStoryFromMarkdown();
      explorerProvider.refresh();
    }),
    vscode.commands.registerCommand("specForge.initializeRepoPrompts", async () => {
      await initializeRepoPrompts();
      explorerProvider.refresh();
    }),
    vscode.commands.registerCommand("specForge.openMainArtifact", async (summary) => {
      await openMainArtifact(summary);
    }),
    vscode.commands.registerCommand("specForge.showUserStoryDetails", async (summary) => {
      await showUserStoryDetails(summary);
    }),
    vscode.commands.registerCommand("specForge.approveCurrentPhase", async (summary) => {
      await approveCurrentPhase(summary);
      explorerProvider.refresh();
    }),
    vscode.commands.registerCommand("specForge.continuePhase", async (summary) => {
      await continuePhase(summary);
      explorerProvider.refresh();
    })
  );
}

export function deactivate(): void {
  disposeBackendClients();
}
