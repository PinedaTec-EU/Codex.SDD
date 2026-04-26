import * as vscode from "vscode";
import { escapeHtml, escapeHtmlAttr } from "./htmlEscape";
import { requiresDefaultFallback, validatePhasePermissionAssignments } from "./executionSettingsModel";
import {
  getSpecForgeSettings,
  type SpecForgeModelProfile,
  type SpecForgePhaseModelAssignments
} from "./extensionSettings";
import { buildWebviewTypographyRootCss, getEditorTypographyCssVars } from "./webviewTypography";

type ExecutionSettingsMessage =
  | {
      readonly command: "saveExecutionSettings";
      readonly modelProfiles?: readonly Partial<SpecForgeModelProfile>[];
      readonly phaseModelAssignments?: Partial<SpecForgePhaseModelAssignments>;
      readonly autoClarificationAnswersEnabled?: boolean;
      readonly autoClarificationAnswersProfile?: string | null;
      readonly autoReviewEnabled?: boolean;
      readonly maxImplementationReviewCycles?: number | null;
    }
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
          try {
            await saveExecutionSettingsAsync(
              message.modelProfiles ?? [],
              message.phaseModelAssignments ?? {},
              message.autoClarificationAnswersEnabled ?? false,
              message.autoClarificationAnswersProfile,
              message.autoReviewEnabled ?? false,
              message.maxImplementationReviewCycles ?? null);
            await this.onDidSave();
            await this.refreshAsync();
          } catch (error) {
            const messageText = error instanceof Error ? error.message : String(error);
            void vscode.window.showErrorMessage(messageText);
          }
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
      phaseModelAssignments: settings.phaseModelAssignments,
      autoClarificationAnswersEnabled: settings.autoClarificationAnswersEnabled,
      autoClarificationAnswersProfile: settings.autoClarificationAnswersProfile,
      autoReviewEnabled: settings.autoReviewEnabled,
      maxImplementationReviewCycles: settings.maxImplementationReviewCycles,
      typographyCssVars: getEditorTypographyCssVars()
    });
  }
}

type ExecutionSettingsViewModel = {
  readonly modelProfiles: readonly SpecForgeModelProfile[];
  readonly phaseModelAssignments: SpecForgePhaseModelAssignments;
  readonly autoClarificationAnswersEnabled: boolean;
  readonly autoClarificationAnswersProfile: string | null;
  readonly autoReviewEnabled: boolean;
  readonly maxImplementationReviewCycles: number | null;
  readonly typographyCssVars?: string;
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
  const permissionIssues = validatePhasePermissionAssignments(model.modelProfiles, model.phaseModelAssignments);
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>
    :root {
      ${buildWebviewTypographyRootCss(model.typographyCssVars ?? "")}
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
    .save-error {
      font-size: 0.76rem;
      color: rgba(255, 176, 176, 0.92);
      line-height: 1.45;
      display: none;
    }
    .save-error--visible {
      display: block;
    }
    .empty {
      padding: 14px;
      border-radius: 16px;
      background: rgba(255, 255, 255, 0.03);
      border: 1px dashed rgba(255, 255, 255, 0.08);
      color: rgba(255, 255, 255, 0.7);
    }
    code {
      font-family: var(--specforge-mono-font-family);
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
      <p class="copy">Define named executor profiles once, then assign the right one to each workflow phase. Native CLI providers only need repository access. OpenAI-compatible bridge profiles still use endpoint settings.</p>
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
              : '<span class="phase-field__hint"></span>'}
          </label>
        `).join("")}
      </div>
      <div class="section-header">
        <div>
          <p class="eyebrow">Clarification Automation</p>
          <h2>Model-assisted answers</h2>
          <p class="copy">When clarification blocks refinement, let a selected model try to answer the pending questions once before handing the phase back to the user.</p>
        </div>
      </div>
      <div class="phase-grid">
        <label class="phase-field">
          <span>Enable auto answers</span>
          <select data-auto-clarification-enabled>
            <option value="false"${model.autoClarificationAnswersEnabled ? "" : " selected"}>Disabled</option>
            <option value="true"${model.autoClarificationAnswersEnabled ? " selected" : ""}>Enabled</option>
          </select>
        </label>
        <label class="phase-field" data-auto-clarification-profile-wrapper>
          <span>Auto-answer profile</span>
          <select data-auto-clarification-profile></select>
        </label>
      </div>
      <div class="section-header">
        <div>
          <p class="eyebrow">Review Automation</p>
          <h2>Implementation loop</h2>
          <p class="copy">Optionally continue from implementation into review automatically, but stop once the configured implementation/review cycle cap is reached.</p>
        </div>
      </div>
      <div class="phase-grid">
        <label class="phase-field">
          <span>Enable auto review</span>
          <select data-auto-review-enabled>
            <option value="false"${model.autoReviewEnabled ? "" : " selected"}>Disabled</option>
            <option value="true"${model.autoReviewEnabled ? " selected" : ""}>Enabled</option>
          </select>
        </label>
        <label class="phase-field">
          <span>Max implementation/review cycles</span>
          <input type="number" min="1" step="1" data-max-implementation-review-cycles value="${escapeHtmlAttr(String(model.maxImplementationReviewCycles ?? 5))}" />
          <span class="phase-field__hint">Automatic review stops when this many implementation attempts have been recorded.</span>
        </label>
      </div>
      <div class="actions">
        <button class="primary-action" type="submit">Save Execution Settings</button>
      </div>
      <p class="save-error" data-save-error></p>
    </form>
  </div>
  <script>
    const vscode = acquireVsCodeApi();
    const executionPhases = ${JSON.stringify(executionPhases)};
    const permissionRequirements = ${JSON.stringify([
      { assignmentKey: "clarificationProfile", label: "Clarification", requiredRepositoryAccess: "read" },
      { assignmentKey: "refinementProfile", label: "Refinement", requiredRepositoryAccess: "read" },
      { assignmentKey: "technicalDesignProfile", label: "Technical Design", requiredRepositoryAccess: "read" },
      { assignmentKey: "implementationProfile", label: "Implementation", requiredRepositoryAccess: "read-write" },
      { assignmentKey: "reviewProfile", label: "Review", requiredRepositoryAccess: "read-write" }
    ])};
    let state = {
      modelProfiles: ${JSON.stringify(model.modelProfiles)},
      phaseModelAssignments: ${JSON.stringify(model.phaseModelAssignments)},
      autoClarificationAnswersEnabled: ${JSON.stringify(model.autoClarificationAnswersEnabled)},
      autoClarificationAnswersProfile: ${JSON.stringify(model.autoClarificationAnswersProfile)},
      autoReviewEnabled: ${JSON.stringify(model.autoReviewEnabled)},
      maxImplementationReviewCycles: ${JSON.stringify(model.maxImplementationReviewCycles ?? 5)},
      initialPermissionIssues: ${JSON.stringify(permissionIssues)}
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

    function isNativeCliProvider(provider) {
      return provider === "codex" || provider === "copilot" || provider === "claude";
    }

    function repositoryAccessOptions(selectedValue) {
      return ["none", "read", "read-write"]
        .map((value) => '<option value="' + value + '"' + (value === selectedValue ? " selected" : "") + '>' + escapeHtml(value) + '</option>')
        .join("");
    }

    function reasoningEffortOptions(selectedValue) {
      return [
        ["", "Provider default"],
        ["none", "none"],
        ["minimal", "minimal"],
        ["low", "low"],
        ["medium", "medium"],
        ["high", "high"],
        ["xhigh", "xhigh"]
      ]
        .map(([value, label]) => '<option value="' + value + '"' + (value === selectedValue ? " selected" : "") + '>' + escapeHtml(label) + '</option>')
        .join("");
    }

    function phaseOptions(selectedValue) {
      const options = ['<option value="">Use default</option>'];
      for (const profile of state.modelProfiles) {
        options.push('<option value="' + escapeHtml(profile.name || "") + '"' + ((profile.name || "") === selectedValue ? " selected" : "") + '>' + escapeHtml(profile.name || "") + '</option>');
      }
      return options.join("");
    }

    function autoClarificationProfileOptions(selectedValue) {
      const options = ['<option value="">Select a profile</option>'];
      for (const profile of state.modelProfiles) {
        options.push('<option value="' + escapeHtml(profile.name || "") + '"' + ((profile.name || "") === selectedValue ? " selected" : "") + '>' + escapeHtml(profile.name || "") + '</option>');
      }
      return options.join("");
    }

    function hasFallbackProblem() {
      const nonEmptyProfiles = state.modelProfiles.filter((profile) => String(profile.name || "").trim().length > 0);
      return nonEmptyProfiles.length > 1 && !String(state.phaseModelAssignments.defaultProfile || "").trim();
    }

    function hasAutoClarificationProblem() {
      return state.autoClarificationAnswersEnabled && !String(state.autoClarificationAnswersProfile || "").trim();
    }

    function validatePermissionIssues() {
      const profilesByName = new Map(
        state.modelProfiles
          .map((profile) => ({
            name: String(profile.name || "").trim(),
            repositoryAccess: String(profile.repositoryAccess || "none").trim() || "none"
          }))
          .filter((profile) => profile.name.length > 0)
          .map((profile) => [profile.name, profile])
      );
      const implicitDefaultProfile = state.modelProfiles.length === 1
        ? String(state.modelProfiles[0]?.name || "").trim() || null
        : null;
      const defaultProfile = String(state.phaseModelAssignments.defaultProfile || "").trim() || implicitDefaultProfile;
      const issues = [];

      for (const requirement of permissionRequirements) {
        const assignedProfile = String(state.phaseModelAssignments[requirement.assignmentKey] || "").trim() || defaultProfile;
        if (!assignedProfile) {
          continue;
        }

        const profile = profilesByName.get(assignedProfile);
        if (!profile) {
          continue;
        }

        const actual = profile.repositoryAccess || "none";
        const okay = requirement.requiredRepositoryAccess === "read"
          ? actual === "read" || actual === "read-write"
          : actual === "read-write";
        if (okay) {
          continue;
        }

        issues.push({
          assignmentKey: requirement.assignmentKey,
          label: requirement.label,
          message: requirement.label + " requires repository access '" + requirement.requiredRepositoryAccess + "', but profile '" + assignedProfile + "' only grants '" + actual + "'."
        });
      }

      return issues;
    }

    function render() {
      const profilesHost = document.querySelector("[data-profiles]");
      const phaseGrid = document.querySelector("[data-phase-grid]");
      const warning = document.querySelector("[data-default-warning]");
      const autoClarificationProfile = document.querySelector("[data-auto-clarification-profile]");
      const autoClarificationWrapper = document.querySelector("[data-auto-clarification-profile-wrapper]");
      const autoClarificationEnabled = document.querySelector("[data-auto-clarification-enabled]");
      const autoReviewEnabled = document.querySelector("[data-auto-review-enabled]");
      const maxImplementationReviewCycles = document.querySelector("[data-max-implementation-review-cycles]");
      const saveButton = document.querySelector('button[type="submit"]');
      const saveError = document.querySelector("[data-save-error]");
      if (!(profilesHost instanceof HTMLElement) || !(phaseGrid instanceof HTMLElement)) {
        return;
      }

      if (state.modelProfiles.length === 0) {
        profilesHost.innerHTML = '<div class="empty">No provider profiles configured yet.</div>';
      } else {
        profilesHost.innerHTML = state.modelProfiles.map((profile, index) => {
          const showEndpointFields = !isNativeCliProvider(profile.provider);
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
            + fieldMarkup("Model", '<input type="text" data-profile-field="model" value="' + escapeHtml(profile.model || "") + '" placeholder="' + escapeHtml(profile.provider === "openai-compatible" ? "gpt-5.4" : "gpt-5.3-codex") + '" />')
            + fieldMarkup("Reasoning Effort", '<select data-profile-field="reasoningEffort">' + reasoningEffortOptions(profile.reasoningEffort || "") + '</select>')
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

      if (autoClarificationProfile instanceof HTMLSelectElement) {
        autoClarificationProfile.innerHTML = autoClarificationProfileOptions(state.autoClarificationAnswersProfile || "");
        autoClarificationProfile.value = state.autoClarificationAnswersProfile || "";
        autoClarificationProfile.addEventListener("change", () => {
          state.autoClarificationAnswersProfile = autoClarificationProfile.value;
        });
      }

      if (autoClarificationEnabled instanceof HTMLSelectElement) {
        autoClarificationEnabled.value = state.autoClarificationAnswersEnabled ? "true" : "false";
        autoClarificationEnabled.addEventListener("change", () => {
          state.autoClarificationAnswersEnabled = autoClarificationEnabled.value === "true";
          render();
        });
      }

      if (autoReviewEnabled instanceof HTMLSelectElement) {
        autoReviewEnabled.value = state.autoReviewEnabled ? "true" : "false";
        autoReviewEnabled.addEventListener("change", () => {
          state.autoReviewEnabled = autoReviewEnabled.value === "true";
        });
      }

      if (maxImplementationReviewCycles instanceof HTMLInputElement) {
        maxImplementationReviewCycles.value = String(state.maxImplementationReviewCycles || 5);
        const syncMaxCycles = () => {
          const parsed = Number.parseInt(maxImplementationReviewCycles.value, 10);
          state.maxImplementationReviewCycles = Number.isFinite(parsed) && parsed > 0 ? parsed : 5;
          maxImplementationReviewCycles.value = String(state.maxImplementationReviewCycles);
        };
        maxImplementationReviewCycles.addEventListener("input", syncMaxCycles);
        maxImplementationReviewCycles.addEventListener("change", syncMaxCycles);
      }

      const fallbackProblem = hasFallbackProblem();
      const autoClarificationProblem = hasAutoClarificationProblem();
      const permissionIssues = validatePermissionIssues();
      if (warning instanceof HTMLElement) {
        warning.classList.toggle("warning-banner--visible", fallbackProblem);
      }
      const defaultWrapper = document.querySelector('[data-phase-wrapper="defaultProfile"]');
      if (defaultWrapper instanceof HTMLElement) {
        defaultWrapper.classList.toggle("phase-field--invalid", fallbackProblem);
      }
      if (autoClarificationWrapper instanceof HTMLElement) {
        autoClarificationWrapper.classList.toggle("phase-field--invalid", autoClarificationProblem);
      }
      for (const phase of executionPhases) {
        if (phase.key === "defaultProfile") {
          continue;
        }
        const wrapper = document.querySelector('[data-phase-wrapper="' + phase.key + '"]');
        const hint = wrapper instanceof HTMLElement ? wrapper.querySelector(".phase-field__hint") : null;
        const issue = permissionIssues.find((candidate) => candidate.assignmentKey === phase.key);
        if (wrapper instanceof HTMLElement) {
          wrapper.classList.toggle("phase-field--invalid", Boolean(issue));
        }
        if (hint instanceof HTMLElement) {
          hint.textContent = issue ? issue.message : "";
        }
      }
      if (saveButton instanceof HTMLButtonElement) {
        saveButton.disabled = fallbackProblem || autoClarificationProblem || permissionIssues.length > 0;
        saveButton.title = fallbackProblem
          ? "Define the default fallback profile before saving."
          : autoClarificationProblem
            ? "Select the profile that should answer clarification questions."
            : permissionIssues.length > 0
              ? permissionIssues[0].message
            : "";
      }
      if (saveError instanceof HTMLElement) {
        const errorMessage = fallbackProblem
          ? "Define the default fallback profile before saving."
          : autoClarificationProblem
            ? "Select the profile that should answer clarification questions."
            : permissionIssues[0]?.message || "";
        saveError.textContent = errorMessage;
        saveError.classList.toggle("save-error--visible", errorMessage.length > 0);
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
      const previousProfiles = state.modelProfiles.slice();
      const nextProfiles = [];
      for (const card of document.querySelectorAll("[data-profile-index]")) {
        nextProfiles.push({
          name: readProfileField(card, "name"),
          provider: readProfileField(card, "provider") || "openai-compatible",
          baseUrl: readProfileField(card, "baseUrl"),
          apiKey: readProfileField(card, "apiKey"),
          model: readProfileField(card, "model"),
          reasoningEffort: readProfileField(card, "reasoningEffort"),
          repositoryAccess: readProfileField(card, "repositoryAccess") || "none"
        });
      }
      remapAssignmentsForRenamedProfiles(previousProfiles, nextProfiles);
      state.modelProfiles = nextProfiles;
      pruneMissingAssignments();
      render();
    }

    function syncFromDomSilently() {
      const previousProfiles = state.modelProfiles.slice();
      const nextProfiles = [];
      for (const card of document.querySelectorAll("[data-profile-index]")) {
        nextProfiles.push({
          name: readProfileField(card, "name"),
          provider: readProfileField(card, "provider") || "openai-compatible",
          baseUrl: readProfileField(card, "baseUrl"),
          apiKey: readProfileField(card, "apiKey"),
          model: readProfileField(card, "model"),
          reasoningEffort: readProfileField(card, "reasoningEffort"),
          repositoryAccess: readProfileField(card, "repositoryAccess") || "none"
        });
      }
      remapAssignmentsForRenamedProfiles(previousProfiles, nextProfiles);
      state.modelProfiles = nextProfiles;
      pruneMissingAssignments();
    }

    function remapAssignmentsForRenamedProfiles(previousProfiles, nextProfiles) {
      const renameMap = new Map();
      for (let index = 0; index < Math.min(previousProfiles.length, nextProfiles.length); index += 1) {
        const previousName = String(previousProfiles[index]?.name || "").trim();
        const nextName = String(nextProfiles[index]?.name || "").trim();
        if (!previousName || !nextName || previousName === nextName) {
          continue;
        }

        renameMap.set(previousName, nextName);
      }

      if (renameMap.size === 0) {
        return;
      }

      for (const phase of executionPhases) {
        const current = String(state.phaseModelAssignments[phase.key] || "").trim();
        if (current && renameMap.has(current)) {
          state.phaseModelAssignments[phase.key] = renameMap.get(current);
        }
      }

      const autoClarificationProfile = String(state.autoClarificationAnswersProfile || "").trim();
      if (autoClarificationProfile && renameMap.has(autoClarificationProfile)) {
        state.autoClarificationAnswersProfile = renameMap.get(autoClarificationProfile);
      }
    }

    function pruneMissingAssignments() {
      const names = new Set(state.modelProfiles.map((profile) => profile.name).filter(Boolean));
      for (const phase of executionPhases) {
        const current = state.phaseModelAssignments[phase.key];
        if (current && !names.has(current)) {
          state.phaseModelAssignments[phase.key] = "";
        }
      }
      if (state.autoClarificationAnswersProfile && !names.has(state.autoClarificationAnswersProfile)) {
        state.autoClarificationAnswersProfile = "";
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
        reasoningEffort: "",
        repositoryAccess: "none"
      });
      render();
    });

    document.getElementById("execution-settings-form")?.addEventListener("submit", (event) => {
      event.preventDefault();
      syncFromDom();
      if (hasFallbackProblem() || hasAutoClarificationProblem() || validatePermissionIssues().length > 0) {
        return;
      }
      vscode.postMessage({
        command: "saveExecutionSettings",
        modelProfiles: state.modelProfiles,
        phaseModelAssignments: state.phaseModelAssignments,
        autoClarificationAnswersEnabled: state.autoClarificationAnswersEnabled,
        autoClarificationAnswersProfile: state.autoClarificationAnswersProfile,
        autoReviewEnabled: state.autoReviewEnabled,
        maxImplementationReviewCycles: state.maxImplementationReviewCycles
      });
    });

    render();
  </script>
</body>
</html>`;
}

async function saveExecutionSettingsAsync(
  modelProfiles: readonly Partial<SpecForgeModelProfile>[],
  phaseModelAssignments: Partial<SpecForgePhaseModelAssignments>,
  autoClarificationAnswersEnabled = false,
  autoClarificationAnswersProfile?: string | null,
  autoReviewEnabled = false,
  maxImplementationReviewCycles?: number | null
): Promise<void> {
  const configuration = vscode.workspace.getConfiguration("specForge");
  const normalizedProfiles = modelProfiles
    .map((profile) => ({
      name: typeof profile.name === "string" ? profile.name.trim() : "",
      provider: typeof profile.provider === "string" ? profile.provider.trim() : "openai-compatible",
      baseUrl: typeof profile.baseUrl === "string" ? profile.baseUrl.trim() : "",
      apiKey: typeof profile.apiKey === "string" ? profile.apiKey.trim() : "",
      model: typeof profile.model === "string" ? profile.model.trim() : "",
      reasoningEffort: typeof profile.reasoningEffort === "string" ? profile.reasoningEffort.trim().toLowerCase() : "",
      repositoryAccess: typeof profile.repositoryAccess === "string" ? profile.repositoryAccess.trim() : "none"
    }))
    .filter((profile) =>
      profile.name.length > 0
      || profile.baseUrl.length > 0
      || profile.apiKey.length > 0
      || profile.model.length > 0
      || profile.reasoningEffort.length > 0
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
  const permissionIssues = validatePhasePermissionAssignments(normalizedProfiles, normalizedAssignments);
  if (requiresDefaultFallback(normalizedProfiles, normalizedAssignments)) {
    throw new Error("Define the default fallback profile before saving execution settings.");
  }
  if (autoClarificationAnswersEnabled && !normalizeOptionalAssignment(autoClarificationAnswersProfile)) {
    throw new Error("Select the profile that should answer clarification questions before saving execution settings.");
  }
  if (permissionIssues.length > 0) {
    throw new Error(permissionIssues[0]?.message ?? "Execution settings include a phase model permission mismatch.");
  }

  await configuration.update("execution.modelProfiles", normalizedProfiles, vscode.ConfigurationTarget.Workspace);
  await configuration.update("execution.phaseModels", normalizedAssignments, vscode.ConfigurationTarget.Workspace);
  await configuration.update("features.autoClarificationAnswersEnabled", autoClarificationAnswersEnabled, vscode.ConfigurationTarget.Workspace);
  await configuration.update(
    "execution.autoClarificationAnswersProfile",
    normalizeOptionalAssignment(autoClarificationAnswersProfile),
    vscode.ConfigurationTarget.Workspace);
  await configuration.update("features.autoReviewEnabled", autoReviewEnabled, vscode.ConfigurationTarget.Workspace);
  await configuration.update(
    "features.maxImplementationReviewCycles",
    normalizePositiveInteger(maxImplementationReviewCycles) ?? 5,
    vscode.ConfigurationTarget.Workspace);
}

function normalizeOptionalAssignment(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function normalizePositiveInteger(value: number | null | undefined): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  const normalized = Math.trunc(value);
  return normalized > 0 ? normalized : null;
}
