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
exports.SidebarViewProvider = void 0;
const fs = __importStar(require("node:fs"));
const path = __importStar(require("node:path"));
const vscode = __importStar(require("vscode"));
const extensionSettings_1 = require("./extensionSettings");
const explorerModel_1 = require("./explorerModel");
const specsExplorer_1 = require("./specsExplorer");
const sidebarViewContent_1 = require("./sidebarViewContent");
class SidebarViewProvider {
    extensionUri;
    onDidCreateUserStory;
    webviewView;
    showCreateForm = false;
    busyMessage = null;
    constructor(extensionUri, onDidCreateUserStory) {
        this.extensionUri = extensionUri;
        this.onDidCreateUserStory = onDidCreateUserStory;
    }
    refresh() {
        void this.renderAsync();
    }
    resolveWebviewView(webviewView) {
        this.webviewView = webviewView;
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this.extensionUri]
        };
        webviewView.webview.onDidReceiveMessage(async (message) => {
            await this.handleMessageAsync(message);
        });
        return this.safeRenderAsync();
    }
    async handleMessageAsync(message) {
        if (this.busyMessage) {
            return;
        }
        switch (message.command) {
            case "showCreateForm":
                this.showCreateForm = true;
                await this.safeRenderAsync();
                return;
            case "hideCreateForm":
                this.showCreateForm = false;
                await this.safeRenderAsync();
                return;
            case "openWorkflow":
                if (!message.usId) {
                    return;
                }
                await this.openWorkflowAsync(message.usId);
                return;
            case "initializeRepoPrompts":
                await this.runBusyActionAsync("Bootstrapping repo prompts...", async () => {
                    await this.initializeRepoPromptsFromSidebarAsync();
                    await this.safeRenderAsync();
                });
                return;
            case "openPromptTemplates":
                await vscode.commands.executeCommand("specForge.openPromptTemplates");
                return;
            case "openSettings":
                await openSpecForgeSettingsAsync();
                return;
            case "submitCreateForm":
                await this.runBusyActionAsync("Creating user story...", async () => {
                    await this.submitCreateFormAsync(message);
                });
                return;
        }
    }
    async runBusyActionAsync(message, action) {
        this.busyMessage = message;
        await this.safeRenderAsync();
        try {
            await action();
        }
        finally {
            this.busyMessage = null;
            await this.safeRenderAsync();
        }
    }
    async submitCreateFormAsync(message) {
        const workspaceRoot = getWorkspaceRoot();
        if (!workspaceRoot) {
            void vscode.window.showWarningMessage("Open a workspace folder before creating a user story.");
            return;
        }
        const title = message.title?.trim();
        const kind = message.kind?.trim();
        const category = message.category?.trim();
        const sourceText = message.sourceText?.trim();
        if (!title || !kind || !category || !sourceText) {
            void vscode.window.showWarningMessage("Title, kind, category, and source are required.");
            return;
        }
        const backendClient = (0, specsExplorer_1.getOrCreateBackendClient)(workspaceRoot);
        const summaries = await backendClient.listUserStories();
        const usId = (0, explorerModel_1.nextUserStoryIdFromSummaries)(summaries);
        const result = await backendClient.createUserStory(usId, title, kind, category, sourceText);
        this.showCreateForm = false;
        await this.onDidCreateUserStory();
        const createdSummary = await backendClient.getUserStorySummary(usId);
        await vscode.commands.executeCommand("specForge.openWorkflowView", createdSummary);
        await openTextDocument(result.mainArtifactPath);
    }
    async openWorkflowAsync(usId) {
        const workspaceRoot = getWorkspaceRoot();
        if (!workspaceRoot) {
            return;
        }
        const summary = await (0, specsExplorer_1.getOrCreateBackendClient)(workspaceRoot).getUserStorySummary(usId);
        await vscode.commands.executeCommand("specForge.openWorkflowView", summary);
    }
    async initializeRepoPromptsFromSidebarAsync() {
        const workspaceRoot = getWorkspaceRoot();
        if (!workspaceRoot) {
            return;
        }
        const promptsInitialized = await hasInitializedRepoPromptsAsync(workspaceRoot);
        if (!promptsInitialized) {
            await vscode.commands.executeCommand("specForge.initializeRepoPrompts", false);
            return;
        }
        const confirmLabel = "Overwrite Prompts";
        const selection = await vscode.window.showWarningMessage("Repo prompts are already initialized. Overwriting them will discard any local prompt edits.", { modal: true }, confirmLabel);
        if (selection !== confirmLabel) {
            return;
        }
        await vscode.commands.executeCommand("specForge.initializeRepoPrompts", true);
    }
    async renderAsync() {
        if (!this.webviewView) {
            return;
        }
        const workspaceRoot = getWorkspaceRoot();
        if (!workspaceRoot) {
            const settingsStatus = (0, extensionSettings_1.getSpecForgeSettingsStatus)((0, extensionSettings_1.getSpecForgeSettings)());
            this.webviewView.webview.html = (0, sidebarViewContent_1.buildSidebarHtml)({
                hasWorkspace: false,
                showCreateForm: false,
                busyMessage: this.busyMessage,
                promptsInitialized: false,
                settingsConfigured: settingsStatus.executionConfigured,
                settingsMessage: settingsStatus.message,
                categories: [],
                userStories: []
            });
            return;
        }
        const hasPersistedStories = await hasPersistedUserStoriesAsync(workspaceRoot);
        const userStories = hasPersistedStories
            ? await (0, specsExplorer_1.getOrCreateBackendClient)(workspaceRoot).listUserStories()
            : [];
        const categories = await getUserStoryCategoriesAsync(workspaceRoot);
        const promptsInitialized = await hasInitializedRepoPromptsAsync(workspaceRoot);
        const settingsStatus = (0, extensionSettings_1.getSpecForgeSettingsStatus)((0, extensionSettings_1.getSpecForgeSettings)());
        this.webviewView.webview.html = (0, sidebarViewContent_1.buildSidebarHtml)({
            hasWorkspace: true,
            showCreateForm: this.showCreateForm,
            busyMessage: this.busyMessage,
            promptsInitialized,
            settingsConfigured: settingsStatus.executionConfigured,
            settingsMessage: settingsStatus.message,
            categories,
            userStories
        });
    }
    async safeRenderAsync() {
        try {
            await this.renderAsync();
        }
        catch (error) {
            if (!this.webviewView) {
                return;
            }
            this.webviewView.webview.html = (0, sidebarViewContent_1.buildSidebarHtml)({
                hasWorkspace: true,
                showCreateForm: false,
                busyMessage: this.busyMessage,
                promptsInitialized: false,
                settingsConfigured: false,
                settingsMessage: "SpecForge.AI settings could not be evaluated.",
                categories: [],
                userStories: []
            });
            void vscode.window.showErrorMessage(`SpecForge sidebar failed to load: ${asErrorMessage(error)}`);
        }
    }
}
exports.SidebarViewProvider = SidebarViewProvider;
async function getUserStoryCategoriesAsync(workspaceRoot) {
    const configPath = path.join(workspaceRoot, ".specs", "config.yaml");
    if (!await pathExistsAsync(configPath)) {
        return explorerModel_1.DEFAULT_USER_STORY_CATEGORIES;
    }
    const yaml = await fs.promises.readFile(configPath, "utf8");
    const categories = (0, explorerModel_1.parseYamlSequence)(yaml, "categories");
    return categories.length === 0 ? explorerModel_1.DEFAULT_USER_STORY_CATEGORIES : categories;
}
function getWorkspaceRoot() {
    return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
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
async function hasPersistedUserStoriesAsync(workspaceRoot) {
    const storiesRoot = path.join(workspaceRoot, ".specs", "us");
    if (!await pathExistsAsync(storiesRoot)) {
        return false;
    }
    const entries = await fs.promises.readdir(storiesRoot, { withFileTypes: true });
    return entries.some((entry) => entry.isDirectory() && entry.name.startsWith("us."));
}
async function hasInitializedRepoPromptsAsync(workspaceRoot) {
    const configPath = path.join(workspaceRoot, ".specs", "config.yaml");
    const promptsPath = path.join(workspaceRoot, ".specs", "prompts", "prompts.yaml");
    return await pathExistsAsync(configPath) && await pathExistsAsync(promptsPath);
}
async function openTextDocument(filePath) {
    const document = await vscode.workspace.openTextDocument(filePath);
    await vscode.window.showTextDocument(document, { preview: false });
}
function asErrorMessage(error) {
    if (error instanceof Error) {
        return error.message;
    }
    return "Unknown sidebar error.";
}
async function openSpecForgeSettingsAsync() {
    await vscode.commands.executeCommand("workbench.action.openSettings", "@ext:local.specforge-ai specForge");
}
//# sourceMappingURL=sidebarView.js.map