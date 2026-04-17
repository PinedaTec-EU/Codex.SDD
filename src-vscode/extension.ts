import * as vscode from "vscode";
import {
  SpecsExplorerProvider,
  continuePhase,
  createUserStoryFromInput,
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
    vscode.commands.registerCommand("specForge.openMainArtifact", async (summary) => {
      await openMainArtifact(summary);
    }),
    vscode.commands.registerCommand("specForge.continuePhase", async (summary) => {
      await continuePhase(summary);
      explorerProvider.refresh();
    })
  );
}

export function deactivate(): void {
  // No-op.
}
