import * as fs from "node:fs";
import * as path from "node:path";
import * as vscode from "vscode";
import type { SpecForgeBackendClient, UserStorySummary } from "./backendClient";
import { buildWorkflowHtml } from "./workflowView";

type WorkflowPanelCommand =
  | { readonly command: "selectPhase"; readonly phaseId?: string }
  | { readonly command: "openArtifact"; readonly path?: string }
  | { readonly command: "openPrompt"; readonly path?: string }
  | { readonly command: "openAttachment"; readonly path?: string }
  | { readonly command: "attachFiles" }
  | { readonly command: "continue" }
  | { readonly command: "approve" }
  | { readonly command: "restart" }
  | { readonly command: "regress"; readonly phaseId?: string }
  | { readonly command: "play" }
  | { readonly command: "pause" }
  | { readonly command: "stop" };

const panels = new Map<string, WorkflowPanelController>();

export interface WorkflowPanelCallbacks {
  refreshExplorer(): Promise<void>;
  notifyAttention(message: string): void;
  stopBackend(workspaceRoot: string): void;
}

export async function openWorkflowView(
  workspaceRoot: string,
  summary: UserStorySummary,
  getBackendClient: () => SpecForgeBackendClient,
  callbacks: WorkflowPanelCallbacks
): Promise<void> {
  const panelId = `${workspaceRoot}:${summary.usId}`;
  let controller = panels.get(panelId);
  if (!controller) {
    controller = new WorkflowPanelController(workspaceRoot, summary, getBackendClient, callbacks);
    panels.set(panelId, controller);
  }

  await controller.showAsync();
}

export async function refreshWorkflowViews(): Promise<void> {
  for (const panel of panels.values()) {
    await panel.refreshAsync();
  }
}

class WorkflowPanelController {
  private readonly panel: vscode.WebviewPanel;
  private selectedPhaseId: string;
  private playbackState: "idle" | "playing" | "paused" | "stopping" = "idle";
  private autoplayPromise: Promise<void> | null = null;

  public constructor(
    private readonly workspaceRoot: string,
    private summary: UserStorySummary,
    private readonly getBackendClient: () => SpecForgeBackendClient,
    private readonly callbacks: WorkflowPanelCallbacks
  ) {
    this.selectedPhaseId = summary.currentPhase;
    this.panel = vscode.window.createWebviewPanel(
      "specForge.workflowView",
      `${summary.usId} workflow`,
      vscode.ViewColumn.Active,
      {
        enableScripts: true,
        retainContextWhenHidden: true
      }
    );

    this.panel.onDidDispose(() => {
      panels.delete(this.key);
    });

    this.panel.webview.onDidReceiveMessage(async (message: WorkflowPanelCommand) => {
      try {
        await this.handleMessageAsync(message);
      } catch (error) {
        this.playbackState = "paused";
        await this.refreshAsync();
        void vscode.window.showErrorMessage(asErrorMessage(error));
      }
    });
  }

  private get key(): string {
    return `${this.workspaceRoot}:${this.summary.usId}`;
  }

  public async showAsync(): Promise<void> {
    this.panel.reveal(vscode.ViewColumn.Active);
    await this.refreshAsync();
  }

  public async refreshAsync(): Promise<void> {
    const workflow = await this.getBackendClient().getUserStoryWorkflow(this.summary.usId);
    this.summary = {
      ...this.summary,
      currentPhase: workflow.currentPhase,
      status: workflow.status,
      workBranch: workflow.workBranch
    };

    const selectedPhase = workflow.phases.find((phase) => phase.phaseId === this.selectedPhaseId)
      ?? workflow.phases.find((phase) => phase.isCurrent)
      ?? workflow.phases[0];
    this.selectedPhaseId = selectedPhase.phaseId;
    const selectedArtifactContent = await readArtifactContentAsync(selectedPhase.artifactPath);
    this.panel.title = `${workflow.usId} workflow`;
    this.panel.webview.html = buildWorkflowHtml(workflow, {
      selectedPhaseId: this.selectedPhaseId,
      selectedArtifactContent
    }, this.playbackState);
  }

  private async handleMessageAsync(message: WorkflowPanelCommand): Promise<void> {
    switch (message.command) {
      case "selectPhase":
        if (message.phaseId) {
          this.selectedPhaseId = message.phaseId;
          await this.refreshAsync();
        }
        return;
      case "openArtifact":
      case "openPrompt":
      case "openAttachment":
        if (message.path) {
          await openTextDocument(message.path);
        }
        return;
      case "attachFiles":
        await this.attachFilesAsync();
        return;
      case "continue":
        await this.continueCurrentPhaseAsync();
        return;
      case "approve":
        await this.approveCurrentPhaseAsync();
        return;
      case "restart":
        await this.restartCurrentWorkflowAsync();
        return;
      case "regress":
        if (message.phaseId) {
          await this.requestRegressionAsync(message.phaseId);
        }
        return;
      case "play":
        this.playbackState = "playing";
        if (!this.autoplayPromise) {
          this.autoplayPromise = this.runAutoplayAsync().finally(() => {
            this.autoplayPromise = null;
          });
        }
        await this.refreshAsync();
        return;
      case "pause":
        this.playbackState = "paused";
        await this.refreshAsync();
        return;
      case "stop":
        this.playbackState = "stopping";
        this.callbacks.stopBackend(this.workspaceRoot);
        await this.callbacks.refreshExplorer();
        this.playbackState = "idle";
        await this.refreshAsync();
        return;
    }
  }

  private async continueCurrentPhaseAsync(): Promise<void> {
    const result = await this.getBackendClient().continuePhase(this.summary.usId);
    this.summary = {
      ...this.summary,
      currentPhase: result.currentPhase,
      status: result.status
    };
    await this.callbacks.refreshExplorer();
    await this.refreshAsync();
  }

  private async attachFilesAsync(): Promise<void> {
    const selection = await vscode.window.showOpenDialog({
      canSelectFiles: true,
      canSelectFolders: false,
      canSelectMany: true,
      openLabel: "Attach files to user story"
    });

    if (!selection || selection.length === 0) {
      return;
    }

    const attachmentsDirectoryPath = path.join(this.summary.directoryPath, "attachments");
    await fs.promises.mkdir(attachmentsDirectoryPath, { recursive: true });

    for (const source of selection) {
      const targetPath = await getNextAttachmentPathAsync(attachmentsDirectoryPath, path.basename(source.fsPath));
      await fs.promises.copyFile(source.fsPath, targetPath);
    }

    await this.refreshAsync();
    void vscode.window.showInformationMessage(`Attached ${selection.length} file(s) to ${this.summary.usId}.`);
  }

  private async approveCurrentPhaseAsync(): Promise<void> {
    let baseBranch: string | undefined;
    if (this.summary.currentPhase === "refinement") {
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

    this.summary = await this.getBackendClient().approveCurrentPhase(this.summary.usId, baseBranch);
    await this.callbacks.refreshExplorer();
    await this.refreshAsync();
  }

  private async requestRegressionAsync(targetPhase: string): Promise<void> {
    const reason = await vscode.window.showInputBox({
      prompt: `Reason for regression to ${targetPhase}`,
      ignoreFocusOut: true,
      validateInput: (value) => value.trim().length > 0 ? undefined : "Reason is required."
    });

    if (!reason) {
      return;
    }

    const result = await this.getBackendClient().requestRegression(this.summary.usId, targetPhase, reason);
    this.summary = {
      ...this.summary,
      currentPhase: result.currentPhase,
      status: result.status
    };
    await this.callbacks.refreshExplorer();
    await this.refreshAsync();
  }

  private async restartCurrentWorkflowAsync(): Promise<void> {
    const reason = await vscode.window.showInputBox({
      prompt: "Reason for restart from source",
      ignoreFocusOut: true,
      validateInput: (value) => value.trim().length > 0 ? undefined : "Reason is required."
    });

    if (!reason) {
      return;
    }

    const result = await this.getBackendClient().restartUserStoryFromSource(this.summary.usId, reason);
    this.summary = {
      ...this.summary,
      currentPhase: result.currentPhase,
      status: result.status
    };
    await this.callbacks.refreshExplorer();
    await this.refreshAsync();
  }

  private async runAutoplayAsync(): Promise<void> {
    try {
      while (this.playbackState === "playing") {
        const workflow = await this.getBackendClient().getUserStoryWorkflow(this.summary.usId);
        if (!workflow.controls.canContinue) {
          this.playbackState = "paused";
          this.callbacks.notifyAttention(`${workflow.usId} requires attention at ${workflow.currentPhase}.`);
          await this.refreshAsync();
          return;
        }

        await this.continueCurrentPhaseAsync();
      }
    } catch (error) {
      if (this.playbackState === "stopping") {
        return;
      }

      this.playbackState = "paused";
      await this.refreshAsync();
      void vscode.window.showErrorMessage(asErrorMessage(error));
    }
  }
}

async function readArtifactContentAsync(artifactPath: string | null): Promise<string | null> {
  if (!artifactPath) {
    return null;
  }

  try {
    return await fs.promises.readFile(artifactPath, "utf8");
  } catch {
    return null;
  }
}

async function getNextAttachmentPathAsync(directoryPath: string, fileName: string): Promise<string> {
  const extension = path.extname(fileName);
  const baseName = extension.length > 0 ? fileName.slice(0, -extension.length) : fileName;

  for (let version = 1; version < 1000; version++) {
    const suffix = version === 1 ? "" : `.v${String(version).padStart(2, "0")}`;
    const candidate = path.join(directoryPath, `${baseName}${suffix}${extension}`);
    try {
      await fs.promises.access(candidate, fs.constants.F_OK);
    } catch {
      return candidate;
    }
  }

  throw new Error(`Unable to allocate attachment path for '${fileName}'.`);
}

async function openTextDocument(filePath: string): Promise<void> {
  const document = await vscode.workspace.openTextDocument(filePath);
  await vscode.window.showTextDocument(document, { preview: false });
}

function asErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return "Unknown workflow view error.";
}
