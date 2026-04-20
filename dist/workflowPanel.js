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
exports.closeWorkflowView = closeWorkflowView;
const fs = __importStar(require("node:fs"));
const path = __importStar(require("node:path"));
const vscode = __importStar(require("vscode"));
const contextSuggestions_1 = require("./contextSuggestions");
const extensionSettings_1 = require("./extensionSettings");
const outputChannel_1 = require("./outputChannel");
const workflowView_1 = require("./workflowView");
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
    playbackState = "idle";
    autoplayPromise = null;
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
            panels.delete(this.key);
        });
        this.panel.webview.onDidReceiveMessage(async (message) => {
            try {
                (0, outputChannel_1.appendSpecForgeLog)(`Workflow '${this.summary.usId}' received command '${message.command}'.`);
                await this.handleMessageAsync(message);
            }
            catch (error) {
                this.playbackState = "paused";
                await this.refreshAsync();
                (0, outputChannel_1.appendSpecForgeLog)(`Workflow '${this.summary.usId}' command '${message.command}' failed: ${asErrorMessage(error)}`);
                (0, outputChannel_1.showSpecForgeOutput)(false);
                void vscode.window.showErrorMessage(asErrorMessage(error));
            }
        });
    }
    get key() {
        return `${this.workspaceRoot}:${this.summary.usId}`;
    }
    async showAsync() {
        this.panel.reveal(vscode.ViewColumn.Active);
        await this.refreshAsync("showAsync");
    }
    dispose() {
        this.panel.dispose();
    }
    async refreshAsync(reason = "unspecified") {
        (0, outputChannel_1.appendSpecForgeDebugLog)(`Workflow '${this.summary.usId}' refresh start. reason='${reason}', selectedPhase='${this.selectedPhaseId}', playback='${this.playbackState}', summaryPhase='${this.summary.currentPhase}'.`);
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
        const sourceText = await readArtifactContentAsync(workflow.mainArtifactPath) ?? "";
        const settings = (0, extensionSettings_1.getSpecForgeSettings)();
        const settingsStatus = (0, extensionSettings_1.getSpecForgeSettingsStatus)(settings);
        const contextSuggestions = settings.contextSuggestionsEnabled && workflow.currentPhase === "clarification"
            ? await (0, contextSuggestions_1.suggestContextFiles)(this.workspaceRoot, workflow, sourceText)
            : [];
        this.panel.title = `${workflow.usId} workflow`;
        this.panel.webview.html = (0, workflowView_1.buildWorkflowHtml)(workflow, {
            selectedPhaseId: this.selectedPhaseId,
            selectedArtifactContent,
            contextSuggestions,
            settingsConfigured: settingsStatus.executionConfigured,
            settingsMessage: settingsStatus.message,
            debugMode: (0, outputChannel_1.isSpecForgeDebugLoggingEnabled)()
        }, this.playbackState);
        (0, outputChannel_1.appendSpecForgeDebugLog)(`Workflow '${this.summary.usId}' refresh end. reason='${reason}', workflowPhase='${workflow.currentPhase}', workflowStatus='${workflow.status}', selectedPhase='${this.selectedPhaseId}', suggestions=${contextSuggestions.length}.`);
    }
    async handleMessageAsync(message) {
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
                (0, outputChannel_1.appendSpecForgeLog)(`Continuing workflow '${this.summary.usId}' from phase '${this.summary.currentPhase}'.`);
                await this.continueCurrentPhaseAsync();
                return;
            case "approve":
                await this.approveCurrentPhaseAsync();
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
            case "play":
                if (!this.isExecutionConfigured()) {
                    await vscode.commands.executeCommand("workbench.action.openSettings", "@ext:local.specforge-ai specForge");
                    return;
                }
                (0, outputChannel_1.appendSpecForgeLog)(`Autoplay requested for '${this.summary.usId}'.`);
                (0, outputChannel_1.showSpecForgeOutput)(true);
                this.playbackState = "playing";
                if (!this.autoplayPromise) {
                    this.autoplayPromise = this.runAutoplayAsync().finally(() => {
                        this.autoplayPromise = null;
                    });
                }
                await this.refreshAsync("command:play");
                return;
            case "pause":
                (0, outputChannel_1.appendSpecForgeLog)(`Autoplay paused for '${this.summary.usId}'.`);
                this.playbackState = "paused";
                await this.refreshAsync("command:pause");
                return;
            case "stop":
                (0, outputChannel_1.appendSpecForgeLog)(`Autoplay stopped for '${this.summary.usId}'.`);
                this.playbackState = "stopping";
                this.callbacks.stopBackend(this.workspaceRoot);
                await this.callbacks.refreshExplorer();
                this.playbackState = "idle";
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
        this.selectedPhaseId = result.currentPhase;
        (0, outputChannel_1.appendSpecForgeDebugLog)(`Workflow '${this.summary.usId}' continueCurrentPhaseAsync requested explorer refresh.`);
        await this.callbacks.refreshExplorer();
        await this.refreshAsync("continueCurrentPhaseAsync");
    }
    async submitClarificationAnswersAsync(answers) {
        await this.getBackendClient().submitClarificationAnswers(this.summary.usId, answers);
        (0, outputChannel_1.appendSpecForgeLog)(`Workflow '${this.summary.usId}' stored ${answers.length} clarification answer(s).`);
        (0, outputChannel_1.appendSpecForgeDebugLog)(`Workflow '${this.summary.usId}' submitClarificationAnswersAsync requested explorer refresh.`);
        await this.callbacks.refreshExplorer();
        await this.refreshAsync("submitClarificationAnswersAsync");
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
            const targetPath = await getNextAttachmentPathAsync(attachmentsDirectoryPath, path.basename(source.fsPath));
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
            const targetPath = await getNextAttachmentPathAsync(contextDirectoryPath, path.basename(sourcePath));
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
        const targetPath = await getNextAttachmentPathAsync(targetDirectory, path.basename(sourcePath));
        await fs.promises.rename(sourcePath, targetPath);
        await this.refreshAsync();
        void vscode.window.showInformationMessage(`Moved ${path.basename(sourcePath)} to ${targetKind === "context" ? "context" : "user story info"} in ${this.summary.usId}.`);
    }
    async approveCurrentPhaseAsync() {
        let baseBranch;
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
        (0, outputChannel_1.appendSpecForgeLog)(`Workflow '${this.summary.usId}' approved phase '${this.summary.currentPhase}'.`);
        (0, outputChannel_1.appendSpecForgeDebugLog)(`Workflow '${this.summary.usId}' approveCurrentPhaseAsync requested explorer refresh.`);
        await this.callbacks.refreshExplorer();
        await this.refreshAsync("approveCurrentPhaseAsync");
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
        const result = await this.getBackendClient().requestRegression(this.summary.usId, targetPhase, reason);
        (0, outputChannel_1.appendSpecForgeLog)(`Workflow '${this.summary.usId}' regressed to '${result.currentPhase}' with status '${result.status}'.`);
        this.summary = {
            ...this.summary,
            currentPhase: result.currentPhase,
            status: result.status
        };
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
        const result = await this.getBackendClient().restartUserStoryFromSource(this.summary.usId, reason);
        (0, outputChannel_1.appendSpecForgeLog)(`Workflow '${this.summary.usId}' restarted from source. Current phase '${result.currentPhase}', status '${result.status}'.`);
        this.summary = {
            ...this.summary,
            currentPhase: result.currentPhase,
            status: result.status
        };
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
        this.summary = {
            ...this.summary,
            currentPhase: result.currentPhase,
            status: result.status,
            workBranch: null
        };
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
            await this.refreshAsync("autoplay:error");
            (0, outputChannel_1.appendSpecForgeLog)(`Autoplay failed for '${this.summary.usId}': ${asErrorMessage(error)}`);
            (0, outputChannel_1.showSpecForgeOutput)(false);
            void vscode.window.showErrorMessage(asErrorMessage(error));
        }
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
async function getNextAttachmentPathAsync(directoryPath, fileName) {
    const extension = path.extname(fileName);
    const baseName = extension.length > 0 ? fileName.slice(0, -extension.length) : fileName;
    for (let version = 1; version < 1000; version++) {
        const suffix = version === 1 ? "" : `.v${String(version).padStart(2, "0")}`;
        const candidate = path.join(directoryPath, `${baseName}${suffix}${extension}`);
        try {
            await fs.promises.access(candidate, fs.constants.F_OK);
        }
        catch {
            return candidate;
        }
    }
    throw new Error(`Unable to allocate attachment path for '${fileName}'.`);
}
async function openTextDocument(filePath) {
    const document = await vscode.workspace.openTextDocument(filePath);
    await vscode.window.showTextDocument(document, { preview: false });
}
function asErrorMessage(error) {
    if (error instanceof Error) {
        return error.message;
    }
    return "Unknown workflow view error.";
}
//# sourceMappingURL=workflowPanel.js.map