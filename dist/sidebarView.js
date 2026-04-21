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
const outputChannel_1 = require("./outputChannel");
const specsExplorer_1 = require("./specsExplorer");
const sidebarViewContent_1 = require("./sidebarViewContent");
const userActor_1 = require("./userActor");
const userStoryIntake_1 = require("./userStoryIntake");
const userWorkspacePreferences_1 = require("./userWorkspacePreferences");
class SidebarViewProvider {
    extensionUri;
    onDidCreateUserStory;
    webviewView;
    showCreateForm = false;
    busyMessage = null;
    viewMode = "category";
    createFileMode = "context";
    createFiles = [];
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
                this.createFileMode = "context";
                await this.safeRenderAsync();
                return;
            case "hideCreateForm":
                this.showCreateForm = false;
                await this.safeRenderAsync();
                return;
            case "toggleViewMode":
                this.viewMode = this.viewMode === "category" ? "phase" : "category";
                await this.safeRenderAsync();
                return;
            case "setCreateFileMode":
                this.createFileMode = message.kind === "attachment" ? "attachment" : "context";
                await this.safeRenderAsync();
                return;
            case "addCreateFiles":
                await this.addCreateFilesAsync(message.kind === "attachment" ? "attachment" : "context");
                return;
            case "addCreateFilePaths":
                await this.addCreateFilePathsAsync(message.kind === "attachment" ? "attachment" : "context", message.paths ?? []);
                return;
            case "setCreateFileKind":
                if (!message.sourcePath) {
                    return;
                }
                this.createFiles = this.createFiles.map((file) => file.sourcePath === message.sourcePath
                    ? { ...file, kind: message.kind === "attachment" ? "attachment" : "context" }
                    : file);
                await this.safeRenderAsync();
                return;
            case "removeCreateFile":
                if (!message.sourcePath) {
                    return;
                }
                this.createFiles = this.createFiles.filter((file) => file.sourcePath !== message.sourcePath);
                await this.safeRenderAsync();
                return;
            case "openWorkflow":
                if (!message.usId) {
                    return;
                }
                await this.openWorkflowAsync(message.usId);
                return;
            case "deleteUserStory":
                if (!message.usId) {
                    return;
                }
                await this.deleteUserStoryAsync(message.usId);
                return;
            case "toggleStarredUserStory":
                if (!message.usId) {
                    return;
                }
                await this.toggleStarredUserStoryAsync(message.usId);
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
        const intakeMode = message.intakeMode === "wizard" ? "wizard" : "freeform";
        const sourceText = intakeMode === "wizard"
            ? (0, userStoryIntake_1.buildWizardSourceText)(message.wizardDraft).trim()
            : message.sourceText?.trim();
        if (intakeMode === "wizard") {
            const missingFields = (0, userStoryIntake_1.getWizardMissingFields)(message.wizardDraft);
            if (missingFields.length > 0) {
                void vscode.window.showWarningMessage(`The guided wizard still needs ${missingFields.join(", ")}.`);
                return;
            }
        }
        if (!title || !kind || !category || !sourceText) {
            void vscode.window.showWarningMessage("Title, kind, category, and source are required.");
            return;
        }
        const backendClient = (0, specsExplorer_1.getOrCreateBackendClient)(workspaceRoot);
        const summaries = await backendClient.listUserStories();
        const usId = (0, explorerModel_1.nextUserStoryIdFromSummaries)(summaries);
        const result = await backendClient.createUserStory(usId, title, kind, category, sourceText, (0, userActor_1.getCurrentActor)());
        await this.materializeCreateFilesAsync(result.rootDirectory);
        this.showCreateForm = false;
        this.createFiles = [];
        this.createFileMode = "context";
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
    async deleteUserStoryAsync(usId) {
        const workspaceRoot = getWorkspaceRoot();
        if (!workspaceRoot) {
            return;
        }
        const summary = await (0, specsExplorer_1.getOrCreateBackendClient)(workspaceRoot).getUserStorySummary(usId);
        await vscode.commands.executeCommand("specForge.deleteUserStory", summary);
        const preferences = await (0, userWorkspacePreferences_1.readUserWorkspacePreferences)(workspaceRoot);
        if (preferences.starredUserStoryId === usId) {
            await (0, userWorkspacePreferences_1.setStarredUserStory)(workspaceRoot, null);
        }
        await this.onDidCreateUserStory();
    }
    async toggleStarredUserStoryAsync(usId) {
        const workspaceRoot = getWorkspaceRoot();
        if (!workspaceRoot) {
            return;
        }
        const preferences = await (0, userWorkspacePreferences_1.readUserWorkspacePreferences)(workspaceRoot);
        const nextStarredUserStoryId = preferences.starredUserStoryId === usId ? null : usId;
        await (0, userWorkspacePreferences_1.setStarredUserStory)(workspaceRoot, nextStarredUserStoryId);
        await this.safeRenderAsync();
    }
    async addCreateFilesAsync(kind) {
        const selection = await vscode.window.showOpenDialog({
            canSelectFiles: true,
            canSelectFolders: false,
            canSelectMany: true,
            openLabel: kind === "context" ? "Add context files" : "Add user story files"
        });
        if (!selection || selection.length === 0) {
            return;
        }
        const nextFiles = new Map(this.createFiles.map((file) => [file.sourcePath, file]));
        for (const source of selection) {
            nextFiles.set(source.fsPath, {
                sourcePath: source.fsPath,
                name: path.basename(source.fsPath),
                kind
            });
        }
        this.createFiles = [...nextFiles.values()].sort((left, right) => left.name.localeCompare(right.name));
        await this.safeRenderAsync();
    }
    async addCreateFilePathsAsync(kind, paths) {
        const normalizedPaths = paths
            .map((entry) => entry.trim())
            .filter((entry) => entry.length > 0);
        if (normalizedPaths.length === 0) {
            return;
        }
        const nextFiles = new Map(this.createFiles.map((file) => [file.sourcePath, file]));
        for (const sourcePath of normalizedPaths) {
            nextFiles.set(sourcePath, {
                sourcePath,
                name: path.basename(sourcePath),
                kind
            });
        }
        this.createFiles = [...nextFiles.values()].sort((left, right) => left.name.localeCompare(right.name));
        await this.safeRenderAsync();
    }
    async materializeCreateFilesAsync(userStoryDirectoryPath) {
        for (const file of this.createFiles) {
            const targetDirectoryPath = path.join(userStoryDirectoryPath, file.kind === "context" ? "context" : "attachments");
            await fs.promises.mkdir(targetDirectoryPath, { recursive: true });
            const targetPath = await getNextAttachmentPathAsync(targetDirectoryPath, file.name);
            await fs.promises.copyFile(file.sourcePath, targetPath);
        }
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
                starredUserStoryId: null,
                viewMode: this.viewMode,
                createFileMode: this.createFileMode,
                createFiles: this.createFiles,
                categories: [],
                userStories: []
            });
            return;
        }
        const hasPersistedStories = await hasPersistedUserStoriesAsync(workspaceRoot);
        (0, outputChannel_1.appendSpecForgeLog)(`Sidebar persisted user story probe for '${workspaceRoot}': ${hasPersistedStories}.`);
        const userStories = hasPersistedStories
            ? await (0, specsExplorer_1.getOrCreateBackendClient)(workspaceRoot).listUserStories()
            : [];
        const categories = await getUserStoryCategoriesAsync(workspaceRoot);
        const promptsInitialized = await hasInitializedRepoPromptsAsync(workspaceRoot);
        const settingsStatus = (0, extensionSettings_1.getSpecForgeSettingsStatus)((0, extensionSettings_1.getSpecForgeSettings)());
        const preferences = await (0, userWorkspacePreferences_1.readUserWorkspacePreferences)(workspaceRoot);
        this.webviewView.webview.html = (0, sidebarViewContent_1.buildSidebarHtml)({
            hasWorkspace: true,
            showCreateForm: this.showCreateForm,
            busyMessage: this.busyMessage,
            promptsInitialized,
            settingsConfigured: settingsStatus.executionConfigured,
            settingsMessage: settingsStatus.message,
            starredUserStoryId: preferences.starredUserStoryId,
            viewMode: this.viewMode,
            createFileMode: this.createFileMode,
            createFiles: this.createFiles,
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
                starredUserStoryId: null,
                viewMode: this.viewMode,
                createFileMode: this.createFileMode,
                createFiles: this.createFiles,
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
    const categoryEntries = await fs.promises.readdir(storiesRoot, { withFileTypes: true });
    for (const categoryEntry of categoryEntries) {
        if (!categoryEntry.isDirectory()) {
            continue;
        }
        const categoryPath = path.join(storiesRoot, categoryEntry.name);
        const userStoryEntries = await fs.promises.readdir(categoryPath, { withFileTypes: true });
        if (userStoryEntries.some((entry) => entry.isDirectory() && /^US-\d+$/i.test(entry.name))) {
            return true;
        }
    }
    return false;
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
async function getNextAttachmentPathAsync(directoryPath, fileName) {
    const extension = path.extname(fileName);
    const baseName = extension.length > 0 ? fileName.slice(0, -extension.length) : fileName;
    for (let attempt = 0; attempt < 100; attempt += 1) {
        const suffix = attempt === 0 ? "" : `.${String(attempt + 1).padStart(2, "0")}`;
        const candidate = path.join(directoryPath, `${baseName}${suffix}${extension}`);
        if (!await pathExistsAsync(candidate)) {
            return candidate;
        }
    }
    throw new Error(`Unable to persist '${fileName}' after 100 attempts.`);
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