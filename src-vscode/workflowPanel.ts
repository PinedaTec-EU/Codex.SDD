import * as fs from "node:fs";
import * as path from "node:path";
import * as vscode from "vscode";
import type { SpecForgeBackendClient, UserStorySummary, UserStoryWorkflowDetails } from "./backendClient";
import { suggestContextFiles } from "./contextSuggestions";
import { getSpecForgeSettings, getSpecForgeSettingsStatus } from "./extensionSettings";
import { appendSpecForgeDebugLog, appendSpecForgeLog, isSpecForgeDebugLoggingEnabled, showSpecForgeOutput } from "./outputChannel";
import { readRuntimeVersionAsync } from "./runtimeVersion";
import { getCurrentActor } from "./userActor";
import { hasReachedImplementationReviewCycleLimit } from "./workflowAutomation";
import {
  canPauseWorkflowExecutionPhase,
  normalizePlaybackStateAfterManualWorkflowChange,
  resolveWorkflowExecutionPhaseId
} from "./workflowPlaybackState";
import { buildWorkBranchProposal } from "./workflowBranchName";
import { resolveWorkflowRejectPlan } from "./workflowRejectPlan";
import { buildWorkflowHtml } from "./workflowView";
import { readUserWorkspacePreferences, setPausedWorkflowPhaseIds } from "./userWorkspacePreferences";
import { asErrorMessage, getNextAttachmentPathAsync } from "./utils";

type WorkflowPanelCommand =
  | { readonly command: "selectPhase"; readonly phaseId?: string }
  | { readonly command: "selectIteration"; readonly path?: string }
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
  | { readonly command: "reject"; readonly reason?: string }
  | { readonly command: "regress"; readonly phaseId?: string }
  | { readonly command: "rewind"; readonly phaseId?: string }
  | { readonly command: "submitClarificationAnswers"; readonly answers?: string[] }
  | { readonly command: "submitApprovalAnswer"; readonly question?: string; readonly answer?: string }
  | { readonly command: "submitPhaseInput"; readonly prompt?: string }
  | { readonly command: "sendReviewToImplementation"; readonly prompt?: string }
  | { readonly command: "play" }
  | { readonly command: "pause" }
  | { readonly command: "togglePhasePause"; readonly phaseId?: string }
  | { readonly command: "stop" };

type WorkflowExecutionRequest = {
  readonly kind: "replay-current" | "autoplay";
  readonly phaseId: string;
  readonly logMessage: string;
};

const panels = new Map<string, WorkflowPanelController>();

export interface WorkflowPanelCallbacks {
  refreshExplorer(): Promise<void>;
  notifyAttention(message: string): void;
  stopBackend(workspaceRoot: string): void;
  setActiveWorkflowUsId(usId: string | null): void;
  applyPendingExecutionSettings(workspaceRoot: string): boolean;
  hasPendingExecutionSettings(workspaceRoot: string): boolean;
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
  private selectedIterationArtifactPath: string | null = null;
  private playbackState: "idle" | "playing" | "paused" | "stopping" = "idle";
  private playbackStartedAtMs: number | null = null;
  private autoplayPromise: Promise<void> | null = null;
  private lastWorkflow: UserStoryWorkflowDetails | null = null;
  private transientExecutionPhaseId: string | null = null;
  private transientCompletedPhaseIds: readonly string[] = [];
  private readonly pausedPhaseIds = new Set<string>();
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
      this.callbacks.setActiveWorkflowUsId(null);
      panels.delete(this.key);
    });
    this.panel.onDidChangeViewState((event) => {
      if (event.webviewPanel.active) {
        this.callbacks.setActiveWorkflowUsId(this.summary.usId);
      }
    });

    this.panel.webview.onDidReceiveMessage(async (message: WorkflowPanelCommand) => {
      try {
        appendSpecForgeLog(`Workflow '${this.summary.usId}' received command '${message.command}'.`);
        await this.handleMessageAsync(message);
      } catch (error) {
        this.playbackState = this.playbackState === "playing" || this.playbackState === "stopping"
          ? "paused"
          : "idle";
        appendSpecForgeDebugLog(
          `Workflow '${this.summary.usId}' command '${message.command}' failed. playback reset to '${this.playbackState}'.`
        );
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
    this.callbacks.setActiveWorkflowUsId(this.summary.usId);
    await this.loadPausedPhaseIdsAsync();
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
          this.selectedIterationArtifactPath = null;
          await this.refreshAsync("command:selectPhase");
        }
        return;
      case "selectIteration":
        this.selectedIterationArtifactPath = message.path?.trim() || null;
        await this.renderCachedWorkflowAsync("command:selectIteration");
        return;
      case "openArtifact":
      case "openPrompt":
      case "openAttachment":
        if (message.path) {
          await openTextDocument(message.path);
        }
        return;
      case "openSettings":
        await vscode.commands.executeCommand("specForge.openExecutionSettings");
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
        await this.requestWorkflowExecutionAsync("command:continue", "detail continue");
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
      case "reject":
        await this.rejectCurrentApprovalAsync(message.reason);
        return;
      case "rewind":
        if (message.phaseId) {
          await this.rewindWorkflowAsync(message.phaseId);
        }
        return;
      case "submitClarificationAnswers":
        await this.submitClarificationAnswersAsync(message.answers ?? []);
        return;
      case "submitApprovalAnswer":
        if (message.question && message.answer) {
          await this.submitApprovalAnswerAsync(message.question, message.answer);
        }
        return;
      case "submitPhaseInput":
        if (message.prompt) {
          await this.submitPhaseInputAsync(message.prompt);
        }
        return;
      case "sendReviewToImplementation":
        if (message.prompt) {
          await this.sendReviewToImplementationAsync(message.prompt);
        }
        return;
      case "play":
        await this.requestWorkflowExecutionAsync("command:play", "play");
        return;
      case "pause":
        await this.armNextPhasePauseAsync("toolbar pause");
        await this.refreshAsync("command:pause");
        return;
      case "togglePhasePause":
        if (message.phaseId) {
          this.togglePhasePause(message.phaseId);
          await this.persistPausedPhaseIdsAsync();
        }
        await this.refreshAsync("command:togglePhasePause");
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
    const result = await this.getBackendClient().continuePhase(this.summary.usId, getCurrentActor());
    const usageSummary = result.usage
      ? ` Tokens in/out/total: ${result.usage.inputTokens}/${result.usage.outputTokens}/${result.usage.totalTokens}.`
      : "";
    const executionSummary = this.formatExecutionSummary(result.execution);
    appendSpecForgeLog(
      `Workflow '${this.summary.usId}' advanced from '${previousPhase}' to '${result.currentPhase}' with status '${result.status}'.${executionSummary}${usageSummary}`
    );
    this.logExecutionWarnings(result.execution);
    this.summary = {
      ...this.summary,
      currentPhase: result.currentPhase,
      status: result.status
    };
    this.playbackState = normalizePlaybackStateAfterManualWorkflowChange(this.playbackState);
    this.selectedPhaseId = result.currentPhase;
    this.clearTransientExecutionPhase();
    await this.pauseOnFailedReviewIfConfiguredAsync(result.currentPhase, result.generatedArtifactPath, "continue");
    this.applyDeferredExecutionSettingsAfterPhaseChange(previousPhase, result.currentPhase, "continue");
    appendSpecForgeDebugLog(`Workflow '${this.summary.usId}' continueCurrentPhaseAsync requested explorer refresh.`);
    await this.callbacks.refreshExplorer();
    await this.refreshAsync("continueCurrentPhaseAsync");
    await this.maybeAutoReviewAfterImplementationAsync("continue");
  }

  private async replayCurrentPhaseDirectlyAsync(reason: string, phaseId: string): Promise<void> {
    if (this.playbackState !== "playing") {
      this.playbackStartedAtMs = Date.now();
    }

    this.playbackState = "playing";
    this.setTransientExecutionPhase(phaseId);
    await this.refreshAsync(reason);

    try {
      await this.continueCurrentPhaseAsync();
    } finally {
      if (this.playbackState === "playing") {
        this.playbackState = "idle";
        this.playbackStartedAtMs = null;
        this.clearTransientExecutionPhase();
        await this.refreshAsync(`${reason}:completed`);
      }
    }
  }

  private async requestWorkflowExecutionAsync(
    reason: string,
    sourceLabel: string,
    options: {
      allowCurrentPhaseReplay?: boolean;
      openSettingsWhenUnconfigured?: boolean;
      notifyWhenBlocked?: boolean;
    } = {}
  ): Promise<boolean> {
    const {
      allowCurrentPhaseReplay = true,
      openSettingsWhenUnconfigured = true,
      notifyWhenBlocked = true
    } = options;

    if (!this.isExecutionConfigured()) {
      if (openSettingsWhenUnconfigured) {
        await vscode.commands.executeCommand("specForge.openExecutionSettings");
      }
      return false;
    }

    const workflow = this.lastWorkflow ?? await this.getBackendClient().getUserStoryWorkflow(this.summary.usId);
    this.lastWorkflow = workflow;
    const request = this.resolveWorkflowExecutionRequest(workflow, sourceLabel, allowCurrentPhaseReplay);
    await this.focusPhaseForAction(workflow.currentPhase, `${reason}:focus-current`);
    if (!request) {
      appendSpecForgeLog(
        `Workflow '${this.summary.usId}' did not execute from ${sourceLabel} because current phase '${workflow.currentPhase}' requires attention.`
      );
      if (notifyWhenBlocked) {
        this.callbacks.notifyAttention(`${workflow.usId} requires attention at ${workflow.currentPhase}.`);
      }
      await this.refreshAsync(`${reason}:blocked`);
      return false;
    }

    appendSpecForgeLog(request.logMessage);
    await this.focusPhaseForAction(request.phaseId, `${reason}:focus-target`);
    if (request.kind === "replay-current") {
      await this.replayCurrentPhaseDirectlyAsync(reason, request.phaseId);
      return true;
    }

    await this.startAutoplayAsync(reason);
    return true;
  }

  private resolveWorkflowExecutionRequest(
    workflow: UserStoryWorkflowDetails,
    sourceLabel: string,
    allowCurrentPhaseReplay: boolean
  ): WorkflowExecutionRequest | null {
    if (allowCurrentPhaseReplay && this.canReplayCurrentPhase(workflow)) {
      return {
        kind: "replay-current",
        phaseId: workflow.currentPhase,
        logMessage: `Direct phase replay requested from ${sourceLabel} for '${this.summary.usId}' at phase '${workflow.currentPhase}'.`
      };
    }

    if (!workflow.controls.canContinue) {
      return null;
    }

    return {
      kind: "autoplay",
      phaseId: this.resolveExecutionPhaseIdForWorkflow(workflow) ?? workflow.currentPhase,
      logMessage: `Autoplay requested from ${sourceLabel} for '${this.summary.usId}' at phase '${workflow.currentPhase}'.`
    };
  }

  private async submitClarificationAnswersAsync(answers: string[]): Promise<void> {
    await this.getBackendClient().submitClarificationAnswers(this.summary.usId, answers, getCurrentActor());
    appendSpecForgeLog(`Workflow '${this.summary.usId}' stored ${answers.length} clarification answer(s).`);
    this.playbackState = normalizePlaybackStateAfterManualWorkflowChange(this.playbackState);
    this.clearTransientExecutionPhase();
    appendSpecForgeDebugLog(`Workflow '${this.summary.usId}' submitClarificationAnswersAsync requested explorer refresh.`);
    await this.callbacks.refreshExplorer();
    await this.refreshAsync("submitClarificationAnswersAsync");
    await this.maybeAutoPlayAfterManualContinuationAsync("clarification answers");
  }

  private async submitPhaseInputAsync(prompt: string): Promise<void> {
    const normalizedPrompt = prompt.trim();
    if (normalizedPrompt.length === 0) {
      return;
    }

    const previousPhase = this.summary.currentPhase;
    const result = await this.getBackendClient().operateCurrentPhaseArtifact(this.summary.usId, normalizedPrompt, getCurrentActor());
    appendSpecForgeLog(
      `Workflow '${this.summary.usId}' regenerated phase '${result.currentPhase}' after human input.${this.formatExecutionSummary(result.execution)}`
    );
    this.logExecutionWarnings(result.execution);
    this.summary = {
      ...this.summary,
      currentPhase: result.currentPhase,
      status: result.status
    };
    this.playbackState = normalizePlaybackStateAfterManualWorkflowChange(this.playbackState);
    this.clearTransientExecutionPhase();
    this.selectedPhaseId = result.currentPhase;
    this.applyDeferredExecutionSettingsAfterPhaseChange(previousPhase, result.currentPhase, "phase input");
    appendSpecForgeDebugLog(`Workflow '${this.summary.usId}' submitPhaseInputAsync requested explorer refresh.`);
    await this.callbacks.refreshExplorer();
    await this.refreshAsync("submitPhaseInputAsync");
    await this.maybeAutoReviewAfterImplementationAsync("phase input");
  }

  private async sendReviewToImplementationAsync(prompt: string): Promise<void> {
    const normalizedPrompt = prompt.trim();
    if (normalizedPrompt.length === 0) {
      return;
    }

    const previousPhase = this.summary.currentPhase;
    await this.focusPhaseForAction("implementation", "sendReviewToImplementationAsync:focus");
    const regressionReason = normalizedPrompt.split(/\r?\n/, 1)[0]?.trim() || "Review requested an implementation correction.";
    const regression = await this.getBackendClient().requestRegression(
      this.summary.usId,
      "implementation",
      regressionReason,
      getCurrentActor(),
      getSpecForgeSettings().destructiveRewindEnabled
    );
    appendSpecForgeLog(
      `Workflow '${this.summary.usId}' regressed from review to implementation for a model-applied correction.`
    );
    this.summary = {
      ...this.summary,
      currentPhase: regression.currentPhase,
      status: regression.status
    };

    const operationPrompt = [
      "Apply the following review feedback to the current implementation artifact.",
      "Use the latest review artifact as corrective context and preserve approved scope unless the feedback explicitly changes it.",
      "",
      normalizedPrompt
    ].join("\n");
    const operation = await this.getBackendClient().operateCurrentPhaseArtifact(this.summary.usId, operationPrompt, getCurrentActor());
    appendSpecForgeLog(
      `Workflow '${this.summary.usId}' applied review feedback over implementation.${this.formatExecutionSummary(operation.execution)}`
    );
    this.logExecutionWarnings(operation.execution);
    this.summary = {
      ...this.summary,
      currentPhase: operation.currentPhase,
      status: operation.status
    };
    this.playbackState = normalizePlaybackStateAfterManualWorkflowChange(this.playbackState);
    this.clearTransientExecutionPhase();
    this.selectedPhaseId = operation.currentPhase;
    this.applyDeferredExecutionSettingsAfterPhaseChange(previousPhase, operation.currentPhase, "review-to-implementation");
    appendSpecForgeDebugLog(`Workflow '${this.summary.usId}' sendReviewToImplementationAsync requested explorer refresh.`);
    await this.callbacks.refreshExplorer();
    await this.refreshAsync("sendReviewToImplementationAsync");
    await this.maybeAutoReviewAfterImplementationAsync("review correction");
  }

  private async submitApprovalAnswerAsync(question: string, answer: string): Promise<void> {
    const previousPhase = this.summary.currentPhase;
    const result = await this.getBackendClient().submitApprovalAnswer(
      this.summary.usId,
      question,
      answer,
      getCurrentActor()
    );
    appendSpecForgeLog(
      `Workflow '${this.summary.usId}' recorded a human approval answer and generated '${result.generatedArtifactPath}'.`
    );
    this.summary = {
      ...this.summary,
      currentPhase: result.currentPhase,
      status: result.status
    };
    this.playbackState = normalizePlaybackStateAfterManualWorkflowChange(this.playbackState);
    this.clearTransientExecutionPhase();
    this.selectedPhaseId = result.currentPhase;
    this.applyDeferredExecutionSettingsAfterPhaseChange(previousPhase, result.currentPhase, "approval answer");
    appendSpecForgeDebugLog(`Workflow '${this.summary.usId}' submitApprovalAnswerAsync requested explorer refresh.`);
    await this.callbacks.refreshExplorer();
    await this.refreshAsync("submitApprovalAnswerAsync");
  }

  private isExecutionConfigured(): boolean {
    return getSpecForgeSettingsStatus(getSpecForgeSettings()).executionConfigured;
  }

  private logExecutionWarnings(execution?: { readonly warnings?: readonly string[] | null } | null): void {
    if (!execution?.warnings || execution.warnings.length === 0) {
      return;
    }

    for (const warning of execution.warnings) {
      appendSpecForgeLog(`Workflow '${this.summary.usId}' system prompt warning: ${warning}`);
    }
  }

  private formatExecutionSummary(
    execution?: { readonly model: string; readonly profileName: string | null } | null
  ): string {
    if (!execution) {
      return "";
    }

    const settings = getSpecForgeSettings();
    const configuredModel = execution.profileName
      ? settings.modelProfiles.find((profile) => profile.name === execution.profileName)?.model?.trim() ?? ""
      : "";
    const normalizedExecutionModel = execution.model.trim();
    const normalizedProfileName = execution.profileName?.trim().toLowerCase() ?? "";
    const suspiciousExecutionModel = normalizedExecutionModel.length === 0
      || normalizedExecutionModel.toLowerCase() === normalizedProfileName
      || (configuredModel.length > 0 && normalizedExecutionModel.toLowerCase() !== configuredModel.toLowerCase());
    const displayModel = configuredModel.length > 0
      ? configuredModel
      : suspiciousExecutionModel
        ? ""
        : normalizedExecutionModel;

    if (execution.profileName?.trim() && displayModel) {
      return ` Model: ${execution.profileName} / ${displayModel}.`;
    }

    if (execution.profileName?.trim()) {
      return ` Model: ${execution.profileName}.`;
    }

    if (displayModel) {
      return ` Model: ${displayModel}.`;
    }

    return "";
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
    await this.focusPhaseForAction(this.summary.currentPhase, "approveCurrentPhaseAsync:focus");
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
    appendSpecForgeLog(
      `Workflow '${this.summary.usId}' approved phase '${this.summary.currentPhase}' with base='${normalizedBaseBranch ?? "(none)"}' and work='${normalizedWorkBranch ?? "(none)"}'.`
    );
    this.playbackState = normalizePlaybackStateAfterManualWorkflowChange(this.playbackState);
    this.clearTransientExecutionPhase();
    appendSpecForgeDebugLog(`Workflow '${this.summary.usId}' approveCurrentPhaseAsync requested explorer refresh.`);
    await this.callbacks.refreshExplorer();
    await this.refreshAsync("approveCurrentPhaseAsync");
    await this.maybeAutoPlayAfterManualContinuationAsync("approval");
  }

  private async requestRegressionAsync(targetPhase: string): Promise<void> {
    const previousPhase = this.summary.currentPhase;
    const settings = getSpecForgeSettings();
    const destructiveRewindEnabled = settings.destructiveRewindEnabled;
    const reason = await vscode.window.showInputBox({
      prompt: `Reason for regression to ${targetPhase}`,
      ignoreFocusOut: true,
      validateInput: (value) => value.trim().length > 0 ? undefined : "Reason is required."
    });

    if (!reason) {
      return;
    }

    await this.focusPhaseForAction(targetPhase, "requestRegressionAsync:focus");

    const result = await this.getBackendClient().requestRegression(
      this.summary.usId,
      targetPhase,
      reason,
      getCurrentActor(),
      destructiveRewindEnabled
    );
    appendSpecForgeLog(
      `Workflow '${this.summary.usId}' regressed to '${result.currentPhase}' with status '${result.status}'${destructiveRewindEnabled ? " using destructive cleanup" : " without deleting later artifacts"}.`
    );
    this.summary = {
      ...this.summary,
      currentPhase: result.currentPhase,
      status: result.status
    };
    this.playbackState = normalizePlaybackStateAfterManualWorkflowChange(this.playbackState);
    this.clearTransientExecutionPhase();
    this.selectedPhaseId = result.currentPhase;
    this.applyDeferredExecutionSettingsAfterPhaseChange(previousPhase, result.currentPhase, "regression");
    appendSpecForgeDebugLog(`Workflow '${this.summary.usId}' requestRegressionAsync requested explorer refresh.`);
    await this.callbacks.refreshExplorer();
    await this.refreshAsync("requestRegressionAsync");
  }

  private async rejectCurrentApprovalAsync(reason?: string): Promise<void> {
    const normalizedReason = reason?.trim() ?? "";
    if (normalizedReason.length === 0) {
      return;
    }

    const rejectPlan = resolveWorkflowRejectPlan(this.summary.currentPhase);
    if (!rejectPlan) {
      throw new Error(`Reject is not supported for phase '${this.summary.currentPhase}'.`);
    }

    const previousPhase = this.summary.currentPhase;
    await this.focusPhaseForAction(
      rejectPlan.mode === "rewind-and-operate" ? rejectPlan.targetPhaseId : this.summary.currentPhase,
      "rejectCurrentApprovalAsync:focus"
    );
    if (rejectPlan.mode === "rewind-and-operate") {
      const rewindResult = await this.getBackendClient().rewindWorkflow(
        this.summary.usId,
        rejectPlan.targetPhaseId,
        getCurrentActor(),
        false
      );
      appendSpecForgeLog(
        `Workflow '${this.summary.usId}' rejected approval, rewound to '${rewindResult.currentPhase}', and will apply the rejection note via model.`
      );
      this.summary = {
        ...this.summary,
        currentPhase: rewindResult.currentPhase,
        status: rewindResult.status
      };
      this.selectedPhaseId = rewindResult.currentPhase;
      this.applyDeferredExecutionSettingsAfterPhaseChange(previousPhase, rewindResult.currentPhase, "reject");
    }

    const operationResult = await this.getBackendClient().operateCurrentPhaseArtifact(
      this.summary.usId,
      normalizedReason,
      getCurrentActor()
    );
    appendSpecForgeLog(
      `Workflow '${this.summary.usId}' applied reject feedback to '${operationResult.currentPhase}' and generated '${operationResult.generatedArtifactPath}'.`
    );
    this.playbackState = normalizePlaybackStateAfterManualWorkflowChange(this.playbackState);
    this.clearTransientExecutionPhase();
    await this.callbacks.refreshExplorer();
    await this.refreshAsync("rejectCurrentApprovalAsync");
  }

  private async restartCurrentWorkflowAsync(): Promise<void> {
    const previousPhase = this.summary.currentPhase;
    const reason = await vscode.window.showInputBox({
      prompt: "Reason for restart from source",
      ignoreFocusOut: true,
      validateInput: (value) => value.trim().length > 0 ? undefined : "Reason is required."
    });

    if (!reason) {
      return;
    }

    await this.focusPhaseForAction(this.summary.currentPhase, "restartCurrentWorkflowAsync:focus");

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
    this.applyDeferredExecutionSettingsAfterPhaseChange(previousPhase, result.currentPhase, "restart");
    appendSpecForgeDebugLog(`Workflow '${this.summary.usId}' restartCurrentWorkflowAsync requested explorer refresh.`);
    await this.callbacks.refreshExplorer();
    await this.refreshAsync("restartCurrentWorkflowAsync");
  }

  private async rewindWorkflowAsync(targetPhase: string): Promise<void> {
    const previousPhase = this.summary.currentPhase;
    const settings = getSpecForgeSettings();
    const destructiveRewindEnabled = settings.destructiveRewindEnabled;
    const confirmation = await vscode.window.showWarningMessage(
      destructiveRewindEnabled
        ? `Rewind ${this.summary.usId} to ${targetPhase} and delete all later derived artifacts?`
        : `Rewind ${this.summary.usId} to ${targetPhase} without deleting later artifacts?`,
      { modal: true },
      "Rewind Workflow"
    );

    if (confirmation !== "Rewind Workflow") {
      return;
    }

    await this.focusPhaseForAction(targetPhase, "rewindWorkflowAsync:focus");

    const result = await this.getBackendClient().rewindWorkflow(this.summary.usId, targetPhase, getCurrentActor(), destructiveRewindEnabled);
    appendSpecForgeLog(
      `Workflow '${this.summary.usId}' was rewound to '${result.currentPhase}' with status '${result.status}'${destructiveRewindEnabled ? " using destructive cleanup" : " without deleting later artifacts"}.`
    );
    appendSpecForgeDebugLog(
      `Workflow '${this.summary.usId}' rewind deleted paths: ${result.deletedPaths.length > 0 ? result.deletedPaths.join(", ") : "(none)"}.`
    );
    appendSpecForgeDebugLog(
      `Workflow '${this.summary.usId}' rewind preserved paths: ${result.preservedPaths.length > 0 ? result.preservedPaths.join(", ") : "(none)"}.`
    );
    this.summary = {
      ...this.summary,
      currentPhase: result.currentPhase,
      status: result.status,
      workBranch: destructiveRewindEnabled && (result.currentPhase === "clarification" || result.currentPhase === "refinement")
        ? null
        : this.summary.workBranch
    };
    this.playbackState = normalizePlaybackStateAfterManualWorkflowChange(this.playbackState);
    this.clearTransientExecutionPhase();
    this.selectedPhaseId = result.currentPhase;
    this.selectedIterationArtifactPath = null;
    this.applyDeferredExecutionSettingsAfterPhaseChange(previousPhase, result.currentPhase, "rewind");
    appendSpecForgeDebugLog(`Workflow '${this.summary.usId}' rewindWorkflowAsync requested explorer refresh.`);
    await this.callbacks.refreshExplorer();
    await this.refreshAsync("rewindWorkflowAsync");
  }

  private async debugResetToCaptureAsync(): Promise<void> {
    const previousPhase = this.summary.currentPhase;
    const confirmation = await vscode.window.showWarningMessage(
      `Reset ${this.summary.usId} to capture and delete all generated artifacts after the source?`,
      { modal: true },
      "Reset to Capture"
    );

    if (confirmation !== "Reset to Capture") {
      return;
    }

    await this.focusPhaseForAction("capture", "debugResetToCaptureAsync:focus");

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
    this.applyDeferredExecutionSettingsAfterPhaseChange(previousPhase, result.currentPhase, "reset");
    appendSpecForgeDebugLog(`Workflow '${this.summary.usId}' debugResetToCaptureAsync requested explorer refresh.`);
    await this.callbacks.refreshExplorer();
    await this.refreshAsync("debugResetToCaptureAsync");
  }

  private async runAutoplayAsync(): Promise<void> {
    try {
      appendSpecForgeLog(`Autoplay loop started for '${this.summary.usId}'.`);
      while (this.playbackState === "playing") {
        const workflow = await this.getBackendClient().getUserStoryWorkflow(this.summary.usId);
        const settings = getSpecForgeSettings();
        const executionPhaseId = this.resolveExecutionPhaseIdForWorkflow(workflow);
        const canReplayCurrentPhase = this.canReplayCurrentPhase(workflow);
        if (workflow.currentPhase === "implementation"
          && hasReachedImplementationReviewCycleLimit(workflow, settings.maxImplementationReviewCycles)) {
          this.playbackState = "paused";
          this.setTransientExecutionPhase("implementation");
          appendSpecForgeLog(
            `Autoplay paused for '${workflow.usId}' because the implementation/review loop reached the configured limit (${settings.maxImplementationReviewCycles}).`
          );
          await this.refreshAsync("autoplay:implementationReviewLimit");
          return;
        }

        if (executionPhaseId && this.isPhasePauseArmed(executionPhaseId)) {
          this.playbackState = "paused";
          this.setTransientExecutionPhase(executionPhaseId);
          appendSpecForgeLog(
            `Autoplay paused for '${workflow.usId}' before executing phase '${executionPhaseId}' because its phase card pause is armed.`
          );
          appendSpecForgeDebugLog(
            `Workflow '${workflow.usId}' held at phase boundary before '${executionPhaseId}' due to ad hoc phase pause.`
          );
          await this.refreshAsync("autoplay:pausedByPhase");
          return;
        }

        if (!workflow.controls.canContinue && !canReplayCurrentPhase) {
          this.playbackState = "paused";
          this.clearTransientExecutionPhase();
          appendSpecForgeLog(
            `Autoplay paused for '${workflow.usId}' because current phase '${workflow.currentPhase}' requires attention.`
          );
          this.callbacks.notifyAttention(`${workflow.usId} requires attention at ${workflow.currentPhase}.`);
          await this.refreshAsync("autoplay:pausedAtBoundary");
          return;
        }

        appendSpecForgeLog(
          `Autoplay continuing '${workflow.usId}' from phase '${workflow.currentPhase}' into '${executionPhaseId ?? workflow.currentPhase}'.`
        );
        appendSpecForgeDebugLog(
          `Autoplay loop iteration for '${workflow.usId}'. canContinue=${workflow.controls.canContinue}, requiresApproval=${workflow.controls.requiresApproval}, blockingReason='${workflow.controls.blockingReason ?? "none"}'.`
        );
        if (executionPhaseId && !canReplayCurrentPhase) {
          this.setTransientExecutionPhase(executionPhaseId);
        }

        await this.continueCurrentPhaseAsync();
      }

      appendSpecForgeLog(`Autoplay loop exited for '${this.summary.usId}' with state '${this.playbackState}'.`);
    } catch (error) {
      if (this.playbackState === "stopping") {
        appendSpecForgeLog(`Autoplay stopping acknowledged for '${this.summary.usId}'.`);
        return;
      }

      this.playbackState = "paused";
      this.playbackStartedAtMs = null;
      this.clearTransientExecutionPhase();
      await this.refreshAsync("autoplay:error");
      appendSpecForgeLog(`Autoplay failed for '${this.summary.usId}': ${asErrorMessage(error)}`);
      showSpecForgeOutput(false);
      void vscode.window.showErrorMessage(asErrorMessage(error));
    }
  }

  private async startAutoplayAsync(reason: string): Promise<void> {
    appendSpecForgeLog(`Autoplay requested for '${this.summary.usId}'. reason='${reason}'.`);
    if (this.playbackState === "playing" || this.playbackState === "stopping") {
      appendSpecForgeDebugLog(
        `Workflow '${this.summary.usId}' ignored autoplay request because playback is already '${this.playbackState}'. reason='${reason}'.`
      );
      await this.refreshAsync(`${reason}:ignored`);
      return;
    }

    const workflow = this.lastWorkflow ?? await this.getBackendClient().getUserStoryWorkflow(this.summary.usId);
    this.lastWorkflow = workflow;
    const executionPhaseId = this.transientExecutionPhaseId
      ?? this.resolveExecutionPhaseIdForWorkflow(workflow)
      ?? resolveWorkflowExecutionPhaseId(this.summary.currentPhase);

    if (executionPhaseId && this.pausedPhaseIds.delete(executionPhaseId)) {
      await this.persistPausedPhaseIdsAsync();
      appendSpecForgeLog(
        `Workflow '${this.summary.usId}' released ad hoc pause for phase '${executionPhaseId}' because playback resumed from ${reason}.`
      );
    }

    showSpecForgeOutput(true);
    if (this.playbackState !== "paused" || this.playbackStartedAtMs === null) {
      this.playbackStartedAtMs = Date.now();
    }
    this.playbackState = "playing";
    this.setTransientExecutionPhase(executionPhaseId ?? this.deriveInitialExecutionPhaseId());
    if (!this.autoplayPromise) {
      this.autoplayPromise = this.runAutoplayAsync().finally(() => {
        this.autoplayPromise = null;
      });
    }
    await this.refreshAsync(reason);
  }

  private canReplayCurrentPhase(workflow: UserStoryWorkflowDetails): boolean {
    if (workflow.currentPhase !== "review") {
      return false;
    }

    return workflow.controls.blockingReason === "review_failed"
      || workflow.controls.blockingReason === "review_result_missing"
      || workflow.controls.blockingReason === "review_missing_artifact";
  }

  private async maybeAutoPlayAfterManualContinuationAsync(trigger: string): Promise<void> {
    const settings = getSpecForgeSettings();
    if (!settings.autoPlayEnabled) {
      appendSpecForgeDebugLog(
        `Workflow '${this.summary.usId}' did not auto-play after ${trigger} because 'specForge.features.autoPlayEnabled' is false.`
      );
      return;
    }

    const executed = await this.requestWorkflowExecutionAsync(
      `autoPlay:${trigger}`,
      `auto-play after ${trigger}`,
      {
        allowCurrentPhaseReplay: false,
        openSettingsWhenUnconfigured: false,
        notifyWhenBlocked: false
      }
    );
    if (!executed) {
      const workflow = this.lastWorkflow ?? await this.getBackendClient().getUserStoryWorkflow(this.summary.usId);
      this.lastWorkflow = workflow;
      appendSpecForgeDebugLog(
        `Workflow '${this.summary.usId}' did not auto-play after ${trigger} because canContinue=${workflow.controls.canContinue}, requiresApproval=${workflow.controls.requiresApproval}, blockingReason='${workflow.controls.blockingReason ?? "none"}'.`
      );
    }
  }

  private async maybeAutoReviewAfterImplementationAsync(trigger: string): Promise<void> {
    const settings = getSpecForgeSettings();
    if (!settings.autoReviewEnabled) {
      appendSpecForgeDebugLog(
        `Workflow '${this.summary.usId}' did not auto-review after ${trigger} because 'specForge.features.autoReviewEnabled' is false.`
      );
      return;
    }

    const workflow = this.lastWorkflow ?? await this.getBackendClient().getUserStoryWorkflow(this.summary.usId);
    this.lastWorkflow = workflow;
    if (workflow.currentPhase !== "implementation") {
      appendSpecForgeDebugLog(
        `Workflow '${this.summary.usId}' did not auto-review after ${trigger} because current phase is '${workflow.currentPhase}'.`
      );
      return;
    }

    if (hasReachedImplementationReviewCycleLimit(workflow, settings.maxImplementationReviewCycles)) {
      appendSpecForgeLog(
        `Workflow '${this.summary.usId}' stopped automatic review after ${trigger} because the implementation/review loop reached the configured limit (${settings.maxImplementationReviewCycles}).`
      );
      return;
    }

    const executed = await this.requestWorkflowExecutionAsync(
      `autoReview:${trigger}`,
      `auto-review after ${trigger}`,
      {
        allowCurrentPhaseReplay: false,
        openSettingsWhenUnconfigured: false,
        notifyWhenBlocked: false
      }
    );
    if (!executed) {
      appendSpecForgeDebugLog(
        `Workflow '${this.summary.usId}' did not auto-review after ${trigger} because the workflow could not continue from implementation.`
      );
    }
  }

  private async pauseOnFailedReviewIfConfiguredAsync(
    phaseId: string,
    artifactPath: string | null,
    trigger: string
  ): Promise<void> {
    const settings = getSpecForgeSettings();
    if (!settings.pauseOnFailedReview || phaseId !== "review") {
      appendSpecForgeDebugLog(
        `Workflow '${this.summary.usId}' did not apply failed-review pause after ${trigger}. pauseOnFailedReview=${settings.pauseOnFailedReview}, phase='${phaseId}'.`
      );
      return;
    }

    const artifactContent = await readArtifactContentAsync(artifactPath);
    if (!isFailedReviewArtifact(artifactContent)) {
      appendSpecForgeDebugLog(
        `Workflow '${this.summary.usId}' did not apply failed-review pause after ${trigger} because the review artifact is not failed.`
      );
      return;
    }

    this.playbackState = "paused";
    this.playbackStartedAtMs = null;
    this.selectedPhaseId = "review";
    this.setTransientExecutionPhase("review");
    appendSpecForgeLog(
      `Workflow '${this.summary.usId}' paused automatically at failed review because 'specForge.features.pauseOnFailedReview' is enabled.`
    );
  }

  private async renderWorkflowAsync(workflow: UserStoryWorkflowDetails): Promise<number> {
    const selectedPhase = workflow.phases.find((phase) => phase.phaseId === this.selectedPhaseId)
      ?? workflow.phases.find((phase) => phase.isCurrent)
      ?? workflow.phases[0];
    this.selectedPhaseId = selectedPhase.phaseId;
    const iterationArtifactPaths = workflow.events
      .filter((event) => event.phase === selectedPhase.phaseId)
      .flatMap((event) => event.artifacts)
      .filter((artifactPath) => artifactPath.toLowerCase().endsWith(".md"));
    const selectedArtifactPath = this.selectedIterationArtifactPath && iterationArtifactPaths.includes(this.selectedIterationArtifactPath)
      ? this.selectedIterationArtifactPath
      : selectedPhase.phaseId === "capture"
        ? workflow.mainArtifactPath
      : selectedPhase.artifactPath;
    if (selectedArtifactPath !== this.selectedIterationArtifactPath) {
      this.selectedIterationArtifactPath = selectedArtifactPath ?? null;
    }
    const selectedArtifactContent = await readArtifactContentAsync(selectedArtifactPath);
    const selectedOperationContent = await readArtifactContentAsync(selectedPhase.operationLogPath);
    const sourceText = await readArtifactContentAsync(workflow.mainArtifactPath) ?? "";
    const settings = getSpecForgeSettings();
    const settingsStatus = getSpecForgeSettingsStatus(settings);
    if (!settingsStatus.executionConfigured) {
      appendSpecForgeLog(`Workflow settings warning for '${this.workspaceRoot}' (${workflow.usId}): ${settingsStatus.message}. Diagnostics: ${settingsStatus.diagnostics}`);
    }
    const contextSuggestions = settings.contextSuggestionsEnabled && workflow.currentPhase === "clarification"
      ? await suggestContextFiles(this.workspaceRoot, workflow, sourceText)
      : [];
    const runtimeVersion = await readRuntimeVersionAsync();
    this.panel.title = `${workflow.usId} workflow`;
    this.panel.webview.html = buildWorkflowHtml(workflow, {
      selectedPhaseId: this.selectedPhaseId,
      selectedIterationArtifactPath: this.selectedIterationArtifactPath,
      selectedArtifactContent,
      selectedOperationContent,
      contextSuggestions,
      settingsConfigured: settingsStatus.executionConfigured,
      settingsMessage: settingsStatus.message,
      modelProfiles: settings.modelProfiles.map((profile) => ({
        name: profile.name,
        model: profile.model
      })),
      phaseModelAssignments: settings.effectivePhaseModelAssignments,
      runtimeVersion,
      executionPhaseId: this.transientExecutionPhaseId,
      pausedPhaseIds: [...this.pausedPhaseIds],
      completedPhaseIds: this.transientCompletedPhaseIds,
      playbackStartedAtMs: this.playbackStartedAtMs,
      executionSettingsPending: this.callbacks.hasPendingExecutionSettings(this.workspaceRoot),
      executionSettingsPendingMessage: this.callbacks.hasPendingExecutionSettings(this.workspaceRoot)
        ? "Execution settings changed while this phase was running. SpecForge.AI will reload the setup after the workflow enters the next phase."
        : null,
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

    return buildWorkBranchProposal(workflow.usId, workflow.title, workflow.kind?.trim() || "feature");
  }

  private async focusPhaseForAction(phaseId: string, reason: string): Promise<void> {
    if (!phaseId || this.selectedPhaseId === phaseId) {
      return;
    }

    this.selectedPhaseId = phaseId;
    this.selectedIterationArtifactPath = null;
    await this.renderCachedWorkflowAsync(reason);
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
    return resolveWorkflowExecutionPhaseId(this.summary.currentPhase) ?? this.summary.currentPhase;
  }

  private deriveExecutionPhaseFromWatchedPath(filePath: string): string | null {
    const normalizedPath = filePath.replace(/\\/g, "/");
    // clarification.md is the input to refinement: when it changes (human answered questions),
    // drive the UI progress indicator to "refinement" rather than "clarification".
    if (normalizedPath.endsWith("/clarification.md") || normalizedPath.endsWith("/phases/00-clarification.md")) {
      return "refinement";
    }

    // 01-spec.md / 01-refinement.md are the refinement artifact; show refinement as the active phase.
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
    if (this.playbackState === "idle" || this.playbackState === "stopping") {
      this.playbackStartedAtMs = null;
    }
  }

  private computeCompletedPhaseIds(executionPhaseId: string): readonly string[] {
    const phaseOrder = ["capture", "clarification", "refinement", "technical-design", "implementation", "review", "release-approval", "pr-preparation"];
    const executionPhaseIndex = phaseOrder.indexOf(executionPhaseId);
    if (executionPhaseIndex <= 0) {
      return [];
    }

    return phaseOrder.slice(0, executionPhaseIndex);
  }

  private applyDeferredExecutionSettingsAfterPhaseChange(previousPhase: string, nextPhase: string, trigger: string): void {
    if (previousPhase === nextPhase) {
      return;
    }

    if (!this.callbacks.applyPendingExecutionSettings(this.workspaceRoot)) {
      return;
    }

    appendSpecForgeLog(
      `Workflow '${this.summary.usId}' applied deferred execution settings after ${trigger}. Phase changed from '${previousPhase}' to '${nextPhase}'.`
    );
  }

  private resolveExecutionPhaseIdForWorkflow(workflow: UserStoryWorkflowDetails): string | null {
    return workflow.controls.executionPhase ?? resolveWorkflowExecutionPhaseId(workflow.currentPhase);
  }

  private isPhasePauseArmed(phaseId: string): boolean {
    return this.pausedPhaseIds.has(phaseId);
  }

  private togglePhasePause(phaseId: string): void {
    if (!canPauseWorkflowExecutionPhase(phaseId)) {
      appendSpecForgeDebugLog(
        `Workflow '${this.summary.usId}' ignored phase pause toggle for non-executable phase '${phaseId}'.`
      );
      return;
    }

    if (this.pausedPhaseIds.has(phaseId)) {
      this.pausedPhaseIds.delete(phaseId);
      appendSpecForgeLog(`Workflow '${this.summary.usId}' cleared ad hoc pause for phase '${phaseId}'.`);
      return;
    }

    this.pausedPhaseIds.add(phaseId);
    appendSpecForgeLog(`Workflow '${this.summary.usId}' armed ad hoc pause for phase '${phaseId}'.`);
  }

  private async loadPausedPhaseIdsAsync(): Promise<void> {
    const preferences = await readUserWorkspacePreferences(this.workspaceRoot);
    this.pausedPhaseIds.clear();
    for (const phaseId of preferences.pausedWorkflowPhaseIdsByUsId[this.summary.usId] ?? []) {
      if (!canPauseWorkflowExecutionPhase(phaseId)) {
        continue;
      }

      this.pausedPhaseIds.add(phaseId);
    }
    appendSpecForgeDebugLog(
      `Workflow '${this.summary.usId}' restored ${this.pausedPhaseIds.size} persisted phase pause(s).`
    );
  }

  private async persistPausedPhaseIdsAsync(): Promise<void> {
    await setPausedWorkflowPhaseIds(this.workspaceRoot, this.summary.usId, [...this.pausedPhaseIds]);
    appendSpecForgeDebugLog(
      `Workflow '${this.summary.usId}' persisted ${this.pausedPhaseIds.size} phase pause(s).`
    );
  }

  private async armNextPhasePauseAsync(origin: string): Promise<void> {
    const workflow = this.lastWorkflow ?? await this.getBackendClient().getUserStoryWorkflow(this.summary.usId);
    this.lastWorkflow = workflow;
    const executionPhaseId = this.transientExecutionPhaseId
      ?? this.resolveExecutionPhaseIdForWorkflow(workflow)
      ?? resolveWorkflowExecutionPhaseId(this.summary.currentPhase);

    if (!executionPhaseId) {
      appendSpecForgeDebugLog(
        `Workflow '${this.summary.usId}' could not arm next phase pause from ${origin} because no later executable phase was found.`
      );
      return;
    }

    if (!this.pausedPhaseIds.has(executionPhaseId)) {
      this.pausedPhaseIds.add(executionPhaseId);
      await this.persistPausedPhaseIdsAsync();
      appendSpecForgeLog(
        `Workflow '${this.summary.usId}' armed ad hoc pause for next phase '${executionPhaseId}' from ${origin}.`
      );
      return;
    }

    appendSpecForgeDebugLog(
      `Workflow '${this.summary.usId}' left next phase '${executionPhaseId}' paused because it was already armed from ${origin}.`
    );
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

function isFailedReviewArtifact(content: string | null): boolean {
  if (!content) {
    return false;
  }

  return /-\s*(Result|Final result):\s*`?fail`?/i.test(content);
}

async function openTextDocument(filePath: string): Promise<void> {
  const document = await vscode.workspace.openTextDocument(filePath);
  await vscode.window.showTextDocument(document, { preview: false });
}
