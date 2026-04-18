"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.activateExtension = activateExtension;
exports.deactivateExtension = deactivateExtension;
function activateExtension(context, host, explorerProvider, actions) {
    context.subscriptions.push(host.registerTreeDataProvider("specForge.userStories", explorerProvider), host.registerCommand("specForge.refreshUserStories", () => {
        explorerProvider.refresh();
    }), host.registerCommand("specForge.createUserStory", async () => {
        await actions.createUserStoryFromInput();
        explorerProvider.refresh();
    }), host.registerCommand("specForge.importUserStory", async () => {
        await actions.importUserStoryFromMarkdown();
        explorerProvider.refresh();
    }), host.registerCommand("specForge.initializeRepoPrompts", async (overwrite) => {
        await actions.initializeRepoPrompts(typeof overwrite === "boolean" ? overwrite : undefined);
        explorerProvider.refresh();
    }), host.registerCommand("specForge.openPromptTemplates", async () => {
        await actions.openPromptTemplates();
    }), host.registerCommand("specForge.openWorkflowView", async (summary) => {
        await actions.openWorkflowView(summary);
    }), host.registerCommand("specForge.openMainArtifact", async (summary) => {
        await actions.openMainArtifact(summary);
    }), host.registerCommand("specForge.showUserStoryDetails", async (summary) => {
        await actions.showUserStoryDetails(summary);
    }), host.registerCommand("specForge.approveCurrentPhase", async (summary) => {
        await actions.approveCurrentPhase(summary);
        explorerProvider.refresh();
    }), host.registerCommand("specForge.requestRegression", async (summary) => {
        await actions.requestRegression(summary);
        explorerProvider.refresh();
    }), host.registerCommand("specForge.restartUserStoryFromSource", async (summary) => {
        await actions.restartUserStoryFromSource(summary);
        explorerProvider.refresh();
    }), host.registerCommand("specForge.deleteUserStory", async (summary) => {
        await actions.deleteUserStory(summary);
        explorerProvider.refresh();
    }), host.registerCommand("specForge.continuePhase", async (summary) => {
        await actions.continuePhase(summary);
        explorerProvider.refresh();
    }), host.registerCommand("specForge.showOutput", async () => {
        await actions.showOutput();
    }));
}
function deactivateExtension(actions) {
    actions.disposeBackendClients();
}
//# sourceMappingURL=extensionRuntime.js.map