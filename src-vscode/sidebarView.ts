import * as fs from "node:fs";
import * as path from "node:path";
import * as vscode from "vscode";
import type { UserStorySummary } from "./backendClient";
import {
  getSpecForgeSettings,
  getSpecForgeSettingsStatus
} from "./extensionSettings";
import { DEFAULT_USER_STORY_CATEGORIES, nextUserStoryIdFromSummaries, parseYamlSequence } from "./explorerModel";
import { appendSpecForgeLog } from "./outputChannel";
import { getRepoPromptsStatusAsync } from "./repoPromptsStatus";
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
import { getEditorTypographyCssVars } from "./webviewTypography";

type SidebarMessage =
  | { readonly command: "showCreateForm" }
  | { readonly command: "hideCreateForm" }
  | { readonly command: "openExecutionSettings" }
  | { readonly command: "toggleViewMode" }
  | { readonly command: "initializeRepoPrompts" }
  | { readonly command: "openSettings" }
  | { readonly command: "openPromptTemplates" }
  | { readonly command: "openWorkflow"; readonly usId?: string }
  | { readonly command: "toggleStarredUserStory"; readonly usId?: string }
  | { readonly command: "resetUserStoryToCapture"; readonly usId?: string }
  | { readonly command: "deleteUserStory"; readonly usId?: string }
  | { readonly command: "analyzeRepairUserStory"; readonly usId?: string }
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
  private createFormResetToken = 0;

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
        this.createFiles = [];
        this.createFormResetToken += 1;
        await this.safeRenderAsync();
        return;
      case "hideCreateForm":
        this.showCreateForm = false;
        this.createFiles = [];
        await this.safeRenderAsync();
        return;
      case "openExecutionSettings":
        await vscode.commands.executeCommand("specForge.openExecutionSettings");
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
      case "resetUserStoryToCapture":
        if (!message.usId) {
          return;
        }

        await this.resetUserStoryToCaptureAsync(message.usId);
        return;
      case "analyzeRepairUserStory":
        if (!message.usId) {
          return;
        }

        await this.analyzeRepairUserStoryAsync(message.usId);
        return;
      case "toggleStarredUserStory":
        if (!message.usId) {
          return;
        }

        await this.toggleStarredUserStoryAsync(message.usId);
        return;
      case "initializeRepoPrompts":
        await this.runBusyActionAsync("Exporting prompt templates...", async () => {
          await this.initializeRepoPromptsFromSidebarAsync();
          await this.safeRenderAsync();
        });
        return;
      case "openPromptTemplates":
        await vscode.commands.executeCommand("specForge.openPromptTemplates");
        return;
      case "openSettings":
        await vscode.commands.executeCommand("specForge.openExecutionSettings");
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

  private async resetUserStoryToCaptureAsync(usId: string): Promise<void> {
    const workspaceRoot = getWorkspaceRoot();
    if (!workspaceRoot) {
      return;
    }

    const confirmation = await vscode.window.showWarningMessage(
      `Reset ${usId} to capture and delete all generated artifacts after the source?`,
      { modal: true },
      "Reset Workflow"
    );

    if (confirmation !== "Reset Workflow") {
      appendSpecForgeLog(`Sidebar reset to capture for '${usId}' was cancelled by the user.`);
      return;
    }

    await this.runBusyActionAsync(`Resetting ${usId} to capture...`, async () => {
      appendSpecForgeLog(`Sidebar reset to capture for '${usId}' confirmed by the user.`);
      const result = await getOrCreateBackendClient(workspaceRoot).resetUserStoryToCapture(usId);
      appendSpecForgeLog(
        `Workflow '${usId}' was reset to '${result.currentPhase}' with status '${result.status}' from sidebar.`
      );
      appendSpecForgeLog(
        `Workflow '${usId}' reset deleted paths: ${result.deletedPaths.length > 0 ? result.deletedPaths.join(", ") : "(none)"}.`
      );
      appendSpecForgeLog(
        `Workflow '${usId}' reset preserved paths: ${result.preservedPaths.length > 0 ? result.preservedPaths.join(", ") : "(none)"}.`
      );
      await this.onDidCreateUserStory();
      void vscode.window.showInformationMessage(`${usId} reset to capture.`);
    });
  }

  private async analyzeRepairUserStoryAsync(usId: string): Promise<void> {
    const workspaceRoot = getWorkspaceRoot();
    if (!workspaceRoot) {
      return;
    }

    let shouldOfferRepair = false;
    let candidateCount = 0;
    let targetPhase: string | null = null;
    await this.runBusyActionAsync("Analyzing user story lineage...", async () => {
      const analysis = await getOrCreateBackendClient(workspaceRoot).analyzeUserStoryLineage(usId);
      candidateCount = analysis.deprecatedCandidatePaths.length;
      targetPhase = analysis.recommendedTargetPhase;
      shouldOfferRepair = analysis.status === "inconsistent" && candidateCount > 0 && targetPhase !== null;
      appendSpecForgeLog(
        `Lineage analysis for '${usId}': status=${analysis.status}, findings=${analysis.findings.length}, deprecatedCandidates=${analysis.deprecatedCandidatePaths.length}.`
      );
      const firstFinding = analysis.findings[0];
      const message = analysis.status === "clean"
        ? `${usId} lineage is clean.`
        : `${usId} lineage is ${analysis.status}: ${firstFinding?.summary ?? "Review the SpecForge output for details."}`;
      if (analysis.status === "clean") {
        void vscode.window.showInformationMessage(message);
      } else if (!shouldOfferRepair) {
        void vscode.window.showWarningMessage(
          `${message} Candidate artifacts: ${analysis.deprecatedCandidatePaths.length}.`
        );
      }
    });

    if (!shouldOfferRepair || targetPhase === null) {
      return;
    }

    const repairLabel = "Repair";
    const selection = await vscode.window.showWarningMessage(
      `${usId} lineage is inconsistent. Repair will move ${candidateCount} generated artifact(s) to deprecated/ and return the workflow to ${targetPhase}.`,
      { modal: true },
      repairLabel
    );
    if (selection !== repairLabel) {
      appendSpecForgeLog(`Lineage repair for '${usId}' was cancelled by the user.`);
      return;
    }

    await this.runBusyActionAsync("Repairing user story lineage...", async () => {
      const repair = await getOrCreateBackendClient(workspaceRoot).repairUserStoryLineage(usId, getCurrentActor());
      appendSpecForgeLog(
        `Lineage repair for '${usId}': status=${repair.status}, currentPhase=${repair.currentPhase}, archived=${repair.archivedPaths.length}, archive='${repair.archiveDirectoryPath}'.`
      );
      await this.onDidCreateUserStory();
      void vscode.window.showInformationMessage(
        `${usId} repaired. Archived ${repair.archivedPaths.length} artifact(s) and returned to ${repair.currentPhase}.`
      );
    });
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

    const promptsStatus = await getRepoPromptsStatusAsync(workspaceRoot);
    if (!promptsStatus.initialized) {
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
        promptsMessage: null,
        settingsConfigured: settingsStatus.executionConfigured,
        settingsMessage: settingsStatus.message,
        starredUserStoryId: null,
        activeWorkflowUsId: this.activeWorkflowUsId,
        runtimeVersion,
        viewMode: this.viewMode,
        createFileMode: this.createFileMode,
        createFiles: this.createFiles,
        createFormResetToken: this.createFormResetToken,
        typographyCssVars: getEditorTypographyCssVars(),
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
    const promptsStatus = await getRepoPromptsStatusAsync(workspaceRoot);
    const settings = getSpecForgeSettings();
    const settingsStatus = getSpecForgeSettingsStatus(settings);
    if (!settingsStatus.executionConfigured) {
      appendSpecForgeLog(`Sidebar settings warning for '${workspaceRoot}': ${settingsStatus.message}. Diagnostics: ${settingsStatus.diagnostics}`);
    }
    if (!promptsStatus.initialized) {
      appendSpecForgeLog(`Sidebar prompt override warning for '${workspaceRoot}': ${promptsStatus.message ?? "prompt overrides not materialized"}. Checked: ${promptsStatus.checkedPaths.join(", ")}`);
    }
    const preferences = await readUserWorkspacePreferences(workspaceRoot);
    const runtimeVersion = await readRuntimeVersionAsync();
    this.webviewView.webview.html = buildSidebarHtml({
      hasWorkspace: true,
      showCreateForm: this.showCreateForm,
      busyMessage: this.busyMessage,
      promptsInitialized: promptsStatus.initialized,
      promptsMessage: promptsStatus.message,
      settingsConfigured: settingsStatus.executionConfigured,
      settingsMessage: settingsStatus.message,
      starredUserStoryId: preferences.starredUserStoryId,
      activeWorkflowUsId: this.activeWorkflowUsId,
      runtimeVersion,
      viewMode: this.viewMode,
      createFileMode: this.createFileMode,
      createFiles: this.createFiles,
      createFormResetToken: this.createFormResetToken,
      typographyCssVars: getEditorTypographyCssVars(),
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
        promptsMessage: null,
        settingsConfigured: false,
        settingsMessage: "SpecForge.AI settings could not be evaluated.",
        starredUserStoryId: null,
        activeWorkflowUsId: this.activeWorkflowUsId,
        runtimeVersion: await readRuntimeVersionAsync(),
        viewMode: this.viewMode,
        createFileMode: this.createFileMode,
        createFiles: this.createFiles,
        createFormResetToken: this.createFormResetToken,
        typographyCssVars: getEditorTypographyCssVars(),
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

async function openTextDocument(filePath: string): Promise<void> {
  const document = await vscode.workspace.openTextDocument(filePath);
  await vscode.window.showTextDocument(document, { preview: false });
}
