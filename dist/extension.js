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
const specsExplorer_1 = require("./specsExplorer");
function activate(context) {
    const explorerProvider = new specsExplorer_1.SpecsExplorerProvider();
    context.subscriptions.push(vscode.window.registerTreeDataProvider("specForge.userStories", explorerProvider), vscode.commands.registerCommand("specForge.refreshUserStories", () => {
        explorerProvider.refresh();
    }), vscode.commands.registerCommand("specForge.createUserStory", async () => {
        await (0, specsExplorer_1.createUserStoryFromInput)();
        explorerProvider.refresh();
    }), vscode.commands.registerCommand("specForge.importUserStory", async () => {
        await (0, specsExplorer_1.importUserStoryFromMarkdown)();
        explorerProvider.refresh();
    }), vscode.commands.registerCommand("specForge.initializeRepoPrompts", async () => {
        await (0, specsExplorer_1.initializeRepoPrompts)();
        explorerProvider.refresh();
    }), vscode.commands.registerCommand("specForge.openPromptTemplates", async () => {
        await (0, specsExplorer_1.openPromptTemplates)();
    }), vscode.commands.registerCommand("specForge.openMainArtifact", async (summary) => {
        await (0, specsExplorer_1.openMainArtifact)(summary);
    }), vscode.commands.registerCommand("specForge.showUserStoryDetails", async (summary) => {
        await (0, detailsPanel_1.showUserStoryDetails)(summary);
    }), vscode.commands.registerCommand("specForge.approveCurrentPhase", async (summary) => {
        await (0, specsExplorer_1.approveCurrentPhase)(summary);
        explorerProvider.refresh();
    }), vscode.commands.registerCommand("specForge.requestRegression", async (summary) => {
        await (0, specsExplorer_1.requestRegression)(summary);
        explorerProvider.refresh();
    }), vscode.commands.registerCommand("specForge.restartUserStoryFromSource", async (summary) => {
        await (0, specsExplorer_1.restartUserStoryFromSource)(summary);
        explorerProvider.refresh();
    }), vscode.commands.registerCommand("specForge.continuePhase", async (summary) => {
        await (0, specsExplorer_1.continuePhase)(summary);
        explorerProvider.refresh();
    }));
}
function deactivate() {
    (0, specsExplorer_1.disposeBackendClients)();
}
//# sourceMappingURL=extension.js.map