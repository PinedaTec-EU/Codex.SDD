import * as fs from "node:fs";
import * as path from "node:path";
import * as vscode from "vscode";
import {
  createLocalCliBackendClient,
  type ContinuePhaseResult,
  type CreateOrImportUserStoryResult,
  type SpecForgeBackendClient,
  type UserStorySummary
} from "./backendClient";

const SPECS_RELATIVE_DIR = path.join(".specs", "us");

export type UserStoryTreeItemKind = "userStory";

export class UserStoryTreeItem extends vscode.TreeItem {
  public readonly contextValue: UserStoryTreeItemKind = "userStory";

  public constructor(public readonly summary: UserStorySummary) {
    super(summary.usId, vscode.TreeItemCollapsibleState.None);
    this.description = `${summary.currentPhase} · ${summary.status}`;
    this.tooltip = summary.title;
    this.command = {
      command: "specForge.openMainArtifact",
      title: "Open Main Artifact",
      arguments: [summary]
    };
  }
}

export class SpecsExplorerProvider implements vscode.TreeDataProvider<UserStoryTreeItem> {
  private readonly onDidChangeTreeDataEmitter = new vscode.EventEmitter<UserStoryTreeItem | undefined>();

  public readonly onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event;

  public refresh(): void {
    this.onDidChangeTreeDataEmitter.fire(undefined);
  }

  public getTreeItem(element: UserStoryTreeItem): vscode.TreeItem {
    return element;
  }

  public async getChildren(): Promise<UserStoryTreeItem[]> {
    const workspaceRoot = getWorkspaceRoot();
    if (!workspaceRoot) {
      return [];
    }

    const summaries = await getBackendClient(workspaceRoot).listUserStories();
    return summaries.map((summary) => new UserStoryTreeItem(summary));
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

  const sourceText = await vscode.window.showInputBox({
    prompt: "User story objective or initial source text",
    ignoreFocusOut: true,
    validateInput: (value) => value.trim().length > 0 ? undefined : "Source text is required."
  });

  if (!sourceText) {
    return;
  }

  const usId = await nextUserStoryId(workspaceRoot);
  const result = await getBackendClient(workspaceRoot).createUserStory(usId, title, sourceText);

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
  const usId = await nextUserStoryId(workspaceRoot);
  const result = await getBackendClient(workspaceRoot).importUserStory(usId, sourceUri.fsPath, title);

  await openTextDocument(result.mainArtifactPath);
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

function getWorkspaceRoot(): string | undefined {
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}

async function loadUserStories(workspaceRoot: string): Promise<UserStorySummary[]> {
  const specsRoot = path.join(workspaceRoot, SPECS_RELATIVE_DIR);

  try {
    const entries = await fs.promises.readdir(specsRoot, { withFileTypes: true });
    const summaries = await Promise.all(
      entries
        .filter((entry) => entry.isDirectory() && entry.name.startsWith("us."))
        .map(async (entry) => loadUserStorySummary(path.join(specsRoot, entry.name)))
    );

    return summaries.sort((left, right) => left.usId.localeCompare(right.usId));
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return [];
    }

    throw error;
  }
}

async function loadUserStorySummary(userStoryDir: string): Promise<UserStorySummary> {
  const mainArtifactPath = path.join(userStoryDir, "us.md");
  const statePath = path.join(userStoryDir, "state.yaml");
  const [mainArtifactContent, stateContent] = await Promise.all([
    fs.promises.readFile(mainArtifactPath, "utf8"),
    readIfExists(statePath)
  ]);

  const title = mainArtifactContent.split(/\r?\n/).find((line) => line.startsWith("# "))?.replace(/^#\s+/, "").trim()
    ?? path.basename(userStoryDir);
  const usId = parseScalar(stateContent, "usId") ?? path.basename(userStoryDir).replace(/^us\./, "");
  const currentPhase = parseScalar(stateContent, "currentPhase") ?? "capture";
  const status = parseScalar(stateContent, "status") ?? "draft";

  return {
    usId,
    title,
    directoryPath: userStoryDir,
    mainArtifactPath,
    currentPhase,
    status,
    workBranch: null
  };
}

async function nextUserStoryId(workspaceRoot: string): Promise<string> {
  const summaries = await loadUserStories(workspaceRoot);
  const maxValue = summaries
    .map((summary) => /^US-(\d+)$/.exec(summary.usId))
    .filter((match): match is RegExpExecArray => match !== null)
    .map((match) => Number.parseInt(match[1], 10))
    .reduce((currentMax, value) => Math.max(currentMax, value), 0);

  return `US-${String(maxValue + 1).padStart(4, "0")}`;
}

async function readIfExists(filePath: string): Promise<string> {
  try {
    return await fs.promises.readFile(filePath, "utf8");
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return "";
    }

    throw error;
  }
}

function parseScalar(yaml: string, key: string): string | undefined {
  const pattern = new RegExp(`^${escapeRegExp(key)}:\\s*(.+)$`, "m");
  const match = pattern.exec(yaml);
  return match?.[1]?.trim();
}

async function openTextDocument(filePath: string): Promise<void> {
  const document = await vscode.workspace.openTextDocument(filePath);
  await vscode.window.showTextDocument(document, { preview: false });
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === "object" && error !== null && "code" in error;
}

function getBackendClient(workspaceRoot: string): SpecForgeBackendClient {
  return createLocalCliBackendClient(workspaceRoot);
}

function asErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return "Unknown extension error.";
}
