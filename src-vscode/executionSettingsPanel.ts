import * as vscode from "vscode";
import { escapeHtml, escapeHtmlAttr } from "./htmlEscape";
import { requiresDefaultFallback, validatePhasePermissionAssignments } from "./executionSettingsModel";
import {
  getSpecForgeSettings,
  type SpecForgeModelProfile,
  type SpecForgePhaseModelAssignments
} from "./extensionSettings";
import { automationPhaseIcon, workflowPhaseIcon } from "./workflow-view/icons";
import { buildWebviewTypographyRootCss, getEditorTypographyCssVars } from "./webviewTypography";

type ExecutionSettingsMessage =
  | {
      readonly command: "saveExecutionSettings";
      readonly modelProfiles?: readonly Partial<SpecForgeModelProfile>[];
      readonly phaseModelAssignments?: Partial<SpecForgePhaseModelAssignments>;
      readonly refinementTolerance?: string;
      readonly reviewTolerance?: string;
      readonly watcherEnabled?: boolean;
      readonly attentionNotificationsEnabled?: boolean;
      readonly contextSuggestionsEnabled?: boolean;
      readonly workflowGraphLayoutMode?: "horizontal" | "vertical";
      readonly workflowGraphInitialZoomMode?: "actual-size" | "fit-width";
      readonly userStoryListViewMode?: "category" | "phase";
      readonly visualTimelineEnabled?: boolean;
      readonly requireExplicitApprovalBranchAcceptance?: boolean;
      readonly autoRefinementAnswersEnabled?: boolean;
      readonly autoRefinementAnswersProfile?: string | null;
      readonly autoPlayEnabled?: boolean;
      readonly autoReviewEnabled?: boolean;
      readonly maxImplementationReviewCycles?: number | null;
      readonly destructiveRewindEnabled?: boolean;
      readonly pauseOnFailedReview?: boolean;
      readonly reviewLearningEnabled?: boolean;
      readonly reviewLearningSkillPath?: string | null;
      readonly completedUsLockOnCompleted?: boolean;
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
      "SpecForge Configuration",
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
              message.refinementTolerance ?? "balanced",
              message.reviewTolerance ?? "balanced",
              message.watcherEnabled ?? true,
              message.attentionNotificationsEnabled ?? true,
              message.contextSuggestionsEnabled ?? true,
              message.workflowGraphLayoutMode ?? "vertical",
              message.workflowGraphInitialZoomMode ?? "actual-size",
              message.userStoryListViewMode ?? "category",
              message.visualTimelineEnabled ?? false,
              message.requireExplicitApprovalBranchAcceptance ?? false,
              message.autoRefinementAnswersEnabled ?? false,
              message.autoRefinementAnswersProfile,
              message.autoPlayEnabled ?? false,
              message.autoReviewEnabled ?? false,
              message.maxImplementationReviewCycles ?? null,
              message.destructiveRewindEnabled ?? false,
              message.pauseOnFailedReview ?? false,
              message.reviewLearningEnabled ?? true,
              message.reviewLearningSkillPath,
              message.completedUsLockOnCompleted ?? true);
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
      refinementTolerance: settings.refinementTolerance,
      reviewTolerance: settings.reviewTolerance,
      watcherEnabled: settings.watcherEnabled,
      attentionNotificationsEnabled: settings.attentionNotificationsEnabled,
      contextSuggestionsEnabled: settings.contextSuggestionsEnabled,
      workflowGraphLayoutMode: settings.workflowGraphLayoutMode,
      workflowGraphInitialZoomMode: settings.workflowGraphInitialZoomMode,
      userStoryListViewMode: settings.userStoryListViewMode ?? "category",
      visualTimelineEnabled: settings.visualTimelineEnabled,
      requireExplicitApprovalBranchAcceptance: settings.requireExplicitApprovalBranchAcceptance,
      autoRefinementAnswersEnabled: settings.autoRefinementAnswersEnabled,
      autoRefinementAnswersProfile: settings.autoRefinementAnswersProfile,
      autoPlayEnabled: settings.autoPlayEnabled,
      autoReviewEnabled: settings.autoReviewEnabled,
      maxImplementationReviewCycles: settings.maxImplementationReviewCycles,
      destructiveRewindEnabled: settings.destructiveRewindEnabled,
      pauseOnFailedReview: settings.pauseOnFailedReview,
      reviewLearningEnabled: settings.reviewLearningEnabled !== false,
      reviewLearningSkillPath: settings.reviewLearningSkillPath ?? ".codex/skills/sdd-phase-agents/SKILL.md",
      completedUsLockOnCompleted: settings.completedUsLockOnCompleted,
      typographyCssVars: getEditorTypographyCssVars()
    });
  }
}

type ExecutionSettingsViewModel = {
  readonly modelProfiles: readonly SpecForgeModelProfile[];
  readonly phaseModelAssignments: SpecForgePhaseModelAssignments;
  readonly refinementTolerance: string;
  readonly reviewTolerance: string;
  readonly watcherEnabled: boolean;
  readonly attentionNotificationsEnabled: boolean;
  readonly contextSuggestionsEnabled: boolean;
  readonly workflowGraphLayoutMode: "horizontal" | "vertical";
  readonly workflowGraphInitialZoomMode: "actual-size" | "fit-width";
  readonly userStoryListViewMode: "category" | "phase";
  readonly visualTimelineEnabled: boolean;
  readonly requireExplicitApprovalBranchAcceptance: boolean;
  readonly autoRefinementAnswersEnabled: boolean;
  readonly autoRefinementAnswersProfile: string | null;
  readonly autoPlayEnabled: boolean;
  readonly autoReviewEnabled: boolean;
  readonly maxImplementationReviewCycles: number | null;
  readonly destructiveRewindEnabled: boolean;
  readonly pauseOnFailedReview: boolean;
  readonly reviewLearningEnabled: boolean;
  readonly reviewLearningSkillPath: string;
  readonly completedUsLockOnCompleted: boolean;
  readonly typographyCssVars?: string;
};

const executionPhases: ReadonlyArray<{
  key: keyof SpecForgePhaseModelAssignments;
  label: string;
  phaseId: string | null;
  kind: "default" | "phase";
}> = [
  { key: "defaultProfile", label: "Default / fallback", phaseId: null, kind: "default" },
  { key: "captureProfile", label: "Capture", phaseId: "capture", kind: "phase" },
  { key: "refinementProfile", label: "Refinement", phaseId: "refinement", kind: "phase" },
  { key: "specProfile", label: "Spec", phaseId: "spec", kind: "phase" },
  { key: "technicalDesignProfile", label: "Technical Design", phaseId: "technical-design", kind: "phase" },
  { key: "implementationProfile", label: "Implementation", phaseId: "implementation", kind: "phase" },
  { key: "reviewProfile", label: "Review", phaseId: "review", kind: "phase" },
  { key: "releaseApprovalProfile", label: "Release Approval", phaseId: "release-approval", kind: "phase" },
  { key: "prPreparationProfile", label: "PR Preparation", phaseId: "pr-preparation", kind: "phase" }
];

function renderExecutionSettingsPhaseIcon(phase: typeof executionPhases[number]): string {
  const icon = phase.phaseId ? workflowPhaseIcon(phase.phaseId) : automationPhaseIcon();
  const toneClass = phase.kind === "default"
    ? " phase-field__icon-shell--default"
    : "";

  return `<span class="phase-field__icon-shell${toneClass}" aria-hidden="true">${icon}</span>`;
}

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
    .phase-grid {
      align-items: start;
    }
    .feature-grid {
      display: grid;
      gap: 12px;
      grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
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
    .profile-card[open] {
      border-color: rgba(114, 241, 184, 0.22);
      box-shadow: inset 0 0 0 1px rgba(114, 241, 184, 0.08);
    }
    .profile-card__header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 10px;
    }
    .profile-card__summary {
      list-style: none;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
      cursor: pointer;
      user-select: none;
    }
    .profile-card__summary::-webkit-details-marker {
      display: none;
    }
    .profile-card__summary-main {
      display: grid;
      gap: 3px;
      min-width: 0;
    }
    .profile-card__summary-title {
      font-weight: 700;
      color: #f3fff9;
    }
    .profile-card__summary-meta {
      font-size: 0.8rem;
      color: rgba(255, 255, 255, 0.62);
    }
    .profile-card__summary-actions {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-shrink: 0;
    }
    .profile-card__chevron {
      width: 34px;
      height: 34px;
      display: inline-grid;
      place-items: center;
      border-radius: 12px;
      border: 1px solid rgba(255, 255, 255, 0.08);
      background: rgba(255, 255, 255, 0.04);
      color: rgba(255, 255, 255, 0.76);
      transition: transform 120ms ease;
    }
    .profile-card[open] .profile-card__chevron {
      transform: rotate(180deg);
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
    .phase-grid .phase-field {
      display: grid;
      gap: 10px;
      align-content: start;
      min-height: 100%;
    }
    .phase-field__heading {
      display: flex;
      align-items: center;
      gap: 10px;
      min-width: 0;
    }
    .phase-field__icon-shell {
      width: 34px;
      height: 34px;
      flex: 0 0 34px;
      display: inline-grid;
      place-items: center;
      border-radius: 12px;
      border: 1px solid rgba(114, 241, 184, 0.18);
      background:
        radial-gradient(circle at 30% 28%, rgba(255, 255, 255, 0.08), transparent 38%),
        linear-gradient(180deg, rgba(18, 34, 31, 0.94), rgba(11, 21, 20, 0.98));
      color: rgba(177, 255, 224, 0.92);
      box-shadow:
        inset 0 1px 0 rgba(255, 255, 255, 0.05),
        0 8px 22px rgba(4, 10, 18, 0.18);
    }
    .phase-field__icon-shell svg {
      width: 18px;
      height: 18px;
      fill: currentColor;
    }
    .phase-field__icon-shell--default {
      border-color: rgba(190, 198, 214, 0.16);
      background:
        radial-gradient(circle at 30% 28%, rgba(255, 255, 255, 0.06), transparent 38%),
        linear-gradient(180deg, rgba(34, 38, 45, 0.94), rgba(19, 23, 29, 0.98));
      color: rgba(193, 201, 214, 0.82);
    }
    .phase-field__title-stack {
      display: grid;
      gap: 3px;
      min-width: 0;
    }
    .phase-field__title {
      font-size: 0.82rem;
      color: rgba(255, 255, 255, 0.9);
      font-weight: 700;
    }
    .phase-field__inline-hint {
      font-size: 0.74rem;
      color: rgba(255, 255, 255, 0.52);
      line-height: 1.35;
    }
    .phase-field--default-route {
      grid-column: 1 / -1;
      grid-template-columns: minmax(0, 1fr) minmax(260px, 320px);
      align-items: center;
      gap: 16px;
    }
    .phase-field--default-route .phase-field__hint {
      grid-column: 1 / -1;
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
      .phase-field--default-route {
        grid-template-columns: minmax(0, 1fr);
      }
    }
  </style>
</head>
<body>
  <div class="shell">
    <section class="hero">
      <p class="eyebrow">SpecForge Configuration</p>
      <h1>One panel, one source of truth</h1>
      <p class="copy">Keep SpecForge settings together here instead of scattering workflow behavior across raw VS Code settings. Shared workflow rules persist in workspace settings, while personal UX preferences persist in VS Code user settings under <code>specForge.*</code>.</p>
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
          <label class="phase-field${phase.kind === "default" ? " phase-field--default-route" : ""}" data-phase-wrapper="${escapeHtmlAttr(String(phase.key))}">
            <span class="phase-field__heading">
              ${renderExecutionSettingsPhaseIcon(phase)}
              <span class="phase-field__title-stack">
                <span class="phase-field__title">${escapeHtml(phase.label)}</span>
                ${phase.key === "defaultProfile"
                  ? '<span class="phase-field__inline-hint">Required when you have multiple profiles and no single implicit fallback.</span>'
                  : ""}
              </span>
            </span>
            <select data-phase-field="${escapeHtmlAttr(String(phase.key))}"></select>
            ${phase.key === "defaultProfile"
              ? '<span class="phase-field__hint">Required when you have multiple profiles and no single implicit fallback.</span>'
              : '<span class="phase-field__hint"></span>'}
          </label>
        `).join("")}
      </div>
      <div class="section-header">
        <div>
          <p class="eyebrow">Refinement Automation</p>
          <h2>Model-assisted answers</h2>
          <p class="copy">When refinement blocks spec, let a selected model try to answer the pending questions once before handing the phase back to the user.</p>
        </div>
      </div>
      <div class="feature-grid">
        <label class="phase-field">
          <span>Refinement tolerance</span>
          <select data-refinement-tolerance>
            <option value="strict"${model.refinementTolerance === "strict" ? " selected" : ""}>Strict</option>
            <option value="balanced"${model.refinementTolerance === "balanced" ? " selected" : ""}>Balanced</option>
            <option value="inferential"${model.refinementTolerance === "inferential" ? " selected" : ""}>Inferential</option>
          </select>
          <span class="phase-field__hint">Controls how much ambiguity refinement tolerates before spec can continue.</span>
        </label>
        <label class="phase-field">
          <span>Review tolerance</span>
          <select data-review-tolerance>
            <option value="strict"${model.reviewTolerance === "strict" ? " selected" : ""}>Strict</option>
            <option value="balanced"${model.reviewTolerance === "balanced" ? " selected" : ""}>Balanced</option>
            <option value="inferential"${model.reviewTolerance === "inferential" ? " selected" : ""}>Inferential</option>
          </select>
          <span class="phase-field__hint">Controls how demanding the review phase is before it passes or fails delivered work.</span>
        </label>
        <label class="phase-field">
          <span>Enable auto answers</span>
          <select data-auto-refinement-enabled>
            <option value="false"${model.autoRefinementAnswersEnabled ? "" : " selected"}>Disabled</option>
            <option value="true"${model.autoRefinementAnswersEnabled ? " selected" : ""}>Enabled</option>
          </select>
        </label>
        <label class="phase-field" data-auto-refinement-profile-wrapper>
          <span>Auto-answer profile</span>
          <select data-auto-refinement-profile></select>
        </label>
        <label class="phase-field">
          <span>Context suggestions</span>
          <select data-context-suggestions-enabled>
            <option value="true"${model.contextSuggestionsEnabled ? " selected" : ""}>Enabled</option>
            <option value="false"${model.contextSuggestionsEnabled ? "" : " selected"}>Disabled</option>
          </select>
          <span class="phase-field__hint">Suggest nearby repository files during refinement to improve local context selection.</span>
        </label>
        <label class="phase-field">
          <span>Require approval branch acceptance</span>
          <select data-require-approval-branch-acceptance>
            <option value="false"${model.requireExplicitApprovalBranchAcceptance ? "" : " selected"}>Disabled</option>
            <option value="true"${model.requireExplicitApprovalBranchAcceptance ? " selected" : ""}>Enabled</option>
          </select>
          <span class="phase-field__hint">Force explicit confirmation of the proposed base branch before approving spec.</span>
        </label>
      </div>
      <div class="section-header">
        <div>
          <p class="eyebrow">Automation</p>
          <h2>Playback and review loop</h2>
          <p class="copy">Control when SpecForge resumes automatically after manual checkpoints and how far the implementation/review loop is allowed to run without intervention.</p>
        </div>
      </div>
      <div class="feature-grid">
        <label class="phase-field">
          <span>Enable auto play</span>
          <select data-auto-play-enabled>
            <option value="false"${model.autoPlayEnabled ? "" : " selected"}>Disabled</option>
            <option value="true"${model.autoPlayEnabled ? " selected" : ""}>Enabled</option>
          </select>
          <span class="phase-field__hint">Resume workflow playback automatically after qualifying manual actions such as approvals.</span>
        </label>
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
        <label class="phase-field">
          <span>Pause on failed review</span>
          <select data-pause-on-failed-review>
            <option value="false"${model.pauseOnFailedReview ? "" : " selected"}>Disabled</option>
            <option value="true"${model.pauseOnFailedReview ? " selected" : ""}>Enabled</option>
          </select>
          <span class="phase-field__hint">Pause playback automatically when review fails so the developer can inspect before continuing.</span>
        </label>
        <label class="phase-field">
          <span>Review learning</span>
          <select data-review-learning-enabled>
            <option value="true"${model.reviewLearningEnabled ? " selected" : ""}>Enabled</option>
            <option value="false"${model.reviewLearningEnabled ? "" : " selected"}>Disabled</option>
          </select>
          <span class="phase-field__hint">Allow failed-review retries to persist generalized guardrails into local skills or phase prompts.</span>
        </label>
        <label class="phase-field">
          <span>Review learning skill path</span>
          <input type="text" data-review-learning-skill-path value="${escapeHtmlAttr(model.reviewLearningSkillPath)}" placeholder=".codex/skills/sdd-phase-agents/SKILL.md" />
          <span class="phase-field__hint">Workspace-relative skill path updated when a reusable local SDD guardrail is found.</span>
        </label>
      </div>
      <div class="section-header">
        <div>
          <p class="eyebrow">Workflow Safety</p>
          <h2>Rewind and completion policy</h2>
          <p class="copy">Define how aggressive rewinds are, and whether completed user stories stay locked until they are explicitly reopened from the completed phase.</p>
        </div>
      </div>
      <div class="feature-grid">
        <label class="phase-field">
          <span>Destructive rewind</span>
          <select data-destructive-rewind-enabled>
            <option value="false"${model.destructiveRewindEnabled ? "" : " selected"}>Disabled</option>
            <option value="true"${model.destructiveRewindEnabled ? " selected" : ""}>Enabled</option>
          </select>
          <span class="phase-field__hint">When enabled, rewinds and regressions delete later derived artifacts instead of only moving workflow state.</span>
        </label>
        <label class="phase-field">
          <span>Lock completed workflows</span>
          <select data-completed-us-lock-on-completed>
            <option value="true"${model.completedUsLockOnCompleted ? " selected" : ""}>Enabled</option>
            <option value="false"${model.completedUsLockOnCompleted ? "" : " selected"}>Disabled</option>
          </select>
          <span class="phase-field__hint">Disable this if completed workflows should remain directly mutable instead of requiring explicit reopen.</span>
        </label>
      </div>
      <div class="section-header">
        <div>
          <p class="eyebrow">User Preferences</p>
          <h2>Personal workflow UX</h2>
          <p class="copy">These preferences are saved to your VS Code user settings. They affect your local experience without changing the team's shared workspace configuration.</p>
        </div>
      </div>
      <div class="feature-grid">
        <label class="phase-field">
          <span>Workflow graph layout</span>
          <select data-workflow-graph-layout-mode>
            <option value="vertical"${model.workflowGraphLayoutMode === "vertical" ? " selected" : ""}>Vertical</option>
            <option value="horizontal"${model.workflowGraphLayoutMode === "horizontal" ? " selected" : ""}>Horizontal</option>
          </select>
          <span class="phase-field__hint">Default graph orientation for this user in this workspace.</span>
        </label>
        <label class="phase-field">
          <span>Workflow graph initial zoom</span>
          <select data-workflow-graph-initial-zoom-mode>
            <option value="actual-size"${model.workflowGraphInitialZoomMode === "fit-width" ? "" : " selected"}>100%</option>
            <option value="fit-width"${model.workflowGraphInitialZoomMode === "fit-width" ? " selected" : ""}>Fit to width</option>
          </select>
          <span class="phase-field__hint">Default zoom mode used when opening a workflow graph.</span>
        </label>
        <label class="phase-field">
          <span>User story list view</span>
          <select data-user-story-list-view-mode>
            <option value="category"${model.userStoryListViewMode === "phase" ? "" : " selected"}>By category</option>
            <option value="phase"${model.userStoryListViewMode === "phase" ? " selected" : ""}>By phase</option>
          </select>
          <span class="phase-field__hint">Default grouping used by the user stories sidebar.</span>
        </label>
        <label class="phase-field">
          <span>Visual timeline</span>
          <select data-visual-timeline-enabled>
            <option value="false"${model.visualTimelineEnabled ? "" : " selected"}>Hidden</option>
            <option value="true"${model.visualTimelineEnabled ? " selected" : ""}>Visible</option>
          </select>
          <span class="phase-field__hint">Show or hide the visual workflow timeline dock in the workflow detail view.</span>
        </label>
        <label class="phase-field">
          <span>Workspace watcher</span>
          <select data-watcher-enabled>
            <option value="true"${model.watcherEnabled ? " selected" : ""}>Enabled</option>
            <option value="false"${model.watcherEnabled ? "" : " selected"}>Disabled</option>
          </select>
          <span class="phase-field__hint">Refresh the explorer and workflow views automatically when <code>.specs</code> files change on disk.</span>
        </label>
        <label class="phase-field">
          <span>Attention notifications</span>
          <select data-attention-notifications-enabled>
            <option value="true"${model.attentionNotificationsEnabled ? " selected" : ""}>Enabled</option>
            <option value="false"${model.attentionNotificationsEnabled ? "" : " selected"}>Disabled</option>
          </select>
          <span class="phase-field__hint">Show notifications when a user story becomes waiting-user, blocked, or completed.</span>
        </label>
      </div>
      <div class="actions">
        <button class="primary-action" type="submit">Save SpecForge Configuration</button>
      </div>
      <p class="save-error" data-save-error></p>
    </form>
  </div>
  <script>
    const vscode = acquireVsCodeApi();
    const executionPhases = ${JSON.stringify(executionPhases)};
    const permissionRequirements = ${JSON.stringify([
      { assignmentKey: "refinementProfile", label: "Refinement", requiredRepositoryAccess: "read" },
      { assignmentKey: "specProfile", label: "Spec", requiredRepositoryAccess: "read" },
      { assignmentKey: "technicalDesignProfile", label: "Technical Design", requiredRepositoryAccess: "read" },
      { assignmentKey: "implementationProfile", label: "Implementation", requiredRepositoryAccess: "read-write" },
      { assignmentKey: "reviewProfile", label: "Review", requiredRepositoryAccess: "read-write" }
    ])};
    let state = {
      modelProfiles: ${JSON.stringify(model.modelProfiles)},
      phaseModelAssignments: ${JSON.stringify(model.phaseModelAssignments)},
      refinementTolerance: ${JSON.stringify(model.refinementTolerance)},
      reviewTolerance: ${JSON.stringify(model.reviewTolerance)},
      watcherEnabled: ${JSON.stringify(model.watcherEnabled)},
      attentionNotificationsEnabled: ${JSON.stringify(model.attentionNotificationsEnabled)},
      contextSuggestionsEnabled: ${JSON.stringify(model.contextSuggestionsEnabled)},
      workflowGraphLayoutMode: ${JSON.stringify(model.workflowGraphLayoutMode)},
      workflowGraphInitialZoomMode: ${JSON.stringify(model.workflowGraphInitialZoomMode)},
      userStoryListViewMode: ${JSON.stringify(model.userStoryListViewMode)},
      visualTimelineEnabled: ${JSON.stringify(model.visualTimelineEnabled)},
      requireExplicitApprovalBranchAcceptance: ${JSON.stringify(model.requireExplicitApprovalBranchAcceptance)},
      autoRefinementAnswersEnabled: ${JSON.stringify(model.autoRefinementAnswersEnabled)},
      autoRefinementAnswersProfile: ${JSON.stringify(model.autoRefinementAnswersProfile)},
      autoPlayEnabled: ${JSON.stringify(model.autoPlayEnabled)},
      autoReviewEnabled: ${JSON.stringify(model.autoReviewEnabled)},
      maxImplementationReviewCycles: ${JSON.stringify(model.maxImplementationReviewCycles ?? 5)},
      destructiveRewindEnabled: ${JSON.stringify(model.destructiveRewindEnabled)},
      pauseOnFailedReview: ${JSON.stringify(model.pauseOnFailedReview)},
      reviewLearningEnabled: ${JSON.stringify(model.reviewLearningEnabled)},
      reviewLearningSkillPath: ${JSON.stringify(model.reviewLearningSkillPath)},
      completedUsLockOnCompleted: ${JSON.stringify(model.completedUsLockOnCompleted)},
      initialPermissionIssues: ${JSON.stringify(permissionIssues)},
      expandedProfileIndexes: ${JSON.stringify(model.modelProfiles.map((_, index) => index === 0))},
      pendingFocusProfileIndex: null
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

    function autoRefinementProfileOptions(selectedValue) {
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

    function hasAutoRefinementProblem() {
      return state.autoRefinementAnswersEnabled && !String(state.autoRefinementAnswersProfile || "").trim();
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
      const autoRefinementProfile = document.querySelector("[data-auto-refinement-profile]");
      const autoRefinementWrapper = document.querySelector("[data-auto-refinement-profile-wrapper]");
      const refinementTolerance = document.querySelector("[data-refinement-tolerance]");
      const reviewTolerance = document.querySelector("[data-review-tolerance]");
      const watcherEnabled = document.querySelector("[data-watcher-enabled]");
      const attentionNotificationsEnabled = document.querySelector("[data-attention-notifications-enabled]");
      const contextSuggestionsEnabled = document.querySelector("[data-context-suggestions-enabled]");
      const workflowGraphLayoutMode = document.querySelector("[data-workflow-graph-layout-mode]");
      const workflowGraphInitialZoomMode = document.querySelector("[data-workflow-graph-initial-zoom-mode]");
      const userStoryListViewMode = document.querySelector("[data-user-story-list-view-mode]");
      const visualTimelineEnabled = document.querySelector("[data-visual-timeline-enabled]");
      const requireApprovalBranchAcceptance = document.querySelector("[data-require-approval-branch-acceptance]");
      const autoRefinementEnabled = document.querySelector("[data-auto-refinement-enabled]");
      const autoPlayEnabled = document.querySelector("[data-auto-play-enabled]");
      const autoReviewEnabled = document.querySelector("[data-auto-review-enabled]");
      const maxImplementationReviewCycles = document.querySelector("[data-max-implementation-review-cycles]");
      const destructiveRewindEnabled = document.querySelector("[data-destructive-rewind-enabled]");
      const pauseOnFailedReview = document.querySelector("[data-pause-on-failed-review]");
      const reviewLearningEnabled = document.querySelector("[data-review-learning-enabled]");
      const reviewLearningSkillPath = document.querySelector("[data-review-learning-skill-path]");
      const completedUsLockOnCompleted = document.querySelector("[data-completed-us-lock-on-completed]");
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
          const isExpanded = Array.isArray(state.expandedProfileIndexes) ? Boolean(state.expandedProfileIndexes[index]) : index === 0;
          const summaryTitle = escapeHtml(profile.name || ('Profile ' + (index + 1)));
          const summaryMeta = [
            String(profile.provider || "openai-compatible").trim() || "openai-compatible",
            String(profile.repositoryAccess || "none").trim() || "none"
          ].join(" · ");
          return '<details class="profile-card" data-profile-index="' + index + '"' + (isExpanded ? ' open' : '') + '>'
            + '<summary class="profile-card__summary">'
            + '<div class="profile-card__summary-main">'
            + '<strong class="profile-card__summary-title">' + summaryTitle + '</strong>'
            + '<span class="profile-card__summary-meta">' + escapeHtml(summaryMeta) + '</span>'
            + '</div>'
            + '<div class="profile-card__summary-actions">'
            + '<button class="danger-action" type="button" data-remove-profile="' + index + '" title="Remove profile ' + (index + 1) + '" aria-label="Remove profile ' + (index + 1) + '">×</button>'
            + '<span class="profile-card__chevron" aria-hidden="true">⌄</span>'
            + '</div>'
            + '</summary>'
            + '<div class="profile-grid">'
            + fieldMarkup("Name", '<input type="text" data-profile-field="name" value="' + escapeHtml(profile.name || "") + '" placeholder="codex-main" />')
            + fieldMarkup("Provider", '<select data-profile-field="provider">' + providerOptions(profile.provider || "openai-compatible") + '</select>')
            + fieldMarkup("Repository Access", '<select data-profile-field="repositoryAccess">' + repositoryAccessOptions(profile.repositoryAccess || "none") + '</select>')
            + fieldMarkup("Base URL", '<input type="text" data-profile-field="baseUrl" value="' + escapeHtml(profile.baseUrl || "") + '" placeholder="https://api.example.test/v1" />', !showEndpointFields)
            + fieldMarkup("API Key", '<input type="password" data-profile-field="apiKey" value="' + escapeHtml(profile.apiKey || "") + '" placeholder="secret" />', !showEndpointFields)
            + fieldMarkup("Model", '<input type="text" data-profile-field="model" value="' + escapeHtml(profile.model || "") + '" placeholder="' + escapeHtml(profile.provider === "openai-compatible" ? "gpt-5.4" : "gpt-5.3-codex") + '" />')
            + fieldMarkup("Reasoning Effort", '<select data-profile-field="reasoningEffort">' + reasoningEffortOptions(profile.reasoningEffort || "") + '</select>')
            + '</div>'
            + '</details>';
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

      if (autoRefinementProfile instanceof HTMLSelectElement) {
        autoRefinementProfile.innerHTML = autoRefinementProfileOptions(state.autoRefinementAnswersProfile || "");
        autoRefinementProfile.value = state.autoRefinementAnswersProfile || "";
        autoRefinementProfile.addEventListener("change", () => {
          state.autoRefinementAnswersProfile = autoRefinementProfile.value;
        });
      }

      if (refinementTolerance instanceof HTMLSelectElement) {
        refinementTolerance.value = state.refinementTolerance || "balanced";
        refinementTolerance.addEventListener("change", () => {
          state.refinementTolerance = refinementTolerance.value || "balanced";
        });
      }

      if (reviewTolerance instanceof HTMLSelectElement) {
        reviewTolerance.value = state.reviewTolerance || "balanced";
        reviewTolerance.addEventListener("change", () => {
          state.reviewTolerance = reviewTolerance.value || "balanced";
        });
      }

      if (watcherEnabled instanceof HTMLSelectElement) {
        watcherEnabled.value = state.watcherEnabled ? "true" : "false";
        watcherEnabled.addEventListener("change", () => {
          state.watcherEnabled = watcherEnabled.value === "true";
        });
      }

      if (attentionNotificationsEnabled instanceof HTMLSelectElement) {
        attentionNotificationsEnabled.value = state.attentionNotificationsEnabled ? "true" : "false";
        attentionNotificationsEnabled.addEventListener("change", () => {
          state.attentionNotificationsEnabled = attentionNotificationsEnabled.value === "true";
        });
      }

      if (contextSuggestionsEnabled instanceof HTMLSelectElement) {
        contextSuggestionsEnabled.value = state.contextSuggestionsEnabled ? "true" : "false";
        contextSuggestionsEnabled.addEventListener("change", () => {
          state.contextSuggestionsEnabled = contextSuggestionsEnabled.value === "true";
        });
      }

      if (workflowGraphLayoutMode instanceof HTMLSelectElement) {
        workflowGraphLayoutMode.value = state.workflowGraphLayoutMode === "horizontal" ? "horizontal" : "vertical";
        workflowGraphLayoutMode.addEventListener("change", () => {
          state.workflowGraphLayoutMode = workflowGraphLayoutMode.value === "horizontal" ? "horizontal" : "vertical";
        });
      }

      if (workflowGraphInitialZoomMode instanceof HTMLSelectElement) {
        workflowGraphInitialZoomMode.value = state.workflowGraphInitialZoomMode === "fit-width" ? "fit-width" : "actual-size";
        workflowGraphInitialZoomMode.addEventListener("change", () => {
          state.workflowGraphInitialZoomMode = workflowGraphInitialZoomMode.value === "fit-width" ? "fit-width" : "actual-size";
        });
      }

      if (userStoryListViewMode instanceof HTMLSelectElement) {
        userStoryListViewMode.value = state.userStoryListViewMode === "phase" ? "phase" : "category";
        userStoryListViewMode.addEventListener("change", () => {
          state.userStoryListViewMode = userStoryListViewMode.value === "phase" ? "phase" : "category";
        });
      }

      if (visualTimelineEnabled instanceof HTMLSelectElement) {
        visualTimelineEnabled.value = state.visualTimelineEnabled ? "true" : "false";
        visualTimelineEnabled.addEventListener("change", () => {
          state.visualTimelineEnabled = visualTimelineEnabled.value === "true";
        });
      }

      if (requireApprovalBranchAcceptance instanceof HTMLSelectElement) {
        requireApprovalBranchAcceptance.value = state.requireExplicitApprovalBranchAcceptance ? "true" : "false";
        requireApprovalBranchAcceptance.addEventListener("change", () => {
          state.requireExplicitApprovalBranchAcceptance = requireApprovalBranchAcceptance.value === "true";
        });
      }

      if (autoRefinementEnabled instanceof HTMLSelectElement) {
        autoRefinementEnabled.value = state.autoRefinementAnswersEnabled ? "true" : "false";
        autoRefinementEnabled.addEventListener("change", () => {
          state.autoRefinementAnswersEnabled = autoRefinementEnabled.value === "true";
          render();
        });
      }

      if (autoPlayEnabled instanceof HTMLSelectElement) {
        autoPlayEnabled.value = state.autoPlayEnabled ? "true" : "false";
        autoPlayEnabled.addEventListener("change", () => {
          state.autoPlayEnabled = autoPlayEnabled.value === "true";
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

      if (destructiveRewindEnabled instanceof HTMLSelectElement) {
        destructiveRewindEnabled.value = state.destructiveRewindEnabled ? "true" : "false";
        destructiveRewindEnabled.addEventListener("change", () => {
          state.destructiveRewindEnabled = destructiveRewindEnabled.value === "true";
        });
      }

      if (pauseOnFailedReview instanceof HTMLSelectElement) {
        pauseOnFailedReview.value = state.pauseOnFailedReview ? "true" : "false";
        pauseOnFailedReview.addEventListener("change", () => {
          state.pauseOnFailedReview = pauseOnFailedReview.value === "true";
        });
      }

      if (reviewLearningEnabled instanceof HTMLSelectElement) {
        reviewLearningEnabled.value = state.reviewLearningEnabled ? "true" : "false";
        reviewLearningEnabled.addEventListener("change", () => {
          state.reviewLearningEnabled = reviewLearningEnabled.value === "true";
        });
      }

      if (reviewLearningSkillPath instanceof HTMLInputElement) {
        reviewLearningSkillPath.value = state.reviewLearningSkillPath || ".codex/skills/sdd-phase-agents/SKILL.md";
        reviewLearningSkillPath.addEventListener("input", () => {
          state.reviewLearningSkillPath = reviewLearningSkillPath.value;
        });
        reviewLearningSkillPath.addEventListener("change", () => {
          state.reviewLearningSkillPath = reviewLearningSkillPath.value.trim() || ".codex/skills/sdd-phase-agents/SKILL.md";
          reviewLearningSkillPath.value = state.reviewLearningSkillPath;
        });
      }

      if (completedUsLockOnCompleted instanceof HTMLSelectElement) {
        completedUsLockOnCompleted.value = state.completedUsLockOnCompleted ? "true" : "false";
        completedUsLockOnCompleted.addEventListener("change", () => {
          state.completedUsLockOnCompleted = completedUsLockOnCompleted.value === "true";
        });
      }

      const fallbackProblem = hasFallbackProblem();
      const autoRefinementProblem = hasAutoRefinementProblem();
      const permissionIssues = validatePermissionIssues();
      if (warning instanceof HTMLElement) {
        warning.classList.toggle("warning-banner--visible", fallbackProblem);
      }
      const defaultWrapper = document.querySelector('[data-phase-wrapper="defaultProfile"]');
      if (defaultWrapper instanceof HTMLElement) {
        defaultWrapper.classList.toggle("phase-field--invalid", fallbackProblem);
      }
      if (autoRefinementWrapper instanceof HTMLElement) {
        autoRefinementWrapper.classList.toggle("phase-field--invalid", autoRefinementProblem);
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
        saveButton.disabled = fallbackProblem || autoRefinementProblem || permissionIssues.length > 0;
        saveButton.title = fallbackProblem
          ? "Define the default fallback profile before saving."
          : autoRefinementProblem
            ? "Select the profile that should answer refinement questions."
            : permissionIssues.length > 0
              ? permissionIssues[0].message
            : "";
      }
      if (saveError instanceof HTMLElement) {
        const errorMessage = fallbackProblem
          ? "Define the default fallback profile before saving."
          : autoRefinementProblem
            ? "Select the profile that should answer refinement questions."
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
          if (Array.isArray(state.expandedProfileIndexes)) {
            state.expandedProfileIndexes.splice(index, 1);
          }
          pruneMissingAssignments();
          render();
        });
      }

      for (const card of profilesHost.querySelectorAll("[data-profile-index]")) {
        if (!(card instanceof HTMLDetailsElement)) {
          continue;
        }
        const index = Number(card.dataset.profileIndex ?? "-1");
        if (index < 0) {
          continue;
        }
        card.addEventListener("toggle", () => {
          if (!Array.isArray(state.expandedProfileIndexes)) {
            state.expandedProfileIndexes = [];
          }
          state.expandedProfileIndexes[index] = card.open;
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

      if (typeof state.pendingFocusProfileIndex === "number" && state.pendingFocusProfileIndex >= 0) {
        const targetCard = profilesHost.querySelector('[data-profile-index="' + state.pendingFocusProfileIndex + '"]');
        if (targetCard instanceof HTMLDetailsElement) {
          targetCard.open = true;
          requestAnimationFrame(() => {
            targetCard.scrollIntoView({ behavior: "smooth", block: "center" });
            const firstField = targetCard.querySelector('[data-profile-field="name"]');
            if (firstField instanceof HTMLInputElement || firstField instanceof HTMLSelectElement) {
              firstField.focus();
              if (firstField instanceof HTMLInputElement) {
                firstField.select();
              }
            }
          });
        }
        state.pendingFocusProfileIndex = null;
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

      const autoRefinementProfile = String(state.autoRefinementAnswersProfile || "").trim();
      if (autoRefinementProfile && renameMap.has(autoRefinementProfile)) {
        state.autoRefinementAnswersProfile = renameMap.get(autoRefinementProfile);
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
      if (state.autoRefinementAnswersProfile && !names.has(state.autoRefinementAnswersProfile)) {
        state.autoRefinementAnswersProfile = "";
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
      const nextIndex = state.modelProfiles.length;
      state.modelProfiles.push({
        name: "",
        provider: "codex",
        baseUrl: "",
        apiKey: "",
        model: "",
        reasoningEffort: "",
        repositoryAccess: "none"
      });
      if (!Array.isArray(state.expandedProfileIndexes)) {
        state.expandedProfileIndexes = [];
      }
      state.expandedProfileIndexes = state.modelProfiles.map((_, index) => index === nextIndex);
      state.pendingFocusProfileIndex = nextIndex;
      render();
    });

    document.getElementById("execution-settings-form")?.addEventListener("submit", (event) => {
      event.preventDefault();
      syncFromDom();
      if (hasFallbackProblem() || hasAutoRefinementProblem() || validatePermissionIssues().length > 0) {
        return;
      }
      vscode.postMessage({
        command: "saveExecutionSettings",
        modelProfiles: state.modelProfiles,
        phaseModelAssignments: state.phaseModelAssignments,
        refinementTolerance: state.refinementTolerance,
        reviewTolerance: state.reviewTolerance,
        watcherEnabled: state.watcherEnabled,
        attentionNotificationsEnabled: state.attentionNotificationsEnabled,
        contextSuggestionsEnabled: state.contextSuggestionsEnabled,
        workflowGraphLayoutMode: state.workflowGraphLayoutMode,
        workflowGraphInitialZoomMode: state.workflowGraphInitialZoomMode,
        userStoryListViewMode: state.userStoryListViewMode,
        visualTimelineEnabled: state.visualTimelineEnabled,
        requireExplicitApprovalBranchAcceptance: state.requireExplicitApprovalBranchAcceptance,
        autoRefinementAnswersEnabled: state.autoRefinementAnswersEnabled,
        autoRefinementAnswersProfile: state.autoRefinementAnswersProfile,
        autoPlayEnabled: state.autoPlayEnabled,
        autoReviewEnabled: state.autoReviewEnabled,
        maxImplementationReviewCycles: state.maxImplementationReviewCycles,
        destructiveRewindEnabled: state.destructiveRewindEnabled,
        pauseOnFailedReview: state.pauseOnFailedReview,
        reviewLearningEnabled: state.reviewLearningEnabled,
        reviewLearningSkillPath: state.reviewLearningSkillPath,
        completedUsLockOnCompleted: state.completedUsLockOnCompleted
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
  refinementTolerance = "balanced",
  reviewTolerance = "balanced",
  watcherEnabled = true,
  attentionNotificationsEnabled = true,
  contextSuggestionsEnabled = true,
  workflowGraphLayoutMode: "horizontal" | "vertical" = "vertical",
  workflowGraphInitialZoomMode: "actual-size" | "fit-width" = "actual-size",
  userStoryListViewMode: "category" | "phase" = "category",
  visualTimelineEnabled = false,
  requireExplicitApprovalBranchAcceptance = false,
  autoRefinementAnswersEnabled = false,
  autoRefinementAnswersProfile?: string | null,
  autoPlayEnabled = false,
  autoReviewEnabled = false,
  maxImplementationReviewCycles?: number | null,
  destructiveRewindEnabled = false,
  pauseOnFailedReview = false,
  reviewLearningEnabled = true,
  reviewLearningSkillPath?: string | null,
  completedUsLockOnCompleted = false
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
    refinementProfile: normalizeOptionalAssignment(phaseModelAssignments.refinementProfile),
    specProfile: normalizeOptionalAssignment(phaseModelAssignments.specProfile),
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
  if (autoRefinementAnswersEnabled && !normalizeOptionalAssignment(autoRefinementAnswersProfile)) {
    throw new Error("Select the profile that should answer refinement questions before saving execution settings.");
  }
  if (permissionIssues.length > 0) {
    throw new Error(permissionIssues[0]?.message ?? "Execution settings include a phase model permission mismatch.");
  }

  await configuration.update("execution.modelProfiles", normalizedProfiles, vscode.ConfigurationTarget.Workspace);
  await configuration.update("execution.phaseModels", normalizedAssignments, vscode.ConfigurationTarget.Workspace);
  await configuration.update("execution.refinementTolerance", refinementTolerance, vscode.ConfigurationTarget.Workspace);
  await configuration.update("execution.reviewTolerance", reviewTolerance, vscode.ConfigurationTarget.Workspace);
  await configuration.update("ui.workflowGraphLayoutMode", workflowGraphLayoutMode, vscode.ConfigurationTarget.Global);
  await configuration.update("ui.workflowGraphInitialZoomMode", workflowGraphInitialZoomMode, vscode.ConfigurationTarget.Global);
  await configuration.update("ui.userStoryListViewMode", userStoryListViewMode, vscode.ConfigurationTarget.Global);
  await configuration.update("ui.visualTimelineEnabled", visualTimelineEnabled, vscode.ConfigurationTarget.Global);
  await configuration.update("ui.enableWatcher", watcherEnabled, vscode.ConfigurationTarget.Global);
  await configuration.update("ui.notifyOnAttention", attentionNotificationsEnabled, vscode.ConfigurationTarget.Global);
  await configuration.update("features.enableContextSuggestions", contextSuggestionsEnabled, vscode.ConfigurationTarget.Global);
  await configuration.update("features.requireApprovalBranchAcceptance", requireExplicitApprovalBranchAcceptance, vscode.ConfigurationTarget.Workspace);
  await configuration.update("features.autoRefinementAnswersEnabled", autoRefinementAnswersEnabled, vscode.ConfigurationTarget.Workspace);
  await configuration.update(
    "execution.autoRefinementAnswersProfile",
    normalizeOptionalAssignment(autoRefinementAnswersProfile),
    vscode.ConfigurationTarget.Workspace);
  await configuration.update("features.autoPlayEnabled", autoPlayEnabled, vscode.ConfigurationTarget.Workspace);
  await configuration.update("features.autoReviewEnabled", autoReviewEnabled, vscode.ConfigurationTarget.Workspace);
  await configuration.update(
    "features.maxImplementationReviewCycles",
    normalizePositiveInteger(maxImplementationReviewCycles) ?? 5,
    vscode.ConfigurationTarget.Workspace);
  await configuration.update("features.destructiveRewindEnabled", destructiveRewindEnabled, vscode.ConfigurationTarget.Workspace);
  await configuration.update("features.pauseOnFailedReview", pauseOnFailedReview, vscode.ConfigurationTarget.Workspace);
  await configuration.update("features.reviewLearningEnabled", reviewLearningEnabled, vscode.ConfigurationTarget.Workspace);
  await configuration.update(
    "features.reviewLearningSkillPath",
    normalizeOptionalAssignment(reviewLearningSkillPath) ?? ".codex/skills/sdd-phase-agents/SKILL.md",
    vscode.ConfigurationTarget.Workspace);
  await configuration.update(
    "features.completedUsLockOnCompleted",
    completedUsLockOnCompleted,
    vscode.ConfigurationTarget.Workspace);
  await configuration.update("ui.workflowGraphLayoutMode", undefined, vscode.ConfigurationTarget.Workspace);
  await configuration.update("ui.workflowGraphInitialZoomMode", undefined, vscode.ConfigurationTarget.Workspace);
  await configuration.update("ui.userStoryListViewMode", undefined, vscode.ConfigurationTarget.Workspace);
  await configuration.update("ui.visualTimelineEnabled", undefined, vscode.ConfigurationTarget.Workspace);
  await configuration.update("ui.enableWatcher", undefined, vscode.ConfigurationTarget.Workspace);
  await configuration.update("ui.notifyOnAttention", undefined, vscode.ConfigurationTarget.Workspace);
  await configuration.update("features.enableContextSuggestions", undefined, vscode.ConfigurationTarget.Workspace);
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
