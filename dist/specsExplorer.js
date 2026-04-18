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
exports.SpecsExplorerProvider = exports.UserStoryTreeItem = void 0;
exports.createUserStoryFromInput = createUserStoryFromInput;
exports.importUserStoryFromMarkdown = importUserStoryFromMarkdown;
exports.initializeRepoPrompts = initializeRepoPrompts;
exports.openPromptTemplates = openPromptTemplates;
exports.openMainArtifact = openMainArtifact;
exports.continuePhase = continuePhase;
exports.approveCurrentPhase = approveCurrentPhase;
exports.disposeBackendClients = disposeBackendClients;
const fs = __importStar(require("node:fs"));
const path = __importStar(require("node:path"));
const vscode = __importStar(require("vscode"));
const backendClient_1 = require("./backendClient");
const backendClients = new Map();
class UserStoryTreeItem extends vscode.TreeItem {
    summary;
    contextValue = "userStory";
    constructor(summary) {
        super(summary.usId, vscode.TreeItemCollapsibleState.None);
        this.summary = summary;
        this.description = `${summary.currentPhase} · ${summary.status}`;
        this.tooltip = summary.title;
        this.command = {
            command: "specForge.openMainArtifact",
            title: "Open Main Artifact",
            arguments: [summary]
        };
    }
}
exports.UserStoryTreeItem = UserStoryTreeItem;
class RepoPromptSetupTreeItem extends vscode.TreeItem {
    contextValue = "repoPromptSetup";
    constructor() {
        super("Repo Prompts Not Initialized", vscode.TreeItemCollapsibleState.None);
        this.description = "required for real providers";
        this.tooltip = "Initialize .specs/config.yaml and .specs/prompts/ for provider-backed phase execution.";
        this.iconPath = new vscode.ThemeIcon("warning");
        this.command = {
            command: "specForge.initializeRepoPrompts",
            title: "Initialize Repo Prompts"
        };
    }
}
class RepoPromptTemplatesTreeItem extends vscode.TreeItem {
    contextValue = "repoPromptTemplates";
    constructor() {
        super("Open Prompt Templates", vscode.TreeItemCollapsibleState.None);
        this.description = ".specs/prompts/";
        this.tooltip = "Open the repo prompt manifest and templates.";
        this.iconPath = new vscode.ThemeIcon("book");
        this.command = {
            command: "specForge.openPromptTemplates",
            title: "Open Prompt Templates"
        };
    }
}
class SpecsExplorerProvider {
    onDidChangeTreeDataEmitter = new vscode.EventEmitter();
    onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event;
    refresh() {
        this.onDidChangeTreeDataEmitter.fire(undefined);
    }
    getTreeItem(element) {
        return element;
    }
    async getChildren() {
        const workspaceRoot = getWorkspaceRoot();
        if (!workspaceRoot) {
            return [];
        }
        const items = [];
        if (await hasInitializedRepoPromptsAsync(workspaceRoot)) {
            items.push(new RepoPromptTemplatesTreeItem());
        }
        else {
            items.push(new RepoPromptSetupTreeItem());
        }
        const summaries = await getBackendClient(workspaceRoot).listUserStories();
        items.push(...summaries.map((summary) => new UserStoryTreeItem(summary)));
        return items;
    }
}
exports.SpecsExplorerProvider = SpecsExplorerProvider;
async function createUserStoryFromInput() {
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
async function importUserStoryFromMarkdown() {
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
async function initializeRepoPrompts() {
    const workspaceRoot = getWorkspaceRoot();
    if (!workspaceRoot) {
        void vscode.window.showWarningMessage("Open a workspace folder before initializing repo prompts.");
        return;
    }
    try {
        const result = await getBackendClient(workspaceRoot).initializeRepoPrompts(false);
        const createdCount = result.createdFiles.length;
        const skippedCount = result.skippedFiles.length;
        void vscode.window.showInformationMessage(`Repo prompts initialized. Created ${createdCount} files and skipped ${skippedCount}.`);
    }
    catch (error) {
        void vscode.window.showErrorMessage(asErrorMessage(error));
    }
}
async function openPromptTemplates() {
    const workspaceRoot = getWorkspaceRoot();
    if (!workspaceRoot) {
        void vscode.window.showWarningMessage("Open a workspace folder before opening prompt templates.");
        return;
    }
    const manifestPath = path.join(workspaceRoot, ".specs", "prompts", "prompts.yaml");
    if (!await pathExistsAsync(manifestPath)) {
        void vscode.window.showWarningMessage("Repo prompts are not initialized yet.");
        return;
    }
    await openTextDocument(manifestPath);
}
async function openMainArtifact(summary) {
    if (!summary) {
        void vscode.window.showInformationMessage("Select a user story first.");
        return;
    }
    await openTextDocument(summary.mainArtifactPath);
}
async function continuePhase(summary) {
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
        void vscode.window.showInformationMessage(`${summary.usId} advanced to ${result.currentPhase} with status ${result.status}.`);
    }
    catch (error) {
        void vscode.window.showErrorMessage(asErrorMessage(error));
    }
}
async function approveCurrentPhase(summary) {
    if (!summary) {
        void vscode.window.showInformationMessage("Select a user story first.");
        return;
    }
    const workspaceRoot = getWorkspaceRoot();
    if (!workspaceRoot) {
        void vscode.window.showWarningMessage("Open a workspace folder before approving a phase.");
        return;
    }
    let baseBranch;
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
        void vscode.window.showInformationMessage(`${updatedSummary.usId} approved. Current phase remains ${updatedSummary.currentPhase} until you continue the workflow.`);
    }
    catch (error) {
        void vscode.window.showErrorMessage(asErrorMessage(error));
    }
}
function getWorkspaceRoot() {
    return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}
async function hasInitializedRepoPromptsAsync(workspaceRoot) {
    const hasConfig = await pathExistsAsync(path.join(workspaceRoot, ".specs", "config.yaml"));
    const hasManifest = await pathExistsAsync(path.join(workspaceRoot, ".specs", "prompts", "prompts.yaml"));
    return hasConfig && hasManifest;
}
async function nextUserStoryId(workspaceRoot) {
    const summaries = await getBackendClient(workspaceRoot).listUserStories();
    const maxValue = summaries
        .map((summary) => /^US-(\d+)$/.exec(summary.usId))
        .filter((match) => match !== null)
        .map((match) => Number.parseInt(match[1], 10))
        .reduce((currentMax, value) => Math.max(currentMax, value), 0);
    return `US-${String(maxValue + 1).padStart(4, "0")}`;
}
async function openTextDocument(filePath) {
    const document = await vscode.workspace.openTextDocument(filePath);
    await vscode.window.showTextDocument(document, { preview: false });
}
async function pathExistsAsync(filePath) {
    try {
        await fs.promises.access(filePath, fs.constants.F_OK);
        return true;
    }
    catch {
        return false;
    }
}
function getBackendClient(workspaceRoot) {
    let client = backendClients.get(workspaceRoot);
    if (!client) {
        client = (0, backendClient_1.createMcpBackendClient)(workspaceRoot);
        backendClients.set(workspaceRoot, client);
    }
    return client;
}
function disposeBackendClients() {
    for (const client of backendClients.values()) {
        client.dispose();
    }
    backendClients.clear();
}
function asErrorMessage(error) {
    if (error instanceof Error) {
        return error.message;
    }
    return "Unknown extension error.";
}
//# sourceMappingURL=specsExplorer.js.map