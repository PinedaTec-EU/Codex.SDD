import * as vscode from "vscode";
import type { UserStorySummary } from "./backendClient";

const PHASES = [
  "capture",
  "refinement",
  "technical-design",
  "implementation",
  "review",
  "release-approval",
  "pr-preparation"
];

export async function showUserStoryDetails(summary: UserStorySummary): Promise<void> {
  const panel = vscode.window.createWebviewPanel(
    "specForge.userStoryDetails",
    `${summary.usId} details`,
    vscode.ViewColumn.Beside,
    {
      enableScripts: false
    }
  );

  panel.webview.html = buildHtml(summary);
  await Promise.resolve();
}

function buildHtml(summary: UserStorySummary): string {
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

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}
