"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.openWorkflowView = openWorkflowView;
exports.refreshWorkflowViews = refreshWorkflowViews;
exports.notifyWorkflowFileChanged = notifyWorkflowFileChanged;
exports.hasActiveWorkflowPlayback = hasActiveWorkflowPlayback;
exports.closeWorkflowView = closeWorkflowView;
const fs = __importStar(require("node:fs"));
const path = __importStar(require("node:path"));
const vscode = __importStar(require("vscode"));
const contextSuggestions_1 = require("./contextSuggestions");
const extensionSettings_1 = require("./extensionSettings");
const outputChannel_1 = require("./outputChannel");
const runtimeVersion_1 = require("./runtimeVersion");
const userActor_1 = require("./userActor");
const workflowAutomation_1 = require("./workflowAutomation");
const workflowPlaybackState_1 = require("./workflowPlaybackState");
const workflowBranchName_1 = require("./workflowBranchName");
const workflowRejectPlan_1 = require("./workflowRejectPlan");
const workflowView_1 = require("./workflowView");
const userWorkspacePreferences_1 = require("./userWorkspacePreferences");
const utils_1 = require("./utils");
const panels = new Map();
async function openWorkflowView(workspaceRoot, summary, getBackendClient, callbacks) {
    const panelId = `${workspaceRoot}:${summary.usId}`;
    let controller = panels.get(panelId);
    if (!controller) {
        controller = new WorkflowPanelController(workspaceRoot, summary, getBackendClient, callbacks);
        panels.set(panelId, controller);
    }
    await controller.showAsync();
}
async function refreshWorkflowViews(reason = "external") {
    for (const panel of panels.values()) {
        await panel.refreshAsync(reason);
    }
}
function notifyWorkflowFileChanged(filePath) {
    for (const panel of panels.values()) {
        panel.onWatchedFileChanged(filePath);
    }
}
function hasActiveWorkflowPlayback() {
    for (const panel of panels.values()) {
        if (panel.hasActivePlayback()) {
            return true;
        }
    }
    return false;
}
function closeWorkflowView(workspaceRoot, usId) {
    panels.get(`${workspaceRoot}:${usId}`)?.dispose();
}
class WorkflowPanelController {
    workspaceRoot;
    summary;
    getBackendClient;
    callbacks;
    panel;
    selectedPhaseId;
    selectedIterationArtifactPath = null;
    playbackState = "idle";
    playbackStartedAtMs = null;
    autoplayPromise = null;
    lastWorkflow = null;
    transientExecutionPhaseId = null;
    transientCompletedPhaseIds = [];
    pausedPhaseIds = new Set();
    refinementApprovalBaseBranchProposal = "main";
    constructor(workspaceRoot, summary, getBackendClient, callbacks) {
        this.workspaceRoot = workspaceRoot;
        this.summary = summary;
        this.getBackendClient = getBackendClient;
        this.callbacks = callbacks;
        this.selectedPhaseId = summary.currentPhase;
        this.panel = vscode.window.createWebviewPanel("specForge.workflowView", `${summary.usId} workflow`, vscode.ViewColumn.Active, {
            enableScripts: true,
            retainContextWhenHidden: true
        });
        this.panel.onDidDispose(() => {
            this.callbacks.setActiveWorkflowUsId(null);
            panels.delete(this.key);
        });
        this.panel.onDidChangeViewState((event) => {
            if (event.webviewPanel.active) {
                this.callbacks.setActiveWorkflowUsId(this.summary.usId);
            }
        });
        this.panel.webview.onDidReceiveMessage(async (message) => {
            try {
                (0, outputChannel_1.appendSpecForgeLog)(`Workflow '${this.summary.usId}' received command '${message.command}'.`);
                await this.handleMessageAsync(message);
            }
            catch (error) {
                this.playbackState = this.playbackState === "playing" || this.playbackState === "stopping"
                    ? "paused"
                    : "idle";
                (0, outputChannel_1.appendSpecForgeDebugLog)(`Workflow '${this.summary.usId}' command '${message.command}' failed. playback reset to '${this.playbackState}'.`);
                await this.refreshAsync();
                (0, outputChannel_1.appendSpecForgeLog)(`Workflow '${this.summary.usId}' command '${message.command}' failed: ${(0, utils_1.asErrorMessage)(error)}`);
                (0, outputChannel_1.showSpecForgeOutput)(false);
                void vscode.window.showErrorMessage((0, utils_1.asErrorMessage)(error));
            }
        });
    }
    get key() {
        return `${this.workspaceRoot}:${this.summary.usId}`;
    }
    async showAsync() {
        this.panel.reveal(vscode.ViewColumn.Active);
        this.callbacks.setActiveWorkflowUsId(this.summary.usId);
        await this.loadPausedPhaseIdsAsync();
        await this.refreshAsync("showAsync");
    }
    dispose() {
        this.panel.dispose();
    }
    hasActivePlayback() {
        return this.playbackState === "playing" || this.playbackState === "stopping";
    }
    onWatchedFileChanged(filePath) {
        if (this.playbackState !== "playing" || !this.belongsToCurrentWorkflow(filePath)) {
            return;
        }
        const nextExecutionPhaseId = this.deriveExecutionPhaseFromWatchedPath(filePath);
        if (!nextExecutionPhaseId || nextExecutionPhaseId === this.transientExecutionPhaseId) {
            return;
        }
        this.setTransientExecutionPhase(nextExecutionPhaseId);
        (0, outputChannel_1.appendSpecForgeDebugLog)(`Workflow '${this.summary.usId}' advanced local playback visualization to '${nextExecutionPhaseId}' from watcher path '${filePath}'.`);
        void this.renderCachedWorkflowAsync("watcherPlaybackProgress");
    }
    async refreshAsync(reason = "unspecified") {
        (0, outputChannel_1.appendSpecForgeDebugLog)(`Workflow '${this.summary.usId}' refresh start. reason='${reason}', selectedPhase='${this.selectedPhaseId}', playback='${this.playbackState}', summaryPhase='${this.summary.currentPhase}'.`);
        const workflow = await this.getBackendClient().getUserStoryWorkflow(this.summary.usId);
        this.lastWorkflow = workflow;
        this.summary = {
            ...this.summary,
            currentPhase: workflow.currentPhase,
            status: workflow.status,
            workBranch: workflow.workBranch
        };
        const suggestionCount = await this.renderWorkflowAsync(workflow);
        (0, outputChannel_1.appendSpecForgeDebugLog)(`Workflow '${this.summary.usId}' refresh end. reason='${reason}', workflowPhase='${workflow.currentPhase}', workflowStatus='${workflow.status}', selectedPhase='${this.selectedPhaseId}', suggestions=${suggestionCount}.`);
    }
    async handleMessageAsync(message) {
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
                await this.sendReviewToImplementationAsync(message.prompt, message.includeReviewArtifactInContext !== false);
                return;
            case "approveReviewAnyway":
                if (message.reason) {
                    await this.approveReviewAnywayAsync(message.reason);
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
                (0, outputChannel_1.appendSpecForgeLog)(`Autoplay stopped for '${this.summary.usId}'.`);
                this.playbackState = "stopping";
                this.callbacks.stopBackend(this.workspaceRoot);
                await this.callbacks.refreshExplorer();
                this.playbackState = "idle";
                this.clearTransientExecutionPhase();
                await this.refreshAsync("command:stop");
                return;
        }
    }
    async continueCurrentPhaseAsync() {
        const previousPhase = this.summary.currentPhase;
        const result = await this.getBackendClient().continuePhase(this.summary.usId, (0, userActor_1.getCurrentActor)());
        const usageSummary = result.usage
            ? ` Tokens in/out/total: ${result.usage.inputTokens}/${result.usage.outputTokens}/${result.usage.totalTokens}.`
            : "";
        const executionSummary = this.formatExecutionSummary(result.execution);
        (0, outputChannel_1.appendSpecForgeLog)(`Workflow '${this.summary.usId}' advanced from '${previousPhase}' to '${result.currentPhase}' with status '${result.status}'.${executionSummary}${usageSummary}`);
        this.logExecutionWarnings(result.execution);
        this.summary = {
            ...this.summary,
            currentPhase: result.currentPhase,
            status: result.status
        };
        this.playbackState = (0, workflowPlaybackState_1.normalizePlaybackStateAfterManualWorkflowChange)(this.playbackState);
        this.selectedPhaseId = result.currentPhase;
        this.clearTransientExecutionPhase();
        await this.pauseOnFailedReviewIfConfiguredAsync(result.currentPhase, result.generatedArtifactPath, "continue");
        this.applyDeferredExecutionSettingsAfterPhaseChange(previousPhase, result.currentPhase, "continue");
        (0, outputChannel_1.appendSpecForgeDebugLog)(`Workflow '${this.summary.usId}' continueCurrentPhaseAsync requested explorer refresh.`);
        await this.callbacks.refreshExplorer();
        await this.refreshAsync("continueCurrentPhaseAsync");
        await this.maybeAutoReviewAfterImplementationAsync("continue");
    }
    async replayCurrentPhaseDirectlyAsync(reason, phaseId) {
        if (this.playbackState !== "playing") {
            this.playbackStartedAtMs = Date.now();
        }
        this.playbackState = "playing";
        this.setTransientExecutionPhase(phaseId);
        await this.refreshAsync(reason);
        try {
            await this.continueCurrentPhaseAsync();
        }
        finally {
            if (this.playbackState === "playing") {
                this.playbackState = "idle";
                this.playbackStartedAtMs = null;
                this.clearTransientExecutionPhase();
                await this.refreshAsync(`${reason}:completed`);
            }
        }
    }
    async requestWorkflowExecutionAsync(reason, sourceLabel, options = {}) {
        const { allowCurrentPhaseReplay = true, openSettingsWhenUnconfigured = true, notifyWhenBlocked = true } = options;
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
            (0, outputChannel_1.appendSpecForgeLog)(`Workflow '${this.summary.usId}' did not execute from ${sourceLabel} because current phase '${workflow.currentPhase}' requires attention.`);
            if (notifyWhenBlocked) {
                this.callbacks.notifyAttention(`${workflow.usId} requires attention at ${workflow.currentPhase}.`);
            }
            await this.refreshAsync(`${reason}:blocked`);
            return false;
        }
        (0, outputChannel_1.appendSpecForgeLog)(request.logMessage);
        await this.focusPhaseForAction(request.phaseId, `${reason}:focus-target`);
        if (request.kind === "replay-current") {
            await this.replayCurrentPhaseDirectlyAsync(reason, request.phaseId);
            return true;
        }
        await this.startAutoplayAsync(reason);
        return true;
    }
    resolveWorkflowExecutionRequest(workflow, sourceLabel, allowCurrentPhaseReplay) {
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
    async submitClarificationAnswersAsync(answers) {
        await this.getBackendClient().submitClarificationAnswers(this.summary.usId, answers, (0, userActor_1.getCurrentActor)());
        (0, outputChannel_1.appendSpecForgeLog)(`Workflow '${this.summary.usId}' stored ${answers.length} clarification answer(s).`);
        this.playbackState = (0, workflowPlaybackState_1.normalizePlaybackStateAfterManualWorkflowChange)(this.playbackState);
        this.clearTransientExecutionPhase();
        (0, outputChannel_1.appendSpecForgeDebugLog)(`Workflow '${this.summary.usId}' submitClarificationAnswersAsync requested explorer refresh.`);
        await this.callbacks.refreshExplorer();
        await this.refreshAsync("submitClarificationAnswersAsync");
        await this.maybeAutoPlayAfterManualContinuationAsync("clarification answers");
    }
    async submitPhaseInputAsync(prompt) {
        const normalizedPrompt = prompt.trim();
        if (normalizedPrompt.length === 0) {
            return;
        }
        const previousPhase = this.summary.currentPhase;
        const result = await this.getBackendClient().operateCurrentPhaseArtifact(this.summary.usId, normalizedPrompt, (0, userActor_1.getCurrentActor)());
        (0, outputChannel_1.appendSpecForgeLog)(`Workflow '${this.summary.usId}' regenerated phase '${result.currentPhase}' after human input.${this.formatExecutionSummary(result.execution)}`);
        this.logExecutionWarnings(result.execution);
        this.summary = {
            ...this.summary,
            currentPhase: result.currentPhase,
            status: result.status
        };
        this.playbackState = (0, workflowPlaybackState_1.normalizePlaybackStateAfterManualWorkflowChange)(this.playbackState);
        this.clearTransientExecutionPhase();
        this.selectedPhaseId = result.currentPhase;
        this.applyDeferredExecutionSettingsAfterPhaseChange(previousPhase, result.currentPhase, "phase input");
        (0, outputChannel_1.appendSpecForgeDebugLog)(`Workflow '${this.summary.usId}' submitPhaseInputAsync requested explorer refresh.`);
        await this.callbacks.refreshExplorer();
        await this.refreshAsync("submitPhaseInputAsync");
        await this.maybeAutoReviewAfterImplementationAsync("phase input");
    }
    async sendReviewToImplementationAsync(prompt, includeReviewArtifactInContext) {
        const normalizedPrompt = prompt?.trim() ?? "";
        if (!includeReviewArtifactInContext && normalizedPrompt.length === 0) {
            throw new Error("A correction prompt is required when the review artifact is not sent to implementation.");
        }
        const previousPhase = this.summary.currentPhase;
        await this.focusPhaseForAction("implementation", "sendReviewToImplementationAsync:focus");
        const regressionReasonParts = [
            includeReviewArtifactInContext
                ? "User approved review regression to implementation with the generated review artifact attached."
                : "User approved review regression to implementation without attaching the generated review artifact."
        ];
        if (normalizedPrompt.length > 0) {
            regressionReasonParts.push(`Correction note: ${normalizedPrompt.split(/\r?\n/, 1)[0]?.trim() ?? normalizedPrompt}`);
        }
        const regressionReason = regressionReasonParts.join(" ");
        const regression = await this.getBackendClient().requestRegression(this.summary.usId, "implementation", regressionReason, (0, userActor_1.getCurrentActor)(), (0, extensionSettings_1.getSpecForgeSettings)().destructiveRewindEnabled);
        (0, outputChannel_1.appendSpecForgeLog)(`Workflow '${this.summary.usId}' regressed from review to implementation by explicit user decision. reviewArtifactIncluded=${includeReviewArtifactInContext}.`);
        this.summary = {
            ...this.summary,
            currentPhase: regression.currentPhase,
            status: regression.status
        };
        const operationPrompt = includeReviewArtifactInContext
            ? [
                "Apply the approved review feedback to the current implementation artifact.",
                "Use the latest review artifact as corrective context and preserve approved scope unless the feedback explicitly changes it.",
                ...(normalizedPrompt.length > 0 ? ["", "Additional user guidance:", normalizedPrompt] : [])
            ].join("\n")
            : [
                "Apply the approved review correction note to the current implementation artifact.",
                "Do not use the latest review artifact as corrective context for this implementation pass.",
                "Preserve approved scope unless the user guidance explicitly changes it.",
                "",
                normalizedPrompt
            ].join("\n");
        const operation = await this.getBackendClient().operateCurrentPhaseArtifact(this.summary.usId, operationPrompt, (0, userActor_1.getCurrentActor)(), includeReviewArtifactInContext);
        (0, outputChannel_1.appendSpecForgeLog)(`Workflow '${this.summary.usId}' applied the approved review regression over implementation. reviewArtifactIncluded=${includeReviewArtifactInContext}.${this.formatExecutionSummary(operation.execution)}`);
        this.logExecutionWarnings(operation.execution);
        this.summary = {
            ...this.summary,
            currentPhase: operation.currentPhase,
            status: operation.status
        };
        this.playbackState = (0, workflowPlaybackState_1.normalizePlaybackStateAfterManualWorkflowChange)(this.playbackState);
        this.clearTransientExecutionPhase();
        this.selectedPhaseId = operation.currentPhase;
        this.applyDeferredExecutionSettingsAfterPhaseChange(previousPhase, operation.currentPhase, "review-to-implementation");
        (0, outputChannel_1.appendSpecForgeDebugLog)(`Workflow '${this.summary.usId}' sendReviewToImplementationAsync requested explorer refresh.`);
        await this.callbacks.refreshExplorer();
        await this.refreshAsync("sendReviewToImplementationAsync");
        await this.maybeAutoReviewAfterImplementationAsync("review correction");
    }
    async approveReviewAnywayAsync(reason) {
        const normalizedReason = reason.trim();
        if (normalizedReason.length === 0) {
            return;
        }
        const previousPhase = this.summary.currentPhase;
        await this.focusPhaseForAction("release-approval", "approveReviewAnywayAsync:focus");
        const result = await this.getBackendClient().approveReviewAnyway(this.summary.usId, normalizedReason, (0, userActor_1.getCurrentActor)());
        (0, outputChannel_1.appendSpecForgeLog)(`Workflow '${this.summary.usId}' was force-approved from review to release-approval by explicit user decision.`);
        this.summary = {
            ...this.summary,
            currentPhase: result.currentPhase,
            status: result.status
        };
        this.playbackState = (0, workflowPlaybackState_1.normalizePlaybackStateAfterManualWorkflowChange)(this.playbackState);
        this.clearTransientExecutionPhase();
        this.selectedPhaseId = result.currentPhase;
        this.applyDeferredExecutionSettingsAfterPhaseChange(previousPhase, result.currentPhase, "approve-review-anyway");
        (0, outputChannel_1.appendSpecForgeDebugLog)(`Workflow '${this.summary.usId}' approveReviewAnywayAsync requested explorer refresh.`);
        await this.callbacks.refreshExplorer();
        await this.refreshAsync("approveReviewAnywayAsync");
    }
    async submitApprovalAnswerAsync(question, answer) {
        const previousPhase = this.summary.currentPhase;
        const result = await this.getBackendClient().submitApprovalAnswer(this.summary.usId, question, answer, (0, userActor_1.getCurrentActor)());
        (0, outputChannel_1.appendSpecForgeLog)(`Workflow '${this.summary.usId}' recorded a human approval answer and generated '${result.generatedArtifactPath}'.`);
        this.summary = {
            ...this.summary,
            currentPhase: result.currentPhase,
            status: result.status
        };
        this.playbackState = (0, workflowPlaybackState_1.normalizePlaybackStateAfterManualWorkflowChange)(this.playbackState);
        this.clearTransientExecutionPhase();
        this.selectedPhaseId = result.currentPhase;
        this.applyDeferredExecutionSettingsAfterPhaseChange(previousPhase, result.currentPhase, "approval answer");
        (0, outputChannel_1.appendSpecForgeDebugLog)(`Workflow '${this.summary.usId}' submitApprovalAnswerAsync requested explorer refresh.`);
        await this.callbacks.refreshExplorer();
        await this.refreshAsync("submitApprovalAnswerAsync");
    }
    isExecutionConfigured() {
        return (0, extensionSettings_1.getSpecForgeSettingsStatus)((0, extensionSettings_1.getSpecForgeSettings)()).executionConfigured;
    }
    logExecutionWarnings(execution) {
        if (!execution?.warnings || execution.warnings.length === 0) {
            return;
        }
        for (const warning of execution.warnings) {
            (0, outputChannel_1.appendSpecForgeLog)(`Workflow '${this.summary.usId}' system prompt warning: ${warning}`);
        }
    }
    formatExecutionSummary(execution) {
        if (!execution) {
            return "";
        }
        const settings = (0, extensionSettings_1.getSpecForgeSettings)();
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
    async attachFilesAsync(kind) {
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
            const targetPath = await (0, utils_1.getNextAttachmentPathAsync)(attachmentsDirectoryPath, path.basename(source.fsPath));
            await fs.promises.copyFile(source.fsPath, targetPath);
        }
        await this.refreshAsync();
        void vscode.window.showInformationMessage(`${selection.length} file(s) added to ${kind === "context" ? "context" : "user story info"} for ${this.summary.usId}.`);
    }
    async addContextFilesFromPathsAsync(paths) {
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
            const targetPath = await (0, utils_1.getNextAttachmentPathAsync)(contextDirectoryPath, path.basename(sourcePath));
            await fs.promises.copyFile(sourcePath, targetPath);
            copiedFiles += 1;
        }
        await this.refreshAsync();
        if (copiedFiles > 0) {
            void vscode.window.showInformationMessage(`${copiedFiles} suggested context file(s) added to ${this.summary.usId}.`);
        }
    }
    async setFileKindAsync(filePath, targetKind) {
        const sourcePath = path.normalize(filePath);
        const targetDirectory = path.join(this.summary.directoryPath, targetKind === "context" ? "context" : "attachments");
        const sourceDirectory = path.dirname(sourcePath);
        if (path.normalize(sourceDirectory) === path.normalize(targetDirectory)) {
            return;
        }
        await fs.promises.mkdir(targetDirectory, { recursive: true });
        const targetPath = await (0, utils_1.getNextAttachmentPathAsync)(targetDirectory, path.basename(sourcePath));
        await fs.promises.rename(sourcePath, targetPath);
        await this.refreshAsync();
        void vscode.window.showInformationMessage(`Moved ${path.basename(sourcePath)} to ${targetKind === "context" ? "context" : "user story info"} in ${this.summary.usId}.`);
    }
    async approveCurrentPhaseAsync(baseBranch, workBranch) {
        await this.focusPhaseForAction(this.summary.currentPhase, "approveCurrentPhaseAsync:focus");
        const normalizedBaseBranch = this.summary.currentPhase === "refinement"
            ? (baseBranch?.trim() || this.refinementApprovalBaseBranchProposal)
            : undefined;
        const normalizedWorkBranch = this.summary.currentPhase === "refinement"
            ? (workBranch?.trim() || this.buildRefinementApprovalWorkBranchProposal(this.lastWorkflow))
            : undefined;
        this.summary = await this.getBackendClient().approveCurrentPhase(this.summary.usId, normalizedBaseBranch, normalizedWorkBranch, (0, userActor_1.getCurrentActor)());
        (0, outputChannel_1.appendSpecForgeLog)(`Workflow '${this.summary.usId}' approved phase '${this.summary.currentPhase}' with base='${normalizedBaseBranch ?? "(none)"}' and work='${normalizedWorkBranch ?? "(none)"}'.`);
        this.playbackState = (0, workflowPlaybackState_1.normalizePlaybackStateAfterManualWorkflowChange)(this.playbackState);
        this.clearTransientExecutionPhase();
        (0, outputChannel_1.appendSpecForgeDebugLog)(`Workflow '${this.summary.usId}' approveCurrentPhaseAsync requested explorer refresh.`);
        await this.callbacks.refreshExplorer();
        await this.refreshAsync("approveCurrentPhaseAsync");
        await this.maybeAutoPlayAfterManualContinuationAsync("approval");
    }
    async requestRegressionAsync(targetPhase) {
        const previousPhase = this.summary.currentPhase;
        const settings = (0, extensionSettings_1.getSpecForgeSettings)();
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
        const result = await this.getBackendClient().requestRegression(this.summary.usId, targetPhase, reason, (0, userActor_1.getCurrentActor)(), destructiveRewindEnabled);
        (0, outputChannel_1.appendSpecForgeLog)(`Workflow '${this.summary.usId}' regressed to '${result.currentPhase}' with status '${result.status}'${destructiveRewindEnabled ? " using destructive cleanup" : " without deleting later artifacts"}.`);
        this.summary = {
            ...this.summary,
            currentPhase: result.currentPhase,
            status: result.status
        };
        this.playbackState = (0, workflowPlaybackState_1.normalizePlaybackStateAfterManualWorkflowChange)(this.playbackState);
        this.clearTransientExecutionPhase();
        this.selectedPhaseId = result.currentPhase;
        this.applyDeferredExecutionSettingsAfterPhaseChange(previousPhase, result.currentPhase, "regression");
        (0, outputChannel_1.appendSpecForgeDebugLog)(`Workflow '${this.summary.usId}' requestRegressionAsync requested explorer refresh.`);
        await this.callbacks.refreshExplorer();
        await this.refreshAsync("requestRegressionAsync");
    }
    async rejectCurrentApprovalAsync(reason) {
        const normalizedReason = reason?.trim() ?? "";
        if (normalizedReason.length === 0) {
            return;
        }
        const rejectPlan = (0, workflowRejectPlan_1.resolveWorkflowRejectPlan)(this.summary.currentPhase);
        if (!rejectPlan) {
            throw new Error(`Reject is not supported for phase '${this.summary.currentPhase}'.`);
        }
        const previousPhase = this.summary.currentPhase;
        await this.focusPhaseForAction(rejectPlan.mode === "rewind-and-operate" ? rejectPlan.targetPhaseId : this.summary.currentPhase, "rejectCurrentApprovalAsync:focus");
        if (rejectPlan.mode === "rewind-and-operate") {
            const rewindResult = await this.getBackendClient().rewindWorkflow(this.summary.usId, rejectPlan.targetPhaseId, (0, userActor_1.getCurrentActor)(), false);
            (0, outputChannel_1.appendSpecForgeLog)(`Workflow '${this.summary.usId}' rejected approval, rewound to '${rewindResult.currentPhase}', and will apply the rejection note via model.`);
            this.summary = {
                ...this.summary,
                currentPhase: rewindResult.currentPhase,
                status: rewindResult.status
            };
            this.selectedPhaseId = rewindResult.currentPhase;
            this.applyDeferredExecutionSettingsAfterPhaseChange(previousPhase, rewindResult.currentPhase, "reject");
        }
        const operationResult = await this.getBackendClient().operateCurrentPhaseArtifact(this.summary.usId, normalizedReason, (0, userActor_1.getCurrentActor)());
        (0, outputChannel_1.appendSpecForgeLog)(`Workflow '${this.summary.usId}' applied reject feedback to '${operationResult.currentPhase}' and generated '${operationResult.generatedArtifactPath}'.`);
        this.playbackState = (0, workflowPlaybackState_1.normalizePlaybackStateAfterManualWorkflowChange)(this.playbackState);
        this.clearTransientExecutionPhase();
        await this.callbacks.refreshExplorer();
        await this.refreshAsync("rejectCurrentApprovalAsync");
    }
    async restartCurrentWorkflowAsync() {
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
        const result = await this.getBackendClient().restartUserStoryFromSource(this.summary.usId, reason, (0, userActor_1.getCurrentActor)());
        (0, outputChannel_1.appendSpecForgeLog)(`Workflow '${this.summary.usId}' restarted from source. Current phase '${result.currentPhase}', status '${result.status}'.`);
        this.summary = {
            ...this.summary,
            currentPhase: result.currentPhase,
            status: result.status
        };
        this.playbackState = (0, workflowPlaybackState_1.normalizePlaybackStateAfterManualWorkflowChange)(this.playbackState);
        this.clearTransientExecutionPhase();
        this.selectedPhaseId = result.currentPhase;
        this.applyDeferredExecutionSettingsAfterPhaseChange(previousPhase, result.currentPhase, "restart");
        (0, outputChannel_1.appendSpecForgeDebugLog)(`Workflow '${this.summary.usId}' restartCurrentWorkflowAsync requested explorer refresh.`);
        await this.callbacks.refreshExplorer();
        await this.refreshAsync("restartCurrentWorkflowAsync");
    }
    async rewindWorkflowAsync(targetPhase) {
        const previousPhase = this.summary.currentPhase;
        const settings = (0, extensionSettings_1.getSpecForgeSettings)();
        const destructiveRewindEnabled = settings.destructiveRewindEnabled;
        const confirmation = await vscode.window.showWarningMessage(destructiveRewindEnabled
            ? `Rewind ${this.summary.usId} to ${targetPhase} and delete all later derived artifacts?`
            : `Rewind ${this.summary.usId} to ${targetPhase} without deleting later artifacts?`, { modal: true }, "Rewind Workflow");
        if (confirmation !== "Rewind Workflow") {
            return;
        }
        await this.focusPhaseForAction(targetPhase, "rewindWorkflowAsync:focus");
        const result = await this.getBackendClient().rewindWorkflow(this.summary.usId, targetPhase, (0, userActor_1.getCurrentActor)(), destructiveRewindEnabled);
        (0, outputChannel_1.appendSpecForgeLog)(`Workflow '${this.summary.usId}' was rewound to '${result.currentPhase}' with status '${result.status}'${destructiveRewindEnabled ? " using destructive cleanup" : " without deleting later artifacts"}.`);
        (0, outputChannel_1.appendSpecForgeDebugLog)(`Workflow '${this.summary.usId}' rewind deleted paths: ${result.deletedPaths.length > 0 ? result.deletedPaths.join(", ") : "(none)"}.`);
        (0, outputChannel_1.appendSpecForgeDebugLog)(`Workflow '${this.summary.usId}' rewind preserved paths: ${result.preservedPaths.length > 0 ? result.preservedPaths.join(", ") : "(none)"}.`);
        this.summary = {
            ...this.summary,
            currentPhase: result.currentPhase,
            status: result.status,
            workBranch: destructiveRewindEnabled && (result.currentPhase === "clarification" || result.currentPhase === "refinement")
                ? null
                : this.summary.workBranch
        };
        this.playbackState = (0, workflowPlaybackState_1.normalizePlaybackStateAfterManualWorkflowChange)(this.playbackState);
        this.clearTransientExecutionPhase();
        this.selectedPhaseId = result.currentPhase;
        this.selectedIterationArtifactPath = null;
        this.applyDeferredExecutionSettingsAfterPhaseChange(previousPhase, result.currentPhase, "rewind");
        (0, outputChannel_1.appendSpecForgeDebugLog)(`Workflow '${this.summary.usId}' rewindWorkflowAsync requested explorer refresh.`);
        await this.callbacks.refreshExplorer();
        await this.refreshAsync("rewindWorkflowAsync");
    }
    async debugResetToCaptureAsync() {
        const previousPhase = this.summary.currentPhase;
        const confirmation = await vscode.window.showWarningMessage(`Reset ${this.summary.usId} to capture and delete all generated artifacts after the source?`, { modal: true }, "Reset to Capture");
        if (confirmation !== "Reset to Capture") {
            return;
        }
        await this.focusPhaseForAction("capture", "debugResetToCaptureAsync:focus");
        const result = await this.getBackendClient().resetUserStoryToCapture(this.summary.usId);
        (0, outputChannel_1.appendSpecForgeLog)(`Workflow '${this.summary.usId}' was reset to '${result.currentPhase}' with status '${result.status}' from DEBUG UI.`);
        (0, outputChannel_1.appendSpecForgeDebugLog)(`Workflow '${this.summary.usId}' reset deleted paths: ${result.deletedPaths.length > 0 ? result.deletedPaths.join(", ") : "(none)"}.`);
        (0, outputChannel_1.appendSpecForgeDebugLog)(`Workflow '${this.summary.usId}' reset preserved paths: ${result.preservedPaths.length > 0 ? result.preservedPaths.join(", ") : "(none)"}.`);
        this.summary = {
            ...this.summary,
            currentPhase: result.currentPhase,
            status: result.status,
            workBranch: null
        };
        this.playbackState = (0, workflowPlaybackState_1.normalizePlaybackStateAfterManualWorkflowChange)(this.playbackState);
        this.clearTransientExecutionPhase();
        this.selectedPhaseId = result.currentPhase;
        this.applyDeferredExecutionSettingsAfterPhaseChange(previousPhase, result.currentPhase, "reset");
        (0, outputChannel_1.appendSpecForgeDebugLog)(`Workflow '${this.summary.usId}' debugResetToCaptureAsync requested explorer refresh.`);
        await this.callbacks.refreshExplorer();
        await this.refreshAsync("debugResetToCaptureAsync");
    }
    async runAutoplayAsync() {
        try {
            (0, outputChannel_1.appendSpecForgeLog)(`Autoplay loop started for '${this.summary.usId}'.`);
            while (this.playbackState === "playing") {
                const workflow = await this.getBackendClient().getUserStoryWorkflow(this.summary.usId);
                const settings = (0, extensionSettings_1.getSpecForgeSettings)();
                const executionPhaseId = this.resolveExecutionPhaseIdForWorkflow(workflow);
                const canReplayCurrentPhase = this.canReplayCurrentPhase(workflow);
                if (workflow.currentPhase === "implementation"
                    && (0, workflowAutomation_1.hasReachedImplementationReviewCycleLimit)(workflow, settings.maxImplementationReviewCycles)) {
                    this.playbackState = "paused";
                    this.setTransientExecutionPhase("implementation");
                    (0, outputChannel_1.appendSpecForgeLog)(`Autoplay paused for '${workflow.usId}' because the implementation/review loop reached the configured limit (${settings.maxImplementationReviewCycles}).`);
                    await this.refreshAsync("autoplay:implementationReviewLimit");
                    return;
                }
                if (executionPhaseId && this.isPhasePauseArmed(executionPhaseId)) {
                    this.playbackState = "paused";
                    this.setTransientExecutionPhase(executionPhaseId);
                    (0, outputChannel_1.appendSpecForgeLog)(`Autoplay paused for '${workflow.usId}' before executing phase '${executionPhaseId}' because its phase card pause is armed.`);
                    (0, outputChannel_1.appendSpecForgeDebugLog)(`Workflow '${workflow.usId}' held at phase boundary before '${executionPhaseId}' due to ad hoc phase pause.`);
                    await this.refreshAsync("autoplay:pausedByPhase");
                    return;
                }
                if (!workflow.controls.canContinue && !canReplayCurrentPhase) {
                    this.playbackState = "paused";
                    this.clearTransientExecutionPhase();
                    (0, outputChannel_1.appendSpecForgeLog)(`Autoplay paused for '${workflow.usId}' because current phase '${workflow.currentPhase}' requires attention.`);
                    this.callbacks.notifyAttention(`${workflow.usId} requires attention at ${workflow.currentPhase}.`);
                    await this.refreshAsync("autoplay:pausedAtBoundary");
                    return;
                }
                (0, outputChannel_1.appendSpecForgeLog)(`Autoplay continuing '${workflow.usId}' from phase '${workflow.currentPhase}' into '${executionPhaseId ?? workflow.currentPhase}'.`);
                (0, outputChannel_1.appendSpecForgeDebugLog)(`Autoplay loop iteration for '${workflow.usId}'. canContinue=${workflow.controls.canContinue}, requiresApproval=${workflow.controls.requiresApproval}, blockingReason='${workflow.controls.blockingReason ?? "none"}'.`);
                if (executionPhaseId && !canReplayCurrentPhase) {
                    this.setTransientExecutionPhase(executionPhaseId);
                }
                await this.continueCurrentPhaseAsync();
            }
            (0, outputChannel_1.appendSpecForgeLog)(`Autoplay loop exited for '${this.summary.usId}' with state '${this.playbackState}'.`);
        }
        catch (error) {
            if (this.playbackState === "stopping") {
                (0, outputChannel_1.appendSpecForgeLog)(`Autoplay stopping acknowledged for '${this.summary.usId}'.`);
                return;
            }
            this.playbackState = "paused";
            this.playbackStartedAtMs = null;
            this.clearTransientExecutionPhase();
            await this.refreshAsync("autoplay:error");
            (0, outputChannel_1.appendSpecForgeLog)(`Autoplay failed for '${this.summary.usId}': ${(0, utils_1.asErrorMessage)(error)}`);
            (0, outputChannel_1.showSpecForgeOutput)(false);
            void vscode.window.showErrorMessage((0, utils_1.asErrorMessage)(error));
        }
    }
    async startAutoplayAsync(reason) {
        (0, outputChannel_1.appendSpecForgeLog)(`Autoplay requested for '${this.summary.usId}'. reason='${reason}'.`);
        if (this.playbackState === "playing" || this.playbackState === "stopping") {
            (0, outputChannel_1.appendSpecForgeDebugLog)(`Workflow '${this.summary.usId}' ignored autoplay request because playback is already '${this.playbackState}'. reason='${reason}'.`);
            await this.refreshAsync(`${reason}:ignored`);
            return;
        }
        const workflow = this.lastWorkflow ?? await this.getBackendClient().getUserStoryWorkflow(this.summary.usId);
        this.lastWorkflow = workflow;
        const executionPhaseId = this.transientExecutionPhaseId
            ?? this.resolveExecutionPhaseIdForWorkflow(workflow)
            ?? (0, workflowPlaybackState_1.resolveWorkflowExecutionPhaseId)(this.summary.currentPhase);
        if (executionPhaseId && this.pausedPhaseIds.delete(executionPhaseId)) {
            await this.persistPausedPhaseIdsAsync();
            (0, outputChannel_1.appendSpecForgeLog)(`Workflow '${this.summary.usId}' released ad hoc pause for phase '${executionPhaseId}' because playback resumed from ${reason}.`);
        }
        (0, outputChannel_1.showSpecForgeOutput)(true);
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
    canReplayCurrentPhase(workflow) {
        if (workflow.currentPhase !== "review") {
            return false;
        }
        return workflow.controls.blockingReason === "review_failed"
            || workflow.controls.blockingReason === "review_result_missing"
            || workflow.controls.blockingReason === "review_missing_artifact";
    }
    async maybeAutoPlayAfterManualContinuationAsync(trigger) {
        const settings = (0, extensionSettings_1.getSpecForgeSettings)();
        if (!settings.autoPlayEnabled) {
            (0, outputChannel_1.appendSpecForgeDebugLog)(`Workflow '${this.summary.usId}' did not auto-play after ${trigger} because 'specForge.features.autoPlayEnabled' is false.`);
            return;
        }
        const executed = await this.requestWorkflowExecutionAsync(`autoPlay:${trigger}`, `auto-play after ${trigger}`, {
            allowCurrentPhaseReplay: false,
            openSettingsWhenUnconfigured: false,
            notifyWhenBlocked: false
        });
        if (!executed) {
            const workflow = this.lastWorkflow ?? await this.getBackendClient().getUserStoryWorkflow(this.summary.usId);
            this.lastWorkflow = workflow;
            (0, outputChannel_1.appendSpecForgeDebugLog)(`Workflow '${this.summary.usId}' did not auto-play after ${trigger} because canContinue=${workflow.controls.canContinue}, requiresApproval=${workflow.controls.requiresApproval}, blockingReason='${workflow.controls.blockingReason ?? "none"}'.`);
        }
    }
    async maybeAutoReviewAfterImplementationAsync(trigger) {
        const settings = (0, extensionSettings_1.getSpecForgeSettings)();
        if (!settings.autoReviewEnabled) {
            (0, outputChannel_1.appendSpecForgeDebugLog)(`Workflow '${this.summary.usId}' did not auto-review after ${trigger} because 'specForge.features.autoReviewEnabled' is false.`);
            return;
        }
        const workflow = this.lastWorkflow ?? await this.getBackendClient().getUserStoryWorkflow(this.summary.usId);
        this.lastWorkflow = workflow;
        if (workflow.currentPhase !== "implementation") {
            (0, outputChannel_1.appendSpecForgeDebugLog)(`Workflow '${this.summary.usId}' did not auto-review after ${trigger} because current phase is '${workflow.currentPhase}'.`);
            return;
        }
        if ((0, workflowAutomation_1.hasReachedImplementationReviewCycleLimit)(workflow, settings.maxImplementationReviewCycles)) {
            (0, outputChannel_1.appendSpecForgeLog)(`Workflow '${this.summary.usId}' stopped automatic review after ${trigger} because the implementation/review loop reached the configured limit (${settings.maxImplementationReviewCycles}).`);
            return;
        }
        const executed = await this.requestWorkflowExecutionAsync(`autoReview:${trigger}`, `auto-review after ${trigger}`, {
            allowCurrentPhaseReplay: false,
            openSettingsWhenUnconfigured: false,
            notifyWhenBlocked: false
        });
        if (!executed) {
            (0, outputChannel_1.appendSpecForgeDebugLog)(`Workflow '${this.summary.usId}' did not auto-review after ${trigger} because the workflow could not continue from implementation.`);
        }
    }
    async pauseOnFailedReviewIfConfiguredAsync(phaseId, artifactPath, trigger) {
        const settings = (0, extensionSettings_1.getSpecForgeSettings)();
        if (!settings.pauseOnFailedReview || phaseId !== "review") {
            (0, outputChannel_1.appendSpecForgeDebugLog)(`Workflow '${this.summary.usId}' did not apply failed-review pause after ${trigger}. pauseOnFailedReview=${settings.pauseOnFailedReview}, phase='${phaseId}'.`);
            return;
        }
        const artifactContent = await readArtifactContentAsync(artifactPath);
        if (!isFailedReviewArtifact(artifactContent)) {
            (0, outputChannel_1.appendSpecForgeDebugLog)(`Workflow '${this.summary.usId}' did not apply failed-review pause after ${trigger} because the review artifact is not failed.`);
            return;
        }
        this.playbackState = "paused";
        this.playbackStartedAtMs = null;
        this.selectedPhaseId = "review";
        this.setTransientExecutionPhase("review");
        (0, outputChannel_1.appendSpecForgeLog)(`Workflow '${this.summary.usId}' paused automatically at failed review because 'specForge.features.pauseOnFailedReview' is enabled.`);
    }
    async renderWorkflowAsync(workflow) {
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
        const settings = (0, extensionSettings_1.getSpecForgeSettings)();
        const settingsStatus = (0, extensionSettings_1.getSpecForgeSettingsStatus)(settings);
        if (!settingsStatus.executionConfigured) {
            (0, outputChannel_1.appendSpecForgeLog)(`Workflow settings warning for '${this.workspaceRoot}' (${workflow.usId}): ${settingsStatus.message}. Diagnostics: ${settingsStatus.diagnostics}`);
        }
        const contextSuggestions = settings.contextSuggestionsEnabled && workflow.currentPhase === "clarification"
            ? await (0, contextSuggestions_1.suggestContextFiles)(this.workspaceRoot, workflow, sourceText)
            : [];
        const runtimeVersion = await (0, runtimeVersion_1.readRuntimeVersionAsync)();
        this.panel.title = `${workflow.usId} workflow`;
        this.panel.webview.html = (0, workflowView_1.buildWorkflowHtml)(workflow, {
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
            debugMode: (0, outputChannel_1.isSpecForgeDebugLoggingEnabled)(),
            approvalBaseBranchProposal: this.refinementApprovalBaseBranchProposal,
            approvalWorkBranchProposal: this.buildRefinementApprovalWorkBranchProposal(workflow),
            requireExplicitApprovalBranchAcceptance: settings.requireExplicitApprovalBranchAcceptance
        }, this.playbackState);
        return contextSuggestions.length;
    }
    buildRefinementApprovalWorkBranchProposal(workflow) {
        if (workflow?.workBranch?.trim()) {
            return workflow.workBranch.trim();
        }
        if (!workflow) {
            return `feature/${this.summary.usId.toLowerCase()}-work`;
        }
        return (0, workflowBranchName_1.buildWorkBranchProposal)(workflow.usId, workflow.title, workflow.kind?.trim() || "feature");
    }
    async focusPhaseForAction(phaseId, reason) {
        if (!phaseId || this.selectedPhaseId === phaseId) {
            return;
        }
        this.selectedPhaseId = phaseId;
        this.selectedIterationArtifactPath = null;
        await this.renderCachedWorkflowAsync(reason);
    }
    async renderCachedWorkflowAsync(reason) {
        if (!this.lastWorkflow) {
            return;
        }
        (0, outputChannel_1.appendSpecForgeDebugLog)(`Workflow '${this.summary.usId}' rendering cached workflow. reason='${reason}', executionPhase='${this.transientExecutionPhaseId ?? "none"}'.`);
        await this.renderWorkflowAsync(this.lastWorkflow);
    }
    belongsToCurrentWorkflow(filePath) {
        const normalizedPath = path.normalize(filePath);
        const normalizedDirectory = path.normalize(this.summary.directoryPath);
        return normalizedPath.startsWith(normalizedDirectory + path.sep)
            || normalizedPath === normalizedDirectory;
    }
    deriveInitialExecutionPhaseId() {
        return (0, workflowPlaybackState_1.resolveWorkflowExecutionPhaseId)(this.summary.currentPhase) ?? this.summary.currentPhase;
    }
    deriveExecutionPhaseFromWatchedPath(filePath) {
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
    setTransientExecutionPhase(phaseId) {
        this.transientExecutionPhaseId = phaseId;
        this.transientCompletedPhaseIds = this.computeCompletedPhaseIds(phaseId);
    }
    clearTransientExecutionPhase() {
        this.transientExecutionPhaseId = null;
        this.transientCompletedPhaseIds = [];
        if (this.playbackState === "idle" || this.playbackState === "stopping") {
            this.playbackStartedAtMs = null;
        }
    }
    computeCompletedPhaseIds(executionPhaseId) {
        const phaseOrder = ["capture", "clarification", "refinement", "technical-design", "implementation", "review", "release-approval", "pr-preparation"];
        const executionPhaseIndex = phaseOrder.indexOf(executionPhaseId);
        if (executionPhaseIndex <= 0) {
            return [];
        }
        return phaseOrder.slice(0, executionPhaseIndex);
    }
    applyDeferredExecutionSettingsAfterPhaseChange(previousPhase, nextPhase, trigger) {
        if (previousPhase === nextPhase) {
            return;
        }
        if (!this.callbacks.applyPendingExecutionSettings(this.workspaceRoot)) {
            return;
        }
        (0, outputChannel_1.appendSpecForgeLog)(`Workflow '${this.summary.usId}' applied deferred execution settings after ${trigger}. Phase changed from '${previousPhase}' to '${nextPhase}'.`);
    }
    resolveExecutionPhaseIdForWorkflow(workflow) {
        return workflow.controls.executionPhase ?? (0, workflowPlaybackState_1.resolveWorkflowExecutionPhaseId)(workflow.currentPhase);
    }
    isPhasePauseArmed(phaseId) {
        return this.pausedPhaseIds.has(phaseId);
    }
    togglePhasePause(phaseId) {
        if (!(0, workflowPlaybackState_1.canPauseWorkflowExecutionPhase)(phaseId)) {
            (0, outputChannel_1.appendSpecForgeDebugLog)(`Workflow '${this.summary.usId}' ignored phase pause toggle for non-executable phase '${phaseId}'.`);
            return;
        }
        if (this.pausedPhaseIds.has(phaseId)) {
            this.pausedPhaseIds.delete(phaseId);
            (0, outputChannel_1.appendSpecForgeLog)(`Workflow '${this.summary.usId}' cleared ad hoc pause for phase '${phaseId}'.`);
            return;
        }
        this.pausedPhaseIds.add(phaseId);
        (0, outputChannel_1.appendSpecForgeLog)(`Workflow '${this.summary.usId}' armed ad hoc pause for phase '${phaseId}'.`);
    }
    async loadPausedPhaseIdsAsync() {
        const preferences = await (0, userWorkspacePreferences_1.readUserWorkspacePreferences)(this.workspaceRoot);
        this.pausedPhaseIds.clear();
        for (const phaseId of preferences.pausedWorkflowPhaseIdsByUsId[this.summary.usId] ?? []) {
            if (!(0, workflowPlaybackState_1.canPauseWorkflowExecutionPhase)(phaseId)) {
                continue;
            }
            this.pausedPhaseIds.add(phaseId);
        }
        (0, outputChannel_1.appendSpecForgeDebugLog)(`Workflow '${this.summary.usId}' restored ${this.pausedPhaseIds.size} persisted phase pause(s).`);
    }
    async persistPausedPhaseIdsAsync() {
        await (0, userWorkspacePreferences_1.setPausedWorkflowPhaseIds)(this.workspaceRoot, this.summary.usId, [...this.pausedPhaseIds]);
        (0, outputChannel_1.appendSpecForgeDebugLog)(`Workflow '${this.summary.usId}' persisted ${this.pausedPhaseIds.size} phase pause(s).`);
    }
    async armNextPhasePauseAsync(origin) {
        const workflow = this.lastWorkflow ?? await this.getBackendClient().getUserStoryWorkflow(this.summary.usId);
        this.lastWorkflow = workflow;
        const executionPhaseId = this.transientExecutionPhaseId
            ?? this.resolveExecutionPhaseIdForWorkflow(workflow)
            ?? (0, workflowPlaybackState_1.resolveWorkflowExecutionPhaseId)(this.summary.currentPhase);
        if (!executionPhaseId) {
            (0, outputChannel_1.appendSpecForgeDebugLog)(`Workflow '${this.summary.usId}' could not arm next phase pause from ${origin} because no later executable phase was found.`);
            return;
        }
        if (!this.pausedPhaseIds.has(executionPhaseId)) {
            this.pausedPhaseIds.add(executionPhaseId);
            await this.persistPausedPhaseIdsAsync();
            (0, outputChannel_1.appendSpecForgeLog)(`Workflow '${this.summary.usId}' armed ad hoc pause for next phase '${executionPhaseId}' from ${origin}.`);
            return;
        }
        (0, outputChannel_1.appendSpecForgeDebugLog)(`Workflow '${this.summary.usId}' left next phase '${executionPhaseId}' paused because it was already armed from ${origin}.`);
    }
}
async function readArtifactContentAsync(artifactPath) {
    if (!artifactPath) {
        return null;
    }
    try {
        return await fs.promises.readFile(artifactPath, "utf8");
    }
    catch {
        return null;
    }
}
function isFailedReviewArtifact(content) {
    if (!content) {
        return false;
    }
    return /-\s*(Result|Final result):\s*`?fail`?/i.test(content);
}
async function openTextDocument(filePath) {
    const document = await vscode.workspace.openTextDocument(filePath);
    await vscode.window.showTextDocument(document, { preview: false });
}
//# sourceMappingURL=workflowPanel.js.map