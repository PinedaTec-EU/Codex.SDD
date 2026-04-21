import * as fs from "node:fs";
import * as path from "node:path";
import * as vscode from "vscode";
import type { SpecForgeBackendClient, UserStorySummary, UserStoryWorkflowDetails } from "./backendClient";
import { suggestContextFiles } from "./contextSuggestions";
import { getSpecForgeSettings, getSpecForgeSettingsStatus } from "./extensionSettings";
import { appendSpecForgeDebugLog, appendSpecForgeLog, isSpecForgeDebugLoggingEnabled, showSpecForgeOutput } from "./outputChannel";
import { readRuntimeVersionAsync } from "./runtimeVersion";
import { getCurrentActor } from "./userActor";
import { normalizePlaybackStateAfterManualWorkflowChange } from "./workflowPlaybackState";
import { buildWorkflowHtml } from "./workflowView";

type WorkflowPanelCommand =
  | { readonly command: "selectPhase"; readonly phaseId?: string }
  | { readonly command: "openArtifact"; readonly path?: string }
  | { readonly command: "openPrompt"; readonly path?: string }
  | { readonly command: "openAttachment"; readonly path?: string }
  | { readonly command: "openSettings" }
  | { readonly command: "attachFiles"; readonly kind?: string }
  | { readonly command: "addSuggestedContextFile"; readonly path?: string }
  | { readonly command: "addSuggestedContextFiles"; readonly paths?: readonly string[] }
  | { readonly command: "setFileKind"; readonly path?: string; readonly kind?: string }
  | { readonly command: "continue" }
  | { readonly command: "approve"; readonly baseBranch?: string; readonly workBranch?: string }
  | { readonly command: "restart" }
  | { readonly command: "debugResetToCapture" }
  | { readonly command: "regress"; readonly phaseId?: string }
  | { readonly command: "submitClarificationAnswers"; readonly answers?: string[] }
  | { readonly command: "submitPhaseInput"; readonly prompt?: string }
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

export async function refreshWorkflowViews(reason = "external"): Promise<void> {
  for (const panel of panels.values()) {
    await panel.refreshAsync(reason);
  }
}

export function notifyWorkflowFileChanged(filePath: string): void {
  for (const panel of panels.values()) {
    panel.onWatchedFileChanged(filePath);
  }
}

export function hasActiveWorkflowPlayback(): boolean {
  for (const panel of panels.values()) {
    if (panel.hasActivePlayback()) {
      return true;
    }
  }

  return false;
}

export function closeWorkflowView(workspaceRoot: string, usId: string): void {
  panels.get(`${workspaceRoot}:${usId}`)?.dispose();
}

class WorkflowPanelController {
  private readonly panel: vscode.WebviewPanel;
  private selectedPhaseId: string;
  private playbackState: "idle" | "playing" | "paused" | "stopping" = "idle";
  private autoplayPromise: Promise<void> | null = null;
  private lastWorkflow: UserStoryWorkflowDetails | null = null;
  private transientExecutionPhaseId: string | null = null;
  private transientCompletedPhaseIds: readonly string[] = [];
  private readonly refinementApprovalBaseBranchProposal = "main";

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
        appendSpecForgeLog(`Workflow '${this.summary.usId}' received command '${message.command}'.`);
        await this.handleMessageAsync(message);
      } catch (error) {
        this.playbackState = "paused";
        await this.refreshAsync();
        appendSpecForgeLog(`Workflow '${this.summary.usId}' command '${message.command}' failed: ${asErrorMessage(error)}`);
        showSpecForgeOutput(false);
        void vscode.window.showErrorMessage(asErrorMessage(error));
      }
    });
  }

  private get key(): string {
    return `${this.workspaceRoot}:${this.summary.usId}`;
  }

  public async showAsync(): Promise<void> {
    this.panel.reveal(vscode.ViewColumn.Active);
    await this.refreshAsync("showAsync");
  }

  public dispose(): void {
    this.panel.dispose();
  }

  public hasActivePlayback(): boolean {
    return this.playbackState === "playing" || this.playbackState === "stopping";
  }

  public onWatchedFileChanged(filePath: string): void {
    if (this.playbackState !== "playing" || !this.belongsToCurrentWorkflow(filePath)) {
      return;
    }

    const nextExecutionPhaseId = this.deriveExecutionPhaseFromWatchedPath(filePath);
    if (!nextExecutionPhaseId || nextExecutionPhaseId === this.transientExecutionPhaseId) {
      return;
    }

    this.setTransientExecutionPhase(nextExecutionPhaseId);
    appendSpecForgeDebugLog(
      `Workflow '${this.summary.usId}' advanced local playback visualization to '${nextExecutionPhaseId}' from watcher path '${filePath}'.`
    );
    void this.renderCachedWorkflowAsync("watcherPlaybackProgress");
  }

  public async refreshAsync(reason = "unspecified"): Promise<void> {
    appendSpecForgeDebugLog(
      `Workflow '${this.summary.usId}' refresh start. reason='${reason}', selectedPhase='${this.selectedPhaseId}', playback='${this.playbackState}', summaryPhase='${this.summary.currentPhase}'.`
    );
    const workflow = await this.getBackendClient().getUserStoryWorkflow(this.summary.usId);
    this.lastWorkflow = workflow;
    this.summary = {
      ...this.summary,
      currentPhase: workflow.currentPhase,
      status: workflow.status,
      workBranch: workflow.workBranch
    };
    const suggestionCount = await this.renderWorkflowAsync(workflow);
    appendSpecForgeDebugLog(
      `Workflow '${this.summary.usId}' refresh end. reason='${reason}', workflowPhase='${workflow.currentPhase}', workflowStatus='${workflow.status}', selectedPhase='${this.selectedPhaseId}', suggestions=${suggestionCount}.`
    );
  }

  private async handleMessageAsync(message: WorkflowPanelCommand): Promise<void> {
    switch (message.command) {
      case "selectPhase":
        if (message.phaseId) {
          this.selectedPhaseId = message.phaseId;
          await this.refreshAsync("command:selectPhase");
        }
        return;
      case "openArtifact":
      case "openPrompt":
      case "openAttachment":
        if (message.path) {
          await openTextDocument(message.path);
        }
        return;
      case "openSettings":
        await vscode.commands.executeCommand("workbench.action.openSettings", "@ext:local.specforge-ai specForge");
        return;
      case "attachFiles":
        await this.attachFilesAsync(message.kind === "context" ? "context" : "attachment");
        return;
      case "addSuggestedContextFile":
        if (message.path) {
          await this.addContextFilesFromPathsAsync([message.path]);
        }
        return;
      case "addSuggestedContextFiles":
        if (message.paths && message.paths.length > 0) {
          await this.addContextFilesFromPathsAsync(message.paths);
        }
        return;
      case "setFileKind":
        if (message.path && (message.kind === "context" || message.kind === "attachment")) {
          await this.setFileKindAsync(message.path, message.kind);
        }
        return;
      case "continue":
        if (!this.isExecutionConfigured()) {
          await vscode.commands.executeCommand("workbench.action.openSettings", "@ext:local.specforge-ai specForge");
          return;
        }
        appendSpecForgeLog(`Continuing workflow '${this.summary.usId}' from phase '${this.summary.currentPhase}'.`);
        await this.continueCurrentPhaseAsync();
        return;
      case "approve":
        await this.approveCurrentPhaseAsync(message.baseBranch, message.workBranch);
        return;
      case "restart":
        await this.restartCurrentWorkflowAsync();
        return;
      case "debugResetToCapture":
        await this.debugResetToCaptureAsync();
        return;
      case "regress":
        if (message.phaseId) {
          await this.requestRegressionAsync(message.phaseId);
        }
        return;
      case "submitClarificationAnswers":
        await this.submitClarificationAnswersAsync(message.answers ?? []);
        return;
      case "submitPhaseInput":
        if (message.prompt) {
          await this.submitPhaseInputAsync(message.prompt);
        }
        return;
      case "play":
        if (!this.isExecutionConfigured()) {
          await vscode.commands.executeCommand("workbench.action.openSettings", "@ext:local.specforge-ai specForge");
          return;
        }
        appendSpecForgeLog(`Autoplay requested for '${this.summary.usId}'.`);
        showSpecForgeOutput(true);
        this.playbackState = "playing";
        this.setTransientExecutionPhase(this.deriveInitialExecutionPhaseId());
        if (!this.autoplayPromise) {
          this.autoplayPromise = this.runAutoplayAsync().finally(() => {
            this.autoplayPromise = null;
          });
        }
        await this.refreshAsync("command:play");
        return;
      case "pause":
        appendSpecForgeLog(`Autoplay paused for '${this.summary.usId}'.`);
        this.playbackState = "paused";
        this.clearTransientExecutionPhase();
        await this.refreshAsync("command:pause");
        return;
      case "stop":
        appendSpecForgeLog(`Autoplay stopped for '${this.summary.usId}'.`);
        this.playbackState = "stopping";
        this.callbacks.stopBackend(this.workspaceRoot);
        await this.callbacks.refreshExplorer();
        this.playbackState = "idle";
        this.clearTransientExecutionPhase();
        await this.refreshAsync("command:stop");
        return;
    }
  }

  private async continueCurrentPhaseAsync(): Promise<void> {
    const previousPhase = this.summary.currentPhase;
    const result = await this.getBackendClient().continuePhase(this.summary.usId);
    const usageSummary = result.usage
      ? ` Tokens in/out/total: ${result.usage.inputTokens}/${result.usage.outputTokens}/${result.usage.totalTokens}.`
      : "";
    appendSpecForgeLog(
      `Workflow '${this.summary.usId}' advanced from '${previousPhase}' to '${result.currentPhase}' with status '${result.status}'.${usageSummary}`
    );
    this.summary = {
      ...this.summary,
      currentPhase: result.currentPhase,
      status: result.status
    };
    this.playbackState = normalizePlaybackStateAfterManualWorkflowChange(this.playbackState);
    this.selectedPhaseId = result.currentPhase;
    this.clearTransientExecutionPhase();
    appendSpecForgeDebugLog(`Workflow '${this.summary.usId}' continueCurrentPhaseAsync requested explorer refresh.`);
    await this.callbacks.refreshExplorer();
    await this.refreshAsync("continueCurrentPhaseAsync");
  }

  private async submitClarificationAnswersAsync(answers: string[]): Promise<void> {
    await this.getBackendClient().submitClarificationAnswers(this.summary.usId, answers, getCurrentActor());
    appendSpecForgeLog(`Workflow '${this.summary.usId}' stored ${answers.length} clarification answer(s).`);
    this.playbackState = normalizePlaybackStateAfterManualWorkflowChange(this.playbackState);
    this.clearTransientExecutionPhase();
    appendSpecForgeDebugLog(`Workflow '${this.summary.usId}' submitClarificationAnswersAsync requested explorer refresh.`);
    await this.callbacks.refreshExplorer();
    await this.refreshAsync("submitClarificationAnswersAsync");
  }

  private async submitPhaseInputAsync(prompt: string): Promise<void> {
    const normalizedPrompt = prompt.trim();
    if (normalizedPrompt.length === 0) {
      return;
    }

    const result = await this.getBackendClient().operateCurrentPhaseArtifact(this.summary.usId, normalizedPrompt, getCurrentActor());
    appendSpecForgeLog(`Workflow '${this.summary.usId}' regenerated phase '${result.currentPhase}' after human input.`);
    this.summary = {
      ...this.summary,
      currentPhase: result.currentPhase,
      status: result.status
    };
    this.playbackState = normalizePlaybackStateAfterManualWorkflowChange(this.playbackState);
    this.clearTransientExecutionPhase();
    this.selectedPhaseId = result.currentPhase;
    appendSpecForgeDebugLog(`Workflow '${this.summary.usId}' submitPhaseInputAsync requested explorer refresh.`);
    await this.callbacks.refreshExplorer();
    await this.refreshAsync("submitPhaseInputAsync");
  }

  private isExecutionConfigured(): boolean {
    return getSpecForgeSettingsStatus(getSpecForgeSettings()).executionConfigured;
  }

  private async attachFilesAsync(kind: "context" | "attachment"): Promise<void> {
    const selection = await vscode.window.showOpenDialog({
      canSelectFiles: true,
      canSelectFolders: false,
      canSelectMany: true,
      openLabel: kind === "context" ? "Add context files" : "Add user story files"
    });

    if (!selection || selection.length === 0) {
      return;
    }

    const attachmentsDirectoryPath = path.join(this.summary.directoryPath, kind === "context" ? "context" : "attachments");
    await fs.promises.mkdir(attachmentsDirectoryPath, { recursive: true });

    for (const source of selection) {
      const targetPath = await getNextAttachmentPathAsync(attachmentsDirectoryPath, path.basename(source.fsPath));
      await fs.promises.copyFile(source.fsPath, targetPath);
    }

    await this.refreshAsync();
    void vscode.window.showInformationMessage(
      `${selection.length} file(s) added to ${kind === "context" ? "context" : "user story info"} for ${this.summary.usId}.`
    );
  }

  private async addContextFilesFromPathsAsync(paths: readonly string[]): Promise<void> {
    const uniquePaths = Array.from(new Set(paths.map((filePath) => path.normalize(filePath))));
    if (uniquePaths.length === 0) {
      return;
    }

    const contextDirectoryPath = path.join(this.summary.directoryPath, "context");
    await fs.promises.mkdir(contextDirectoryPath, { recursive: true });

    let copiedFiles = 0;
    for (const sourcePath of uniquePaths) {
      const sourceStats = await fs.promises.stat(sourcePath).catch(() => null);
      if (!sourceStats?.isFile()) {
        continue;
      }

      const targetPath = await getNextAttachmentPathAsync(contextDirectoryPath, path.basename(sourcePath));
      await fs.promises.copyFile(sourcePath, targetPath);
      copiedFiles += 1;
    }

    await this.refreshAsync();
    if (copiedFiles > 0) {
      void vscode.window.showInformationMessage(
        `${copiedFiles} suggested context file(s) added to ${this.summary.usId}.`
      );
    }
  }

  private async setFileKindAsync(filePath: string, targetKind: "context" | "attachment"): Promise<void> {
    const sourcePath = path.normalize(filePath);
    const targetDirectory = path.join(this.summary.directoryPath, targetKind === "context" ? "context" : "attachments");
    const sourceDirectory = path.dirname(sourcePath);

    if (path.normalize(sourceDirectory) === path.normalize(targetDirectory)) {
      return;
    }

    await fs.promises.mkdir(targetDirectory, { recursive: true });
    const targetPath = await getNextAttachmentPathAsync(targetDirectory, path.basename(sourcePath));
    await fs.promises.rename(sourcePath, targetPath);
    await this.refreshAsync();
    void vscode.window.showInformationMessage(
      `Moved ${path.basename(sourcePath)} to ${targetKind === "context" ? "context" : "user story info"} in ${this.summary.usId}.`
    );
  }

  private async approveCurrentPhaseAsync(baseBranch?: string, workBranch?: string): Promise<void> {
    const normalizedBaseBranch = this.summary.currentPhase === "refinement"
      ? (baseBranch?.trim() || this.refinementApprovalBaseBranchProposal)
      : undefined;
    const normalizedWorkBranch = this.summary.currentPhase === "refinement"
      ? (workBranch?.trim() || this.buildRefinementApprovalWorkBranchProposal(this.lastWorkflow))
      : undefined;

    this.summary = await this.getBackendClient().approveCurrentPhase(
      this.summary.usId,
      normalizedBaseBranch,
      normalizedWorkBranch,
      getCurrentActor()
    );
    appendSpecForgeLog(`Workflow '${this.summary.usId}' approved phase '${this.summary.currentPhase}'.`);
    this.playbackState = normalizePlaybackStateAfterManualWorkflowChange(this.playbackState);
    this.clearTransientExecutionPhase();
    appendSpecForgeDebugLog(`Workflow '${this.summary.usId}' approveCurrentPhaseAsync requested explorer refresh.`);
    await this.callbacks.refreshExplorer();
    await this.refreshAsync("approveCurrentPhaseAsync");
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

    const result = await this.getBackendClient().requestRegression(this.summary.usId, targetPhase, reason, getCurrentActor());
    appendSpecForgeLog(
      `Workflow '${this.summary.usId}' regressed to '${result.currentPhase}' with status '${result.status}'.`
    );
    this.summary = {
      ...this.summary,
      currentPhase: result.currentPhase,
      status: result.status
    };
    this.playbackState = normalizePlaybackStateAfterManualWorkflowChange(this.playbackState);
    this.clearTransientExecutionPhase();
    this.selectedPhaseId = result.currentPhase;
    appendSpecForgeDebugLog(`Workflow '${this.summary.usId}' requestRegressionAsync requested explorer refresh.`);
    await this.callbacks.refreshExplorer();
    await this.refreshAsync("requestRegressionAsync");
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

    const result = await this.getBackendClient().restartUserStoryFromSource(this.summary.usId, reason, getCurrentActor());
    appendSpecForgeLog(
      `Workflow '${this.summary.usId}' restarted from source. Current phase '${result.currentPhase}', status '${result.status}'.`
    );
    this.summary = {
      ...this.summary,
      currentPhase: result.currentPhase,
      status: result.status
    };
    this.playbackState = normalizePlaybackStateAfterManualWorkflowChange(this.playbackState);
    this.clearTransientExecutionPhase();
    this.selectedPhaseId = result.currentPhase;
    appendSpecForgeDebugLog(`Workflow '${this.summary.usId}' restartCurrentWorkflowAsync requested explorer refresh.`);
    await this.callbacks.refreshExplorer();
    await this.refreshAsync("restartCurrentWorkflowAsync");
  }

  private async debugResetToCaptureAsync(): Promise<void> {
    const confirmation = await vscode.window.showWarningMessage(
      `Reset ${this.summary.usId} to capture and delete all generated artifacts after the source?`,
      { modal: true },
      "Reset to Capture"
    );

    if (confirmation !== "Reset to Capture") {
      return;
    }

    const result = await this.getBackendClient().resetUserStoryToCapture(this.summary.usId);
    appendSpecForgeLog(
      `Workflow '${this.summary.usId}' was reset to '${result.currentPhase}' with status '${result.status}' from DEBUG UI.`
    );
    appendSpecForgeDebugLog(
      `Workflow '${this.summary.usId}' reset deleted paths: ${result.deletedPaths.length > 0 ? result.deletedPaths.join(", ") : "(none)"}.`
    );
    appendSpecForgeDebugLog(
      `Workflow '${this.summary.usId}' reset preserved paths: ${result.preservedPaths.length > 0 ? result.preservedPaths.join(", ") : "(none)"}.`
    );
    this.summary = {
      ...this.summary,
      currentPhase: result.currentPhase,
      status: result.status,
      workBranch: null
    };
    this.playbackState = normalizePlaybackStateAfterManualWorkflowChange(this.playbackState);
    this.clearTransientExecutionPhase();
    this.selectedPhaseId = result.currentPhase;
    appendSpecForgeDebugLog(`Workflow '${this.summary.usId}' debugResetToCaptureAsync requested explorer refresh.`);
    await this.callbacks.refreshExplorer();
    await this.refreshAsync("debugResetToCaptureAsync");
  }

  private async runAutoplayAsync(): Promise<void> {
    try {
      appendSpecForgeLog(`Autoplay loop started for '${this.summary.usId}'.`);
      while (this.playbackState === "playing") {
        const workflow = await this.getBackendClient().getUserStoryWorkflow(this.summary.usId);
        if (!workflow.controls.canContinue) {
          this.playbackState = "paused";
          this.clearTransientExecutionPhase();
          appendSpecForgeLog(
            `Autoplay paused for '${workflow.usId}' because current phase '${workflow.currentPhase}' requires attention.`
          );
          this.callbacks.notifyAttention(`${workflow.usId} requires attention at ${workflow.currentPhase}.`);
          await this.refreshAsync("autoplay:pausedAtBoundary");
          return;
        }

        appendSpecForgeLog(`Autoplay continuing '${workflow.usId}' at phase '${workflow.currentPhase}'.`);
        appendSpecForgeDebugLog(
          `Autoplay loop iteration for '${workflow.usId}'. canContinue=${workflow.controls.canContinue}, requiresApproval=${workflow.controls.requiresApproval}, blockingReason='${workflow.controls.blockingReason ?? "none"}'.`
        );
        await this.continueCurrentPhaseAsync();
      }

      appendSpecForgeLog(`Autoplay loop exited for '${this.summary.usId}' with state '${this.playbackState}'.`);
    } catch (error) {
      if (this.playbackState === "stopping") {
        appendSpecForgeLog(`Autoplay stopping acknowledged for '${this.summary.usId}'.`);
        return;
      }

      this.playbackState = "paused";
      this.clearTransientExecutionPhase();
      await this.refreshAsync("autoplay:error");
      appendSpecForgeLog(`Autoplay failed for '${this.summary.usId}': ${asErrorMessage(error)}`);
      showSpecForgeOutput(false);
      void vscode.window.showErrorMessage(asErrorMessage(error));
    }
  }

  private async renderWorkflowAsync(workflow: UserStoryWorkflowDetails): Promise<number> {
    const selectedPhase = workflow.phases.find((phase) => phase.phaseId === this.selectedPhaseId)
      ?? workflow.phases.find((phase) => phase.isCurrent)
      ?? workflow.phases[0];
    this.selectedPhaseId = selectedPhase.phaseId;
    const selectedArtifactContent = await readArtifactContentAsync(selectedPhase.artifactPath);
    const selectedOperationContent = await readArtifactContentAsync(selectedPhase.operationLogPath);
    const sourceText = await readArtifactContentAsync(workflow.mainArtifactPath) ?? "";
    const settings = getSpecForgeSettings();
    const settingsStatus = getSpecForgeSettingsStatus(settings);
    const contextSuggestions = settings.contextSuggestionsEnabled && workflow.currentPhase === "clarification"
      ? await suggestContextFiles(this.workspaceRoot, workflow, sourceText)
      : [];
    const runtimeVersion = await readRuntimeVersionAsync();
    this.panel.title = `${workflow.usId} workflow`;
    this.panel.webview.html = buildWorkflowHtml(workflow, {
      selectedPhaseId: this.selectedPhaseId,
      selectedArtifactContent,
      selectedOperationContent,
      contextSuggestions,
      settingsConfigured: settingsStatus.executionConfigured,
      settingsMessage: settingsStatus.message,
      runtimeVersion,
      executionPhaseId: this.transientExecutionPhaseId,
      completedPhaseIds: this.transientCompletedPhaseIds,
      debugMode: isSpecForgeDebugLoggingEnabled(),
      approvalBaseBranchProposal: this.refinementApprovalBaseBranchProposal,
      approvalWorkBranchProposal: this.buildRefinementApprovalWorkBranchProposal(workflow),
      requireExplicitApprovalBranchAcceptance: settings.requireExplicitApprovalBranchAcceptance
    }, this.playbackState);
    return contextSuggestions.length;
  }

  private buildRefinementApprovalWorkBranchProposal(workflow: UserStoryWorkflowDetails | null): string {
    if (workflow?.workBranch?.trim()) {
      return workflow.workBranch.trim();
    }

    if (!workflow) {
      return `feature/${this.summary.usId.toLowerCase()}-work`;
    }

    const slug = workflow.title
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "") || "work";
    return `${(workflow.kind?.trim() || "feature")}/${workflow.usId.toLowerCase()}-${slug}`;
  }

  private async renderCachedWorkflowAsync(reason: string): Promise<void> {
    if (!this.lastWorkflow) {
      return;
    }

    appendSpecForgeDebugLog(
      `Workflow '${this.summary.usId}' rendering cached workflow. reason='${reason}', executionPhase='${this.transientExecutionPhaseId ?? "none"}'.`
    );
    await this.renderWorkflowAsync(this.lastWorkflow);
  }

  private belongsToCurrentWorkflow(filePath: string): boolean {
    const normalizedPath = path.normalize(filePath);
    const normalizedDirectory = path.normalize(this.summary.directoryPath);
    return normalizedPath.startsWith(normalizedDirectory + path.sep)
      || normalizedPath === normalizedDirectory;
  }

  private deriveInitialExecutionPhaseId(): string {
    return this.summary.currentPhase === "capture"
      ? "clarification"
      : this.summary.currentPhase;
  }

  private deriveExecutionPhaseFromWatchedPath(filePath: string): string | null {
    const normalizedPath = filePath.replace(/\\/g, "/");
    if (normalizedPath.endsWith("/clarification.md") || normalizedPath.endsWith("/phases/00-clarification.md")) {
      return "refinement";
    }

    if (normalizedPath.endsWith("/phases/01-spec.md") || normalizedPath.endsWith("/phases/01-refinement.md")) {
      return "refinement";
    }

    return null;
  }

  private setTransientExecutionPhase(phaseId: string): void {
    this.transientExecutionPhaseId = phaseId;
    this.transientCompletedPhaseIds = this.computeCompletedPhaseIds(phaseId);
  }

  private clearTransientExecutionPhase(): void {
    this.transientExecutionPhaseId = null;
    this.transientCompletedPhaseIds = [];
  }

  private computeCompletedPhaseIds(executionPhaseId: string): readonly string[] {
    const phaseOrder = ["capture", "clarification", "refinement", "technical-design", "implementation", "review", "release-approval", "pr-preparation"];
    const executionPhaseIndex = phaseOrder.indexOf(executionPhaseId);
    if (executionPhaseIndex <= 0) {
      return [];
    }

    return phaseOrder.slice(0, executionPhaseIndex);
  }
}

async function readArtifactContentAsync(artifactPath: string | null | undefined): Promise<string | null> {
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
