import type { UserStorySummary } from "./backendClient";
import { escapeHtml, escapeHtmlAttr } from "./htmlEscape";
import { buildWebviewTypographyRootCss } from "./webviewTypography";

type DraftCreateFile = {
  readonly sourcePath: string;
  readonly name: string;
  readonly kind: "context" | "attachment";
};

export interface SidebarViewModel {
  readonly hasWorkspace: boolean;
  readonly showCreateForm: boolean;
  readonly busyMessage: string | null;
  readonly promptsInitialized: boolean;
  readonly promptsMessage?: string | null;
  readonly settingsConfigured: boolean;
  readonly settingsMessage: string | null;
  readonly starredUserStoryId: string | null;
  readonly activeWorkflowUsId: string | null;
  readonly runtimeVersion: string | null;
  readonly viewMode: "category" | "phase";
  readonly createFileMode?: "context" | "attachment";
  readonly createFiles?: readonly DraftCreateFile[];
  readonly createFormResetToken?: number;
  readonly typographyCssVars?: string;
  readonly categories: readonly string[];
  readonly userStories: readonly UserStorySummary[];
}

export function buildSidebarHtml(model: SidebarViewModel): string {
  const busyIndicatorMarkup = buildBusyIndicatorMarkup(model);
  const isBusy = model.busyMessage !== null;
  const createFileMode = model.createFileMode ?? "context";
  const createFiles = model.createFiles ?? [];

  if (!model.hasWorkspace) {
    return wrapHtml(`
      ${busyIndicatorMarkup}
      <section class="empty-state">
        <div class="panel-caption">
          <p class="eyebrow">SpecForge.AI</p>
          ${buildRuntimeVersionMarkup(model.runtimeVersion)}
        </div>
        <h1>Open a workspace to start.</h1>
        <p class="copy">The sidebar needs a workspace folder to persist user stories under <code>.specs/</code>.</p>
      </section>
    `, isBusy, model.createFormResetToken ?? 0, model.typographyCssVars ?? "");
  }

  const promptsBootstrapMarkup = !model.promptsInitialized
    ? buildPromptsBootstrapMarkup(model.userStories.length === 0, model.promptsMessage ?? null)
    : "";

  if (model.userStories.length === 0 && !model.showCreateForm && !model.promptsInitialized) {
    return wrapHtml(`
      ${busyIndicatorMarkup}
      ${buildSettingsWarningMarkup(model)}
      ${promptsBootstrapMarkup}
    `, isBusy, model.createFormResetToken ?? 0, model.typographyCssVars ?? "");
  }

  if (model.userStories.length === 0 && !model.showCreateForm && model.promptsInitialized) {
    return wrapHtml(`
      ${busyIndicatorMarkup}
      ${buildSettingsWarningMarkup(model)}
      <section class="empty-state hero">
        <div class="hero-header">
          <div>
            <div class="panel-caption">
              <p class="eyebrow">SpecForge.AI</p>
              ${buildRuntimeVersionMarkup(model.runtimeVersion)}
            </div>
            <h1>Create your first user story</h1>
          </div>
          <div class="compact-actions">
            ${buildExecutionSettingsActionButton()}
          </div>
        </div>
        <p class="copy">No faded text-buttons, no scattered prompts. Start here and the sidebar opens the full intake form in place.</p>
        <button class="primary-action" data-command="showCreateForm">Create User Story</button>
      </section>
    `, isBusy, model.createFormResetToken ?? 0, model.typographyCssVars ?? "");
  }

  const storySections = model.viewMode === "phase"
    ? [{ heading: null, items: sortStoriesByPhase(model.userStories) }]
    : groupStories(model.userStories).map((group) => ({ heading: group.category, items: group.items }));
  const storiesMarkup = storySections.map((section) => `
    <section class="story-group${section.heading ? "" : " story-group--flat"}">
      ${section.heading ? `<div class="group-header">${escapeHtml(section.heading)}</div>` : ""}
      ${section.items.map((summary) => buildStoryRowMarkup(summary, model.starredUserStoryId, model.activeWorkflowUsId)).join("")}
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
          <div class="intake-shell">
            <div class="intake-switch" role="tablist" aria-label="User story intake mode">
              <button class="intake-switch__option intake-switch__option--active" type="button" data-intake-mode="freeform">Freeform</button>
              <button class="intake-switch__option" type="button" data-intake-mode="wizard">Guided Wizard</button>
            </div>
            <div class="intake-guidance">
              <div class="intake-guidance__group">
                <span class="intake-guidance__title">Minimum</span>
                <ul>
                  <li>Who or what is affected</li>
                  <li>What change is requested</li>
                  <li>How success will be validated</li>
                </ul>
              </div>
              <div class="intake-guidance__group">
                <span class="intake-guidance__title">Recommended</span>
                <ul>
                  <li>Expected scope or touched areas</li>
                  <li>Relevant repo context or files</li>
                  <li>Constraints, out-of-scope, or extra notes</li>
                </ul>
              </div>
            </div>
          </div>
          <div class="source-toolbar">
            <div>
              <span class="intake-guidance__title">Source Intake</span>
              <p class="copy">Write the US here or load an existing file. Loading from file switches the form to Freeform.</p>
            </div>
            <button class="ghost-action" type="button" data-command="loadCreateSourceFromFile">Load Source File</button>
          </div>
          <label>
            <span>Title</span>
            <input name="title" type="text" placeholder="Workflow graph with audit stream" required data-create-field="title" />
          </label>
          <label>
            <span>Kind</span>
            <select name="kind" data-create-field="kind">
              <option value="feature">feature</option>
              <option value="bug">bug</option>
              <option value="hotfix">hotfix</option>
            </select>
          </label>
          <label>
            <span>Category</span>
            <select name="category" data-create-field="category">
              ${model.categories.map((category) => `<option value="${escapeHtmlAttr(category)}">${escapeHtml(category)}</option>`).join("")}
            </select>
          </label>
          <section class="intake-panel intake-panel--active" data-intake-panel="freeform">
            <label>
              <span>Source</span>
              <textarea name="sourceText" rows="8" placeholder="Describe the user story objective and scope." required data-create-field="sourceText"></textarea>
            </label>
          </section>
          <section class="intake-panel" data-intake-panel="wizard">
            <div class="wizard-shell">
              <div class="wizard-header">
                <div>
                  <span class="intake-guidance__title">Guided Wizard</span>
                  <p class="copy">Optional. Answer the prompts and SpecForge.AI will build the user-story source for you.</p>
                </div>
                <div class="wizard-steps" aria-label="Wizard steps">
                  <button class="wizard-step wizard-step--active" type="button" data-wizard-step-trigger="0">1</button>
                  <button class="wizard-step" type="button" data-wizard-step-trigger="1">2</button>
                  <button class="wizard-step" type="button" data-wizard-step-trigger="2">3</button>
                </div>
              </div>
              <div class="wizard-panel wizard-panel--active" data-wizard-step="0">
                <div class="wizard-panel__heading">
                  <strong>Step 1</strong>
                  <span>Minimum story intent</span>
                </div>
                <label>
                  <span>Who is affected?</span>
                  <textarea rows="3" placeholder="Developer using the workflow view, backend MCP consumer, release approver..." data-create-field="wizard.actor"></textarea>
                </label>
                <label>
                  <span>What change is requested?</span>
                  <textarea rows="4" placeholder="Add, fix, or improve the workflow, tests, docs, provider behavior..." data-create-field="wizard.objective"></textarea>
                </label>
                <label>
                  <span>Why does it matter? <em>(recommended)</em></span>
                  <textarea rows="3" placeholder="Explain the outcome or user value expected from the change." data-create-field="wizard.value"></textarea>
                </label>
              </div>
              <div class="wizard-panel" data-wizard-step="1">
                <div class="wizard-panel__heading">
                  <strong>Step 2</strong>
                  <span>Scope and repo context</span>
                </div>
                <label>
                  <span>Scope or touched areas <em>(recommended)</em></span>
                  <textarea rows="4" placeholder="UI surface, backend service, workflow phase, tests, docs, prompts..." data-create-field="wizard.inScope"></textarea>
                </label>
                <label>
                  <span>Relevant repo context or likely files <em>(recommended)</em></span>
                  <textarea rows="3" placeholder="Mention folders, classes, views, tests, prompts, or artifacts that matter." data-create-field="wizard.repoContext"></textarea>
                </label>
                <label>
                  <span>Out of scope <em>(recommended)</em></span>
                  <textarea rows="3" placeholder="What should explicitly stay unchanged or outside this US?" data-create-field="wizard.outOfScope"></textarea>
                </label>
              </div>
              <div class="wizard-panel" data-wizard-step="2">
                <div class="wizard-panel__heading">
                  <strong>Step 3</strong>
                  <span>Validation and guardrails</span>
                </div>
                <label>
                  <span>Acceptance criteria</span>
                  <textarea rows="4" placeholder="What must be true for this US to be considered done?" data-create-field="wizard.acceptanceCriteria"></textarea>
                </label>
                <label>
                  <span>Constraints or guardrails <em>(recommended)</em></span>
                  <textarea rows="3" placeholder="Architectural limits, UX rules, provider constraints, compatibility requirements..." data-create-field="wizard.constraints"></textarea>
                </label>
                <label>
                  <span>Extra notes <em>(recommended)</em></span>
                  <textarea rows="3" placeholder="Anything else the model or reviewer should know." data-create-field="wizard.notes"></textarea>
                </label>
              </div>
              <div class="wizard-footer">
                <button class="ghost-action" type="button" data-wizard-nav="-1">Back</button>
                <button class="ghost-action" type="button" data-wizard-nav="1">Next</button>
              </div>
              <section class="wizard-preview">
                <div class="wizard-preview__header">
                  <span class="intake-guidance__title">Generated Source Preview</span>
                  <span class="copy">This is what the wizard will send as the user-story source.</span>
                </div>
                <pre class="wizard-preview__body" data-guided-source-preview></pre>
              </section>
            </div>
          </section>
          <section class="source-file-suggestions" data-source-file-suggestions hidden>
            <div class="source-file-suggestions__header">
              <div>
                <span class="intake-guidance__title">Referenced Files</span>
                <p class="copy">SpecForge found workspace files mentioned in the US text. Add them as context to avoid losing that repo signal.</p>
              </div>
              <button class="ghost-action" type="button" data-add-all-source-references hidden>Add All as Context</button>
            </div>
            <div class="source-file-suggestions__list" data-source-file-suggestions-list></div>
          </section>
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
              <button class="ghost-action" type="button" data-command="addCreateFiles" data-kind="${escapeHtmlAttr(createFileMode)}">Add Files</button>
            </div>
            <div class="file-dropzone" data-create-dropzone data-kind="${escapeHtmlAttr(createFileMode)}">
              <strong>Drag & Drop Files</strong>
              <span>Drop files here as ${escapeHtml(createFileMode === "context" ? "context" : "US info")}.</span>
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
                        <button class="icon-action icon-action--danger draft-file-item__remove" type="button" data-command="removeCreateFile" data-source-path="${escapeHtmlAttr(file.sourcePath)}" aria-label="Remove ${escapeHtmlAttr(file.name)}" title="Remove ${escapeHtmlAttr(file.name)}">🗑</button>
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
          <div class="panel-caption">
            <p class="eyebrow">User Stories</p>
            ${buildRuntimeVersionMarkup(model.runtimeVersion)}
          </div>
          <h2>${model.viewMode === "phase" ? "Workflow backlog by phase" : "Workflow backlog"}</h2>
        </div>
        ${buildCompactActions(model)}
      </div>
      ${storiesMarkup || "<p class=\"copy story-list__empty\">Bootstrap the repo prompts to start creating user stories from the sidebar.</p>"}
    </section>
  `, isBusy, model.createFormResetToken ?? 0, model.typographyCssVars ?? "");
}

function buildSettingsWarningMarkup(model: SidebarViewModel): string {
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
      <button class="warning-action" data-command="openExecutionSettings">Open Execution Form</button>
    </section>
  `;
}

function buildBusyIndicatorMarkup(model: SidebarViewModel): string {
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

function buildRuntimeVersionMarkup(runtimeVersion: string | null): string {
  return runtimeVersion
    ? `<span class="runtime-version">v.${escapeHtml(runtimeVersion)}</span>`
    : "";
}

function buildCreateActionButton(enabled: boolean): string {
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

function buildViewModeActionButton(viewMode: SidebarViewModel["viewMode"]): string {
  const isCategory = viewMode === "category";
  const title = isCategory
    ? "Switch to phase-ordered view"
    : "Switch to category view";

  return `
    <button
      class="icon-action"
      data-command="toggleViewMode"
      title="${escapeHtmlAttr(title)}"
      aria-label="${escapeHtmlAttr(title)}">
      <span aria-hidden="true">${isCategory ? "◫" : "≣"}</span>
    </button>
  `;
}

function buildPromptMenu(promptsInitialized: boolean): string {
  const bootstrapLabel = promptsInitialized ? "Refresh Prompts" : "Bootstrap Prompts";

  return `
    <div class="action-menu" data-action-menu>
      <button
        class="icon-action"
        type="button"
        data-action-menu-toggle
        title="Prompt actions"
        aria-label="Prompt actions"
        aria-haspopup="menu"
        aria-expanded="false">
        <span aria-hidden="true">☰</span>
      </button>
      <div class="action-menu__panel" data-action-menu-panel role="menu" hidden>
        <button class="action-menu__item" type="button" data-command="initializeRepoPrompts" role="menuitem"><span class="action-menu__item-icon" aria-hidden="true">↻</span><span>${escapeHtml(bootstrapLabel)}</span></button>
        <button class="action-menu__item" type="button" data-command="openPromptTemplates" role="menuitem"${promptsInitialized ? "" : " disabled"}><span class="action-menu__item-icon" aria-hidden="true">📄</span><span>Open Prompt Templates</span></button>
      </div>
    </div>
  `;
}

function buildExecutionSettingsActionButton(): string {
  return `
    <button
      class="icon-action"
      data-command="openExecutionSettings"
      title="Configure execution providers"
      aria-label="Configure execution providers">
      <span aria-hidden="true">⚙</span>
    </button>
  `;
}

function buildCompactActions(model: SidebarViewModel): string {
  return `
    <div class="compact-actions">
      ${buildCreateActionButton(model.promptsInitialized)}
      ${buildExecutionSettingsActionButton()}
      ${buildViewModeActionButton(model.viewMode)}
      ${buildPromptMenu(model.promptsInitialized)}
    </div>
  `;
}

function buildPromptsBootstrapMarkup(isFirstRun: boolean, promptsMessage: string | null): string {
  return `
    <section class="action-card bootstrap-card">
      <div class="section-header">
        <div>
          <p class="eyebrow">Repo Bootstrap</p>
          <h2>${isFirstRun ? "Initialize prompts before the first user story" : "Initialize missing repo prompts"}</h2>
        </div>
      </div>
      <p class="copy">SpecForge.AI needs the repo prompt set under <code>.specs/prompts/</code> before the sidebar can create or refresh workflow intake.</p>
      ${promptsMessage ? `<p class="copy">${escapeHtml(promptsMessage)}</p>` : ""}
      <button class="primary-action" data-command="initializeRepoPrompts">Bootstrap Prompts</button>
    </section>
  `;
}

function wrapHtml(content: string, busy: boolean, createFormResetToken: number, typographyCssVars: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>
    :root {
      ${buildWebviewTypographyRootCss(typographyCssVars)}
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 14px;
      background:
        radial-gradient(140% 95% at 12% -8%, rgba(114, 241, 184, 0.08), transparent 42%),
        radial-gradient(120% 80% at 88% 112%, rgba(92, 181, 255, 0.08), transparent 38%),
        linear-gradient(180deg, rgba(8, 14, 20, 0.985), rgba(10, 15, 21, 1));
      color: var(--vscode-editor-foreground);
      background-attachment: fixed;
    }
    .empty-state, .form-card, .action-card {
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
    .panel-caption {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }
    .runtime-version {
      font-size: 0.68rem;
      letter-spacing: 0.08em;
      color: rgba(166, 255, 206, 0.78);
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
    .action-menu {
      position: relative;
    }
    .action-menu__panel {
      position: absolute;
      top: calc(100% + 8px);
      right: 0;
      min-width: 190px;
      padding: 8px;
      border-radius: 16px;
      border: 1px solid rgba(114, 241, 184, 0.16);
      background: rgba(14, 20, 26, 0.98);
      box-shadow: 0 18px 34px rgba(0, 0, 0, 0.34);
      display: grid;
      gap: 6px;
      z-index: 20;
    }
    .action-menu__panel[hidden] {
      display: none;
    }
    .action-menu__item {
      width: 100%;
      text-align: left;
      padding: 10px 12px;
      border-radius: 12px;
      border: 1px solid rgba(255, 255, 255, 0.06);
      background: rgba(255, 255, 255, 0.03);
      color: inherit;
      cursor: pointer;
      display: grid;
      grid-template-columns: 22px minmax(0, 1fr);
      gap: 8px;
      align-items: center;
    }
    .action-menu__item:hover {
      background: rgba(114, 241, 184, 0.12);
      border-color: rgba(114, 241, 184, 0.24);
    }
    .action-menu__item:disabled {
      opacity: 0.46;
      cursor: not-allowed;
    }
    .action-menu__item-icon {
      display: inline-grid;
      place-items: center;
      width: 22px;
      height: 22px;
      color: #72f1b8;
    }
    .action-menu__item--danger .action-menu__item-icon {
      color: #ff9b9b;
    }
    .form-card, .action-card {
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
    .intake-shell {
      display: grid;
      gap: 12px;
      padding: 12px;
      border-radius: 16px;
      border: 1px solid rgba(255, 255, 255, 0.06);
      background: rgba(255, 255, 255, 0.02);
    }
    .intake-switch {
      display: inline-flex;
      gap: 4px;
      padding: 4px;
      width: fit-content;
      border-radius: 999px;
      border: 1px solid rgba(255, 255, 255, 0.08);
      background: rgba(255, 255, 255, 0.03);
    }
    .intake-switch__option {
      width: auto;
      border-radius: 999px;
      padding: 8px 12px;
      background: rgba(255, 255, 255, 0.02);
      color: rgba(255, 255, 255, 0.72);
      border: 1px solid rgba(255, 255, 255, 0.06);
      cursor: pointer;
    }
    .intake-switch__option--active {
      background: rgba(114, 241, 184, 0.14);
      color: #dffff0;
      border-color: rgba(114, 241, 184, 0.2);
    }
    .intake-guidance {
      display: grid;
      gap: 10px;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    }
    .intake-guidance__group {
      display: grid;
      gap: 6px;
      padding: 12px;
      border-radius: 14px;
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid rgba(255, 255, 255, 0.05);
    }
    .intake-guidance__title {
      font-size: 0.76rem;
      text-transform: uppercase;
      letter-spacing: 0.14em;
      color: #72f1b8;
    }
    .intake-guidance__group ul {
      margin: 0;
      padding-left: 18px;
      color: rgba(255, 255, 255, 0.74);
      display: grid;
      gap: 6px;
      line-height: 1.4;
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
    .intake-panel {
      display: none;
    }
    .intake-panel--active {
      display: block;
    }
    .wizard-shell {
      display: grid;
      gap: 12px;
      padding: 12px;
      border-radius: 16px;
      border: 1px solid rgba(114, 241, 184, 0.12);
      background: linear-gradient(180deg, rgba(16, 23, 29, 0.98), rgba(11, 17, 23, 0.98));
    }
    .wizard-header,
    .wizard-footer {
      display: flex;
      justify-content: space-between;
      gap: 10px;
      align-items: center;
      flex-wrap: wrap;
    }
    .wizard-steps {
      display: inline-flex;
      gap: 8px;
      align-items: center;
    }
    .wizard-step {
      width: 34px;
      min-width: 34px;
      height: 34px;
      border-radius: 999px;
      border: 1px solid rgba(255, 255, 255, 0.08);
      background: rgba(255, 255, 255, 0.04);
      color: rgba(255, 255, 255, 0.68);
      cursor: pointer;
      font-weight: 800;
    }
    .wizard-step--active {
      background: rgba(114, 241, 184, 0.14);
      color: #dffff0;
      border-color: rgba(114, 241, 184, 0.2);
      box-shadow: 0 0 0 6px rgba(114, 241, 184, 0.05);
    }
    .wizard-panel {
      display: none;
      gap: 10px;
    }
    .wizard-panel--active {
      display: grid;
    }
    .wizard-panel__heading {
      display: grid;
      gap: 4px;
    }
    .wizard-panel__heading strong {
      font-size: 0.82rem;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: rgba(255, 255, 255, 0.68);
    }
    .wizard-panel__heading span {
      color: rgba(255, 255, 255, 0.82);
      font-weight: 600;
    }
    .wizard-preview {
      display: grid;
      gap: 8px;
      padding: 12px;
      border-radius: 14px;
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid rgba(255, 255, 255, 0.05);
    }
    .wizard-preview__header {
      display: grid;
      gap: 4px;
    }
    .wizard-preview__body {
      margin: 0;
      max-height: 220px;
      overflow: auto;
      padding: 12px;
      border-radius: 12px;
      background: rgba(0, 0, 0, 0.22);
      border: 1px solid rgba(255, 255, 255, 0.05);
      color: rgba(255, 255, 255, 0.78);
      white-space: pre-wrap;
      word-break: break-word;
      font: 0.78rem/1.5 ui-monospace, "SF Mono", Menlo, monospace;
    }
    .source-toolbar,
    .source-file-suggestions {
      display: grid;
      gap: 10px;
      padding: 12px;
      border-radius: 16px;
      border: 1px solid rgba(255, 255, 255, 0.06);
      background: rgba(255, 255, 255, 0.02);
    }
    .source-toolbar {
      grid-template-columns: minmax(0, 1fr) auto;
      align-items: start;
    }
    .source-file-suggestions__header {
      display: flex;
      justify-content: space-between;
      gap: 10px;
      align-items: start;
      flex-wrap: wrap;
    }
    .source-file-suggestions__list {
      display: grid;
      gap: 8px;
    }
    .source-file-suggestion {
      display: flex;
      justify-content: space-between;
      gap: 10px;
      align-items: center;
      flex-wrap: wrap;
      padding: 12px;
      border-radius: 14px;
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid rgba(255, 255, 255, 0.05);
    }
    .source-file-suggestion__content {
      display: grid;
      gap: 4px;
      min-width: 0;
    }
    .source-file-suggestion__content span {
      font-size: 0.76rem;
      color: rgba(255, 255, 255, 0.56);
      font-family: var(--specforge-mono-font-family);
      word-break: break-all;
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
    .file-dropzone {
      display: grid;
      gap: 4px;
      place-items: center;
      padding: 18px 14px;
      border-radius: 16px;
      border: 1px dashed rgba(114, 241, 184, 0.28);
      background: rgba(114, 241, 184, 0.05);
      text-align: center;
      color: rgba(255, 255, 255, 0.82);
      transition: border-color 140ms ease, background 140ms ease, transform 140ms ease;
    }
    .file-dropzone strong {
      font-size: 0.92rem;
      color: #dcfff0;
    }
    .file-dropzone span {
      font-size: 0.8rem;
      color: rgba(255, 255, 255, 0.66);
    }
    .file-dropzone--active {
      background: rgba(114, 241, 184, 0.1);
      border-color: rgba(114, 241, 184, 0.44);
      transform: translateY(-1px);
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
      font-family: var(--specforge-mono-font-family);
      word-break: break-all;
    }
    .draft-file-item__actions {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      align-items: center;
    }
    .draft-file-item__remove {
      width: 34px;
      min-width: 34px;
      height: 34px;
      margin-left: auto;
    }
    .story-list {
      margin-top: 14px;
      padding: 0;
      border: 0;
      border-radius: 0;
      background: transparent;
      box-shadow: none;
    }
    .story-list__empty {
      margin-top: 6px;
    }
    .story-group + .story-group {
      margin-top: 14px;
    }
    .story-group--flat + .story-group--flat {
      margin-top: 8px;
    }
    .story-row {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 8px;
      align-items: stretch;
    }
    .story-row--shell {
      --story-selection-edge-solid: rgba(176, 186, 199, 0.82);
      --story-selection-edge-glow: rgba(96, 108, 124, 0.24);
      --story-rail-top: rgba(176, 186, 199, 0.18);
      --story-rail-bottom: rgba(44, 50, 60, 0.96);
      --story-rail-border: rgba(176, 186, 199, 0.18);
      position: relative;
      padding: 10px;
      border-radius: 24px;
      border: 1px solid rgba(114, 241, 184, 0.12);
      background:
        linear-gradient(180deg, rgba(255, 255, 255, 0.025), rgba(255, 255, 255, 0.01)),
        rgba(14, 20, 26, 0.92);
      box-shadow: 0 14px 30px rgba(0, 0, 0, 0.24);
      isolation: isolate;
      overflow: visible;
    }
    .story-row--selected::before {
      content: none;
    }
    .story-row--selected::after {
      content: none;
    }
    .story-row--shell > .story-card,
    .story-row--shell > .story-actions,
    .story-row--shell > .story-actions > .icon-action,
    .story-row--shell > .story-actions > .action-menu > .icon-action {
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
      background:
        linear-gradient(180deg, rgba(22, 29, 37, 0.985), rgba(13, 18, 24, 0.99)),
        rgba(14, 20, 26, 0.99);
      color: inherit;
      display: grid;
      grid-template-columns: 1fr;
      overflow: hidden;
      min-height: 100%;
      border-radius: 18px 0 0 18px;
    }
    .story-row--selected .story-card {
      box-shadow:
        inset 5px 0 0 var(--story-selection-edge-solid),
        inset 14px 0 18px var(--story-selection-edge-glow);
    }
    .story-actions {
      background:
        linear-gradient(180deg, rgba(18, 24, 31, 0.985), rgba(12, 17, 23, 0.99)),
        rgba(14, 20, 26, 0.99);
      border-radius: 0 18px 18px 0;
      overflow: visible;
      position: relative;
      z-index: 4;
    }
    .story-row--selected .story-actions {
      box-shadow:
        inset -5px 0 0 var(--story-selection-edge-solid),
        inset -14px 0 18px var(--story-selection-edge-glow);
    }
    .story-row--status-active,
    .story-row--status-paused {
      --story-selection-edge-solid: rgba(128, 205, 255, 0.94);
      --story-selection-edge-glow: rgba(62, 142, 224, 0.3);
      --story-rail-top: rgba(92, 181, 255, 0.24);
      --story-rail-bottom: rgba(15, 34, 56, 0.92);
      --story-rail-border: rgba(92, 181, 255, 0.22);
    }
    .story-row--status-waiting-user {
      --story-selection-edge-solid: rgba(255, 221, 138, 0.94);
      --story-selection-edge-glow: rgba(214, 153, 58, 0.28);
      --story-rail-top: rgba(255, 193, 120, 0.24);
      --story-rail-bottom: rgba(52, 34, 15, 0.92);
      --story-rail-border: rgba(255, 193, 120, 0.22);
    }
    .story-row--status-blocked {
      --story-selection-edge-solid: rgba(255, 171, 171, 0.94);
      --story-selection-edge-glow: rgba(204, 86, 86, 0.28);
      --story-rail-top: rgba(255, 139, 139, 0.24);
      --story-rail-bottom: rgba(56, 18, 18, 0.92);
      --story-rail-border: rgba(255, 139, 139, 0.22);
    }
    .story-row--status-completed {
      --story-selection-edge-solid: rgba(134, 255, 202, 0.94);
      --story-selection-edge-glow: rgba(74, 191, 141, 0.28);
      --story-rail-top: rgba(114, 241, 184, 0.24);
      --story-rail-bottom: rgba(18, 46, 36, 0.92);
      --story-rail-border: rgba(114, 241, 184, 0.22);
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
      border-right: 1px solid var(--story-rail-border);
      background: linear-gradient(180deg, var(--story-rail-top), var(--story-rail-bottom));
      border-top-left-radius: 13px;
      border-bottom-left-radius: 13px;
    }
    .story-card__phase-label {
      display: inline-block;
      transform: rotate(-90deg);
      font-size: 0.7rem;
      font-weight: 800;
      letter-spacing: 0.18em;
      text-transform: uppercase;
      color: rgba(255, 255, 255, 0.92);
      line-height: 1;
      white-space: nowrap;
    }
    .story-actions {
      display: grid;
      grid-template-rows: 1fr 1fr;
      gap: 0;
      align-self: stretch;
    }
    .story-star,
    .story-menu {
      align-self: stretch;
      height: 100%;
    }
    .story-row--shell > .story-actions > .icon-action,
    .story-row--shell > .story-actions > .action-menu > .icon-action {
      width: 40px;
      min-width: 40px;
      height: 100%;
      border-radius: 0;
      background: transparent;
      position: relative;
    }
    .story-row--shell > .story-actions > .icon-action::before,
    .story-row--shell > .story-actions > .action-menu > .icon-action::before {
      content: "";
      position: absolute;
      left: -4px;
      top: 8px;
      bottom: 8px;
      width: 1px;
      background: rgba(255, 255, 255, 0.08);
    }
    .story-row--shell > .story-actions > .icon-action:first-child {
      border-top-right-radius: 14px;
    }
    .story-row--shell > .story-actions > .action-menu:last-child > .icon-action {
      border-bottom-right-radius: 14px;
    }
    .story-row--shell > .story-actions > .action-menu > .icon-action::after {
      content: "";
      position: absolute;
      left: 8px;
      right: 8px;
      top: 0;
      height: 1px;
      background: rgba(255, 255, 255, 0.08);
    }
    .story-row--shell > .story-actions > .icon-action:hover,
    .story-row--shell > .story-actions > .action-menu > .icon-action:hover {
      background: rgba(255, 255, 255, 0.04);
    }
    .story-actions .action-menu__panel {
      min-width: 220px;
      top: 8px;
      right: 46px;
      z-index: 80;
    }
    .story-star--active {
      color: #ffd75a;
      background: rgba(255, 213, 90, 0.1) !important;
    }
    .story-card__id {
      font-family: var(--specforge-mono-font-family);
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
    @media (max-width: 520px) {
      .source-toolbar {
        grid-template-columns: 1fr;
      }
      .wizard-footer {
        display: grid;
        grid-template-columns: 1fr 1fr;
      }
      .wizard-footer .ghost-action {
        width: 100%;
      }
    }
  </style>
</head>
<body>
  ${content}
  <script>
    const vscode = acquireVsCodeApi();
    const busy = ${busy ? "true" : "false"};
    const createFormResetToken = ${JSON.stringify(createFormResetToken)};
    const initialCreateState = {
      resetToken: createFormResetToken,
      intakeMode: "freeform",
      wizardStep: 0,
      title: "",
      kind: "feature",
      category: "",
      sourceText: "",
      wizard: {
        actor: "",
        objective: "",
        value: "",
        inScope: "",
        acceptanceCriteria: "",
        repoContext: "",
        outOfScope: "",
        constraints: "",
        notes: ""
      }
    };

    const wizardLabels = {
      actor: "who is affected",
      objective: "objective or change",
      acceptanceCriteria: "acceptance criteria"
    };
    let sourceReferenceSuggestions = [];
    let referenceScanTimer = undefined;
    function buildGuidedSourceText(state) {
      const lines = [
        "## Minimum Information",
        "- Actor / affected area: " + fallback(state.wizard.actor),
        "- Objective / requested change: " + fallback(state.wizard.objective),
        "- Acceptance criteria: " + fallback(state.wizard.acceptanceCriteria)
      ];

      const recommended = [];
      if (state.wizard.value.trim()) {
        recommended.push("- Why this matters: " + state.wizard.value.trim());
      }
      if (state.wizard.inScope.trim()) {
        recommended.push("- Scope / expected touchpoints: " + state.wizard.inScope.trim());
      }
      if (state.wizard.repoContext.trim()) {
        recommended.push("- Repo context or likely files: " + state.wizard.repoContext.trim());
      }
      if (state.wizard.outOfScope.trim()) {
        recommended.push("- Out of scope: " + state.wizard.outOfScope.trim());
      }
      if (state.wizard.constraints.trim()) {
        recommended.push("- Constraints / guardrails: " + state.wizard.constraints.trim());
      }
      if (state.wizard.notes.trim()) {
        recommended.push("- Extra notes: " + state.wizard.notes.trim());
      }

      if (recommended.length > 0) {
        lines.push("", "## Recommended Detail", ...recommended);
      }

      return lines.join("\\n");
    }

    function fallback(value) {
      return value.trim() ? value.trim() : "_missing_";
    }

    function getMissingWizardFields(state) {
      return Object.entries(wizardLabels)
        .filter(([key]) => !(state.wizard[key] ?? "").trim())
        .map(([, label]) => label);
    }

    const persistedCreateState = vscode.getState() ?? {};
    let createState = persistedCreateState.resetToken === createFormResetToken
      ? Object.assign({}, initialCreateState, persistedCreateState)
      : Object.assign({}, initialCreateState);
    createState.wizard = Object.assign({}, initialCreateState.wizard, createState.wizard ?? {});
    createState.resetToken = createFormResetToken;

    function persistCreateState() {
      vscode.setState(createState);
    }

    function renderSourceReferenceSuggestions() {
      const container = document.querySelector("[data-source-file-suggestions]");
      const list = document.querySelector("[data-source-file-suggestions-list]");
      const addAllButton = document.querySelector("[data-add-all-source-references]");
      if (!(container instanceof HTMLElement) || !(list instanceof HTMLElement) || !(addAllButton instanceof HTMLButtonElement)) {
        return;
      }

      container.hidden = sourceReferenceSuggestions.length === 0;
      addAllButton.hidden = sourceReferenceSuggestions.length === 0;
      addAllButton.disabled = busy || sourceReferenceSuggestions.length === 0;
      list.innerHTML = sourceReferenceSuggestions.map((file) => {
        return '<div class="source-file-suggestion">'
          + '<div class="source-file-suggestion__content">'
          + '<strong>' + escapeHtml(file.name) + '</strong>'
          + '<span>' + escapeHtml(file.workspaceRelativePath) + '</span>'
          + '</div>'
          + '<button class="ghost-action" type="button" data-add-source-reference="' + escapeHtml(file.sourcePath) + '">Add as Context</button>'
          + '</div>';
      }).join("");

      for (const button of list.querySelectorAll("[data-add-source-reference]")) {
        if (button instanceof HTMLButtonElement) {
          button.disabled = busy;
          button.addEventListener("click", () => {
            if (busy) {
              return;
            }
            vscode.postMessage({
              command: "addCreateFilePaths",
              kind: "context",
              paths: [button.dataset.addSourceReference]
            });
          });
        }
      }
    }

    function requestSourceReferenceScan() {
      if (busy) {
        return;
      }
      window.clearTimeout(referenceScanTimer);
      referenceScanTimer = window.setTimeout(() => {
        const sourceText = createState.intakeMode === "wizard"
          ? buildGuidedSourceText(createState)
          : String(createState.sourceText ?? "");
        vscode.postMessage({
          command: "scanCreateSourceReferences",
          sourceText
        });
      }, 180);
    }

    function setInputValue(field, value) {
      const element = document.querySelector('[data-create-field="' + field + '"]');
      if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) {
        element.value = value;
      }
    }

    function applyCreateState() {
      setInputValue("title", createState.title ?? "");
      setInputValue("kind", createState.kind ?? "feature");
      setInputValue("category", createState.category ?? "");
      setInputValue("sourceText", createState.sourceText ?? "");

      for (const [key, value] of Object.entries(createState.wizard)) {
        setInputValue("wizard." + key, String(value ?? ""));
      }

      for (const element of document.querySelectorAll("[data-intake-mode]")) {
        element.classList.toggle("intake-switch__option--active", element.dataset.intakeMode === createState.intakeMode);
      }
      for (const panel of document.querySelectorAll("[data-intake-panel]")) {
        panel.classList.toggle("intake-panel--active", panel.dataset.intakePanel === createState.intakeMode);
      }
      for (const panel of document.querySelectorAll("[data-wizard-step]")) {
        panel.classList.toggle("wizard-panel--active", Number(panel.dataset.wizardStep) === createState.wizardStep);
      }
      for (const trigger of document.querySelectorAll("[data-wizard-step-trigger]")) {
        trigger.classList.toggle("wizard-step--active", Number(trigger.dataset.wizardStepTrigger) === createState.wizardStep);
      }

      const preview = document.querySelector("[data-guided-source-preview]");
      if (preview) {
        preview.textContent = buildGuidedSourceText(createState);
      }

      renderSourceReferenceSuggestions();
    }

    function escapeHtml(value) {
      return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
    }

    for (const element of document.querySelectorAll("[data-command]")) {
      if (busy && element instanceof HTMLButtonElement) {
        element.disabled = true;
      }
      element.addEventListener("click", () => {
        if (busy) {
          return;
        }
        if (element.dataset.command === "removeCreateFile") {
          const label = element.getAttribute("title") ?? "Remove file";
          if (!confirm(label + "?")) {
            return;
          }
        }
        vscode.postMessage({
          command: element.dataset.command,
          usId: element.dataset.usId,
          kind: element.dataset.kind,
          sourcePath: element.dataset.sourcePath
        });
      });
    }
    const closeActionMenus = () => {
      for (const menu of document.querySelectorAll("[data-action-menu]")) {
        const toggle = menu.querySelector("[data-action-menu-toggle]");
        const panel = menu.querySelector("[data-action-menu-panel]");
        if (toggle instanceof HTMLButtonElement && panel instanceof HTMLElement) {
          panel.hidden = true;
          toggle.setAttribute("aria-expanded", "false");
        }
      }
    };
    for (const actionMenu of document.querySelectorAll("[data-action-menu]")) {
      const actionMenuToggle = actionMenu.querySelector("[data-action-menu-toggle]");
      const actionMenuPanel = actionMenu.querySelector("[data-action-menu-panel]");
      if (!(actionMenuToggle instanceof HTMLButtonElement) || !(actionMenuPanel instanceof HTMLElement)) {
        continue;
      }
      if (busy) {
        actionMenuToggle.disabled = true;
      }
      actionMenuToggle.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        const shouldOpen = actionMenuPanel.hidden;
        closeActionMenus();
        if (shouldOpen && !busy) {
          actionMenuPanel.hidden = false;
          actionMenuToggle.setAttribute("aria-expanded", "true");
        }
      });
      actionMenuPanel.addEventListener("click", () => {
        closeActionMenus();
      });
    }
    document.addEventListener("click", () => {
      closeActionMenus();
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        closeActionMenus();
      }
    });
    const form = document.getElementById("create-user-story-form");
    if (form) {
      window.addEventListener("message", (event) => {
        const message = event.data ?? {};
        if (message.command === "loadedCreateSourceFile") {
          createState.intakeMode = "freeform";
          createState.sourceText = typeof message.sourceText === "string" ? message.sourceText : "";
          if (!String(createState.title ?? "").trim() && typeof message.suggestedTitle === "string" && message.suggestedTitle.trim()) {
            createState.title = message.suggestedTitle.trim();
          }
          persistCreateState();
          applyCreateState();
          requestSourceReferenceScan();
          return;
        }

        if (message.command === "updateCreateSourceReferences") {
          sourceReferenceSuggestions = Array.isArray(message.files) ? message.files : [];
          renderSourceReferenceSuggestions();
        }
      });

      const kindField = form.querySelector('[data-create-field="kind"]');
      const categoryField = form.querySelector('[data-create-field="category"]');
      const sourceField = form.querySelector('[data-create-field="sourceText"]');
      createState.title = createState.title ?? "";
      createState.kind = createState.kind || (kindField instanceof HTMLSelectElement ? kindField.value : "feature");
      createState.category = createState.category || (categoryField instanceof HTMLSelectElement ? categoryField.value : "");
      createState.sourceText = createState.sourceText || (sourceField instanceof HTMLTextAreaElement ? sourceField.value : "");
      persistCreateState();
      for (const field of form.querySelectorAll("input, select, textarea, button")) {
        field.disabled = busy;
      }
      const dropzone = form.querySelector("[data-create-dropzone]");
      if (dropzone) {
        const setDropzoneState = (active) => {
          dropzone.classList.toggle("file-dropzone--active", active);
        };
        dropzone.addEventListener("dragenter", (event) => {
          event.preventDefault();
          if (!busy) {
            setDropzoneState(true);
          }
        });
        dropzone.addEventListener("dragover", (event) => {
          event.preventDefault();
          if (!busy) {
            setDropzoneState(true);
          }
        });
        dropzone.addEventListener("dragleave", (event) => {
          event.preventDefault();
          if (event.target === dropzone) {
            setDropzoneState(false);
          }
        });
        dropzone.addEventListener("drop", (event) => {
          event.preventDefault();
          setDropzoneState(false);
          if (busy) {
            return;
          }
          const paths = Array.from(event.dataTransfer?.files ?? [])
            .map((file) => file.path)
            .filter((filePath) => typeof filePath === "string" && filePath.length > 0);
          if (paths.length === 0) {
            return;
          }
          vscode.postMessage({
            command: "addCreateFilePaths",
            kind: dropzone.dataset.kind,
            paths
          });
        });
      }
      for (const element of form.querySelectorAll("[data-create-field]")) {
        const field = element.dataset.createField;
        if (!field) {
          continue;
        }
        element.addEventListener("input", () => {
          if (field.startsWith("wizard.")) {
            createState.wizard[field.slice("wizard.".length)] = element.value;
          } else {
            createState[field] = element.value;
          }
          persistCreateState();
          applyCreateState();
          requestSourceReferenceScan();
        });
        element.addEventListener("change", () => {
          if (field.startsWith("wizard.")) {
            createState.wizard[field.slice("wizard.".length)] = element.value;
          } else {
            createState[field] = element.value;
          }
          persistCreateState();
          applyCreateState();
          requestSourceReferenceScan();
        });
      }
      for (const element of form.querySelectorAll("[data-intake-mode]")) {
        element.addEventListener("click", () => {
          createState.intakeMode = element.dataset.intakeMode === "wizard" ? "wizard" : "freeform";
          persistCreateState();
          applyCreateState();
          requestSourceReferenceScan();
        });
      }
      for (const element of form.querySelectorAll("[data-wizard-nav]")) {
        element.addEventListener("click", () => {
          const offset = Number(element.dataset.wizardNav ?? "0");
          createState.wizardStep = Math.min(2, Math.max(0, createState.wizardStep + offset));
          persistCreateState();
          applyCreateState();
        });
      }
      for (const element of form.querySelectorAll("[data-wizard-step-trigger]")) {
        element.addEventListener("click", () => {
          createState.wizardStep = Math.min(2, Math.max(0, Number(element.dataset.wizardStepTrigger ?? "0")));
          persistCreateState();
          applyCreateState();
        });
      }
      const addAllReferencesButton = form.querySelector("[data-add-all-source-references]");
      if (addAllReferencesButton instanceof HTMLButtonElement) {
        addAllReferencesButton.addEventListener("click", () => {
          if (busy || sourceReferenceSuggestions.length === 0) {
            return;
          }
          vscode.postMessage({
            command: "addCreateFilePaths",
            kind: "context",
            paths: sourceReferenceSuggestions.map((file) => file.sourcePath)
          });
        });
      }
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        if (busy) {
          return;
        }
        const data = new FormData(form);
        const intakeMode = createState.intakeMode === "wizard" ? "wizard" : "freeform";
        if (intakeMode === "wizard") {
          const missingFields = getMissingWizardFields(createState);
          if (missingFields.length > 0) {
            alert("The guided wizard still needs " + missingFields.join(", ") + ".");
            return;
          }
        }
        vscode.postMessage({
          command: "submitCreateForm",
          title: String(data.get("title") ?? createState.title ?? ""),
          kind: String(data.get("kind") ?? createState.kind ?? "feature"),
          category: String(data.get("category") ?? createState.category ?? ""),
          intakeMode,
          sourceText: intakeMode === "wizard"
            ? buildGuidedSourceText(createState)
            : String(data.get("sourceText") ?? createState.sourceText ?? ""),
          wizardDraft: createState.wizard
        });
      });
      applyCreateState();
      requestSourceReferenceScan();
    }

  </script>
</body>
</html>`;
}

function groupStories(items: readonly UserStorySummary[]) {
  const grouped = new Map<string, UserStorySummary[]>();
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

function sortStoriesByPhase(items: readonly UserStorySummary[]): UserStorySummary[] {
  return [...items].sort((left, right) => {
    const phaseDelta = phaseSortOrder(left.currentPhase) - phaseSortOrder(right.currentPhase);
    if (phaseDelta !== 0) {
      return phaseDelta;
    }

    return left.usId.localeCompare(right.usId);
  });
}

function buildStoryRowMarkup(summary: UserStorySummary, starredUserStoryId: string | null, activeWorkflowUsId: string | null): string {
  const isActiveWorkflow = activeWorkflowUsId === summary.usId;
  const statusTone = phaseRailStatus(summary.status);
  const displayTitle = buildStoryDisplayTitle(summary);
  return `
    <div class="story-row story-row--shell story-row--status-${escapeHtmlAttr(statusTone)}${isActiveWorkflow ? " story-row--selected" : ""}">
      <button class="story-card${shouldRenderPhaseRail(summary.status) ? ` story-card--active story-card--phase-${escapeHtmlAttr(summary.currentPhase)} story-card--status-${escapeHtmlAttr(phaseRailStatus(summary.status))}` : ""}" data-command="openWorkflow" data-us-id="${escapeHtmlAttr(summary.usId)}">
        ${shouldRenderPhaseRail(summary.status)
          ? `
            <span class="story-card__phase-rail" aria-hidden="true">
              <span class="story-card__phase-label">${phaseLabelFor(summary.currentPhase)}</span>
            </span>
          `
          : ""}
        <span class="story-card__content">
          <span class="story-card__id">${escapeHtml(summary.usId)}</span>
          <strong>${escapeHtml(displayTitle)}</strong>
          <span class="story-card__meta">${escapeHtml(summary.currentPhase)} · ${escapeHtml(summary.status)}</span>
        </span>
      </button>
      <div class="story-actions">
        <button
          class="icon-action story-star${starredUserStoryId === summary.usId ? " story-star--active" : ""}"
          data-command="toggleStarredUserStory"
          data-us-id="${escapeHtmlAttr(summary.usId)}"
          title="${escapeHtmlAttr(starredUserStoryId === summary.usId ? `Unstar ${summary.usId}` : `Star ${summary.usId}`)}"
          aria-label="${escapeHtmlAttr(starredUserStoryId === summary.usId ? `Unstar ${summary.usId}` : `Star ${summary.usId}`)}">
          <span aria-hidden="true">${starredUserStoryId === summary.usId ? "★" : "☆"}</span>
        </button>
        <div class="action-menu story-menu" data-action-menu>
          <button
            class="icon-action"
            type="button"
            data-action-menu-toggle
            title="User story actions"
            aria-label="User story actions for ${escapeHtmlAttr(summary.usId)}"
            aria-haspopup="menu"
            aria-expanded="false">
            <span aria-hidden="true">☰</span>
          </button>
          <div class="action-menu__panel" data-action-menu-panel role="menu" hidden>
            <button class="action-menu__item" type="button" role="menuitem" disabled>
              <span class="action-menu__item-icon" aria-hidden="true">✎</span>
              <span>Edit US info</span>
            </button>
            <button class="action-menu__item" type="button" data-command="analyzeRepairUserStory" data-us-id="${escapeHtmlAttr(summary.usId)}" role="menuitem">
              <span class="action-menu__item-icon" aria-hidden="true">⌕</span>
              <span>Analyze / Repair</span>
            </button>
            <button class="action-menu__item action-menu__item--danger" type="button" data-command="deleteUserStory" data-us-id="${escapeHtmlAttr(summary.usId)}" role="menuitem">
              <span class="action-menu__item-icon" aria-hidden="true">🗑</span>
              <span>Delete</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  `;
}

function buildStoryDisplayTitle(summary: UserStorySummary): string {
  const normalizedTitle = summary.title.trim();
  if (!normalizedTitle) {
    return summary.usId;
  }

  return normalizedTitle.startsWith(`${summary.usId} `) || normalizedTitle.startsWith(`${summary.usId}·`)
    || normalizedTitle.startsWith(`${summary.usId}-`) || normalizedTitle.startsWith(`${summary.usId}:`)
    ? normalizedTitle.slice(summary.usId.length).trimStart().replace(/^[·\-:]\s*/, "")
    : normalizedTitle;
}

function phaseLabelFor(currentPhase: string): string {
  const phaseLabels: Record<string, string> = {
    "capture": "CAP",
    "refinement": "CLAR",
    "spec": "SPEC",
    "technical-design": "TECH",
    "implementation": "IMP",
    "review": "REV",
    "release-approval": "REL",
    "pr-preparation": "PR"
  };

  return phaseLabels[currentPhase] ?? "?";
}

function shouldRenderPhaseRail(status: string): boolean {
  return status !== "completed" && status !== "superseded" && status !== "abandoned";
}

function phaseRailStatus(status: string): string {
  switch (status) {
    case "waiting-user":
    case "needs-user-input":
      return "waiting-user";
    case "paused":
    case "stopped":
    case "stopping":
      return "paused";
    case "superseded":
    case "abandoned":
      return "pending";
    case "pending":
    case "not-started":
    case "idle":
      return "pending";
    case "failed":
    case "error":
    case "errored":
    case "invalid":
      return "blocked";
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

function phaseSortOrder(phaseId: string): number {
  const order: Record<string, number> = {
    "capture": 0,
    "refinement": 1,
    "spec": 2,
    "technical-design": 3,
    "implementation": 4,
    "review": 5,
    "release-approval": 6,
    "pr-preparation": 7
  };

  return order[phaseId] ?? Number.MAX_SAFE_INTEGER;
}
