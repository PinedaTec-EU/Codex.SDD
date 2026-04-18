import * as fs from "node:fs";
import * as path from "node:path";
import * as vscode from "vscode";
import {
  createMcpBackendClient,
  type SpecForgeBackendClient,
  type UserStorySummary
} from "./backendClient";
import { getSpecForgeSettings } from "./extensionSettings";
import {
  compareUserStories,
  DEFAULT_USER_STORY_CATEGORIES,
  groupUserStoriesByCategory,
  nextUserStoryIdFromSummaries,
  normalizeCategory,
  parseYamlSequence
} from "./explorerModel";

export type UserStoryTreeItemKind = "userStory" | "userStoryCategory" | "repoPromptSetup" | "repoPromptTemplates";
const backendClients = new Map<string, SpecForgeBackendClient>();
const REGRESSION_TARGETS: Record<string, readonly string[]> = {
  review: ["implementation", "technical-design", "refinement"],
  "release-approval": ["implementation", "technical-design", "refinement"]
};
const USER_STORY_KINDS = ["feature", "bug", "hotfix"] as const;
let backendHostRoot: string | undefined;

export function configureBackendHostRoot(hostRoot: string): void {
  backendHostRoot = hostRoot;
}
export class UserStoryTreeItem extends vscode.TreeItem {
  public readonly contextValue: UserStoryTreeItemKind = "userStory";

  public constructor(public readonly summary: UserStorySummary) {
    super(summary.usId, vscode.TreeItemCollapsibleState.None);
    this.description = `${summary.currentPhase} · ${summary.status}`;
    this.tooltip = summary.title;
    this.command = {
      command: "specForge.openWorkflowView",
      title: "Open Workflow View",
      arguments: [summary]
    };
  }
}

class UserStoryCategoryTreeItem extends vscode.TreeItem {
  public readonly contextValue: UserStoryTreeItemKind = "userStoryCategory";

  public constructor(public readonly category: string, count: number) {
    super(category, vscode.TreeItemCollapsibleState.Expanded);
    this.description = `${count} US`;
    this.tooltip = `User stories in category ${category}`;
    this.iconPath = new vscode.ThemeIcon("folder-library");
  }
}

class RepoPromptSetupTreeItem extends vscode.TreeItem {
  public readonly contextValue: UserStoryTreeItemKind = "repoPromptSetup";

  public constructor() {
    super("Repo Prompts Not Initialized", vscode.TreeItemCollapsibleState.None);
    this.description = "required for real providers";
    this.tooltip = "Initialize .specs/config.yaml and .specs/prompts/ for provider-backed phase execution.";
    this.iconPath = new vscode.ThemeIcon("warning");
    this.command = {
      command: "specForge.initializeRepoPrompts",
      title: "Initialize Repo Prompts"
    };
  }
}

class RepoPromptTemplatesTreeItem extends vscode.TreeItem {
  public readonly contextValue: UserStoryTreeItemKind = "repoPromptTemplates";

  public constructor() {
    super("Open Prompt Templates", vscode.TreeItemCollapsibleState.None);
    this.description = ".specs/prompts/";
    this.tooltip = "Open the repo prompt manifest and templates.";
    this.iconPath = new vscode.ThemeIcon("book");
    this.command = {
      command: "specForge.openPromptTemplates",
      title: "Open Prompt Templates"
    };
  }
}

export class SpecsExplorerProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
  private readonly onDidChangeTreeDataEmitter = new vscode.EventEmitter<vscode.TreeItem | undefined>();

  public readonly onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event;

  public refresh(): void {
    this.onDidChangeTreeDataEmitter.fire(undefined);
  }

  public getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
    return element;
  }

  public async getChildren(element?: vscode.TreeItem): Promise<vscode.TreeItem[]> {
    const workspaceRoot = getWorkspaceRoot();
    if (!workspaceRoot) {
      return [];
    }

    const summaries = await getBackendClient(workspaceRoot).listUserStories();
    if (element instanceof UserStoryCategoryTreeItem) {
      return summaries
        .filter((summary) => normalizeCategory(summary.category) === element.category)
        .sort(compareUserStories)
        .map((summary) => new UserStoryTreeItem(summary));
    }

    if (element instanceof UserStoryTreeItem) {
      return [];
    }

    const items: vscode.TreeItem[] = [];
    if (await hasInitializedRepoPromptsAsync(workspaceRoot)) {
      items.push(new RepoPromptTemplatesTreeItem());
    } else {
      items.push(new RepoPromptSetupTreeItem());
    }

    for (const group of groupUserStoriesByCategory(summaries)) {
      items.push(new UserStoryCategoryTreeItem(group.category, group.summaries.length));
    }

    return items;
  }
}

export async function createUserStoryFromInput(): Promise<void> {
  const workspaceRoot = getWorkspaceRoot();
  if (!workspaceRoot) {
    void vscode.window.showWarningMessage("Open a workspace folder before creating a user story.");
    return;
  }

  const title = await vscode.window.showInputBox({
    prompt: "User story title",
    ignoreFocusOut: true,
    validateInput: (value) => value.trim().length > 0 ? undefined : "Title is required."
  });

  if (!title) {
    return;
  }

  const kind = await pickUserStoryKind();
  if (!kind) {
    return;
  }

  const category = await pickUserStoryCategory(workspaceRoot);
  if (!category) {
    return;
  }

  const sourceText = await vscode.window.showInputBox({
    prompt: "User story objective or initial source text",
    ignoreFocusOut: true,
    validateInput: (value) => value.trim().length > 0 ? undefined : "Source text is required."
  });

  if (!sourceText) {
    return;
  }

  const usId = await nextUserStoryId(workspaceRoot);
  const result = await getBackendClient(workspaceRoot).createUserStory(usId, title, kind, category, sourceText);

  await openTextDocument(result.mainArtifactPath);
}

export async function importUserStoryFromMarkdown(): Promise<void> {
  const workspaceRoot = getWorkspaceRoot();
  if (!workspaceRoot) {
    void vscode.window.showWarningMessage("Open a workspace folder before importing a user story.");
    return;
  }

  const selection = await vscode.window.showOpenDialog({
    canSelectFiles: true,
    canSelectFolders: false,
    canSelectMany: false,
    openLabel: "Import user story markdown",
    filters: {
      Markdown: ["md"]
    }
  });

  const sourceUri = selection?.[0];
  if (!sourceUri) {
    return;
  }

  const sourceText = await fs.promises.readFile(sourceUri.fsPath, "utf8");
  const firstHeading = sourceText.split(/\r?\n/).find((line) => line.startsWith("# ")) ?? "# Imported user story";
  const title = firstHeading.replace(/^#\s+/, "").trim();
  const kind = await pickUserStoryKind();
  if (!kind) {
    return;
  }
  const category = await pickUserStoryCategory(workspaceRoot);
  if (!category) {
    return;
  }
  const usId = await nextUserStoryId(workspaceRoot);
  const result = await getBackendClient(workspaceRoot).importUserStory(usId, sourceUri.fsPath, title, kind, category);

  await openTextDocument(result.mainArtifactPath);
}

export async function initializeRepoPrompts(): Promise<void> {
  const workspaceRoot = getWorkspaceRoot();
  if (!workspaceRoot) {
    void vscode.window.showWarningMessage("Open a workspace folder before initializing repo prompts.");
    return;
  }

  try {
    const result = await getBackendClient(workspaceRoot).initializeRepoPrompts(false);
    const createdCount = result.createdFiles.length;
    const skippedCount = result.skippedFiles.length;
    void vscode.window.showInformationMessage(
      `Repo prompts initialized. Created ${createdCount} files and skipped ${skippedCount}.`
    );
  } catch (error) {
    void vscode.window.showErrorMessage(asErrorMessage(error));
  }
}

export async function openPromptTemplates(): Promise<void> {
  const workspaceRoot = getWorkspaceRoot();
  if (!workspaceRoot) {
    void vscode.window.showWarningMessage("Open a workspace folder before opening prompt templates.");
    return;
  }

  const manifestPath = path.join(workspaceRoot, ".specs", "prompts", "prompts.yaml");
  if (!await pathExistsAsync(manifestPath)) {
    void vscode.window.showWarningMessage("Repo prompts are not initialized yet.");
    return;
  }

  await openTextDocument(manifestPath);
}

export async function openMainArtifact(summary?: UserStorySummary): Promise<void> {
  if (!summary) {
    void vscode.window.showInformationMessage("Select a user story first.");
    return;
  }

  await openTextDocument(summary.mainArtifactPath);
}

export async function continuePhase(summary?: UserStorySummary): Promise<void> {
  if (!summary) {
    void vscode.window.showInformationMessage("Select a user story first.");
    return;
  }

  const workspaceRoot = getWorkspaceRoot();
  if (!workspaceRoot) {
    void vscode.window.showWarningMessage("Open a workspace folder before continuing a phase.");
    return;
  }

  try {
    const result = await getBackendClient(workspaceRoot).continuePhase(summary.usId);

    if (result.generatedArtifactPath) {
      await openTextDocument(result.generatedArtifactPath);
    }

    void vscode.window.showInformationMessage(
      `${summary.usId} advanced to ${result.currentPhase} with status ${result.status}.`
    );
  } catch (error) {
    void vscode.window.showErrorMessage(asErrorMessage(error));
  }
}

export async function approveCurrentPhase(summary?: UserStorySummary): Promise<void> {
  if (!summary) {
    void vscode.window.showInformationMessage("Select a user story first.");
    return;
  }

  const workspaceRoot = getWorkspaceRoot();
  if (!workspaceRoot) {
    void vscode.window.showWarningMessage("Open a workspace folder before approving a phase.");
    return;
  }

  let baseBranch: string | undefined;
  if (summary.currentPhase === "refinement") {
    baseBranch = await vscode.window.showInputBox({
      prompt: "Base branch used to create the work branch",
      value: "main",
      ignoreFocusOut: true,
      validateInput: (value) => value.trim().length > 0 ? undefined : "Base branch is required."
    });

    if (!baseBranch) {
      return;
    }
  }

  try {
    const updatedSummary = await getBackendClient(workspaceRoot).approveCurrentPhase(summary.usId, baseBranch);
    void vscode.window.showInformationMessage(
      `${updatedSummary.usId} approved. Current phase remains ${updatedSummary.currentPhase} until you continue the workflow.`
    );
  } catch (error) {
    void vscode.window.showErrorMessage(asErrorMessage(error));
  }
}

export async function requestRegression(summary?: UserStorySummary): Promise<void> {
  if (!summary) {
    void vscode.window.showInformationMessage("Select a user story first.");
    return;
  }

  const workspaceRoot = getWorkspaceRoot();
  if (!workspaceRoot) {
    void vscode.window.showWarningMessage("Open a workspace folder before requesting a regression.");
    return;
  }

  const allowedTargets = REGRESSION_TARGETS[summary.currentPhase] ?? [];
  if (allowedTargets.length === 0) {
    void vscode.window.showWarningMessage(
      `${summary.currentPhase} does not currently allow explicit regression from the extension.`
    );
    return;
  }

  const targetPhase = await vscode.window.showQuickPick(
    allowedTargets.map((phase) => ({
      label: phase,
      description: `Regress ${summary.usId} to ${phase}`
    })),
    {
      ignoreFocusOut: true,
      title: `Request regression for ${summary.usId}`,
      placeHolder: "Choose the target phase"
    }
  );

  if (!targetPhase) {
    return;
  }

  const reason = await vscode.window.showInputBox({
    prompt: "Reason for regression",
    ignoreFocusOut: true,
    validateInput: (value) => value.trim().length > 0 ? undefined : "Reason is required."
  });

  if (!reason) {
    return;
  }

  try {
    const result = await getBackendClient(workspaceRoot).requestRegression(summary.usId, targetPhase.label, reason);
    void vscode.window.showInformationMessage(
      `${summary.usId} regressed to ${result.currentPhase} with status ${result.status}.`
    );
  } catch (error) {
    void vscode.window.showErrorMessage(asErrorMessage(error));
  }
}

export async function restartUserStoryFromSource(summary?: UserStorySummary): Promise<void> {
  if (!summary) {
    void vscode.window.showInformationMessage("Select a user story first.");
    return;
  }

  const workspaceRoot = getWorkspaceRoot();
  if (!workspaceRoot) {
    void vscode.window.showWarningMessage("Open a workspace folder before restarting a user story.");
    return;
  }

  const reason = await vscode.window.showInputBox({
    prompt: "Reason for restart from source",
    ignoreFocusOut: true,
    validateInput: (value) => value.trim().length > 0 ? undefined : "Reason is required."
  });

  if (!reason) {
    return;
  }

  try {
    const result = await getBackendClient(workspaceRoot).restartUserStoryFromSource(summary.usId, reason);

    if (result.generatedArtifactPath) {
      await openTextDocument(result.generatedArtifactPath);
    }

    void vscode.window.showInformationMessage(
      `${summary.usId} restarted from source at ${result.currentPhase} with status ${result.status}.`
    );
  } catch (error) {
    void vscode.window.showErrorMessage(asErrorMessage(error));
  }
}

function getWorkspaceRoot(): string | undefined {
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}

async function pickUserStoryKind(): Promise<string | undefined> {
  const selection = await vscode.window.showQuickPick(
    USER_STORY_KINDS.map((kind) => ({
      label: kind,
      description: `Create or import a ${kind} user story`
    })),
    {
      ignoreFocusOut: true,
      title: "User story kind",
      placeHolder: "Choose the branch kind for this user story"
    }
  );

  return selection?.label;
}

async function pickUserStoryCategory(workspaceRoot: string): Promise<string | undefined> {
  const categories = await getUserStoryCategoriesAsync(workspaceRoot);
  const selection = await vscode.window.showQuickPick(
    categories.map((category) => ({
      label: category,
      description: `Assign category ${category}`
    })),
    {
      ignoreFocusOut: true,
      title: "User story category",
      placeHolder: "Choose the category used to group this user story"
    }
  );

  return selection?.label;
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

async function hasInitializedRepoPromptsAsync(workspaceRoot: string): Promise<boolean> {
  const hasConfig = await pathExistsAsync(path.join(workspaceRoot, ".specs", "config.yaml"));
  const hasManifest = await pathExistsAsync(path.join(workspaceRoot, ".specs", "prompts", "prompts.yaml"));
  return hasConfig && hasManifest;
}

async function nextUserStoryId(workspaceRoot: string): Promise<string> {
  const summaries = await getBackendClient(workspaceRoot).listUserStories();
  return nextUserStoryIdFromSummaries(summaries);
}
async function openTextDocument(filePath: string): Promise<void> {
  const document = await vscode.workspace.openTextDocument(filePath);
  await vscode.window.showTextDocument(document, { preview: false });
}

async function pathExistsAsync(filePath: string): Promise<boolean> {
  try {
    await fs.promises.access(filePath, fs.constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function getBackendClient(workspaceRoot: string): SpecForgeBackendClient {
  let client = backendClients.get(workspaceRoot);
  if (!client) {
    client = createMcpBackendClient(workspaceRoot, backendHostRoot ?? workspaceRoot, getSpecForgeSettings());
    backendClients.set(workspaceRoot, client);
  }

  return client;
}

export function getOrCreateBackendClient(workspaceRoot: string): SpecForgeBackendClient {
  return getBackendClient(workspaceRoot);
}

export function resetBackendClient(workspaceRoot: string): void {
  const client = backendClients.get(workspaceRoot);
  client?.dispose();
  backendClients.delete(workspaceRoot);
}

export function disposeBackendClients(): void {
  for (const client of backendClients.values()) {
    client.dispose();
  }

  backendClients.clear();
}

function asErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return "Unknown extension error.";
}
