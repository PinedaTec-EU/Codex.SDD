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
const fs = __importStar(require("node:fs"));
const path = __importStar(require("node:path"));
const vscode = __importStar(require("vscode"));
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
async function refreshWorkflowViews() {
    for (const panel of panels.values()) {
        await panel.refreshAsync();
    }
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
                await this.handleMessageAsync(message);
            }
            catch (error) {
                this.playbackState = "paused";
                await this.refreshAsync();
                void vscode.window.showErrorMessage(asErrorMessage(error));
            }
        });
    }
    get key() {
        return `${this.workspaceRoot}:${this.summary.usId}`;
    }
    async showAsync() {
        this.panel.reveal(vscode.ViewColumn.Active);
        await this.refreshAsync();
    }
    async refreshAsync() {
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
        this.panel.webview.html = (0, workflowView_1.buildWorkflowHtml)(workflow, {
            selectedPhaseId: this.selectedPhaseId,
            selectedArtifactContent
        }, this.playbackState);
    }
    async handleMessageAsync(message) {
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
    async continueCurrentPhaseAsync() {
        const result = await this.getBackendClient().continuePhase(this.summary.usId);
        this.summary = {
            ...this.summary,
            currentPhase: result.currentPhase,
            status: result.status
        };
        await this.callbacks.refreshExplorer();
        await this.refreshAsync();
    }
    async attachFilesAsync() {
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
        await this.callbacks.refreshExplorer();
        await this.refreshAsync();
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
        this.summary = {
            ...this.summary,
            currentPhase: result.currentPhase,
            status: result.status
        };
        await this.callbacks.refreshExplorer();
        await this.refreshAsync();
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
        this.summary = {
            ...this.summary,
            currentPhase: result.currentPhase,
            status: result.status
        };
        await this.callbacks.refreshExplorer();
        await this.refreshAsync();
    }
    async runAutoplayAsync() {
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
        }
        catch (error) {
            if (this.playbackState === "stopping") {
                return;
            }
            this.playbackState = "paused";
            await this.refreshAsync();
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