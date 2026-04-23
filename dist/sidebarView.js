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
const repoPromptsStatus_1 = require("./repoPromptsStatus");
const runtimeVersion_1 = require("./runtimeVersion");
const specsExplorer_1 = require("./specsExplorer");
const sidebarViewContent_1 = require("./sidebarViewContent");
const sourceFileReferences_1 = require("./sourceFileReferences");
const userActor_1 = require("./userActor");
const userStoryIntake_1 = require("./userStoryIntake");
const userWorkspacePreferences_1 = require("./userWorkspacePreferences");
const utils_1 = require("./utils");
class SidebarViewProvider {
    extensionUri;
    onDidCreateUserStory;
    webviewView;
    showCreateForm = false;
    showExecutionSettingsForm = false;
    busyMessage = null;
    viewMode = "category";
    activeWorkflowUsId = null;
    createFileMode = "context";
    createFiles = [];
    createReferenceScanVersion = 0;
    createFormResetToken = 0;
    constructor(extensionUri, onDidCreateUserStory) {
        this.extensionUri = extensionUri;
        this.onDidCreateUserStory = onDidCreateUserStory;
    }
    refresh() {
        void this.renderAsync();
    }
    setActiveWorkflowUsId(usId) {
        if (this.activeWorkflowUsId === usId) {
            return;
        }
        this.activeWorkflowUsId = usId;
        void this.safeRenderAsync();
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
                this.showExecutionSettingsForm = false;
                this.createFileMode = "context";
                this.createFiles = [];
                this.createFormResetToken += 1;
                await this.safeRenderAsync();
                return;
            case "hideCreateForm":
                this.showCreateForm = false;
                this.createFiles = [];
                await this.safeRenderAsync();
                return;
            case "showExecutionSettingsForm":
                this.showExecutionSettingsForm = true;
                this.showCreateForm = false;
                await this.safeRenderAsync();
                return;
            case "hideExecutionSettingsForm":
                this.showExecutionSettingsForm = false;
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
            case "loadCreateSourceFromFile":
                await this.loadCreateSourceFromFileAsync();
                return;
            case "scanCreateSourceReferences":
                await this.scanCreateSourceReferencesAsync(message.sourceText ?? "");
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
            case "saveExecutionSettings":
                await this.runBusyActionAsync("Saving execution settings...", async () => {
                    await this.saveExecutionSettingsAsync(message.modelProfiles ?? [], message.phaseModelAssignments ?? {});
                    this.showExecutionSettingsForm = false;
                });
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
    async loadCreateSourceFromFileAsync() {
        const selection = await vscode.window.showOpenDialog({
            canSelectFiles: true,
            canSelectFolders: false,
            canSelectMany: false,
            openLabel: "Load user story source"
        });
        const sourceUri = selection?.[0];
        if (!sourceUri || !this.webviewView) {
            return;
        }
        const sourceText = await fs.promises.readFile(sourceUri.fsPath, "utf8");
        const firstHeading = sourceText.split(/\r?\n/).find((line) => /^#\s+/.test(line)) ?? "";
        const suggestedTitle = firstHeading.replace(/^#\s+/, "").trim();
        await this.webviewView.webview.postMessage({
            command: "loadedCreateSourceFile",
            sourceText,
            suggestedTitle,
            sourcePath: sourceUri.fsPath
        });
    }
    async scanCreateSourceReferencesAsync(sourceText) {
        if (!this.webviewView) {
            return;
        }
        const workspaceRoot = getWorkspaceRoot();
        const scanVersion = ++this.createReferenceScanVersion;
        if (!workspaceRoot || sourceText.trim().length === 0) {
            await this.webviewView.webview.postMessage({
                command: "updateCreateSourceReferences",
                files: []
            });
            return;
        }
        const files = await (0, sourceFileReferences_1.findReferencedWorkspaceFilesAsync)(workspaceRoot, sourceText, this.createFiles.map((file) => file.sourcePath));
        if (scanVersion !== this.createReferenceScanVersion) {
            return;
        }
        await this.webviewView.webview.postMessage({
            command: "updateCreateSourceReferences",
            files: files.map((file) => serializeReferencedFile(file))
        });
    }
    async materializeCreateFilesAsync(userStoryDirectoryPath) {
        for (const file of this.createFiles) {
            const targetDirectoryPath = path.join(userStoryDirectoryPath, file.kind === "context" ? "context" : "attachments");
            await fs.promises.mkdir(targetDirectoryPath, { recursive: true });
            const targetPath = await (0, utils_1.getNextAttachmentPathAsync)(targetDirectoryPath, file.name);
            await fs.promises.copyFile(file.sourcePath, targetPath);
        }
    }
    async initializeRepoPromptsFromSidebarAsync() {
        const workspaceRoot = getWorkspaceRoot();
        if (!workspaceRoot) {
            return;
        }
        const promptsStatus = await (0, repoPromptsStatus_1.getRepoPromptsStatusAsync)(workspaceRoot);
        if (!promptsStatus.initialized) {
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
    async saveExecutionSettingsAsync(modelProfiles, phaseModelAssignments) {
        const configuration = vscode.workspace.getConfiguration("specForge");
        const normalizedProfiles = modelProfiles.map((profile) => ({
            name: typeof profile.name === "string" ? profile.name : "",
            provider: typeof profile.provider === "string" ? profile.provider : "openai-compatible",
            baseUrl: typeof profile.baseUrl === "string" ? profile.baseUrl : "",
            apiKey: typeof profile.apiKey === "string" ? profile.apiKey : "",
            model: typeof profile.model === "string" ? profile.model : "",
            repositoryAccess: typeof profile.repositoryAccess === "string" ? profile.repositoryAccess : "none"
        }));
        const normalizedAssignments = {
            defaultProfile: normalizeOptionalAssignment(phaseModelAssignments.defaultProfile),
            captureProfile: normalizeOptionalAssignment(phaseModelAssignments.captureProfile),
            clarificationProfile: normalizeOptionalAssignment(phaseModelAssignments.clarificationProfile),
            refinementProfile: normalizeOptionalAssignment(phaseModelAssignments.refinementProfile),
            technicalDesignProfile: normalizeOptionalAssignment(phaseModelAssignments.technicalDesignProfile),
            implementationProfile: normalizeOptionalAssignment(phaseModelAssignments.implementationProfile),
            reviewProfile: normalizeOptionalAssignment(phaseModelAssignments.reviewProfile),
            releaseApprovalProfile: normalizeOptionalAssignment(phaseModelAssignments.releaseApprovalProfile),
            prPreparationProfile: normalizeOptionalAssignment(phaseModelAssignments.prPreparationProfile)
        };
        await configuration.update("execution.modelProfiles", normalizedProfiles, vscode.ConfigurationTarget.Workspace);
        await configuration.update("execution.phaseModels", normalizedAssignments, vscode.ConfigurationTarget.Workspace);
    }
    async renderAsync() {
        if (!this.webviewView) {
            return;
        }
        const workspaceRoot = getWorkspaceRoot();
        if (!workspaceRoot) {
            const settingsStatus = (0, extensionSettings_1.getSpecForgeSettingsStatus)((0, extensionSettings_1.getSpecForgeSettings)());
            const runtimeVersion = await (0, runtimeVersion_1.readRuntimeVersionAsync)();
            this.webviewView.webview.html = (0, sidebarViewContent_1.buildSidebarHtml)({
                hasWorkspace: false,
                showCreateForm: false,
                showExecutionSettingsForm: this.showExecutionSettingsForm,
                busyMessage: this.busyMessage,
                promptsInitialized: false,
                promptsMessage: null,
                settingsConfigured: settingsStatus.executionConfigured,
                settingsMessage: settingsStatus.message,
                modelProfiles: (0, extensionSettings_1.getSpecForgeSettings)().modelProfiles,
                phaseModelAssignments: (0, extensionSettings_1.getSpecForgeSettings)().phaseModelAssignments,
                starredUserStoryId: null,
                activeWorkflowUsId: this.activeWorkflowUsId,
                runtimeVersion,
                viewMode: this.viewMode,
                createFileMode: this.createFileMode,
                createFiles: this.createFiles,
                createFormResetToken: this.createFormResetToken,
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
        const promptsStatus = await (0, repoPromptsStatus_1.getRepoPromptsStatusAsync)(workspaceRoot);
        const settings = (0, extensionSettings_1.getSpecForgeSettings)();
        const settingsStatus = (0, extensionSettings_1.getSpecForgeSettingsStatus)(settings);
        if (!settingsStatus.executionConfigured) {
            (0, outputChannel_1.appendSpecForgeLog)(`Sidebar settings warning for '${workspaceRoot}': ${settingsStatus.message}. Diagnostics: ${settingsStatus.diagnostics}`);
        }
        if (!promptsStatus.initialized) {
            (0, outputChannel_1.appendSpecForgeLog)(`Sidebar prompt bootstrap warning for '${workspaceRoot}': ${promptsStatus.message ?? "missing prompt files"}. Checked: ${promptsStatus.checkedPaths.join(", ")}`);
        }
        const preferences = await (0, userWorkspacePreferences_1.readUserWorkspacePreferences)(workspaceRoot);
        const runtimeVersion = await (0, runtimeVersion_1.readRuntimeVersionAsync)();
        this.webviewView.webview.html = (0, sidebarViewContent_1.buildSidebarHtml)({
            hasWorkspace: true,
            showCreateForm: this.showCreateForm,
            showExecutionSettingsForm: this.showExecutionSettingsForm,
            busyMessage: this.busyMessage,
            promptsInitialized: promptsStatus.initialized,
            promptsMessage: promptsStatus.message,
            settingsConfigured: settingsStatus.executionConfigured,
            settingsMessage: settingsStatus.message,
            modelProfiles: settings.modelProfiles,
            phaseModelAssignments: settings.phaseModelAssignments,
            starredUserStoryId: preferences.starredUserStoryId,
            activeWorkflowUsId: this.activeWorkflowUsId,
            runtimeVersion,
            viewMode: this.viewMode,
            createFileMode: this.createFileMode,
            createFiles: this.createFiles,
            createFormResetToken: this.createFormResetToken,
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
                showExecutionSettingsForm: false,
                busyMessage: this.busyMessage,
                promptsInitialized: false,
                promptsMessage: null,
                settingsConfigured: false,
                settingsMessage: "SpecForge.AI settings could not be evaluated.",
                modelProfiles: [],
                phaseModelAssignments: {
                    defaultProfile: null,
                    captureProfile: null,
                    clarificationProfile: null,
                    refinementProfile: null,
                    technicalDesignProfile: null,
                    implementationProfile: null,
                    reviewProfile: null,
                    releaseApprovalProfile: null,
                    prPreparationProfile: null
                },
                starredUserStoryId: null,
                activeWorkflowUsId: this.activeWorkflowUsId,
                runtimeVersion: await (0, runtimeVersion_1.readRuntimeVersionAsync)(),
                viewMode: this.viewMode,
                createFileMode: this.createFileMode,
                createFiles: this.createFiles,
                createFormResetToken: this.createFormResetToken,
                categories: [],
                userStories: []
            });
            void vscode.window.showErrorMessage(`SpecForge sidebar failed to load: ${(0, utils_1.asErrorMessage)(error)}`);
        }
    }
}
exports.SidebarViewProvider = SidebarViewProvider;
function serializeReferencedFile(file) {
    return {
        sourcePath: file.sourcePath,
        workspaceRelativePath: file.workspaceRelativePath,
        name: file.name
    };
}
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
async function openTextDocument(filePath) {
    const document = await vscode.workspace.openTextDocument(filePath);
    await vscode.window.showTextDocument(document, { preview: false });
}
async function openSpecForgeSettingsAsync() {
    await vscode.commands.executeCommand("workbench.action.openSettings", "@ext:local.specforge-ai specForge");
}
function normalizeOptionalAssignment(value) {
    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
}
//# sourceMappingURL=sidebarView.js.map