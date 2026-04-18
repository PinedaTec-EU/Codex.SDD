"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildWorkflowHtml = buildWorkflowHtml;
exports.escapeHtml = escapeHtml;
const desktopGraphHeight = 1260;
const mobileGraphHeight = 1360;
const desktopPhasePositions = {
    "capture": { left: 18, top: 38 },
    "refinement": { left: 392, top: 142 },
    "technical-design": { left: 392, top: 332 },
    "implementation": { left: 18, top: 436 },
    "review": { left: 18, top: 626 },
    "release-approval": { left: 392, top: 730 },
    "pr-preparation": { left: 18, top: 834 }
};
const mobilePhasePositions = {
    "capture": { left: 0, top: 16 },
    "refinement": { left: 176, top: 138 },
    "technical-design": { left: 176, top: 338 },
    "implementation": { left: 0, top: 538 },
    "review": { left: 0, top: 738 },
    "release-approval": { left: 176, top: 938 },
    "pr-preparation": { left: 0, top: 1138 }
};
const phaseAnchorMap = buildPhaseAnchorMap(desktopPhasePositions);
function buildPhasePositionCss(positions) {
    return Object.entries(positions)
        .map(([phaseId, position]) => `.phase-node.${phaseId} { left: ${position.left}px; top: ${position.top}px; }`)
        .join("\n");
}
function buildPhaseAnchorMap(positions) {
    return Object.fromEntries(Object.entries(positions).map(([phaseId, position]) => [phaseId, { x: position.left + 220, y: position.top + 58 }]));
}
function buildWorkflowHtml(workflow, state, playbackState) {
    const selectedPhase = workflow.phases.find((phase) => phase.phaseId === state.selectedPhaseId) ?? workflow.phases[0];
    const settingsWarning = !state.settingsConfigured && state.settingsMessage
        ? `
      <section class="settings-warning panel">
        <div class="settings-warning__icon" aria-hidden="true">⚠</div>
        <div class="settings-warning__content">
          <p class="eyebrow warning">Configuration Required</p>
          <h2>SpecForge.AI settings are incomplete</h2>
          <p class="panel-copy warning-copy">${escapeHtml(state.settingsMessage)}</p>
        </div>
        <button data-command="openSettings">Configure Settings</button>
      </section>
    `
        : "";
    const phaseGraph = buildPhaseGraph(workflow.phases, selectedPhase.phaseId);
    const artifactSection = selectedPhase.artifactPath
        ? `
      <div class="detail-actions">
        <button data-command="openArtifact" data-path="${escapeHtmlAttribute(selectedPhase.artifactPath)}">Open Artifact</button>
      </div>
      <pre class="artifact-preview">${escapeHtml(state.selectedArtifactContent ?? "Artifact content unavailable.")}</pre>
    `
        : "<p class=\"muted\">No artifact is persisted for this phase.</p>";
    const promptButtons = [
        selectedPhase.executePromptPath
            ? `<button data-command="openPrompt" data-path="${escapeHtmlAttribute(selectedPhase.executePromptPath)}">Open Execute Prompt</button>`
            : "",
        selectedPhase.approvePromptPath
            ? `<button data-command="openPrompt" data-path="${escapeHtmlAttribute(selectedPhase.approvePromptPath)}">Open Approve Prompt</button>`
            : ""
    ].filter(Boolean).join("");
    const promptSection = promptButtons
        ? `<div class="detail-actions">${promptButtons}</div>`
        : "<p class=\"muted\">This phase does not expose prompt templates from the current repo bootstrap.</p>";
    const attachmentsSection = `
    <div class="detail-actions">
      <button data-command="attachFiles">Attach Files</button>
    </div>
    ${workflow.attachments.length > 0
        ? `<div class="attachment-list">
          ${workflow.attachments.map((attachment) => `
            <button class="attachment-item" data-command="openAttachment" data-path="${escapeHtmlAttribute(attachment.path)}">
              <strong>${escapeHtml(attachment.name)}</strong>
              <span>${escapeHtml(attachment.path)}</span>
            </button>
          `).join("")}
        </div>`
        : "<p class=\"muted\">No files are attached to this user story yet.</p>"}
  `;
    const regressionButtons = workflow.controls.regressionTargets
        .map((target) => `<button data-command="regress" data-phase-id="${escapeHtmlAttribute(target)}">Regress to ${escapeHtml(target)}</button>`)
        .join("");
    const playbackButtons = `
    <button class="icon-button icon-button--primary" data-command="play" aria-label="Play workflow"${playbackState === "playing" || !state.settingsConfigured ? " disabled" : ""}>
      ${playIcon()}
    </button>
    <button class="icon-button" data-command="pause" aria-label="Pause workflow"${playbackState !== "playing" ? " disabled" : ""}>
      ${pauseIcon()}
    </button>
    <button class="icon-button icon-button--danger" data-command="stop" aria-label="Stop workflow"${playbackState === "idle" ? " disabled" : ""}>
      ${stopIcon()}
    </button>
  `;
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
      font-family: "Avenir Next", "Segoe UI", ui-sans-serif, sans-serif;
      --accent: #72f1b8;
      --accent-strong: #1fd89b;
      --accent-soft: rgba(114, 241, 184, 0.16);
      --phase-current: rgba(66, 178, 255, 0.18);
      --phase-completed: rgba(114, 241, 184, 0.18);
      --phase-pending: rgba(255, 255, 255, 0.04);
      --danger: #ff8b8b;
      --shadow: 0 18px 40px rgba(0, 0, 0, 0.28);
    }
    * {
      box-sizing: border-box;
    }
    body {
      margin: 0;
      padding: 18px;
      color: var(--vscode-editor-foreground);
      background:
        radial-gradient(circle at 8% 10%, rgba(114, 241, 184, 0.16), transparent 20%),
        radial-gradient(circle at 88% 18%, rgba(72, 131, 255, 0.18), transparent 24%),
        radial-gradient(circle at 50% 100%, rgba(255, 170, 84, 0.12), transparent 26%),
        linear-gradient(180deg, rgba(10, 20, 24, 0.96), rgba(10, 14, 20, 1));
      min-height: 100vh;
    }
    .shell {
      display: grid;
      gap: 18px;
    }
    .panel {
      border: 1px solid rgba(114, 241, 184, 0.16);
      border-radius: 24px;
      background:
        linear-gradient(180deg, rgba(255, 255, 255, 0.02), rgba(255, 255, 255, 0.01)),
        rgba(12, 18, 24, 0.92);
      box-shadow: var(--shadow);
      backdrop-filter: blur(14px);
    }
    .hero {
      padding: 22px 24px;
      position: relative;
      overflow: hidden;
    }
    .hero::after {
      content: "";
      position: absolute;
      inset: auto -8% -48% 42%;
      height: 220px;
      background: radial-gradient(circle, rgba(114, 241, 184, 0.22), transparent 62%);
      pointer-events: none;
    }
    .hero-head {
      display: flex;
      justify-content: space-between;
      gap: 18px;
      flex-wrap: wrap;
      position: relative;
      z-index: 1;
    }
    .eyebrow {
      margin: 0 0 10px;
      text-transform: uppercase;
      letter-spacing: 0.18em;
      font-size: 0.72rem;
      color: var(--accent);
    }
    h1 {
      margin: 0;
      font-size: clamp(1.7rem, 3vw, 2.55rem);
      line-height: 1.05;
      max-width: 820px;
    }
    .hero-meta, .control-strip, .detail-meta {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
      align-items: center;
    }
    .hero-meta {
      margin-top: 14px;
    }
    .token, .badge {
      border-radius: 999px;
      padding: 6px 12px;
      font-size: 0.82rem;
      background: rgba(255, 255, 255, 0.06);
      color: rgba(255, 255, 255, 0.9);
      border: 1px solid rgba(255, 255, 255, 0.06);
      backdrop-filter: blur(8px);
    }
    .success {
      background: rgba(46, 160, 67, 0.16);
      color: #7ff0a5;
      border-color: rgba(127, 240, 165, 0.24);
    }
    .settings-warning {
      display: grid;
      grid-template-columns: auto 1fr;
      gap: 16px;
      padding: 18px 20px;
      border-color: rgba(255, 208, 84, 0.34);
      background:
        linear-gradient(180deg, rgba(66, 48, 10, 0.96), rgba(28, 22, 8, 0.98)),
        rgba(12, 18, 24, 0.92);
    }
    .settings-warning__icon {
      width: 46px;
      height: 46px;
      border-radius: 14px;
      background: rgba(255, 211, 92, 0.18);
      color: #ffd75a;
      display: grid;
      place-items: center;
      font-size: 1.35rem;
      font-weight: 900;
      box-shadow: 0 0 0 8px rgba(255, 211, 92, 0.06);
    }
    .warning-copy {
      margin-bottom: 0;
      opacity: 0.92;
    }
    .eyebrow.warning {
      color: #ffd75a;
    }
    .token.accent {
      background: rgba(114, 241, 184, 0.12);
      color: var(--accent);
      border-color: rgba(114, 241, 184, 0.24);
    }
    .control-strip {
      align-content: flex-start;
      justify-content: flex-end;
      max-width: 540px;
    }
    .icon-button {
      width: 58px;
      height: 58px;
      padding: 0;
      border-radius: 999px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }
    .icon-button--primary {
      width: 74px;
      height: 74px;
      box-shadow: 0 10px 28px rgba(31, 216, 155, 0.28);
    }
    .icon-button--danger {
      background: linear-gradient(180deg, rgba(255, 139, 139, 0.2), rgba(40, 18, 18, 0.92));
      border-color: rgba(255, 139, 139, 0.26);
    }
    .icon-button svg {
      width: 24px;
      height: 24px;
      fill: currentColor;
    }
    .icon-button--primary svg {
      width: 30px;
      height: 30px;
      margin-left: 2px;
    }
    .control-strip button, .detail-actions button, .attachment-item, .settings-warning button {
      border: 1px solid rgba(114, 241, 184, 0.18);
      border-radius: 14px;
      padding: 10px 14px;
      background: linear-gradient(180deg, rgba(114, 241, 184, 0.16), rgba(18, 33, 28, 0.92));
      color: #f2fff9;
      cursor: pointer;
      box-shadow: 0 6px 18px rgba(0, 0, 0, 0.16);
      transition: transform 140ms ease, border-color 140ms ease, background 140ms ease;
    }
    .control-strip button:hover, .detail-actions button:hover, .attachment-item:hover, .settings-warning button:hover {
      transform: translateY(-1px);
      border-color: rgba(114, 241, 184, 0.38);
      background: linear-gradient(180deg, rgba(114, 241, 184, 0.24), rgba(18, 33, 28, 0.94));
    }
    .control-strip button:disabled, .detail-actions button:disabled {
      opacity: 0.46;
      cursor: not-allowed;
      transform: none;
    }
    .layout {
      display: grid;
      grid-template-columns: minmax(420px, 1.15fr) minmax(420px, 1fr);
      gap: 18px;
    }
    .graph-panel {
      padding: 22px;
      min-height: 720px;
      position: relative;
      overflow: auto;
      background:
        linear-gradient(rgba(255, 255, 255, 0.025) 1px, transparent 1px),
        linear-gradient(90deg, rgba(255, 255, 255, 0.025) 1px, transparent 1px),
        linear-gradient(180deg, rgba(11, 20, 24, 0.98), rgba(12, 17, 24, 0.94));
      background-size: 22px 22px, 22px 22px, auto;
    }
    .graph-panel::after {
      content: "";
      position: absolute;
      inset: 0;
      background:
        radial-gradient(circle at 22% 14%, rgba(114, 241, 184, 0.14), transparent 16%),
        radial-gradient(circle at 86% 46%, rgba(72, 131, 255, 0.14), transparent 18%);
      pointer-events: none;
    }
    .panel-title {
      position: relative;
      z-index: 2;
      margin: 0 0 6px;
      font-size: 1.1rem;
    }
    .panel-copy {
      position: relative;
      z-index: 2;
      margin: 0 0 18px;
      opacity: 0.7;
    }
    .graph-stage {
      position: relative;
      min-height: ${desktopGraphHeight}px;
      z-index: 2;
    }
    .graph-links {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      overflow: visible;
      pointer-events: none;
    }
    .graph-links path {
      fill: none;
      stroke-width: 4;
      stroke-linecap: round;
      filter: drop-shadow(0 0 12px rgba(114, 241, 184, 0.24));
      transition: stroke 180ms ease, opacity 180ms ease;
    }
    .graph-links path.completed {
      stroke: rgba(114, 241, 184, 0.72);
    }
    .graph-links path.current {
      stroke: rgba(92, 181, 255, 0.92);
      stroke-dasharray: 16 12;
      animation: currentFlow 1.8s linear infinite;
    }
    .graph-links path.pending {
      stroke: rgba(255, 255, 255, 0.1);
    }
    .phase-graph {
      position: relative;
      min-height: ${desktopGraphHeight}px;
    }
    .phase-node {
      position: absolute;
      width: 220px;
      min-height: 116px;
      border-radius: 26px;
      border: 1px solid rgba(255, 255, 255, 0.08);
      padding: 16px 18px;
      color: inherit;
      background: linear-gradient(180deg, rgba(22, 28, 38, 0.94), rgba(10, 14, 20, 0.98));
      text-align: left;
      cursor: pointer;
      box-shadow: 0 18px 28px rgba(0, 0, 0, 0.24);
      transition: transform 140ms ease, border-color 140ms ease, box-shadow 140ms ease, background 140ms ease;
      overflow: hidden;
      animation: nodeRise 420ms ease both;
    }
    .phase-node::before {
      content: "";
      position: absolute;
      inset: 0;
      background: radial-gradient(circle at top left, rgba(255, 255, 255, 0.08), transparent 46%);
      pointer-events: none;
    }
    .phase-node:hover {
      transform: translateY(-2px) scale(1.01);
      border-color: rgba(114, 241, 184, 0.28);
    }
    .phase-node.selected {
      outline: 2px solid rgba(114, 241, 184, 0.52);
      outline-offset: 2px;
    }
    .phase-node.current {
      background: linear-gradient(180deg, rgba(24, 49, 82, 0.96), rgba(10, 20, 32, 0.98));
      border-color: rgba(92, 181, 255, 0.45);
      box-shadow: 0 20px 34px rgba(48, 120, 255, 0.16);
      animation: nodeRise 420ms ease both, currentPulse 2.8s ease-in-out infinite;
    }
    .phase-node.completed {
      background: linear-gradient(180deg, rgba(18, 44, 34, 0.96), rgba(10, 20, 17, 0.98));
      border-color: rgba(114, 241, 184, 0.24);
    }
    .phase-node.pending {
      background: linear-gradient(180deg, rgba(22, 28, 38, 0.88), rgba(10, 14, 20, 0.96));
      opacity: 0.9;
    }
    ${buildPhasePositionCss(desktopPhasePositions)}
    .phase-node-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 12px;
      position: relative;
      z-index: 1;
    }
    .phase-index {
      width: 34px;
      height: 34px;
      border-radius: 12px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      background: rgba(255, 255, 255, 0.08);
      font-size: 0.9rem;
      font-weight: 700;
    }
    .phase-status-dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background: rgba(255, 255, 255, 0.18);
      box-shadow: 0 0 0 6px rgba(255, 255, 255, 0.04);
      margin-top: 4px;
    }
    .phase-node.current .phase-status-dot {
      background: #59bbff;
      box-shadow: 0 0 0 8px rgba(89, 187, 255, 0.12);
    }
    .phase-node.completed .phase-status-dot {
      background: var(--accent);
      box-shadow: 0 0 0 8px rgba(114, 241, 184, 0.1);
    }
    .phase-node h3 {
      margin: 14px 0 4px;
      font-size: 1rem;
      position: relative;
      z-index: 1;
    }
    .phase-slug {
      font-family: ui-monospace, "SF Mono", Menlo, monospace;
      font-size: 0.76rem;
      opacity: 0.66;
      position: relative;
      z-index: 1;
    }
    .phase-tags {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      margin-top: 14px;
      position: relative;
      z-index: 1;
    }
    .phase-tag {
      border-radius: 999px;
      padding: 4px 8px;
      font-size: 0.72rem;
      background: rgba(255, 255, 255, 0.07);
      color: rgba(255, 255, 255, 0.84);
    }
    .phase-tag.approval {
      background: rgba(255, 170, 84, 0.15);
      color: #ffc178;
    }
    .phase-tag.active {
      background: rgba(92, 181, 255, 0.14);
      color: #90d2ff;
    }
    .phase-node.selected .phase-index {
      box-shadow: 0 0 0 8px rgba(114, 241, 184, 0.08);
    }
    .detail-panel {
      padding: 22px;
      display: grid;
      gap: 18px;
      align-content: start;
    }
    .detail-card {
      border: 1px solid rgba(255, 255, 255, 0.06);
      border-radius: 20px;
      padding: 18px;
      background: rgba(255, 255, 255, 0.025);
    }
    .detail-card h2, .detail-card h3 {
      margin-top: 0;
    }
    .detail-actions {
      margin: 14px 0;
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
    }
    .attachment-list {
      display: grid;
      gap: 10px;
    }
    .attachment-item {
      padding: 12px 14px;
      background: rgba(255, 255, 255, 0.035);
      color: inherit;
      text-align: left;
      display: grid;
      gap: 4px;
    }
    .attachment-item span {
      opacity: 0.62;
      font-size: 0.8rem;
      font-family: ui-monospace, "SF Mono", Menlo, monospace;
    }
    .artifact-preview, .audit-log {
      margin: 0;
      padding: 14px;
      border-radius: 16px;
      background: rgba(4, 10, 16, 0.7);
      border: 1px solid rgba(255, 255, 255, 0.06);
      overflow: auto;
      white-space: pre-wrap;
      font-family: ui-monospace, "SF Mono", Menlo, monospace;
      max-height: 320px;
    }
    .audit-stream {
      display: flex;
      flex-direction: column;
      gap: 12px;
      max-height: 360px;
      overflow: auto;
      padding-right: 4px;
    }
    .audit-row {
      border-left: 2px solid rgba(114, 241, 184, 0.18);
      padding-left: 12px;
    }
    .audit-head {
      font-family: ui-monospace, "SF Mono", Menlo, monospace;
      font-size: 0.8rem;
      color: rgba(255, 255, 255, 0.62);
    }
    .audit-body {
      margin-top: 4px;
      line-height: 1.45;
    }
    .muted {
      opacity: 0.7;
    }
    @keyframes currentFlow {
      from { stroke-dashoffset: 0; }
      to { stroke-dashoffset: -56; }
    }
    @keyframes currentPulse {
      0%, 100% {
        box-shadow: 0 20px 34px rgba(48, 120, 255, 0.16), 0 0 0 0 rgba(92, 181, 255, 0.12);
      }
      50% {
        box-shadow: 0 24px 42px rgba(48, 120, 255, 0.22), 0 0 0 12px rgba(92, 181, 255, 0.04);
      }
    }
    @keyframes nodeRise {
      from {
        opacity: 0;
        transform: translateY(10px) scale(0.985);
      }
      to {
        opacity: 1;
        transform: translateY(0) scale(1);
      }
    }
    @media (max-width: 1160px) {
      .layout {
        grid-template-columns: 1fr;
      }
      .graph-panel {
        min-height: auto;
      }
      .graph-stage, .phase-graph {
        min-height: ${desktopGraphHeight}px;
      }
    }
    @media (max-width: 760px) {
      body {
        padding: 12px;
      }
      .hero, .graph-panel, .detail-panel {
        padding: 16px;
      }
      .phase-node {
        width: 188px;
      }
      .graph-stage, .phase-graph {
        min-height: ${mobileGraphHeight}px;
      }
      ${buildPhasePositionCss(mobilePhasePositions)}
    }
  </style>
</head>
<body>
  <div class="shell">
    ${settingsWarning}
    <section class="panel hero">
      <div class="hero-head">
        <div>
          <p class="eyebrow">SpecForge.AI Workflow Graph</p>
          <h1>${escapeHtml(workflow.usId)} · ${escapeHtml(workflow.title)}</h1>
          <div class="hero-meta">
            <span class="token accent">${escapeHtml(workflow.category)}</span>
            <span class="token">${escapeHtml(workflow.status)}</span>
            <span class="token">${escapeHtml(workflow.currentPhase)}</span>
            <span class="token">${escapeHtml(workflow.workBranch ?? "branch:not-created")}</span>
            <span class="token">runner:${escapeHtml(playbackState)}</span>
          </div>
        </div>
        <div class="control-strip">
          ${playbackButtons}
          ${workflow.controls.canApprove ? `<button data-command="approve">Approve</button>` : ""}
          ${workflow.controls.canRestartFromSource ? `<button data-command="restart">Restart</button>` : ""}
          ${regressionButtons}
          <button class="icon-button" data-command="openArtifact" data-path="${escapeHtmlAttribute(workflow.mainArtifactPath)}" aria-label="Open user story">
            ${fileIcon()}
          </button>
        </div>
      </div>
    </section>
    <section class="layout">
      <aside class="panel graph-panel">
        <h2 class="panel-title">Workflow Constellation</h2>
        <p class="panel-copy">The graph is the primary surface. Click any phase node to move the detail focus and inspect its artifact and audit context.</p>
        <div class="graph-stage">
          ${phaseGraph}
        </div>
      </aside>
      <main class="panel detail-panel">
        <section class="detail-card">
          <h2>${escapeHtml(selectedPhase.title)}</h2>
          <div class="detail-meta">
            <span class="token">${escapeHtml(selectedPhase.phaseId)}</span>
            <span class="token">${escapeHtml(selectedPhase.state)}</span>
            ${selectedPhase.requiresApproval ? `<span class="token">approval required</span>` : ""}
            ${selectedPhase.isApproved ? `<span class="token success">approved</span>` : ""}
          </div>
        </section>
        <section class="detail-card">
          <h3>Artifact</h3>
          ${artifactSection}
        </section>
        <section class="detail-card">
          <h3>Phase Prompts</h3>
          ${promptSection}
        </section>
        <section class="detail-card">
          <h3>User Story Attachments</h3>
          ${attachmentsSection}
        </section>
        <section class="detail-card">
          <h3>Audit Stream</h3>
          <div class="audit-stream">${auditRows}</div>
        </section>
      </main>
    </section>
  </div>
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
function buildPhaseGraph(phases, selectedPhaseId) {
    const links = phases
        .slice(0, -1)
        .map((phase, index) => {
        const nextPhase = phases[index + 1];
        return `<path class="${linkClass(nextPhase)}" d="${graphPath(phase.phaseId, nextPhase.phaseId)}"></path>`;
    })
        .join("");
    const nodes = phases.map((phase) => `
    <button
      class="phase-node ${escapeHtmlAttribute(phase.phaseId)} ${phase.state}${phase.phaseId === selectedPhaseId ? " selected" : ""}"
      data-command="selectPhase"
      data-phase-id="${escapeHtmlAttribute(phase.phaseId)}">
      <div class="phase-node-header">
        <span class="phase-index">${phase.order + 1}</span>
        <span class="phase-status-dot"></span>
      </div>
      <h3>${escapeHtml(phase.title)}</h3>
      <div class="phase-slug">${escapeHtml(phase.phaseId)}</div>
      <div class="phase-tags">
        <span class="phase-tag ${phase.isCurrent ? "active" : ""}">${escapeHtml(phase.state)}</span>
        ${phase.requiresApproval ? `<span class="phase-tag approval">approval</span>` : ""}
        ${phase.isApproved ? `<span class="phase-tag">approved</span>` : ""}
      </div>
    </button>
  `).join("");
    return `
    <div class="phase-graph" aria-label="Workflow graph">
      <svg class="graph-links" viewBox="0 0 700 ${desktopGraphHeight}" preserveAspectRatio="none" aria-hidden="true">
        ${links}
      </svg>
      ${nodes}
    </div>
  `;
}
function linkClass(targetPhase) {
    if (targetPhase.isCurrent) {
        return "current";
    }
    return targetPhase.state === "completed" ? "completed" : "pending";
}
function graphPath(fromPhaseId, toPhaseId) {
    const from = phaseAnchorMap[fromPhaseId];
    const to = phaseAnchorMap[toPhaseId];
    if (!from || !to) {
        return "";
    }
    const controlOffset = Math.max(48, Math.abs(to.x - from.x) * 0.36);
    return `M ${from.x} ${from.y} C ${from.x + controlOffset} ${from.y}, ${to.x - controlOffset} ${to.y}, ${to.x} ${to.y}`;
}
function playIcon() {
    return `
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M8 5.14v13.72c0 .72.78 1.17 1.4.8l10.2-6.86a.94.94 0 0 0 0-1.6L9.4 4.34A.94.94 0 0 0 8 5.14Z"></path>
    </svg>
  `;
}
function pauseIcon() {
    return `
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M7 5.5A1.5 1.5 0 0 1 8.5 4h1A1.5 1.5 0 0 1 11 5.5v13A1.5 1.5 0 0 1 9.5 20h-1A1.5 1.5 0 0 1 7 18.5v-13Zm6 0A1.5 1.5 0 0 1 14.5 4h1A1.5 1.5 0 0 1 17 5.5v13a1.5 1.5 0 0 1-1.5 1.5h-1A1.5 1.5 0 0 1 13 18.5v-13Z"></path>
    </svg>
  `;
}
function stopIcon() {
    return `
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M7 7.5A1.5 1.5 0 0 1 8.5 6h7A1.5 1.5 0 0 1 17 7.5v7a1.5 1.5 0 0 1-1.5 1.5h-7A1.5 1.5 0 0 1 7 14.5v-7Z"></path>
    </svg>
  `;
}
function fileIcon() {
    return `
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M7.5 3A2.5 2.5 0 0 0 5 5.5v13A2.5 2.5 0 0 0 7.5 21h9a2.5 2.5 0 0 0 2.5-2.5V9.2a2.5 2.5 0 0 0-.73-1.77l-3.7-3.7A2.5 2.5 0 0 0 12.8 3H7.5Zm5.3 1.75c.2 0 .39.08.53.22l3.7 3.7c.14.14.22.33.22.53v9.3c0 .41-.34.75-.75.75h-9a.75.75 0 0 1-.75-.75v-13c0-.41.34-.75.75-.75h5.3Zm-3.55 6.5h5.5a.75.75 0 0 1 0 1.5h-5.5a.75.75 0 0 1 0-1.5Zm0 3.5h5.5a.75.75 0 0 1 0 1.5h-5.5a.75.75 0 0 1 0-1.5Z"></path>
    </svg>
  `;
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