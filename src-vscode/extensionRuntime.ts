export interface ExplorerProviderLike {
  refresh(): void;
}

export interface DisposableLike {
  dispose(): void;
}

export interface ExtensionActions {
  createUserStoryFromInput(): Promise<void>;
  importUserStoryFromMarkdown(): Promise<void>;
  initializeRepoPrompts(overwrite?: boolean): Promise<void>;
  openPromptTemplates(): Promise<void>;
  openWorkflowView(summary: unknown): Promise<void>;
  openMainArtifact(summary: unknown): Promise<void>;
  showUserStoryDetails(summary: unknown): Promise<void>;
  approveCurrentPhase(summary: unknown): Promise<void>;
  requestRegression(summary: unknown): Promise<void>;
  restartUserStoryFromSource(summary: unknown): Promise<void>;
  continuePhase(summary: unknown): Promise<void>;
  disposeBackendClients(): void;
}

export interface ExtensionHost {
  registerTreeDataProvider(viewId: string, provider: ExplorerProviderLike): DisposableLike;
  registerCommand(command: string, callback: (...args: unknown[]) => unknown): DisposableLike;
}

export interface ExtensionContextLike {
  subscriptions: DisposableLike[];
}

export function activateExtension(
  context: ExtensionContextLike,
  host: ExtensionHost,
  explorerProvider: ExplorerProviderLike,
  actions: ExtensionActions
): void {
  context.subscriptions.push(
    host.registerTreeDataProvider("specForge.userStories", explorerProvider),
    host.registerCommand("specForge.refreshUserStories", () => {
      explorerProvider.refresh();
    }),
    host.registerCommand("specForge.createUserStory", async () => {
      await actions.createUserStoryFromInput();
      explorerProvider.refresh();
    }),
    host.registerCommand("specForge.importUserStory", async () => {
      await actions.importUserStoryFromMarkdown();
      explorerProvider.refresh();
    }),
    host.registerCommand("specForge.initializeRepoPrompts", async (overwrite) => {
      await actions.initializeRepoPrompts(typeof overwrite === "boolean" ? overwrite : undefined);
      explorerProvider.refresh();
    }),
    host.registerCommand("specForge.openPromptTemplates", async () => {
      await actions.openPromptTemplates();
    }),
    host.registerCommand("specForge.openWorkflowView", async (summary) => {
      await actions.openWorkflowView(summary);
    }),
    host.registerCommand("specForge.openMainArtifact", async (summary) => {
      await actions.openMainArtifact(summary);
    }),
    host.registerCommand("specForge.showUserStoryDetails", async (summary) => {
      await actions.showUserStoryDetails(summary);
    }),
    host.registerCommand("specForge.approveCurrentPhase", async (summary) => {
      await actions.approveCurrentPhase(summary);
      explorerProvider.refresh();
    }),
    host.registerCommand("specForge.requestRegression", async (summary) => {
      await actions.requestRegression(summary);
      explorerProvider.refresh();
    }),
    host.registerCommand("specForge.restartUserStoryFromSource", async (summary) => {
      await actions.restartUserStoryFromSource(summary);
      explorerProvider.refresh();
    }),
    host.registerCommand("specForge.continuePhase", async (summary) => {
      await actions.continuePhase(summary);
      explorerProvider.refresh();
    })
  );
}

export function deactivateExtension(actions: Pick<ExtensionActions, "disposeBackendClients">): void {
  actions.disposeBackendClients();
}
