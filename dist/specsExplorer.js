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
exports.configureBackendHostRoot = configureBackendHostRoot;
exports.createUserStoryFromInput = createUserStoryFromInput;
exports.importUserStoryFromMarkdown = importUserStoryFromMarkdown;
exports.initializeRepoPrompts = initializeRepoPrompts;
exports.openPromptTemplates = openPromptTemplates;
exports.openMainArtifact = openMainArtifact;
exports.continuePhase = continuePhase;
exports.approveCurrentPhase = approveCurrentPhase;
exports.requestRegression = requestRegression;
exports.restartUserStoryFromSource = restartUserStoryFromSource;
exports.deleteUserStory = deleteUserStory;
exports.getOrCreateBackendClient = getOrCreateBackendClient;
exports.resetBackendClient = resetBackendClient;
exports.disposeBackendClients = disposeBackendClients;
const fs = __importStar(require("node:fs"));
const path = __importStar(require("node:path"));
const vscode = __importStar(require("vscode"));
const backendClient_1 = require("./backendClient");
const extensionSettings_1 = require("./extensionSettings");
const outputChannel_1 = require("./outputChannel");
const utils_1 = require("./utils");
const userActor_1 = require("./userActor");
const workflowPanel_1 = require("./workflowPanel");
const explorerModel_1 = require("./explorerModel");
const backendClients = new Map();
const REGRESSION_TARGETS = {
    review: ["implementation", "technical-design", "refinement"],
    "release-approval": ["implementation", "technical-design", "refinement"]
};
const USER_STORY_KINDS = ["feature", "bug", "hotfix"];
let backendHostRoot;
function configureBackendHostRoot(hostRoot) {
    backendHostRoot = hostRoot;
}
class UserStoryTreeItem extends vscode.TreeItem {
    summary;
    contextValue = "userStory";
    constructor(summary) {
        super(summary.usId, vscode.TreeItemCollapsibleState.None);
        this.summary = summary;
        this.description = `${summary.currentPhase} · ${summary.status}`;
        this.tooltip = summary.title;
        this.command = {
            command: "specForge.openWorkflowView",
            title: "Open Workflow View",
            arguments: [summary]
        };
    }
}
exports.UserStoryTreeItem = UserStoryTreeItem;
class UserStoryCategoryTreeItem extends vscode.TreeItem {
    category;
    contextValue = "userStoryCategory";
    constructor(category, count) {
        super(category, vscode.TreeItemCollapsibleState.Expanded);
        this.category = category;
        this.description = `${count} US`;
        this.tooltip = `User stories in category ${category}`;
        this.iconPath = new vscode.ThemeIcon("folder-library");
    }
}
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
    async getChildren(element) {
        const workspaceRoot = getWorkspaceRoot();
        if (!workspaceRoot) {
            return [];
        }
        let summaries;
        try {
            summaries = await getBackendClient(workspaceRoot).listUserStories();
            await logUserStoryDiscoveryAsync(workspaceRoot, summaries, "explorer.getChildren");
        }
        catch (error) {
            await logUserStoryDiscoveryFailureAsync(workspaceRoot, error, "explorer.getChildren");
            throw error;
        }
        if (element instanceof UserStoryCategoryTreeItem) {
            return summaries
                .filter((summary) => (0, explorerModel_1.normalizeCategory)(summary.category) === element.category)
                .sort(explorerModel_1.compareUserStories)
                .map((summary) => new UserStoryTreeItem(summary));
        }
        if (element instanceof UserStoryTreeItem) {
            return [];
        }
        const items = [];
        if (await hasInitializedRepoPromptsAsync(workspaceRoot)) {
            items.push(new RepoPromptTemplatesTreeItem());
        }
        else {
            items.push(new RepoPromptSetupTreeItem());
        }
        for (const group of (0, explorerModel_1.groupUserStoriesByCategory)(summaries)) {
            items.push(new UserStoryCategoryTreeItem(group.category, group.summaries.length));
        }
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
    const kind = await pickUserStoryKind();
    if (!kind) {
        return;
    }
    const category = await pickUserStoryCategory(workspaceRoot);
    if (!category) {
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
    const result = await getBackendClient(workspaceRoot).createUserStory(usId, title, kind, category, sourceText, (0, userActor_1.getCurrentActor)());
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
    const kind = await pickUserStoryKind();
    if (!kind) {
        return;
    }
    const category = await pickUserStoryCategory(workspaceRoot);
    if (!category) {
        return;
    }
    const usId = await nextUserStoryId(workspaceRoot);
    const result = await getBackendClient(workspaceRoot).importUserStory(usId, sourceUri.fsPath, title, kind, category, (0, userActor_1.getCurrentActor)());
    await openTextDocument(result.mainArtifactPath);
}
async function initializeRepoPrompts(overwrite = false) {
    const workspaceRoot = getWorkspaceRoot();
    if (!workspaceRoot) {
        void vscode.window.showWarningMessage("Open a workspace folder before initializing repo prompts.");
        return;
    }
    try {
        const result = await getBackendClient(workspaceRoot).initializeRepoPrompts(overwrite);
        const createdCount = result.createdFiles.length;
        const skippedCount = result.skippedFiles.length;
        void vscode.window.showInformationMessage(overwrite
            ? `Repo prompts reinitialized. Created ${createdCount} files and skipped ${skippedCount}.`
            : `Repo prompts initialized. Created ${createdCount} files and skipped ${skippedCount}.`);
    }
    catch (error) {
        void vscode.window.showErrorMessage((0, utils_1.asErrorMessage)(error));
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
        const result = await getBackendClient(workspaceRoot).continuePhase(summary.usId, (0, userActor_1.getCurrentActor)());
        if (result.generatedArtifactPath) {
            await openTextDocument(result.generatedArtifactPath);
        }
        void vscode.window.showInformationMessage(`${summary.usId} advanced to ${result.currentPhase} with status ${result.status}.`);
    }
    catch (error) {
        void vscode.window.showErrorMessage((0, utils_1.asErrorMessage)(error));
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
        const updatedSummary = await getBackendClient(workspaceRoot).approveCurrentPhase(summary.usId, baseBranch, undefined, (0, userActor_1.getCurrentActor)());
        void vscode.window.showInformationMessage(`${updatedSummary.usId} approved. Current phase remains ${updatedSummary.currentPhase} until you continue the workflow.`);
    }
    catch (error) {
        void vscode.window.showErrorMessage((0, utils_1.asErrorMessage)(error));
    }
}
async function requestRegression(summary) {
    if (!summary) {
        void vscode.window.showInformationMessage("Select a user story first.");
        return;
    }
    const workspaceRoot = getWorkspaceRoot();
    if (!workspaceRoot) {
        void vscode.window.showWarningMessage("Open a workspace folder before requesting a regression.");
        return;
    }
    const allowedTargets = REGRESSION_TARGETS[summary.currentPhase] ?? [];
    if (allowedTargets.length === 0) {
        void vscode.window.showWarningMessage(`${summary.currentPhase} does not currently allow explicit regression from the extension.`);
        return;
    }
    const targetPhase = await vscode.window.showQuickPick(allowedTargets.map((phase) => ({
        label: phase,
        description: `Regress ${summary.usId} to ${phase}`
    })), {
        ignoreFocusOut: true,
        title: `Request regression for ${summary.usId}`,
        placeHolder: "Choose the target phase"
    });
    if (!targetPhase) {
        return;
    }
    const reason = await vscode.window.showInputBox({
        prompt: "Reason for regression",
        ignoreFocusOut: true,
        validateInput: (value) => value.trim().length > 0 ? undefined : "Reason is required."
    });
    if (!reason) {
        return;
    }
    try {
        const destructiveRewindEnabled = (0, extensionSettings_1.getSpecForgeSettings)().destructiveRewindEnabled;
        const result = await getBackendClient(workspaceRoot).requestRegression(summary.usId, targetPhase.label, reason, (0, userActor_1.getCurrentActor)(), destructiveRewindEnabled);
        void vscode.window.showInformationMessage(`${summary.usId} regressed to ${result.currentPhase} with status ${result.status}${destructiveRewindEnabled ? " using destructive cleanup" : ""}.`);
    }
    catch (error) {
        void vscode.window.showErrorMessage((0, utils_1.asErrorMessage)(error));
    }
}
async function restartUserStoryFromSource(summary) {
    if (!summary) {
        void vscode.window.showInformationMessage("Select a user story first.");
        return;
    }
    const workspaceRoot = getWorkspaceRoot();
    if (!workspaceRoot) {
        void vscode.window.showWarningMessage("Open a workspace folder before restarting a user story.");
        return;
    }
    const reason = await vscode.window.showInputBox({
        prompt: "Reason for restart from source",
        ignoreFocusOut: true,
        validateInput: (value) => value.trim().length > 0 ? undefined : "Reason is required."
    });
    if (!reason) {
        return;
    }
    try {
        const result = await getBackendClient(workspaceRoot).restartUserStoryFromSource(summary.usId, reason, (0, userActor_1.getCurrentActor)());
        if (result.generatedArtifactPath) {
            await openTextDocument(result.generatedArtifactPath);
        }
        void vscode.window.showInformationMessage(`${summary.usId} restarted from source at ${result.currentPhase} with status ${result.status}.`);
    }
    catch (error) {
        void vscode.window.showErrorMessage((0, utils_1.asErrorMessage)(error));
    }
}
async function deleteUserStory(summary) {
    if (!summary) {
        void vscode.window.showInformationMessage("Select a user story first.");
        return;
    }
    const workspaceRoot = getWorkspaceRoot();
    if (!workspaceRoot) {
        void vscode.window.showWarningMessage("Open a workspace folder before deleting a user story.");
        return;
    }
    const confirmLabel = "Delete User Story";
    const selection = await vscode.window.showWarningMessage(`Delete ${summary.usId}? This removes its files and timeline from .specs/us.`, { modal: true, detail: summary.directoryPath }, confirmLabel);
    if (selection !== confirmLabel) {
        return;
    }
    const storiesRoot = path.join(workspaceRoot, ".specs", "us") + path.sep;
    const targetPath = path.resolve(summary.directoryPath);
    if (!targetPath.startsWith(storiesRoot)) {
        void vscode.window.showErrorMessage(`Refusing to delete '${summary.usId}' because its path is outside .specs/us.`);
        return;
    }
    try {
        (0, workflowPanel_1.closeWorkflowView)(workspaceRoot, summary.usId);
        await fs.promises.rm(targetPath, { recursive: true, force: false });
        void vscode.window.showInformationMessage(`${summary.usId} deleted.`);
    }
    catch (error) {
        void vscode.window.showErrorMessage((0, utils_1.asErrorMessage)(error));
    }
}
function getWorkspaceRoot() {
    return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}
async function pickUserStoryKind() {
    const selection = await vscode.window.showQuickPick(USER_STORY_KINDS.map((kind) => ({
        label: kind,
        description: `Create or import a ${kind} user story`
    })), {
        ignoreFocusOut: true,
        title: "User story kind",
        placeHolder: "Choose the branch kind for this user story"
    });
    return selection?.label;
}
async function pickUserStoryCategory(workspaceRoot) {
    const categories = await getUserStoryCategoriesAsync(workspaceRoot);
    const selection = await vscode.window.showQuickPick(categories.map((category) => ({
        label: category,
        description: `Assign category ${category}`
    })), {
        ignoreFocusOut: true,
        title: "User story category",
        placeHolder: "Choose the category used to group this user story"
    });
    return selection?.label;
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
async function hasInitializedRepoPromptsAsync(workspaceRoot) {
    const hasConfig = await pathExistsAsync(path.join(workspaceRoot, ".specs", "config.yaml"));
    const hasManifest = await pathExistsAsync(path.join(workspaceRoot, ".specs", "prompts", "prompts.yaml"));
    return hasConfig && hasManifest;
}
async function nextUserStoryId(workspaceRoot) {
    const summaries = await getBackendClient(workspaceRoot).listUserStories();
    return (0, explorerModel_1.nextUserStoryIdFromSummaries)(summaries);
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
        client = (0, backendClient_1.createMcpBackendClient)(workspaceRoot, backendHostRoot ?? workspaceRoot, (0, extensionSettings_1.getSpecForgeSettings)());
        backendClients.set(workspaceRoot, client);
    }
    return client;
}
function getOrCreateBackendClient(workspaceRoot) {
    return getBackendClient(workspaceRoot);
}
function resetBackendClient(workspaceRoot) {
    const client = backendClients.get(workspaceRoot);
    client?.dispose();
    backendClients.delete(workspaceRoot);
}
function disposeBackendClients() {
    for (const client of backendClients.values()) {
        client.dispose();
    }
    backendClients.clear();
}
async function logUserStoryDiscoveryAsync(workspaceRoot, summaries, source) {
    const specsRoot = path.join(workspaceRoot, ".specs", "us");
    const physicalEntries = await describeSpecsUserStoryTreeAsync(specsRoot);
    (0, outputChannel_1.appendSpecForgeLog)(`[${source}] discovered ${summaries.length} user story item(s) for '${workspaceRoot}'. physical='${physicalEntries.join(", ") || "empty"}'.`);
}
async function logUserStoryDiscoveryFailureAsync(workspaceRoot, error, source) {
    const specsRoot = path.join(workspaceRoot, ".specs", "us");
    const physicalEntries = await describeSpecsUserStoryTreeAsync(specsRoot);
    (0, outputChannel_1.appendSpecForgeLog)(`[${source}] failed to list user stories for '${workspaceRoot}': ${(0, utils_1.asErrorMessage)(error)}. physical='${physicalEntries.join(", ") || "empty"}'.`);
}
async function describeSpecsUserStoryTreeAsync(specsRoot) {
    try {
        const entries = await fs.promises.readdir(specsRoot, { withFileTypes: true });
        const categories = entries
            .filter((entry) => entry.isDirectory())
            .map((entry) => entry.name)
            .sort((left, right) => left.localeCompare(right));
        const descriptions = [];
        for (const category of categories) {
            const categoryPath = path.join(specsRoot, category);
            const userStoryDirectories = (await fs.promises.readdir(categoryPath, { withFileTypes: true }))
                .filter((entry) => entry.isDirectory())
                .map((entry) => entry.name)
                .sort((left, right) => left.localeCompare(right));
            descriptions.push(`${category}[${userStoryDirectories.join(", ") || "no-us"}]`);
        }
        return descriptions;
    }
    catch (error) {
        return [`error:${(0, utils_1.asErrorMessage)(error)}`];
    }
}
//# sourceMappingURL=specsExplorer.js.map