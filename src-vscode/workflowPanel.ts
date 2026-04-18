import * as fs from "node:fs";
import * as vscode from "vscode";
import { type SpecForgeBackendClient, type UserStorySummary, type UserStoryWorkflowDetails } from "./backendClient";
import { buildWorkflowHtml } from "./workflowView";

type WorkflowPanelCommand =
  | { readonly command: "selectPhase"; readonly phaseId?: string }
  | { readonly command: "openArtifact"; readonly path?: string }
  | { readonly command: "continue" }
  | { readonly command: "approve" }
  | { readonly command: "restart" }
  | { readonly command: "regress"; readonly phaseId?: string };

const panels = new Map<string, WorkflowPanelController>();

export async function openWorkflowView(
  workspaceRoot: string,
  summary: UserStorySummary,
  backendClient: SpecForgeBackendClient
): Promise<void> {
  const panelId = `${workspaceRoot}:${summary.usId}`;
  let controller = panels.get(panelId);
  if (!controller) {
    controller = new WorkflowPanelController(workspaceRoot, summary, backendClient);
    panels.set(panelId, controller);
  }

  await controller.showAsync();
}

export async function refreshWorkflowViews(): Promise<void> {
  for (const panel of panels.values()) {
    await panel.refreshAsync();
  }
}

class WorkflowPanelController {
  private readonly panel: vscode.WebviewPanel;
  private selectedPhaseId: string;

  public constructor(
    private readonly workspaceRoot: string,
    private summary: UserStorySummary,
    private readonly backendClient: SpecForgeBackendClient
  ) {
    this.selectedPhaseId = summary.currentPhase;
    this.panel = vscode.window.createWebviewPanel(
      "specForge.workflowView",
      `${summary.usId} workflow`,
      vscode.ViewColumn.Active,
      {
        enableScripts: true,
        retainContextWhenHidden: true
      }
    );

    this.panel.onDidDispose(() => {
      panels.delete(this.key);
    });

    this.panel.webview.onDidReceiveMessage(async (message: WorkflowPanelCommand) => {
      await this.handleMessageAsync(message);
    });
  }

  private get key(): string {
    return `${this.workspaceRoot}:${this.summary.usId}`;
  }

  public async showAsync(): Promise<void> {
    this.panel.reveal(vscode.ViewColumn.Active);
    await this.refreshAsync();
  }

  public async refreshAsync(): Promise<void> {
    const workflow = await this.backendClient.getUserStoryWorkflow(this.summary.usId);
    this.summary = {
      ...this.summary,
      currentPhase: workflow.currentPhase,
      status: workflow.status,
      workBranch: workflow.workBranch
    };

    const selectedPhase = workflow.phases.find((phase) => phase.phaseId === this.selectedPhaseId)
      ?? workflow.phases.find((phase) => phase.isCurrent)
      ?? workflow.phases[0];
    this.selectedPhaseId = selectedPhase.phaseId;
    const selectedArtifactContent = await readArtifactContentAsync(selectedPhase.artifactPath);
    this.panel.title = `${workflow.usId} workflow`;
    this.panel.webview.html = buildWorkflowHtml(workflow, {
      selectedPhaseId: this.selectedPhaseId,
      selectedArtifactContent
    });
  }

  private async handleMessageAsync(message: WorkflowPanelCommand): Promise<void> {
    switch (message.command) {
      case "selectPhase":
        if (message.phaseId) {
          this.selectedPhaseId = message.phaseId;
          await this.refreshAsync();
        }
        return;
      case "openArtifact":
        if (message.path) {
          await openTextDocument(message.path);
        }
        return;
      case "continue":
        await vscode.commands.executeCommand("specForge.continuePhase", this.summary);
        await this.refreshAsync();
        return;
      case "approve":
        await vscode.commands.executeCommand("specForge.approveCurrentPhase", this.summary);
        await this.refreshAsync();
        return;
      case "restart":
        await vscode.commands.executeCommand("specForge.restartUserStoryFromSource", this.summary);
        await this.refreshAsync();
        return;
      case "regress":
        if (message.phaseId) {
          await vscode.commands.executeCommand("specForge.requestRegression", {
            ...this.summary,
            currentPhase: this.summary.currentPhase
          });
          await this.refreshAsync();
        }
        return;
    }
  }
}

async function readArtifactContentAsync(artifactPath: string | null): Promise<string | null> {
  if (!artifactPath) {
    return null;
  }

  try {
    return await fs.promises.readFile(artifactPath, "utf8");
  } catch {
    return null;
  }
}

async function openTextDocument(filePath: string): Promise<void> {
  const document = await vscode.workspace.openTextDocument(filePath);
  await vscode.window.showTextDocument(document, { preview: false });
}
