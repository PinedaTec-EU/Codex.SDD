import type { PhaseExecutionReadiness, UserStoryWorkflowDetails, WorkflowPhaseDetails } from "./backendClient";
import { escapeHtml, escapeHtmlAttr as escapeHtmlAttribute } from "./htmlEscape";
import { buildCapturePhaseSections } from "./workflow-view/capturePhaseView";
import { buildClarificationPhaseSections } from "./workflow-view/clarificationPhaseView";
import { buildImplementationPhaseSections } from "./workflow-view/implementationPhaseView";
import { fileIcon, firstPhaseRewindIcon, pauseIcon, playIcon, rewindIcon, stopIcon } from "./workflow-view/icons";
import { renderMarkdownToHtml } from "./workflow-view/markdownRenderer";
import type { ApprovalQuestionItem, PhaseIterationItem, PhaseSectionFragments, WorkflowViewState } from "./workflow-view/models";
import { buildPrPreparationPhaseSections } from "./workflow-view/prPreparationPhaseView";
import { hasReachedImplementationReviewCycleLimit } from "./workflowAutomation";
import { canPauseWorkflowExecutionPhase, resolveWorkflowExecutionPhaseId } from "./workflowPlaybackState";
import { resolveWorkflowRejectPlan } from "./workflowRejectPlan";
import { buildRefinementPhaseSections } from "./workflow-view/refinementPhaseView";
import { buildReleaseApprovalPhaseSections } from "./workflow-view/releaseApprovalPhaseView";
import { buildReviewPhaseSections } from "./workflow-view/reviewPhaseView";
import { buildTechnicalDesignPhaseSections } from "./workflow-view/technicalDesignPhaseView";
import { buildWebviewTypographyRootCss } from "./webviewTypography";

export { escapeHtml };

interface ExecutionOverlayModel {
  readonly usId: string;
  readonly title: string;
  readonly phaseId: string;
  readonly tone: "playing" | "paused" | "stopping";
  readonly startedAtMs: number | null;
  readonly showElapsed: boolean;
  readonly messages: readonly string[];
}

interface ArtifactQuestionBlock {
  readonly state: string | null;
  readonly decision: string | null;
  readonly reason: string | null;
  readonly questions: readonly string[];
}

type PhaseVisualTone = "active" | "waiting-user" | "paused" | "blocked" | "completed" | "pending" | "disabled";

type PhasePosition = { left: number; top: number };
type PhaseColumn = "left" | "right";
type LayoutPhaseDescriptor = Pick<WorkflowPhaseDetails, "phaseId" | "expectsHumanIntervention">;
type PhaseGraphLayout = {
  readonly positions: Record<string, PhasePosition>;
  readonly width: number;
  readonly height: number;
};
type GraphAnchor = "entry-top" | "entry-left" | "entry-right" | "exit-right" | "exit-left" | "exit-bottom-left" | "exit-bottom-mid" | "exit-bottom-right";
type PhaseLayoutConfig = {
  readonly columns: Record<PhaseColumn, number>;
  readonly topOffset: number;
  readonly sameColumnGap: number;
  readonly overlapRatio: number;
  readonly rightPadding: number;
  readonly bottomPadding: number;
};

const phaseNodeWidth = 188;
const phaseNodeHeight = 146;
const mobilePhaseNodeWidth = 166;
const desktopLayoutConfig: PhaseLayoutConfig = {
  columns: { left: 38, right: 400 },
  topOffset: 40,
  sameColumnGap: 32,
  overlapRatio: 0.30,
  rightPadding: 88,
  bottomPadding: 96
};
const mobileLayoutConfig: PhaseLayoutConfig = {
  columns: { left: 16, right: 192 },
  topOffset: 16,
  sameColumnGap: 26,
  overlapRatio: 0.30,
  rightPadding: 88,
  bottomPadding: 96
};
const defaultPhaseSequence: readonly LayoutPhaseDescriptor[] = [
  { phaseId: "capture", expectsHumanIntervention: false },
  { phaseId: "clarification", expectsHumanIntervention: true },
  { phaseId: "refinement", expectsHumanIntervention: true },
  { phaseId: "technical-design", expectsHumanIntervention: false },
  { phaseId: "implementation", expectsHumanIntervention: false },
  { phaseId: "review", expectsHumanIntervention: false },
  { phaseId: "release-approval", expectsHumanIntervention: true },
  { phaseId: "pr-preparation", expectsHumanIntervention: false }
] as const;
const defaultDesktopLayout = buildPhaseLayout(defaultPhaseSequence, desktopLayoutConfig, phaseNodeWidth);
const defaultMobileLayout = buildPhaseLayout(defaultPhaseSequence, mobileLayoutConfig, mobilePhaseNodeWidth);
const desktopGraphHeight = defaultDesktopLayout.height;
const mobileGraphHeight = defaultMobileLayout.height;
const desktopGraphWidth = defaultDesktopLayout.width;
const mobileGraphWidth = defaultMobileLayout.width;

function computeGraphHeight(positions: Record<string, PhasePosition>, nodeHeight: number, bottomPadding: number): number {
  const maxTop = Math.max(...Object.values(positions).map((position) => position.top));
  return maxTop + nodeHeight + bottomPadding;
}

function computeGraphWidth(positions: Record<string, PhasePosition>, nodeWidth: number, rightPadding: number): number {
  const maxLeft = Math.max(...Object.values(positions).map((position) => position.left));
  return maxLeft + nodeWidth + rightPadding;
}

function resolvePhaseColumn(expectsHumanIntervention: boolean): PhaseColumn {
  return expectsHumanIntervention ? "right" : "left";
}

function buildPhaseLayout(
  phases: readonly LayoutPhaseDescriptor[],
  config: PhaseLayoutConfig,
  nodeWidth: number
): PhaseGraphLayout {
  const positions: Record<string, PhasePosition> = {};
  let previousPhase: LayoutPhaseDescriptor | null = null;

  for (const phase of phases) {
    const column = resolvePhaseColumn(phase.expectsHumanIntervention);
    const left = config.columns[column];
    let top = config.topOffset;

    if (previousPhase) {
      const previousPosition = positions[previousPhase.phaseId];
      const previousColumn = resolvePhaseColumn(previousPhase.expectsHumanIntervention);
      const sameColumn = previousColumn === column;
      const verticalStep = sameColumn
        ? phaseNodeHeight + config.sameColumnGap
        : phaseNodeHeight * (1 - config.overlapRatio);
      top = previousPosition.top + Math.round(verticalStep);
    }

    positions[phase.phaseId] = { left, top };
    previousPhase = phase;
  }

  return {
    positions,
    width: computeGraphWidth(positions, nodeWidth, config.rightPadding),
    height: computeGraphHeight(positions, phaseNodeHeight, config.bottomPadding)
  };
}

function formatDuration(durationMs: number): string {
  if (durationMs < 1_000) {
    return `${durationMs} ms`;
  }

  if (durationMs < 60_000) {
    return `${(durationMs / 1_000).toFixed(durationMs >= 10_000 ? 1 : 2)} s`;
  }

  const minutes = Math.floor(durationMs / 60_000);
  const seconds = ((durationMs % 60_000) / 1_000).toFixed(1);
  return `${minutes}m ${seconds}s`;
}

function formatMetricNumber(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

function formatTokensPerSecond(outputTokens: number, durationMs: number): string {
  if (durationMs <= 0) {
    return "n/a";
  }

  return `${(outputTokens / (durationMs / 1_000)).toFixed(1)} tok/s`;
}

function formatUtcTimestamp(value: string | null | undefined): string {
  if (!value) {
    return "n/a";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toISOString().replace(".000Z", "Z");
}

function sumTokenUsage(usages: readonly { inputTokens: number; outputTokens: number; totalTokens: number }[]): { inputTokens: number; outputTokens: number; totalTokens: number } {
  return usages.reduce((aggregate, usage) => ({
    inputTokens: aggregate.inputTokens + usage.inputTokens,
    outputTokens: aggregate.outputTokens + usage.outputTokens,
    totalTokens: aggregate.totalTokens + usage.totalTokens
  }), { inputTokens: 0, outputTokens: 0, totalTokens: 0 });
}

type UsageAggregate = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  durationMs: number;
  events: number;
};

function aggregateWorkflowUsage(
  events: readonly {
    readonly phase: string | null;
    readonly usage: { inputTokens: number; outputTokens: number; totalTokens: number } | null;
    readonly durationMs: number | null;
    readonly execution?: { readonly profileName: string | null; readonly model: string } | null;
  }[],
  state: WorkflowViewState
): {
  readonly overall: UsageAggregate;
  readonly byModel: readonly { label: string; aggregate: UsageAggregate }[];
  readonly byPhase: readonly { phaseId: string; aggregate: UsageAggregate }[];
} {
  const overall = { inputTokens: 0, outputTokens: 0, totalTokens: 0, durationMs: 0, events: 0 };
  const byModel = new Map<string, UsageAggregate>();
  const byPhase = new Map<string, UsageAggregate>();

  for (const event of events) {
    const hasMetrics = Boolean(event.usage) || event.durationMs !== null;
    if (!hasMetrics) {
      continue;
    }

    const usage = event.usage ?? { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
    const durationMs = event.durationMs ?? 0;
    overall.inputTokens += usage.inputTokens;
    overall.outputTokens += usage.outputTokens;
    overall.totalTokens += usage.totalTokens;
    overall.durationMs += durationMs;
    overall.events += 1;

    if (event.phase) {
      const phaseAggregate = byPhase.get(event.phase) ?? { inputTokens: 0, outputTokens: 0, totalTokens: 0, durationMs: 0, events: 0 };
      phaseAggregate.inputTokens += usage.inputTokens;
      phaseAggregate.outputTokens += usage.outputTokens;
      phaseAggregate.totalTokens += usage.totalTokens;
      phaseAggregate.durationMs += durationMs;
      phaseAggregate.events += 1;
      byPhase.set(event.phase, phaseAggregate);
    }

    const modelLabel = formatExecutionLabel(event.execution, {
      configuredModel: findConfiguredModelForProfile(state, event.execution?.profileName)
    }) ?? "unattributed";
    const modelAggregate = byModel.get(modelLabel) ?? { inputTokens: 0, outputTokens: 0, totalTokens: 0, durationMs: 0, events: 0 };
    modelAggregate.inputTokens += usage.inputTokens;
    modelAggregate.outputTokens += usage.outputTokens;
    modelAggregate.totalTokens += usage.totalTokens;
    modelAggregate.durationMs += durationMs;
    modelAggregate.events += 1;
    byModel.set(modelLabel, modelAggregate);
  }

  return {
    overall,
    byModel: [...byModel.entries()]
      .map(([label, aggregate]) => ({ label, aggregate }))
      .sort((left, right) => right.aggregate.totalTokens - left.aggregate.totalTokens),
    byPhase: [...byPhase.entries()]
      .map(([phaseId, aggregate]) => ({ phaseId, aggregate }))
      .sort((left, right) => right.aggregate.totalTokens - left.aggregate.totalTokens)
  };
}

function fileNameFromPath(filePath: string): string {
  const normalized = filePath.replace(/\\/g, "/");
  const segments = normalized.split("/");
  return segments.at(-1) ?? filePath;
}

function renderTokenSummaryRow(label: string, value: string): string {
  return `
    <div class="token-summary__row">
      <span class="token-summary__label">${escapeHtml(label)}</span>
      <span class="token-summary__value">${escapeHtml(value)}</span>
    </div>
  `;
}

function renderUsageDashboardTable(
  title: string,
  headers: readonly string[],
  rows: readonly string[][]
): string {
  return `
    <section class="detail-card detail-card--usage-table">
      <h3>${escapeHtml(title)}</h3>
      <div class="usage-table-wrap">
        <table class="usage-table">
          <thead>
            <tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("")}</tr>
          </thead>
          <tbody>
            ${rows.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`).join("")}
          </tbody>
        </table>
      </div>
    </section>
  `;
}

function buildPhaseIterations(workflow: UserStoryWorkflowDetails, phaseId: string): PhaseIterationItem[] {
  if (workflow.phaseIterations && workflow.phaseIterations.length > 0) {
    return [...workflow.phaseIterations]
      .filter((iteration) => iteration.phaseId === phaseId)
      .sort((left, right) => right.attempt - left.attempt)
      .map((iteration) => ({
        iterationKey: iteration.iterationKey,
        attempt: iteration.attempt,
        phaseId: iteration.phaseId,
        timestampUtc: iteration.timestampUtc,
        code: iteration.code,
        actor: iteration.actor,
        summary: iteration.summary,
        inputArtifactPath: iteration.inputArtifactPath,
        contextArtifactPaths: iteration.contextArtifactPaths,
        outputArtifactPath: iteration.outputArtifactPath,
        operationLogPath: iteration.operationLogPath,
        operationPrompt: iteration.operationPrompt,
        usage: iteration.usage,
        durationMs: iteration.durationMs,
        execution: iteration.execution
      }));
  }

  const seen = new Set<string>();
  const iterations: PhaseIterationItem[] = [];
  for (const event of [...workflow.events].reverse()) {
    if (event.phase !== phaseId) {
      continue;
    }

    const artifactPath = [...event.artifacts].reverse().find((candidate) => candidate.toLowerCase().endsWith(".md"));
    if (!artifactPath || seen.has(artifactPath)) {
      continue;
    }

    seen.add(artifactPath);
    iterations.push({
      iterationKey: `${phaseId}:${iterations.length + 1}:${event.timestampUtc}:${event.code}`,
      attempt: iterations.length + 1,
      phaseId,
      timestampUtc: event.timestampUtc,
      code: event.code,
      actor: event.actor,
      summary: event.summary,
      inputArtifactPath: null,
      contextArtifactPaths: [],
      outputArtifactPath: artifactPath,
      operationLogPath: null,
      operationPrompt: null,
      usage: event.usage,
      durationMs: event.durationMs,
      execution: event.execution
    });
  }

  return iterations;
}

function summarizePhaseTouches(
  workflow: UserStoryWorkflowDetails,
  phaseId: string
): {
  readonly total: number;
  readonly generated: number;
  readonly rewound: number;
  readonly regressed: number;
  readonly started: number;
  readonly operated: number;
} {
  return workflow.events.reduce((summary, event) => {
    if (event.phase !== phaseId) {
      return summary;
    }

    switch (event.code) {
      case "phase_completed":
        return {
          ...summary,
          total: summary.total + 1,
          generated: summary.generated + 1
        };
      case "artifact_operated":
        return {
          ...summary,
          total: summary.total + 1,
          operated: summary.operated + 1
        };
      case "phase_started":
        return {
          ...summary,
          total: summary.total + 1,
          started: summary.started + 1
        };
      case "workflow_rewound":
        return {
          ...summary,
          total: summary.total + 1,
          rewound: summary.rewound + 1
        };
      case "phase_regressed":
        return {
          ...summary,
          total: summary.total + 1,
          regressed: summary.regressed + 1
        };
      default:
        return summary;
    }
  }, {
    total: 0,
    generated: 0,
    rewound: 0,
    regressed: 0,
    started: 0,
    operated: 0
  });
}

function normalizeExecutionIdentity(value: string | null | undefined): string {
  return value?.trim().toLowerCase() ?? "";
}

function isSuspiciousExecutionModel(
  execution: { model: string; profileName?: string | null } | null | undefined,
  options?: {
    readonly actor?: string | null;
    readonly configuredModel?: string | null;
  }
): boolean {
  const model = normalizeExecutionIdentity(execution?.model);
  if (!model) {
    return false;
  }

  const actor = normalizeExecutionIdentity(options?.actor);
  const profileName = normalizeExecutionIdentity(execution?.profileName);
  const configuredModel = normalizeExecutionIdentity(options?.configuredModel);

  return model === actor
    || model === profileName
    || (configuredModel.length > 0 && model !== configuredModel);
}

function formatExecutionLabel(
  execution: { model: string; profileName?: string | null } | null | undefined,
  options?: {
    readonly actor?: string | null;
    readonly configuredModel?: string | null;
  }
): string | null {
  const configuredModel = options?.configuredModel?.trim() ?? "";
  if (execution?.profileName && configuredModel.length > 0) {
    return `${execution.profileName} / ${configuredModel}`;
  }

  if (!execution?.model || isSuspiciousExecutionModel(execution, options)) {
    return execution?.profileName?.trim() || configuredModel || null;
  }

  return execution.profileName
    ? `${execution.profileName} / ${execution.model}`
    : execution.model;
}

function findLatestPhaseExecutionLabel(
  workflow: UserStoryWorkflowDetails,
  phaseId: string,
  state: WorkflowViewState
): string | null {
  for (const event of [...workflow.events].reverse()) {
    if (event.phase !== phaseId) {
      continue;
    }

    const executionLabel = formatExecutionLabel(event.execution, {
      actor: event.actor,
      configuredModel: findConfiguredModelForProfile(state, event.execution?.profileName)
    });
    if (executionLabel) {
      return executionLabel;
    }
  }

  return null;
}

function findConfiguredModelForProfile(
  state: WorkflowViewState,
  profileName: string | null | undefined
): string | null {
  if (!profileName) {
    return null;
  }

  const model = state.modelProfiles?.find((profile) => profile.name === profileName)?.model?.trim();
  return model && model.length > 0 ? model : null;
}

function buildPhaseSpecificSections(
  workflow: UserStoryWorkflowDetails,
  selectedPhase: WorkflowPhaseDetails,
  state: WorkflowViewState,
  artifactPreviewHtml: string | null,
  artifactQuestionBlock: ArtifactQuestionBlock | null,
  refinementApprovalQuestions: readonly ApprovalQuestionItem[],
  unresolvedApprovalQuestionCount: number
): PhaseSectionFragments {
  switch (selectedPhase.phaseId) {
    case "capture":
      return buildCapturePhaseSections({
        workflow,
        selectedPhase,
        selectedArtifactContent: state.selectedArtifactContent,
        artifactPreviewHtml,
        buildArtifactPreviewSection
      });
    case "clarification":
      return buildClarificationPhaseSections({
        workflow,
        selectedPhase,
        state,
        heroTokenClass,
        escapeHtml,
        escapeHtmlAttribute
      });
    case "refinement":
      return buildRefinementPhaseSections({
        workflow,
        selectedPhase,
        state,
        artifactQuestionBlock,
        refinementApprovalQuestions,
        unresolvedApprovalQuestionCount,
        escapeHtml,
        escapeHtmlAttribute,
        heroTokenClass,
        formatUtcTimestamp
      });
    case "technical-design":
      return buildTechnicalDesignPhaseSections();
    case "implementation":
      return buildImplementationPhaseSections();
    case "review":
      return buildReviewPhaseSections({
        workflow,
        selectedPhase,
        state
      });
    case "release-approval":
      return buildReleaseApprovalPhaseSections();
    case "pr-preparation":
      return buildPrPreparationPhaseSections();
    default:
      return { beforeArtifact: [], afterArtifact: [] };
  }
}

const genericExecutionMessages = [
  "Untangling edge cases before they untangle the plan.",
  "Cross-checking prior artifacts for contradictions.",
  "Keeping the workflow honest while the provider thinks.",
  "Looking for missing assumptions before they become bugs.",
  "Trying not to wake unnecessary regressions.",
  "Reconciling scope, artifacts, and branch intent.",
  "Reading the room, the repo, and the acceptance criteria.",
  "Negotiating with ambiguity so you do not have to.",
  "Making sure the next artifact can survive review.",
  "Inspecting context drift one breadcrumb at a time.",
  "Mapping dependencies that were not obvious at capture time.",
  "Trying to keep the branch name and the output aligned.",
  "Double-checking the previous phase so this one lands cleanly.",
  "Following the trail from user intent to persisted artifact.",
  "Keeping the phase transition tidy while the clock keeps moving.",
  "Looking for the fastest valid route through the workflow.",
  "Stress-testing assumptions without bothering the human yet.",
  "Making the next checkpoint less surprising than the last one."
] as const;

const phaseExecutionMessages: Record<string, readonly string[]> = {
  capture: [
    "Turning the initial ask into something the workflow can actually execute.",
    "Pulling signal out of the first draft of the user story.",
    "Sorting intent from noise before refinement takes over.",
    "Trying to spot ambiguity while it is still cheap."
  ],
  clarification: [
    "Preparing the awkward but necessary questions.",
    "Looking for the one missing answer that blocks everything else.",
    "Trying to convert vague scope into answerable prompts.",
    "Holding the line until the user story becomes actionable."
  ],
  refinement: [
    "Turning the user story into a formal spec the rest of the flow can trust.",
    "Checking that acceptance criteria, constraints, and edge cases still agree.",
    "Trying to leave fewer surprises for technical design.",
    "Shaping the spec so approval is about scope, not cleanup."
  ],
  "technical-design": [
    "Lining up implementation choices before code starts moving.",
    "Comparing design options without starting an architecture novel.",
    "Trying to make the next code pass feel inevitable.",
    "Tracing the impact radius before implementation gets bold."
  ],
  implementation: [
    "Translating design intent into concrete repository changes.",
    "Trying to keep the patch surgical instead of theatrical.",
    "Looking for the smallest change that still moves the workflow forward.",
    "Keeping one eye on tests while the code takes shape."
  ],
  review: [
    "Reviewing the artifact like it did not come from our side.",
    "Trying to catch the regression before it catches release.",
    "Looking for the bug hiding behind a plausible diff.",
    "Stress-testing the result against the original ask."
  ],
  "release-approval": [
    "Preparing the output for a calmer release decision.",
    "Checking that the workflow left a trail a human can trust.",
    "Trying to make approval feel boring in the best possible way.",
    "Making sure release does not inherit unresolved ambiguity."
  ],
  "pr-preparation": [
    "Composing the final handoff for branch and PR readiness.",
    "Trying to leave the branch in a shape future humans appreciate.",
    "Packaging the outcome so review starts with context, not confusion.",
    "Making the last mile look intentional."
  ]
};

function buildExecutionOverlay(
  workflow: UserStoryWorkflowDetails,
  state: WorkflowViewState,
  playbackState: "idle" | "playing" | "paused" | "stopping"
): string {
  if (playbackState === "idle") {
    return "";
  }

  const currentPhase = workflow.phases.find((phase) => phase.isCurrent) ?? workflow.phases[0];
  const effectiveExecutionPhaseId = resolveEffectiveExecutionPhaseId(workflow, state, playbackState);
  const pausedExecutionPhaseId = resolvePausedExecutionPhaseId(workflow, state, playbackState);
  const overlayPhase = playbackState === "playing" && effectiveExecutionPhaseId
    ? workflow.phases.find((phase) => phase.phaseId === effectiveExecutionPhaseId) ?? currentPhase
    : playbackState === "paused" && pausedExecutionPhaseId
      ? workflow.phases.find((phase) => phase.phaseId === pausedExecutionPhaseId) ?? currentPhase
    : currentPhase;
  const pausedOnFailedReview = playbackState === "paused"
    && currentPhase.phaseId === "review"
    && workflow.controls.blockingReason === "review_failed";
  const overlay: ExecutionOverlayModel = playbackState === "playing"
    ? {
      usId: workflow.usId,
      title: `Executing ${overlayPhase.title}`,
      phaseId: overlayPhase.phaseId,
      tone: "playing",
      startedAtMs: state.playbackStartedAtMs ?? null,
      showElapsed: true,
      messages: [...(phaseExecutionMessages[overlayPhase.phaseId] ?? []), ...genericExecutionMessages]
    }
    : playbackState === "paused"
      ? {
        usId: workflow.usId,
        title: pausedOnFailedReview
          ? "Review failed"
          : pausedExecutionPhaseId && pausedExecutionPhaseId !== currentPhase.phaseId
          ? `Paused before ${overlayPhase.title}`
          : `Paused after ${currentPhase.title}`,
        phaseId: overlayPhase.phaseId,
        tone: "paused",
        startedAtMs: state.playbackStartedAtMs ?? null,
        showElapsed: false,
        messages: pausedOnFailedReview
          ? [
            "Review failed and playback is paused by configuration.",
            "A developer needs to inspect the failed validation checklist before this workflow can continue.",
            "Fix or regenerate the affected artifact, then rerun review."
          ]
          : pausedExecutionPhaseId && pausedExecutionPhaseId !== currentPhase.phaseId
          ? [
            "This phase has an ad hoc pause armed, so SpecForge.AI is holding before execution starts.",
            "Playback is paused at the phase boundary. Resume when you want this marked phase to run.",
            "The workflow is staged on the next phase and waiting for you to release it."
          ]
          : [
            "The current phase finished, but SpecForge.AI will wait before launching the next one.",
            "Playback is paused at the phase boundary. Resume when you want the workflow moving again.",
            "Holding the line here so the next phase does not start on its own."
          ]
      }
      : {
        usId: workflow.usId,
        title: `Stopping after ${currentPhase.title}`,
        phaseId: currentPhase.phaseId,
        tone: "stopping",
        startedAtMs: state.playbackStartedAtMs ?? null,
        showElapsed: false,
        messages: [
          "Stopping autoplay and asking the local runner to stand down.",
          "Trying to leave the in-flight work in a recoverable state.",
          "SpecForge.AI is winding down the current execution loop."
        ]
      };

  const overlayPhaseProfileLabel = phaseModelProfileLabel(overlayPhase, state);
  const overlayConfiguredModel = findConfiguredModelForProfile(state, overlayPhaseProfileLabel);
  const overlayPhaseConfiguredLabel = formatExecutionLabel(
    overlayConfiguredModel ? { model: overlayConfiguredModel, profileName: overlayPhaseProfileLabel } : null,
    { configuredModel: overlayConfiguredModel }
  );
  const overlayPhaseModelLabel = overlayPhaseConfiguredLabel
    ?? overlayPhaseProfileLabel;

  return `
    <div
      class="execution-overlay execution-overlay--${escapeHtmlAttribute(overlay.tone)}"
      data-execution-overlay
      data-us-id="${escapeHtmlAttribute(overlay.usId)}"
      data-phase-id="${escapeHtmlAttribute(overlay.phaseId)}"
      data-anchor-phase-id="${escapeHtmlAttribute(overlay.phaseId)}"
      data-tone="${escapeHtmlAttribute(overlay.tone)}"
      data-started-at-ms="${overlay.startedAtMs ?? ""}"
      data-dismissible="${overlay.tone === "playing" ? "false" : "true"}"
      data-show-elapsed="${overlay.showElapsed ? "true" : "false"}"
      data-messages='${escapeHtmlAttribute(JSON.stringify(overlay.messages))}'>
      ${overlay.tone === "playing" ? "" : `<button type="button" class="execution-overlay__dismiss" data-execution-overlay-dismiss>Dismiss</button>`}
      <div class="execution-overlay__pulse" aria-hidden="true"></div>
      <div class="execution-overlay__body">
        <span class="execution-overlay__eyebrow">SpecForge.AI Runner</span>
        <strong class="execution-overlay__title">${escapeHtml(overlay.title)}</strong>
        <p class="execution-overlay__message" data-execution-message>${escapeHtml(overlay.messages[0] ?? "Processing workflow phase.")}</p>
      </div>
      ${overlay.showElapsed ? `<span class="execution-overlay__elapsed" data-execution-elapsed>00:00</span>` : ""}
      ${overlayPhaseModelLabel ? `<span class="execution-overlay__phase-model">${escapeHtml(overlayPhaseModelLabel)}</span>` : ""}
    </div>
  `;
}

function heroTokenClass(value: string): string {
  const tone = heroTokenTone(value);
  return tone ? ` token--${tone}` : "";
}

function heroTokenTone(value: string): "attention" | "paused" | "blocked" | "success" | "active" | null {
  switch (value) {
    case "waiting-user":
    case "needs-user-input":
    case "needs_clarification":
    case "runner:paused":
      return "attention";
    case "ready":
    case "ready-for-execution":
    case "ready_for_refinement":
      return "success";
    case "runner:stopping":
      return "paused";
    case "blocked":
      return "blocked";
    case "completed":
      return "success";
    case "current":
    case "active":
    case "running":
    case "executing":
    case "in-progress":
      return "active";
    default:
      return null;
  }
}

function phaseSecurityTone(readiness: PhaseExecutionReadiness | null | undefined): "success" | "blocked" | "attention" | null {
  if (!readiness?.requiredPermissions?.modelExecutionRequired) {
    return null;
  }

  return readiness.canExecute ? "success" : "blocked";
}

function formatPhaseSecurityState(readiness: PhaseExecutionReadiness | null | undefined): string | null {
  if (!readiness?.requiredPermissions?.modelExecutionRequired) {
    return null;
  }

  return readiness.canExecute ? "security ok" : "security blocked";
}

function buildPhaseSecuritySummary(readiness: PhaseExecutionReadiness | null | undefined): string {
  if (!readiness?.requiredPermissions?.modelExecutionRequired) {
    return "";
  }

  const requiredAccess = readiness.requiredPermissions.repositoryAccess;
  const effectiveAccess = readiness.assignedModelSecurity?.repositoryAccess ?? "unknown";
  const provider = readiness.assignedModelSecurity?.providerKind ?? "unknown";
  const profile = readiness.assignedModelSecurity?.profileName ?? "default";
  const model = readiness.assignedModelSecurity?.model ?? "default";
  const nativeCliState = readiness.assignedModelSecurity?.nativeCliRequired
    ? readiness.assignedModelSecurity.nativeCliAvailable
      ? "native cli ready"
      : "native cli missing"
    : "http or local bridge";
  const tone = phaseSecurityTone(readiness) ?? "attention";
  const headline = readiness.canExecute
    ? "Phase security precheck passed."
    : "Phase security precheck failed.";

  return `
    <section class="detail-card detail-card--phase-security">
      <h3>Phase Security</h3>
      <div class="detail-meta">
        <span class="token token--${escapeHtmlAttribute(tone)}">${escapeHtml(headline)}</span>
        <span class="token">required ${escapeHtml(requiredAccess)}</span>
        <span class="token">assigned ${escapeHtml(effectiveAccess)}</span>
        <span class="token">${escapeHtml(provider)}</span>
        <span class="token">${escapeHtml(profile)}</span>
        <span class="token">${escapeHtml(model)}</span>
        <span class="token">${escapeHtml(nativeCliState)}</span>
      </div>
      ${readiness.validationMessage ? `<p class="panel-copy">${escapeHtml(readiness.validationMessage)}</p>` : ""}
    </section>
  `;
}

function isCurrentPhaseFailureBlocked(workflow: UserStoryWorkflowDetails, phase: WorkflowPhaseDetails): boolean {
  if (!phase.isCurrent) {
    return false;
  }

  if (workflow.controls.canContinue || workflow.controls.requiresApproval || !workflow.controls.blockingReason) {
    return false;
  }

  const blockingExecutionPhaseId = workflow.controls.executionPhase ?? null;
  return blockingExecutionPhaseId === null || blockingExecutionPhaseId === phase.phaseId;
}

function resolvePhaseVisualTone(
  workflowStatus: string,
  workflow: UserStoryWorkflowDetails,
  playbackState: "idle" | "playing" | "paused" | "stopping",
  phase: WorkflowPhaseDetails,
  disabled: boolean,
  executionPhaseId: string | null,
  pausedPhaseId: string | null,
  completedPhaseIds: ReadonlySet<string>
): PhaseVisualTone {
  if (disabled) {
    return "disabled";
  }

  if (completedPhaseIds.has(phase.phaseId)) {
    return "completed";
  }

  if (playbackState === "playing" && executionPhaseId === phase.phaseId) {
    return "active";
  }

  if ((playbackState === "paused" || playbackState === "stopping") && pausedPhaseId === phase.phaseId) {
    return "paused";
  }

  if (isCurrentPhaseFailureBlocked(workflow, phase)) {
    return "blocked";
  }

  if (phase.executionReadiness?.requiredPermissions?.modelExecutionRequired && !phase.executionReadiness.canExecute) {
    return "blocked";
  }

  if (phase.state === "completed") {
    return "completed";
  }

  if (playbackState === "playing") {
    return "pending";
  }

  if (!phase.isCurrent) {
    return "pending";
  }

  if (playbackState === "paused" || playbackState === "stopping") {
    return "paused";
  }

  switch (workflowStatus) {
    case "waiting-user":
    case "needs-user-input":
      return "waiting-user";
    case "blocked":
      return "blocked";
    case "completed":
      return "completed";
    case "paused":
    case "stopped":
    case "stopping":
      return "paused";
    case "active":
    case "running":
    case "executing":
    case "in-progress":
    case "current":
      return "active";
    default:
      return phase.state === "pending" ? "pending" : "active";
  }
}

function phaseToneLabel(
  tone: PhaseVisualTone,
  fallbackState: string,
  playbackState: "idle" | "playing" | "paused" | "stopping",
  isCurrent: boolean
): string {
  if (tone === "active") {
    if (playbackState === "playing") {
      return "executing";
    }

    if (isCurrent || fallbackState === "current") {
      return "ready";
    }

    return fallbackState;
  }

  if (tone === "disabled" || tone === "pending" || tone === "completed" || tone === "blocked") {
    return tone;
  }

  return tone;
}

function canRerunCurrentReview(
  workflow: UserStoryWorkflowDetails,
  selectedPhase: WorkflowPhaseDetails,
  playbackState: "idle" | "playing" | "paused" | "stopping"
): boolean {
  if (playbackState !== "idle") {
    return false;
  }

  if (!selectedPhase.isCurrent || selectedPhase.phaseId !== "review") {
    return false;
  }

  return workflow.controls.blockingReason === "review_failed"
    || workflow.controls.blockingReason === "review_result_missing"
    || workflow.controls.blockingReason === "review_missing_artifact";
}

function phaseSecondaryLabel(phase: WorkflowPhaseDetails): string {
  switch (phase.phaseId) {
    case "capture":
      return "Capture story intent";
    case "clarification":
      return "Resolve open questions";
    case "refinement":
      return "Shape approved scope";
    case "technical-design":
      return "Define technical approach";
    case "implementation":
      return "Build the solution";
    case "review":
      return "Validate shipped changes";
    case "release-approval":
      return "Approve release readiness";
    case "pr-preparation":
      return "Prepare branch handoff";
    default:
      return phase.phaseId;
  }
}

function phaseModelProfileLabel(phase: WorkflowPhaseDetails, state: WorkflowViewState): string | null {
  const assignments = state.phaseModelAssignments;
  if (!assignments) {
    return null;
  }

  switch (phase.phaseId) {
    case "capture":
      return assignments.captureProfileName ?? assignments.defaultProfileName;
    case "clarification":
      return assignments.clarificationProfileName ?? assignments.defaultProfileName;
    case "refinement":
      return assignments.refinementProfileName ?? assignments.defaultProfileName;
    case "technical-design":
      return assignments.technicalDesignProfileName ?? assignments.defaultProfileName;
    case "implementation":
      return assignments.implementationProfileName ?? assignments.defaultProfileName;
    case "review":
      return assignments.reviewProfileName ?? assignments.defaultProfileName;
    case "release-approval":
      return assignments.releaseApprovalProfileName ?? assignments.defaultProfileName;
    case "pr-preparation":
      return assignments.prPreparationProfileName ?? assignments.defaultProfileName;
    default:
      return assignments.defaultProfileName;
  }
}

function buildAssignedPhaseExecutionLabel(
  phase: WorkflowPhaseDetails,
  state: WorkflowViewState
): string | null {
  const profileName = phaseModelProfileLabel(phase, state);
  const configuredModel = findConfiguredModelForProfile(state, profileName);

  if (!profileName && !configuredModel) {
    return null;
  }

  return formatExecutionLabel(
    configuredModel ? { model: configuredModel, profileName } : { model: "", profileName },
    { configuredModel }
  ) ?? profileName ?? configuredModel;
}

function buildWorkflowHeroTitle(workflow: UserStoryWorkflowDetails): string {
  const normalizedTitle = workflow.title.trim();
  if (normalizedTitle.startsWith(`${workflow.usId} ·`) || normalizedTitle === workflow.usId) {
    return normalizedTitle;
  }

  return `${workflow.usId} · ${normalizedTitle}`;
}

function shouldRenderApprovalBranchEditor(
  workflow: UserStoryWorkflowDetails,
  selectedPhase: WorkflowPhaseDetails,
  selectedPhaseIsCurrent: boolean
): boolean {
  return selectedPhase.phaseId === "refinement"
    && selectedPhaseIsCurrent
    && workflow.controls.requiresApproval;
}

function buildArtifactPreviewSection(
  artifactPath: string,
  artifactPreviewHtml: string | null,
  artifactContent: string,
  options?: {
    readonly rawArtifact?: boolean;
    readonly footerNote?: string;
  }
): string {
  const rawArtifact = options?.rawArtifact ?? false;
  const footerNote = options?.footerNote?.trim() ?? "";
  const isMarkdownArtifact = artifactPath.trim().toLowerCase().endsWith(".md");
  const effectiveArtifactPreviewHtml = isMarkdownArtifact
    ? (artifactPreviewHtml ?? renderMarkdownToHtml(artifactContent))
    : null;
  const badgeLabel = rawArtifact ? "Raw Artifact" : "Preview";
  const badgeClass = rawArtifact ? " badge--muted" : "";

  return `
    <div class="detail-actions detail-actions--artifact">
      <div class="artifact-view-label">
        <span class="badge${badgeClass}">${badgeLabel}</span>
      </div>
      <button class="workflow-action-button workflow-action-button--document" data-command="openArtifact" data-path="${escapeHtmlAttribute(artifactPath)}">Open Artifact</button>
    </div>
    ${effectiveArtifactPreviewHtml
      ? `<div class="markdown-preview${rawArtifact ? " markdown-preview--raw-artifact" : ""}">${effectiveArtifactPreviewHtml}</div>`
      : `<pre class="artifact-preview${rawArtifact ? " artifact-preview--raw-artifact" : ""}">${escapeHtml(artifactContent)}</pre>`}
    ${footerNote ? `<p class="muted">${escapeHtml(footerNote)}</p>` : ""}
  `;
}

function buildEmbeddedArtifactSection(
  title: string,
  artifactPath: string,
  artifactContent: string,
  options?: {
    readonly rawArtifact?: boolean;
    readonly footerNote?: string;
    readonly compactTitle?: boolean;
  }
): string {
  const headingTag = options?.compactTitle ? "h4" : "h3";
  const artifactPreviewHtml = artifactPath.trim().toLowerCase().endsWith(".md")
    ? renderMarkdownToHtml(artifactContent)
    : null;

  return `
    <section class="detail-card detail-card--embedded-artifact">
      <${headingTag}>${escapeHtml(title)}</${headingTag}>
      ${buildArtifactPreviewSection(
        artifactPath,
        artifactPreviewHtml,
        artifactContent,
        options
      )}
    </section>
  `;
}

function buildArtifactCollectionSection(
  artifacts: readonly {
    readonly path: string;
    readonly content: string | null;
  }[],
  options?: {
    readonly emptyMessage?: string;
    readonly rawArtifact?: boolean;
  }
): string {
  if (artifacts.length === 0) {
    return `<p class="muted">${escapeHtml(options?.emptyMessage ?? "No artifacts are available.")}</p>`;
  }

  return `
    <div class="embedded-artifact-list">
      ${artifacts.map((artifact) => buildEmbeddedArtifactSection(
        fileNameFromPath(artifact.path),
        artifact.path,
        artifact.content ?? "Artifact content unavailable.",
        {
          rawArtifact: options?.rawArtifact,
          compactTitle: true
        }
      )).join("")}
    </div>
  `;
}

function buildWorkflowAuditRowsHtml(
  workflow: UserStoryWorkflowDetails,
  state: WorkflowViewState
): string {
  return workflow.events.length > 0
    ? workflow.events.map((event) => {
      const executionLabel = formatExecutionLabel(event.execution, {
        actor: event.actor,
        configuredModel: findConfiguredModelForProfile(state, event.execution?.profileName)
      });
      return `
      <div class="audit-row">
        <div class="audit-head">
          <span>${escapeHtml(event.timestampUtc)} · ${escapeHtml(event.code)}</span>
          <div class="audit-head__meta">
            ${event.actor ? `<span class="badge">${escapeHtml(event.actor)}</span>` : ""}
            ${event.phase ? `<span class="badge">${escapeHtml(event.phase)}</span>` : ""}
          </div>
        </div>
        <div class="audit-body">${escapeHtml(event.summary ?? "")}</div>
        ${event.usage || event.durationMs !== null || event.execution
          ? `<div class="audit-metrics">
              ${executionLabel ? `<span class="badge">model ${escapeHtml(executionLabel)}</span>` : ""}
              ${event.usage ? `<span class="badge">in/out ${escapeHtml(`${formatMetricNumber(event.usage.inputTokens)}/${formatMetricNumber(event.usage.outputTokens)}`)}</span>` : ""}
              ${event.usage ? `<span class="badge">total ${escapeHtml(formatMetricNumber(event.usage.totalTokens))}</span>` : ""}
              ${event.durationMs !== null ? `<span class="badge">${escapeHtml(formatDuration(event.durationMs))}</span>` : ""}
              ${event.usage && event.durationMs !== null ? `<span class="badge">${escapeHtml(formatTokensPerSecond(event.usage.outputTokens, event.durationMs))}</span>` : ""}
            </div>`
          : ""}
      </div>
    `;
    }).join("")
    : `<pre class="audit-log">${escapeHtml(workflow.rawTimeline)}</pre>`;
}

export function buildWorkflowAuditHtml(
  workflow: UserStoryWorkflowDetails,
  state: WorkflowViewState,
  typographyCssVars = ""
): string {
  const auditRows = buildWorkflowAuditRowsHtml(workflow, state);
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>
    :root {
      ${buildWebviewTypographyRootCss(typographyCssVars)}
    }
    * {
      box-sizing: border-box;
    }
    body {
      margin: 0;
      min-height: 100vh;
      height: 100vh;
      overflow: hidden;
      color: var(--vscode-editor-foreground);
      background:
        radial-gradient(circle at 8% 10%, rgba(114, 241, 184, 0.08), transparent 20%),
        radial-gradient(circle at 88% 18%, rgba(72, 131, 255, 0.09), transparent 24%),
        linear-gradient(180deg, rgba(10, 20, 24, 0.96), rgba(10, 14, 20, 1));
    }
    .audit-stream {
      display: flex;
      flex-direction: column;
      gap: 12px;
      min-height: 100vh;
      height: 100vh;
      overflow: auto;
      padding: 12px;
    }
    .audit-row {
      display: grid;
      gap: 10px;
      padding: 14px 16px;
      border-radius: 16px;
      border: 1px solid rgba(114, 241, 184, 0.14);
      background:
        linear-gradient(180deg, rgba(255, 255, 255, 0.025), rgba(255, 255, 255, 0.01)),
        rgba(12, 18, 24, 0.92);
    }
    .audit-head {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      align-items: center;
      flex-wrap: wrap;
      font-size: 0.82rem;
      color: rgba(255, 255, 255, 0.74);
    }
    .audit-head__meta {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }
    .audit-body {
      font-size: 0.92rem;
      line-height: 1.5;
      white-space: pre-wrap;
    }
    .audit-metrics {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    .audit-log {
      margin: 0;
      min-height: 100%;
      padding: 14px 16px;
      border-radius: 16px;
      border: 1px solid rgba(255, 255, 255, 0.06);
      background: rgba(0, 0, 0, 0.24);
      overflow: auto;
      font-size: 0.84rem;
      line-height: 1.55;
      white-space: pre-wrap;
      word-break: break-word;
    }
    .badge {
      border-radius: 999px;
      padding: 6px 12px;
      font-size: 0.78rem;
      background: rgba(255, 255, 255, 0.06);
      color: rgba(255, 255, 255, 0.9);
      border: 1px solid rgba(255, 255, 255, 0.06);
      backdrop-filter: blur(8px);
    }
  </style>
</head>
<body>
  <div class="audit-stream">${auditRows}</div>
</body>
</html>`;
}

export function buildWorkflowHtml(
  workflow: UserStoryWorkflowDetails,
  state: WorkflowViewState,
  playbackState: "idle" | "playing" | "paused" | "stopping",
  typographyCssVars = ""
): string {
  const effectiveExecutionPhaseId = resolveEffectiveExecutionPhaseId(workflow, state, playbackState);
  const pausedExecutionPhaseId = resolvePausedExecutionPhaseId(workflow, state, playbackState);
  const displayedCurrentPhaseId = resolveDisplayedCurrentPhaseId(workflow, effectiveExecutionPhaseId, pausedExecutionPhaseId, playbackState);
  const selectedPhaseId = playbackState === "playing"
    ? displayedCurrentPhaseId ?? state.selectedPhaseId
    : playbackState === "paused" && state.selectedPhaseId === workflow.currentPhase
      ? displayedCurrentPhaseId ?? state.selectedPhaseId
    : state.selectedPhaseId;
  const selectedPhase = workflow.phases.find((phase) => phase.phaseId === selectedPhaseId) ?? workflow.phases[0];
  const selectedPhaseIsCurrent = selectedPhase.phaseId === displayedCurrentPhaseId;
  const isClarificationDetail = selectedPhase.phaseId === "clarification" && workflow.clarification !== null;
  const phaseGraph = buildPhaseGraph(workflow, state, selectedPhase.phaseId, playbackState, effectiveExecutionPhaseId);
  const executionOverlay = buildExecutionOverlay(workflow, state, playbackState);
  const selectedPhaseVisualTone = resolvePhaseVisualTone(
    workflow.status,
    workflow,
    playbackState,
    selectedPhase,
    false,
    playbackState === "playing" ? effectiveExecutionPhaseId : null,
    pausedExecutionPhaseId,
    new Set(state.completedPhaseIds ?? [])
  );
  const selectedPhaseDisplayState = phaseToneLabel(
    selectedPhaseVisualTone,
    selectedPhase.state,
    playbackState,
    selectedPhase.isCurrent
  );
  const displayedPhaseId = playbackState === "playing" && effectiveExecutionPhaseId
    ? effectiveExecutionPhaseId
    : playbackState === "paused" && pausedExecutionPhaseId
      ? pausedExecutionPhaseId
    : workflow.currentPhase;
  const settingsBanner = state.executionSettingsPending && state.executionSettingsPendingMessage
    ? `
      <div class="settings-warning settings-warning--pending" role="status">
        <div class="settings-warning__icon">~</div>
        <div>
          <p class="eyebrow warning">Execution Setup Pending</p>
          <p class="warning-copy">${escapeHtml(state.executionSettingsPendingMessage)}</p>
          <div class="detail-actions">
            <button class="workflow-action-button workflow-action-button--document" data-command="openSettings">Open Execution Settings</button>
          </div>
        </div>
      </div>
    `
    : "";
  const implementationReviewLimitReached = workflow.currentPhase === "implementation"
    && hasReachedImplementationReviewCycleLimit(workflow, state.maxImplementationReviewCycles);
  const implementationReviewLimitBanner = implementationReviewLimitReached
    ? `
      <div class="settings-warning settings-warning--attention" role="status">
        <div class="settings-warning__icon">!</div>
        <div>
          <p class="eyebrow warning">Implementation Loop Paused</p>
          <p class="warning-copy">Automatic review is stopped because the implementation/review loop reached the configured limit (${escapeHtml(String(state.maxImplementationReviewCycles ?? "?"))}). The workflow remains at implementation. Use the manual action below if you want one extra review pass.</p>
          ${selectedPhaseIsCurrent && selectedPhase.phaseId === "implementation" && workflow.controls.canContinue
            ? `<div class="detail-actions"><button class="workflow-action-button workflow-action-button--progress" data-command="continue">Run One Extra Review Pass</button></div>`
            : ""}
        </div>
      </div>
    `
    : "";
  const shouldPulsePlay = playbackState === "idle" && workflow.controls.canContinue && !implementationReviewLimitReached;
  const playWarnsAboutImplementationLimit = playbackState === "idle" && implementationReviewLimitReached;
  const playDisabled = playbackState === "playing"
    || !state.settingsConfigured
    || (playbackState === "idle" && !workflow.controls.canContinue);
  const rerunReviewDisabled = playbackState === "playing"
    || !state.settingsConfigured;
  const isMarkdownArtifact = Boolean(selectedPhase.artifactPath?.toLowerCase().endsWith(".md"));
  const artifactPreviewHtml = isMarkdownArtifact
    ? renderMarkdownToHtml(state.selectedArtifactContent ?? "Artifact content unavailable.")
    : null;
  const artifactQuestionBlock = extractArtifactQuestionBlock(state.selectedArtifactContent);
  const refinementApprovalQuestions = selectedPhase.phaseId === "refinement"
    ? (workflow.approvalQuestions ?? []).map((item) => ({
      index: item.index,
      question: item.question,
      answer: item.answer,
      resolved: item.isResolved,
      answeredBy: item.answeredBy,
      answeredAtUtc: item.answeredAtUtc
    }))
    : [];
  const unresolvedApprovalQuestionCount = refinementApprovalQuestions.filter((item) => !item.resolved).length;
  const phaseIterations = buildPhaseIterations(workflow, selectedPhase.phaseId);
  const expandedIterationPhaseIds = new Set(state.expandedIterationPhaseIds ?? []);
  const isIterationRailExpanded = expandedIterationPhaseIds.has(selectedPhase.phaseId);
  const selectedIteration = (isIterationRailExpanded
    ? phaseIterations.find((iteration) => iteration.iterationKey === state.selectedIterationKey)
    : null)
    ?? phaseIterations[0]
    ?? null;
  const selectedPhaseTouches = summarizePhaseTouches(workflow, selectedPhase.phaseId);
  const selectedPhaseEvents = workflow.events.filter((event) => event.phase === selectedPhase.phaseId);
  const selectedPhaseMetricEvents = selectedPhaseEvents.filter((event) => event.usage || event.durationMs !== null);
  const workflowUsage = aggregateWorkflowUsage(workflow.events, state);
  const selectedPhaseUsageAggregate = sumTokenUsage(
    selectedPhaseMetricEvents
      .map((event) => event.usage)
      .filter((usage): usage is NonNullable<typeof usage> => Boolean(usage))
  );
  const selectedPhaseDurationAggregate = selectedPhaseMetricEvents.reduce(
    (aggregate, event) => aggregate + (event.durationMs ?? 0),
    0
  );
  const selectedPhaseIterationCount = selectedPhaseMetricEvents.length;
  const selectedPhaseRecordedIterationCount = phaseIterations.length;
  const selectedPhaseExecutionLabel = buildAssignedPhaseExecutionLabel(selectedPhase, state)
    ?? findLatestPhaseExecutionLabel(workflow, selectedPhase.phaseId, state);
  const hasTokenTelemetry = selectedPhaseMetricEvents.some((event) => event.usage);
  const rewindablePhaseIds = new Set(workflow.controls.rewindTargets);
  const canRewindSelectedPhase = rewindablePhaseIds.has(selectedPhase.phaseId);
  const phaseSpecificSections = buildPhaseSpecificSections(
    workflow,
    selectedPhase,
    state,
    artifactPreviewHtml,
    artifactQuestionBlock,
    refinementApprovalQuestions,
    unresolvedApprovalQuestionCount
  );
  const rejectPlan = selectedPhaseIsCurrent && selectedPhase.requiresApproval
    ? resolveWorkflowRejectPlan(selectedPhase.phaseId)
    : null;
  const selectedPhaseStateClass = heroTokenClass(selectedPhaseDisplayState);
  const continueActionLabel = selectedPhaseIsCurrent ? "Continue" : "Continue Current Phase";
  const rerunReviewActionLabel = "Rerun Review";
  const approveActionLabel = selectedPhaseIsCurrent ? "Approve" : "Approve Current Phase";
  const reviewRegressionIncludeArtifact = state.reviewRegressionIncludeArtifact !== false;
  const reviewRegressionDraft = typeof state.reviewRegressionDraft === "string"
    ? state.reviewRegressionDraft.trim()
    : "";
  const reviewRegressionRequiresPrompt = selectedPhaseIsCurrent
    && selectedPhase.phaseId === "review"
    && !reviewRegressionIncludeArtifact;
  const reviewRegressionActionDisabled = reviewRegressionRequiresPrompt && reviewRegressionDraft.length === 0;
  const shouldRenderApproveAction = selectedPhaseIsCurrent
    && selectedPhase.requiresApproval;
  const shouldRenderRerunReviewAction = canRerunCurrentReview(workflow, selectedPhase, playbackState);
  const shouldRenderReviewRegressionAction = selectedPhaseIsCurrent && selectedPhase.phaseId === "review";
  const shouldRenderApproveReviewAnywayAction = selectedPhaseIsCurrent && selectedPhase.phaseId === "review";
  const detailActions = (selectedPhaseIsCurrent && (workflow.controls.canApprove || shouldRenderApproveAction || rejectPlan))
    || canRewindSelectedPhase
    || workflow.controls.canContinue
    || shouldRenderRerunReviewAction
    || shouldRenderReviewRegressionAction
    || workflow.controls.canApprove
    || shouldRenderApproveAction
    ? `
      <div class="detail-actions detail-actions--phase-header">
        ${shouldRenderReviewRegressionAction
            ? `<button class="workflow-action-button workflow-action-button--danger" type="button" data-open-review-regression-modal${reviewRegressionActionDisabled ? " disabled" : ""}>Send Back To Implementation</button>`
            : ""}
        ${shouldRenderApproveReviewAnywayAction
            ? `<button class="workflow-action-button workflow-action-button--attention" type="button" data-open-review-approve-anyway-modal>Approve Anyway</button>`
            : ""}
        ${workflow.controls.canContinue
            ? `<button class="workflow-action-button workflow-action-button--progress" data-command="continue"${playDisabled ? " disabled" : ""}>${continueActionLabel}</button>`
            : ""}
        ${shouldRenderRerunReviewAction
            ? `<button class="workflow-action-button workflow-action-button--progress" data-command="continue"${rerunReviewDisabled ? " disabled" : ""}>${rerunReviewActionLabel}</button>`
            : ""}
        ${shouldRenderApproveAction
            ? `<button class="workflow-action-button workflow-action-button--approve" data-command="approve" data-approve-button data-pending-approval-count="${unresolvedApprovalQuestionCount}"${!workflow.controls.canApprove || shouldRenderApprovalBranchEditor(workflow, selectedPhase, selectedPhaseIsCurrent) && Boolean(state.requireExplicitApprovalBranchAcceptance) ? " disabled" : ""}>${approveActionLabel}</button>`
            : ""}
        ${rejectPlan ? `<button class="workflow-action-button workflow-action-button--danger" type="button" data-open-reject-modal data-reject-target-phase="${escapeHtmlAttribute(rejectPlan.targetPhaseId)}" data-reject-mode="${escapeHtmlAttribute(rejectPlan.mode)}" data-reject-title="${escapeHtmlAttribute(rejectPlan.modalTitle)}" data-reject-prompt="${escapeHtmlAttribute(rejectPlan.modalPrompt)}" data-reject-helper="${escapeHtmlAttribute(rejectPlan.helperText)}" data-reject-confirm-label="${escapeHtmlAttribute(rejectPlan.confirmLabel)}">Reject</button>` : ""}
        ${canRewindSelectedPhase ? `<button class="workflow-action-button workflow-action-button--document" data-command="rewind" data-phase-id="${escapeHtmlAttribute(selectedPhase.phaseId)}">Rewind Here</button>` : ""}
      </div>
    `
    : "";
  const durationMetric = `
    <div class="phase-duration-pill" role="status" aria-label="Phase duration">
      <div class="phase-duration-pill__clock" aria-hidden="true">
        <span class="phase-duration-pill__tick phase-duration-pill__tick--a"></span>
        <span class="phase-duration-pill__tick phase-duration-pill__tick--b"></span>
        <span class="phase-duration-pill__tick phase-duration-pill__tick--c"></span>
        <span class="phase-duration-pill__tick phase-duration-pill__tick--d"></span>
        <span class="phase-duration-pill__hand phase-duration-pill__hand--minute"></span>
        <span class="phase-duration-pill__hand phase-duration-pill__hand--second"></span>
      </div>
      <div class="phase-duration-pill__body">
        <span class="phase-duration-pill__label">Duration${selectedPhaseIterationCount > 1 ? ` · ${selectedPhaseIterationCount} runs` : ""}</span>
        <span class="phase-duration-pill__value">${escapeHtml(selectedPhaseDurationAggregate > 0 ? formatDuration(selectedPhaseDurationAggregate) : "n/a")}</span>
      </div>
    </div>
  `;
  const touchSummary = `
    <div class="token-summary token-summary--touches">
      <div class="token-summary__header">Touches</div>
      <div class="token-summary__rows">
        ${renderTokenSummaryRow("Total", String(selectedPhaseTouches.total))}
        ${renderTokenSummaryRow("Generated", String(selectedPhaseTouches.generated))}
        ${renderTokenSummaryRow("Operated", String(selectedPhaseTouches.operated))}
        ${renderTokenSummaryRow("Started", String(selectedPhaseTouches.started))}
        ${renderTokenSummaryRow("Rewinds Here", String(selectedPhaseTouches.rewound))}
        ${renderTokenSummaryRow("Regressions Here", String(selectedPhaseTouches.regressed))}
      </div>
    </div>
  `;
  const tokenSummary = `
    <div class="token-summary token-summary--wide">
      <div class="token-summary__header">Tokens</div>
      <div class="token-summary__rows">
        ${renderTokenSummaryRow("Input / Output", hasTokenTelemetry
          ? `${formatMetricNumber(selectedPhaseUsageAggregate.inputTokens)} / ${formatMetricNumber(selectedPhaseUsageAggregate.outputTokens)}`
          : "n/a")}
        ${renderTokenSummaryRow("Total", hasTokenTelemetry
          ? formatMetricNumber(selectedPhaseUsageAggregate.totalTokens)
          : "n/a")}
        ${renderTokenSummaryRow("Model", selectedPhaseExecutionLabel ?? "n/a")}
        ${renderTokenSummaryRow("Iterations", String(selectedPhaseRecordedIterationCount))}
        ${hasTokenTelemetry && selectedPhaseDurationAggregate > 0
          ? renderTokenSummaryRow("Response Speed", formatTokensPerSecond(selectedPhaseUsageAggregate.outputTokens, selectedPhaseDurationAggregate))
          : ""}
      </div>
    </div>
  `;
  const selectedPhaseMetrics = `${durationMetric}${touchSummary}${tokenSummary}`;
  const workflowUsageDashboard = `
    <section class="detail-card detail-card--workflow-dashboard">
      <div class="detail-card__header">
        <div>
          <h3>Workflow Dashboard</h3>
          <p class="panel-copy">Global usage across the full user story lifecycle, not only the selected phase.</p>
        </div>
      </div>
      <div class="token-summary-grid token-summary-grid--workflow">
        <div class="token-summary">
          <div class="token-summary__header">Totals</div>
          <div class="token-summary__rows">
            ${renderTokenSummaryRow("Input / Output", `${formatMetricNumber(workflowUsage.overall.inputTokens)} / ${formatMetricNumber(workflowUsage.overall.outputTokens)}`)}
            ${renderTokenSummaryRow("Total Tokens", formatMetricNumber(workflowUsage.overall.totalTokens))}
            ${renderTokenSummaryRow("Recorded Runs", String(workflowUsage.overall.events))}
            ${renderTokenSummaryRow("Duration", workflowUsage.overall.durationMs > 0 ? formatDuration(workflowUsage.overall.durationMs) : "n/a")}
            ${renderTokenSummaryRow("Response Speed", workflowUsage.overall.durationMs > 0 ? formatTokensPerSecond(workflowUsage.overall.outputTokens, workflowUsage.overall.durationMs) : "n/a")}
          </div>
        </div>
        <div class="token-summary">
          <div class="token-summary__header">Timeline</div>
          <div class="token-summary__rows">
            ${renderTokenSummaryRow("Events", String(workflow.events.length))}
            ${renderTokenSummaryRow("Iterations", String(workflow.phaseIterations?.length ?? 0))}
            ${renderTokenSummaryRow("Started", formatUtcTimestamp(workflow.events[0]?.timestampUtc ?? null))}
            ${renderTokenSummaryRow("Last Event", formatUtcTimestamp(workflow.events[workflow.events.length - 1]?.timestampUtc ?? null))}
            ${renderTokenSummaryRow("Current Phase", (workflow.phases.find((phase) => phase.isCurrent) ?? selectedPhase).title)}
          </div>
        </div>
      </div>
    </section>
  `;
  const modelUsageTable = renderUsageDashboardTable(
    "Usage by Model",
    ["Model", "Runs", "Input", "Output", "Total", "Duration"],
    workflowUsage.byModel.length > 0
      ? workflowUsage.byModel.map(({ label, aggregate }) => ([
        label,
        String(aggregate.events),
        formatMetricNumber(aggregate.inputTokens),
        formatMetricNumber(aggregate.outputTokens),
        formatMetricNumber(aggregate.totalTokens),
        aggregate.durationMs > 0 ? formatDuration(aggregate.durationMs) : "n/a"
      ]))
      : [["No recorded model usage yet.", "-", "-", "-", "-", "-"]]
  );
  const phaseUsageTable = renderUsageDashboardTable(
    "Usage by Phase",
    ["Phase", "Runs", "Input", "Output", "Total", "Duration"],
    workflowUsage.byPhase.length > 0
      ? workflowUsage.byPhase.map(({ phaseId, aggregate }) => ([
        phaseId,
        String(aggregate.events),
        formatMetricNumber(aggregate.inputTokens),
        formatMetricNumber(aggregate.outputTokens),
        formatMetricNumber(aggregate.totalTokens),
        aggregate.durationMs > 0 ? formatDuration(aggregate.durationMs) : "n/a"
      ]))
      : [["No recorded phase usage yet.", "-", "-", "-", "-", "-"]]
  );
  const latestIteration = phaseIterations[0] ?? null;
  const visibleIterations = isIterationRailExpanded
    ? phaseIterations
    : latestIteration
      ? [latestIteration]
      : [];
  const iterationRail = phaseIterations.length > 0
    ? `
      <section class="detail-card detail-card--phase-iterations">
        <div class="detail-card__header detail-card__header--iterations">
          <div>
            <h3>Phase Iterations</h3>
            <p class="panel-copy">${isIterationRailExpanded
              ? "Newest first. Select any iteration to inspect its readonly artifact, metrics, and recorded context."
              : "Collapsed by default. The latest iteration stays selected until you expand the full history."}</p>
          </div>
          <button
            type="button"
            class="workflow-action-button workflow-action-button--document workflow-action-button--compact"
            data-command="togglePhaseIterations"
            data-phase-id="${escapeHtmlAttribute(selectedPhase.phaseId)}">
            ${isIterationRailExpanded ? "Collapse" : "Expand"}
          </button>
        </div>
        <div class="iteration-rail${isIterationRailExpanded ? " iteration-rail--expanded" : " iteration-rail--collapsed"}">
          <span class="iteration-rail__line" aria-hidden="true"></span>
          ${visibleIterations.map((iteration) => `
            <button
              type="button"
              class="iteration-rail__item${selectedIteration?.iterationKey === iteration.iterationKey ? " iteration-rail__item--selected" : ""}"
              data-command="selectIteration"
              data-iteration-key="${escapeHtmlAttribute(iteration.iterationKey)}">
              <span class="iteration-rail__stem" aria-hidden="true"></span>
              <span class="iteration-rail__body">
                <span class="iteration-rail__title">Iteration ${iteration.attempt} · ${escapeHtml(formatUtcTimestamp(iteration.timestampUtc))}</span>
                <span class="iteration-rail__meta">
                  ${escapeHtml(iteration.code)}
                  ${iteration.actor ? ` · ${escapeHtml(iteration.actor)}` : ""}
                  ${formatExecutionLabel(iteration.execution, {
                    actor: iteration.actor,
                    configuredModel: findConfiguredModelForProfile(state, iteration.execution?.profileName)
                  }) ? ` · ${escapeHtml(formatExecutionLabel(iteration.execution, {
                    actor: iteration.actor,
                    configuredModel: findConfiguredModelForProfile(state, iteration.execution?.profileName)
                  }) ?? "")}` : ""}
                  ${iteration.usage ? ` · ${escapeHtml(`${formatMetricNumber(iteration.usage.inputTokens)}/${formatMetricNumber(iteration.usage.outputTokens)} tok`)}` : ""}
                  ${iteration.durationMs !== null ? ` · ${escapeHtml(formatDuration(iteration.durationMs))}` : ""}
                </span>
                ${iteration.summary ? `<span class="iteration-rail__summary">${escapeHtml(iteration.summary)}</span>` : ""}
              </span>
            </button>
          `).join("")}
        </div>
      </section>
    `
    : "";
  const iterationDetailSection = selectedIteration
    ? `
      <section class="detail-card detail-card--iteration-detail">
        <h3>Selected Iteration</h3>
        <div class="iteration-detail__meta">
          <span class="badge">iteration ${escapeHtml(String(selectedIteration.attempt))}</span>
          <span class="badge">${escapeHtml(selectedIteration.code)}</span>
          <span class="badge">${escapeHtml(formatUtcTimestamp(selectedIteration.timestampUtc))}</span>
          ${selectedIteration.actor ? `<span class="badge">${escapeHtml(selectedIteration.actor)}</span>` : ""}
          ${formatExecutionLabel(selectedIteration.execution, {
            actor: selectedIteration.actor,
            configuredModel: findConfiguredModelForProfile(state, selectedIteration.execution?.profileName)
          }) ? `<span class="badge">model ${escapeHtml(formatExecutionLabel(selectedIteration.execution, {
            actor: selectedIteration.actor,
            configuredModel: findConfiguredModelForProfile(state, selectedIteration.execution?.profileName)
          }) ?? "")}</span>` : ""}
          ${selectedIteration.usage ? `<span class="badge">in/out ${escapeHtml(`${formatMetricNumber(selectedIteration.usage.inputTokens)}/${formatMetricNumber(selectedIteration.usage.outputTokens)}`)}</span>` : ""}
          ${selectedIteration.usage ? `<span class="badge">total ${escapeHtml(formatMetricNumber(selectedIteration.usage.totalTokens))}</span>` : ""}
          ${selectedIteration.durationMs !== null ? `<span class="badge">${escapeHtml(formatDuration(selectedIteration.durationMs))}</span>` : ""}
          ${selectedIteration.usage && selectedIteration.durationMs !== null ? `<span class="badge">${escapeHtml(formatTokensPerSecond(selectedIteration.usage.outputTokens, selectedIteration.durationMs))}</span>` : ""}
        </div>
        ${selectedIteration.summary ? `<p class="panel-copy">${escapeHtml(selectedIteration.summary)}</p>` : ""}
        ${selectedIteration.operationPrompt ? `<pre class="artifact-preview artifact-preview--raw-artifact">${escapeHtml(selectedIteration.operationPrompt)}</pre>` : ""}
        <div class="iteration-lineage-grid">
          <div class="iteration-lineage-card">
            <h4>Input Artifact</h4>
            <p class="muted">${selectedIteration.inputArtifactPath ? escapeHtml(fileNameFromPath(selectedIteration.inputArtifactPath)) : "No explicit input artifact recorded for this iteration."}</p>
            ${selectedIteration.inputArtifactPath
              ? `<div class="detail-actions"><button class="workflow-action-button workflow-action-button--document" data-command="openArtifact" data-path="${escapeHtmlAttribute(selectedIteration.inputArtifactPath)}">Open Input</button></div>`
              : ""}
          </div>
          <div class="iteration-lineage-card">
            <h4>Output Artifact</h4>
            <p class="muted">${escapeHtml(fileNameFromPath(selectedIteration.outputArtifactPath))}</p>
            <div class="detail-actions">
              <button class="workflow-action-button workflow-action-button--document" data-command="openArtifact" data-path="${escapeHtmlAttribute(selectedIteration.outputArtifactPath)}">Open Output</button>
              ${selectedIteration.operationLogPath ? `<button class="workflow-action-button workflow-action-button--document" data-command="openArtifact" data-path="${escapeHtmlAttribute(selectedIteration.operationLogPath)}">Open Operation Log</button>` : ""}
            </div>
          </div>
        </div>
        ${selectedIteration.contextArtifactPaths.length > 0
          ? `<div class="iteration-context-list">
              <h4>Context Artifacts</h4>
              ${buildArtifactCollectionSection(
                state.selectedIterationContextArtifacts ?? [],
                {
                  emptyMessage: "The selected iteration recorded context artifact paths, but their contents could not be loaded."
                }
              )}
            </div>`
          : ""}
      </section>
    `
    : "";
  const artifactSection = selectedPhase.artifactPath
    ? isClarificationDetail
      ? buildArtifactPreviewSection(
        selectedIteration?.outputArtifactPath ?? selectedPhase.artifactPath,
        artifactPreviewHtml,
        state.selectedArtifactContent ?? "Artifact content unavailable.",
        {
          rawArtifact: true,
          footerNote: "The raw artifact stays visible here to preserve model context beyond the structured clarification questions below."
        }
      )
      : buildArtifactPreviewSection(
        selectedIteration?.outputArtifactPath ?? selectedPhase.artifactPath,
        artifactPreviewHtml,
        state.selectedArtifactContent ?? "Artifact content unavailable."
      )
    : "<p class=\"muted\">No artifact is persisted for this phase.</p>";
  const promptButtons = [
    selectedPhase.executePromptPath
      ? `<button class="workflow-action-button workflow-action-button--document" data-command="openPrompt" data-path="${escapeHtmlAttribute(selectedPhase.executePromptPath)}">Open Execute Prompt</button>`
      : "",
    selectedPhase.executeSystemPromptPath
      ? `<button class="workflow-action-button workflow-action-button--document" data-command="openPrompt" data-path="${escapeHtmlAttribute(selectedPhase.executeSystemPromptPath)}">Open Execute System Prompt</button>`
      : "",
    selectedPhase.approvePromptPath
      ? `<button class="workflow-action-button workflow-action-button--document" data-command="openPrompt" data-path="${escapeHtmlAttribute(selectedPhase.approvePromptPath)}">Open Approve Prompt</button>`
      : "",
    selectedPhase.approveSystemPromptPath
      ? `<button class="workflow-action-button workflow-action-button--document" data-command="openPrompt" data-path="${escapeHtmlAttribute(selectedPhase.approveSystemPromptPath)}">Open Approve System Prompt</button>`
      : ""
  ].filter(Boolean).join("");
  const promptSection = promptButtons
    ? `<div class="detail-actions">${promptButtons}</div>`
    : "<p class=\"muted\">This phase does not expose prompt templates from the current repo bootstrap.</p>";
  const contextFiles = workflow.contextFiles ?? [];
  const workflowFilesSection = `
    <section class="file-group">
      <div class="file-group__header">
        <h4>User Story</h4>
        <p>The main source file and clarification history for this workflow.</p>
      </div>
      <div class="attachment-list">
        <div class="file-item">
          <button class="attachment-item" data-command="openArtifact" data-path="${escapeHtmlAttribute(workflow.mainArtifactPath)}">
            <strong>${escapeHtml(fileNameFromPath(workflow.mainArtifactPath))}</strong>
            <span>${escapeHtml(workflow.mainArtifactPath)}</span>
          </button>
        </div>
      </div>
    </section>
    <div class="detail-actions detail-actions--files">
      <div class="file-kind-toggle" data-file-kind-toggle>
        <button class="file-kind-toggle__option file-kind-toggle__option--active" type="button" data-file-kind-option="context">Context</button>
        <button class="file-kind-toggle__option" type="button" data-file-kind-option="attachment">US Info</button>
      </div>
      <button class="workflow-action-button workflow-action-button--document" data-command="attachFiles" data-kind="context" data-attach-files-button>Add Files</button>
    </div>
    <div class="file-groups">
      <section class="file-group" data-file-drop-zone data-drop-kind="context">
        <div class="file-group__header">
          <h4>Context Files</h4>
          <p>Injected into the model runtime when phases execute.</p>
        </div>
        ${contextFiles.length > 0
          ? `<div class="attachment-list">
              ${contextFiles.map((attachment) => `
                <div class="file-item">
                  <button class="attachment-item" draggable="true" data-file-path="${escapeHtmlAttribute(attachment.path)}" data-file-kind="context" data-command="openAttachment" data-path="${escapeHtmlAttribute(attachment.path)}">
                    <strong>${escapeHtml(attachment.name)}</strong>
                    <span>${escapeHtml(attachment.path)}</span>
                  </button>
                </div>
              `).join("")}
            </div>`
          : "<p class=\"muted\">No context files are attached to this workflow yet.</p>"}
      </section>
      <section class="file-group" data-file-drop-zone data-drop-kind="attachment">
        <div class="file-group__header">
          <h4>User Story Info</h4>
          <p>Kept with the user story, but excluded from the model prompt by default.</p>
        </div>
        ${workflow.attachments.length > 0
          ? `<div class="attachment-list">
              ${workflow.attachments.map((attachment) => `
                <div class="file-item">
                  <button class="attachment-item" draggable="true" data-file-path="${escapeHtmlAttribute(attachment.path)}" data-file-kind="attachment" data-command="openAttachment" data-path="${escapeHtmlAttribute(attachment.path)}">
                    <strong>${escapeHtml(attachment.name)}</strong>
                    <span>${escapeHtml(attachment.path)}</span>
                  </button>
                </div>
              `).join("")}
            </div>`
          : "<p class=\"muted\">No user story files are attached yet.</p>"}
      </section>
    </div>
  `;
  const playbackButtons = `
    <button class="icon-button ${playWarnsAboutImplementationLimit ? "icon-button--attention" : "icon-button--primary"}${shouldPulsePlay ? " icon-button--pulse" : ""}" data-command="play" aria-label="${playWarnsAboutImplementationLimit ? "Play workflow with implementation loop limit warning" : "Play workflow"}"${playDisabled ? " disabled" : ""}>
      ${playIcon()}
    </button>
    <button class="icon-button" data-command="pause" aria-label="Pause workflow"${playbackState !== "playing" ? " disabled" : ""}>
      ${pauseIcon()}
    </button>
    <button class="icon-button icon-button--danger" data-command="stop" aria-label="Stop workflow"${playbackState === "playing" || playbackState === "stopping" ? "" : " disabled"}>
      ${stopIcon()}
    </button>
  `;
  const debugResetButton = "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>
    :root {
      ${buildWebviewTypographyRootCss(typographyCssVars)}
      --accent: #72f1b8;
      --accent-strong: #1fd89b;
      --accent-soft: rgba(114, 241, 184, 0.16);
      --phase-current: rgba(66, 178, 255, 0.18);
      --phase-completed: rgba(114, 241, 184, 0.18);
      --phase-pending: rgba(255, 255, 255, 0.04);
      --danger: #ff8b8b;
      --shadow: 0 18px 40px rgba(0, 0, 0, 0.28);
      --attention-egg: #ffd75a;
      --attention-egg-soft: rgba(255, 213, 90, 0.16);
      --attention-egg-border: rgba(255, 213, 90, 0.34);
      --attention-egg-shadow: rgba(255, 213, 90, 0.26);
      --action-progress-bg: linear-gradient(180deg, rgba(48, 112, 76, 0.96), rgba(18, 43, 35, 0.98));
      --action-progress-bg-hover: linear-gradient(180deg, rgba(58, 130, 88, 0.98), rgba(20, 54, 42, 1));
      --action-progress-border: rgba(114, 241, 184, 0.22);
      --action-progress-border-hover: rgba(114, 241, 184, 0.4);
      --action-progress-shadow: rgba(20, 72, 53, 0.24);
      --action-document-bg: linear-gradient(180deg, rgba(92, 181, 255, 0.18), rgba(16, 31, 52, 0.94));
      --action-document-bg-hover: linear-gradient(180deg, rgba(92, 181, 255, 0.26), rgba(18, 39, 64, 0.98));
      --action-document-border: rgba(92, 181, 255, 0.28);
      --action-document-border-hover: rgba(92, 181, 255, 0.42);
      --action-document-shadow: rgba(22, 52, 92, 0.24);
    }
    * {
      box-sizing: border-box;
    }
    body {
      margin: 0;
      color: var(--vscode-editor-foreground);
      background:
        radial-gradient(circle at 8% 10%, rgba(114, 241, 184, 0.16), transparent 20%),
        radial-gradient(circle at 88% 18%, rgba(72, 131, 255, 0.18), transparent 24%),
        radial-gradient(circle at 50% 100%, rgba(255, 170, 84, 0.12), transparent 26%),
        linear-gradient(180deg, rgba(10, 20, 24, 0.96), rgba(10, 14, 20, 1));
      min-height: 100vh;
      height: 100vh;
      overflow: hidden;
    }
    .shell {
      display: grid;
      grid-template-rows: auto minmax(0, 1fr);
      height: 100vh;
      padding: 18px;
      gap: 18px;
      overflow: hidden;
    }
    .shell.shell--interaction-locked {
      pointer-events: none;
      user-select: none;
    }
    .shell-body {
      min-height: 0;
      height: 100%;
      overflow: hidden;
      padding-bottom: 6px;
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
      z-index: 30;
      overflow: hidden;
    }
    .hero::after {
      content: "";
      position: absolute;
      inset: auto;
      width: 0;
      height: 0;
      background: none;
      pointer-events: none;
    }
    .hero-head {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 18px;
      align-items: start;
      position: relative;
      z-index: 1;
    }
    .hero-main {
      min-width: 0;
    }
    .eyebrow {
      margin: 0 0 10px;
      text-transform: uppercase;
      letter-spacing: 0.18em;
      font-size: 0.86rem;
      color: var(--accent);
    }
    .hero-caption {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
      margin-bottom: 10px;
    }
    .hero-caption .eyebrow {
      margin: 0;
    }
    .runtime-version {
      font-size: 0.8rem;
      letter-spacing: 0.08em;
      color: rgba(166, 255, 206, 0.78);
    }
    h1 {
      margin: 0;
      font-size: clamp(1.48rem, 2.3vw, 2rem);
      line-height: 1.05;
      max-width: none;
      text-wrap: balance;
    }
    .hero-meta, .control-strip, .detail-meta {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
      align-items: center;
    }
    .detail-metrics {
      display: grid;
      grid-template-columns: minmax(152px, 186px) minmax(0, 1fr);
      gap: 12px;
      margin-top: 12px;
      align-items: stretch;
    }
    .phase-duration-pill {
      position: relative;
      display: block;
      min-height: 112px;
      padding: 14px 16px 14px 14px;
      border-radius: 22px;
      border: 1px solid rgba(171, 223, 255, 0.24);
      background:
        radial-gradient(circle at 20% 18%, rgba(214, 239, 255, 0.12), transparent 34%),
        linear-gradient(180deg, rgba(204, 233, 255, 0.09), rgba(28, 44, 62, 0.3));
      box-shadow:
        inset 0 1px 0 rgba(255, 255, 255, 0.08),
        0 10px 24px rgba(18, 44, 74, 0.14);
      overflow: hidden;
    }
    .phase-duration-pill::after {
      content: "";
      position: absolute;
      inset: auto -12px -24px auto;
      width: 118px;
      height: 118px;
      border-radius: 50%;
      background: radial-gradient(circle, rgba(194, 232, 255, 0.12), transparent 68%);
      pointer-events: none;
    }
    .phase-duration-pill__clock {
      position: absolute;
      left: 14px;
      top: 50%;
      width: 68px;
      height: 68px;
      transform: translateY(-50%);
      border-radius: 50%;
      border: 1px solid rgba(221, 242, 255, 0.38);
      background:
        radial-gradient(circle at 30% 28%, rgba(245, 251, 255, 0.24), rgba(194, 229, 255, 0.08) 38%, rgba(154, 203, 241, 0.04) 58%, rgba(154, 203, 241, 0.02) 100%);
      box-shadow:
        inset 0 0 0 8px rgba(216, 238, 255, 0.06),
        inset 0 1px 0 rgba(255, 255, 255, 0.22),
        0 8px 18px rgba(112, 164, 208, 0.08);
      color: rgba(240, 249, 255, 0.88);
    }
    .phase-duration-pill__clock::before {
      content: "";
      position: absolute;
      top: -9px;
      left: 50%;
      width: 18px;
      height: 10px;
      border-radius: 999px 999px 5px 5px;
      transform: translateX(-50%);
      border: 1px solid rgba(221, 242, 255, 0.28);
      background: linear-gradient(180deg, rgba(243, 251, 255, 0.16), rgba(177, 214, 242, 0.06));
    }
    .phase-duration-pill__clock::after {
      content: "";
      position: absolute;
      top: 50%;
      left: 50%;
      width: 8px;
      height: 8px;
      border-radius: 50%;
      transform: translate(-50%, -50%);
      background: rgba(247, 252, 255, 0.92);
      box-shadow: 0 0 0 4px rgba(215, 238, 255, 0.08);
    }
    .phase-duration-pill__tick {
      position: absolute;
      left: 50%;
      top: 6px;
      width: 1px;
      height: 8px;
      border-radius: 999px;
      background: rgba(240, 249, 255, 0.54);
      transform-origin: 50% 28px;
    }
    .phase-duration-pill__tick--a { transform: translateX(-50%) rotate(0deg); }
    .phase-duration-pill__tick--b { transform: translateX(-50%) rotate(90deg); }
    .phase-duration-pill__tick--c { transform: translateX(-50%) rotate(180deg); }
    .phase-duration-pill__tick--d { transform: translateX(-50%) rotate(270deg); }
    .phase-duration-pill__hand {
      position: absolute;
      left: 50%;
      bottom: 50%;
      width: 2px;
      border-radius: 999px;
      transform-origin: 50% 100%;
      background: linear-gradient(180deg, rgba(248, 252, 255, 0.94), rgba(195, 226, 250, 0.64));
      box-shadow: 0 0 10px rgba(232, 246, 255, 0.14);
    }
    .phase-duration-pill__hand--minute {
      height: 17px;
      transform: translateX(-50%) rotate(22deg);
    }
    .phase-duration-pill__hand--second {
      height: 23px;
      width: 1px;
      opacity: 0.88;
      transform: translateX(-50%) rotate(132deg);
    }
    .phase-duration-pill__body {
      position: absolute;
      z-index: 1;
      inset: 14px 14px 14px 14px;
      display: block;
      text-align: right;
    }
    .phase-duration-pill__label {
      display: block;
      font-size: 0.88rem;
      font-weight: 700;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: rgba(214, 236, 252, 0.78);
      padding-right: 2px;
    }
    .phase-duration-pill__value {
      position: absolute;
      right: 0;
      bottom: 0;
      left: 0;
      padding-left: 0;
      font-size: clamp(1.16rem, 2.2vw, 1.78rem);
      font-weight: 800;
      line-height: 1.05;
      color: #f7fbff;
      text-shadow: 0 1px 2px rgba(8, 15, 22, 0.32);
      letter-spacing: -0.03em;
      text-align: right;
      white-space: nowrap;
      word-break: keep-all;
      overflow-wrap: normal;
    }
    .token-summary {
      min-width: 0;
      padding: 12px 14px;
      border-radius: 16px;
      border: 1px solid rgba(255, 255, 255, 0.08);
      background: linear-gradient(180deg, rgba(34, 39, 47, 0.92), rgba(20, 24, 30, 0.98));
      box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.03);
    }
    .token-summary--wide {
      grid-column: 1 / -1;
    }
    .token-summary__header {
      margin-bottom: 10px;
      font-size: 0.88rem;
      font-weight: 700;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: rgba(226, 232, 240, 0.72);
    }
    .token-summary__rows {
      display: grid;
      gap: 8px;
    }
    .token-summary__row {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 12px;
      align-items: baseline;
      padding-top: 8px;
      border-top: 1px solid rgba(255, 255, 255, 0.06);
    }
    .token-summary__row:first-child {
      padding-top: 0;
      border-top: none;
    }
    .token-summary__label {
      min-width: 0;
      font-size: 1rem;
      color: rgba(226, 232, 240, 0.7);
    }
    .token-summary__value {
      font-size: 1rem;
      font-weight: 700;
      color: #f4f7fb;
    }
    .token-summary-grid--workflow {
      margin-top: 14px;
    }
    .usage-table-wrap {
      overflow-x: auto;
    }
    .usage-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.95rem;
    }
    .usage-table th,
    .usage-table td {
      text-align: left;
      padding: 10px 12px;
      border-top: 1px solid rgba(255, 255, 255, 0.08);
      white-space: nowrap;
    }
    .usage-table th {
      font-size: 0.8rem;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: rgba(226, 232, 240, 0.66);
      border-top: none;
    }
    .usage-table td {
      color: rgba(244, 247, 251, 0.92);
    }
    .hero-meta {
      margin-top: 14px;
    }
    .token, .badge {
      border-radius: 999px;
      padding: 6px 12px;
      font-size: 0.86rem;
      background: rgba(255, 255, 255, 0.06);
      color: rgba(255, 255, 255, 0.9);
      border: 1px solid rgba(255, 255, 255, 0.06);
      backdrop-filter: blur(8px);
    }
    .badge.token--attention, .badge.badge--attention {
      background: var(--attention-egg-soft);
      color: #ffe17b;
      border-color: var(--attention-egg-border);
      box-shadow: 0 0 0 1px rgba(255, 213, 90, 0.08);
    }
    .badge.badge--muted {
      background: rgba(255, 255, 255, 0.05);
      color: rgba(241, 246, 255, 0.78);
      border-color: rgba(255, 255, 255, 0.10);
      box-shadow: none;
    }
    .success,
    .token.token--success,
    .badge.token--success {
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
    .settings-warning--pending {
      border-color: rgba(92, 181, 255, 0.26);
      background:
        linear-gradient(180deg, rgba(22, 42, 68, 0.96), rgba(10, 21, 36, 0.98)),
        rgba(12, 18, 24, 0.92);
    }
    .settings-warning--attention {
      border-color: rgba(255, 213, 90, 0.28);
      background:
        linear-gradient(180deg, rgba(82, 58, 12, 0.96), rgba(31, 24, 9, 0.98)),
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
    .settings-warning--pending .eyebrow.warning {
      color: #8ccfff;
    }
    .settings-warning--pending .settings-warning__icon {
      background: rgba(92, 181, 255, 0.18);
      color: #9cd7ff;
      box-shadow: 0 0 0 8px rgba(92, 181, 255, 0.06);
    }
    .settings-warning--attention .settings-warning__icon {
      background: rgba(255, 213, 90, 0.18);
      color: rgba(255, 241, 199, 0.92);
      box-shadow: 0 0 0 8px rgba(255, 213, 90, 0.06);
    }
    .token.accent {
      background: rgba(114, 241, 184, 0.12);
      color: var(--accent);
      border-color: rgba(114, 241, 184, 0.24);
    }
    .token.token--attention {
      background: var(--attention-egg-soft);
      color: #ffe17b;
      border-color: var(--attention-egg-border);
      box-shadow: 0 0 0 1px rgba(255, 213, 90, 0.06);
    }
    .token.token--active {
      background: rgba(92, 181, 255, 0.14);
      color: #90d2ff;
      border-color: rgba(92, 181, 255, 0.28);
    }
    .token.token--paused {
      background: rgba(179, 187, 198, 0.14);
      color: #d3d8df;
      border-color: rgba(179, 187, 198, 0.24);
    }
    .token.token--blocked {
      background: rgba(255, 120, 120, 0.14);
      color: #ffb0b0;
      border-color: rgba(255, 120, 120, 0.26);
    }
    .control-strip {
      justify-self: end;
      align-self: start;
      align-content: flex-start;
      justify-content: flex-end;
      max-width: 540px;
    }
    .workflow-files-overlay {
      position: fixed;
      inset: 0;
      display: none;
      align-items: center;
      justify-content: center;
      padding: 20px;
      background: rgba(3, 7, 12, 0.72);
      backdrop-filter: blur(10px);
      z-index: 30;
    }
    .workflow-files-overlay.is-open {
      display: flex;
    }
    .workflow-files-dialog {
      width: min(860px, 100%);
      max-height: min(80vh, 920px);
      overflow: auto;
      padding: 20px;
      border-radius: 24px;
      border: 1px solid rgba(114, 241, 184, 0.18);
      background:
        linear-gradient(180deg, rgba(16, 26, 32, 0.98), rgba(10, 16, 22, 0.98)),
        rgba(12, 18, 24, 0.96);
      box-shadow: 0 26px 52px rgba(0, 0, 0, 0.38);
    }
    .workflow-files-dialog__head {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 16px;
      margin-bottom: 16px;
    }
    .workflow-files-dialog__head h2 {
      margin: 4px 0 6px;
    }
    .workflow-files-dialog__head p {
      margin: 0;
      opacity: 0.72;
    }
    .workflow-files-dialog__close {
      flex: 0 0 auto;
      min-width: 88px;
    }
    .workflow-files-dialog--reject {
      width: min(760px, 100%);
    }
    .workflow-files-shell--reject {
      display: grid;
      gap: 14px;
    }
    .phase-input-textarea--reject {
      min-height: 220px;
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
      background: var(--action-progress-bg);
      border-color: var(--action-progress-border);
      box-shadow: 0 10px 28px var(--action-progress-shadow);
    }
    .icon-button--attention {
      width: 74px;
      height: 74px;
      background: linear-gradient(180deg, rgba(255, 213, 90, 0.22), rgba(72, 52, 14, 0.96));
      border-color: rgba(255, 213, 90, 0.32);
      color: rgba(255, 246, 214, 0.96);
      box-shadow: 0 10px 28px rgba(74, 55, 16, 0.24);
    }
    .icon-button--primary:hover {
      border-color: var(--action-progress-border-hover);
      background: var(--action-progress-bg-hover);
    }
    .icon-button--attention:hover {
      border-color: rgba(255, 225, 130, 0.44);
      background: linear-gradient(180deg, rgba(255, 223, 124, 0.24), rgba(82, 60, 18, 0.98));
    }
    .icon-button--pulse {
      animation: playPulse 1.35s ease-in-out infinite;
      box-shadow: 0 10px 28px var(--action-progress-shadow);
    }
    .icon-button--danger {
      background: linear-gradient(180deg, rgba(255, 139, 139, 0.2), rgba(40, 18, 18, 0.92));
      border-color: rgba(255, 139, 139, 0.26);
    }
    .icon-button--document {
      background: var(--action-document-bg);
      border-color: var(--action-document-border);
      color: #e7f3ff;
    }
    .icon-button--document:hover {
      border-color: var(--action-document-border-hover);
      background: var(--action-document-bg-hover);
      box-shadow: 0 10px 24px var(--action-document-shadow);
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
    .icon-button--attention svg {
      width: 30px;
      height: 30px;
      margin-left: 2px;
    }
    .control-strip button, .attachment-item, .settings-warning button, .workflow-files-dialog__close {
      border: 1px solid var(--action-progress-border);
      border-radius: 14px;
      padding: 10px 14px;
      background: var(--action-progress-bg);
      color: #f2fff9;
      cursor: pointer;
      box-shadow: 0 6px 18px rgba(0, 0, 0, 0.16);
      transition: transform 140ms ease, border-color 140ms ease, background 140ms ease;
    }
    .control-strip button:hover, .attachment-item:hover, .settings-warning button:hover, .workflow-files-dialog__close:hover {
      transform: translateY(-1px);
      border-color: var(--action-progress-border-hover);
      background: var(--action-progress-bg-hover);
    }
    .control-strip button:disabled, .workflow-files-dialog__close:disabled {
      opacity: 0.46;
      cursor: not-allowed;
      transform: none;
    }
    .layout {
      display: grid;
      grid-template-rows: minmax(0, 1fr) auto;
      gap: 18px;
      min-height: 0;
      height: 100%;
    }
    .layout-main {
      display: grid;
      grid-template-columns: minmax(420px, 1.15fr) minmax(420px, 1fr);
      gap: 18px;
      min-height: 0;
      height: 100%;
      align-items: stretch;
      overflow: hidden;
    }
    .layout-main > * {
      min-height: 0;
      height: 100%;
    }
    .graph-panel {
      padding: 22px;
      min-height: 0;
      position: relative;
      overflow: auto;
      overscroll-behavior: contain;
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
      font-size: 1rem;
    }
    .panel-copy {
      position: relative;
      z-index: 2;
      margin: 0 0 18px;
      opacity: 0.7;
    }
    .graph-stage {
      position: relative;
      min-width: ${desktopGraphWidth}px;
      min-height: ${desktopGraphHeight}px;
      z-index: 2;
    }
    .graph-stage.graph-stage--overlay-active .phase-graph {
      filter: blur(2px) saturate(0.85) brightness(0.78);
      transform: scale(0.997);
    }
    .graph-stage.graph-stage--overlay-blocking .phase-graph {
      pointer-events: none;
    }
    .execution-overlay {
      position: absolute;
      top: 18px;
      left: 18px;
      z-index: 12;
      display: flex;
      align-items: center;
      gap: 14px;
      width: min(430px, calc(100% - 24px));
      min-height: 142px;
      padding: 14px 16px 34px;
      border-radius: 18px;
      border: 1px solid rgba(92, 181, 255, 0.34);
      background:
        linear-gradient(180deg, rgba(18, 37, 56, 0.96), rgba(10, 18, 28, 0.98)),
        rgba(10, 14, 20, 0.96);
      box-shadow: 0 18px 34px rgba(0, 0, 0, 0.34);
      backdrop-filter: blur(16px);
      transition: left 180ms ease, top 180ms ease, opacity 140ms ease;
    }
    .execution-overlay--paused {
      border-color: rgba(255, 205, 92, 0.34);
      background:
        linear-gradient(180deg, rgba(55, 42, 14, 0.96), rgba(24, 19, 8, 0.98)),
        rgba(10, 14, 20, 0.96);
    }
    .execution-overlay--stopping {
      border-color: rgba(255, 139, 139, 0.34);
      background:
        linear-gradient(180deg, rgba(52, 24, 24, 0.96), rgba(23, 11, 11, 0.98)),
        rgba(10, 14, 20, 0.96);
    }
    .execution-overlay__pulse {
      width: 14px;
      height: 14px;
      border-radius: 999px;
      background: #5cb5ff;
      box-shadow: 0 0 0 0 rgba(92, 181, 255, 0.36);
      flex: 0 0 auto;
      animation: overlayPulse 1.8s ease-in-out infinite;
    }
    .execution-overlay--paused .execution-overlay__pulse {
      background: #ffd75a;
      box-shadow: none;
      animation-duration: 2.4s;
    }
    .execution-overlay--stopping .execution-overlay__pulse {
      background: #ff8b8b;
      animation-duration: 1.2s;
    }
    .execution-overlay__body {
      display: grid;
      gap: 4px;
      min-width: 0;
      flex: 1 1 auto;
    }
    .execution-overlay__eyebrow {
      font-size: 0.82rem;
      text-transform: uppercase;
      letter-spacing: 0.16em;
      color: rgba(114, 241, 184, 0.92);
    }
    .execution-overlay__title {
      font-size: 0.96rem;
      color: #f2fff9;
      line-height: 1.2;
    }
    .execution-overlay__message {
      margin: 0;
      min-height: 3.2em;
      max-height: 3.2em;
      overflow: hidden;
      color: rgba(255, 255, 255, 0.78);
      line-height: 1.4;
    }
    .execution-overlay__elapsed {
      align-self: flex-start;
      border-radius: 999px;
      padding: 6px 10px;
      background: rgba(255, 255, 255, 0.08);
      color: rgba(255, 255, 255, 0.92);
      font-size: 0.8rem;
      font-family: var(--specforge-mono-font-family);
      flex: 0 0 auto;
    }
    .execution-overlay__phase-model {
      position: absolute;
      right: 16px;
      bottom: 12px;
      max-width: calc(100% - 32px);
      color: rgba(166, 172, 178, 0.78);
      font-size: 0.82rem;
      line-height: 1.2;
      text-align: right;
      letter-spacing: 0.02em;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      pointer-events: none;
    }
    .execution-overlay__dismiss {
      position: absolute;
      top: 12px;
      right: 12px;
      border-radius: 999px;
      border: 1px solid rgba(255, 255, 255, 0.14);
      background: rgba(255, 255, 255, 0.05);
      color: rgba(233, 240, 250, 0.8);
      padding: 5px 10px;
      font: inherit;
      font-size: 0.82rem;
      line-height: 1;
      cursor: pointer;
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
    .graph-links path.executing {
      stroke: rgba(92, 181, 255, 0.98);
      stroke-dasharray: 22 10;
      animation: currentFlow 1.1s linear infinite;
      filter: drop-shadow(0 0 14px rgba(92, 181, 255, 0.42));
    }
    .graph-links path.pending {
      stroke: rgba(255, 255, 255, 0.1);
    }
    .graph-links path.reverse {
      stroke: rgba(174, 182, 193, 0.42);
      stroke-dasharray: 10 10;
      stroke-width: 3;
      filter: none;
    }
    .graph-links path.reverse-active {
      stroke: rgba(92, 181, 255, 0.86);
      stroke-dasharray: 14 8;
      stroke-width: 3.5;
      filter: drop-shadow(0 0 14px rgba(92, 181, 255, 0.34));
    }
    .graph-links path.reverse-completed {
      stroke: rgba(114, 241, 184, 0.76);
      stroke-dasharray: 12 8;
      stroke-width: 3.5;
      filter: drop-shadow(0 0 12px rgba(114, 241, 184, 0.24));
    }
    .graph-links path.disabled {
      stroke: rgba(255, 255, 255, 0.08);
      opacity: 0.45;
      filter: none;
    }
    .phase-graph {
      position: relative;
      width: var(--graph-width-desktop, ${desktopGraphWidth}px);
      min-width: var(--graph-width-desktop, ${desktopGraphWidth}px);
      min-height: var(--graph-height-desktop, ${desktopGraphHeight}px);
    }
    .graph-links--mobile {
      display: none;
    }
    .phase-node {
      position: absolute;
      left: var(--phase-left-desktop);
      top: var(--phase-top-desktop);
      width: ${phaseNodeWidth}px;
      min-height: ${phaseNodeHeight}px;
      border-radius: 22px;
      border: 1px solid rgba(255, 255, 255, 0.08);
      padding: 12px 14px;
      color: inherit;
      background: linear-gradient(180deg, rgba(22, 28, 38, 0.94), rgba(10, 14, 20, 0.98));
      text-align: left;
      cursor: pointer;
      box-shadow: 0 18px 28px rgba(0, 0, 0, 0.24);
      transition: transform 140ms ease, border-color 140ms ease, box-shadow 140ms ease, background 140ms ease;
      overflow: visible;
      isolation: isolate;
      animation: nodeRise 420ms ease both;
      z-index: 1;
    }
    .phase-node::after {
      content: "";
      position: absolute;
      inset: 0;
      border-radius: inherit;
      background: inherit;
      z-index: 0;
      pointer-events: none;
    }
    .phase-node::before {
      content: "";
      position: absolute;
      inset: 0;
      border-radius: inherit;
      background:
        radial-gradient(circle at 14% 12%, rgba(114, 241, 184, 0.08), transparent 28%),
        linear-gradient(135deg, rgba(255, 255, 255, 0.012), transparent 34%);
      z-index: 1;
      pointer-events: none;
    }
    .phase-node:hover {
      transform: translateY(-2px) scale(1.01);
      border-color: rgba(114, 241, 184, 0.28);
    }
    .phase-node.selected {
      outline: 2px solid rgba(114, 241, 184, 0.52);
      outline-offset: 2px;
      z-index: 3;
      box-shadow:
        0 0 0 1px rgba(226, 232, 240, 0.2),
        0 18px 30px rgba(0, 0, 0, 0.24),
        0 0 22px rgba(196, 203, 214, 0.1);
    }
    .phase-node.phase-node--current {
      border-color: rgba(92, 181, 255, 0.42);
      box-shadow: 0 20px 34px rgba(26, 72, 124, 0.18);
      z-index: 4;
    }
    .phase-node-content {
      position: relative;
      z-index: 2;
    }
    .phase-node.phase-tone-pending.selected {
      outline: 2px solid rgba(255, 255, 255, 0.24);
      outline-offset: 2px;
    }
    .phase-node.phase-tone-disabled.selected {
      outline: 2px solid rgba(255, 255, 255, 0.28);
      outline-offset: 2px;
    }
    .phase-node.phase-tone-active.selected {
      outline: 2px solid rgba(92, 181, 255, 0.56);
      outline-offset: 2px;
    }
    .phase-node.phase-tone-waiting-user.selected {
      outline: 2px solid rgba(255, 213, 90, 0.72);
      outline-offset: 2px;
    }
    .phase-node.phase-tone-paused.selected {
      outline: 2px solid rgba(92, 181, 255, 0.5);
      outline-offset: 2px;
    }
    .phase-node.phase-tone-blocked.selected {
      outline: 2px solid rgba(255, 120, 120, 0.46);
      outline-offset: 2px;
    }
    .phase-node.phase-tone-completed.selected {
      outline: 2px solid rgba(114, 241, 184, 0.52);
      outline-offset: 2px;
    }
    .phase-node.phase-tone-active {
      background: linear-gradient(180deg, rgb(24, 49, 82), rgb(10, 20, 32));
      border-color: rgba(92, 181, 255, 0.45);
      box-shadow: 0 20px 34px rgba(48, 120, 255, 0.16);
      animation: nodeRise 420ms ease both, currentPulse 2.8s ease-in-out infinite;
    }
    .phase-node.phase-tone-waiting-user {
      background: linear-gradient(180deg, rgb(74, 56, 12), rgb(24, 18, 7));
      border-color: rgba(255, 213, 90, 0.5);
      box-shadow: 0 20px 34px rgba(154, 118, 24, 0.24);
    }
    .phase-node.phase-tone-paused {
      background: linear-gradient(180deg, rgb(24, 49, 82), rgb(10, 20, 32));
      border-color: rgba(92, 181, 255, 0.34);
      box-shadow: 0 18px 30px rgba(48, 120, 255, 0.14);
    }
    .phase-node.phase-tone-blocked {
      background: linear-gradient(180deg, rgb(54, 23, 23), rgb(20, 10, 10));
      border-color: rgba(255, 120, 120, 0.28);
      box-shadow: 0 18px 30px rgba(140, 38, 38, 0.16);
    }
    .phase-node.phase-tone-completed {
      background: linear-gradient(180deg, rgb(18, 44, 34), rgb(10, 20, 17));
      border-color: rgba(114, 241, 184, 0.24);
    }
    .phase-node.phase-tone-pending {
      background:
        linear-gradient(180deg, rgb(72, 77, 87), rgb(21, 26, 34)),
        linear-gradient(135deg, rgba(255, 255, 255, 0.04), rgba(255, 255, 255, 0));
      border-color: rgba(196, 203, 214, 0.14);
      box-shadow: 0 16px 28px rgba(7, 10, 16, 0.22);
      opacity: 0.96;
    }
    .phase-node.phase-tone-disabled {
      background:
        linear-gradient(180deg, rgb(64, 68, 76), rgb(15, 18, 24)),
        linear-gradient(135deg, rgba(255, 255, 255, 0.02), rgba(255, 255, 255, 0));
      border-color: rgba(255, 255, 255, 0.08);
      opacity: 0.72;
      box-shadow: 0 10px 18px rgba(6, 8, 12, 0.14);
    }
    .phase-node-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 12px;
      position: relative;
      z-index: 1;
    }
    .phase-node-header-main {
      display: flex;
      flex-direction: row;
      align-items: center;
      gap: 10px;
      min-width: 0;
    }
    .phase-current-rail {
      position: absolute;
      top: 18px;
      bottom: 18px;
      left: -34px;
      right: -14px;
      display: flex;
      align-items: center;
      justify-content: flex-start;
      padding-left: 0;
      border-radius: 16px;
      border-right: 1px solid rgba(92, 181, 255, 0.12);
      background: linear-gradient(180deg, rgba(74, 156, 229, 0.94), rgba(14, 42, 76, 0.98));
      box-shadow:
        inset 0 1px 0 rgba(255, 255, 255, 0.14),
        0 8px 18px rgba(22, 52, 92, 0.16);
      z-index: -1;
      pointer-events: none;
    }
    .phase-current-rail__label {
      display: inline-block;
      transform: rotate(-90deg);
      transform-origin: center;
      margin-left: -10px;
      color: rgba(245, 250, 255, 0.98);
      text-shadow: 0 1px 2px rgba(7, 17, 28, 0.34);
      font-size: 0.84rem;
      font-weight: 800;
      letter-spacing: 0.18em;
      line-height: 1;
      text-transform: uppercase;
      white-space: nowrap;
    }
    .phase-viewing-rail {
      position: absolute;
      top: 18px;
      bottom: 18px;
      left: -14px;
      right: -34px;
      display: flex;
      align-items: center;
      justify-content: flex-end;
      padding-right: 0;
      border-radius: 16px;
      border-left: 1px solid rgba(216, 223, 232, 0.18);
      background: linear-gradient(180deg, rgba(97, 106, 120, 0.96), rgba(48, 56, 68, 0.98));
      box-shadow:
        inset 0 1px 0 rgba(255, 255, 255, 0.12),
        0 8px 18px rgba(12, 16, 22, 0.24);
      z-index: -1;
      pointer-events: none;
    }
    .phase-viewing-rail--current {
      left: 18px;
      right: -28px;
    }
    .phase-viewing-rail__label {
      display: inline-block;
      transform: rotate(-90deg);
      transform-origin: center;
      margin-right: -10px;
      color: rgba(245, 248, 252, 0.94);
      text-shadow: 0 1px 2px rgba(7, 17, 28, 0.28);
      font-size: 0.84rem;
      font-weight: 800;
      letter-spacing: 0.16em;
      line-height: 1;
      text-transform: uppercase;
      white-space: nowrap;
    }
    .phase-index {
      width: 30px;
      height: 30px;
      border-radius: 10px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      background: rgba(255, 255, 255, 0.08);
      font-size: 0.82rem;
      font-weight: 700;
    }
    .phase-pause-toggle {
      width: 30px;
      height: 30px;
      margin-top: 2px;
      border: 1px solid rgba(255, 255, 255, 0.14);
      border-radius: 10px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 0;
      color: rgba(235, 244, 255, 0.82);
      background: rgba(255, 255, 255, 0.05);
      box-shadow: 0 0 0 6px rgba(255, 255, 255, 0.03);
      cursor: pointer;
      transition: transform 140ms ease, border-color 140ms ease, background 140ms ease, box-shadow 140ms ease, color 140ms ease;
    }
    .phase-pause-toggle:hover:not(:disabled) {
      transform: translateY(-1px);
      border-color: rgba(255, 213, 90, 0.42);
      background: rgba(255, 213, 90, 0.14);
      color: rgba(255, 235, 170, 0.96);
      box-shadow: 0 0 0 8px rgba(255, 213, 90, 0.08);
    }
    .phase-pause-toggle:focus-visible {
      outline: 2px solid rgba(255, 213, 90, 0.62);
      outline-offset: 2px;
    }
    .phase-pause-toggle:disabled {
      cursor: not-allowed;
      opacity: 0.38;
      box-shadow: none;
    }
    .phase-pause-toggle svg {
      width: 14px;
      height: 14px;
      fill: currentColor;
    }
    .phase-pause-toggle--armed {
      border-color: rgba(255, 213, 90, 0.54);
      background: rgba(255, 213, 90, 0.18);
      color: rgba(255, 232, 152, 0.98);
      box-shadow: 0 0 0 8px rgba(255, 213, 90, 0.1);
    }
    .phase-pause-toggle--rewind {
      border-color: rgba(92, 181, 255, 0.3);
      background: rgba(40, 92, 194, 0.22);
      color: rgba(208, 226, 255, 0.96);
    }
    .phase-node.phase-tone-active .phase-pause-toggle,
    .phase-node.phase-tone-paused .phase-pause-toggle {
      border-color: rgba(92, 181, 255, 0.3);
    }
    .phase-node.phase-tone-active .phase-pause-toggle--armed,
    .phase-node.phase-tone-paused .phase-pause-toggle--armed {
      border-color: rgba(255, 213, 90, 0.58);
    }
    .phase-node.phase-tone-disabled .phase-pause-toggle {
      opacity: 0.3;
      box-shadow: none;
    }
    .phase-node h3 {
      margin: 10px 0 4px;
      font-size: 1.18rem;
      font-weight: 700;
      line-height: 1.15;
      position: relative;
      z-index: 1;
    }
    .phase-priority-tags {
      display: flex;
      gap: 6px;
      flex-wrap: wrap;
      margin-top: 8px;
      position: relative;
      z-index: 1;
    }
    .phase-node-header .phase-priority-tags {
      margin-top: 0;
      justify-content: center;
      flex-wrap: nowrap;
    }
    .phase-node-header .phase-tag.approval {
      line-height: 1;
    }
    .phase-slug {
      font-family: var(--specforge-mono-font-family);
      font-size: 0.96rem;
      opacity: 0.66;
      line-height: 1.35;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
      text-wrap: balance;
      position: relative;
      z-index: 1;
    }
    .phase-tags {
      display: flex;
      gap: 6px;
      flex-wrap: wrap;
      margin-top: 8px;
      position: relative;
      z-index: 1;
    }
    .phase-tag {
      border-radius: 999px;
      padding: 3px 8px;
      font-size: 0.8rem;
      background: rgba(255, 255, 255, 0.07);
      color: rgba(255, 255, 255, 0.84);
    }
    .phase-tag.approval {
      background: rgba(255, 170, 84, 0.15);
      color: #ffc178;
    }
    .phase-tag.phase-tag--active {
      background: rgba(92, 181, 255, 0.14);
      color: #90d2ff;
    }
    .phase-tag.phase-tag--waiting-user {
      background: var(--attention-egg-soft);
      color: #ffe17b;
      border: 1px solid rgba(255, 213, 90, 0.22);
    }
    .phase-tag.phase-tag--paused {
      background: rgba(92, 181, 255, 0.14);
      color: #90d2ff;
    }
    .phase-tag.phase-tag--blocked {
      background: rgba(255, 120, 120, 0.14);
      color: #ffb0b0;
    }
    .phase-tag.phase-tag--success {
      background: rgba(114, 241, 184, 0.14);
      color: #99f2c6;
    }
    .phase-tag.phase-tag--completed {
      background: rgba(114, 241, 184, 0.14);
      color: #99f2c6;
    }
    .phase-tag.phase-tag--disabled {
      background: rgba(255, 255, 255, 0.05);
      color: rgba(255, 255, 255, 0.52);
    }
    .phase-node.selected .phase-index {
      box-shadow: 0 0 0 8px rgba(114, 241, 184, 0.08);
    }
    .detail-panel {
      padding: 22px;
      display: block;
      min-height: 0;
      height: 100%;
      min-width: 0;
      overflow-y: auto;
      overscroll-behavior: contain;
    }
    .detail-panel > * + * {
      margin-top: 18px;
    }
    .detail-card-shell {
      position: relative;
      padding-top: 18px;
    }
    .detail-card {
      border: 1px solid rgba(255, 255, 255, 0.06);
      border-radius: 20px;
      padding: 18px;
      background: rgba(255, 255, 255, 0.025);
      min-width: 0;
      overflow: hidden;
    }
    .detail-card--phase-overview {
      position: relative;
      z-index: 1;
    }
    .detail-card--approval-branch {
      display: grid;
      gap: 14px;
      border-color: rgba(92, 181, 255, 0.18);
      background: linear-gradient(180deg, rgba(14, 22, 31, 0.92), rgba(10, 16, 22, 0.98));
    }
    .detail-card--phase-security .panel-copy {
      margin-top: 14px;
      margin-bottom: 0;
    }
    .detail-card--approval-questions {
      display: grid;
      gap: 14px;
      border-color: rgba(255, 213, 90, 0.2);
      background:
        radial-gradient(circle at top right, rgba(255, 213, 90, 0.1), transparent 34%),
        linear-gradient(180deg, rgba(28, 23, 10, 0.94), rgba(16, 13, 8, 0.98));
    }
    .detail-card--artifact-questions {
      display: grid;
      gap: 14px;
      border-color: rgba(255, 213, 90, 0.22);
      background:
        radial-gradient(circle at 12% 12%, rgba(255, 213, 90, 0.08), transparent 22%),
        linear-gradient(180deg, rgba(18, 18, 12, 0.94), rgba(10, 12, 8, 0.98));
    }
    .detail-card--phase-iterations,
    .detail-card--iteration-detail {
      display: grid;
      gap: 14px;
      border-color: rgba(92, 181, 255, 0.16);
      background:
        radial-gradient(circle at top left, rgba(92, 181, 255, 0.08), transparent 26%),
        linear-gradient(180deg, rgba(14, 19, 27, 0.94), rgba(10, 14, 20, 0.98));
    }
    .detail-card__header--iterations {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 16px;
      align-items: start;
    }
    .detail-card__header--iterations .panel-copy {
      margin-bottom: 0;
    }
    .detail-card--review-regression {
      border-color: rgba(92, 181, 255, 0.18);
      background:
        radial-gradient(circle at top right, rgba(92, 181, 255, 0.1), transparent 28%),
        linear-gradient(180deg, rgba(13, 20, 29, 0.96), rgba(10, 14, 20, 0.98));
    }
    .review-regression {
      display: grid;
      gap: 18px;
    }
    .review-regression__header {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 16px;
      align-items: start;
    }
    .review-regression__copy {
      display: grid;
      gap: 10px;
    }
    .review-regression__copy h3 {
      margin: 0;
    }
    .review-regression__stat {
      min-width: 132px;
      padding: 14px 16px;
      border-radius: 18px;
      border: 1px solid rgba(92, 181, 255, 0.16);
      background: rgba(255, 255, 255, 0.04);
      display: grid;
      gap: 6px;
      justify-items: end;
    }
    .review-regression__stat-label {
      font-size: 0.72rem;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: rgba(189, 219, 246, 0.72);
    }
    .review-regression__stat-value {
      font-size: 2rem;
      line-height: 1;
      color: #f4f7fb;
    }
    .review-regression__body {
      display: grid;
      gap: 12px;
      padding: 16px 18px 18px;
      border-radius: 18px;
      border: 1px solid rgba(255, 255, 255, 0.06);
      background: rgba(255, 255, 255, 0.025);
    }
    .review-regression__toggle {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr);
      gap: 10px;
      align-items: start;
      padding: 12px 14px;
      border-radius: 16px;
      border: 1px solid rgba(92, 181, 255, 0.16);
      background: rgba(255, 255, 255, 0.03);
      color: rgba(241, 246, 255, 0.92);
      cursor: pointer;
    }
    .review-regression__toggle input {
      margin-top: 2px;
      accent-color: #5cb5ff;
    }
    .review-regression__audit-note {
      margin: 0;
      font-size: 0.82rem;
      line-height: 1.55;
      color: rgba(189, 219, 246, 0.76);
    }
    .review-regression-confirmation {
      display: grid;
      gap: 12px;
      padding: 14px 16px;
      border-radius: 16px;
      border: 1px solid rgba(92, 181, 255, 0.14);
      background: rgba(255, 255, 255, 0.03);
    }
    .review-regression-confirmation__row {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      align-items: baseline;
      flex-wrap: wrap;
    }
    .approval-branch__copy h3 {
      margin: 0 0 8px;
    }
    .approval-branch__copy p {
      margin: 0;
      opacity: 0.78;
    }
    .approval-branch__controls {
      display: grid;
      gap: 10px;
    }
    .approval-branch__field {
      font-size: 0.74rem;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: rgba(189, 219, 246, 0.84);
    }
    .approval-branch__input-row {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
      align-items: center;
    }
    .approval-branch__input {
      flex: 1 1 220px;
      min-width: 0;
      border-radius: 14px;
      border: 1px solid rgba(92, 181, 255, 0.24);
      background: rgba(8, 14, 22, 0.88);
      color: rgba(246, 250, 255, 0.96);
      padding: 11px 14px;
      font: inherit;
      box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04);
    }
    .approval-branch__input:focus {
      outline: none;
      border-color: rgba(92, 181, 255, 0.44);
      box-shadow: 0 0 0 3px rgba(92, 181, 255, 0.14);
    }
    .approval-branch__accepted {
      display: inline-flex;
      align-items: center;
      min-height: 40px;
      padding: 0 14px;
      border-radius: 999px;
      background: rgba(46, 160, 67, 0.16);
      color: #7ff0a5;
      border: 1px solid rgba(127, 240, 165, 0.22);
      font-size: 0.84rem;
      font-weight: 700;
    }
    .approval-branch__accepted[hidden] {
      display: none !important;
    }
    .approval-branch__hint {
      margin: 0;
      font-size: 0.82rem;
      color: rgba(214, 223, 236, 0.72);
    }
    .approval-question-list {
      display: grid;
      gap: 10px;
    }
    .iteration-rail {
      display: grid;
      gap: 10px;
      position: relative;
      padding-left: 10px;
    }
    .iteration-rail--collapsed {
      gap: 0;
    }
    .iteration-rail__line {
      position: absolute;
      left: 18px;
      top: 0;
      bottom: 0;
      width: 2px;
      background: linear-gradient(180deg, rgba(92, 181, 255, 0.5), rgba(92, 181, 255, 0.12));
      border-radius: 999px;
    }
    .iteration-rail__item {
      display: grid;
      grid-template-columns: 20px minmax(0, 1fr);
      gap: 12px;
      align-items: stretch;
      width: 100%;
      padding: 0;
      border: none;
      background: transparent;
      color: inherit;
      text-align: left;
      cursor: pointer;
    }
    .iteration-rail__stem {
      position: relative;
      width: 20px;
    }
    .iteration-rail__stem::after {
      content: "";
      position: absolute;
      left: 3px;
      top: 14px;
      width: 12px;
      height: 12px;
      border-radius: 999px;
      background: rgba(92, 181, 255, 0.18);
      border: 1px solid rgba(92, 181, 255, 0.38);
      box-shadow: 0 0 0 6px rgba(92, 181, 255, 0.05);
    }
    .iteration-rail__body {
      display: grid;
      gap: 5px;
      padding: 12px 14px;
      border-radius: 16px;
      border: 1px solid rgba(92, 181, 255, 0.14);
      background: rgba(255, 255, 255, 0.03);
      transition: border-color 120ms ease, background 120ms ease, transform 120ms ease;
    }
    .iteration-rail__item:hover .iteration-rail__body {
      border-color: rgba(92, 181, 255, 0.26);
      background: rgba(92, 181, 255, 0.08);
      transform: translateY(-1px);
    }
    .iteration-rail__item--selected .iteration-rail__body {
      border-color: rgba(92, 181, 255, 0.4);
      background:
        linear-gradient(180deg, rgba(92, 181, 255, 0.12), rgba(18, 31, 46, 0.7));
      box-shadow: 0 14px 26px rgba(14, 35, 62, 0.24);
    }
    .iteration-rail__item--selected .iteration-rail__stem::after {
      background: rgba(114, 241, 184, 0.18);
      border-color: rgba(114, 241, 184, 0.44);
      box-shadow: 0 0 0 8px rgba(114, 241, 184, 0.07);
    }
    .iteration-rail__title {
      font-size: 0.84rem;
      font-weight: 700;
      color: rgba(240, 248, 255, 0.94);
    }
    .iteration-rail__meta {
      font-size: 0.76rem;
      color: rgba(189, 219, 246, 0.76);
      font-family: var(--specforge-mono-font-family);
    }
    .iteration-rail__summary {
      font-size: 0.82rem;
      line-height: 1.45;
      color: rgba(226, 232, 242, 0.84);
    }
    .workflow-action-button--compact {
      min-height: 36px;
      padding: 8px 14px;
      align-self: center;
    }
    .iteration-detail__meta {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }
    .iteration-lineage-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 12px;
    }
    .iteration-lineage-card,
    .iteration-context-list {
      display: grid;
      gap: 10px;
      padding: 14px 16px;
      border-radius: 16px;
      border: 1px solid rgba(92, 181, 255, 0.14);
      background: rgba(255, 255, 255, 0.03);
    }
    .iteration-lineage-card h4,
    .iteration-context-list h4 {
      margin: 0;
    }
    .embedded-artifact-list {
      display: grid;
      gap: 12px;
    }
    .detail-card--embedded-artifact {
      gap: 12px;
    }
    .detail-card--embedded-artifact h4 {
      margin: 0;
    }
    .approval-question-item {
      display: grid;
      gap: 10px;
      padding: 12px 14px;
      border-radius: 16px;
      border: 1px solid rgba(255, 213, 90, 0.16);
      background: rgba(255, 255, 255, 0.03);
    }
    .approval-question-item--pending {
      background: rgba(255, 213, 90, 0.06);
    }
    .approval-question-item--resolved {
      border-color: rgba(127, 240, 165, 0.24);
      background: rgba(46, 160, 67, 0.08);
    }
    .approval-question-item__head {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 10px;
      align-items: start;
    }
    .approval-question-item__toggle {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr) auto;
      gap: 12px;
      align-items: start;
      width: 100%;
      padding: 0;
      border: none;
      background: transparent;
      color: inherit;
      text-align: left;
      cursor: pointer;
    }
    .approval-question-item__index {
      display: inline-flex;
      justify-content: center;
      align-items: center;
      width: 28px;
      height: 28px;
      border-radius: 999px;
      background: var(--attention-egg-soft);
      border: 1px solid var(--attention-egg-border);
      color: #ffe17b;
      font-size: 0.84rem;
      font-weight: 700;
      line-height: 1;
    }
    .approval-question-item--resolved .approval-question-item__index {
      background: rgba(46, 160, 67, 0.16);
      border-color: rgba(127, 240, 165, 0.24);
      color: #7ff0a5;
    }
    .approval-question-item__body {
      margin: 0;
      line-height: 1.5;
      color: rgba(248, 244, 226, 0.92);
    }
    .approval-question-item__actions {
      display: inline-flex;
      align-items: center;
    }
    .approval-question-item--resolved .approval-question-item__body {
      color: rgba(225, 255, 236, 0.94);
    }
    .approval-question-item__status {
      align-self: center;
      border-radius: 999px;
      padding: 4px 10px;
      border: 1px solid var(--attention-egg-border);
      background: var(--attention-egg-soft);
      color: #ffe17b;
      font-size: 0.72rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.06em;
    }
    .approval-question-item--resolved .approval-question-item__status {
      border-color: rgba(127, 240, 165, 0.24);
      background: rgba(46, 160, 67, 0.16);
      color: #7ff0a5;
    }
    .approval-question-item__editor {
      display: grid;
      gap: 10px;
      padding-top: 10px;
      border-top: 1px solid rgba(255, 255, 255, 0.06);
    }
    .approval-question-item__editor[hidden] {
      display: none;
    }
    .approval-question-item__label {
      font-size: 0.76rem;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: rgba(214, 223, 236, 0.72);
    }
    .approval-question-item__meta {
      font-size: 0.8rem;
      color: rgba(214, 223, 236, 0.72);
    }
    .approval-question-item__textarea {
      width: 100%;
      min-height: 110px;
      resize: vertical;
      border-radius: 14px;
      border: 1px solid rgba(255, 213, 90, 0.18);
      background: rgba(8, 14, 22, 0.88);
      color: rgba(246, 250, 255, 0.96);
      padding: 12px 14px;
      font: inherit;
      line-height: 1.45;
    }
    .approval-question-item--resolved .approval-question-item__textarea {
      border-color: rgba(127, 240, 165, 0.22);
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
    .detail-actions--phase-header {
      position: absolute;
      top: 0;
      right: 18px;
      z-index: 3;
      margin: 0;
      justify-content: flex-end;
    }
    .detail-actions--artifact {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      justify-content: space-between;
    }
    .detail-actions--files {
      justify-content: space-between;
    }
    .file-kind-toggle {
      display: inline-flex;
      padding: 4px;
      border-radius: 999px;
      border: 1px solid rgba(255, 255, 255, 0.08);
      background: rgba(255, 255, 255, 0.035);
      gap: 4px;
    }
    .file-kind-toggle__option {
      min-width: 92px;
      border-radius: 999px !important;
      padding: 8px 12px !important;
      background: transparent !important;
      border-color: transparent !important;
      box-shadow: none !important;
    }
    .file-kind-toggle__option--active {
      background: linear-gradient(180deg, rgba(114, 241, 184, 0.16), rgba(18, 33, 28, 0.92)) !important;
      border-color: rgba(114, 241, 184, 0.18) !important;
      color: #f2fff9 !important;
    }
    .artifact-view-label {
      display: inline-flex;
      align-items: center;
      min-width: 0;
    }
    .file-groups {
      display: grid;
      gap: 18px;
    }
    .workflow-files-shell {
      display: grid;
      gap: 16px;
    }
    .file-group {
      display: grid;
      gap: 10px;
      padding: 12px;
      border-radius: 18px;
      border: 1px solid rgba(255, 255, 255, 0.05);
      background: rgba(255, 255, 255, 0.018);
      transition: border-color 140ms ease, background 140ms ease, box-shadow 140ms ease;
    }
    .file-group.file-group--drop-target {
      border-color: rgba(114, 241, 184, 0.34);
      background: rgba(114, 241, 184, 0.06);
      box-shadow: inset 0 0 0 1px rgba(114, 241, 184, 0.08);
    }
    .file-group__header {
      display: grid;
      gap: 4px;
    }
    .file-group__header h4 {
      margin: 0;
      font-size: 0.95rem;
    }
    .file-group__header p {
      margin: 0;
      color: rgba(255, 255, 255, 0.62);
      line-height: 1.4;
    }
    .attachment-list {
      display: grid;
      gap: 10px;
    }
    .file-item {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 10px;
      align-items: stretch;
    }
    .attachment-item {
      padding: 12px 14px;
      background: var(--action-document-bg);
      border-color: var(--action-document-border);
      color: #e7f3ff;
      text-align: left;
      display: grid;
      gap: 4px;
    }
    .attachment-item:hover {
      border-color: var(--action-document-border-hover);
      background: var(--action-document-bg-hover);
      box-shadow: 0 10px 24px var(--action-document-shadow);
    }
    .attachment-item[data-file-path] {
      cursor: grab;
    }
    .attachment-item.attachment-item--dragging {
      opacity: 0.48;
      transform: scale(0.985);
    }
    .attachment-item span {
      opacity: 0.62;
      font-size: 0.8rem;
      font-family: var(--specforge-mono-font-family);
    }
    .file-kind-action {
      align-self: stretch;
      min-width: 132px;
      white-space: nowrap;
    }
    .clarification-shell {
      display: grid;
      gap: 12px;
    }
    .phase-input-shell {
      display: grid;
      gap: 12px;
    }
    .phase-input-copy {
      margin: 0;
      line-height: 1.5;
      color: rgba(255, 255, 255, 0.8);
    }
    .phase-input-label {
      font-size: 0.82rem;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: rgba(226, 232, 240, 0.72);
    }
    .phase-input-textarea {
      width: 100%;
      min-height: 176px;
      padding: 14px 16px;
      border-radius: 16px;
      border: 1px solid rgba(255, 255, 255, 0.08);
      background: rgba(8, 12, 18, 0.84);
      color: #f4f7fb;
      resize: vertical;
      font: inherit;
      line-height: 1.5;
    }
    .phase-input-textarea:focus {
      outline: none;
      border-color: rgba(92, 181, 255, 0.42);
      box-shadow: 0 0 0 3px rgba(92, 181, 255, 0.08);
    }
    .phase-input-textarea--review-regression {
      min-height: 168px;
    }
    .detail-actions--phase-input {
      justify-content: space-between;
    }
    .detail-actions--review-regression {
      justify-content: flex-start;
      margin: 0;
      padding-top: 4px;
    }
    .phase-input-log {
      display: grid;
      gap: 8px;
    }
    .phase-input-log__header {
      font-size: 0.82rem;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: rgba(226, 232, 240, 0.68);
    }
    .clarification-meta {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }
    .clarification-reason {
      margin: 0;
      line-height: 1.5;
      color: rgba(255, 255, 255, 0.82);
    }
    .clarification-list {
      display: grid;
      gap: 12px;
    }
    .clarification-context {
      margin-top: 18px;
      padding-top: 18px;
      border-top: 1px solid rgba(255, 255, 255, 0.08);
      display: grid;
      gap: 14px;
    }
    .clarification-context__copy h4 {
      margin: 0 0 8px;
      font-size: 1rem;
    }
    .clarification-context__copy p {
      margin: 0;
      color: rgba(241, 246, 255, 0.78);
      line-height: 1.55;
    }
    .detail-actions--clarification {
      justify-content: flex-start;
    }
    .workflow-action-button {
      border: 1px solid var(--action-progress-border);
      border-radius: 14px;
      padding: 10px 14px;
      background: var(--action-progress-bg);
      color: #f2fff9;
      cursor: pointer;
      box-shadow: 0 6px 18px rgba(0, 0, 0, 0.16);
      transition: transform 140ms ease, border-color 140ms ease, background 140ms ease;
      white-space: nowrap;
      max-width: 100%;
    }
    .workflow-action-button:hover {
      transform: translateY(-1px);
      border-color: var(--action-progress-border-hover);
      background: var(--action-progress-bg-hover);
    }
    .workflow-action-button:disabled {
      opacity: 0.46;
      cursor: not-allowed;
      transform: none;
      box-shadow: none;
    }
    .workflow-action-button.workflow-action-button--progress,
    .workflow-action-button.workflow-action-button--approve {
      border-color: var(--action-progress-border);
      background: var(--action-progress-bg);
      color: #f2fff9;
    }
    .workflow-action-button.workflow-action-button--progress:hover,
    .workflow-action-button.workflow-action-button--approve:hover {
      border-color: var(--action-progress-border-hover);
      background: var(--action-progress-bg-hover);
      box-shadow: 0 10px 24px var(--action-progress-shadow);
    }
    .workflow-action-button.workflow-action-button--attention {
      border-color: rgba(255, 213, 90, 0.34);
      background: linear-gradient(180deg, rgba(110, 82, 19, 0.96), rgba(46, 33, 10, 0.98));
      color: #ffe6a3;
      box-shadow: 0 10px 22px rgba(70, 49, 10, 0.28);
    }
    .workflow-action-button.workflow-action-button--attention:hover {
      border-color: rgba(255, 213, 90, 0.5);
      background: linear-gradient(180deg, rgba(132, 98, 22, 0.98), rgba(58, 42, 12, 1));
      box-shadow: 0 14px 28px rgba(85, 60, 12, 0.34);
    }
    .workflow-action-button.workflow-action-button--danger {
      border-color: rgba(255, 139, 139, 0.3);
      background: linear-gradient(180deg, rgba(255, 139, 139, 0.2), rgba(54, 22, 22, 0.96));
      color: #ffd1d1;
    }
    .workflow-action-button.workflow-action-button--danger:hover {
      border-color: rgba(255, 139, 139, 0.46);
      background: linear-gradient(180deg, rgba(255, 139, 139, 0.28), rgba(70, 24, 24, 0.98));
      box-shadow: 0 10px 24px rgba(88, 28, 28, 0.24);
    }
    .workflow-action-button.workflow-action-button--document {
      border-color: var(--action-document-border);
      background: var(--action-document-bg);
      color: #e7f3ff;
    }
    .workflow-action-button.workflow-action-button--document:hover {
      border-color: var(--action-document-border-hover);
      background: var(--action-document-bg-hover);
      box-shadow: 0 10px 24px var(--action-document-shadow);
    }
    .artifact-preview--raw-artifact, .markdown-preview--raw-artifact {
      border-color: rgba(255, 213, 90, 0.18);
      box-shadow: inset 0 0 0 1px rgba(255, 213, 90, 0.04);
    }
    .workflow-action-button--compact {
      align-self: center;
      min-width: 156px;
    }
    .clarification-suggestions {
      display: grid;
      gap: 10px;
    }
    .clarification-suggestion {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 12px;
      align-items: start;
      padding: 12px 14px;
      border-radius: 16px;
      border: 1px solid rgba(114, 241, 184, 0.12);
      background: rgba(255, 255, 255, 0.03);
    }
    .clarification-suggestion__body {
      display: grid;
      gap: 4px;
      min-width: 0;
    }
    .clarification-suggestion__body strong {
      display: block;
      font-size: 0.96rem;
      line-height: 1.35;
      overflow-wrap: anywhere;
      word-break: break-word;
    }
    .clarification-suggestion__body span {
      display: block;
      color: rgba(241, 246, 255, 0.7);
      line-height: 1.4;
      overflow-wrap: anywhere;
      word-break: break-word;
    }
    .clarification-item {
      display: grid;
      gap: 8px;
    }
    .clarification-question-row {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 10px;
    }
    .clarification-question {
      font-size: 0.92rem;
      font-weight: 600;
      line-height: 1.45;
    }
    .copy-question-button {
      flex: 0 0 auto;
      width: 34px;
      height: 34px;
      padding: 0;
      border-radius: 999px;
      border: 1px solid rgba(255, 255, 255, 0.14);
      background: rgba(255, 255, 255, 0.04);
      color: rgba(233, 240, 250, 0.76);
      display: inline-flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      transition: border-color 120ms ease, background 120ms ease, color 120ms ease;
    }
    .copy-question-button__icon {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 16px;
      height: 16px;
    }
    .copy-question-button__icon svg {
      width: 16px;
      height: 16px;
      fill: currentColor;
    }
    .copy-question-button__icon--done {
      display: none;
    }
    .copy-question-button:hover {
      border-color: rgba(92, 181, 255, 0.3);
      background: rgba(92, 181, 255, 0.1);
      color: rgba(232, 245, 255, 0.92);
    }
    .copy-question-button.is-copied {
      border-color: rgba(114, 241, 184, 0.34);
      background: rgba(114, 241, 184, 0.14);
      color: rgba(190, 255, 221, 0.96);
    }
    .copy-question-button.is-copied .copy-question-button__icon--copy {
      display: none;
    }
    .copy-question-button.is-copied .copy-question-button__icon--done {
      display: inline-flex;
    }
    .clarification-answer {
      width: 100%;
      min-height: 84px;
      resize: vertical;
      border-radius: 14px;
      border: 1px solid rgba(114, 241, 184, 0.16);
      background: rgba(4, 10, 16, 0.72);
      color: inherit;
      padding: 12px 14px;
      font: inherit;
      line-height: 1.45;
    }
    .clarification-answer:focus {
      outline: 2px solid rgba(114, 241, 184, 0.22);
      border-color: rgba(114, 241, 184, 0.36);
    }
    .artifact-preview, .audit-log {
      margin: 0;
      padding: 14px;
      border-radius: 16px;
      background: rgba(4, 10, 16, 0.7);
      border: 1px solid rgba(255, 255, 255, 0.06);
      overflow: auto;
      white-space: pre-wrap;
      font-family: var(--specforge-mono-font-family);
      max-height: 320px;
      min-width: 0;
      overflow-wrap: anywhere;
      word-break: break-word;
    }
    .markdown-preview {
      padding: 18px;
      border-radius: 16px;
      background: rgba(4, 10, 16, 0.7);
      border: 1px solid rgba(255, 255, 255, 0.06);
      overflow: auto;
      max-height: 520px;
      line-height: 1.6;
      min-width: 0;
      overflow-wrap: anywhere;
      word-break: break-word;
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
      font-family: var(--specforge-mono-font-family);
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
      white-space: pre-wrap;
      overflow-wrap: anywhere;
      word-break: break-word;
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
      min-height: 100%;
      padding-right: 4px;
    }
    .audit-row {
      border-left: 2px solid rgba(114, 241, 184, 0.18);
      padding-left: 12px;
    }
    .audit-head {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      flex-wrap: wrap;
      font-family: var(--specforge-mono-font-family);
      font-size: 0.8rem;
      color: rgba(255, 255, 255, 0.62);
    }
    .audit-head__meta {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }
    .audit-body {
      margin-top: 4px;
      line-height: 1.45;
    }
    .audit-metrics {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      margin-top: 8px;
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
    @keyframes currentAttentionPulse {
      0%, 100% {
        box-shadow: 0 0 0 6px rgba(255, 213, 90, 0.12);
        opacity: 1;
      }
      50% {
        box-shadow: 0 0 0 12px rgba(255, 213, 90, 0.04);
        opacity: 0.92;
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
    @keyframes overlayPulse {
      0%, 100% {
        transform: scale(1);
        box-shadow: 0 0 0 0 rgba(92, 181, 255, 0.34);
      }
      60% {
        transform: scale(1.08);
        box-shadow: 0 0 0 12px rgba(92, 181, 255, 0.02);
      }
    }
    @keyframes playPulse {
      0%, 100% {
        transform: translateY(0) scale(1);
        box-shadow:
          0 10px 28px var(--action-progress-shadow),
          0 0 0 0 rgba(114, 241, 184, 0.24);
      }
      55% {
        transform: translateY(-1px) scale(1.03);
        box-shadow:
          0 12px 30px var(--action-progress-shadow),
          0 0 0 14px rgba(114, 241, 184, 0);
      }
    }
    @media (max-width: 1160px) {
      .layout-main {
        grid-template-columns: 1fr;
      }
      .graph-panel {
        min-height: auto;
      }
      .graph-stage, .phase-graph {
        min-width: var(--graph-width-desktop, ${desktopGraphWidth}px);
        min-height: var(--graph-height-desktop, ${desktopGraphHeight}px);
      }
    }
    @media (max-width: 1500px) and (min-width: 761px) {
      .hero, .graph-panel, .detail-panel {
        padding: 18px;
      }
      .shell {
        padding: 16px;
        gap: 16px;
      }
      .layout-main {
        gap: 16px;
      }
    }
    @media (max-width: 760px) {
      .hero-head {
        grid-template-columns: 1fr;
      }
      .shell {
        padding: 12px;
      }
      .shell-body {
        padding-bottom: 2px;
      }
      .hero, .graph-panel, .detail-panel {
        padding: 16px;
      }
      .control-strip {
        justify-self: stretch;
        justify-content: flex-start;
      }
      .detail-metrics {
        grid-template-columns: 1fr;
      }
      .iteration-lineage-grid {
        grid-template-columns: 1fr;
      }
      .detail-actions--phase-header {
        position: static;
        margin: 12px 0 0;
        justify-content: flex-start;
      }
      .detail-actions--artifact {
        grid-template-columns: 1fr;
      }
      .review-regression__header {
        grid-template-columns: 1fr;
      }
      .review-regression__stat {
        justify-items: start;
      }
      .phase-node {
        left: var(--phase-left-mobile);
        top: var(--phase-top-mobile);
        width: ${mobilePhaseNodeWidth}px;
      }
      .graph-stage, .phase-graph {
        width: var(--graph-width-mobile, ${mobileGraphWidth}px);
        min-width: var(--graph-width-mobile, ${mobileGraphWidth}px);
        min-height: var(--graph-height-mobile, ${mobileGraphHeight}px);
      }
      .graph-links--desktop {
        display: none;
      }
      .graph-links--mobile {
        display: block;
      }
      .execution-overlay {
        left: 10px;
        right: 10px;
        top: 10px;
        width: auto;
        min-height: 148px;
      }
      .detail-actions--files {
        align-items: stretch;
      }
      .workflow-files-overlay {
        padding: 12px;
        align-items: flex-start;
      }
      .workflow-files-dialog {
        width: 100%;
        max-height: calc(100vh - 24px);
      }
      .file-item {
        grid-template-columns: 1fr;
      }
      .clarification-suggestion {
        grid-template-columns: 1fr;
      }
      .workflow-action-button--compact {
        width: 100%;
        min-width: 0;
      }
      .file-kind-action {
        min-width: 0;
      }
    }
  </style>
</head>
<body>
  <div class="workflow-files-overlay" data-workflow-files-overlay hidden>
    <div class="workflow-files-dialog panel" role="dialog" aria-modal="true" aria-labelledby="workflow-files-title">
      <div class="workflow-files-dialog__head">
        <div>
          <p class="eyebrow">Workflow Files</p>
          <h2 id="workflow-files-title">${escapeHtml(workflow.usId)} files and context</h2>
          <p>Workflow-level files are grouped here instead of repeating them in every phase detail.</p>
        </div>
        <button class="workflow-files-dialog__close" type="button" data-close-workflow-files aria-label="Close workflow files">
          Close
        </button>
      </div>
      <div class="workflow-files-shell">
        ${workflowFilesSection}
      </div>
    </div>
  </div>
  <div class="workflow-files-overlay" data-reject-overlay hidden>
    <div class="workflow-files-dialog workflow-files-dialog--reject panel" role="dialog" aria-modal="true" aria-labelledby="workflow-reject-title">
      <div class="workflow-files-dialog__head">
        <div>
          <p class="eyebrow">Reject Approval</p>
          <h2 id="workflow-reject-title">Reject Approval</h2>
          <p data-reject-helper-copy>Describe what is wrong before sending the workflow back for correction.</p>
        </div>
        <button class="workflow-files-dialog__close" type="button" data-close-reject-modal aria-label="Close reject dialog">
          Close
        </button>
      </div>
      <div class="workflow-files-shell workflow-files-shell--reject">
        <label class="phase-input-label" for="workflow-reject-textarea" data-reject-prompt-copy>Describe what is wrong</label>
        <textarea
          id="workflow-reject-textarea"
          class="phase-input-textarea phase-input-textarea--reject"
          rows="9"
          placeholder="Describe what is wrong so the previous working phase can absorb this feedback and execute it."></textarea>
        <div class="detail-actions detail-actions--phase-input">
          <button class="workflow-action-button workflow-action-button--document" type="button" data-close-reject-modal>Cancel</button>
          <button class="workflow-action-button workflow-action-button--danger" type="button" data-submit-reject disabled>Reject</button>
        </div>
      </div>
    </div>
  </div>
  <div class="workflow-files-overlay" data-review-regression-overlay hidden>
    <div class="workflow-files-dialog workflow-files-dialog--reject panel" role="dialog" aria-modal="true" aria-labelledby="workflow-review-regression-title">
      <div class="workflow-files-dialog__head">
        <div>
          <p class="eyebrow">Review Decision</p>
          <h2 id="workflow-review-regression-title">Send Review Back To Implementation</h2>
          <p data-review-regression-helper>Confirm the human decision before SpecForge regresses the workflow and starts the next implementation pass.</p>
        </div>
        <button class="workflow-files-dialog__close" type="button" data-close-review-regression-modal aria-label="Close review regression dialog">
          Close
        </button>
      </div>
      <div class="workflow-files-shell workflow-files-shell--reject">
        <div class="review-regression-confirmation">
          <div class="review-regression-confirmation__row">
            <span class="phase-input-label">Review artifact context</span>
            <strong data-review-regression-context-mode>Include generated review artifact</strong>
          </div>
          <div class="review-regression-confirmation__row">
            <span class="phase-input-label">Extra correction note</span>
            <strong data-review-regression-prompt-mode>Optional</strong>
          </div>
          <p class="panel-copy" data-review-regression-prompt-preview>No additional correction note will be sent.</p>
        </div>
        <div class="detail-actions detail-actions--phase-input">
          <button class="workflow-action-button workflow-action-button--document" type="button" data-close-review-regression-modal>Cancel</button>
          <button class="workflow-action-button workflow-action-button--danger" type="button" data-submit-review-regression-modal>Confirm And Send</button>
        </div>
      </div>
    </div>
  </div>
  <div class="workflow-files-overlay" data-review-approve-anyway-overlay hidden>
    <div class="workflow-files-dialog workflow-files-dialog--reject panel" role="dialog" aria-modal="true" aria-labelledby="workflow-review-approve-anyway-title">
      <div class="workflow-files-dialog__head">
        <div>
          <p class="eyebrow">Force Approval</p>
          <h2 id="workflow-review-approve-anyway-title">Approve Review Anyway</h2>
          <p>Confirm that the user accepts moving forward to release approval even if the review has not passed normally.</p>
        </div>
        <button class="workflow-files-dialog__close" type="button" data-close-review-approve-anyway-modal aria-label="Close approve anyway dialog">
          Close
        </button>
      </div>
      <div class="workflow-files-shell workflow-files-shell--reject">
        <label class="phase-input-label" for="workflow-review-approve-anyway-textarea">Audit reason</label>
        <textarea
          id="workflow-review-approve-anyway-textarea"
          class="phase-input-textarea phase-input-textarea--reject"
          rows="8"
          placeholder="Explain why the user is explicitly overriding the review gate and accepting release-approval risk."></textarea>
        <div class="detail-actions detail-actions--phase-input">
          <button class="workflow-action-button workflow-action-button--document" type="button" data-close-review-approve-anyway-modal>Cancel</button>
          <button class="workflow-action-button workflow-action-button--attention" type="button" data-submit-review-approve-anyway disabled>Approve Anyway</button>
        </div>
      </div>
    </div>
  </div>
  <div class="shell" data-workflow-shell data-us-id="${escapeHtmlAttribute(workflow.usId)}">
    <section class="panel hero">
      <div class="hero-head">
        <div class="hero-main">
          <div class="hero-caption">
            <p class="eyebrow">SpecForge.AI Workflow Graph</p>
            ${state.runtimeVersion ? `<span class="runtime-version">v.${escapeHtml(state.runtimeVersion)}</span>` : ""}
          </div>
          <h1>${escapeHtml(buildWorkflowHeroTitle(workflow))}</h1>
          <div class="hero-meta">
            <span class="token accent">${escapeHtml(workflow.category)}</span>
            <span class="token${heroTokenClass(workflow.status)}">${escapeHtml(workflow.status)}</span>
            <span class="token">${escapeHtml(displayedPhaseId)}</span>
            <span class="token">${escapeHtml(workflow.workBranch ?? "branch:not-created")}</span>
            <span class="token${heroTokenClass(`runner:${playbackState}`)}">runner:${escapeHtml(playbackState)}</span>
          </div>
        </div>
        <div class="control-strip">
          ${debugResetButton}
          ${playbackButtons}
          <button class="icon-button icon-button--document" type="button" data-open-workflow-files aria-label="Open workflow files">
            ${fileIcon()}
          </button>
        </div>
      </div>
      ${settingsBanner}
      ${implementationReviewLimitBanner}
    </section>
    <div class="shell-body">
      <section class="layout">
        <div class="layout-main">
        <aside class="panel graph-panel" data-panel-scroll="graph">
          <h2 class="panel-title">Workflow Constellation</h2>
          <p class="panel-copy">The graph is the primary surface. Click any phase node to move the detail focus and inspect its artifact and phase context.</p>
          <div class="graph-stage${executionOverlay ? " graph-stage--overlay-active" : ""}${playbackState === "playing" || playbackState === "stopping" ? " graph-stage--overlay-blocking" : ""}">
            ${executionOverlay}
            ${phaseGraph}
          </div>
        </aside>
        <main class="panel detail-panel" data-panel-scroll="detail">
          <div class="detail-card-shell">
            ${detailActions}
            <section class="detail-card detail-card--phase-overview">
            <h2>${escapeHtml(selectedPhase.title)}</h2>
            <div class="detail-meta">
              <span class="token">${escapeHtml(phaseSecondaryLabel(selectedPhase))}</span>
              <span class="token${selectedPhaseStateClass}">${escapeHtml(selectedPhaseDisplayState)}</span>
              ${selectedPhase.requiresApproval ? `<span class="token token--attention">approval required</span>` : ""}
              ${selectedPhase.isApproved ? `<span class="token token--success">approved</span>` : ""}
            </div>
            ${selectedPhaseMetrics ? `<div class="detail-metrics">${selectedPhaseMetrics}</div>` : ""}
            </section>
          </div>
          ${workflowUsageDashboard}
          ${modelUsageTable}
          ${phaseUsageTable}
          ${buildPhaseSecuritySummary(selectedPhase.executionReadiness)}
          ${phaseSpecificSections.beforeArtifact.join("")}
          ${iterationRail}
          ${iterationDetailSection}
          <section class="detail-card">
            <h3>Artifact</h3>
            ${artifactSection}
          </section>
          ${phaseSpecificSections.afterArtifact.join("")}
          <section class="detail-card">
            <h3>Phase Prompts</h3>
            ${promptSection}
          </section>
        </main>
        </div>
      </section>
    </div>
  </div>
  <script>
    const vscode = acquireVsCodeApi();
    window.addEventListener("error", (event) => {
      try {
        vscode.postMessage({
          command: "webviewClientError",
          detail: "error:" + (event.message ?? "unknown")
        });
      } catch {
        // Ignore reporting failures inside the error reporter itself.
      }
    });
    window.addEventListener("unhandledrejection", (event) => {
      try {
        const reason = event.reason instanceof Error
          ? event.reason.message
          : String(event.reason ?? "unknown");
        vscode.postMessage({
          command: "webviewClientError",
          detail: "unhandledrejection:" + reason
        });
      } catch {
        // Ignore reporting failures inside the rejection reporter itself.
      }
    });
    const viewState = vscode.getState() ?? {};
    const workflowShell = document.querySelector("[data-workflow-shell]");
    const graphPanel = document.querySelector('[data-panel-scroll="graph"]');
    const detailPanel = document.querySelector('[data-panel-scroll="detail"]');
    const selectedPhaseNode = document.querySelector(".phase-node.selected");
    const currentPhaseNode = document.querySelector(".phase-node.phase-node--current");
    const focusedPhaseNode = selectedPhaseNode instanceof HTMLElement
      ? selectedPhaseNode
      : currentPhaseNode instanceof HTMLElement
        ? currentPhaseNode
        : null;
    const focusedPhaseId = focusedPhaseNode instanceof HTMLElement
      ? focusedPhaseNode.dataset.phaseId ?? ""
      : "";
    const centerFocusedPhaseInGraph = () => {
      if (!(graphPanel instanceof HTMLElement) || !(focusedPhaseNode instanceof HTMLElement) || !focusedPhaseId) {
        return;
      }

      const targetTop = focusedPhaseNode.offsetTop - ((graphPanel.clientHeight - focusedPhaseNode.offsetHeight) / 2);
      const targetLeft = focusedPhaseNode.offsetLeft - ((graphPanel.clientWidth - focusedPhaseNode.offsetWidth) / 2);
      graphPanel.scrollTop = Math.max(0, targetTop);
      graphPanel.scrollLeft = Math.max(0, targetLeft);
    };
    const autoScrollStateKey = workflowShell instanceof HTMLElement
      ? "specforge-ai:auto-scroll-phase:" + (workflowShell.dataset.usId ?? "")
      : "";
    if (focusedPhaseNode instanceof HTMLElement && focusedPhaseId && autoScrollStateKey) {
      try {
        const previousPhaseId = window.sessionStorage.getItem(autoScrollStateKey) ?? "";
        const bounds = focusedPhaseNode.getBoundingClientRect();
        const panelBounds = graphPanel instanceof HTMLElement ? graphPanel.getBoundingClientRect() : null;
        const outsideComfortZone = panelBounds
          ? bounds.top < panelBounds.top + (panelBounds.height * 0.14) || bounds.bottom > panelBounds.bottom - (panelBounds.height * 0.18)
          : bounds.top < window.innerHeight * 0.14 || bounds.bottom > window.innerHeight * 0.82;
        if (previousPhaseId !== focusedPhaseId && outsideComfortZone) {
          window.requestAnimationFrame(() => {
            centerFocusedPhaseInGraph();
          });
        }
        window.requestAnimationFrame(() => centerFocusedPhaseInGraph());
        window.setTimeout(() => centerFocusedPhaseInGraph(), 80);
        window.sessionStorage.setItem(autoScrollStateKey, focusedPhaseId);
      } catch {
        // Best effort only. The workflow view still works without persisted scroll state.
      }
    }
    const persistWorkflowScrollState = () => {
      try {
        vscode.setState({
          ...viewState,
          graphScrollTop: graphPanel instanceof HTMLElement ? graphPanel.scrollTop : 0,
          detailScrollTop: detailPanel instanceof HTMLElement ? detailPanel.scrollTop : 0
        });
      } catch {
        // Do not let view-state persistence break workflow interaction.
      }
    };
    const postCommand = (element) => {
      try {
        persistWorkflowScrollState();
      } catch {
        // Ignore persistence issues and still dispatch the command.
      }

      try {
        vscode.postMessage({
          command: "webviewDispatch",
          detail: "command=" + (element.dataset.command ?? "") + ",phase=" + (element.dataset.phaseId ?? "")
        });
        vscode.postMessage({
          command: element.dataset.command,
          phaseId: element.dataset.phaseId,
          iterationKey: element.dataset.iterationKey,
          path: element.dataset.path,
          kind: element.dataset.kind
        });
      } catch {
        // Last-resort swallow to avoid breaking the webview script.
      }
    };
    document.addEventListener("click", (event) => {
      const commandElement = event.target instanceof Element
        ? event.target.closest("[data-command]")
        : null;
      if (!(commandElement instanceof HTMLElement) || commandElement.dataset.command === "approve") {
        return;
      }

      postCommand(commandElement);
    }, true);
    document.addEventListener("keydown", (event) => {
      const commandElement = event.target instanceof Element
        ? event.target.closest('[data-command="selectPhase"]')
        : null;
      if (!(commandElement instanceof HTMLElement)) {
        return;
      }
      if (event.key !== "Enter" && event.key !== " ") {
        return;
      }

      event.preventDefault();
      postCommand(commandElement);
    });
    try {
      vscode.postMessage({
        command: "webviewReady",
        detail: "workflow interactive script initialized"
      });
    } catch {
      // Ignore ready-report failures.
    }
    if (graphPanel instanceof HTMLElement) {
      const restoredGraphScrollTop = typeof viewState.graphScrollTop === "number" ? viewState.graphScrollTop : null;
      if (restoredGraphScrollTop !== null && restoredGraphScrollTop > 0) {
        window.requestAnimationFrame(() => {
          graphPanel.scrollTop = restoredGraphScrollTop;
        });
      }
      graphPanel.addEventListener("scroll", () => {
        persistWorkflowScrollState();
      }, { passive: true });
    }
    if (detailPanel instanceof HTMLElement) {
      const restoredDetailScrollTop = typeof viewState.detailScrollTop === "number" ? viewState.detailScrollTop : null;
      if (restoredDetailScrollTop !== null && restoredDetailScrollTop > 0) {
        window.requestAnimationFrame(() => {
          detailPanel.scrollTop = restoredDetailScrollTop;
        });
      }
      detailPanel.addEventListener("scroll", () => {
        persistWorkflowScrollState();
      }, { passive: true });
    }
    function copyPlainText(text) {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.setAttribute("readonly", "true");
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      textarea.style.pointerEvents = "none";
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      textarea.setSelectionRange(0, textarea.value.length);
      const copied = document.execCommand("copy");
      document.body.removeChild(textarea);
      return copied;
    }
    for (const element of document.querySelectorAll("[data-copy-text]")) {
      if (!(element instanceof HTMLButtonElement)) {
        continue;
      }

      element.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        const text = element.dataset.copyText ?? "";
        if (!text || !copyPlainText(text)) {
          return;
        }

        element.classList.add("is-copied");
        window.setTimeout(() => {
          element.classList.remove("is-copied");
        }, 1000);
      });
    }

    const approvalBranchInput = document.querySelector("[data-approval-base-branch-input]");
    const approvalWorkBranchInput = document.querySelector("[data-approval-work-branch-input]");
    const approvalBranchAccept = document.querySelector("[data-approval-branch-accept]");
    const approvalBranchAccepted = document.querySelector("[data-approval-branch-accepted]");
    const approvalBranchShell = document.querySelector("[data-approval-branch-shell]");
    const approveButton = document.querySelector("[data-approve-button]");
    const pendingApprovalAnswers = Number(approveButton?.dataset.pendingApprovalCount ?? "0");
    const requiresExplicitApprovalBranchAcceptance = approvalBranchShell?.dataset.requireExplicitApprovalBranchAcceptance === "true";
    const normalizeBranchValue = (value) => (value ?? "").trim();
    const setApprovalBranchState = (nextState) => {
      vscode.setState({
        ...viewState,
        workflowFilesOpen: Boolean(viewState.workflowFilesOpen),
        phaseInputDraft: typeof viewState.phaseInputDraft === "string" ? viewState.phaseInputDraft : "",
        approvalBaseBranchDraft: nextState.draft,
        approvalBaseBranchAccepted: nextState.accepted,
        approvalBaseBranchAcceptedValue: nextState.acceptedValue,
        approvalWorkBranchDraft: nextState.workBranchDraft
      });
    };
    const syncApprovalBranchUi = () => {
      if (!(approvalBranchInput instanceof HTMLInputElement)) {
        return;
      }

      const draft = normalizeBranchValue(approvalBranchInput.value);
      const workBranchDraft = approvalWorkBranchInput instanceof HTMLInputElement
        ? normalizeBranchValue(approvalWorkBranchInput.value)
        : "";
      const acceptedValue = normalizeBranchValue(viewState.approvalBaseBranchAcceptedValue);
      const accepted = Boolean(viewState.approvalBaseBranchAccepted) && draft.length > 0 && draft === acceptedValue;
      if (approveButton instanceof HTMLButtonElement) {
        approveButton.disabled = draft.length === 0
          || workBranchDraft.length === 0
          || pendingApprovalAnswers > 0
          || (requiresExplicitApprovalBranchAcceptance && !accepted);
      }
      if (approvalBranchAccept instanceof HTMLElement) {
        approvalBranchAccept.hidden = !requiresExplicitApprovalBranchAcceptance || accepted;
      }
      if (approvalBranchAccepted instanceof HTMLElement) {
        approvalBranchAccepted.hidden = !requiresExplicitApprovalBranchAcceptance || !accepted;
      }
    };

    if (approvalBranchInput instanceof HTMLInputElement) {
      const restoredDraft = typeof viewState.approvalBaseBranchDraft === "string"
        ? viewState.approvalBaseBranchDraft
        : approvalBranchInput.value;
      approvalBranchInput.value = restoredDraft;
      approvalBranchInput.addEventListener("input", () => {
        const draft = approvalBranchInput.value;
        const acceptedValue = typeof viewState.approvalBaseBranchAcceptedValue === "string"
          ? viewState.approvalBaseBranchAcceptedValue
          : "";
        const accepted = Boolean(viewState.approvalBaseBranchAccepted) && normalizeBranchValue(draft) === normalizeBranchValue(acceptedValue);
        viewState.approvalBaseBranchDraft = draft;
        viewState.approvalBaseBranchAccepted = accepted;
        setApprovalBranchState({
          draft,
          accepted,
          acceptedValue,
          workBranchDraft: approvalWorkBranchInput instanceof HTMLInputElement ? approvalWorkBranchInput.value : ""
        });
        syncApprovalBranchUi();
      });
      syncApprovalBranchUi();
    }

    if (approvalWorkBranchInput instanceof HTMLInputElement) {
      const restoredWorkBranchDraft = typeof viewState.approvalWorkBranchDraft === "string"
        ? viewState.approvalWorkBranchDraft
        : approvalWorkBranchInput.value;
      approvalWorkBranchInput.value = restoredWorkBranchDraft;
      approvalWorkBranchInput.addEventListener("input", () => {
        viewState.approvalWorkBranchDraft = approvalWorkBranchInput.value;
        setApprovalBranchState({
          draft: approvalBranchInput instanceof HTMLInputElement ? approvalBranchInput.value : "",
          accepted: Boolean(viewState.approvalBaseBranchAccepted),
          acceptedValue: typeof viewState.approvalBaseBranchAcceptedValue === "string"
            ? viewState.approvalBaseBranchAcceptedValue
            : "",
          workBranchDraft: approvalWorkBranchInput.value
        });
        syncApprovalBranchUi();
      });
      syncApprovalBranchUi();
    }

    if (approvalBranchAccept instanceof HTMLElement && approvalBranchInput instanceof HTMLInputElement) {
      approvalBranchAccept.addEventListener("click", () => {
        const draft = approvalBranchInput.value;
        const acceptedValue = normalizeBranchValue(draft);
        viewState.approvalBaseBranchDraft = draft;
        viewState.approvalBaseBranchAccepted = true;
        viewState.approvalBaseBranchAcceptedValue = acceptedValue;
        setApprovalBranchState({
          draft,
          accepted: true,
          acceptedValue,
          workBranchDraft: approvalWorkBranchInput instanceof HTMLInputElement ? approvalWorkBranchInput.value : ""
        });
        syncApprovalBranchUi();
      });
    }

    if (approveButton instanceof HTMLButtonElement) {
      approveButton.addEventListener("click", () => {
        const baseBranch = approvalBranchInput instanceof HTMLInputElement
          ? normalizeBranchValue(approvalBranchInput.value)
          : undefined;
        const workBranch = approvalWorkBranchInput instanceof HTMLInputElement
          ? normalizeBranchValue(approvalWorkBranchInput.value)
          : undefined;
        if (approveButton.disabled) {
          return;
        }

        vscode.postMessage({
          command: "approve",
          baseBranch,
          workBranch
        });
      });
    }

    const approvalAnswerDrafts = typeof viewState.approvalAnswerDrafts === "object" && viewState.approvalAnswerDrafts
      ? viewState.approvalAnswerDrafts
      : {};
    const setApprovalAnswerDraft = (index, value) => {
      approvalAnswerDrafts[String(index)] = value;
      vscode.setState({
        ...viewState,
        workflowFilesOpen: Boolean(viewState.workflowFilesOpen),
        phaseInputDraft: typeof viewState.phaseInputDraft === "string" ? viewState.phaseInputDraft : "",
        approvalAnswerDrafts
      });
    };
    for (const item of document.querySelectorAll("[data-approval-question-item]")) {
      const toggle = item.querySelector("[data-approval-question-toggle]");
      const editor = item.querySelector("[data-approval-question-editor]");
      if (!(toggle instanceof HTMLButtonElement) || !(editor instanceof HTMLElement)) {
        continue;
      }
      toggle.addEventListener("click", () => {
        editor.hidden = !editor.hidden;
      });
    }
    for (const input of document.querySelectorAll("[data-approval-answer-input]")) {
      if (!(input instanceof HTMLTextAreaElement)) {
        continue;
      }
      const index = input.dataset.index ?? "";
      const draft = approvalAnswerDrafts[index];
      if (typeof draft === "string") {
        input.value = draft;
      }
      input.addEventListener("input", () => {
        setApprovalAnswerDraft(index, input.value);
      });
    }
    for (const button of document.querySelectorAll("[data-approval-answer-apply]")) {
      if (!(button instanceof HTMLButtonElement)) {
        continue;
      }
      button.addEventListener("click", () => {
        const index = button.dataset.index ?? "";
        const input = document.querySelector('[data-approval-answer-input][data-index="' + index + '"]');
        if (!(input instanceof HTMLTextAreaElement)) {
          return;
        }
        const answer = input.value.trim();
        const question = input.dataset.question ?? "";
        if (!question || !answer) {
          return;
        }

        vscode.postMessage({
          command: "submitApprovalAnswer",
          question,
          answer
        });
      });
    }

    const fileKindToggle = document.querySelector("[data-file-kind-toggle]");
    const attachFilesButton = document.querySelector("[data-attach-files-button]");
    if (fileKindToggle && attachFilesButton instanceof HTMLElement) {
      for (const element of fileKindToggle.querySelectorAll("[data-file-kind-option]")) {
        element.addEventListener("click", () => {
          const selectedKind = element.dataset.fileKindOption === "attachment" ? "attachment" : "context";
          attachFilesButton.dataset.kind = selectedKind;
          for (const candidate of fileKindToggle.querySelectorAll("[data-file-kind-option]")) {
            candidate.classList.toggle("file-kind-toggle__option--active", candidate === element);
          }
        });
      }
    }

    const workflowFilesOverlay = document.querySelector("[data-workflow-files-overlay]");
    const rejectOverlay = document.querySelector("[data-reject-overlay]");
    const reviewRegressionOverlay = document.querySelector("[data-review-regression-overlay]");
    const reviewApproveAnywayOverlay = document.querySelector("[data-review-approve-anyway-overlay]");
    const rejectTextarea = document.querySelector("#workflow-reject-textarea");
    const reviewApproveAnywayTextarea = document.querySelector("#workflow-review-approve-anyway-textarea");
    const rejectTitle = document.querySelector("#workflow-reject-title");
    const rejectPromptCopy = document.querySelector("[data-reject-prompt-copy]");
    const rejectHelperCopy = document.querySelector("[data-reject-helper-copy]");
    const rejectSubmitButton = document.querySelector("[data-submit-reject]");
    const reviewRegressionContextMode = document.querySelector("[data-review-regression-context-mode]");
    const reviewRegressionPromptMode = document.querySelector("[data-review-regression-prompt-mode]");
    const reviewRegressionPromptPreview = document.querySelector("[data-review-regression-prompt-preview]");
    const reviewRegressionSubmitButton = document.querySelector("[data-submit-review-regression-modal]");
    const reviewApproveAnywaySubmitButton = document.querySelector("[data-submit-review-approve-anyway]");
    let rejectModalState = {
      targetPhaseId: "",
      mode: "",
      title: "Reject Approval",
      prompt: "Describe what is wrong",
      helper: "Describe what is wrong before sending the workflow back for correction.",
      confirmLabel: "Reject"
    };
    const toggleWorkflowFiles = (open) => {
      if (!(workflowFilesOverlay instanceof HTMLElement)) {
        return;
      }

      workflowFilesOverlay.hidden = !open;
      workflowFilesOverlay.classList.toggle("is-open", open);
      if (workflowShell instanceof HTMLElement) {
        workflowShell.classList.toggle("shell--interaction-locked", open);
      }
      vscode.setState({
        ...viewState,
        workflowFilesOpen: open
      });
    };

    for (const element of document.querySelectorAll("[data-open-workflow-files]")) {
      element.addEventListener("click", () => {
        toggleWorkflowFiles(true);
      });
    }

    for (const element of document.querySelectorAll("[data-close-workflow-files]")) {
      element.addEventListener("click", () => {
        toggleWorkflowFiles(false);
      });
    }

    if (workflowFilesOverlay instanceof HTMLElement) {
      workflowFilesOverlay.addEventListener("click", (event) => {
        if (event.target === workflowFilesOverlay) {
          toggleWorkflowFiles(false);
        }
      });
    }

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        toggleWorkflowFiles(false);
        toggleRejectModal(false);
        toggleReviewRegressionModal(false);
        toggleReviewApproveAnywayModal(false);
      }
    });

    if (viewState.workflowFilesOpen) {
      toggleWorkflowFiles(true);
    }

    const syncRejectUi = () => {
      if (!(rejectSubmitButton instanceof HTMLButtonElement) || !(rejectTextarea instanceof HTMLTextAreaElement)) {
        return;
      }

      rejectSubmitButton.disabled = rejectTextarea.value.trim().length === 0;
      rejectSubmitButton.textContent = rejectModalState.confirmLabel;
    };

    const toggleRejectModal = (open, nextState) => {
      if (!(rejectOverlay instanceof HTMLElement)) {
        return;
      }

      if (nextState) {
        rejectModalState = {
          ...rejectModalState,
          ...nextState
        };
      }

      rejectOverlay.hidden = !open;
      rejectOverlay.classList.toggle("is-open", open);
      if (workflowShell instanceof HTMLElement) {
        workflowShell.classList.toggle("shell--interaction-locked", open);
      }
      if (rejectTitle instanceof HTMLElement) {
        rejectTitle.textContent = rejectModalState.title;
      }
      if (rejectPromptCopy instanceof HTMLElement) {
        rejectPromptCopy.textContent = rejectModalState.prompt;
      }
      if (rejectHelperCopy instanceof HTMLElement) {
        rejectHelperCopy.textContent = rejectModalState.helper;
      }
      if (rejectSubmitButton instanceof HTMLButtonElement) {
        rejectSubmitButton.textContent = rejectModalState.confirmLabel;
      }
      if (open && rejectTextarea instanceof HTMLTextAreaElement) {
        rejectTextarea.value = "";
        syncRejectUi();
        window.setTimeout(() => {
          rejectTextarea.focus();
        }, 0);
      } else {
        syncRejectUi();
      }
    };

    const syncReviewRegressionModal = () => {
      const includeReviewArtifact = reviewRegressionIncludeArtifact instanceof HTMLInputElement
        ? reviewRegressionIncludeArtifact.checked
        : true;
      const prompt = reviewRegressionTextarea instanceof HTMLTextAreaElement
        ? reviewRegressionTextarea.value.trim()
        : "";
      if (reviewRegressionContextMode instanceof HTMLElement) {
        reviewRegressionContextMode.textContent = includeReviewArtifact
          ? "Include generated review artifact"
          : "Do not send generated review artifact";
      }
      if (reviewRegressionPromptMode instanceof HTMLElement) {
        reviewRegressionPromptMode.textContent = includeReviewArtifact
          ? (prompt.length > 0 ? "Optional note provided" : "Optional")
          : "Required";
      }
      if (reviewRegressionPromptPreview instanceof HTMLElement) {
        reviewRegressionPromptPreview.textContent = prompt.length > 0
          ? prompt
          : includeReviewArtifact
            ? "No additional correction note will be sent."
            : "A correction note is required because the review artifact will not be sent.";
      }
      if (reviewRegressionSubmitButton instanceof HTMLButtonElement) {
        reviewRegressionSubmitButton.disabled = !includeReviewArtifact && prompt.length === 0;
      }
    };

    const toggleReviewRegressionModal = (open) => {
      if (!(reviewRegressionOverlay instanceof HTMLElement)) {
        return;
      }

      reviewRegressionOverlay.hidden = !open;
      reviewRegressionOverlay.classList.toggle("is-open", open);
      if (workflowShell instanceof HTMLElement) {
        workflowShell.classList.toggle("shell--interaction-locked", open);
      }
      syncReviewRegressionModal();
    };

    const syncReviewApproveAnywayUi = () => {
      if (!(reviewApproveAnywaySubmitButton instanceof HTMLButtonElement) || !(reviewApproveAnywayTextarea instanceof HTMLTextAreaElement)) {
        return;
      }

      reviewApproveAnywaySubmitButton.disabled = reviewApproveAnywayTextarea.value.trim().length === 0;
    };

    const toggleReviewApproveAnywayModal = (open) => {
      if (!(reviewApproveAnywayOverlay instanceof HTMLElement)) {
        return;
      }

      reviewApproveAnywayOverlay.hidden = !open;
      reviewApproveAnywayOverlay.classList.toggle("is-open", open);
      if (workflowShell instanceof HTMLElement) {
        workflowShell.classList.toggle("shell--interaction-locked", open);
      }
      if (open && reviewApproveAnywayTextarea instanceof HTMLTextAreaElement) {
        reviewApproveAnywayTextarea.value = "";
        syncReviewApproveAnywayUi();
        window.setTimeout(() => {
          reviewApproveAnywayTextarea.focus();
        }, 0);
      } else {
        syncReviewApproveAnywayUi();
      }
    };

    for (const element of document.querySelectorAll("[data-open-reject-modal]")) {
      element.addEventListener("click", () => {
        toggleRejectModal(true, {
          targetPhaseId: element.dataset.rejectTargetPhase ?? "",
          mode: element.dataset.rejectMode ?? "",
          title: element.dataset.rejectTitle ?? "Reject Approval",
          prompt: element.dataset.rejectPrompt ?? "Describe what is wrong",
          helper: element.dataset.rejectHelper ?? "Describe what is wrong before sending the workflow back for correction.",
          confirmLabel: element.dataset.rejectConfirmLabel ?? "Reject"
        });
      });
    }

    for (const element of document.querySelectorAll("[data-close-reject-modal]")) {
      element.addEventListener("click", () => {
        toggleRejectModal(false);
      });
    }

    if (rejectOverlay instanceof HTMLElement) {
      rejectOverlay.addEventListener("click", (event) => {
        if (event.target === rejectOverlay) {
          toggleRejectModal(false);
        }
      });
    }

    for (const element of document.querySelectorAll("[data-open-review-regression-modal]")) {
      element.addEventListener("click", () => {
        toggleReviewRegressionModal(true);
      });
    }

    for (const element of document.querySelectorAll("[data-close-review-regression-modal]")) {
      element.addEventListener("click", () => {
        toggleReviewRegressionModal(false);
      });
    }

    if (reviewRegressionOverlay instanceof HTMLElement) {
      reviewRegressionOverlay.addEventListener("click", (event) => {
        if (event.target === reviewRegressionOverlay) {
          toggleReviewRegressionModal(false);
        }
      });
    }

    for (const element of document.querySelectorAll("[data-open-review-approve-anyway-modal]")) {
      element.addEventListener("click", () => {
        toggleReviewApproveAnywayModal(true);
      });
    }

    for (const element of document.querySelectorAll("[data-close-review-approve-anyway-modal]")) {
      element.addEventListener("click", () => {
        toggleReviewApproveAnywayModal(false);
      });
    }

    if (reviewApproveAnywayOverlay instanceof HTMLElement) {
      reviewApproveAnywayOverlay.addEventListener("click", (event) => {
        if (event.target === reviewApproveAnywayOverlay) {
          toggleReviewApproveAnywayModal(false);
        }
      });
    }

    if (reviewApproveAnywayTextarea instanceof HTMLTextAreaElement) {
      reviewApproveAnywayTextarea.addEventListener("input", () => {
        syncReviewApproveAnywayUi();
      });
    }

    if (reviewApproveAnywaySubmitButton instanceof HTMLButtonElement && reviewApproveAnywayTextarea instanceof HTMLTextAreaElement) {
      reviewApproveAnywaySubmitButton.addEventListener("click", () => {
        const reason = reviewApproveAnywayTextarea.value.trim();
        if (!reason) {
          syncReviewApproveAnywayUi();
          return;
        }

        toggleReviewApproveAnywayModal(false);
        vscode.postMessage({
          command: "approveReviewAnyway",
          reason
        });
      });
    }

    if (rejectTextarea instanceof HTMLTextAreaElement) {
      rejectTextarea.addEventListener("input", () => {
        syncRejectUi();
      });
    }

    if (rejectSubmitButton instanceof HTMLButtonElement && rejectTextarea instanceof HTMLTextAreaElement) {
      rejectSubmitButton.addEventListener("click", () => {
        const reason = rejectTextarea.value.trim();
        if (!reason) {
          syncRejectUi();
          return;
        }

        toggleRejectModal(false);
        vscode.postMessage({
          command: "reject",
          reason
        });
      });
    }

    let draggedFile = null;
    for (const element of document.querySelectorAll("[data-file-path][data-file-kind]")) {
      element.addEventListener("dragstart", (event) => {
        draggedFile = {
          path: element.dataset.filePath,
          kind: element.dataset.fileKind
        };
        element.classList.add("attachment-item--dragging");
        event.dataTransfer?.setData("text/plain", draggedFile.path ?? "");
        if (event.dataTransfer) {
          event.dataTransfer.effectAllowed = "move";
        }
      });

      element.addEventListener("dragend", () => {
        element.classList.remove("attachment-item--dragging");
        draggedFile = null;
        for (const zone of document.querySelectorAll("[data-file-drop-zone]")) {
          zone.classList.remove("file-group--drop-target");
        }
      });
    }

    for (const zone of document.querySelectorAll("[data-file-drop-zone][data-drop-kind]")) {
      zone.addEventListener("dragover", (event) => {
        if (!draggedFile) {
          return;
        }

        event.preventDefault();
        zone.classList.add("file-group--drop-target");
        if (event.dataTransfer) {
          event.dataTransfer.dropEffect = "move";
        }
      });

      zone.addEventListener("dragleave", () => {
        zone.classList.remove("file-group--drop-target");
      });

      zone.addEventListener("drop", (event) => {
        if (!draggedFile) {
          return;
        }

        event.preventDefault();
        zone.classList.remove("file-group--drop-target");
        const nextKind = zone.dataset.dropKind;
        if (!nextKind || nextKind === draggedFile.kind || !draggedFile.path) {
          return;
        }

        vscode.postMessage({
          command: "setFileKind",
          path: draggedFile.path,
          kind: nextKind
        });
      });
    }

    const clarificationSubmit = document.getElementById("submit-clarification-answers");
    if (clarificationSubmit) {
      clarificationSubmit.addEventListener("click", () => {
        const answers = Array.from(document.querySelectorAll("[data-clarification-answer]"))
          .sort((left, right) => Number(left.dataset.index) - Number(right.dataset.index))
          .map((element) => element.value ?? "");

        vscode.postMessage({
          command: "submitClarificationAnswers",
          answers
        });
      });
    }

    const refinementQuestionSubmit = document.getElementById("submit-refinement-questions");
    if (refinementQuestionSubmit) {
      refinementQuestionSubmit.addEventListener("click", () => {
        const pairs = Array.from(document.querySelectorAll("[data-refinement-question-answer]"))
          .sort((left, right) => Number(left.dataset.index) - Number(right.dataset.index))
          .map((element) => {
            const answer = (element.value ?? "").trim();
            const questionElement = element.parentElement?.querySelector(".clarification-question");
            const question = (questionElement?.textContent ?? "").replace(/^\\d+\\.\\s*/, "").trim();
            return question && answer ? { question, answer } : null;
          })
          .filter((value) => value !== null);

        if (pairs.length === 0) {
          return;
        }

        const prompt = [
          "Update the current refinement artifact using these human answers.",
          "Preserve the existing section structure unless the artifact itself needs a structural correction.",
          "Resolve the blocking clarification points concretely inside the spec and remove or rewrite the blocking questions if they are no longer needed.",
          "",
          "Human answers:",
          ...pairs.map((pair, index) => (index + 1) + ". Q: " + pair.question + "\\n   A: " + pair.answer)
        ].join("\\n");

        vscode.postMessage({
          command: "submitPhaseInput",
          prompt
        });
      });
    }

    const phaseInputTextarea = document.getElementById("phase-input-textarea");
    if (phaseInputTextarea instanceof HTMLTextAreaElement) {
      phaseInputTextarea.value = typeof viewState.phaseInputDraft === "string" ? viewState.phaseInputDraft : "";
      phaseInputTextarea.addEventListener("input", () => {
        vscode.setState({
          ...viewState,
          workflowFilesOpen: Boolean(viewState.workflowFilesOpen),
          phaseInputDraft: phaseInputTextarea.value
        });
      });
    }

    const submitPhaseInput = document.getElementById("submit-phase-input");
    if (submitPhaseInput && phaseInputTextarea instanceof HTMLTextAreaElement) {
      submitPhaseInput.addEventListener("click", () => {
        const prompt = phaseInputTextarea.value.trim();
        if (!prompt) {
          return;
        }

        vscode.postMessage({
          command: "submitPhaseInput",
          prompt
        });
        phaseInputTextarea.value = "";
        vscode.setState({
          ...viewState,
          workflowFilesOpen: Boolean(viewState.workflowFilesOpen),
          phaseInputDraft: ""
        });
      });
    }

    const reviewRegressionIncludeArtifact = document.getElementById("review-regression-include-artifact");
    const reviewRegressionTextarea = document.getElementById("review-regression-textarea");
    if (reviewRegressionIncludeArtifact instanceof HTMLInputElement) {
      reviewRegressionIncludeArtifact.checked = viewState.reviewRegressionIncludeArtifact !== false;
      reviewRegressionIncludeArtifact.addEventListener("input", () => {
        vscode.setState({
          ...viewState,
          workflowFilesOpen: Boolean(viewState.workflowFilesOpen),
          reviewRegressionDraft: reviewRegressionTextarea instanceof HTMLTextAreaElement ? reviewRegressionTextarea.value : "",
          reviewRegressionIncludeArtifact: reviewRegressionIncludeArtifact.checked
        });
        syncReviewRegressionModal();
      });
    }
    if (reviewRegressionTextarea instanceof HTMLTextAreaElement) {
      reviewRegressionTextarea.value = typeof viewState.reviewRegressionDraft === "string" ? viewState.reviewRegressionDraft : "";
      reviewRegressionTextarea.addEventListener("input", () => {
        vscode.setState({
          ...viewState,
          workflowFilesOpen: Boolean(viewState.workflowFilesOpen),
          reviewRegressionDraft: reviewRegressionTextarea.value,
          reviewRegressionIncludeArtifact: reviewRegressionIncludeArtifact instanceof HTMLInputElement
            ? reviewRegressionIncludeArtifact.checked
            : true
        });
        syncReviewRegressionModal();
      });
    }

    if (reviewRegressionSubmitButton instanceof HTMLButtonElement && reviewRegressionTextarea instanceof HTMLTextAreaElement) {
      reviewRegressionSubmitButton.addEventListener("click", () => {
        const prompt = reviewRegressionTextarea.value.trim();
        const includeReviewArtifactInContext = reviewRegressionIncludeArtifact instanceof HTMLInputElement
          ? reviewRegressionIncludeArtifact.checked
          : true;
        if (!includeReviewArtifactInContext && !prompt) {
          syncReviewRegressionModal();
          return;
        }

        toggleReviewRegressionModal(false);
        vscode.postMessage({
          command: "sendReviewToImplementation",
          prompt,
          includeReviewArtifactInContext
        });
        vscode.setState({
          ...viewState,
          workflowFilesOpen: Boolean(viewState.workflowFilesOpen),
          reviewRegressionDraft: "",
          reviewRegressionIncludeArtifact: includeReviewArtifactInContext
        });
        reviewRegressionTextarea.value = "";
      });
    }

    for (const element of document.querySelectorAll("[data-add-suggested-context-files]")) {
      element.addEventListener("click", () => {
        const rawPaths = element.getAttribute("data-add-suggested-context-files");
        if (!rawPaths) {
          return;
        }

        vscode.postMessage({
          command: "addSuggestedContextFiles",
          paths: JSON.parse(rawPaths)
        });
      });
    }

    const executionOverlay = document.querySelector("[data-execution-overlay]");
    if (executionOverlay) {
      const messageElement = executionOverlay.querySelector("[data-execution-message]");
      const elapsedElement = executionOverlay.querySelector("[data-execution-elapsed]");
      const dismissButton = executionOverlay.querySelector("[data-execution-overlay-dismiss]");
      const graphStage = document.querySelector(".graph-stage");
      const anchorPhaseId = executionOverlay.dataset.anchorPhaseId ?? executionOverlay.dataset.phaseId ?? "";
      const messageCatalog = JSON.parse(executionOverlay.dataset.messages ?? "[]");
      const overlayKey = buildExecutionOverlayStateKey(
        executionOverlay.dataset.usId ?? "",
        executionOverlay.dataset.phaseId ?? "",
        executionOverlay.dataset.tone ?? "",
        executionOverlay.dataset.startedAtMs ?? ""
      );
      const dismissKey = overlayKey + ":dismissed";
      const overlayTone = executionOverlay.dataset.tone ?? "";
      const providedStartedAt = Number.parseInt(executionOverlay.dataset.startedAtMs ?? "", 10);
      const showElapsed = executionOverlay.dataset.showElapsed === "true";
      const dismissible = executionOverlay.dataset.dismissible === "true";
      const positionExecutionOverlay = () => {
        if (!(graphStage instanceof HTMLElement) || !(executionOverlay instanceof HTMLElement)) {
          return;
        }

        let anchorNode = null;
        if (anchorPhaseId) {
          const escapedPhaseId = typeof CSS !== "undefined" && typeof CSS.escape === "function"
            ? CSS.escape(anchorPhaseId)
            : anchorPhaseId.replace(/"/g, '\\"');
          anchorNode = graphStage.querySelector('.phase-node[data-phase-id="' + escapedPhaseId + '"]');
        }

        if (!(anchorNode instanceof HTMLElement)) {
          anchorNode = graphStage.querySelector(".phase-node.phase-node--current");
        }

        if (!(anchorNode instanceof HTMLElement)) {
          executionOverlay.style.left = "18px";
          executionOverlay.style.top = "18px";
          return;
        }

        const stageRect = graphStage.getBoundingClientRect();
        const nodeRect = anchorNode.getBoundingClientRect();
        const overlayRect = executionOverlay.getBoundingClientRect();
        const padding = 12;
        const gap = 34;
        const preferredLeft = nodeRect.left - stageRect.left + ((nodeRect.width - overlayRect.width) / 2);
        const maxLeft = Math.max(padding, graphStage.clientWidth - overlayRect.width - padding);
        const nextLeft = Math.min(maxLeft, Math.max(padding, preferredLeft));
        const topAbove = nodeRect.top - stageRect.top - overlayRect.height - gap;
        const topBelow = nodeRect.bottom - stageRect.top + gap;
        const maxTop = Math.max(padding, graphStage.clientHeight - overlayRect.height - padding);
        const nextTop = topAbove >= padding
          ? topAbove
          : Math.min(maxTop, Math.max(padding, topBelow));

        executionOverlay.style.left = nextLeft + "px";
        executionOverlay.style.top = nextTop + "px";
      };

      if (overlayTone === "playing") {
        clearExecutionOverlayDismissed(dismissKey);
      }

      if (overlayTone !== "playing" && dismissible && isExecutionOverlayDismissed(dismissKey)) {
        executionOverlay.remove();
        if (graphStage) {
          graphStage.classList.remove("graph-stage--overlay-active");
        }
      } else {
        positionExecutionOverlay();
        window.addEventListener("resize", positionExecutionOverlay);
        const restoredState = restoreExecutionOverlayState(overlayKey, messageCatalog);
        const shuffledMessages = restoredState.messages;
        let messageIndex = restoredState.messageIndex;
        let startedAt = Number.isFinite(providedStartedAt) && providedStartedAt > 0
          ? providedStartedAt
          : restoredState.startedAt;

        if (messageElement && shuffledMessages.length > 0) {
          messageElement.textContent = shuffledMessages[messageIndex] ?? shuffledMessages[0];
        }

        if (elapsedElement && showElapsed) {
          elapsedElement.textContent = formatOverlayElapsed(Date.now() - startedAt);
        }

        if (messageElement && shuffledMessages.length > 1) {
          window.setInterval(() => {
            messageIndex = (messageIndex + 1) % shuffledMessages.length;
            if (messageIndex === 0) {
              const reshuffled = shuffleMessages(messageCatalog);
              shuffledMessages.splice(0, shuffledMessages.length, ...reshuffled);
            }
            messageElement.textContent = shuffledMessages[messageIndex];
            persistExecutionOverlayState(overlayKey, {
              startedAt,
              messageIndex,
              messages: shuffledMessages
            });
          }, 3800);
        }

        if (elapsedElement && showElapsed) {
          window.setInterval(() => {
            elapsedElement.textContent = formatOverlayElapsed(Date.now() - startedAt);
          }, 1000);
        }

        persistExecutionOverlayState(overlayKey, {
          startedAt,
          messageIndex,
          messages: shuffledMessages
        });

        const dismissOverlay = () => {
          if (dismissible) {
            persistExecutionOverlayDismissed(dismissKey);
          }
          window.removeEventListener("resize", positionExecutionOverlay);
          executionOverlay.remove();
          if (graphStage) {
            graphStage.classList.remove("graph-stage--overlay-active");
          }
        };

        if (dismissButton instanceof HTMLButtonElement) {
          dismissButton.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();
            dismissOverlay();
          });
        }

      }
    }

    function shuffleMessages(messages) {
      const pool = [...messages];
      for (let index = pool.length - 1; index > 0; index -= 1) {
        const swapIndex = Math.floor(Math.random() * (index + 1));
        const current = pool[index];
        pool[index] = pool[swapIndex];
        pool[swapIndex] = current;
      }
      return pool;
    }

    function formatOverlayElapsed(durationMs) {
      const totalSeconds = Math.max(0, Math.floor(durationMs / 1000));
      const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
      const seconds = String(totalSeconds % 60).padStart(2, "0");
      return minutes + ":" + seconds;
    }

    function buildExecutionOverlayStateKey(usId, phaseId, tone, startedAtMs) {
      return "specforge-ai:execution-overlay:" + usId + ":" + phaseId + ":" + tone + ":" + startedAtMs;
    }

    function restoreExecutionOverlayState(key, messageCatalog) {
      const fallbackMessages = shuffleMessages(messageCatalog);
      const fallbackState = {
        startedAt: Date.now(),
        messageIndex: 0,
        messages: fallbackMessages
      };

      try {
        const rawState = window.sessionStorage.getItem(key);
        if (!rawState) {
          return fallbackState;
        }

        const parsedState = JSON.parse(rawState);
        if (!Array.isArray(parsedState.messages) || parsedState.messages.length === 0) {
          return fallbackState;
        }

        return {
          startedAt: typeof parsedState.startedAt === "number" ? parsedState.startedAt : fallbackState.startedAt,
          messageIndex: typeof parsedState.messageIndex === "number"
            ? Math.max(0, Math.min(parsedState.messageIndex, parsedState.messages.length - 1))
            : 0,
          messages: parsedState.messages
        };
      } catch {
        return fallbackState;
      }
    }

    function persistExecutionOverlayState(key, state) {
      try {
        window.sessionStorage.setItem(key, JSON.stringify(state));
      } catch {
        // Best effort only. The overlay still works without persistence.
      }
    }

    function isExecutionOverlayDismissed(key) {
      try {
        return window.sessionStorage.getItem(key) === "true";
      } catch {
        return false;
      }
    }

    function persistExecutionOverlayDismissed(key) {
      try {
        window.sessionStorage.setItem(key, "true");
      } catch {
        // Best effort only.
      }
    }

    function clearExecutionOverlayDismissed(key) {
      try {
        window.sessionStorage.removeItem(key);
      } catch {
        // Best effort only.
      }
    }
  </script>
</body>
</html>`;
}

function buildPhaseGraph(
  workflow: UserStoryWorkflowDetails,
  state: WorkflowViewState,
  selectedPhaseId: string,
  playbackState: "idle" | "playing" | "paused" | "stopping",
  effectiveExecutionPhaseId: string | null
): string {
  const executionPhaseId = playbackState === "playing" ? effectiveExecutionPhaseId : null;
  const pausedExecutionPhaseId = resolvePausedExecutionPhaseId(workflow, state, playbackState);
  const displayedCurrentPhaseId = resolveDisplayedCurrentPhaseId(workflow, effectiveExecutionPhaseId, pausedExecutionPhaseId, playbackState);
  const currentPhase = workflow.phases.find((phase) => phase.phaseId === displayedCurrentPhaseId)
    ?? workflow.phases.find((phase) => phase.isCurrent)
    ?? workflow.phases[0];
  const pausedPhaseIds = new Set(state.pausedPhaseIds ?? []);
  const completedPhaseIds = new Set(state.completedPhaseIds ?? []);
  const rewindablePhaseIds = new Set(workflow.controls.rewindTargets);
  const clarificationVisible = shouldShowClarificationPhase(workflow, executionPhaseId);
  const visiblePhases = workflow.phases.filter((phase) =>
    shouldShowPhase(phase.phaseId, clarificationVisible, currentPhase.phaseId, executionPhaseId));
  const layoutPhases = visiblePhases.map((phase) => ({
    phaseId: phase.phaseId,
    expectsHumanIntervention: phase.expectsHumanIntervention
  }));
  const desktopLayout = buildPhaseLayout(layoutPhases, desktopLayoutConfig, phaseNodeWidth);
  const mobileLayout = buildPhaseLayout(layoutPhases, mobileLayoutConfig, mobilePhaseNodeWidth);
  const links = buildGraphLinks(workflow, visiblePhases, executionPhaseId, currentPhase.phaseId, completedPhaseIds, desktopLayout.positions, phaseNodeWidth);
  const mobileLinks = buildGraphLinks(workflow, visiblePhases, executionPhaseId, currentPhase.phaseId, completedPhaseIds, mobileLayout.positions, mobilePhaseNodeWidth);

  const nodes = visiblePhases.map((phase, index) => {
    const disabled = false;
    const visualTone = resolvePhaseVisualTone(
      workflow.status,
      workflow,
      playbackState,
      phase,
      disabled,
      executionPhaseId,
      pausedExecutionPhaseId,
      completedPhaseIds);
    const desktopPosition = desktopLayout.positions[phase.phaseId] ?? { left: desktopLayoutConfig.columns.left, top: desktopLayoutConfig.topOffset };
    const mobilePosition = mobileLayout.positions[phase.phaseId] ?? { left: mobileLayoutConfig.columns.left, top: mobileLayoutConfig.topOffset };
    const canPausePhase = canPauseWorkflowExecutionPhase(phase.phaseId) && phase.state === "pending";
    const pauseArmed = pausedPhaseIds.has(phase.phaseId);
    const phaseIsCurrent = phase.phaseId === displayedCurrentPhaseId;
    const phaseIsSelected = phase.phaseId === selectedPhaseId;
    const canRewindPhase = canRenderPhaseRewindAction(workflow, phase, displayedCurrentPhaseId, rewindablePhaseIds);
    const pauseButtonLabel = pauseArmed
      ? `Remove pause before ${phase.title}`
      : `Pause before ${phase.title}`;
    const rewindButtonLabel = phase.phaseId === "capture"
      ? "Reset workflow to Capture"
      : `Rewind workflow to ${phase.title}`;
    return `
    <div
      class="phase-node ${escapeHtmlAttribute(phase.phaseId)} phase-tone-${escapeHtmlAttribute(visualTone)}${phaseIsSelected ? " selected" : ""}${phaseIsCurrent ? " phase-node--current" : ""}"
      data-command="selectPhase"
      data-phase-id="${escapeHtmlAttribute(phase.phaseId)}"
      role="button"
      tabindex="0"
      style="--phase-left-desktop: ${desktopPosition.left}px; --phase-top-desktop: ${desktopPosition.top}px; --phase-left-mobile: ${mobilePosition.left}px; --phase-top-mobile: ${mobilePosition.top}px;">
      ${phaseIsCurrent ? `<span class="phase-current-rail"><span class="phase-current-rail__label">Current</span></span>` : ""}
      ${phaseIsSelected ? `<span class="phase-viewing-rail${phaseIsCurrent ? " phase-viewing-rail--current" : ""}"><span class="phase-viewing-rail__label">Viewing</span></span>` : ""}
      <div class="phase-node-content${phaseIsCurrent ? " phase-node-content--current" : ""}">
        <div class="phase-node-header">
          <div class="phase-node-header-main">
            <span class="phase-index">${index + 1}</span>
            ${phase.requiresApproval ? `<span class="phase-tag approval">approval</span>` : ""}
          </div>
          ${canRewindPhase
            ? `<button
                class="phase-pause-toggle phase-pause-toggle--rewind"
                type="button"
                data-command="rewind"
                data-phase-id="${escapeHtmlAttribute(phase.phaseId)}"
                data-phase-rewind-button
                aria-label="${escapeHtmlAttribute(rewindButtonLabel)}"
                title="${escapeHtmlAttribute(rewindButtonLabel)}">
                ${phase.phaseId === "capture" ? firstPhaseRewindIcon() : rewindIcon()}
              </button>`
            : canPausePhase
            ? `<button
                class="phase-pause-toggle${pauseArmed ? " phase-pause-toggle--armed" : ""}"
                type="button"
                data-command="togglePhasePause"
                data-phase-id="${escapeHtmlAttribute(phase.phaseId)}"
                data-phase-pause-button
                aria-label="${escapeHtmlAttribute(pauseButtonLabel)}"
                aria-pressed="${pauseArmed ? "true" : "false"}"
                title="${escapeHtmlAttribute(pauseButtonLabel)}">
                ${pauseIcon()}
              </button>`
            : ""}
        </div>
        <h3>${escapeHtml(phase.title)}</h3>
        <div class="phase-slug">${escapeHtml(phaseSecondaryLabel(phase))}</div>
        ${phase.isApproved
          ? `<div class="phase-tags">
              <span class="phase-tag">approved</span>
            </div>`
          : ""}
      </div>
    </div>
  `;
  }).join("");

  return `
    <div class="phase-graph" aria-label="Workflow graph" style="--graph-width-desktop: ${desktopLayout.width}px; --graph-height-desktop: ${desktopLayout.height}px; --graph-width-mobile: ${mobileLayout.width}px; --graph-height-mobile: ${mobileLayout.height}px;">
      <svg class="graph-links graph-links--desktop" viewBox="0 0 ${desktopLayout.width} ${desktopLayout.height}" preserveAspectRatio="none" aria-hidden="true">
        ${links}
      </svg>
      <svg class="graph-links graph-links--mobile" viewBox="0 0 ${mobileLayout.width} ${mobileLayout.height}" preserveAspectRatio="none" aria-hidden="true">
        ${mobileLinks}
      </svg>
      ${nodes}
    </div>
  `;
}

function resolveEffectiveExecutionPhaseId(
  workflow: UserStoryWorkflowDetails,
  state: WorkflowViewState,
  playbackState: "idle" | "playing" | "paused" | "stopping"
): string | null {
  if (playbackState !== "playing") {
    return null;
  }

  if (state.executionPhaseId) {
    return state.executionPhaseId;
  }

  return resolveWorkflowExecutionPhaseId(workflow.currentPhase);
}

function resolvePausedExecutionPhaseId(
  workflow: UserStoryWorkflowDetails,
  state: WorkflowViewState,
  playbackState: "idle" | "playing" | "paused" | "stopping"
): string | null {
  if (playbackState !== "paused" && playbackState !== "stopping") {
    return null;
  }

  if (state.executionPhaseId) {
    return state.executionPhaseId;
  }

  return workflow.currentPhase;
}

function resolveDisplayedCurrentPhaseId(
  workflow: UserStoryWorkflowDetails,
  effectiveExecutionPhaseId: string | null,
  pausedExecutionPhaseId: string | null,
  playbackState: "idle" | "playing" | "paused" | "stopping"
): string {
  if (playbackState === "playing" && effectiveExecutionPhaseId) {
    return effectiveExecutionPhaseId;
  }

  if ((playbackState === "paused" || playbackState === "stopping") && pausedExecutionPhaseId) {
    return pausedExecutionPhaseId;
  }

  return workflow.currentPhase;
}

function buildGraphLinks(
  workflow: UserStoryWorkflowDetails,
  visiblePhases: readonly WorkflowPhaseDetails[],
  executingTargetPhaseId: string | null,
  currentPhaseId: string,
  completedPhaseIds: ReadonlySet<string>,
  positions: Record<string, PhasePosition>,
  nodeWidth: number
): string {
  const edges: Array<{ fromPhaseId: string; toPhaseId: string; className: string }> = [];

  for (let index = 0; index < visiblePhases.length - 1; index++) {
    const fromPhase = visiblePhases[index];
    const toPhase = visiblePhases[index + 1];
    edges.push({
      fromPhaseId: fromPhase.phaseId,
      toPhaseId: toPhase.phaseId,
      className: linkClass(toPhase, executingTargetPhaseId, currentPhaseId, completedPhaseIds)
    });
  }

  if (visiblePhases.some((phase) => phase.phaseId === "implementation")
    && visiblePhases.some((phase) => phase.phaseId === "review")) {
    edges.push({
      fromPhaseId: "review",
      toPhaseId: "implementation",
      className: reverseLinkClass(workflow, completedPhaseIds)
    });
  }

  return edges
    .map((edge) => `<path class="${edge.className}" d="${graphPath(edge.fromPhaseId, edge.toPhaseId, positions, nodeWidth)}"></path>`)
    .join("");
}

function reverseLinkClass(
  workflow: UserStoryWorkflowDetails,
  completedPhaseIds: ReadonlySet<string>
): string {
  const reviewRegressionOpen = workflow.currentPhase === "review"
    && (workflow.controls.blockingReason === "review_failed"
      || workflow.controls.blockingReason === "review_result_missing"
      || workflow.controls.blockingReason === "review_missing_artifact");

  if (reviewRegressionOpen) {
    return "reverse-active";
  }

  const hasRegressionHistory = (workflow.phaseIterations ?? []).some((iteration) =>
    (iteration.phaseId === "implementation" || iteration.phaseId === "review") && iteration.attempt > 1);

  if (hasRegressionHistory && (completedPhaseIds.has("review") || workflow.currentPhase === "release-approval" || workflow.currentPhase === "pr-preparation")) {
    return "reverse-completed";
  }

  return "reverse";
}

function shouldShowClarificationPhase(
  _workflow: UserStoryWorkflowDetails,
  _executionPhaseId: string | null
): boolean {
  return true;
}

function linkClass(
  targetPhase: WorkflowPhaseDetails,
  executingTargetPhaseId: string | null,
  currentPhaseId: string,
  completedPhaseIds: ReadonlySet<string>
): string {
  if (executingTargetPhaseId === targetPhase.phaseId) {
    return "executing";
  }

  if (completedPhaseIds.has(targetPhase.phaseId) || targetPhase.phaseId === currentPhaseId || targetPhase.state === "completed") {
    return "completed";
  }

  return "pending";
}

function shouldShowPhase(
  phaseId: string,
  clarificationVisible: boolean,
  currentPhaseId: string,
  executionPhaseId: string | null
): boolean {
  return phaseId !== "clarification"
    || clarificationVisible
    || currentPhaseId === "clarification"
    || executionPhaseId === "clarification";
}

function canRenderPhaseRewindAction(
  workflow: UserStoryWorkflowDetails,
  phase: WorkflowPhaseDetails,
  displayedCurrentPhaseId: string,
  rewindablePhaseIds: ReadonlySet<string>
): boolean {
  if (phase.phaseId === displayedCurrentPhaseId) {
    return false;
  }

  const currentPhaseOrder = workflow.phases.find((candidate) => candidate.phaseId === displayedCurrentPhaseId)?.order ?? Number.MAX_SAFE_INTEGER;
  if (phase.order >= currentPhaseOrder) {
    return false;
  }

  if (phase.phaseId === "capture") {
    return workflow.controls.canRestartFromSource;
  }

  return rewindablePhaseIds.has(phase.phaseId);
}

function graphPath(
  fromPhaseId: string,
  toPhaseId: string,
  positions: Record<string, PhasePosition>,
  nodeWidth: number
): string {
  const fromPosition = positions[fromPhaseId];
  const toPosition = positions[toPhaseId];
  if (!fromPosition || !toPosition) {
    return "";
  }

  const { fromAnchor, toAnchor } = resolveAnchors(fromPosition, toPosition);
  const from = getAnchorPoint(fromPosition, fromAnchor, nodeWidth);
  const to = getAnchorPoint(toPosition, toAnchor, nodeWidth);
  const sameColumn = fromPosition.left === toPosition.left;
  if (sameColumn) {
    return buildSameColumnGraphPath(fromPosition, toPosition, fromAnchor, toAnchor, from, to, nodeWidth);
  }

  return buildCrossColumnGraphPath(fromPosition, toPosition, fromAnchor, toAnchor, from, to, nodeWidth);
}

function buildSameColumnGraphPath(
  fromPosition: PhasePosition,
  toPosition: PhasePosition,
  fromAnchor: GraphAnchor,
  toAnchor: GraphAnchor,
  from: { x: number; y: number },
  to: { x: number; y: number },
  nodeWidth: number
): string {
  const verticalGap = Math.abs(to.y - from.y);
  const laneOffset = Math.max(34, nodeWidth * 0.16);
  const exitPull = projectAwayFromNode(fromPosition, fromAnchor, from, laneOffset);
  const entryPull = projectAwayFromNode(toPosition, toAnchor, to, laneOffset);

  if (to.y > from.y) {
    const verticalSpread = Math.max(36, verticalGap * 0.32);
    return `M ${from.x} ${from.y} C ${from.x} ${from.y + verticalSpread}, ${to.x} ${to.y - verticalSpread}, ${to.x} ${to.y}`;
  }

  const laneX = fromAnchor === "exit-left" || toAnchor === "entry-left"
    ? fromPosition.left - laneOffset
    : fromPosition.left + nodeWidth + laneOffset;
  const verticalSpread = Math.max(36, verticalGap * 0.28);
  return `M ${from.x} ${from.y} C ${exitPull.x} ${from.y}, ${laneX} ${from.y - verticalSpread * 0.1}, ${laneX} ${from.y - verticalSpread} S ${laneX} ${to.y + verticalSpread}, ${entryPull.x} ${to.y} S ${to.x} ${to.y}, ${to.x} ${to.y}`;
}

function buildCrossColumnGraphPath(
  fromPosition: PhasePosition,
  toPosition: PhasePosition,
  fromAnchor: GraphAnchor,
  toAnchor: GraphAnchor,
  from: { x: number; y: number },
  to: { x: number; y: number },
  nodeWidth: number
): string {
  const channelOffset = Math.max(30, nodeWidth * 0.14);
  const exitPull = projectAwayFromNode(fromPosition, fromAnchor, from, channelOffset);
  const entryPull = projectAwayFromNode(toPosition, toAnchor, to, channelOffset);
  const laneX = fromAnchor === "exit-bottom-left" || toAnchor === "entry-left"
    ? Math.min(exitPull.x, entryPull.x) - Math.max(24, nodeWidth * 0.08)
    : Math.max(exitPull.x, entryPull.x) + Math.max(24, nodeWidth * 0.08);
  const verticalBias = Math.max(22, Math.abs(to.y - from.y) * 0.16);

  return `M ${from.x} ${from.y} C ${exitPull.x} ${from.y + verticalBias * 0.45}, ${laneX} ${from.y + verticalBias}, ${laneX} ${from.y + verticalBias * 1.1} S ${laneX} ${to.y - verticalBias}, ${entryPull.x} ${to.y} S ${to.x} ${to.y}, ${to.x} ${to.y}`;
}

function resolveAnchors(from: PhasePosition, to: PhasePosition): { fromAnchor: GraphAnchor; toAnchor: GraphAnchor } {
  const deltaX = to.left - from.left;
  const deltaY = to.top - from.top;

  if (deltaX === 0) {
    if (deltaY >= 0) {
      return { fromAnchor: "exit-bottom-mid", toAnchor: "entry-top" };
    }

    return { fromAnchor: "exit-right", toAnchor: "entry-right" };
  }

  if (deltaX > 0) {
    return { fromAnchor: "exit-right", toAnchor: "entry-left" };
  }

  return { fromAnchor: "exit-left", toAnchor: "entry-right" };
}

function getAnchorPoint(position: PhasePosition, anchor: GraphAnchor, nodeWidth: number): { x: number; y: number } {
  switch (anchor) {
    case "entry-top":
      return { x: position.left + nodeWidth * 0.24, y: position.top };
    case "entry-left":
      return { x: position.left, y: position.top + phaseNodeHeight * 0.36 };
    case "entry-right":
      return { x: position.left + nodeWidth, y: position.top + phaseNodeHeight * 0.34 };
    case "exit-right":
      return { x: position.left + nodeWidth, y: position.top + phaseNodeHeight * 0.78 };
    case "exit-left":
      return { x: position.left, y: position.top + phaseNodeHeight * 0.78 };
    case "exit-bottom-left":
      return { x: position.left + nodeWidth * 0.1, y: position.top + phaseNodeHeight * 0.96 };
    case "exit-bottom-mid":
      return { x: position.left + nodeWidth * 0.62, y: position.top + phaseNodeHeight };
    case "exit-bottom-right":
      return { x: position.left + nodeWidth * 0.9, y: position.top + phaseNodeHeight * 0.96 };
  }
}

function projectAwayFromNode(
  position: PhasePosition,
  anchor: GraphAnchor,
  point: { x: number; y: number },
  offset: number
): { x: number; y: number } {
  switch (anchor) {
    case "entry-top":
      return { x: point.x, y: position.top - offset };
    case "entry-left":
      return { x: position.left - offset, y: point.y };
    case "entry-right":
      return { x: point.x + offset, y: point.y };
    case "exit-right":
      return { x: point.x + offset, y: point.y };
    case "exit-left":
      return { x: position.left - offset, y: point.y };
    case "exit-bottom-left":
    case "exit-bottom-mid":
    case "exit-bottom-right":
      return { x: point.x, y: position.top + phaseNodeHeight + offset };
  }
}

function extractArtifactQuestionBlock(markdown: string | null | undefined): ArtifactQuestionBlock | null {
  if (!markdown) {
    return null;
  }

  const normalized = markdown.replace(/\r\n/g, "\n");
  const state = readLooseMarkdownSection(normalized, ["State"]);
  const decision = readLooseMarkdownSection(normalized, ["Decision"]);
  const reason = readLooseMarkdownSection(normalized, ["Reason"]);
  const questionsSection = readLooseMarkdownSection(normalized, ["Questions"]);
  const questions = extractLooseQuestionLines(questionsSection);

  if (!state && !decision && !reason && questions.length === 0) {
    return null;
  }

  return {
    state,
    decision,
    reason,
    questions
  };
}

function readLooseMarkdownSection(markdown: string, sectionNames: readonly string[]): string | null {
  const lines = markdown.split("\n");
  const normalizedNames = sectionNames.map((name) => name.trim().toLowerCase());
  const startIndex = lines.findIndex((line) => {
    const trimmed = normalizeLooseSectionHeading(line);
    return trimmed !== null && normalizedNames.includes(trimmed);
  });
  if (startIndex < 0) {
    return null;
  }

  const content: string[] = [];
  for (let index = startIndex + 1; index < lines.length; index += 1) {
    const line = lines[index];
    const trimmed = line.trim();
    if (normalizeLooseSectionHeading(line) !== null) {
      break;
    }

    if (trimmed.length === 0) {
      if (content.length > 0) {
        content.push("");
      }
      continue;
    }

    content.push(trimmed);
  }

  return content.join("\n").trim() || null;
}

function normalizeLooseSectionHeading(line: string): string | null {
  const trimmed = line.trim();
  const match = trimmed.match(/^(?:##+\s*)?([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ\s-]+):?$/);
  if (!match) {
    return null;
  }

  return match[1].trim().toLowerCase();
}

function extractLooseQuestionLines(section: string | null): string[] {
  if (!section) {
    return [];
  }

  return section
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => line.replace(/^(?:[-*]\s+|\d+\.\s+)/, "").trim())
    .filter((line) => line.length > 0);
}
