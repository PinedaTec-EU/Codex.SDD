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
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const fs = __importStar(require("node:fs"));
const detailsPanel_1 = require("./detailsPanel");
const executionSettingsPanel_1 = require("./executionSettingsPanel");
const extensionRuntime_1 = require("./extensionRuntime");
const extensionSettings_1 = require("./extensionSettings");
const outputChannel_1 = require("./outputChannel");
const runtimeVersion_1 = require("./runtimeVersion");
const workflowPanel_1 = require("./workflowPanel");
const workflowAuditView_1 = require("./workflowAuditView");
const sidebarView_1 = require("./sidebarView");
const repoPromptsStatus_1 = require("./repoPromptsStatus");
const specsExplorer_1 = require("./specsExplorer");
const userWorkspacePreferences_1 = require("./userWorkspacePreferences");
const backendClientModel_1 = require("./backendClientModel");
const workflowGraphLayout_1 = require("./workflowGraphLayout");
let previousAttentionSnapshot = new Map();
function activate(context) {
    (0, specsExplorer_1.configureBackendHostRoot)(context.extensionUri.fsPath);
    (0, outputChannel_1.setSpecForgeDebugLoggingEnabled)(context.extensionMode === vscode.ExtensionMode.Development);
    context.subscriptions.push((0, outputChannel_1.getSpecForgeOutputChannel)());
    void logActivationVersionAsync(context);
    (0, outputChannel_1.appendSpecForgeDebugLog)(`Extension activated in mode '${vscode.ExtensionMode[context.extensionMode]}'.`);
    const manifestVersion = readManifestVersion(context);
    const sidebarProvider = new sidebarView_1.SidebarViewProvider(context.extensionUri, async () => {
        await refreshWorkspaceUiAsync("sidebar:onDidCreateUserStory");
    });
    const workflowAuditProvider = new workflowAuditView_1.WorkflowAuditViewProvider(context.extensionUri);
    const refreshableProvider = { refresh: () => sidebarProvider.refresh() };
    const mcpProvider = new SpecForgeMcpServerDefinitionProvider(context.extensionUri.fsPath, manifestVersion);
    (0, extensionRuntime_1.activateExtension)(context, createVsCodeHost(), refreshableProvider, createExtensionActions(refreshableProvider, sidebarProvider, workflowAuditProvider, mcpProvider));
    const refreshWorkspaceUiAsync = async (reason) => {
        if (reason.startsWith("watcher:") && (0, workflowPanel_1.hasActiveWorkflowPlayback)()) {
            (0, outputChannel_1.appendSpecForgeDebugLog)(`Skipping workspace UI refresh while workflow playback is active. reason='${reason}'.`);
            return;
        }
        (0, outputChannel_1.appendSpecForgeDebugLog)(`Refreshing workspace UI. reason='${reason}'.`);
        sidebarProvider.refresh();
        await (0, workflowPanel_1.refreshWorkflowViews)(reason);
        await notifyAttentionChangesAsync();
    };
    context.subscriptions.push(vscode.window.registerWebviewViewProvider("specForge.userStories", sidebarProvider), vscode.window.registerWebviewViewProvider("specForge.auditStream", workflowAuditProvider), vscode.lm.registerMcpServerDefinitionProvider("specForge.workspaceMcp", mcpProvider), vscode.commands.registerCommand("specForge.openExecutionSettings", async () => {
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? null;
        await (0, executionSettingsPanel_1.openExecutionSettingsPanelAsync)(context.extensionUri, workspaceRoot, async () => {
            await refreshWorkspaceUiAsync("executionSettingsSaved");
            if (!workspaceRoot) {
                mcpProvider.refresh();
                return;
            }
            const resetResult = (0, specsExplorer_1.requestBackendClientReset)(workspaceRoot);
            if (resetResult === "deferred") {
                (0, outputChannel_1.appendSpecForgeLog)(`Execution settings were saved while a workflow phase was running for '${workspaceRoot}'. The new setup will apply after the next phase boundary.`);
                void vscode.window.showInformationMessage("Execution settings saved. SpecForge.AI will apply them after the current phase completes.");
                return;
            }
            mcpProvider.refresh();
        });
    }), createWorkspaceWatcher(refreshWorkspaceUiAsync), vscode.workspace.onDidChangeConfiguration((event) => {
        if (!event.affectsConfiguration("specForge")) {
            return;
        }
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (workspaceRoot) {
            const resetResult = (0, specsExplorer_1.requestBackendClientReset)(workspaceRoot);
            if (resetResult === "deferred") {
                (0, outputChannel_1.appendSpecForgeLog)(`Configuration changes for '${workspaceRoot}' were deferred because a workflow phase is still running.`);
                void refreshWorkspaceUiAsync("configurationChanged");
                return;
            }
        }
        mcpProvider.refresh();
        void refreshWorkspaceUiAsync("configurationChanged");
    }));
    void ensureRepoPromptsInitializedAsync();
    void ensureWorkflowGraphLayoutInitializedAsync();
    void autoOpenStarredUserStoryAsync(sidebarProvider, workflowAuditProvider, mcpProvider);
}
function deactivate() {
    (0, extensionRuntime_1.deactivateExtension)({
        disposeBackendClients: specsExplorer_1.disposeBackendClients
    });
}
async function logActivationVersionAsync(context) {
    const manifestVersion = readManifestVersion(context);
    const runtimeVersion = await (0, runtimeVersion_1.readRuntimeVersionAsync)();
    (0, outputChannel_1.appendSpecForgeLog)(`Extension version manifest='${manifestVersion}' runtime='${runtimeVersion ?? "unknown"}'.`);
}
async function ensureRepoPromptsInitializedAsync() {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspaceRoot) {
        return;
    }
    const promptsStatus = await (0, repoPromptsStatus_1.getRepoPromptsStatusAsync)(workspaceRoot);
    if (promptsStatus.initialized) {
        (0, outputChannel_1.appendSpecForgeDebugLog)(`Repo prompts already initialized for '${workspaceRoot}'.`);
        return;
    }
    (0, outputChannel_1.appendSpecForgeLog)(`Repo prompts missing for '${workspaceRoot}'. Attempting non-destructive bootstrap. Missing: ${promptsStatus.missingPaths.join(", ")}`);
    try {
        const result = await (0, specsExplorer_1.getOrCreateBackendClient)(workspaceRoot).initializeRepoPrompts(false);
        (0, outputChannel_1.appendSpecForgeLog)(`Repo prompts bootstrap completed for '${workspaceRoot}'. Created ${result.createdFiles.length} file(s), skipped ${result.skippedFiles.length}.`);
    }
    catch (error) {
        (0, outputChannel_1.appendSpecForgeLog)(`Repo prompts bootstrap failed for '${workspaceRoot}': ${error instanceof Error ? error.message : String(error)}`);
    }
}
async function ensureWorkflowGraphLayoutInitializedAsync() {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspaceRoot) {
        return;
    }
    try {
        await (0, workflowGraphLayout_1.ensureWorkflowGraphLayoutConfigExistsAsync)(workspaceRoot);
    }
    catch (error) {
        (0, outputChannel_1.appendSpecForgeLog)(`Workflow graph layout bootstrap failed for '${workspaceRoot}': ${error instanceof Error ? error.message : String(error)}`);
    }
}
function createVsCodeHost() {
    return {
        registerTreeDataProvider: () => new vscode.Disposable(() => undefined),
        registerCommand: (command, callback) => vscode.commands.registerCommand(command, callback)
    };
}
class SpecForgeMcpServerDefinitionProvider {
    hostRoot;
    version;
    definitionsChangedEmitter = new vscode.EventEmitter();
    onDidChangeMcpServerDefinitions = this.definitionsChangedEmitter.event;
    constructor(hostRoot, version) {
        this.hostRoot = hostRoot;
        this.version = version;
    }
    provideMcpServerDefinitions() {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            (0, outputChannel_1.appendSpecForgeDebugLog)("Skipping SpecForge MCP registration because no workspace folder is open.");
            return [];
        }
        const settings = (0, extensionSettings_1.getSpecForgeSettings)();
        const environment = toMcpEnvironment((0, extensionSettings_1.buildBackendEnvironment)(settings));
        const server = new vscode.McpStdioServerDefinition(`SpecForge.AI (${workspaceFolder.name})`, "dotnet", ["run", "--project", (0, backendClientModel_1.buildServerProjectPath)(this.hostRoot)], environment, this.version);
        server.cwd = workspaceFolder.uri;
        (0, outputChannel_1.appendSpecForgeDebugLog)(`Providing SpecForge MCP server definition for workspace '${workspaceFolder.uri.fsPath}'.`);
        return [server];
    }
    resolveMcpServerDefinition(server) {
        (0, outputChannel_1.appendSpecForgeLog)(`Resolving SpecForge MCP server '${server.label}'.`);
        return server;
    }
    refresh() {
        (0, outputChannel_1.appendSpecForgeDebugLog)("Refreshing SpecForge MCP server definitions.");
        this.definitionsChangedEmitter.fire();
    }
}
function toMcpEnvironment(environment) {
    const result = {};
    for (const [key, value] of Object.entries(environment)) {
        if (value !== undefined) {
            result[key] = value;
        }
    }
    return result;
}
function readManifestVersion(context) {
    const rawVersion = context.extension.packageJSON?.version;
    return typeof rawVersion === "string" && rawVersion.trim().length > 0
        ? rawVersion.trim()
        : "unknown";
}
function createExtensionActions(explorerProvider, sidebarProvider, workflowAuditProvider, mcpProvider) {
    return {
        createUserStoryFromInput: specsExplorer_1.createUserStoryFromInput,
        importUserStoryFromMarkdown: specsExplorer_1.importUserStoryFromMarkdown,
        initializeRepoPrompts: specsExplorer_1.initializeRepoPrompts,
        openPromptTemplates: specsExplorer_1.openPromptTemplates,
        openWorkflowView: async (summary) => {
            const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
            if (!workspaceRoot || !summary || typeof summary !== "object" || !("usId" in summary)) {
                return;
            }
            await (0, workflowGraphLayout_1.ensureWorkflowGraphLayoutConfigExistsAsync)(workspaceRoot);
            await (0, workflowPanel_1.openWorkflowView)(workspaceRoot, summary, () => (0, specsExplorer_1.getOrCreateBackendClient)(workspaceRoot), {
                refreshExplorer: async () => {
                    explorerProvider.refresh();
                    await notifyAttentionChangesAsync();
                },
                setActiveWorkflowUsId: (usId) => {
                    sidebarProvider.setActiveWorkflowUsId(usId);
                },
                showWorkflowAudit: (usId, workflow, state) => {
                    workflowAuditProvider.showWorkflowAudit(usId, workflow, state);
                },
                clearWorkflowAudit: (usId) => {
                    workflowAuditProvider.clearWorkflowAudit(usId);
                },
                notifyAttention: (message) => {
                    void showAttentionNotificationIfEnabledAsync(message);
                },
                stopBackend: (root) => {
                    (0, specsExplorer_1.resetBackendClient)(root);
                },
                applyPendingExecutionSettings: (root) => {
                    const applied = (0, specsExplorer_1.applyPendingBackendClientReset)(root);
                    if (applied) {
                        mcpProvider.refresh();
                    }
                    return applied;
                },
                hasPendingExecutionSettings: (root) => (0, specsExplorer_1.hasPendingBackendClientReset)(root)
            });
        },
        openMainArtifact: specsExplorer_1.openMainArtifact,
        showUserStoryDetails: detailsPanel_1.showUserStoryDetails,
        approveCurrentPhase: specsExplorer_1.approveCurrentPhase,
        requestRegression: specsExplorer_1.requestRegression,
        restartUserStoryFromSource: specsExplorer_1.restartUserStoryFromSource,
        deleteUserStory: specsExplorer_1.deleteUserStory,
        continuePhase: specsExplorer_1.continuePhase,
        disposeBackendClients: specsExplorer_1.disposeBackendClients,
        showOutput: async () => {
            (0, outputChannel_1.showSpecForgeOutput)(false);
        }
    };
}
async function notifyAttentionChangesAsync() {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspaceRoot) {
        return;
    }
    const preferences = await readUserWorkspacePreferencesWithWorkspaceFallbackAsync(workspaceRoot);
    if (!preferences.attentionNotificationsEnabled) {
        return;
    }
    const summaries = await (0, specsExplorer_1.getOrCreateBackendClient)(workspaceRoot).listUserStories();
    (0, outputChannel_1.appendSpecForgeDebugLog)(`notifyAttentionChangesAsync loaded ${summaries.length} user story summary item(s).`);
    const nextSnapshot = new Map();
    for (const summary of summaries) {
        const fingerprint = `${summary.currentPhase}:${summary.status}`;
        nextSnapshot.set(summary.usId, fingerprint);
        if (previousAttentionSnapshot.get(summary.usId) === fingerprint) {
            continue;
        }
        if (summary.status === "waiting-user") {
            void vscode.window.showInformationMessage(`${summary.usId} is waiting for user attention at ${summary.currentPhase}.`);
        }
        else if (summary.status === "blocked") {
            void vscode.window.showWarningMessage(`${summary.usId} is blocked at ${summary.currentPhase}.`);
        }
        else if (summary.status === "completed") {
            void vscode.window.showInformationMessage(`${summary.usId} completed the workflow.`);
        }
    }
    previousAttentionSnapshot = nextSnapshot;
}
function createWorkspaceWatcher(onChange) {
    const disposables = [];
    let debounceHandle;
    const scheduleRefresh = (uri) => {
        void (async () => {
            const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
            if (!workspaceRoot) {
                return;
            }
            const preferences = await readUserWorkspacePreferencesWithWorkspaceFallbackAsync(workspaceRoot);
            if (!preferences.watcherEnabled) {
                (0, outputChannel_1.appendSpecForgeDebugLog)(`Watcher ignored change because watcher is disabled. path='${uri?.fsPath ?? "unknown"}'.`);
                return;
            }
            if (uri && /(?:^|[\\/])runtime\.yaml$/i.test(uri.fsPath)) {
                (0, outputChannel_1.appendSpecForgeDebugLog)(`Watcher ignored runtime heartbeat file. path='${uri.fsPath}'.`);
                return;
            }
            if (uri) {
                (0, workflowPanel_1.notifyWorkflowFileChanged)(uri.fsPath);
            }
            (0, outputChannel_1.appendSpecForgeDebugLog)(`Watcher scheduled refresh. path='${uri?.fsPath ?? "unknown"}'.`);
            if (debounceHandle) {
                clearTimeout(debounceHandle);
            }
            debounceHandle = setTimeout(() => {
                void onChange(`watcher:${uri?.fsPath ?? "unknown"}`);
            }, 300);
        })();
    };
    const markdownWatcher = vscode.workspace.createFileSystemWatcher("**/.specs/us/**/*.md");
    const yamlWatcher = vscode.workspace.createFileSystemWatcher("**/.specs/us/**/*.yaml");
    for (const watcher of [markdownWatcher, yamlWatcher]) {
        watcher.onDidChange(scheduleRefresh, undefined, disposables);
        watcher.onDidCreate(scheduleRefresh, undefined, disposables);
        watcher.onDidDelete(scheduleRefresh, undefined, disposables);
        disposables.push(watcher);
    }
    return new vscode.Disposable(() => {
        if (debounceHandle) {
            clearTimeout(debounceHandle);
        }
        for (const disposable of disposables) {
            disposable.dispose();
        }
    });
}
async function autoOpenStarredUserStoryAsync(sidebarProvider, workflowAuditProvider, mcpProvider) {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspaceRoot) {
        return;
    }
    const preferences = await (0, userWorkspacePreferences_1.readUserWorkspacePreferences)(workspaceRoot);
    if (!preferences.starredUserStoryId) {
        return;
    }
    try {
        const summary = await (0, specsExplorer_1.getOrCreateBackendClient)(workspaceRoot).getUserStorySummary(preferences.starredUserStoryId);
        await (0, workflowPanel_1.openWorkflowView)(workspaceRoot, summary, () => (0, specsExplorer_1.getOrCreateBackendClient)(workspaceRoot), {
            refreshExplorer: async () => {
                await vscode.commands.executeCommand("specForge.refreshUserStories");
                await notifyAttentionChangesAsync();
            },
            setActiveWorkflowUsId: (usId) => {
                sidebarProvider.setActiveWorkflowUsId(usId);
            },
            showWorkflowAudit: (usId, workflow, state) => {
                workflowAuditProvider.showWorkflowAudit(usId, workflow, state);
            },
            clearWorkflowAudit: (usId) => {
                workflowAuditProvider.clearWorkflowAudit(usId);
            },
            notifyAttention: (message) => {
                void showAttentionNotificationIfEnabledAsync(message);
            },
            stopBackend: (root) => {
                (0, specsExplorer_1.resetBackendClient)(root);
            },
            applyPendingExecutionSettings: (root) => {
                const applied = (0, specsExplorer_1.applyPendingBackendClientReset)(root);
                if (applied) {
                    mcpProvider.refresh();
                }
                return applied;
            },
            hasPendingExecutionSettings: (root) => (0, specsExplorer_1.hasPendingBackendClientReset)(root)
        });
    }
    catch {
        await clearMissingStarredUserStoryAsync(workspaceRoot);
    }
}
async function readUserWorkspacePreferencesWithWorkspaceFallbackAsync(workspaceRoot) {
    const settings = (0, extensionSettings_1.getSpecForgeSettings)();
    return (0, userWorkspacePreferences_1.readUserWorkspacePreferences)(workspaceRoot, {
        watcherEnabled: settings.watcherEnabled,
        attentionNotificationsEnabled: settings.attentionNotificationsEnabled,
        contextSuggestionsEnabled: settings.contextSuggestionsEnabled
    });
}
async function showAttentionNotificationIfEnabledAsync(message) {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspaceRoot) {
        return;
    }
    const preferences = await readUserWorkspacePreferencesWithWorkspaceFallbackAsync(workspaceRoot);
    if (preferences.attentionNotificationsEnabled) {
        void vscode.window.showInformationMessage(message);
    }
}
async function clearMissingStarredUserStoryAsync(workspaceRoot) {
    await (0, userWorkspacePreferences_1.setStarredUserStory)(workspaceRoot, null);
    try {
        await fs.promises.rm((0, userWorkspacePreferences_1.getUserWorkspacePreferencesPath)(workspaceRoot), { force: true });
    }
    catch {
        // Best effort cleanup only.
    }
}
//# sourceMappingURL=extension.js.map