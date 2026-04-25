"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WorkflowAuditViewProvider = void 0;
const workflowView_1 = require("./workflowView");
class WorkflowAuditViewProvider {
    extensionUri;
    webviewView;
    snapshot = null;
    constructor(extensionUri) {
        this.extensionUri = extensionUri;
    }
    resolveWebviewView(webviewView) {
        this.webviewView = webviewView;
        webviewView.webview.options = {
            enableScripts: false,
            localResourceRoots: [this.extensionUri]
        };
        this.render();
    }
    showWorkflowAudit(usId, workflow, state) {
        this.snapshot = { usId, workflow, state };
        this.render();
    }
    clearWorkflowAudit(usId) {
        if (!this.snapshot) {
            return;
        }
        if (usId && this.snapshot.usId !== usId) {
            return;
        }
        this.snapshot = null;
        this.render();
    }
    render() {
        if (!this.webviewView) {
            return;
        }
        this.webviewView.webview.html = this.snapshot
            ? (0, workflowView_1.buildWorkflowAuditHtml)(this.snapshot.workflow, this.snapshot.state)
            : buildEmptyWorkflowAuditHtml();
    }
}
exports.WorkflowAuditViewProvider = WorkflowAuditViewProvider;
function buildEmptyWorkflowAuditHtml() {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>
    :root {
      color-scheme: light dark;
      font-family: "Avenir Next", "Segoe UI", ui-sans-serif, sans-serif;
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
//# sourceMappingURL=workflowAuditView.js.map