import * as fs from "node:fs";
import * as path from "node:path";
import * as vscode from "vscode";
import type { UserStorySummary } from "./backendClient";
import { getSpecForgeSettings, getSpecForgeSettingsStatus } from "./extensionSettings";
import { DEFAULT_USER_STORY_CATEGORIES, nextUserStoryIdFromSummaries, parseYamlSequence } from "./explorerModel";
import { getOrCreateBackendClient } from "./specsExplorer";
import { buildSidebarHtml } from "./sidebarViewContent";
import { readUserWorkspacePreferences, setStarredUserStory } from "./userWorkspacePreferences";

type SidebarMessage =
  | { readonly command: "showCreateForm" }
  | { readonly command: "hideCreateForm" }
  | { readonly command: "initializeRepoPrompts" }
  | { readonly command: "openSettings" }
  | { readonly command: "openPromptTemplates" }
  | { readonly command: "openWorkflow"; readonly usId?: string }
  | { readonly command: "toggleStarredUserStory"; readonly usId?: string }
  | { readonly command: "deleteUserStory"; readonly usId?: string }
  | { readonly command: "submitCreateForm"; readonly title?: string; readonly kind?: string; readonly category?: string; readonly sourceText?: string };

export class SidebarViewProvider implements vscode.WebviewViewProvider {
  private webviewView: vscode.WebviewView | undefined;
  private showCreateForm = false;
  private busyMessage: string | null = null;

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

    return this.safeRenderAsync();
  }

  private async handleMessageAsync(message: SidebarMessage): Promise<void> {
    if (this.busyMessage) {
      return;
    }

    switch (message.command) {
      case "showCreateForm":
        this.showCreateForm = true;
        await this.safeRenderAsync();
        return;
      case "hideCreateForm":
        this.showCreateForm = false;
        await this.safeRenderAsync();
        return;
      case "openWorkflow":
        if (!message.usId) {
          return;
        }

        await this.openWorkflowAsync(message.usId);
        return;
      case "deleteUserStory":
        if (!message.usId) {
          return;
        }

        await this.deleteUserStoryAsync(message.usId);
        return;
      case "toggleStarredUserStory":
        if (!message.usId) {
          return;
        }

        await this.toggleStarredUserStoryAsync(message.usId);
        return;
      case "initializeRepoPrompts":
        await this.runBusyActionAsync("Bootstrapping repo prompts...", async () => {
          await this.initializeRepoPromptsFromSidebarAsync();
          await this.safeRenderAsync();
        });
        return;
      case "openPromptTemplates":
        await vscode.commands.executeCommand("specForge.openPromptTemplates");
        return;
      case "openSettings":
        await openSpecForgeSettingsAsync();
        return;
      case "submitCreateForm":
        await this.runBusyActionAsync("Creating user story...", async () => {
          await this.submitCreateFormAsync(message);
        });
        return;
    }
  }

  private async runBusyActionAsync(message: string, action: () => Promise<void>): Promise<void> {
    this.busyMessage = message;
    await this.safeRenderAsync();

    try {
      await action();
    } finally {
      this.busyMessage = null;
      await this.safeRenderAsync();
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

  private async deleteUserStoryAsync(usId: string): Promise<void> {
    const workspaceRoot = getWorkspaceRoot();
    if (!workspaceRoot) {
      return;
    }

    const summary = await getOrCreateBackendClient(workspaceRoot).getUserStorySummary(usId);
    await vscode.commands.executeCommand("specForge.deleteUserStory", summary);
    const preferences = await readUserWorkspacePreferences(workspaceRoot);
    if (preferences.starredUserStoryId === usId) {
      await setStarredUserStory(workspaceRoot, null);
    }
    await this.onDidCreateUserStory();
  }

  private async toggleStarredUserStoryAsync(usId: string): Promise<void> {
    const workspaceRoot = getWorkspaceRoot();
    if (!workspaceRoot) {
      return;
    }

    const preferences = await readUserWorkspacePreferences(workspaceRoot);
    const nextStarredUserStoryId = preferences.starredUserStoryId === usId ? null : usId;
    await setStarredUserStory(workspaceRoot, nextStarredUserStoryId);
    await this.safeRenderAsync();
  }

  private async initializeRepoPromptsFromSidebarAsync(): Promise<void> {
    const workspaceRoot = getWorkspaceRoot();
    if (!workspaceRoot) {
      return;
    }

    const promptsInitialized = await hasInitializedRepoPromptsAsync(workspaceRoot);
    if (!promptsInitialized) {
      await vscode.commands.executeCommand("specForge.initializeRepoPrompts", false);
      return;
    }

    const confirmLabel = "Overwrite Prompts";
    const selection = await vscode.window.showWarningMessage(
      "Repo prompts are already initialized. Overwriting them will discard any local prompt edits.",
      { modal: true },
      confirmLabel
    );

    if (selection !== confirmLabel) {
      return;
    }

    await vscode.commands.executeCommand("specForge.initializeRepoPrompts", true);
  }

  private async renderAsync(): Promise<void> {
    if (!this.webviewView) {
      return;
    }

    const workspaceRoot = getWorkspaceRoot();
    if (!workspaceRoot) {
      const settingsStatus = getSpecForgeSettingsStatus(getSpecForgeSettings());
      this.webviewView.webview.html = buildSidebarHtml({
        hasWorkspace: false,
        showCreateForm: false,
        busyMessage: this.busyMessage,
        promptsInitialized: false,
        settingsConfigured: settingsStatus.executionConfigured,
        settingsMessage: settingsStatus.message,
        starredUserStoryId: null,
        categories: [],
        userStories: []
      });
      return;
    }

    const hasPersistedStories = await hasPersistedUserStoriesAsync(workspaceRoot);
    const userStories = hasPersistedStories
      ? await getOrCreateBackendClient(workspaceRoot).listUserStories()
      : [];
    const categories = await getUserStoryCategoriesAsync(workspaceRoot);
    const promptsInitialized = await hasInitializedRepoPromptsAsync(workspaceRoot);
    const settingsStatus = getSpecForgeSettingsStatus(getSpecForgeSettings());
    const preferences = await readUserWorkspacePreferences(workspaceRoot);
    this.webviewView.webview.html = buildSidebarHtml({
      hasWorkspace: true,
      showCreateForm: this.showCreateForm,
      busyMessage: this.busyMessage,
      promptsInitialized,
      settingsConfigured: settingsStatus.executionConfigured,
      settingsMessage: settingsStatus.message,
      starredUserStoryId: preferences.starredUserStoryId,
      categories,
      userStories
    });
  }

  private async safeRenderAsync(): Promise<void> {
    try {
      await this.renderAsync();
    } catch (error) {
      if (!this.webviewView) {
        return;
      }

      this.webviewView.webview.html = buildSidebarHtml({
        hasWorkspace: true,
        showCreateForm: false,
        busyMessage: this.busyMessage,
        promptsInitialized: false,
        settingsConfigured: false,
        settingsMessage: "SpecForge.AI settings could not be evaluated.",
        starredUserStoryId: null,
        categories: [],
        userStories: []
      });
      void vscode.window.showErrorMessage(`SpecForge sidebar failed to load: ${asErrorMessage(error)}`);
    }
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

async function hasPersistedUserStoriesAsync(workspaceRoot: string): Promise<boolean> {
  const storiesRoot = path.join(workspaceRoot, ".specs", "us");
  if (!await pathExistsAsync(storiesRoot)) {
    return false;
  }

  const entries = await fs.promises.readdir(storiesRoot, { withFileTypes: true });
  return entries.some((entry) => entry.isDirectory() && entry.name.startsWith("us."));
}

async function hasInitializedRepoPromptsAsync(workspaceRoot: string): Promise<boolean> {
  const configPath = path.join(workspaceRoot, ".specs", "config.yaml");
  const promptsPath = path.join(workspaceRoot, ".specs", "prompts", "prompts.yaml");
  return await pathExistsAsync(configPath) && await pathExistsAsync(promptsPath);
}

async function openTextDocument(filePath: string): Promise<void> {
  const document = await vscode.workspace.openTextDocument(filePath);
  await vscode.window.showTextDocument(document, { preview: false });
}

function asErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return "Unknown sidebar error.";
}

async function openSpecForgeSettingsAsync(): Promise<void> {
  await vscode.commands.executeCommand("workbench.action.openSettings", "@ext:local.specforge-ai specForge");
}
