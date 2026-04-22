import * as fs from "node:fs";
import * as path from "node:path";
import * as vscode from "vscode";
import type { UserStorySummary } from "./backendClient";
import { getSpecForgeSettings, getSpecForgeSettingsStatus } from "./extensionSettings";
import { DEFAULT_USER_STORY_CATEGORIES, nextUserStoryIdFromSummaries, parseYamlSequence } from "./explorerModel";
import { appendSpecForgeLog } from "./outputChannel";
import { readRuntimeVersionAsync } from "./runtimeVersion";
import { getOrCreateBackendClient } from "./specsExplorer";
import { buildSidebarHtml } from "./sidebarViewContent";
import { findReferencedWorkspaceFilesAsync, type ReferencedWorkspaceFile } from "./sourceFileReferences";
import { getCurrentActor } from "./userActor";
import {
  buildWizardSourceText,
  getWizardMissingFields,
  type CreateIntakeMode,
  type UserStoryWizardDraft
} from "./userStoryIntake";
import { readUserWorkspacePreferences, setStarredUserStory } from "./userWorkspacePreferences";
import { asErrorMessage, getNextAttachmentPathAsync } from "./utils";

type SidebarMessage =
  | { readonly command: "showCreateForm" }
  | { readonly command: "hideCreateForm" }
  | { readonly command: "toggleViewMode" }
  | { readonly command: "initializeRepoPrompts" }
  | { readonly command: "openSettings" }
  | { readonly command: "openPromptTemplates" }
  | { readonly command: "openWorkflow"; readonly usId?: string }
  | { readonly command: "toggleStarredUserStory"; readonly usId?: string }
  | { readonly command: "deleteUserStory"; readonly usId?: string }
  | { readonly command: "setCreateFileMode"; readonly kind?: string }
  | { readonly command: "addCreateFiles"; readonly kind?: string }
  | { readonly command: "addCreateFilePaths"; readonly kind?: string; readonly paths?: readonly string[] }
  | { readonly command: "loadCreateSourceFromFile" }
  | { readonly command: "scanCreateSourceReferences"; readonly sourceText?: string }
  | { readonly command: "setCreateFileKind"; readonly sourcePath?: string; readonly kind?: string }
  | { readonly command: "removeCreateFile"; readonly sourcePath?: string }
  | {
    readonly command: "submitCreateForm";
    readonly title?: string;
    readonly kind?: string;
    readonly category?: string;
    readonly intakeMode?: CreateIntakeMode;
    readonly sourceText?: string;
    readonly wizardDraft?: Partial<UserStoryWizardDraft>;
  };

type DraftCreateFile = {
  readonly sourcePath: string;
  readonly name: string;
  readonly kind: "context" | "attachment";
};

export class SidebarViewProvider implements vscode.WebviewViewProvider {
  private webviewView: vscode.WebviewView | undefined;
  private showCreateForm = false;
  private busyMessage: string | null = null;
  private viewMode: "category" | "phase" = "category";
  private activeWorkflowUsId: string | null = null;
  private createFileMode: "context" | "attachment" = "context";
  private createFiles: DraftCreateFile[] = [];
  private createReferenceScanVersion = 0;

  public constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly onDidCreateUserStory: () => Promise<void>
  ) {}

  public refresh(): void {
    void this.renderAsync();
  }

  public setActiveWorkflowUsId(usId: string | null): void {
    if (this.activeWorkflowUsId === usId) {
      return;
    }

    this.activeWorkflowUsId = usId;
    void this.safeRenderAsync();
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
        this.createFileMode = "context";
        await this.safeRenderAsync();
        return;
      case "hideCreateForm":
        this.showCreateForm = false;
        await this.safeRenderAsync();
        return;
      case "toggleViewMode":
        this.viewMode = this.viewMode === "category" ? "phase" : "category";
        await this.safeRenderAsync();
        return;
      case "setCreateFileMode":
        this.createFileMode = message.kind === "attachment" ? "attachment" : "context";
        await this.safeRenderAsync();
        return;
      case "addCreateFiles":
        await this.addCreateFilesAsync(message.kind === "attachment" ? "attachment" : "context");
        return;
      case "addCreateFilePaths":
        await this.addCreateFilePathsAsync(
          message.kind === "attachment" ? "attachment" : "context",
          message.paths ?? []);
        return;
      case "loadCreateSourceFromFile":
        await this.loadCreateSourceFromFileAsync();
        return;
      case "scanCreateSourceReferences":
        await this.scanCreateSourceReferencesAsync(message.sourceText ?? "");
        return;
      case "setCreateFileKind":
        if (!message.sourcePath) {
          return;
        }

        this.createFiles = this.createFiles.map((file) =>
          file.sourcePath === message.sourcePath
            ? { ...file, kind: message.kind === "attachment" ? "attachment" : "context" }
            : file);
        await this.safeRenderAsync();
        return;
      case "removeCreateFile":
        if (!message.sourcePath) {
          return;
        }

        this.createFiles = this.createFiles.filter((file) => file.sourcePath !== message.sourcePath);
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
    const intakeMode: CreateIntakeMode = message.intakeMode === "wizard" ? "wizard" : "freeform";
    const sourceText = intakeMode === "wizard"
      ? buildWizardSourceText(message.wizardDraft).trim()
      : message.sourceText?.trim();

    if (intakeMode === "wizard") {
      const missingFields = getWizardMissingFields(message.wizardDraft);
      if (missingFields.length > 0) {
        void vscode.window.showWarningMessage(
          `The guided wizard still needs ${missingFields.join(", ")}.`
        );
        return;
      }
    }

    if (!title || !kind || !category || !sourceText) {
      void vscode.window.showWarningMessage("Title, kind, category, and source are required.");
      return;
    }

    const backendClient = getOrCreateBackendClient(workspaceRoot);
    const summaries = await backendClient.listUserStories();
    const usId = nextUserStoryIdFromSummaries(summaries);
    const result = await backendClient.createUserStory(usId, title, kind, category, sourceText, getCurrentActor());
    await this.materializeCreateFilesAsync(result.rootDirectory);
    this.showCreateForm = false;
    this.createFiles = [];
    this.createFileMode = "context";
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

  private async addCreateFilesAsync(kind: "context" | "attachment"): Promise<void> {
    const selection = await vscode.window.showOpenDialog({
      canSelectFiles: true,
      canSelectFolders: false,
      canSelectMany: true,
      openLabel: kind === "context" ? "Add context files" : "Add user story files"
    });

    if (!selection || selection.length === 0) {
      return;
    }

    const nextFiles = new Map(this.createFiles.map((file) => [file.sourcePath, file]));
    for (const source of selection) {
      nextFiles.set(source.fsPath, {
        sourcePath: source.fsPath,
        name: path.basename(source.fsPath),
        kind
      });
    }

    this.createFiles = [...nextFiles.values()].sort((left, right) => left.name.localeCompare(right.name));
    await this.safeRenderAsync();
  }

  private async addCreateFilePathsAsync(kind: "context" | "attachment", paths: readonly string[]): Promise<void> {
    const normalizedPaths = paths
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);

    if (normalizedPaths.length === 0) {
      return;
    }

    const nextFiles = new Map(this.createFiles.map((file) => [file.sourcePath, file]));
    for (const sourcePath of normalizedPaths) {
      nextFiles.set(sourcePath, {
        sourcePath,
        name: path.basename(sourcePath),
        kind
      });
    }

    this.createFiles = [...nextFiles.values()].sort((left, right) => left.name.localeCompare(right.name));
    await this.safeRenderAsync();
  }

  private async loadCreateSourceFromFileAsync(): Promise<void> {
    const selection = await vscode.window.showOpenDialog({
      canSelectFiles: true,
      canSelectFolders: false,
      canSelectMany: false,
      openLabel: "Load user story source"
    });

    const sourceUri = selection?.[0];
    if (!sourceUri || !this.webviewView) {
      return;
    }

    const sourceText = await fs.promises.readFile(sourceUri.fsPath, "utf8");
    const firstHeading = sourceText.split(/\r?\n/).find((line) => /^#\s+/.test(line)) ?? "";
    const suggestedTitle = firstHeading.replace(/^#\s+/, "").trim();
    await this.webviewView.webview.postMessage({
      command: "loadedCreateSourceFile",
      sourceText,
      suggestedTitle,
      sourcePath: sourceUri.fsPath
    });
  }

  private async scanCreateSourceReferencesAsync(sourceText: string): Promise<void> {
    if (!this.webviewView) {
      return;
    }

    const workspaceRoot = getWorkspaceRoot();
    const scanVersion = ++this.createReferenceScanVersion;
    if (!workspaceRoot || sourceText.trim().length === 0) {
      await this.webviewView.webview.postMessage({
        command: "updateCreateSourceReferences",
        files: []
      });
      return;
    }

    const files = await findReferencedWorkspaceFilesAsync(
      workspaceRoot,
      sourceText,
      this.createFiles.map((file) => file.sourcePath)
    );

    if (scanVersion !== this.createReferenceScanVersion) {
      return;
    }

    await this.webviewView.webview.postMessage({
      command: "updateCreateSourceReferences",
      files: files.map((file) => serializeReferencedFile(file))
    });
  }

  private async materializeCreateFilesAsync(userStoryDirectoryPath: string): Promise<void> {
    for (const file of this.createFiles) {
      const targetDirectoryPath = path.join(userStoryDirectoryPath, file.kind === "context" ? "context" : "attachments");
      await fs.promises.mkdir(targetDirectoryPath, { recursive: true });
      const targetPath = await getNextAttachmentPathAsync(targetDirectoryPath, file.name);
      await fs.promises.copyFile(file.sourcePath, targetPath);
    }
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
      const runtimeVersion = await readRuntimeVersionAsync();
      this.webviewView.webview.html = buildSidebarHtml({
        hasWorkspace: false,
        showCreateForm: false,
        busyMessage: this.busyMessage,
        promptsInitialized: false,
        settingsConfigured: settingsStatus.executionConfigured,
        settingsMessage: settingsStatus.message,
        starredUserStoryId: null,
        activeWorkflowUsId: this.activeWorkflowUsId,
        runtimeVersion,
        viewMode: this.viewMode,
        createFileMode: this.createFileMode,
        createFiles: this.createFiles,
        categories: [],
        userStories: []
      });
      return;
    }

    const hasPersistedStories = await hasPersistedUserStoriesAsync(workspaceRoot);
    appendSpecForgeLog(`Sidebar persisted user story probe for '${workspaceRoot}': ${hasPersistedStories}.`);
    const userStories = hasPersistedStories
      ? await getOrCreateBackendClient(workspaceRoot).listUserStories()
      : [];
    const categories = await getUserStoryCategoriesAsync(workspaceRoot);
    const promptsInitialized = await hasInitializedRepoPromptsAsync(workspaceRoot);
    const settingsStatus = getSpecForgeSettingsStatus(getSpecForgeSettings());
    const preferences = await readUserWorkspacePreferences(workspaceRoot);
    const runtimeVersion = await readRuntimeVersionAsync();
    this.webviewView.webview.html = buildSidebarHtml({
      hasWorkspace: true,
      showCreateForm: this.showCreateForm,
      busyMessage: this.busyMessage,
      promptsInitialized,
      settingsConfigured: settingsStatus.executionConfigured,
      settingsMessage: settingsStatus.message,
      starredUserStoryId: preferences.starredUserStoryId,
      activeWorkflowUsId: this.activeWorkflowUsId,
      runtimeVersion,
      viewMode: this.viewMode,
      createFileMode: this.createFileMode,
      createFiles: this.createFiles,
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
        activeWorkflowUsId: this.activeWorkflowUsId,
        runtimeVersion: await readRuntimeVersionAsync(),
        viewMode: this.viewMode,
        createFileMode: this.createFileMode,
        createFiles: this.createFiles,
        categories: [],
        userStories: []
      });
      void vscode.window.showErrorMessage(`SpecForge sidebar failed to load: ${asErrorMessage(error)}`);
    }
  }
}

function serializeReferencedFile(file: ReferencedWorkspaceFile): ReferencedWorkspaceFile {
  return {
    sourcePath: file.sourcePath,
    workspaceRelativePath: file.workspaceRelativePath,
    name: file.name
  };
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

  const categoryEntries = await fs.promises.readdir(storiesRoot, { withFileTypes: true });
  for (const categoryEntry of categoryEntries) {
    if (!categoryEntry.isDirectory()) {
      continue;
    }

    const categoryPath = path.join(storiesRoot, categoryEntry.name);
    const userStoryEntries = await fs.promises.readdir(categoryPath, { withFileTypes: true });
    if (userStoryEntries.some((entry) => entry.isDirectory() && /^US-\d+$/i.test(entry.name))) {
      return true;
    }
  }

  return false;
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

async function openSpecForgeSettingsAsync(): Promise<void> {
  await vscode.commands.executeCommand("workbench.action.openSettings", "@ext:local.specforge-ai specForge");
}
