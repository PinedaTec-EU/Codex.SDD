import * as vscode from "vscode";
import type { UserStoryWorkflowDetails } from "./backendClient";
import { buildWorkflowAuditHtml } from "./workflowView";
import type { WorkflowViewState } from "./workflow-view/models";
import { buildWebviewTypographyRootCss, getEditorTypographyCssVars } from "./webviewTypography";

type WorkflowAuditSnapshot = {
  readonly usId: string;
  readonly workflow: UserStoryWorkflowDetails;
  readonly state: WorkflowViewState;
};

export class WorkflowAuditViewProvider implements vscode.WebviewViewProvider {
  private webviewView: vscode.WebviewView | undefined;
  private snapshot: WorkflowAuditSnapshot | null = null;

  public constructor(private readonly extensionUri: vscode.Uri) {}

  public resolveWebviewView(webviewView: vscode.WebviewView): void | Thenable<void> {
    this.webviewView = webviewView;
    webviewView.webview.options = {
      enableScripts: false,
      localResourceRoots: [this.extensionUri]
    };

    this.render();
  }

  public showWorkflowAudit(usId: string, workflow: UserStoryWorkflowDetails, state: WorkflowViewState): void {
    this.snapshot = { usId, workflow, state };
    this.render();
  }

  public clearWorkflowAudit(usId?: string): void {
    if (!this.snapshot) {
      return;
    }

    if (usId && this.snapshot.usId !== usId) {
      return;
    }

    this.snapshot = null;
    this.render();
  }

  private render(): void {
    if (!this.webviewView) {
      return;
    }

    this.webviewView.webview.html = this.snapshot
      ? buildWorkflowAuditHtml(this.snapshot.workflow, this.snapshot.state, getEditorTypographyCssVars())
      : buildEmptyWorkflowAuditHtml(getEditorTypographyCssVars());
  }
}

function buildEmptyWorkflowAuditHtml(typographyCssVars = ""): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>
    :root {
      ${buildWebviewTypographyRootCss(typographyCssVars)}
    }
    * {
      box-sizing: border-box;
    }
    body {
      margin: 0;
      min-height: 100vh;
      height: 100vh;
      display: grid;
      place-items: center;
      color: var(--vscode-descriptionForeground);
      background:
        radial-gradient(circle at 8% 10%, rgba(114, 241, 184, 0.06), transparent 20%),
        radial-gradient(circle at 88% 18%, rgba(72, 131, 255, 0.08), transparent 24%),
        linear-gradient(180deg, rgba(10, 20, 24, 0.96), rgba(10, 14, 20, 1));
      overflow: hidden;
    }
    .empty-state {
      padding: 18px 20px;
      border-radius: 16px;
      border: 1px solid rgba(255, 255, 255, 0.08);
      background: rgba(255, 255, 255, 0.03);
      text-align: center;
      max-width: 320px;
      line-height: 1.5;
    }
  </style>
</head>
<body>
  <div class="empty-state">Open a workflow to inspect its audit stream.</div>
</body>
</html>`;
}
