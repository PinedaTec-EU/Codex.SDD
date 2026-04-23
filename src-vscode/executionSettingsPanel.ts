import * as vscode from "vscode";
import {
  getSpecForgeSettings,
  type SpecForgeModelProfile,
  type SpecForgePhaseModelAssignments
} from "./extensionSettings";

type ExecutionSettingsMessage =
  | { readonly command: "saveExecutionSettings"; readonly modelProfiles?: readonly Partial<SpecForgeModelProfile>[]; readonly phaseModelAssignments?: Partial<SpecForgePhaseModelAssignments>; }
  | { readonly command: "openRawSettings"; };

let currentPanel: ExecutionSettingsPanelController | null = null;

export async function openExecutionSettingsPanelAsync(
  extensionUri: vscode.Uri,
  onDidSave: () => Promise<void>
): Promise<void> {
  if (currentPanel) {
    currentPanel.reveal();
    await currentPanel.refreshAsync();
    return;
  }

  currentPanel = new ExecutionSettingsPanelController(extensionUri, onDidSave, () => {
    currentPanel = null;
  });
  currentPanel.reveal();
  await currentPanel.refreshAsync();
}

class ExecutionSettingsPanelController {
  private readonly panel: vscode.WebviewPanel;

  public constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly onDidSave: () => Promise<void>,
    private readonly onDidDisposePanel: () => void
  ) {
    this.panel = vscode.window.createWebviewPanel(
      "specForge.executionSettings",
      "SpecForge Execution Settings",
      vscode.ViewColumn.Active,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [extensionUri]
      }
    );

    this.panel.onDidDispose(() => {
      this.onDidDisposePanel();
    });

    this.panel.webview.onDidReceiveMessage(async (message: ExecutionSettingsMessage) => {
      switch (message.command) {
        case "openRawSettings":
          await vscode.commands.executeCommand("workbench.action.openSettings", "@ext:local.specforge-ai specForge");
          return;
        case "saveExecutionSettings":
          await saveExecutionSettingsAsync(message.modelProfiles ?? [], message.phaseModelAssignments ?? {});
          await this.onDidSave();
          await this.refreshAsync();
          return;
      }
    });
  }

  public reveal(): void {
    this.panel.reveal(vscode.ViewColumn.Active);
  }

  public async refreshAsync(): Promise<void> {
    const settings = getSpecForgeSettings();
    this.panel.webview.html = buildExecutionSettingsHtml({
      modelProfiles: settings.modelProfiles,
      phaseModelAssignments: settings.phaseModelAssignments
    });
  }
}

type ExecutionSettingsViewModel = {
  readonly modelProfiles: readonly SpecForgeModelProfile[];
  readonly phaseModelAssignments: SpecForgePhaseModelAssignments;
};

const executionPhases: ReadonlyArray<{ key: keyof SpecForgePhaseModelAssignments; label: string; }> = [
  { key: "defaultProfile", label: "Default / fallback" },
  { key: "captureProfile", label: "Capture" },
  { key: "clarificationProfile", label: "Clarification" },
  { key: "refinementProfile", label: "Refinement" },
  { key: "technicalDesignProfile", label: "Technical Design" },
  { key: "implementationProfile", label: "Implementation" },
  { key: "reviewProfile", label: "Review" },
  { key: "releaseApprovalProfile", label: "Release Approval" },
  { key: "prPreparationProfile", label: "PR Preparation" }
];

export function buildExecutionSettingsHtml(model: ExecutionSettingsViewModel): string {
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
      padding: 24px;
      background:
        radial-gradient(120% 90% at 12% -8%, rgba(114, 241, 184, 0.08), transparent 42%),
        radial-gradient(120% 90% at 88% 108%, rgba(92, 181, 255, 0.08), transparent 40%),
        linear-gradient(180deg, rgba(8, 14, 20, 0.985), rgba(10, 15, 21, 1));
      color: var(--vscode-editor-foreground);
      min-height: 100vh;
    }
    .shell {
      max-width: 1080px;
      margin: 0 auto;
      display: grid;
      gap: 18px;
    }
    .hero, .panel {
      border: 1px solid rgba(114, 241, 184, 0.12);
      border-radius: 22px;
      background: rgba(14, 20, 26, 0.92);
      box-shadow: 0 18px 36px rgba(0, 0, 0, 0.24);
    }
    .hero {
      padding: 24px;
      display: grid;
      gap: 10px;
    }
    .eyebrow {
      margin: 0;
      text-transform: uppercase;
      letter-spacing: 0.16em;
      font-size: 0.72rem;
      color: #72f1b8;
    }
    h1, h2, h3, p { margin: 0; }
    h1 { font-size: 2rem; line-height: 1.02; }
    h2 { font-size: 1.12rem; }
    .copy {
      color: rgba(255, 255, 255, 0.76);
      line-height: 1.55;
      max-width: 76ch;
    }
    .actions {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
    }
    .primary-action, .ghost-action, .secondary-action, .danger-action {
      border-radius: 14px;
      border: 1px solid rgba(114, 241, 184, 0.18);
      cursor: pointer;
      font: inherit;
    }
    .primary-action {
      padding: 12px 16px;
      background: linear-gradient(180deg, rgba(114, 241, 184, 0.24), rgba(16, 36, 28, 0.96));
      color: #f3fff9;
      font-weight: 700;
    }
    .ghost-action, .secondary-action {
      padding: 10px 14px;
      background: rgba(255, 255, 255, 0.04);
      color: inherit;
    }
    .danger-action {
      width: 38px;
      height: 38px;
      padding: 0;
      display: inline-grid;
      place-items: center;
      background: rgba(255, 255, 255, 0.04);
      color: #ffb0b0;
      border-color: rgba(255, 139, 139, 0.18);
    }
    .panel {
      padding: 18px;
      display: grid;
      gap: 14px;
    }
    .section-header {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      align-items: flex-start;
      flex-wrap: wrap;
    }
    form, .profiles, .phase-grid, .profile-grid {
      display: grid;
      gap: 12px;
    }
    .profiles, .phase-grid {
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    }
    .profile-card {
      grid-column: 1 / -1;
      padding: 14px;
      border-radius: 18px;
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid rgba(255, 255, 255, 0.06);
      display: grid;
      gap: 12px;
    }
    .profile-card__header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 10px;
    }
    .profile-grid {
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    }
    label {
      display: grid;
      gap: 6px;
    }
    label span {
      font-size: 0.82rem;
      color: rgba(255, 255, 255, 0.78);
    }
    input, select {
      width: 100%;
      border-radius: 12px;
      border: 1px solid rgba(255, 255, 255, 0.08);
      background: rgba(255, 255, 255, 0.04);
      color: inherit;
      padding: 10px 12px;
      font: inherit;
    }
    .hidden-field {
      display: none;
    }
    .phase-field {
      padding: 12px;
      border-radius: 16px;
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid rgba(255, 255, 255, 0.06);
    }
    .phase-field--invalid {
      border-color: rgba(255, 139, 139, 0.42);
      background: rgba(88, 28, 28, 0.22);
      box-shadow: inset 0 0 0 1px rgba(255, 139, 139, 0.14);
    }
    .phase-field__hint {
      font-size: 0.76rem;
      color: rgba(255, 176, 176, 0.9);
      line-height: 1.4;
      display: none;
    }
    .phase-field--invalid .phase-field__hint {
      display: block;
    }
    .warning-banner {
      display: none;
      gap: 8px;
      padding: 14px 16px;
      border-radius: 16px;
      border: 1px solid rgba(255, 139, 139, 0.32);
      background: linear-gradient(180deg, rgba(70, 20, 20, 0.96), rgba(42, 16, 16, 0.98));
      color: #ffd9d9;
    }
    .warning-banner--visible {
      display: grid;
    }
    .empty {
      padding: 14px;
      border-radius: 16px;
      background: rgba(255, 255, 255, 0.03);
      border: 1px dashed rgba(255, 255, 255, 0.08);
      color: rgba(255, 255, 255, 0.7);
    }
    code {
      font-family: ui-monospace, "SF Mono", Menlo, monospace;
    }
    @media (max-width: 720px) {
      body { padding: 16px; }
      .hero, .panel { padding: 16px; }
    }
  </style>
</head>
<body>
  <div class="shell">
    <section class="hero">
      <p class="eyebrow">Execution Setup</p>
      <h1>Providers and phase routing</h1>
      <p class="copy">Define named executor profiles once, then assign the right one to each workflow phase. Native <code>codex</code> only needs repository access. Bridge-based providers still use endpoint settings.</p>
      <div class="actions">
        <button class="ghost-action" type="button" data-command="openRawSettings">Open Raw VS Code Settings</button>
      </div>
    </section>
    <form id="execution-settings-form" class="panel">
      <div class="section-header">
        <div>
          <p class="eyebrow">Provider Profiles</p>
          <h2>Execution catalog</h2>
        </div>
        <button class="secondary-action" type="button" data-add-profile>Add Profile</button>
      </div>
      <div class="profiles" data-profiles></div>
      <div class="section-header">
        <div>
          <p class="eyebrow">Phase Routing</p>
          <h2>Per-phase selection</h2>
        </div>
      </div>
      <div class="warning-banner" data-default-warning>
        <strong>Default / fallback missing</strong>
        <span>With multiple profiles, define a fallback profile or keep a single-profile setup.</span>
      </div>
      <div class="phase-grid" data-phase-grid>
        ${executionPhases.map((phase) => `
          <label class="phase-field" data-phase-wrapper="${escapeHtmlAttr(String(phase.key))}">
            <span>${escapeHtml(phase.label)}</span>
            <select data-phase-field="${escapeHtmlAttr(String(phase.key))}"></select>
            ${phase.key === "defaultProfile"
              ? '<span class="phase-field__hint">Required when you have multiple profiles and no single implicit fallback.</span>'
              : ""}
          </label>
        `).join("")}
      </div>
      <div class="actions">
        <button class="primary-action" type="submit">Save Execution Settings</button>
      </div>
    </form>
  </div>
  <script>
    const vscode = acquireVsCodeApi();
    const executionPhases = ${JSON.stringify(executionPhases)};
    let state = {
      modelProfiles: ${JSON.stringify(model.modelProfiles)},
      phaseModelAssignments: ${JSON.stringify(model.phaseModelAssignments)}
    };

    function escapeHtml(value) {
      return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
    }

    function providerOptions(selectedProvider) {
      return ["codex", "copilot", "claude", "openai-compatible"]
        .map((provider) => '<option value="' + provider + '"' + (provider === selectedProvider ? " selected" : "") + '>' + escapeHtml(provider) + '</option>')
        .join("");
    }

    function repositoryAccessOptions(selectedValue) {
      return ["none", "read", "read-write"]
        .map((value) => '<option value="' + value + '"' + (value === selectedValue ? " selected" : "") + '>' + escapeHtml(value) + '</option>')
        .join("");
    }

    function phaseOptions(selectedValue) {
      const options = ['<option value="">Use default</option>'];
      for (const profile of state.modelProfiles) {
        options.push('<option value="' + escapeHtml(profile.name || "") + '"' + ((profile.name || "") === selectedValue ? " selected" : "") + '>' + escapeHtml(profile.name || "") + '</option>');
      }
      return options.join("");
    }

    function hasFallbackProblem() {
      const nonEmptyProfiles = state.modelProfiles.filter((profile) => String(profile.name || "").trim().length > 0);
      return nonEmptyProfiles.length > 1 && !String(state.phaseModelAssignments.defaultProfile || "").trim();
    }

    function render() {
      const profilesHost = document.querySelector("[data-profiles]");
      const phaseGrid = document.querySelector("[data-phase-grid]");
      const warning = document.querySelector("[data-default-warning]");
      const saveButton = document.querySelector('button[type="submit"]');
      if (!(profilesHost instanceof HTMLElement) || !(phaseGrid instanceof HTMLElement)) {
        return;
      }

      if (state.modelProfiles.length === 0) {
        profilesHost.innerHTML = '<div class="empty">No provider profiles configured yet.</div>';
      } else {
        profilesHost.innerHTML = state.modelProfiles.map((profile, index) => {
          const showEndpointFields = profile.provider !== "codex";
          return '<section class="profile-card" data-profile-index="' + index + '">'
            + '<div class="profile-card__header">'
            + '<strong>' + escapeHtml(profile.name || ('Profile ' + (index + 1))) + '</strong>'
            + '<button class="danger-action" type="button" data-remove-profile="' + index + '" title="Remove profile ' + (index + 1) + '" aria-label="Remove profile ' + (index + 1) + '">×</button>'
            + '</div>'
            + '<div class="profile-grid">'
            + fieldMarkup("Name", '<input type="text" data-profile-field="name" value="' + escapeHtml(profile.name || "") + '" placeholder="codex-main" />')
            + fieldMarkup("Provider", '<select data-profile-field="provider">' + providerOptions(profile.provider || "openai-compatible") + '</select>')
            + fieldMarkup("Repository Access", '<select data-profile-field="repositoryAccess">' + repositoryAccessOptions(profile.repositoryAccess || "none") + '</select>')
            + fieldMarkup("Base URL", '<input type="text" data-profile-field="baseUrl" value="' + escapeHtml(profile.baseUrl || "") + '" placeholder="https://api.example.test/v1" />', !showEndpointFields)
            + fieldMarkup("API Key", '<input type="password" data-profile-field="apiKey" value="' + escapeHtml(profile.apiKey || "") + '" placeholder="secret" />', !showEndpointFields)
            + fieldMarkup("Model", '<input type="text" data-profile-field="model" value="' + escapeHtml(profile.model || "") + '" placeholder="' + escapeHtml(profile.provider === "openai-compatible" ? "gpt-5.4" : "provider-model") + '" />', !showEndpointFields)
            + '</div>'
            + '</section>';
        }).join("");
      }

      for (const select of phaseGrid.querySelectorAll("[data-phase-field]")) {
        if (!(select instanceof HTMLSelectElement) || !select.dataset.phaseField) {
          continue;
        }
        const value = state.phaseModelAssignments[select.dataset.phaseField] || "";
        select.innerHTML = phaseOptions(value);
        select.value = value;
        select.addEventListener("change", () => {
          state.phaseModelAssignments[select.dataset.phaseField] = select.value;
        });
      }

      const fallbackProblem = hasFallbackProblem();
      if (warning instanceof HTMLElement) {
        warning.classList.toggle("warning-banner--visible", fallbackProblem);
      }
      const defaultWrapper = document.querySelector('[data-phase-wrapper="defaultProfile"]');
      if (defaultWrapper instanceof HTMLElement) {
        defaultWrapper.classList.toggle("phase-field--invalid", fallbackProblem);
      }
      if (saveButton instanceof HTMLButtonElement) {
        saveButton.disabled = fallbackProblem;
        saveButton.title = fallbackProblem
          ? "Define the default fallback profile before saving."
          : "";
      }

      for (const button of profilesHost.querySelectorAll("[data-remove-profile]")) {
        if (!(button instanceof HTMLButtonElement)) {
          continue;
        }
        button.addEventListener("click", () => {
          const index = Number(button.dataset.removeProfile ?? "-1");
          if (index < 0) {
            return;
          }
          state.modelProfiles.splice(index, 1);
          pruneMissingAssignments();
          render();
        });
      }

      for (const card of profilesHost.querySelectorAll("[data-profile-index]")) {
        for (const input of card.querySelectorAll("[data-profile-field]")) {
          if (!(input instanceof HTMLInputElement || input instanceof HTMLSelectElement)) {
            continue;
          }
          input.addEventListener("input", syncFromDomSilently);
          input.addEventListener("change", syncFromDom);
        }
      }
    }

    function fieldMarkup(label, controlMarkup, hidden) {
      return '<label class="' + (hidden ? 'hidden-field' : '') + '"><span>' + escapeHtml(label) + '</span>' + controlMarkup + '</label>';
    }

    function syncFromDom() {
      const nextProfiles = [];
      for (const card of document.querySelectorAll("[data-profile-index]")) {
        nextProfiles.push({
          name: readProfileField(card, "name"),
          provider: readProfileField(card, "provider") || "openai-compatible",
          baseUrl: readProfileField(card, "baseUrl"),
          apiKey: readProfileField(card, "apiKey"),
          model: readProfileField(card, "model"),
          repositoryAccess: readProfileField(card, "repositoryAccess") || "none"
        });
      }
      state.modelProfiles = nextProfiles;
      pruneMissingAssignments();
      render();
    }

    function syncFromDomSilently() {
      const nextProfiles = [];
      for (const card of document.querySelectorAll("[data-profile-index]")) {
        nextProfiles.push({
          name: readProfileField(card, "name"),
          provider: readProfileField(card, "provider") || "openai-compatible",
          baseUrl: readProfileField(card, "baseUrl"),
          apiKey: readProfileField(card, "apiKey"),
          model: readProfileField(card, "model"),
          repositoryAccess: readProfileField(card, "repositoryAccess") || "none"
        });
      }
      state.modelProfiles = nextProfiles;
      pruneMissingAssignments();
    }

    function pruneMissingAssignments() {
      const names = new Set(state.modelProfiles.map((profile) => profile.name).filter(Boolean));
      for (const phase of executionPhases) {
        const current = state.phaseModelAssignments[phase.key];
        if (current && !names.has(current)) {
          state.phaseModelAssignments[phase.key] = "";
        }
      }
    }

    function readProfileField(card, field) {
      const input = card.querySelector('[data-profile-field="' + field + '"]');
      return input instanceof HTMLInputElement || input instanceof HTMLSelectElement
        ? input.value
        : "";
    }

    document.querySelector("[data-command='openRawSettings']")?.addEventListener("click", () => {
      vscode.postMessage({ command: "openRawSettings" });
    });

    document.querySelector("[data-add-profile]")?.addEventListener("click", () => {
      state.modelProfiles.push({
        name: "",
        provider: "codex",
        baseUrl: "",
        apiKey: "",
        model: "",
        repositoryAccess: "none"
      });
      render();
    });

    document.getElementById("execution-settings-form")?.addEventListener("submit", (event) => {
      event.preventDefault();
      syncFromDom();
      if (hasFallbackProblem()) {
        return;
      }
      vscode.postMessage({
        command: "saveExecutionSettings",
        modelProfiles: state.modelProfiles,
        phaseModelAssignments: state.phaseModelAssignments
      });
    });

    render();
  </script>
</body>
</html>`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function escapeHtmlAttr(value: string): string {
  return escapeHtml(value)
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

async function saveExecutionSettingsAsync(
  modelProfiles: readonly Partial<SpecForgeModelProfile>[],
  phaseModelAssignments: Partial<SpecForgePhaseModelAssignments>
): Promise<void> {
  const configuration = vscode.workspace.getConfiguration("specForge");
  const normalizedProfiles = modelProfiles
    .map((profile) => ({
      name: typeof profile.name === "string" ? profile.name.trim() : "",
      provider: typeof profile.provider === "string" ? profile.provider.trim() : "openai-compatible",
      baseUrl: typeof profile.baseUrl === "string" ? profile.baseUrl.trim() : "",
      apiKey: typeof profile.apiKey === "string" ? profile.apiKey.trim() : "",
      model: typeof profile.model === "string" ? profile.model.trim() : "",
      repositoryAccess: typeof profile.repositoryAccess === "string" ? profile.repositoryAccess.trim() : "none"
    }))
    .filter((profile) =>
      profile.name.length > 0
      || profile.baseUrl.length > 0
      || profile.apiKey.length > 0
      || profile.model.length > 0
      || profile.provider !== "openai-compatible"
      || profile.repositoryAccess !== "none");

  const normalizedAssignments: SpecForgePhaseModelAssignments = {
    defaultProfile: normalizeOptionalAssignment(phaseModelAssignments.defaultProfile),
    captureProfile: normalizeOptionalAssignment(phaseModelAssignments.captureProfile),
    clarificationProfile: normalizeOptionalAssignment(phaseModelAssignments.clarificationProfile),
    refinementProfile: normalizeOptionalAssignment(phaseModelAssignments.refinementProfile),
    technicalDesignProfile: normalizeOptionalAssignment(phaseModelAssignments.technicalDesignProfile),
    implementationProfile: normalizeOptionalAssignment(phaseModelAssignments.implementationProfile),
    reviewProfile: normalizeOptionalAssignment(phaseModelAssignments.reviewProfile),
    releaseApprovalProfile: normalizeOptionalAssignment(phaseModelAssignments.releaseApprovalProfile),
    prPreparationProfile: normalizeOptionalAssignment(phaseModelAssignments.prPreparationProfile)
  };

  await configuration.update("execution.modelProfiles", normalizedProfiles, vscode.ConfigurationTarget.Workspace);
  await configuration.update("execution.phaseModels", normalizedAssignments, vscode.ConfigurationTarget.Workspace);
}

function normalizeOptionalAssignment(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}
