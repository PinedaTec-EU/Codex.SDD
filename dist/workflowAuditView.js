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
exports.WorkflowAuditViewProvider = void 0;
const vscode = __importStar(require("vscode"));
const workflowView_1 = require("./workflowView");
function escapeCssCustomPropertyValue(value) {
    return value.replace(/\\/g, "\\\\").replace(/"/g, "\\\"");
}
function getEditorTypographyCssVars() {
    const editorConfig = vscode.workspace.getConfiguration("editor");
    const vars = [];
    const fontFamily = editorConfig.get("fontFamily", "").trim();
    const fontSize = editorConfig.get("fontSize");
    const lineHeight = editorConfig.get("lineHeight");
    const fontLigatures = editorConfig.get("fontLigatures");
    if (fontFamily) {
        vars.push(`--specforge-editor-font-family: ${escapeCssCustomPropertyValue(fontFamily)};`);
    }
    if (typeof fontSize === "number" && Number.isFinite(fontSize) && fontSize > 0) {
        vars.push(`--specforge-editor-font-size: ${fontSize}px;`);
    }
    if (typeof lineHeight === "number" && Number.isFinite(lineHeight)) {
        if (lineHeight > 8) {
            vars.push(`--specforge-editor-line-height: ${lineHeight}px;`);
        }
        else if (lineHeight > 0) {
            vars.push(`--specforge-editor-line-height: ${lineHeight};`);
        }
    }
    if (typeof fontLigatures === "string" && fontLigatures.trim().length > 0) {
        vars.push(`--specforge-editor-font-feature-settings: ${fontLigatures.trim()};`);
    }
    else if (typeof fontLigatures === "boolean") {
        vars.push(`--specforge-editor-font-variant-ligatures: ${fontLigatures ? "normal" : "none"};`);
    }
    return vars.join("\n      ");
}
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
            ? (0, workflowView_1.buildWorkflowAuditHtml)(this.snapshot.workflow, this.snapshot.state, getEditorTypographyCssVars())
            : buildEmptyWorkflowAuditHtml(getEditorTypographyCssVars());
    }
}
exports.WorkflowAuditViewProvider = WorkflowAuditViewProvider;
function buildEmptyWorkflowAuditHtml(typographyCssVars = "") {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>
    :root {
      color-scheme: light dark;
      --specforge-editor-font-family: var(--vscode-editor-font-family, var(--vscode-font-family, "Segoe UI", ui-sans-serif, sans-serif));
      --specforge-editor-font-size: var(--vscode-editor-font-size, 13px);
      --specforge-editor-line-height: var(--vscode-editor-line-height, 1.5);
      --specforge-editor-font-feature-settings: normal;
      --specforge-editor-font-variant-ligatures: normal;
      ${typographyCssVars}
      font-family: var(--specforge-editor-font-family);
      font-size: var(--specforge-editor-font-size);
      line-height: var(--specforge-editor-line-height);
      font-feature-settings: var(--specforge-editor-font-feature-settings);
      font-variant-ligatures: var(--specforge-editor-font-variant-ligatures);
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