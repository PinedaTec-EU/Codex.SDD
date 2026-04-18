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
const detailsPanel_1 = require("./detailsPanel");
const extensionRuntime_1 = require("./extensionRuntime");
const extensionSettings_1 = require("./extensionSettings");
const workflowPanel_1 = require("./workflowPanel");
const specsExplorer_1 = require("./specsExplorer");
let previousAttentionSnapshot = new Map();
function activate(context) {
    const explorerProvider = new specsExplorer_1.SpecsExplorerProvider();
    (0, extensionRuntime_1.activateExtension)(context, createVsCodeHost(), explorerProvider, createExtensionActions(explorerProvider));
    const refreshWorkspaceUiAsync = async () => {
        explorerProvider.refresh();
        await (0, workflowPanel_1.refreshWorkflowViews)();
        await notifyAttentionChangesAsync();
    };
    context.subscriptions.push(createWorkspaceWatcher(refreshWorkspaceUiAsync), vscode.workspace.onDidChangeConfiguration((event) => {
        if (!event.affectsConfiguration("specForge")) {
            return;
        }
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (workspaceRoot) {
            (0, specsExplorer_1.resetBackendClient)(workspaceRoot);
        }
        explorerProvider.refresh();
    }));
}
function deactivate() {
    (0, extensionRuntime_1.deactivateExtension)({
        disposeBackendClients: specsExplorer_1.disposeBackendClients
    });
}
function createVsCodeHost() {
    return {
        registerTreeDataProvider: (viewId, provider) => vscode.window.registerTreeDataProvider(viewId, provider),
        registerCommand: (command, callback) => vscode.commands.registerCommand(command, callback)
    };
}
function createExtensionActions(explorerProvider) {
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
            await (0, workflowPanel_1.openWorkflowView)(workspaceRoot, summary, () => (0, specsExplorer_1.getOrCreateBackendClient)(workspaceRoot), {
                refreshExplorer: async () => {
                    explorerProvider.refresh();
                    await notifyAttentionChangesAsync();
                },
                notifyAttention: (message) => {
                    if ((0, extensionSettings_1.getSpecForgeSettings)().attentionNotificationsEnabled) {
                        void vscode.window.showInformationMessage(message);
                    }
                },
                stopBackend: (root) => {
                    (0, specsExplorer_1.resetBackendClient)(root);
                }
            });
        },
        openMainArtifact: specsExplorer_1.openMainArtifact,
        showUserStoryDetails: detailsPanel_1.showUserStoryDetails,
        approveCurrentPhase: specsExplorer_1.approveCurrentPhase,
        requestRegression: specsExplorer_1.requestRegression,
        restartUserStoryFromSource: specsExplorer_1.restartUserStoryFromSource,
        continuePhase: specsExplorer_1.continuePhase,
        disposeBackendClients: specsExplorer_1.disposeBackendClients
    };
}
async function notifyAttentionChangesAsync() {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspaceRoot || !(0, extensionSettings_1.getSpecForgeSettings)().attentionNotificationsEnabled) {
        return;
    }
    const summaries = await (0, specsExplorer_1.getOrCreateBackendClient)(workspaceRoot).listUserStories();
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
    const scheduleRefresh = () => {
        if (!(0, extensionSettings_1.getSpecForgeSettings)().watcherEnabled) {
            return;
        }
        if (debounceHandle) {
            clearTimeout(debounceHandle);
        }
        debounceHandle = setTimeout(() => {
            void onChange();
        }, 300);
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
//# sourceMappingURL=extension.js.map