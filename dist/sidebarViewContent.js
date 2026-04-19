"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildSidebarHtml = buildSidebarHtml;
function buildSidebarHtml(model) {
    const busyIndicatorMarkup = buildBusyIndicatorMarkup(model);
    const isBusy = model.busyMessage !== null;
    const createFileMode = model.createFileMode ?? "context";
    const createFiles = model.createFiles ?? [];
    if (!model.hasWorkspace) {
        return wrapHtml(`
      ${busyIndicatorMarkup}
      <section class="empty-state">
        <p class="eyebrow">SpecForge.AI</p>
        <h1>Open a workspace to start.</h1>
        <p class="copy">The sidebar needs a workspace folder to persist user stories under <code>.specs/</code>.</p>
      </section>
    `, isBusy);
    }
    const promptsBootstrapMarkup = !model.promptsInitialized
        ? buildPromptsBootstrapMarkup(model.userStories.length === 0)
        : "";
    if (model.userStories.length === 0 && !model.showCreateForm && !model.promptsInitialized) {
        return wrapHtml(`
      ${busyIndicatorMarkup}
      ${buildSettingsWarningMarkup(model)}
      ${promptsBootstrapMarkup}
    `, isBusy);
    }
    if (model.userStories.length === 0 && !model.showCreateForm && model.promptsInitialized) {
        return wrapHtml(`
      ${busyIndicatorMarkup}
      ${buildSettingsWarningMarkup(model)}
      <section class="empty-state hero">
        <div class="hero-header">
          <div>
            <p class="eyebrow">SpecForge.AI</p>
            <h1>Create your first user story</h1>
          </div>
        </div>
        <p class="copy">No faded text-buttons, no scattered prompts. Start here and the sidebar opens the full intake form in place.</p>
        <button class="primary-action" data-command="showCreateForm">Create User Story</button>
      </section>
    `, isBusy);
    }
    const storyGroups = groupStories(model.userStories);
    const storiesMarkup = storyGroups.map((group) => `
    <section class="story-group">
      <div class="group-header">${escapeHtml(group.category)}</div>
      ${group.items.map((summary) => `
        <div class="story-row story-row--shell">
          <button class="story-card${shouldRenderPhaseRail(summary.status) ? ` story-card--active story-card--phase-${escapeHtmlAttr(summary.currentPhase)} story-card--status-${escapeHtmlAttr(phaseRailStatus(summary.status))}` : ""}" data-command="openWorkflow" data-us-id="${escapeHtmlAttr(summary.usId)}">
            ${shouldRenderPhaseRail(summary.status)
        ? `
                <span class="story-card__phase-rail" aria-hidden="true">
                  <span class="story-card__phase-number">${phaseNumberFor(summary.currentPhase)}</span>
                </span>
              `
        : ""}
            <span class="story-card__content">
              <span class="story-card__id">${escapeHtml(summary.usId)}</span>
              <strong>${escapeHtml(summary.title)}</strong>
              <span class="story-card__meta">${escapeHtml(summary.currentPhase)} · ${escapeHtml(summary.status)}</span>
            </span>
          </button>
          <button
            class="icon-action story-star${model.starredUserStoryId === summary.usId ? " story-star--active" : ""}"
            data-command="toggleStarredUserStory"
            data-us-id="${escapeHtmlAttr(summary.usId)}"
            title="${escapeHtmlAttr(model.starredUserStoryId === summary.usId ? `Unstar ${summary.usId}` : `Star ${summary.usId}`)}"
            aria-label="${escapeHtmlAttr(model.starredUserStoryId === summary.usId ? `Unstar ${summary.usId}` : `Star ${summary.usId}`)}">
            <span aria-hidden="true">${model.starredUserStoryId === summary.usId ? "★" : "☆"}</span>
          </button>
          <button
            class="icon-action icon-action--danger story-delete"
            data-command="deleteUserStory"
            data-us-id="${escapeHtmlAttr(summary.usId)}"
            title="Delete ${escapeHtmlAttr(summary.usId)}"
            aria-label="Delete ${escapeHtmlAttr(summary.usId)}">
            <span aria-hidden="true">🗑</span>
          </button>
        </div>
      `).join("")}
    </section>
  `).join("");
    const formMarkup = model.showCreateForm && model.promptsInitialized
        ? `
      <section class="form-card">
        <div class="section-header">
          <div>
            <p class="eyebrow">New User Story</p>
            <h2>Create from the sidebar</h2>
          </div>
          <button class="ghost-action" data-command="hideCreateForm">Close</button>
        </div>
        <form id="create-user-story-form">
          <label>
            <span>Title</span>
            <input name="title" type="text" placeholder="Workflow graph with audit stream" required />
          </label>
          <label>
            <span>Kind</span>
            <select name="kind">
              <option value="feature">feature</option>
              <option value="bug">bug</option>
              <option value="hotfix">hotfix</option>
            </select>
          </label>
          <label>
            <span>Category</span>
            <select name="category">
              ${model.categories.map((category) => `<option value="${escapeHtmlAttr(category)}">${escapeHtml(category)}</option>`).join("")}
            </select>
          </label>
          <label>
            <span>Source</span>
            <textarea name="sourceText" rows="8" placeholder="Describe the user story objective and scope." required></textarea>
          </label>
          <div class="form-files">
            <div class="form-files__header">
              <div>
                <span>Files</span>
                <p class="copy">Switch between runtime context and user-story info before adding files. You can reclassify them below.</p>
              </div>
            </div>
            <div class="form-files__actions">
              <div class="file-kind-toggle">
                <button class="file-kind-toggle__option${createFileMode === "context" ? " file-kind-toggle__option--active" : ""}" type="button" data-command="setCreateFileMode" data-kind="context">Context</button>
                <button class="file-kind-toggle__option${createFileMode === "attachment" ? " file-kind-toggle__option--active" : ""}" type="button" data-command="setCreateFileMode" data-kind="attachment">US Info</button>
              </div>
              <button class="secondary-action" type="button" data-command="addCreateFiles" data-kind="${escapeHtmlAttr(createFileMode)}">Add Files</button>
            </div>
            ${createFiles.length > 0
            ? `<div class="draft-file-list">
                  ${createFiles.map((file) => `
                    <div class="draft-file-item">
                      <div class="draft-file-item__content">
                        <strong>${escapeHtml(file.name)}</strong>
                        <span>${escapeHtml(file.sourcePath)}</span>
                      </div>
                      <div class="draft-file-item__actions">
                        <button class="file-kind-chip${file.kind === "context" ? " file-kind-chip--active" : ""}" type="button" data-command="setCreateFileKind" data-source-path="${escapeHtmlAttr(file.sourcePath)}" data-kind="context">Context</button>
                        <button class="file-kind-chip${file.kind === "attachment" ? " file-kind-chip--active" : ""}" type="button" data-command="setCreateFileKind" data-source-path="${escapeHtmlAttr(file.sourcePath)}" data-kind="attachment">US Info</button>
                        <button class="ghost-action ghost-action--danger" type="button" data-command="removeCreateFile" data-source-path="${escapeHtmlAttr(file.sourcePath)}">Remove</button>
                      </div>
                    </div>
                  `).join("")}
                </div>`
            : "<p class=\"copy form-files__empty\">No files selected yet.</p>"}
          </div>
          <button class="primary-action" type="submit">Create User Story</button>
        </form>
      </section>
    `
        : "";
    return wrapHtml(`
    ${busyIndicatorMarkup}
    ${buildSettingsWarningMarkup(model)}
    ${promptsBootstrapMarkup}
    ${formMarkup}
    <section class="story-list">
      <div class="section-header">
        <div>
          <p class="eyebrow">User Stories</p>
          <h2>Workflow backlog</h2>
        </div>
        ${buildCompactActions(model)}
      </div>
      ${storiesMarkup || "<p class=\"copy story-list__empty\">Bootstrap the repo prompts to start creating user stories from the sidebar.</p>"}
    </section>
  `, isBusy);
}
function buildSettingsWarningMarkup(model) {
    if (model.settingsConfigured || !model.settingsMessage) {
        return "";
    }
    return `
    <section class="settings-warning">
      <div class="settings-warning__icon" aria-hidden="true">⚠</div>
      <div class="settings-warning__content">
        <p class="eyebrow warning">Configuration Required</p>
        <h2>SpecForge.AI settings are incomplete</h2>
        <p class="copy">${escapeHtml(model.settingsMessage)}</p>
      </div>
      <button class="warning-action" data-command="openSettings">Configure Settings</button>
    </section>
  `;
}
function buildBusyIndicatorMarkup(model) {
    if (!model.busyMessage) {
        return "";
    }
    return `
    <section class="busy-indicator" role="status" aria-live="polite">
      <div class="busy-indicator__spinner" aria-hidden="true"></div>
      <div class="busy-indicator__content">
        <p class="eyebrow">Working</p>
        <p class="copy">${escapeHtml(model.busyMessage)}</p>
      </div>
    </section>
  `;
}
function buildPromptActionButton(promptsInitialized) {
    const title = promptsInitialized
        ? "Reinitialize repo prompts"
        : "Initialize repo prompts";
    return `
    <button
      class="icon-action"
      data-command="initializeRepoPrompts"
      title="${escapeHtmlAttr(title)}"
      aria-label="${escapeHtmlAttr(title)}">
      <span aria-hidden="true">↻</span>
    </button>
  `;
}
function buildCreateActionButton(enabled) {
    const title = enabled
        ? "Create new user story"
        : "Initialize repo prompts before creating a user story";
    const disabled = enabled ? "" : " disabled";
    return `
    <button
      class="icon-action"
      data-command="showCreateForm"
      title="${escapeHtmlAttr(title)}"
      aria-label="${escapeHtmlAttr(title)}"${disabled}>
      <span aria-hidden="true">+</span>
    </button>
  `;
}
function buildCompactActions(model) {
    return `
    <div class="compact-actions">
      ${buildPromptActionButton(model.promptsInitialized)}
      ${buildCreateActionButton(model.promptsInitialized)}
    </div>
  `;
}
function buildPromptsBootstrapMarkup(isFirstRun) {
    return `
    <section class="action-card bootstrap-card">
      <div class="section-header">
        <div>
          <p class="eyebrow">Repo Bootstrap</p>
          <h2>${isFirstRun ? "Initialize prompts before the first user story" : "Initialize missing repo prompts"}</h2>
        </div>
      </div>
      <p class="copy">SpecForge.AI needs the repo prompt set under <code>.specs/prompts/</code> before the sidebar can create or refresh workflow intake.</p>
      <button class="primary-action" data-command="initializeRepoPrompts">Bootstrap Prompts</button>
    </section>
  `;
}
function wrapHtml(content, busy) {
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
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 14px;
      background:
        radial-gradient(circle at top, rgba(114, 241, 184, 0.12), transparent 28%),
        linear-gradient(180deg, rgba(9, 16, 22, 0.98), rgba(11, 15, 20, 1));
      color: var(--vscode-editor-foreground);
    }
    .empty-state, .form-card, .story-list, .action-card {
      border: 1px solid rgba(114, 241, 184, 0.12);
      border-radius: 20px;
      background: rgba(14, 20, 26, 0.92);
      box-shadow: 0 14px 30px rgba(0, 0, 0, 0.24);
    }
    .bootstrap-card {
      margin-bottom: 14px;
    }
    .busy-indicator {
      display: grid;
      grid-template-columns: auto 1fr;
      gap: 12px;
      padding: 14px 16px;
      margin-bottom: 14px;
      border-radius: 18px;
      border: 1px solid rgba(114, 241, 184, 0.24);
      background: linear-gradient(180deg, rgba(16, 38, 31, 0.96), rgba(12, 24, 20, 0.98));
      box-shadow: 0 14px 30px rgba(0, 0, 0, 0.24);
    }
    .busy-indicator__spinner {
      width: 18px;
      height: 18px;
      margin-top: 4px;
      border-radius: 50%;
      border: 2px solid rgba(114, 241, 184, 0.2);
      border-top-color: #72f1b8;
      animation: spin 900ms linear infinite;
    }
    .busy-indicator__content .copy {
      margin-top: 2px;
    }
    .settings-warning {
      display: grid;
      grid-template-columns: auto 1fr;
      gap: 14px;
      padding: 16px;
      border-radius: 20px;
      border: 1px solid rgba(255, 208, 84, 0.34);
      background: linear-gradient(180deg, rgba(54, 42, 8, 0.96), rgba(31, 24, 7, 0.98));
      box-shadow: 0 14px 30px rgba(0, 0, 0, 0.24);
      margin-bottom: 14px;
    }
    .settings-warning__icon {
      width: 44px;
      height: 44px;
      border-radius: 14px;
      background: rgba(255, 211, 92, 0.2);
      color: #ffd75a;
      display: grid;
      place-items: center;
      font-size: 1.3rem;
      font-weight: 900;
      box-shadow: 0 0 0 8px rgba(255, 211, 92, 0.06);
    }
    .settings-warning__content {
      min-width: 0;
    }
    .hero-header {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      align-items: flex-start;
    }
    .empty-state.hero {
      padding: 22px 18px;
      min-height: 240px;
      display: grid;
      align-content: center;
      gap: 10px;
    }
    .eyebrow {
      margin: 0;
      text-transform: uppercase;
      letter-spacing: 0.16em;
      font-size: 0.72rem;
      color: #72f1b8;
    }
    .eyebrow.warning {
      color: #ffd75a;
    }
    h1, h2 {
      margin: 0;
      line-height: 1.05;
    }
    h1 {
      font-size: 1.75rem;
    }
    h2 {
      font-size: 1.1rem;
    }
    .copy {
      margin: 0;
      color: rgba(255, 255, 255, 0.74);
      line-height: 1.5;
    }
    .action-card .primary-action,
    .empty-state.hero .primary-action {
      margin-top: 18px;
    }
    .primary-action, .secondary-action, .ghost-action, .story-card, .icon-action, .warning-action {
      width: 100%;
      border-radius: 14px;
      border: 1px solid rgba(114, 241, 184, 0.18);
      cursor: pointer;
    }
    button:disabled, input:disabled, select:disabled, textarea:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    .primary-action {
      padding: 14px 16px;
      background: linear-gradient(180deg, rgba(114, 241, 184, 0.24), rgba(16, 36, 28, 0.96));
      color: #f3fff9;
      font-weight: 700;
      font-size: 0.96rem;
      box-shadow: 0 10px 24px rgba(0, 0, 0, 0.18);
    }
    .secondary-action {
      padding: 10px 12px;
      background: rgba(114, 241, 184, 0.08);
      color: #dcfff0;
    }
    .ghost-action {
      padding: 10px 12px;
      background: rgba(255, 255, 255, 0.04);
      color: inherit;
    }
    .ghost-action--danger {
      border-color: rgba(255, 139, 139, 0.18);
      color: #ffb0b0;
    }
    .warning-action {
      grid-column: 1 / -1;
      padding: 12px 14px;
      background: linear-gradient(180deg, rgba(255, 211, 92, 0.24), rgba(84, 58, 8, 0.96));
      color: #fff6d8;
      font-weight: 700;
      margin-top: 4px;
    }
    .icon-action {
      width: 38px;
      min-width: 38px;
      height: 38px;
      padding: 0;
      border-radius: 12px;
      background: rgba(255, 255, 255, 0.04);
      color: #72f1b8;
      display: inline-grid;
      place-items: center;
      font-size: 1.1rem;
      font-weight: 700;
    }
    .icon-action:hover {
      background: rgba(114, 241, 184, 0.12);
      border-color: rgba(114, 241, 184, 0.34);
    }
    .icon-action--danger {
      color: #ff9b9b;
      border-color: rgba(255, 139, 139, 0.18);
    }
    .icon-action--danger:hover {
      background: rgba(255, 139, 139, 0.12);
      border-color: rgba(255, 139, 139, 0.34);
    }
    .icon-action:disabled {
      opacity: 0.45;
      cursor: not-allowed;
    }
    .compact-actions {
      display: flex;
      gap: 8px;
      align-items: center;
      flex-shrink: 0;
    }
    .form-card, .story-list, .action-card {
      padding: 16px;
    }
    .action-card {
      margin-top: 14px;
    }
    .section-header {
      display: flex;
      justify-content: space-between;
      gap: 10px;
      align-items: center;
      margin-bottom: 14px;
    }
    form {
      display: grid;
      gap: 12px;
    }
    label {
      display: grid;
      gap: 6px;
    }
    label span {
      font-size: 0.82rem;
      color: rgba(255, 255, 255, 0.78);
    }
    input, select, textarea {
      width: 100%;
      border-radius: 12px;
      border: 1px solid rgba(255, 255, 255, 0.08);
      background: rgba(255, 255, 255, 0.04);
      color: inherit;
      padding: 10px 12px;
      font: inherit;
    }
    textarea {
      resize: vertical;
      min-height: 124px;
    }
    .form-files {
      display: grid;
      gap: 10px;
      padding: 12px;
      border-radius: 16px;
      border: 1px solid rgba(255, 255, 255, 0.06);
      background: rgba(255, 255, 255, 0.02);
    }
    .form-files__header {
      display: flex;
      justify-content: space-between;
      gap: 10px;
      align-items: flex-start;
    }
    .form-files__actions {
      display: flex;
      gap: 10px;
      align-items: center;
      flex-wrap: wrap;
    }
    .form-files__empty {
      font-size: 0.84rem;
    }
    .file-kind-toggle {
      display: inline-flex;
      gap: 4px;
      padding: 4px;
      border-radius: 999px;
      border: 1px solid rgba(255, 255, 255, 0.08);
      background: rgba(255, 255, 255, 0.03);
    }
    .file-kind-toggle__option,
    .file-kind-chip {
      width: auto;
      border-radius: 999px;
      padding: 8px 10px;
      background: rgba(255, 255, 255, 0.02);
      color: rgba(255, 255, 255, 0.72);
      border: 1px solid rgba(255, 255, 255, 0.06);
      cursor: pointer;
    }
    .file-kind-toggle__option--active,
    .file-kind-chip--active {
      background: rgba(114, 241, 184, 0.14);
      color: #dffff0;
      border-color: rgba(114, 241, 184, 0.2);
    }
    .draft-file-list {
      display: grid;
      gap: 8px;
    }
    .draft-file-item {
      display: grid;
      gap: 10px;
      padding: 12px;
      border-radius: 14px;
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid rgba(255, 255, 255, 0.05);
    }
    .draft-file-item__content {
      display: grid;
      gap: 4px;
    }
    .draft-file-item__content span {
      font-size: 0.76rem;
      color: rgba(255, 255, 255, 0.56);
      font-family: ui-monospace, "SF Mono", Menlo, monospace;
      word-break: break-all;
    }
    .draft-file-item__actions {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      align-items: center;
    }
    .story-list {
      margin-top: 14px;
    }
    .story-list__empty {
      margin-top: 6px;
    }
    .story-group + .story-group {
      margin-top: 14px;
    }
    .story-row {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto auto;
      gap: 8px;
      align-items: stretch;
    }
    .story-row--shell {
      padding: 10px;
      border-radius: 24px;
      border: 1px solid rgba(114, 241, 184, 0.12);
      background:
        linear-gradient(180deg, rgba(255, 255, 255, 0.025), rgba(255, 255, 255, 0.01)),
        rgba(14, 20, 26, 0.92);
      box-shadow: 0 14px 30px rgba(0, 0, 0, 0.24);
    }
    .story-row--shell > .story-card,
    .story-row--shell > .icon-action {
      border: 0;
      box-shadow: none;
    }
    .story-row + .story-row {
      margin-top: 8px;
    }
    .group-header {
      margin-bottom: 8px;
      text-transform: uppercase;
      letter-spacing: 0.14em;
      font-size: 0.72rem;
      color: rgba(114, 241, 184, 0.82);
    }
    .story-card {
      text-align: left;
      padding: 0;
      background: rgba(255, 255, 255, 0.03);
      color: inherit;
      display: grid;
      grid-template-columns: 1fr;
      overflow: hidden;
      min-height: 100%;
    }
    .story-card__content {
      display: grid;
      gap: 4px;
      padding: 12px 14px;
    }
    .story-card--active {
      grid-template-columns: 42px minmax(0, 1fr);
      align-items: stretch;
    }
    .story-card__phase-rail {
      display: flex;
      align-items: center;
      justify-content: center;
      border-right: 1px solid rgba(255, 255, 255, 0.08);
      background: linear-gradient(180deg, rgba(255, 255, 255, 0.08), rgba(255, 255, 255, 0.02));
      border-top-left-radius: 13px;
      border-bottom-left-radius: 13px;
    }
    .story-card__phase-number {
      display: inline-block;
      transform: rotate(-90deg);
      font-size: 1rem;
      font-weight: 800;
      letter-spacing: 0.16em;
      color: rgba(255, 255, 255, 0.92);
      line-height: 1;
    }
    .story-card--phase-capture .story-card__phase-rail,
    .story-card--phase-clarification .story-card__phase-rail {
      background: linear-gradient(180deg, rgba(114, 241, 184, 0.22), rgba(18, 46, 36, 0.92));
      border-right-color: rgba(114, 241, 184, 0.18);
    }
    .story-card--phase-refinement .story-card__phase-rail,
    .story-card--phase-technical-design .story-card__phase-rail {
      background: linear-gradient(180deg, rgba(92, 181, 255, 0.24), rgba(15, 34, 56, 0.92));
      border-right-color: rgba(92, 181, 255, 0.2);
    }
    .story-card--phase-implementation .story-card__phase-rail,
    .story-card--phase-review .story-card__phase-rail {
      background: linear-gradient(180deg, rgba(255, 193, 120, 0.22), rgba(52, 34, 15, 0.92));
      border-right-color: rgba(255, 193, 120, 0.18);
    }
    .story-card--phase-release-approval .story-card__phase-rail,
    .story-card--phase-pr-preparation .story-card__phase-rail {
      background: linear-gradient(180deg, rgba(255, 139, 139, 0.22), rgba(56, 18, 18, 0.92));
      border-right-color: rgba(255, 139, 139, 0.18);
    }
    .story-card--status-active .story-card__phase-rail,
    .story-card--status-running .story-card__phase-rail,
    .story-card--status-executing .story-card__phase-rail,
    .story-card--status-in-progress .story-card__phase-rail {
      background: linear-gradient(180deg, rgba(92, 181, 255, 0.3), rgba(15, 34, 56, 0.96));
      border-right-color: rgba(92, 181, 255, 0.28);
    }
    .story-card--status-waiting-user .story-card__phase-rail,
    .story-card--status-needs-user-input .story-card__phase-rail {
      background: linear-gradient(180deg, rgba(255, 213, 90, 0.32), rgba(74, 52, 9, 0.96));
      border-right-color: rgba(255, 213, 90, 0.28);
    }
    .story-card--status-paused .story-card__phase-rail,
    .story-card--status-stopped .story-card__phase-rail,
    .story-card--status-stopping .story-card__phase-rail {
      background: linear-gradient(180deg, rgba(151, 161, 176, 0.26), rgba(39, 44, 54, 0.96));
      border-right-color: rgba(151, 161, 176, 0.24);
    }
    .story-card--status-blocked .story-card__phase-rail {
      background: linear-gradient(180deg, rgba(255, 139, 139, 0.3), rgba(56, 18, 18, 0.96));
      border-right-color: rgba(255, 139, 139, 0.28);
    }
    .story-card--status-completed .story-card__phase-rail {
      background: linear-gradient(180deg, rgba(114, 241, 184, 0.28), rgba(18, 46, 36, 0.96));
      border-right-color: rgba(114, 241, 184, 0.26);
    }
    .story-delete {
      align-self: stretch;
      height: 100%;
    }
    .story-star {
      align-self: stretch;
      height: 100%;
    }
    .story-row--shell > .icon-action {
      width: 40px;
      min-width: 40px;
      border-radius: 14px;
      background: transparent;
      position: relative;
    }
    .story-row--shell > .icon-action::before {
      content: "";
      position: absolute;
      left: -4px;
      top: 8px;
      bottom: 8px;
      width: 1px;
      background: rgba(255, 255, 255, 0.08);
    }
    .story-row--shell > .icon-action:hover {
      background: rgba(255, 255, 255, 0.05);
    }
    .story-row--shell > .icon-action.icon-action--danger:hover {
      background: rgba(255, 139, 139, 0.09);
    }
    .story-star--active {
      color: #ffd75a;
      background: rgba(255, 213, 90, 0.1) !important;
    }
    .story-card__id {
      font-family: ui-monospace, "SF Mono", Menlo, monospace;
      font-size: 0.76rem;
      color: rgba(255, 255, 255, 0.62);
    }
    .story-card__meta {
      font-size: 0.8rem;
      color: rgba(255, 255, 255, 0.62);
    }
    @keyframes spin {
      to {
        transform: rotate(360deg);
      }
    }
  </style>
</head>
<body>
  ${content}
  <script>
    const vscode = acquireVsCodeApi();
    const busy = ${busy ? "true" : "false"};
    for (const element of document.querySelectorAll("[data-command]")) {
      if (busy && element instanceof HTMLButtonElement) {
        element.disabled = true;
      }
      element.addEventListener("click", () => {
        if (busy) {
          return;
        }
        vscode.postMessage({
          command: element.dataset.command,
          usId: element.dataset.usId,
          kind: element.dataset.kind,
          sourcePath: element.dataset.sourcePath
        });
      });
    }
    const form = document.getElementById("create-user-story-form");
    if (form) {
      for (const field of form.querySelectorAll("input, select, textarea, button")) {
        field.disabled = busy;
      }
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        if (busy) {
          return;
        }
        const data = new FormData(form);
        vscode.postMessage({
          command: "submitCreateForm",
          title: String(data.get("title") ?? ""),
          kind: String(data.get("kind") ?? "feature"),
          category: String(data.get("category") ?? ""),
          sourceText: String(data.get("sourceText") ?? "")
        });
      });
    }
  </script>
</body>
</html>`;
}
function groupStories(items) {
    const grouped = new Map();
    for (const item of items) {
        const bucket = grouped.get(item.category) ?? [];
        bucket.push(item);
        grouped.set(item.category, bucket);
    }
    return [...grouped.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([category, stories]) => ({
        category,
        items: [...stories].sort((left, right) => left.usId.localeCompare(right.usId))
    }));
}
function escapeHtml(value) {
    return value
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll("\"", "&quot;")
        .replaceAll("'", "&#39;");
}
function escapeHtmlAttr(value) {
    return escapeHtml(value);
}
function phaseNumberFor(currentPhase) {
    const phaseOrder = {
        "capture": "1",
        "clarification": "2",
        "refinement": "3",
        "technical-design": "4",
        "implementation": "5",
        "review": "6",
        "release-approval": "7",
        "pr-preparation": "8"
    };
    return phaseOrder[currentPhase] ?? "?";
}
function shouldRenderPhaseRail(status) {
    return status !== "completed" && status !== "superseded" && status !== "abandoned";
}
function phaseRailStatus(status) {
    switch (status) {
        case "waiting-user":
        case "needs-user-input":
            return "waiting-user";
        case "paused":
        case "stopped":
        case "stopping":
            return "paused";
        case "blocked":
            return "blocked";
        case "completed":
            return "completed";
        case "active":
        case "running":
        case "executing":
        case "in-progress":
        default:
            return "active";
    }
}
//# sourceMappingURL=sidebarViewContent.js.map