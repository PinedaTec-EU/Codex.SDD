import type { UserStoryWorkflowDetails, WorkflowPhaseDetails } from "./backendClient";

export interface WorkflowViewState {
  readonly selectedPhaseId: string;
  readonly selectedArtifactContent: string | null;
  readonly settingsConfigured: boolean;
  readonly settingsMessage: string | null;
}

type PhasePosition = { left: number; top: number };
type AnchorSide = "left" | "right" | "top" | "bottom";

const phaseNodeWidth = 220;
const phaseNodeHeight = 116;
const phaseActionOffsetX = 16;
const phaseActionTopOffset = 18;

const desktopGraphHeight = 1260;
const mobileGraphHeight = 1360;

const desktopPhasePositions: Record<string, PhasePosition> = {
  "capture": { left: 18, top: 38 },
  "refinement": { left: 392, top: 142 },
  "technical-design": { left: 392, top: 332 },
  "implementation": { left: 18, top: 522 },
  "review": { left: 18, top: 712 },
  "release-approval": { left: 392, top: 902 },
  "pr-preparation": { left: 18, top: 1092 }
};

const mobilePhasePositions: Record<string, PhasePosition> = {
  "capture": { left: 0, top: 16 },
  "refinement": { left: 176, top: 138 },
  "technical-design": { left: 176, top: 338 },
  "implementation": { left: 0, top: 538 },
  "review": { left: 0, top: 738 },
  "release-approval": { left: 176, top: 938 },
  "pr-preparation": { left: 0, top: 1138 }
};

function buildPhasePositionCss(positions: Record<string, PhasePosition>): string {
  return Object.entries(positions)
    .map(([phaseId, position]) => `.phase-node.${phaseId} { left: ${position.left}px; top: ${position.top}px; }`)
    .join("\n");
}

function buildPhaseActionPositionCss(positions: Record<string, PhasePosition>, nodeWidth = phaseNodeWidth): string {
  return Object.entries(positions)
    .map(([phaseId, position]) =>
      `.phase-node-actions.${phaseId} { left: ${position.left + nodeWidth + phaseActionOffsetX}px; top: ${position.top + phaseActionTopOffset}px; }`)
    .join("\n");
}

export function buildWorkflowHtml(
  workflow: UserStoryWorkflowDetails,
  state: WorkflowViewState,
  playbackState: "idle" | "playing" | "paused" | "stopping"
): string {
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
  const phaseGraph = buildPhaseGraph(workflow, selectedPhase.phaseId);
  const isMarkdownArtifact = Boolean(selectedPhase.artifactPath?.toLowerCase().endsWith(".md"));
  const artifactPreviewHtml = isMarkdownArtifact
    ? renderMarkdownToHtml(state.selectedArtifactContent ?? "Artifact content unavailable.")
    : null;
  const artifactSection = selectedPhase.artifactPath
    ? `
      <div class="detail-actions detail-actions--artifact">
        <div class="artifact-view-label">
          <span class="badge">Preview</span>
        </div>
        <button data-command="openArtifact" data-path="${escapeHtmlAttribute(selectedPhase.artifactPath)}">Open Artifact</button>
      </div>
      ${artifactPreviewHtml ? `<div class="markdown-preview">${artifactPreviewHtml}</div>` : `<pre class="artifact-preview">${escapeHtml(state.selectedArtifactContent ?? "Artifact content unavailable.")}</pre>`}
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
      width: ${phaseNodeWidth}px;
      min-height: ${phaseNodeHeight}px;
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
    .phase-node-actions {
      position: absolute;
      display: flex;
      gap: 8px;
      z-index: 10;
    }
    ${buildPhaseActionPositionCss(desktopPhasePositions)}
    .action-btn {
      width: 32px;
      height: 32px;
      border-radius: 8px;
      border: 1px solid rgba(255, 255, 255, 0.18);
      padding: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: bold;
      font-size: 0.9rem;
      cursor: pointer;
      background: rgba(255, 255, 255, 0.08);
      color: rgba(255, 255, 255, 0.7);
      transition: all 140ms ease;
    }
    .action-btn:hover {
      transform: scale(1.08);
      border-color: rgba(255, 255, 255, 0.28);
      background: rgba(255, 255, 255, 0.12);
    }
    .action-btn--approve {
      background: rgba(127, 240, 165, 0.14);
      color: #7ff0a5;
      border-color: rgba(127, 240, 165, 0.24);
    }
    .action-btn--approve:hover {
      background: rgba(127, 240, 165, 0.22);
      border-color: rgba(127, 240, 165, 0.42);
      box-shadow: 0 0 12px rgba(127, 240, 165, 0.18);
    }
    .action-btn--reject {
      background: rgba(255, 139, 139, 0.14);
      color: #ff8b8b;
      border-color: rgba(255, 139, 139, 0.24);
    }
    .action-btn--reject:hover {
      background: rgba(255, 139, 139, 0.22);
      border-color: rgba(255, 139, 139, 0.42);
      box-shadow: 0 0 12px rgba(255, 139, 139, 0.18);
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
      align-items: center;
    }
    .detail-actions--artifact {
      justify-content: space-between;
    }
    .artifact-view-label {
      display: inline-flex;
      align-items: center;
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
    .markdown-preview {
      padding: 18px;
      border-radius: 16px;
      background: rgba(4, 10, 16, 0.7);
      border: 1px solid rgba(255, 255, 255, 0.06);
      overflow: auto;
      max-height: 520px;
      line-height: 1.6;
    }
    .markdown-preview > :first-child {
      margin-top: 0;
    }
    .markdown-preview > :last-child {
      margin-bottom: 0;
    }
    .markdown-preview h1,
    .markdown-preview h2,
    .markdown-preview h3,
    .markdown-preview h4,
    .markdown-preview h5,
    .markdown-preview h6 {
      margin: 1.25em 0 0.5em;
      line-height: 1.2;
    }
    .markdown-preview p,
    .markdown-preview ul,
    .markdown-preview ol,
    .markdown-preview blockquote,
    .markdown-preview table,
    .markdown-preview pre,
    .markdown-preview hr {
      margin: 0 0 1em;
    }
    .markdown-preview ul,
    .markdown-preview ol {
      padding-left: 1.4rem;
    }
    .markdown-preview li + li {
      margin-top: 0.28rem;
    }
    .markdown-preview code {
      font-family: ui-monospace, "SF Mono", Menlo, monospace;
      background: rgba(255, 255, 255, 0.08);
      padding: 0.14rem 0.36rem;
      border-radius: 6px;
      font-size: 0.92em;
    }
    .markdown-preview pre {
      background: rgba(255, 255, 255, 0.04);
      border: 1px solid rgba(255, 255, 255, 0.06);
      border-radius: 14px;
      padding: 14px;
      overflow: auto;
    }
    .markdown-preview pre code {
      background: transparent;
      padding: 0;
      border-radius: 0;
    }
    .markdown-preview blockquote {
      border-left: 3px solid rgba(114, 241, 184, 0.34);
      padding-left: 14px;
      color: rgba(255, 255, 255, 0.76);
    }
    .markdown-preview hr {
      border: 0;
      border-top: 1px solid rgba(255, 255, 255, 0.08);
    }
    .markdown-preview a {
      color: #8fd9ff;
    }
    .markdown-preview table {
      width: 100%;
      border-collapse: collapse;
      overflow: hidden;
      border-radius: 14px;
      border: 1px solid rgba(255, 255, 255, 0.08);
    }
    .markdown-preview thead {
      background: rgba(92, 181, 255, 0.1);
    }
    .markdown-preview th,
    .markdown-preview td {
      padding: 10px 12px;
      text-align: left;
      vertical-align: top;
      border-bottom: 1px solid rgba(255, 255, 255, 0.06);
    }
    .markdown-preview tbody tr:nth-child(even) {
      background: rgba(255, 255, 255, 0.02);
    }
    .markdown-preview tbody tr:last-child td {
      border-bottom: 0;
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
      .phase-node-actions {
        transform: scale(0.94);
        transform-origin: top left;
      }
      .graph-stage, .phase-graph {
        min-height: ${mobileGraphHeight}px;
      }
      ${buildPhasePositionCss(mobilePhasePositions)}
      ${buildPhaseActionPositionCss(mobilePhasePositions, 188)}
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

function buildPhaseGraph(workflow: UserStoryWorkflowDetails, selectedPhaseId: string): string {
  const currentPhase = workflow.phases.find((phase) => phase.isCurrent) ?? workflow.phases[0];
  const rejectCommand = currentPhase && workflow.controls.regressionTargets.length > 0
    ? { command: "regress", phaseId: workflow.controls.regressionTargets[0], label: `Regress to ${workflow.controls.regressionTargets[0]}` }
    : workflow.controls.canRestartFromSource
      ? { command: "restart", phaseId: undefined, label: "Restart from source" }
      : null;

  const links = workflow.phases
    .slice(0, -1)
    .map((phase, index) => {
      const nextPhase = workflow.phases[index + 1];
      return `<path class="${linkClass(nextPhase)}" d="${graphPath(phase.phaseId, nextPhase.phaseId)}"></path>`;
    })
    .join("");

  const nodes = workflow.phases.map((phase) => `
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

  const nodeActions = currentPhase
    ? `
      <div class="phase-node-actions ${escapeHtmlAttribute(currentPhase.phaseId)}">
        ${workflow.controls.canApprove ? `<button class="action-btn action-btn--approve" data-command="approve" aria-label="Approve phase" title="Approve phase">✓</button>` : ""}
        ${rejectCommand ? `<button class="action-btn action-btn--reject" data-command="${rejectCommand.command}"${rejectCommand.phaseId ? ` data-phase-id="${escapeHtmlAttribute(rejectCommand.phaseId)}"` : ""} aria-label="${escapeHtmlAttribute(rejectCommand.label)}" title="${escapeHtmlAttribute(rejectCommand.label)}">✕</button>` : ""}
      </div>
    `
    : "";

  return `
    <div class="phase-graph" aria-label="Workflow graph">
      <svg class="graph-links" viewBox="0 0 700 ${desktopGraphHeight}" preserveAspectRatio="none" aria-hidden="true">
        ${links}
      </svg>
      ${nodes}
      ${nodeActions}
    </div>
  `;
}

function linkClass(targetPhase: WorkflowPhaseDetails): string {
  if (targetPhase.isCurrent) {
    return "current";
  }

  return targetPhase.state === "completed" ? "completed" : "pending";
}

function graphPath(fromPhaseId: string, toPhaseId: string): string {
  const fromPosition = desktopPhasePositions[fromPhaseId];
  const toPosition = desktopPhasePositions[toPhaseId];
  if (!fromPosition || !toPosition) {
    return "";
  }

  const { fromSide, toSide } = resolveAnchorSides(fromPosition, toPosition);
  const from = getAnchorPoint(fromPosition, fromSide);
  const to = getAnchorPoint(toPosition, toSide);
  const horizontalDirection = to.x >= from.x ? 1 : -1;
  const verticalDirection = to.y >= from.y ? 1 : -1;
  const horizontalOffset = Math.max(54, Math.abs(to.x - from.x) * 0.32);
  const verticalOffset = Math.max(44, Math.abs(to.y - from.y) * 0.24);

  if ((fromSide === "right" || fromSide === "left") && (toSide === "right" || toSide === "left")) {
    return `M ${from.x} ${from.y} C ${from.x + horizontalOffset * horizontalDirection} ${from.y}, ${to.x - horizontalOffset * horizontalDirection} ${to.y}, ${to.x} ${to.y}`;
  }

  return `M ${from.x} ${from.y} C ${from.x} ${from.y + verticalOffset * verticalDirection}, ${to.x} ${to.y - verticalOffset * verticalDirection}, ${to.x} ${to.y}`;
}

function resolveAnchorSides(from: PhasePosition, to: PhasePosition): { fromSide: AnchorSide; toSide: AnchorSide } {
  const deltaX = to.left - from.left;
  const deltaY = to.top - from.top;

  if (Math.abs(deltaX) >= Math.abs(deltaY) * 0.6) {
    return deltaX >= 0
      ? { fromSide: "right", toSide: "left" }
      : { fromSide: "left", toSide: "right" };
  }

  return deltaY >= 0
    ? { fromSide: "bottom", toSide: "top" }
    : { fromSide: "top", toSide: "bottom" };
}

function getAnchorPoint(position: PhasePosition, side: AnchorSide): { x: number; y: number } {
  switch (side) {
    case "left":
      return { x: position.left, y: position.top + phaseNodeHeight / 2 };
    case "right":
      return { x: position.left + phaseNodeWidth, y: position.top + phaseNodeHeight / 2 };
    case "top":
      return { x: position.left + phaseNodeWidth / 2, y: position.top };
    case "bottom":
      return { x: position.left + phaseNodeWidth / 2, y: position.top + phaseNodeHeight };
  }
}

function playIcon(): string {
  return `
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M8 5.14v13.72c0 .72.78 1.17 1.4.8l10.2-6.86a.94.94 0 0 0 0-1.6L9.4 4.34A.94.94 0 0 0 8 5.14Z"></path>
    </svg>
  `;
}

function pauseIcon(): string {
  return `
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M7 5.5A1.5 1.5 0 0 1 8.5 4h1A1.5 1.5 0 0 1 11 5.5v13A1.5 1.5 0 0 1 9.5 20h-1A1.5 1.5 0 0 1 7 18.5v-13Zm6 0A1.5 1.5 0 0 1 14.5 4h1A1.5 1.5 0 0 1 17 5.5v13a1.5 1.5 0 0 1-1.5 1.5h-1A1.5 1.5 0 0 1 13 18.5v-13Z"></path>
    </svg>
  `;
}

function stopIcon(): string {
  return `
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M7 7.5A1.5 1.5 0 0 1 8.5 6h7A1.5 1.5 0 0 1 17 7.5v7a1.5 1.5 0 0 1-1.5 1.5h-7A1.5 1.5 0 0 1 7 14.5v-7Z"></path>
    </svg>
  `;
}

function fileIcon(): string {
  return `
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M7.5 3A2.5 2.5 0 0 0 5 5.5v13A2.5 2.5 0 0 0 7.5 21h9a2.5 2.5 0 0 0 2.5-2.5V9.2a2.5 2.5 0 0 0-.73-1.77l-3.7-3.7A2.5 2.5 0 0 0 12.8 3H7.5Zm5.3 1.75c.2 0 .39.08.53.22l3.7 3.7c.14.14.22.33.22.53v9.3c0 .41-.34.75-.75.75h-9a.75.75 0 0 1-.75-.75v-13c0-.41.34-.75.75-.75h5.3Zm-3.55 6.5h5.5a.75.75 0 0 1 0 1.5h-5.5a.75.75 0 0 1 0-1.5Zm0 3.5h5.5a.75.75 0 0 1 0 1.5h-5.5a.75.75 0 0 1 0-1.5Z"></path>
    </svg>
  `;
}

function renderMarkdownToHtml(markdown: string): string {
  const normalized = markdown.replace(/\r\n/g, "\n").trim();
  if (normalized.length === 0) {
    return "<p>Artifact content unavailable.</p>";
  }

  const lines = normalized.split("\n");
  const html: string[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];

    if (!line.trim()) {
      index++;
      continue;
    }

    if (/^```/.test(line.trim())) {
      const language = line.trim().slice(3).trim();
      index++;
      const codeLines: string[] = [];
      while (index < lines.length && !/^```/.test(lines[index].trim())) {
        codeLines.push(lines[index]);
        index++;
      }
      if (index < lines.length) {
        index++;
      }
      html.push(`<pre><code${language ? ` data-language="${escapeHtmlAttribute(language)}"` : ""}>${escapeHtml(codeLines.join("\n"))}</code></pre>`);
      continue;
    }

    if (/^#{1,6}\s/.test(line)) {
      const match = /^(#{1,6})\s+(.*)$/.exec(line);
      if (match) {
        const level = match[1].length;
        html.push(`<h${level}>${renderInlineMarkdown(match[2])}</h${level}>`);
      }
      index++;
      continue;
    }

    if (/^\s*([-*_])(?:\s*\1){2,}\s*$/.test(line)) {
      html.push("<hr />");
      index++;
      continue;
    }

    if (isMarkdownTable(lines, index)) {
      const { html: tableHtml, nextIndex } = renderMarkdownTable(lines, index);
      html.push(tableHtml);
      index = nextIndex;
      continue;
    }

    if (/^\s*>\s?/.test(line)) {
      const quoteLines: string[] = [];
      while (index < lines.length && /^\s*>\s?/.test(lines[index])) {
        quoteLines.push(lines[index].replace(/^\s*>\s?/, ""));
        index++;
      }
      html.push(`<blockquote>${renderMarkdownToHtml(quoteLines.join("\n"))}</blockquote>`);
      continue;
    }

    if (/^\s*[-*+]\s+/.test(line)) {
      const { html: listHtml, nextIndex } = renderMarkdownList(lines, index, false);
      html.push(listHtml);
      index = nextIndex;
      continue;
    }

    if (/^\s*\d+\.\s+/.test(line)) {
      const { html: listHtml, nextIndex } = renderMarkdownList(lines, index, true);
      html.push(listHtml);
      index = nextIndex;
      continue;
    }

    const paragraphLines: string[] = [];
    while (index < lines.length && lines[index].trim()) {
      if (
        /^```/.test(lines[index].trim())
        || /^#{1,6}\s/.test(lines[index])
        || /^\s*>\s?/.test(lines[index])
        || /^\s*[-*+]\s+/.test(lines[index])
        || /^\s*\d+\.\s+/.test(lines[index])
        || /^\s*([-*_])(?:\s*\1){2,}\s*$/.test(lines[index])
        || isMarkdownTable(lines, index)
      ) {
        break;
      }

      paragraphLines.push(lines[index].trim());
      index++;
    }
    html.push(`<p>${renderInlineMarkdown(paragraphLines.join(" "))}</p>`);
  }

  return html.join("\n");
}

function renderMarkdownList(lines: readonly string[], startIndex: number, ordered: boolean): { html: string; nextIndex: number } {
  const items: string[] = [];
  let index = startIndex;
  const pattern = ordered ? /^\s*\d+\.\s+(.*)$/ : /^\s*[-*+]\s+(.*)$/;

  while (index < lines.length) {
    const match = pattern.exec(lines[index]);
    if (!match) {
      break;
    }

    items.push(`<li>${renderInlineMarkdown(match[1].trim())}</li>`);
    index++;
  }

  return {
    html: `<${ordered ? "ol" : "ul"}>${items.join("")}</${ordered ? "ol" : "ul"}>`,
    nextIndex: index
  };
}

function isMarkdownTable(lines: readonly string[], index: number): boolean {
  if (index + 1 >= lines.length) {
    return false;
  }

  const header = lines[index].trim();
  const separator = lines[index + 1].trim();
  return header.includes("|") && /^\|?[\s:-]+(?:\|[\s:-]+)+\|?$/.test(separator);
}

function renderMarkdownTable(lines: readonly string[], startIndex: number): { html: string; nextIndex: number } {
  const headerCells = splitMarkdownTableRow(lines[startIndex]);
  let index = startIndex + 2;
  const bodyRows: string[] = [];

  while (index < lines.length && lines[index].trim().includes("|") && !/^\s*$/.test(lines[index])) {
    const rowCells = splitMarkdownTableRow(lines[index]);
    bodyRows.push(`<tr>${rowCells.map((cell) => `<td>${renderInlineMarkdown(cell)}</td>`).join("")}</tr>`);
    index++;
  }

  return {
    html: `
      <table>
        <thead><tr>${headerCells.map((cell) => `<th>${renderInlineMarkdown(cell)}</th>`).join("")}</tr></thead>
        <tbody>${bodyRows.join("")}</tbody>
      </table>
    `,
    nextIndex: index
  };
}

function splitMarkdownTableRow(row: string): string[] {
  return row
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function renderInlineMarkdown(text: string): string {
  let html = escapeHtml(text);
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");
  html = html.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+\"([^\"]*)\")?\)/g, (_match, label, href) => {
    const safeHref = escapeHtmlAttribute(href);
    return `<a href="${safeHref}">${label}</a>`;
  });
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/__([^_]+)__/g, "<strong>$1</strong>");
  html = html.replace(/(^|[\s(])\*([^*]+)\*(?=[\s).,!?:;]|$)/g, "$1<em>$2</em>");
  html = html.replace(/(^|[\s(])_([^_]+)_(?=[\s).,!?:;]|$)/g, "$1<em>$2</em>");
  return html;
}

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeHtmlAttribute(value: string): string {
  return escapeHtml(value);
}
