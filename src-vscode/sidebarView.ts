import * as fs from "node:fs";
import * as path from "node:path";
import * as vscode from "vscode";
import type { UserStorySummary } from "./backendClient";
import { DEFAULT_USER_STORY_CATEGORIES, nextUserStoryIdFromSummaries, parseYamlSequence } from "./explorerModel";
import { getOrCreateBackendClient } from "./specsExplorer";
import { buildSidebarHtml } from "./sidebarViewContent";

type SidebarMessage =
  | { readonly command: "showCreateForm" }
  | { readonly command: "hideCreateForm" }
  | { readonly command: "openWorkflow"; readonly usId?: string }
  | { readonly command: "submitCreateForm"; readonly title?: string; readonly kind?: string; readonly category?: string; readonly sourceText?: string };

export class SidebarViewProvider implements vscode.WebviewViewProvider {
  private webviewView: vscode.WebviewView | undefined;
  private showCreateForm = false;

  public constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly onDidCreateUserStory: () => Promise<void>
  ) {}

  public refresh(): void {
    void this.renderAsync();
  }

  public resolveWebviewView(webviewView: vscode.WebviewView): void | Thenable<void> {
    this.webviewView = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionUri]
    };

    webviewView.webview.onDidReceiveMessage(async (message: SidebarMessage) => {
      await this.handleMessageAsync(message);
    });

    return this.renderAsync();
  }

  private async handleMessageAsync(message: SidebarMessage): Promise<void> {
    switch (message.command) {
      case "showCreateForm":
        this.showCreateForm = true;
        await this.renderAsync();
        return;
      case "hideCreateForm":
        this.showCreateForm = false;
        await this.renderAsync();
        return;
      case "openWorkflow":
        if (!message.usId) {
          return;
        }

        await this.openWorkflowAsync(message.usId);
        return;
      case "submitCreateForm":
        await this.submitCreateFormAsync(message);
        return;
    }
  }

  private async submitCreateFormAsync(message: Extract<SidebarMessage, { command: "submitCreateForm" }>): Promise<void> {
    const workspaceRoot = getWorkspaceRoot();
    if (!workspaceRoot) {
      void vscode.window.showWarningMessage("Open a workspace folder before creating a user story.");
      return;
    }

    const title = message.title?.trim();
    const kind = message.kind?.trim();
    const category = message.category?.trim();
    const sourceText = message.sourceText?.trim();

    if (!title || !kind || !category || !sourceText) {
      void vscode.window.showWarningMessage("Title, kind, category, and source are required.");
      return;
    }

    const backendClient = getOrCreateBackendClient(workspaceRoot);
    const summaries = await backendClient.listUserStories();
    const usId = nextUserStoryIdFromSummaries(summaries);
    const result = await backendClient.createUserStory(usId, title, kind, category, sourceText);
    this.showCreateForm = false;
    await this.onDidCreateUserStory();
    const createdSummary: UserStorySummary = await backendClient.getUserStorySummary(usId);
    await vscode.commands.executeCommand("specForge.openWorkflowView", createdSummary);
    await openTextDocument(result.mainArtifactPath);
  }

  private async openWorkflowAsync(usId: string): Promise<void> {
    const workspaceRoot = getWorkspaceRoot();
    if (!workspaceRoot) {
      return;
    }

    const summary = await getOrCreateBackendClient(workspaceRoot).getUserStorySummary(usId);
    await vscode.commands.executeCommand("specForge.openWorkflowView", summary);
  }

  private async renderAsync(): Promise<void> {
    if (!this.webviewView) {
      return;
    }

    const workspaceRoot = getWorkspaceRoot();
    if (!workspaceRoot) {
      this.webviewView.webview.html = buildSidebarHtml({
        hasWorkspace: false,
        showCreateForm: false,
        categories: [],
        userStories: []
      });
      return;
    }

    const backendClient = getOrCreateBackendClient(workspaceRoot);
    const userStories = await backendClient.listUserStories();
    const categories = await getUserStoryCategoriesAsync(workspaceRoot);
    this.webviewView.webview.html = buildSidebarHtml({
      hasWorkspace: true,
      showCreateForm: this.showCreateForm,
      categories,
      userStories
    });
  }
}

async function getUserStoryCategoriesAsync(workspaceRoot: string): Promise<readonly string[]> {
  const configPath = path.join(workspaceRoot, ".specs", "config.yaml");
  if (!await pathExistsAsync(configPath)) {
    return DEFAULT_USER_STORY_CATEGORIES;
  }

  const yaml = await fs.promises.readFile(configPath, "utf8");
  const categories = parseYamlSequence(yaml, "categories");
  return categories.length === 0 ? DEFAULT_USER_STORY_CATEGORIES : categories;
}

function getWorkspaceRoot(): string | undefined {
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}

async function pathExistsAsync(filePath: string): Promise<boolean> {
  try {
    await fs.promises.access(filePath, fs.constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function openTextDocument(filePath: string): Promise<void> {
  const document = await vscode.workspace.openTextDocument(filePath);
  await vscode.window.showTextDocument(document, { preview: false });
}
