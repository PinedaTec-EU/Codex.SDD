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
const workflowPlaybackState_1 = require("./workflowPlaybackState");
const workflowBranchName_1 = require("./workflowBranchName");
const workflowView_1 = require("./workflowView");
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
        if (this.playbackState === "paused" && workflow.controls.canContinue) {
            (0, outputChannel_1.appendSpecForgeDebugLog)(`Workflow '${this.summary.usId}' cleared stale paused playback after refresh because the workflow can continue again.`);
            this.playbackState = "idle";
            this.playbackStartedAtMs = null;
            this.clearTransientExecutionPhase();
        }
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
                (0, outputChannel_1.appendSpecForgeLog)(`Continuing workflow '${this.summary.usId}' from phase '${this.summary.currentPhase}'.`);
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
            case "play":
                if (!this.isExecutionConfigured()) {
                    await vscode.commands.executeCommand("workbench.action.openSettings", "@ext:local.specforge-ai specForge");
                    return;
                }
                await this.startAutoplayAsync("command:play");
                return;
            case "pause":
                (0, outputChannel_1.appendSpecForgeLog)(`Autoplay paused for '${this.summary.usId}'.`);
                this.playbackState = "paused";
                this.clearTransientExecutionPhase();
                await this.refreshAsync("command:pause");
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
        const result = await this.getBackendClient().continuePhase(this.summary.usId);
        const usageSummary = result.usage
            ? ` Tokens in/out/total: ${result.usage.inputTokens}/${result.usage.outputTokens}/${result.usage.totalTokens}.`
            : "";
        (0, outputChannel_1.appendSpecForgeLog)(`Workflow '${this.summary.usId}' advanced from '${previousPhase}' to '${result.currentPhase}' with status '${result.status}'.${usageSummary}`);
        this.summary = {
            ...this.summary,
            currentPhase: result.currentPhase,
            status: result.status
        };
        this.playbackState = (0, workflowPlaybackState_1.normalizePlaybackStateAfterManualWorkflowChange)(this.playbackState);
        this.selectedPhaseId = result.currentPhase;
        this.clearTransientExecutionPhase();
        (0, outputChannel_1.appendSpecForgeDebugLog)(`Workflow '${this.summary.usId}' continueCurrentPhaseAsync requested explorer refresh.`);
        await this.callbacks.refreshExplorer();
        await this.refreshAsync("continueCurrentPhaseAsync");
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
        const result = await this.getBackendClient().operateCurrentPhaseArtifact(this.summary.usId, normalizedPrompt, (0, userActor_1.getCurrentActor)());
        (0, outputChannel_1.appendSpecForgeLog)(`Workflow '${this.summary.usId}' regenerated phase '${result.currentPhase}' after human input.`);
        this.summary = {
            ...this.summary,
            currentPhase: result.currentPhase,
            status: result.status
        };
        this.playbackState = (0, workflowPlaybackState_1.normalizePlaybackStateAfterManualWorkflowChange)(this.playbackState);
        this.clearTransientExecutionPhase();
        this.selectedPhaseId = result.currentPhase;
        (0, outputChannel_1.appendSpecForgeDebugLog)(`Workflow '${this.summary.usId}' submitPhaseInputAsync requested explorer refresh.`);
        await this.callbacks.refreshExplorer();
        await this.refreshAsync("submitPhaseInputAsync");
    }
    async submitApprovalAnswerAsync(question, answer) {
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
        (0, outputChannel_1.appendSpecForgeDebugLog)(`Workflow '${this.summary.usId}' submitApprovalAnswerAsync requested explorer refresh.`);
        await this.callbacks.refreshExplorer();
        await this.refreshAsync("submitApprovalAnswerAsync");
    }
    isExecutionConfigured() {
        return (0, extensionSettings_1.getSpecForgeSettingsStatus)((0, extensionSettings_1.getSpecForgeSettings)()).executionConfigured;
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
        const reason = await vscode.window.showInputBox({
            prompt: `Reason for regression to ${targetPhase}`,
            ignoreFocusOut: true,
            validateInput: (value) => value.trim().length > 0 ? undefined : "Reason is required."
        });
        if (!reason) {
            return;
        }
        const result = await this.getBackendClient().requestRegression(this.summary.usId, targetPhase, reason, (0, userActor_1.getCurrentActor)());
        (0, outputChannel_1.appendSpecForgeLog)(`Workflow '${this.summary.usId}' regressed to '${result.currentPhase}' with status '${result.status}'.`);
        this.summary = {
            ...this.summary,
            currentPhase: result.currentPhase,
            status: result.status
        };
        this.playbackState = (0, workflowPlaybackState_1.normalizePlaybackStateAfterManualWorkflowChange)(this.playbackState);
        this.clearTransientExecutionPhase();
        this.selectedPhaseId = result.currentPhase;
        (0, outputChannel_1.appendSpecForgeDebugLog)(`Workflow '${this.summary.usId}' requestRegressionAsync requested explorer refresh.`);
        await this.callbacks.refreshExplorer();
        await this.refreshAsync("requestRegressionAsync");
    }
    async restartCurrentWorkflowAsync() {
        const reason = await vscode.window.showInputBox({
            prompt: "Reason for restart from source",
            ignoreFocusOut: true,
            validateInput: (value) => value.trim().length > 0 ? undefined : "Reason is required."
        });
        if (!reason) {
            return;
        }
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
        (0, outputChannel_1.appendSpecForgeDebugLog)(`Workflow '${this.summary.usId}' restartCurrentWorkflowAsync requested explorer refresh.`);
        await this.callbacks.refreshExplorer();
        await this.refreshAsync("restartCurrentWorkflowAsync");
    }
    async debugResetToCaptureAsync() {
        const confirmation = await vscode.window.showWarningMessage(`Reset ${this.summary.usId} to capture and delete all generated artifacts after the source?`, { modal: true }, "Reset to Capture");
        if (confirmation !== "Reset to Capture") {
            return;
        }
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
        (0, outputChannel_1.appendSpecForgeDebugLog)(`Workflow '${this.summary.usId}' debugResetToCaptureAsync requested explorer refresh.`);
        await this.callbacks.refreshExplorer();
        await this.refreshAsync("debugResetToCaptureAsync");
    }
    async runAutoplayAsync() {
        try {
            (0, outputChannel_1.appendSpecForgeLog)(`Autoplay loop started for '${this.summary.usId}'.`);
            while (this.playbackState === "playing") {
                const workflow = await this.getBackendClient().getUserStoryWorkflow(this.summary.usId);
                if (!workflow.controls.canContinue) {
                    this.playbackState = "paused";
                    this.clearTransientExecutionPhase();
                    (0, outputChannel_1.appendSpecForgeLog)(`Autoplay paused for '${workflow.usId}' because current phase '${workflow.currentPhase}' requires attention.`);
                    this.callbacks.notifyAttention(`${workflow.usId} requires attention at ${workflow.currentPhase}.`);
                    await this.refreshAsync("autoplay:pausedAtBoundary");
                    return;
                }
                (0, outputChannel_1.appendSpecForgeLog)(`Autoplay continuing '${workflow.usId}' at phase '${workflow.currentPhase}'.`);
                (0, outputChannel_1.appendSpecForgeDebugLog)(`Autoplay loop iteration for '${workflow.usId}'. canContinue=${workflow.controls.canContinue}, requiresApproval=${workflow.controls.requiresApproval}, blockingReason='${workflow.controls.blockingReason ?? "none"}'.`);
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
        (0, outputChannel_1.showSpecForgeOutput)(true);
        if (this.playbackState !== "paused" || this.playbackStartedAtMs === null) {
            this.playbackStartedAtMs = Date.now();
        }
        this.playbackState = "playing";
        this.setTransientExecutionPhase(this.deriveInitialExecutionPhaseId());
        if (!this.autoplayPromise) {
            this.autoplayPromise = this.runAutoplayAsync().finally(() => {
                this.autoplayPromise = null;
            });
        }
        await this.refreshAsync(reason);
    }
    async maybeAutoPlayAfterManualContinuationAsync(trigger) {
        const settings = (0, extensionSettings_1.getSpecForgeSettings)();
        if (!settings.autoPlayEnabled) {
            (0, outputChannel_1.appendSpecForgeDebugLog)(`Workflow '${this.summary.usId}' did not auto-play after ${trigger} because 'specForge.features.autoPlayEnabled' is false.`);
            return;
        }
        const workflow = this.lastWorkflow ?? await this.getBackendClient().getUserStoryWorkflow(this.summary.usId);
        this.lastWorkflow = workflow;
        if (!workflow.controls.canContinue) {
            (0, outputChannel_1.appendSpecForgeDebugLog)(`Workflow '${this.summary.usId}' did not auto-play after ${trigger} because canContinue=false, requiresApproval=${workflow.controls.requiresApproval}, blockingReason='${workflow.controls.blockingReason ?? "none"}'.`);
            return;
        }
        (0, outputChannel_1.appendSpecForgeLog)(`Auto-play enabled. Resuming workflow '${this.summary.usId}' automatically after ${trigger}.`);
        await this.startAutoplayAsync(`autoPlay:${trigger}`);
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
            : selectedPhase.artifactPath;
        if (selectedArtifactPath !== this.selectedIterationArtifactPath) {
            this.selectedIterationArtifactPath = selectedArtifactPath ?? null;
        }
        const selectedArtifactContent = await readArtifactContentAsync(selectedArtifactPath);
        const selectedOperationContent = await readArtifactContentAsync(selectedPhase.operationLogPath);
        const sourceText = await readArtifactContentAsync(workflow.mainArtifactPath) ?? "";
        const settings = (0, extensionSettings_1.getSpecForgeSettings)();
        const settingsStatus = (0, extensionSettings_1.getSpecForgeSettingsStatus)(settings);
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
            runtimeVersion,
            executionPhaseId: this.transientExecutionPhaseId,
            completedPhaseIds: this.transientCompletedPhaseIds,
            playbackStartedAtMs: this.playbackStartedAtMs,
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
        return this.summary.currentPhase === "capture"
            ? "clarification"
            : this.summary.currentPhase;
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
async function openTextDocument(filePath) {
    const document = await vscode.workspace.openTextDocument(filePath);
    await vscode.window.showTextDocument(document, { preview: false });
}
//# sourceMappingURL=workflowPanel.js.map