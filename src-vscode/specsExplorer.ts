import * as fs from "node:fs";
import * as path from "node:path";
import * as vscode from "vscode";

const SPECS_RELATIVE_DIR = path.join(".specs", "us");

export type UserStoryTreeItemKind = "userStory";

export interface UserStorySummary {
  readonly usId: string;
  readonly title: string;
  readonly directoryPath: string;
  readonly mainArtifactPath: string;
  readonly currentPhase: string;
  readonly status: string;
}

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

    const summaries = await loadUserStories(workspaceRoot);
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
  const userStoryDir = path.join(workspaceRoot, SPECS_RELATIVE_DIR, `us.${usId}`);
  const phasesDir = path.join(userStoryDir, "phases");

  await fs.promises.mkdir(phasesDir, { recursive: true });
  await fs.promises.writeFile(path.join(userStoryDir, "us.md"), buildUserStoryMarkdown(usId, title, sourceText), "utf8");
  await fs.promises.writeFile(path.join(userStoryDir, "state.yaml"), buildInitialStateYaml(usId, sourceText), "utf8");
  await fs.promises.writeFile(path.join(userStoryDir, "timeline.md"), buildInitialTimelineMarkdown(usId, title), "utf8");

  await openTextDocument(path.join(userStoryDir, "us.md"));
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
  const userStoryDir = path.join(workspaceRoot, SPECS_RELATIVE_DIR, `us.${usId}`);
  const phasesDir = path.join(userStoryDir, "phases");

  await fs.promises.mkdir(phasesDir, { recursive: true });
  await fs.promises.writeFile(path.join(userStoryDir, "us.md"), sourceText, "utf8");
  await fs.promises.writeFile(path.join(userStoryDir, "state.yaml"), buildInitialStateYaml(usId, sourceText), "utf8");
  await fs.promises.writeFile(path.join(userStoryDir, "timeline.md"), buildInitialTimelineMarkdown(usId, title), "utf8");

  await openTextDocument(path.join(userStoryDir, "us.md"));
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

  void vscode.window.showWarningMessage(
    `Continue phase is registered for ${summary.usId}, but execution still requires MCP backend wiring.`
  );
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
    status
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

function buildUserStoryMarkdown(usId: string, title: string, sourceText: string): string {
  return [
    `# ${usId} · ${title}`,
    "",
    "## Objective",
    sourceText,
    "",
    "## Initial Scope",
    "- Includes:",
    "  - ...",
    "- Excludes:",
    "  - ..."
  ].join("\n");
}

function buildInitialStateYaml(usId: string, sourceText: string): string {
  return [
    `usId: ${usId}`,
    "workflowId: canonical-v1",
    "status: draft",
    "currentPhase: capture",
    `sourceHash: local:${Buffer.from(sourceText, "utf8").toString("base64url")}`,
    "approvedPhases:",
    "  []"
  ].join("\n") + "\n";
}

function buildInitialTimelineMarkdown(usId: string, title: string): string {
  const timestamp = new Date().toISOString();
  return [
    `# Timeline · ${usId} · ${title}`,
    "",
    "## Resumen",
    "",
    "- Estado actual: `draft`",
    "- Fase actual: `capture`",
    "- Rama activa: `sin crear`",
    `- Última actualización: \`${timestamp}\``,
    "",
    "## Eventos",
    "",
    `### ${timestamp} · \`us_created\``,
    "",
    "- Actor: `user`",
    "- Fase: `capture`",
    "- Resumen: Se creó la US inicial y se persistieron `us.md`, `state.yaml` y `timeline.md`."
  ].join("\n");
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
