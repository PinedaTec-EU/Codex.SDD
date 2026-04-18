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
const vscode = __importStar(require("vscode"));
const workflowView_1 = require("./workflowView");
const panels = new Map();
async function openWorkflowView(workspaceRoot, summary, backendClient) {
    const panelId = `${workspaceRoot}:${summary.usId}`;
    let controller = panels.get(panelId);
    if (!controller) {
        controller = new WorkflowPanelController(workspaceRoot, summary, backendClient);
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
    backendClient;
    panel;
    selectedPhaseId;
    constructor(workspaceRoot, summary, backendClient) {
        this.workspaceRoot = workspaceRoot;
        this.summary = summary;
        this.backendClient = backendClient;
        this.selectedPhaseId = summary.currentPhase;
        this.panel = vscode.window.createWebviewPanel("specForge.workflowView", `${summary.usId} workflow`, vscode.ViewColumn.Active, {
            enableScripts: true,
            retainContextWhenHidden: true
        });
        this.panel.onDidDispose(() => {
            panels.delete(this.key);
        });
        this.panel.webview.onDidReceiveMessage(async (message) => {
            await this.handleMessageAsync(message);
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
        const workflow = await this.backendClient.getUserStoryWorkflow(this.summary.usId);
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
        });
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
                if (message.path) {
                    await openTextDocument(message.path);
                }
                return;
            case "continue":
                await vscode.commands.executeCommand("specForge.continuePhase", this.summary);
                await this.refreshAsync();
                return;
            case "approve":
                await vscode.commands.executeCommand("specForge.approveCurrentPhase", this.summary);
                await this.refreshAsync();
                return;
            case "restart":
                await vscode.commands.executeCommand("specForge.restartUserStoryFromSource", this.summary);
                await this.refreshAsync();
                return;
            case "regress":
                if (message.phaseId) {
                    await vscode.commands.executeCommand("specForge.requestRegression", {
                        ...this.summary,
                        currentPhase: this.summary.currentPhase
                    });
                    await this.refreshAsync();
                }
                return;
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
async function openTextDocument(filePath) {
    const document = await vscode.workspace.openTextDocument(filePath);
    await vscode.window.showTextDocument(document, { preview: false });
}
//# sourceMappingURL=workflowPanel.js.map