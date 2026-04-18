"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildWorkflowHtml = buildWorkflowHtml;
exports.escapeHtml = escapeHtml;
function buildWorkflowHtml(workflow, state) {
    const selectedPhase = workflow.phases.find((phase) => phase.phaseId === state.selectedPhaseId) ?? workflow.phases[0];
    const artifactSection = selectedPhase.artifactPath
        ? `
      <div class="detail-actions">
        <button data-command="openArtifact" data-path="${escapeHtmlAttribute(selectedPhase.artifactPath)}">Open Artifact</button>
      </div>
      <pre class="artifact-preview">${escapeHtml(state.selectedArtifactContent ?? "Artifact content unavailable.")}</pre>
    `
        : "<p class=\"muted\">No artifact is persisted for this phase.</p>";
    const phaseItems = workflow.phases.map((phase) => `
    <button
      class="phase ${phase.state}${phase.phaseId === selectedPhase.phaseId ? " selected" : ""}"
      data-command="selectPhase"
      data-phase-id="${escapeHtmlAttribute(phase.phaseId)}">
      <span class="phase-order">${phase.order + 1}</span>
      <span class="phase-meta">
        <strong>${escapeHtml(phase.title)}</strong>
        <span>${escapeHtml(phase.phaseId)}</span>
      </span>
      <span class="phase-badges">
        ${phase.requiresApproval ? `<span class="badge">approval</span>` : ""}
        ${phase.isApproved ? `<span class="badge success">approved</span>` : ""}
      </span>
    </button>
  `).join("");
    const regressionButtons = workflow.controls.regressionTargets
        .map((target) => `<button data-command="regress" data-phase-id="${escapeHtmlAttribute(target)}">Regress to ${escapeHtml(target)}</button>`)
        .join("");
    const auditRows = workflow.events.length > 0
        ? workflow.events.map((event) => `
      <div class="audit-row">
        <div class="audit-head">${escapeHtml(event.timestampUtc)} · ${escapeHtml(event.code)}</div>
        <div class="audit-body">${escapeHtml(event.summary ?? "")}</div>
      </div>
    `).join("")
        : `<pre class="audit-log">${escapeHtml(workflow.rawTimeline)}</pre>`;
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>
    :root {
      color-scheme: light dark;
      font-family: ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    body {
      margin: 0;
      padding: 18px;
      background: radial-gradient(circle at top, rgba(70, 130, 180, 0.18), transparent 35%), var(--vscode-editor-background);
      color: var(--vscode-editor-foreground);
    }
    .layout {
      display: grid;
      grid-template-columns: minmax(280px, 360px) minmax(0, 1fr);
      gap: 18px;
    }
    .panel {
      border: 1px solid var(--vscode-panel-border);
      border-radius: 14px;
      padding: 16px;
      background: color-mix(in srgb, var(--vscode-editor-background) 92%, white 8%);
      box-shadow: 0 12px 32px rgba(0, 0, 0, 0.12);
    }
    .hero {
      margin-bottom: 18px;
      display: flex;
      justify-content: space-between;
      gap: 16px;
      flex-wrap: wrap;
    }
    .hero h1 {
      margin: 0 0 6px;
      font-size: 1.5rem;
    }
    .hero-meta, .control-strip, .detail-meta {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      align-items: center;
    }
    .token, .badge {
      border-radius: 999px;
      padding: 4px 10px;
      font-size: 0.85rem;
      background: color-mix(in srgb, var(--vscode-badge-background) 60%, transparent 40%);
      color: var(--vscode-badge-foreground);
    }
    .success {
      background: rgba(46, 160, 67, 0.22);
      color: #2ea043;
    }
    .phase-list {
      display: flex;
      flex-direction: column;
      gap: 10px;
      margin-top: 14px;
    }
    .phase {
      border: 1px solid var(--vscode-panel-border);
      border-radius: 12px;
      padding: 12px;
      background: transparent;
      color: inherit;
      display: grid;
      grid-template-columns: 34px minmax(0, 1fr) auto;
      gap: 12px;
      align-items: center;
      text-align: left;
      cursor: pointer;
    }
    .phase.current {
      border-color: var(--vscode-focusBorder);
      background: rgba(60, 140, 200, 0.12);
    }
    .phase.selected {
      outline: 2px solid var(--vscode-focusBorder);
    }
    .phase-order {
      width: 34px;
      height: 34px;
      border-radius: 50%;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      background: rgba(128, 128, 128, 0.18);
      font-weight: 700;
    }
    .phase-meta {
      display: flex;
      flex-direction: column;
      gap: 2px;
      min-width: 0;
    }
    .phase-meta span {
      opacity: 0.75;
      font-size: 0.88rem;
    }
    .phase-badges {
      display: flex;
      gap: 6px;
      flex-wrap: wrap;
      justify-content: flex-end;
    }
    h2, h3 {
      margin-top: 0;
    }
    .section {
      margin-top: 18px;
    }
    .control-strip button, .detail-actions button {
      border: 1px solid var(--vscode-button-border, transparent);
      border-radius: 10px;
      padding: 8px 12px;
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      cursor: pointer;
    }
    .detail-actions {
      margin: 14px 0;
    }
    .artifact-preview, .audit-log {
      margin: 0;
      padding: 14px;
      border-radius: 12px;
      background: rgba(0, 0, 0, 0.18);
      overflow: auto;
      white-space: pre-wrap;
      font-family: ui-monospace, "SF Mono", Menlo, monospace;
      max-height: 320px;
    }
    .audit-stream {
      display: flex;
      flex-direction: column;
      gap: 10px;
      max-height: 360px;
      overflow: auto;
    }
    .audit-row {
      border-left: 2px solid var(--vscode-panel-border);
      padding-left: 12px;
    }
    .audit-head {
      font-family: ui-monospace, "SF Mono", Menlo, monospace;
      font-size: 0.82rem;
      opacity: 0.75;
    }
    .audit-body {
      margin-top: 4px;
      line-height: 1.45;
    }
    .muted {
      opacity: 0.7;
    }
    @media (max-width: 960px) {
      .layout {
        grid-template-columns: 1fr;
      }
    }
  </style>
</head>
<body>
  <section class="panel hero">
    <div>
      <h1>${escapeHtml(workflow.usId)} · ${escapeHtml(workflow.title)}</h1>
      <div class="hero-meta">
        <span class="token">${escapeHtml(workflow.category)}</span>
        <span class="token">${escapeHtml(workflow.status)}</span>
        <span class="token">${escapeHtml(workflow.currentPhase)}</span>
        <span class="token">${escapeHtml(workflow.workBranch ?? "branch:not-created")}</span>
      </div>
    </div>
    <div class="control-strip">
      ${workflow.controls.canContinue ? `<button data-command="continue">Continue</button>` : ""}
      ${workflow.controls.canApprove ? `<button data-command="approve">Approve</button>` : ""}
      ${workflow.controls.canRestartFromSource ? `<button data-command="restart">Restart</button>` : ""}
      ${regressionButtons}
      <button data-command="openArtifact" data-path="${escapeHtmlAttribute(workflow.mainArtifactPath)}">Open US</button>
    </div>
  </section>
  <section class="layout">
    <aside class="panel">
      <h2>Workflow</h2>
      <p class="muted">Select a phase to inspect its detail.</p>
      <div class="phase-list">${phaseItems}</div>
    </aside>
    <main class="panel">
      <h2>${escapeHtml(selectedPhase.title)}</h2>
      <div class="detail-meta">
        <span class="token">${escapeHtml(selectedPhase.phaseId)}</span>
        <span class="token">${escapeHtml(selectedPhase.state)}</span>
        ${selectedPhase.requiresApproval ? `<span class="token">approval required</span>` : ""}
        ${selectedPhase.isApproved ? `<span class="token">approved</span>` : ""}
      </div>
      <div class="section">
        <h3>Artifact</h3>
        ${artifactSection}
      </div>
      <div class="section">
        <h3>Audit</h3>
        <div class="audit-stream">${auditRows}</div>
      </div>
    </main>
  </section>
  <script>
    const vscode = acquireVsCodeApi();
    for (const element of document.querySelectorAll("[data-command]")) {
      element.addEventListener("click", () => {
        vscode.postMessage({
          command: element.dataset.command,
          phaseId: element.dataset.phaseId,
          path: element.dataset.path
        });
      });
    }
  </script>
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
function escapeHtmlAttribute(value) {
    return escapeHtml(value);
}
//# sourceMappingURL=workflowView.js.map