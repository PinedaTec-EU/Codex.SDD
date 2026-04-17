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
exports.showUserStoryDetails = showUserStoryDetails;
const vscode = __importStar(require("vscode"));
const PHASES = [
    "capture",
    "refinement",
    "technical-design",
    "implementation",
    "review",
    "release-approval",
    "pr-preparation"
];
async function showUserStoryDetails(summary) {
    const panel = vscode.window.createWebviewPanel("specForge.userStoryDetails", `${summary.usId} details`, vscode.ViewColumn.Beside, {
        enableScripts: false
    });
    panel.webview.html = buildHtml(summary);
    await Promise.resolve();
}
function buildHtml(summary) {
    const phaseItems = PHASES.map((phase) => {
        const isCurrent = phase === summary.currentPhase;
        return `<li class="${isCurrent ? "current" : ""}">${isCurrent ? "●" : "○"} ${phase}</li>`;
    }).join("");
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>
    :root {
      color-scheme: light dark;
      font-family: ui-monospace, "SF Mono", Menlo, monospace;
    }
    body {
      padding: 20px;
      line-height: 1.5;
    }
    h1, h2 {
      font-weight: 700;
    }
    ul {
      padding-left: 18px;
    }
    .current {
      font-weight: 700;
    }
    .meta {
      margin-bottom: 16px;
    }
    code {
      font-size: 0.95em;
    }
  </style>
</head>
<body>
  <h1>${escapeHtml(summary.usId)}</h1>
  <div class="meta">
    <div><strong>Title:</strong> ${escapeHtml(summary.title)}</div>
    <div><strong>Status:</strong> <code>${escapeHtml(summary.status)}</code></div>
    <div><strong>Current phase:</strong> <code>${escapeHtml(summary.currentPhase)}</code></div>
    <div><strong>Branch:</strong> <code>${escapeHtml(summary.workBranch ?? "not-created")}</code></div>
    <div><strong>Main artifact:</strong> <code>${escapeHtml(summary.mainArtifactPath)}</code></div>
  </div>
  <h2>Workflow</h2>
  <ul>${phaseItems}</ul>
  <h2>Next action</h2>
  <p>Use <code>Continue Phase</code> when the current phase can advance, or <code>Approve Current Phase</code> when the phase is blocked by approval.</p>
</body>
</html>`;
}
function escapeHtml(value) {
    return value
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll("\"", "&quot;")
        .replaceAll("'", "&#39;");
}
//# sourceMappingURL=detailsPanel.js.map