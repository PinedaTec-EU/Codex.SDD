import * as fs from "node:fs";
import * as path from "node:path";
import * as vscode from "vscode";
import {
  createMcpBackendClient,
  type SpecForgeBackendClient,
  type UserStorySummary
} from "./backendClient";
import { getSpecForgeSettings } from "./extensionSettings";
import { appendSpecForgeLog } from "./outputChannel";
import { asErrorMessage } from "./utils";
import { getCurrentActor } from "./userActor";
import { closeWorkflowView } from "./workflowPanel";
import {
  compareUserStories,
  DEFAULT_USER_STORY_CATEGORIES,
  groupUserStoriesByCategory,
  nextUserStoryIdFromSummaries,
  normalizeCategory,
  parseYamlSequence
} from "./explorerModel";
import { getRepoPromptsStatusAsync } from "./repoPromptsStatus";

export type UserStoryTreeItemKind = "userStory" | "userStoryCategory" | "repoPromptSetup" | "repoPromptTemplates";
const backendClients = new Map<string, SpecForgeBackendClient>();
const pendingBackendClientResets = new Set<string>();
const REGRESSION_TARGETS: Record<string, readonly string[]> = {
  review: ["implementation", "technical-design", "spec"],
  "release-approval": ["implementation", "technical-design", "spec"]
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

  public constructor(message?: string | null) {
    super("Prompt Overrides", vscode.TreeItemCollapsibleState.None);
    this.description = "optional customization";
    this.tooltip = message
      ? `SpecForge.AI runs with embedded prompts and only writes disk overrides when you customize them.\n${message}`
      : "SpecForge.AI runs with embedded prompts and only writes disk overrides when you customize them.";
    this.iconPath = new vscode.ThemeIcon("book");
    this.command = {
      command: "specForge.openPromptTemplates",
      title: "Customize Prompt Templates"
    };
  }
}

class RepoPromptTemplatesTreeItem extends vscode.TreeItem {
  public readonly contextValue: UserStoryTreeItemKind = "repoPromptTemplates";

  public constructor() {
    super("Customize Prompt Templates", vscode.TreeItemCollapsibleState.None);
    this.description = ".specs/prompts/";
    this.tooltip = "Choose one embedded prompt template to materialize as a disk override and open it.";
    this.iconPath = new vscode.ThemeIcon("book");
    this.command = {
      command: "specForge.openPromptTemplates",
      title: "Customize Prompt Templates"
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

    let summaries: readonly UserStorySummary[];
    try {
      summaries = await getBackendClient(workspaceRoot).listUserStories();
      await logUserStoryDiscoveryAsync(workspaceRoot, summaries, "explorer.getChildren");
    } catch (error) {
      await logUserStoryDiscoveryFailureAsync(workspaceRoot, error, "explorer.getChildren");
      throw error;
    }

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
    const promptsStatus = await getRepoPromptsStatusAsync(workspaceRoot);
    if (promptsStatus.initialized) {
      items.push(new RepoPromptTemplatesTreeItem());
    } else {
      appendSpecForgeLog(`[explorer.getChildren] prompt override warning for '${workspaceRoot}': ${promptsStatus.message ?? "prompt overrides not materialized"}. Checked: ${promptsStatus.checkedPaths.join(", ")}`);
      items.push(new RepoPromptSetupTreeItem(promptsStatus.message));
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
  const result = await getBackendClient(workspaceRoot).createUserStory(usId, title, kind, category, sourceText, getCurrentActor());

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
  const result = await getBackendClient(workspaceRoot).importUserStory(usId, sourceUri.fsPath, title, kind, category, getCurrentActor());

  await openTextDocument(result.mainArtifactPath);
}

export async function initializeRepoPrompts(overwrite = false): Promise<void> {
  const workspaceRoot = getWorkspaceRoot();
  if (!workspaceRoot) {
    void vscode.window.showWarningMessage("Open a workspace folder before exporting prompt templates.");
    return;
  }

  try {
    const result = await getBackendClient(workspaceRoot).initializeRepoPrompts(overwrite);
    const createdCount = result.createdFiles.length;
    const skippedCount = result.skippedFiles.length;
    void vscode.window.showInformationMessage(
      overwrite
        ? `Prompt templates exported with overwrite. Created ${createdCount} files and skipped ${skippedCount}.`
        : `Prompt templates exported. Created ${createdCount} files and skipped ${skippedCount}.`
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

  const prompts = [
    [".specs/prompts/shared/system.md", "Shared system"],
    [".specs/prompts/shared/style.md", "Shared style"],
    [".specs/prompts/shared/output-rules.md", "Shared output rules"],
    [".specs/prompts/phases/refinement.execute.system.md", "Refinement execute system"],
    [".specs/prompts/phases/refinement.execute.md", "Refinement execute"],
    [".specs/prompts/phases/spec.execute.system.md", "Spec execute system"],
    [".specs/prompts/phases/spec.execute.md", "Spec execute"],
    [".specs/prompts/phases/technical-design.execute.system.md", "Technical design execute system"],
    [".specs/prompts/phases/technical-design.execute.md", "Technical design execute"],
    [".specs/prompts/phases/implementation.execute.system.md", "Implementation execute system"],
    [".specs/prompts/phases/implementation.execute.md", "Implementation execute"],
    [".specs/prompts/phases/review.execute.system.md", "Review execute system"],
    [".specs/prompts/phases/review.execute.md", "Review execute"],
    [".specs/prompts/phases/release-approval.execute.system.md", "Release approval execute system"],
    [".specs/prompts/phases/release-approval.execute.md", "Release approval execute"],
    [".specs/prompts/phases/pr-preparation.execute.system.md", "PR preparation execute system"],
    [".specs/prompts/phases/pr-preparation.execute.md", "PR preparation execute"],
    [".specs/prompts/phases/refinement.auto-answer.system.md", "Refinement auto-answer system"]
  ] as const;
  const selected = await vscode.window.showQuickPick(
    prompts.map(([relativePath, label]) => ({ label, description: relativePath, relativePath })),
    { placeHolder: "Select a prompt template to export and customize" });
  if (!selected) {
    return;
  }

  const promptPath = path.join(workspaceRoot, selected.relativePath);
  await getBackendClient(workspaceRoot).exportPromptTemplate(promptPath, false);
  await openTextDocument(promptPath);
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
    const result = await getBackendClient(workspaceRoot).continuePhase(summary.usId, getCurrentActor());

    if (result.generatedArtifactPath) {
      await openTextDocument(result.generatedArtifactPath);
    }

    logExecutionWarnings(summary.usId, result.execution);

    void vscode.window.showInformationMessage(
      `${summary.usId} advanced to ${result.currentPhase} with status ${result.status}.`
    );
  } catch (error) {
    void vscode.window.showErrorMessage(asErrorMessage(error));
  }
}

function logExecutionWarnings(usId: string, execution?: { readonly warnings?: readonly string[] | null } | null): void {
  if (!execution?.warnings || execution.warnings.length === 0) {
    return;
  }

  for (const warning of execution.warnings) {
    appendSpecForgeLog(`Workflow '${usId}' system prompt warning: ${warning}`);
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
  if (summary.currentPhase === "spec") {
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
    const updatedSummary = await getBackendClient(workspaceRoot).approveCurrentPhase(summary.usId, baseBranch, undefined, getCurrentActor());
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
    const destructiveRewindEnabled = getSpecForgeSettings().destructiveRewindEnabled;
    const result = await getBackendClient(workspaceRoot).requestRegression(
      summary.usId,
      targetPhase.label,
      reason,
      getCurrentActor(),
      destructiveRewindEnabled
    );
    void vscode.window.showInformationMessage(
      `${summary.usId} regressed to ${result.currentPhase} with status ${result.status}${destructiveRewindEnabled ? " using destructive cleanup" : ""}.`
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
    const result = await getBackendClient(workspaceRoot).restartUserStoryFromSource(summary.usId, reason, getCurrentActor());

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

export async function deleteUserStory(summary?: UserStorySummary): Promise<void> {
  if (!summary) {
    void vscode.window.showInformationMessage("Select a user story first.");
    return;
  }

  const workspaceRoot = getWorkspaceRoot();
  if (!workspaceRoot) {
    void vscode.window.showWarningMessage("Open a workspace folder before deleting a user story.");
    return;
  }

  const confirmLabel = "Delete User Story";
  const selection = await vscode.window.showWarningMessage(
    `Delete ${summary.usId}? This removes its files and timeline from .specs/us.`,
    { modal: true, detail: summary.directoryPath },
    confirmLabel
  );

  if (selection !== confirmLabel) {
    return;
  }

  const storiesRoot = path.join(workspaceRoot, ".specs", "us") + path.sep;
  const targetPath = path.resolve(summary.directoryPath);
  if (!targetPath.startsWith(storiesRoot)) {
    void vscode.window.showErrorMessage(`Refusing to delete '${summary.usId}' because its path is outside .specs/us.`);
    return;
  }

  try {
    closeWorkflowView(workspaceRoot, summary.usId);
    await fs.promises.rm(targetPath, { recursive: true, force: false });
    void vscode.window.showInformationMessage(`${summary.usId} deleted.`);
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
  if (client && pendingBackendClientResets.has(workspaceRoot) && !client.isBusy()) {
    appendSpecForgeLog(`Applying deferred MCP backend reset for '${workspaceRoot}' before creating the next request.`);
    resetBackendClient(workspaceRoot);
    client = undefined;
  }

  if (!client) {
    client = createMcpBackendClient(workspaceRoot, backendHostRoot ?? workspaceRoot, getSpecForgeSettings());
    backendClients.set(workspaceRoot, client);
  }

  return client;
}

export function getOrCreateBackendClient(workspaceRoot: string): SpecForgeBackendClient {
  return getBackendClient(workspaceRoot);
}

export function requestBackendClientReset(workspaceRoot: string): "applied" | "deferred" | "noop" {
  const client = backendClients.get(workspaceRoot);
  if (!client) {
    pendingBackendClientResets.delete(workspaceRoot);
    return "noop";
  }

  if (client.isBusy()) {
    pendingBackendClientResets.add(workspaceRoot);
    appendSpecForgeLog(
      `Deferring MCP backend reset for '${workspaceRoot}' because a workflow phase is still running.`
    );
    return "deferred";
  }

  resetBackendClient(workspaceRoot);
  return "applied";
}

export function applyPendingBackendClientReset(workspaceRoot: string): boolean {
  if (!pendingBackendClientResets.has(workspaceRoot)) {
    return false;
  }

  const client = backendClients.get(workspaceRoot);
  if (client?.isBusy()) {
    appendSpecForgeLog(
      `Pending MCP backend reset for '${workspaceRoot}' is still deferred because the backend remains busy.`
    );
    return false;
  }

  appendSpecForgeLog(`Applying deferred MCP backend reset for '${workspaceRoot}' after the phase boundary.`);
  resetBackendClient(workspaceRoot);
  return true;
}

export function hasPendingBackendClientReset(workspaceRoot: string): boolean {
  return pendingBackendClientResets.has(workspaceRoot);
}

export function resetBackendClient(workspaceRoot: string): void {
  pendingBackendClientResets.delete(workspaceRoot);
  const client = backendClients.get(workspaceRoot);
  client?.dispose();
  backendClients.delete(workspaceRoot);
}

export function disposeBackendClients(): void {
  pendingBackendClientResets.clear();
  for (const client of backendClients.values()) {
    client.dispose();
  }

  backendClients.clear();
}

async function logUserStoryDiscoveryAsync(
  workspaceRoot: string,
  summaries: readonly UserStorySummary[],
  source: string
): Promise<void> {
  const specsRoot = path.join(workspaceRoot, ".specs", "us");
  const physicalEntries = await describeSpecsUserStoryTreeAsync(specsRoot);
  appendSpecForgeLog(
    `[${source}] discovered ${summaries.length} user story item(s) for '${workspaceRoot}'. physical='${physicalEntries.join(", ") || "empty"}'.`
  );
}

async function logUserStoryDiscoveryFailureAsync(
  workspaceRoot: string,
  error: unknown,
  source: string
): Promise<void> {
  const specsRoot = path.join(workspaceRoot, ".specs", "us");
  const physicalEntries = await describeSpecsUserStoryTreeAsync(specsRoot);
  appendSpecForgeLog(
    `[${source}] failed to list user stories for '${workspaceRoot}': ${asErrorMessage(error)}. physical='${physicalEntries.join(", ") || "empty"}'.`
  );
}

async function describeSpecsUserStoryTreeAsync(specsRoot: string): Promise<readonly string[]> {
  try {
    const entries = await fs.promises.readdir(specsRoot, { withFileTypes: true });
    const categories = entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort((left, right) => left.localeCompare(right));

    const descriptions: string[] = [];
    for (const category of categories) {
      const categoryPath = path.join(specsRoot, category);
      const userStoryDirectories = (await fs.promises.readdir(categoryPath, { withFileTypes: true }))
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .sort((left, right) => left.localeCompare(right));
      descriptions.push(`${category}[${userStoryDirectories.join(", ") || "no-us"}]`);
    }

    return descriptions;
  } catch (error) {
    return [`error:${asErrorMessage(error)}`];
  }
}
