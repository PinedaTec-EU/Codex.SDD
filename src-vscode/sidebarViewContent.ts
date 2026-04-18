import type { UserStorySummary } from "./backendClient";

export interface SidebarViewModel {
  readonly hasWorkspace: boolean;
  readonly showCreateForm: boolean;
  readonly promptsInitialized: boolean;
  readonly categories: readonly string[];
  readonly userStories: readonly UserStorySummary[];
}

export function buildSidebarHtml(model: SidebarViewModel): string {
  if (!model.hasWorkspace) {
    return wrapHtml(`
      <section class="empty-state">
        <p class="eyebrow">SpecForge.AI</p>
        <h1>Open a workspace to start.</h1>
        <p class="copy">The sidebar needs a workspace folder to persist user stories under <code>.specs/</code>.</p>
      </section>
    `);
  }

  if (model.userStories.length === 0 && !model.showCreateForm) {
    return wrapHtml(`
      <section class="empty-state hero">
        <div class="hero-header">
          <div>
            <p class="eyebrow">SpecForge.AI</p>
            <h1>Create your first user story</h1>
          </div>
          ${buildPromptActionButton(model.promptsInitialized)}
        </div>
        <p class="copy">No faded text-buttons, no scattered prompts. Start here and the sidebar opens the full intake form in place.</p>
        <button class="primary-action" data-command="showCreateForm">Create User Story</button>
      </section>
    `);
  }

  const storyGroups = groupStories(model.userStories);
  const storiesMarkup = storyGroups.map((group) => `
    <section class="story-group">
      <div class="group-header">${escapeHtml(group.category)}</div>
      ${group.items.map((summary) => `
        <button class="story-card" data-command="openWorkflow" data-us-id="${escapeHtmlAttr(summary.usId)}">
          <span class="story-card__id">${escapeHtml(summary.usId)}</span>
          <strong>${escapeHtml(summary.title)}</strong>
          <span class="story-card__meta">${escapeHtml(summary.currentPhase)} · ${escapeHtml(summary.status)}</span>
        </button>
      `).join("")}
    </section>
  `).join("");

  const formMarkup = model.showCreateForm
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
          <button class="primary-action" type="submit">Create User Story</button>
        </form>
      </section>
    `
    : `
      <section class="action-card">
        <div class="section-header">
          <div>
            <p class="eyebrow">SpecForge.AI</p>
            <h2>Start another user story</h2>
          </div>
        </div>
        <p class="copy">Keep the backlog focused on active work and open a new workflow intake directly from the sidebar.</p>
        <button class="primary-action" data-command="showCreateForm">Create User Story</button>
      </section>
    `;

  return wrapHtml(`
    ${formMarkup}
    <section class="story-list">
      <div class="section-header">
        <div>
          <p class="eyebrow">User Stories</p>
          <h2>Workflow backlog</h2>
        </div>
        ${buildPromptActionButton(model.promptsInitialized)}
      </div>
      ${storiesMarkup}
    </section>
  `);
}

function buildPromptActionButton(promptsInitialized: boolean): string {
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

function wrapHtml(content: string): string {
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
    .primary-action, .ghost-action, .story-card, .icon-action {
      width: 100%;
      border-radius: 14px;
      border: 1px solid rgba(114, 241, 184, 0.18);
      cursor: pointer;
    }
    .primary-action {
      padding: 14px 16px;
      background: linear-gradient(180deg, rgba(114, 241, 184, 0.24), rgba(16, 36, 28, 0.96));
      color: #f3fff9;
      font-weight: 700;
      font-size: 0.96rem;
      box-shadow: 0 10px 24px rgba(0, 0, 0, 0.18);
    }
    .ghost-action {
      padding: 10px 12px;
      background: rgba(255, 255, 255, 0.04);
      color: inherit;
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
    .story-list {
      margin-top: 14px;
    }
    .story-group + .story-group {
      margin-top: 14px;
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
      padding: 12px 14px;
      background: rgba(255, 255, 255, 0.03);
      color: inherit;
      display: grid;
      gap: 4px;
    }
    .story-card + .story-card {
      margin-top: 8px;
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
  </style>
</head>
<body>
  ${content}
  <script>
    const vscode = acquireVsCodeApi();
    for (const element of document.querySelectorAll("[data-command]")) {
      element.addEventListener("click", () => {
        vscode.postMessage({
          command: element.dataset.command,
          usId: element.dataset.usId
        });
      });
    }
    const form = document.getElementById("create-user-story-form");
    if (form) {
      form.addEventListener("submit", (event) => {
        event.preventDefault();
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

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeHtmlAttr(value: string): string {
  return escapeHtml(value);
}
