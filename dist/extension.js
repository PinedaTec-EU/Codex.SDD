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
const workflowPanel_1 = require("./workflowPanel");
const specsExplorer_1 = require("./specsExplorer");
function activate(context) {
    const explorerProvider = new specsExplorer_1.SpecsExplorerProvider();
    (0, extensionRuntime_1.activateExtension)(context, createVsCodeHost(), explorerProvider, createExtensionActions());
}
function deactivate() {
    (0, extensionRuntime_1.deactivateExtension)(createExtensionActions());
}
function createVsCodeHost() {
    return {
        registerTreeDataProvider: (viewId, provider) => vscode.window.registerTreeDataProvider(viewId, provider),
        registerCommand: (command, callback) => vscode.commands.registerCommand(command, callback)
    };
}
function createExtensionActions() {
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
            await (0, workflowPanel_1.openWorkflowView)(workspaceRoot, summary, (0, specsExplorer_1.getOrCreateBackendClient)(workspaceRoot));
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
//# sourceMappingURL=extension.js.map