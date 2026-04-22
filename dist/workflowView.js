"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildWorkflowHtml = buildWorkflowHtml;
exports.escapeHtml = escapeHtml;
const capturePhaseView_1 = require("./workflow-view/capturePhaseView");
const clarificationPhaseView_1 = require("./workflow-view/clarificationPhaseView");
const implementationPhaseView_1 = require("./workflow-view/implementationPhaseView");
const prPreparationPhaseView_1 = require("./workflow-view/prPreparationPhaseView");
const refinementPhaseView_1 = require("./workflow-view/refinementPhaseView");
const releaseApprovalPhaseView_1 = require("./workflow-view/releaseApprovalPhaseView");
const reviewPhaseView_1 = require("./workflow-view/reviewPhaseView");
const technicalDesignPhaseView_1 = require("./workflow-view/technicalDesignPhaseView");
const phaseNodeWidth = 220;
const phaseNodeHeight = 152;
const mobilePhaseNodeWidth = 188;
const phaseSequence = [
    { phaseId: "capture", expectsHumanIntervention: false },
    { phaseId: "clarification", expectsHumanIntervention: true },
    { phaseId: "refinement", expectsHumanIntervention: true },
    { phaseId: "technical-design", expectsHumanIntervention: false },
    { phaseId: "implementation", expectsHumanIntervention: false },
    { phaseId: "review", expectsHumanIntervention: false },
    { phaseId: "release-approval", expectsHumanIntervention: true },
    { phaseId: "pr-preparation", expectsHumanIntervention: false }
];
const desktopLayoutConfig = {
    columns: { left: 38, right: 400 },
    topOffset: 40,
    sameColumnGap: 32,
    overlapRatio: 0.30,
    rightPadding: 88,
    bottomPadding: 96
};
const mobileLayoutConfig = {
    columns: { left: 16, right: 192 },
    topOffset: 16,
    sameColumnGap: 26,
    overlapRatio: 0.30,
    rightPadding: 88,
    bottomPadding: 96
};
const defaultDesktopLayout = buildPhaseLayout(phaseSequence, desktopLayoutConfig, phaseNodeWidth);
const defaultMobileLayout = buildPhaseLayout(phaseSequence, mobileLayoutConfig, mobilePhaseNodeWidth);
const desktopGraphHeight = defaultDesktopLayout.height;
const mobileGraphHeight = defaultMobileLayout.height;
const desktopGraphWidth = defaultDesktopLayout.width;
const mobileGraphWidth = defaultMobileLayout.width;
function computeGraphHeight(positions, nodeHeight, bottomPadding) {
    const maxTop = Math.max(...Object.values(positions).map((position) => position.top));
    return maxTop + nodeHeight + bottomPadding;
}
function computeGraphWidth(positions, nodeWidth, rightPadding) {
    const maxLeft = Math.max(...Object.values(positions).map((position) => position.left));
    return maxLeft + nodeWidth + rightPadding;
}
function expectsHumanIntervention(phaseId, requiresApproval) {
    return phaseId === "clarification" || requiresApproval;
}
function resolvePhaseColumn(expectsHumanIntervention) {
    return expectsHumanIntervention ? "right" : "left";
}
function buildPhaseLayout(phases, config, nodeWidth) {
    const positions = {};
    let previousPhase = null;
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
function formatDuration(durationMs) {
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
function formatMetricNumber(value) {
    return new Intl.NumberFormat("en-US").format(value);
}
function formatTokensPerSecond(outputTokens, durationMs) {
    if (durationMs <= 0) {
        return "n/a";
    }
    return `${(outputTokens / (durationMs / 1_000)).toFixed(1)} tok/s`;
}
function formatUtcTimestamp(value) {
    if (!value) {
        return "n/a";
    }
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
        return value;
    }
    return parsed.toISOString().replace(".000Z", "Z");
}
function sumTokenUsage(usages) {
    return usages.reduce((aggregate, usage) => ({
        inputTokens: aggregate.inputTokens + usage.inputTokens,
        outputTokens: aggregate.outputTokens + usage.outputTokens,
        totalTokens: aggregate.totalTokens + usage.totalTokens
    }), { inputTokens: 0, outputTokens: 0, totalTokens: 0 });
}
function fileNameFromPath(filePath) {
    const normalized = filePath.replace(/\\/g, "/");
    const segments = normalized.split("/");
    return segments.at(-1) ?? filePath;
}
function renderTokenSummaryRow(label, value) {
    return `
    <div class="token-summary__row">
      <span class="token-summary__label">${escapeHtml(label)}</span>
      <span class="token-summary__value">${escapeHtml(value)}</span>
    </div>
  `;
}
function buildPhaseIterations(workflow, phaseId) {
    const seen = new Set();
    const iterations = [];
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
            timestampUtc: event.timestampUtc,
            code: event.code,
            actor: event.actor,
            summary: event.summary,
            artifactPath,
            usage: event.usage,
            durationMs: event.durationMs
        });
    }
    return iterations;
}
function buildPhaseSpecificSections(workflow, selectedPhase, state, artifactPreviewHtml, artifactQuestionBlock, refinementApprovalQuestions, unresolvedApprovalQuestionCount) {
    switch (selectedPhase.phaseId) {
        case "capture":
            return (0, capturePhaseView_1.buildCapturePhaseSections)({
                workflow,
                selectedPhase,
                selectedArtifactContent: state.selectedArtifactContent,
                artifactPreviewHtml,
                buildArtifactPreviewSection
            });
        case "clarification":
            return (0, clarificationPhaseView_1.buildClarificationPhaseSections)({
                workflow,
                selectedPhase,
                state,
                heroTokenClass,
                escapeHtml,
                escapeHtmlAttribute
            });
        case "refinement":
            return (0, refinementPhaseView_1.buildRefinementPhaseSections)({
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
            return (0, technicalDesignPhaseView_1.buildTechnicalDesignPhaseSections)();
        case "implementation":
            return (0, implementationPhaseView_1.buildImplementationPhaseSections)();
        case "review":
            return (0, reviewPhaseView_1.buildReviewPhaseSections)();
        case "release-approval":
            return (0, releaseApprovalPhaseView_1.buildReleaseApprovalPhaseSections)();
        case "pr-preparation":
            return (0, prPreparationPhaseView_1.buildPrPreparationPhaseSections)();
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
];
const phaseExecutionMessages = {
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
function buildExecutionOverlay(workflow, state, playbackState) {
    if (playbackState === "idle") {
        return "";
    }
    const currentPhase = workflow.phases.find((phase) => phase.isCurrent) ?? workflow.phases[0];
    const effectiveExecutionPhaseId = resolveEffectiveExecutionPhaseId(workflow, state, playbackState);
    const overlayPhase = playbackState === "playing" && effectiveExecutionPhaseId
        ? workflow.phases.find((phase) => phase.phaseId === effectiveExecutionPhaseId) ?? currentPhase
        : currentPhase;
    const overlay = playbackState === "playing"
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
                title: `Paused after ${currentPhase.title}`,
                phaseId: currentPhase.phaseId,
                tone: "paused",
                startedAtMs: state.playbackStartedAtMs ?? null,
                showElapsed: false,
                messages: [
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
    return `
    <div
      class="execution-overlay execution-overlay--${escapeHtmlAttribute(overlay.tone)}"
      data-execution-overlay
      data-us-id="${escapeHtmlAttribute(overlay.usId)}"
      data-phase-id="${escapeHtmlAttribute(overlay.phaseId)}"
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
    </div>
  `;
}
function heroTokenClass(value) {
    const tone = heroTokenTone(value);
    return tone ? ` token--${tone}` : "";
}
function heroTokenTone(value) {
    switch (value) {
        case "waiting-user":
        case "needs-user-input":
        case "needs_clarification":
        case "runner:paused":
            return "attention";
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
function resolvePhaseVisualTone(workflowStatus, playbackState, phase, disabled, executionPhaseId, completedPhaseIds) {
    if (disabled) {
        return "disabled";
    }
    if (completedPhaseIds.has(phase.phaseId)) {
        return "completed";
    }
    if (playbackState === "playing" && executionPhaseId === phase.phaseId) {
        return "active";
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
function phaseToneLabel(tone, fallbackState) {
    if (tone === "active") {
        return fallbackState === "current" ? "executing" : fallbackState;
    }
    if (tone === "disabled" || tone === "pending" || tone === "completed" || tone === "blocked") {
        return tone;
    }
    return tone;
}
function phaseSecondaryLabel(phase) {
    switch (phase.phaseId) {
        case "capture":
        case "clarification":
            return "US";
        case "refinement":
            return "spec";
        default:
            return phase.phaseId;
    }
}
function buildWorkflowHeroTitle(workflow) {
    const normalizedTitle = workflow.title.trim();
    if (normalizedTitle.startsWith(`${workflow.usId} ·`) || normalizedTitle === workflow.usId) {
        return normalizedTitle;
    }
    return `${workflow.usId} · ${normalizedTitle}`;
}
function shouldRenderApprovalBranchEditor(workflow, selectedPhase) {
    return selectedPhase.phaseId === "refinement"
        && selectedPhase.isCurrent
        && workflow.controls.canApprove;
}
function buildArtifactPreviewSection(artifactPath, artifactPreviewHtml, artifactContent, options) {
    const rawArtifact = options?.rawArtifact ?? false;
    const footerNote = options?.footerNote?.trim() ?? "";
    return `
    <div class="detail-actions detail-actions--artifact">
      <div class="artifact-view-label">
        <span class="badge${rawArtifact ? " badge--attention" : ""}">${rawArtifact ? "Raw Artifact" : "Preview"}</span>
      </div>
      <button class="workflow-action-button workflow-action-button--document" data-command="openArtifact" data-path="${escapeHtmlAttribute(artifactPath)}">Open Artifact</button>
    </div>
    ${artifactPreviewHtml
        ? `<div class="markdown-preview${rawArtifact ? " markdown-preview--raw-artifact" : ""}">${artifactPreviewHtml}</div>`
        : `<pre class="artifact-preview${rawArtifact ? " artifact-preview--raw-artifact" : ""}">${escapeHtml(artifactContent)}</pre>`}
    ${footerNote ? `<p class="muted">${escapeHtml(footerNote)}</p>` : ""}
  `;
}
function buildWorkflowHtml(workflow, state, playbackState) {
    const selectedPhase = workflow.phases.find((phase) => phase.phaseId === state.selectedPhaseId) ?? workflow.phases[0];
    const isClarificationDetail = selectedPhase.phaseId === "clarification" && workflow.clarification !== null;
    const settingsWarning = !state.settingsConfigured && state.settingsMessage
        ? `
      <section class="settings-warning panel">
        <div class="settings-warning__icon" aria-hidden="true">⚠</div>
        <div class="settings-warning__content">
          <p class="eyebrow warning">Configuration Required</p>
          <h2>SpecForge.AI settings are incomplete</h2>
          <p class="panel-copy warning-copy">${escapeHtml(state.settingsMessage)}</p>
        </div>
        <button class="workflow-action-button workflow-action-button--progress" data-command="openSettings">Configure Settings</button>
      </section>
    `
        : "";
    const effectiveExecutionPhaseId = resolveEffectiveExecutionPhaseId(workflow, state, playbackState);
    const phaseGraph = buildPhaseGraph(workflow, state, selectedPhase.phaseId, playbackState, effectiveExecutionPhaseId);
    const executionOverlay = buildExecutionOverlay(workflow, state, playbackState);
    const displayedPhaseId = playbackState === "playing" && effectiveExecutionPhaseId
        ? effectiveExecutionPhaseId
        : workflow.currentPhase;
    const shouldPulsePlay = playbackState === "idle" && workflow.controls.canContinue;
    const playDisabled = playbackState === "playing"
        || !state.settingsConfigured
        || (playbackState === "idle" && !workflow.controls.canContinue);
    const isMarkdownArtifact = Boolean(selectedPhase.artifactPath?.toLowerCase().endsWith(".md"));
    const artifactPreviewHtml = isMarkdownArtifact
        ? renderMarkdownToHtml(state.selectedArtifactContent ?? "Artifact content unavailable.")
        : null;
    const artifactQuestionBlock = extractArtifactQuestionBlock(state.selectedArtifactContent);
    const refinementApprovalQuestions = selectedPhase.phaseId === "refinement"
        ? extractMarkdownApprovalItems(state.selectedArtifactContent)
        : [];
    const unresolvedApprovalQuestionCount = refinementApprovalQuestions.filter((item) => !item.resolved).length;
    const phaseIterations = buildPhaseIterations(workflow, selectedPhase.phaseId);
    const selectedIteration = phaseIterations.find((iteration) => iteration.artifactPath === state.selectedIterationArtifactPath)
        ?? phaseIterations[0]
        ?? null;
    const selectedPhaseEvents = workflow.events.filter((event) => event.phase === selectedPhase.phaseId);
    const selectedPhaseMetricEvents = selectedPhaseEvents.filter((event) => event.usage || event.durationMs !== null);
    const selectedPhaseUsageAggregate = sumTokenUsage(selectedPhaseMetricEvents
        .map((event) => event.usage)
        .filter((usage) => Boolean(usage)));
    const selectedPhaseDurationAggregate = selectedPhaseMetricEvents.reduce((aggregate, event) => aggregate + (event.durationMs ?? 0), 0);
    const selectedPhaseIterationCount = selectedPhaseMetricEvents.length;
    const phaseSpecificSections = buildPhaseSpecificSections(workflow, selectedPhase, state, artifactPreviewHtml, artifactQuestionBlock, refinementApprovalQuestions, unresolvedApprovalQuestionCount);
    const detailRejectCommand = selectedPhase.isCurrent && workflow.controls.regressionTargets.length > 0
        ? { command: "regress", phaseId: workflow.controls.regressionTargets[0] }
        : selectedPhase.isCurrent && workflow.controls.canRestartFromSource
            ? { command: "restart", phaseId: undefined }
            : null;
    const selectedPhaseStateClass = heroTokenClass(selectedPhase.state);
    const detailActions = selectedPhase.isCurrent && (workflow.controls.canApprove || detailRejectCommand)
        ? `
      <div class="detail-actions detail-actions--phase-header">
        ${workflow.controls.canApprove
            ? `<button class="workflow-action-button workflow-action-button--approve" data-command="approve" data-approve-button data-pending-approval-count="${unresolvedApprovalQuestionCount}"${shouldRenderApprovalBranchEditor(workflow, selectedPhase) && Boolean(state.requireExplicitApprovalBranchAcceptance) || unresolvedApprovalQuestionCount > 0 ? " disabled" : ""}>Approve</button>`
            : ""}
        ${detailRejectCommand ? `<button class="workflow-action-button workflow-action-button--danger" data-command="${detailRejectCommand.command}"${detailRejectCommand.phaseId ? ` data-phase-id="${escapeHtmlAttribute(detailRejectCommand.phaseId)}"` : ""}>Reject</button>` : ""}
      </div>
    `
        : "";
    const durationMetric = selectedPhaseDurationAggregate > 0
        ? `
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
          <span class="phase-duration-pill__value">${escapeHtml(formatDuration(selectedPhaseDurationAggregate))}</span>
        </div>
      </div>
    `
        : "";
    const tokenSummary = selectedPhaseMetricEvents.some((event) => event.usage)
        ? `
      <div class="token-summary">
        <div class="token-summary__header">Tokens</div>
        <div class="token-summary__rows">
          ${renderTokenSummaryRow("Input / Output", `${formatMetricNumber(selectedPhaseUsageAggregate.inputTokens)} / ${formatMetricNumber(selectedPhaseUsageAggregate.outputTokens)}`)}
          ${renderTokenSummaryRow("Total", formatMetricNumber(selectedPhaseUsageAggregate.totalTokens))}
          ${selectedPhaseDurationAggregate > 0
            ? renderTokenSummaryRow("Response Speed", formatTokensPerSecond(selectedPhaseUsageAggregate.outputTokens, selectedPhaseDurationAggregate))
            : ""}
          ${selectedPhaseIterationCount > 0 ? renderTokenSummaryRow("Iterations", String(selectedPhaseIterationCount)) : ""}
        </div>
      </div>
    `
        : "";
    const selectedPhaseMetrics = durationMetric || tokenSummary
        ? `${durationMetric}${tokenSummary}`
        : "";
    const iterationRail = phaseIterations.length > 1
        ? `
      <section class="detail-card detail-card--phase-iterations">
        <h3>Phase Iterations</h3>
        <p class="panel-copy">Newest first. Select any prior iteration to inspect its readonly artifact, metrics, and recorded question and answer state.</p>
        <div class="iteration-rail">
          ${phaseIterations.map((iteration, index) => `
            <button
              type="button"
              class="iteration-rail__item${selectedIteration?.artifactPath === iteration.artifactPath ? " iteration-rail__item--selected" : ""}"
              data-command="selectIteration"
              data-path="${escapeHtmlAttribute(iteration.artifactPath)}">
              <span class="iteration-rail__stem" aria-hidden="true"></span>
              <span class="iteration-rail__body">
                <span class="iteration-rail__title">#${index + 1} · ${escapeHtml(formatUtcTimestamp(iteration.timestampUtc))}</span>
                <span class="iteration-rail__meta">
                  ${escapeHtml(iteration.code)}
                  ${iteration.actor ? ` · ${escapeHtml(iteration.actor)}` : ""}
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
          <span class="badge">${escapeHtml(selectedIteration.code)}</span>
          <span class="badge">${escapeHtml(formatUtcTimestamp(selectedIteration.timestampUtc))}</span>
          ${selectedIteration.actor ? `<span class="badge">${escapeHtml(selectedIteration.actor)}</span>` : ""}
          ${selectedIteration.usage ? `<span class="badge">in/out ${escapeHtml(`${formatMetricNumber(selectedIteration.usage.inputTokens)}/${formatMetricNumber(selectedIteration.usage.outputTokens)}`)}</span>` : ""}
          ${selectedIteration.usage ? `<span class="badge">total ${escapeHtml(formatMetricNumber(selectedIteration.usage.totalTokens))}</span>` : ""}
          ${selectedIteration.durationMs !== null ? `<span class="badge">${escapeHtml(formatDuration(selectedIteration.durationMs))}</span>` : ""}
          ${selectedIteration.usage && selectedIteration.durationMs !== null ? `<span class="badge">${escapeHtml(formatTokensPerSecond(selectedIteration.usage.outputTokens, selectedIteration.durationMs))}</span>` : ""}
        </div>
        ${selectedIteration.summary ? `<p class="panel-copy">${escapeHtml(selectedIteration.summary)}</p>` : ""}
        <div class="detail-actions">
          <button class="workflow-action-button workflow-action-button--document" data-command="openArtifact" data-path="${escapeHtmlAttribute(selectedIteration.artifactPath)}">Open This Iteration</button>
        </div>
      </section>
    `
        : "";
    const artifactSection = selectedPhase.artifactPath
        ? isClarificationDetail
            ? buildArtifactPreviewSection(selectedIteration?.artifactPath ?? selectedPhase.artifactPath, artifactPreviewHtml, state.selectedArtifactContent ?? "Artifact content unavailable.", {
                rawArtifact: true,
                footerNote: "The raw artifact stays visible here to preserve model context beyond the structured clarification questions below."
            })
            : buildArtifactPreviewSection(selectedIteration?.artifactPath ?? selectedPhase.artifactPath, artifactPreviewHtml, state.selectedArtifactContent ?? "Artifact content unavailable.")
        : "<p class=\"muted\">No artifact is persisted for this phase.</p>";
    const promptButtons = [
        selectedPhase.executePromptPath
            ? `<button class="workflow-action-button workflow-action-button--document" data-command="openPrompt" data-path="${escapeHtmlAttribute(selectedPhase.executePromptPath)}">Open Execute Prompt</button>`
            : "",
        selectedPhase.approvePromptPath
            ? `<button class="workflow-action-button workflow-action-button--document" data-command="openPrompt" data-path="${escapeHtmlAttribute(selectedPhase.approvePromptPath)}">Open Approve Prompt</button>`
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
    <button class="icon-button icon-button--primary${shouldPulsePlay ? " icon-button--pulse" : ""}" data-command="play" aria-label="Play workflow"${playDisabled ? " disabled" : ""}>
      ${playIcon()}
    </button>
    <button class="icon-button" data-command="pause" aria-label="Pause workflow"${playbackState !== "playing" ? " disabled" : ""}>
      ${pauseIcon()}
    </button>
    <button class="icon-button icon-button--danger" data-command="stop" aria-label="Stop workflow"${playbackState === "playing" || playbackState === "stopping" ? "" : " disabled"}>
      ${stopIcon()}
    </button>
  `;
    const debugResetButton = state.debugMode
        ? `<button class="workflow-action-button workflow-action-button--danger" type="button" data-command="debugResetToCapture">Reset to Capture</button>`
        : "";
    const auditRows = workflow.events.length > 0
        ? workflow.events.map((event) => `
      <div class="audit-row">
        <div class="audit-head">
          <span>${escapeHtml(event.timestampUtc)} · ${escapeHtml(event.code)}</span>
          <div class="audit-head__meta">
            ${event.actor ? `<span class="badge">${escapeHtml(event.actor)}</span>` : ""}
            ${event.phase ? `<span class="badge">${escapeHtml(event.phase)}</span>` : ""}
          </div>
        </div>
        <div class="audit-body">${escapeHtml(event.summary ?? "")}</div>
        ${event.usage || event.durationMs !== null
            ? `<div class="audit-metrics">
              ${event.usage ? `<span class="badge">in/out ${escapeHtml(`${formatMetricNumber(event.usage.inputTokens)}/${formatMetricNumber(event.usage.outputTokens)}`)}</span>` : ""}
              ${event.usage ? `<span class="badge">total ${escapeHtml(formatMetricNumber(event.usage.totalTokens))}</span>` : ""}
              ${event.durationMs !== null ? `<span class="badge">${escapeHtml(formatDuration(event.durationMs))}</span>` : ""}
              ${event.usage && event.durationMs !== null ? `<span class="badge">${escapeHtml(formatTokensPerSecond(event.usage.outputTokens, event.durationMs))}</span>` : ""}
            </div>`
            : ""}
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
    .shell.shell--interaction-locked {
      pointer-events: none;
      user-select: none;
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
      inset: auto;
      width: 0;
      height: 0;
      background: none;
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
      font-size: 0.68rem;
      letter-spacing: 0.08em;
      color: rgba(166, 255, 206, 0.78);
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
      font-size: 0.64rem;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: rgba(214, 236, 252, 0.78);
      padding-right: 2px;
    }
    .phase-duration-pill__value {
      position: absolute;
      right: 8px;
      bottom: 2px;
      left: 94px;
      font-size: clamp(1.38rem, 2.9vw, 2.3rem);
      font-weight: 800;
      line-height: 1.05;
      color: #f7fbff;
      text-shadow: 0 1px 2px rgba(8, 15, 22, 0.32);
      letter-spacing: -0.03em;
      text-align: right;
    }
    .token-summary {
      min-width: 0;
      padding: 12px 14px;
      border-radius: 16px;
      border: 1px solid rgba(255, 255, 255, 0.08);
      background: linear-gradient(180deg, rgba(34, 39, 47, 0.92), rgba(20, 24, 30, 0.98));
      box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.03);
    }
    .token-summary__header {
      margin-bottom: 10px;
      font-size: 0.64rem;
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
      font-size: 0.76rem;
      color: rgba(226, 232, 240, 0.7);
    }
    .token-summary__value {
      font-size: 0.8rem;
      font-weight: 700;
      color: #f4f7fb;
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
    .badge.token--attention, .badge.badge--attention {
      background: var(--attention-egg-soft);
      color: #ffe17b;
      border-color: var(--attention-egg-border);
      box-shadow: 0 0 0 1px rgba(255, 213, 90, 0.08);
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
    .icon-button--primary:hover {
      border-color: var(--action-progress-border-hover);
      background: var(--action-progress-bg-hover);
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
      min-width: ${desktopGraphWidth}px;
      min-height: ${desktopGraphHeight}px;
      z-index: 2;
    }
    .graph-stage.graph-stage--overlay-active .phase-graph {
      filter: blur(2px) saturate(0.85) brightness(0.78);
      transform: scale(0.997);
      pointer-events: none;
    }
    .execution-overlay {
      position: absolute;
      top: 18px;
      right: 18px;
      z-index: 12;
      display: flex;
      align-items: center;
      gap: 14px;
      width: min(430px, calc(100% - 24px));
      min-height: 142px;
      padding: 14px 16px;
      border-radius: 18px;
      border: 1px solid rgba(92, 181, 255, 0.34);
      background:
        linear-gradient(180deg, rgba(18, 37, 56, 0.96), rgba(10, 18, 28, 0.98)),
        rgba(10, 14, 20, 0.96);
      box-shadow: 0 18px 34px rgba(0, 0, 0, 0.34);
      backdrop-filter: blur(16px);
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
      font-size: 0.68rem;
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
      font-family: ui-monospace, "SF Mono", Menlo, monospace;
      flex: 0 0 auto;
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
      font-size: 0.72rem;
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
      border-radius: 26px;
      border: 1px solid rgba(255, 255, 255, 0.08);
      padding: 16px 18px;
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
    .phase-node.phase-tone-disabled .phase-status-dot {
      background: rgba(255, 255, 255, 0.14);
      box-shadow: none;
    }
    .phase-node-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 12px;
      position: relative;
      z-index: 1;
    }
    .phase-current-rail {
      position: absolute;
      top: 22px;
      bottom: 22px;
      left: -42px;
      right: -16px;
      display: flex;
      align-items: center;
      justify-content: flex-start;
      padding-left: 0;
      border-radius: 18px;
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
      margin-left: -12px;
      color: rgba(245, 250, 255, 0.98);
      text-shadow: 0 1px 2px rgba(7, 17, 28, 0.34);
      font-size: 0.72rem;
      font-weight: 800;
      letter-spacing: 0.18em;
      line-height: 1;
      text-transform: uppercase;
      white-space: nowrap;
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
    .phase-node.phase-tone-active .phase-status-dot {
      background: #59bbff;
      box-shadow: 0 0 0 8px rgba(89, 187, 255, 0.12);
    }
    .phase-node.phase-tone-waiting-user .phase-status-dot {
      background: var(--attention-egg);
      box-shadow: 0 0 0 8px rgba(255, 213, 90, 0.14);
    }
    .phase-node.phase-tone-paused .phase-status-dot {
      background: #59bbff;
      box-shadow: 0 0 0 8px rgba(89, 187, 255, 0.1);
    }
    .phase-node.phase-tone-blocked .phase-status-dot {
      background: #ff8b8b;
      box-shadow: 0 0 0 8px rgba(255, 139, 139, 0.08);
    }
    .phase-node.phase-tone-completed .phase-status-dot {
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
      display: grid;
      gap: 18px;
      align-content: start;
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
    .iteration-rail__stem::before {
      content: "";
      position: absolute;
      left: 8px;
      top: 0;
      bottom: -10px;
      width: 2px;
      background: linear-gradient(180deg, rgba(92, 181, 255, 0.5), rgba(92, 181, 255, 0.12));
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
    .iteration-rail__item:last-child .iteration-rail__stem::before {
      bottom: 14px;
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
      font-family: ui-monospace, "SF Mono", Menlo, monospace;
    }
    .iteration-rail__summary {
      font-size: 0.82rem;
      line-height: 1.45;
      color: rgba(226, 232, 242, 0.84);
    }
    .iteration-detail__meta {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
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
      font-family: ui-monospace, "SF Mono", Menlo, monospace;
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
      font-size: 0.72rem;
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
    .detail-actions--phase-input {
      justify-content: space-between;
    }
    .phase-input-log {
      display: grid;
      gap: 8px;
    }
    .phase-input-log__header {
      font-size: 0.72rem;
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
      display: flex;
      justify-content: space-between;
      gap: 12px;
      flex-wrap: wrap;
      font-family: ui-monospace, "SF Mono", Menlo, monospace;
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
      .layout {
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
    @media (max-width: 760px) {
      body {
        padding: 12px;
      }
      .hero, .graph-panel, .detail-panel {
        padding: 16px;
      }
      .detail-metrics {
        grid-template-columns: 1fr;
      }
      .detail-actions--phase-header {
        position: static;
        margin: 12px 0 0;
        justify-content: flex-start;
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
  <div class="shell" data-workflow-shell>
    ${settingsWarning}
    <section class="panel hero">
      <div class="hero-head">
        <div>
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
    </section>
    <section class="layout">
      <aside class="panel graph-panel">
        <h2 class="panel-title">Workflow Constellation</h2>
        <p class="panel-copy">The graph is the primary surface. Click any phase node to move the detail focus and inspect its artifact and audit context.</p>
        <div class="graph-stage${executionOverlay ? " graph-stage--overlay-active" : ""}">
          ${executionOverlay}
          ${phaseGraph}
        </div>
      </aside>
      <main class="panel detail-panel">
        <div class="detail-card-shell">
          ${detailActions}
          <section class="detail-card detail-card--phase-overview">
          <h2>${escapeHtml(selectedPhase.title)}</h2>
          <div class="detail-meta">
            <span class="token">${escapeHtml(phaseSecondaryLabel(selectedPhase))}</span>
            <span class="token${selectedPhaseStateClass}">${escapeHtml(selectedPhase.state)}</span>
            ${selectedPhase.requiresApproval ? `<span class="token token--attention">approval required</span>` : ""}
            ${selectedPhase.isApproved ? `<span class="token token--success">approved</span>` : ""}
          </div>
          ${selectedPhaseMetrics ? `<div class="detail-metrics">${selectedPhaseMetrics}</div>` : ""}
          </section>
        </div>
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
        <section class="detail-card">
          <h3>Audit Stream</h3>
          <div class="audit-stream">${auditRows}</div>
        </section>
      </main>
    </section>
  </div>
  <script>
    const vscode = acquireVsCodeApi();
    const viewState = vscode.getState() ?? {};
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
    for (const element of document.querySelectorAll("[data-command]")) {
      if (element instanceof HTMLElement && element.dataset.command === "approve") {
        continue;
      }

      element.addEventListener("click", () => {
        vscode.postMessage({
          command: element.dataset.command,
          phaseId: element.dataset.phaseId,
          path: element.dataset.path,
          kind: element.dataset.kind
        });
      });
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
    const workflowShell = document.querySelector("[data-workflow-shell]");
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
      }
    });

    if (viewState.workflowFilesOpen) {
      toggleWorkflowFiles(true);
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
      const messageCatalog = JSON.parse(executionOverlay.dataset.messages ?? "[]");
      const overlayKey = buildExecutionOverlayStateKey(
        executionOverlay.dataset.usId ?? "",
        executionOverlay.dataset.phaseId ?? "",
        executionOverlay.dataset.tone ?? ""
      );
      const dismissKey = overlayKey + ":dismissed";
      const overlayTone = executionOverlay.dataset.tone ?? "";
      const providedStartedAt = Number.parseInt(executionOverlay.dataset.startedAtMs ?? "", 10);
      const showElapsed = executionOverlay.dataset.showElapsed === "true";
      const dismissible = executionOverlay.dataset.dismissible === "true";
      if (overlayTone === "playing") {
        clearExecutionOverlayDismissed(dismissKey);
      } else if (dismissible && isExecutionOverlayDismissed(dismissKey)) {
        executionOverlay.remove();
        if (graphStage) {
          graphStage.classList.remove("graph-stage--overlay-active");
        }
      } else {
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

      if (overlayTone !== "playing" && graphStage) {
        document.addEventListener("pointerdown", (event) => {
          const target = event.target;
          if (!(target instanceof Node)) {
            return;
          }

          if (executionOverlay.contains(target)) {
            return;
          }

          dismissOverlay();
        }, { once: true });
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

    function buildExecutionOverlayStateKey(usId, phaseId, tone) {
      return "specforge-ai:execution-overlay:" + usId + ":" + phaseId + ":" + tone;
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
function buildPhaseGraph(workflow, state, selectedPhaseId, playbackState, effectiveExecutionPhaseId) {
    const currentPhase = workflow.phases.find((phase) => phase.isCurrent) ?? workflow.phases[0];
    const executionPhaseId = playbackState === "playing" ? effectiveExecutionPhaseId : null;
    const completedPhaseIds = new Set(state.completedPhaseIds ?? []);
    const clarificationVisible = shouldShowClarificationPhase(workflow, executionPhaseId);
    const visiblePhases = workflow.phases.filter((phase) => shouldShowPhase(phase.phaseId, clarificationVisible, currentPhase.phaseId, executionPhaseId));
    const layoutPhases = visiblePhases.map((phase) => ({
        phaseId: phase.phaseId,
        expectsHumanIntervention: expectsHumanIntervention(phase.phaseId, phase.requiresApproval)
    }));
    const desktopLayout = buildPhaseLayout(layoutPhases, desktopLayoutConfig, phaseNodeWidth);
    const mobileLayout = buildPhaseLayout(layoutPhases, mobileLayoutConfig, mobilePhaseNodeWidth);
    const links = buildGraphLinks(visiblePhases, executionPhaseId, completedPhaseIds, desktopLayout.positions, phaseNodeWidth);
    const mobileLinks = buildGraphLinks(visiblePhases, executionPhaseId, completedPhaseIds, mobileLayout.positions, mobilePhaseNodeWidth);
    const nodes = visiblePhases.map((phase, index) => {
        const disabled = false;
        const visualTone = resolvePhaseVisualTone(workflow.status, playbackState, phase, disabled, executionPhaseId, completedPhaseIds);
        const desktopPosition = desktopLayout.positions[phase.phaseId] ?? { left: desktopLayoutConfig.columns.left, top: desktopLayoutConfig.topOffset };
        const mobilePosition = mobileLayout.positions[phase.phaseId] ?? { left: mobileLayoutConfig.columns.left, top: mobileLayoutConfig.topOffset };
        const displayState = phaseToneLabel(visualTone, phase.state);
        return `
    <button
      class="phase-node ${escapeHtmlAttribute(phase.phaseId)} phase-tone-${escapeHtmlAttribute(visualTone)}${phase.phaseId === selectedPhaseId ? " selected" : ""}${phase.isCurrent ? " phase-node--current" : ""}"
      data-command="selectPhase"
      data-phase-id="${escapeHtmlAttribute(phase.phaseId)}"
      style="--phase-left-desktop: ${desktopPosition.left}px; --phase-top-desktop: ${desktopPosition.top}px; --phase-left-mobile: ${mobilePosition.left}px; --phase-top-mobile: ${mobilePosition.top}px;">
      ${phase.isCurrent ? `<span class="phase-current-rail"><span class="phase-current-rail__label">Current</span></span>` : ""}
      <div class="phase-node-content${phase.isCurrent ? " phase-node-content--current" : ""}">
        <div class="phase-node-header">
          <span class="phase-index">${index + 1}</span>
          <span class="phase-status-dot"></span>
        </div>
        <h3>${escapeHtml(phase.title)}</h3>
        <div class="phase-slug">${escapeHtml(phaseSecondaryLabel(phase))}</div>
        <div class="phase-tags">
          <span class="phase-tag phase-tag--${escapeHtmlAttribute(visualTone)}">${escapeHtml(displayState)}</span>
          ${phase.requiresApproval ? `<span class="phase-tag approval">approval</span>` : ""}
          ${phase.isApproved ? `<span class="phase-tag">approved</span>` : ""}
        </div>
      </div>
    </button>
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
function resolveEffectiveExecutionPhaseId(workflow, state, playbackState) {
    if (playbackState !== "playing") {
        return null;
    }
    if (state.executionPhaseId) {
        return state.executionPhaseId;
    }
    if (workflow.currentPhase === "capture") {
        return "clarification";
    }
    return workflow.currentPhase;
}
function buildGraphLinks(visiblePhases, executingTargetPhaseId, completedPhaseIds, positions, nodeWidth) {
    const edges = [];
    for (let index = 0; index < visiblePhases.length - 1; index++) {
        const fromPhase = visiblePhases[index];
        const toPhase = visiblePhases[index + 1];
        edges.push({
            fromPhaseId: fromPhase.phaseId,
            toPhaseId: toPhase.phaseId,
            className: linkClass(toPhase, executingTargetPhaseId, completedPhaseIds)
        });
    }
    return edges
        .map((edge) => `<path class="${edge.className}" d="${graphPath(edge.fromPhaseId, edge.toPhaseId, positions, nodeWidth)}"></path>`)
        .join("");
}
function shouldShowClarificationPhase(_workflow, _executionPhaseId) {
    return true;
}
function linkClass(targetPhase, executingTargetPhaseId, completedPhaseIds) {
    if (executingTargetPhaseId === targetPhase.phaseId) {
        return "executing";
    }
    if (completedPhaseIds.has(targetPhase.phaseId) || targetPhase.isCurrent || targetPhase.state === "completed") {
        return "completed";
    }
    return "pending";
}
function shouldShowPhase(phaseId, clarificationVisible, currentPhaseId, executionPhaseId) {
    return phaseId !== "clarification"
        || clarificationVisible
        || currentPhaseId === "clarification"
        || executionPhaseId === "clarification";
}
function graphPath(fromPhaseId, toPhaseId, positions, nodeWidth) {
    const fromPosition = positions[fromPhaseId];
    const toPosition = positions[toPhaseId];
    if (!fromPosition || !toPosition) {
        return "";
    }
    const { fromAnchor, toAnchor } = resolveAnchors(fromPosition, toPosition);
    const from = getAnchorPoint(fromPosition, fromAnchor, nodeWidth);
    const to = getAnchorPoint(toPosition, toAnchor, nodeWidth);
    const fromColumn = fromPosition.left < toPosition.left
        ? "left"
        : fromPosition.left > toPosition.left
            ? "right"
            : fromPosition.left <= desktopLayoutConfig.columns.left + 40
                ? "left"
                : "right";
    const sameColumn = fromPosition.left === toPosition.left;
    if (sameColumn) {
        const bendDirection = fromColumn === "left" ? -1 : 1;
        const lateralOffset = Math.max(26, nodeWidth * 0.14) * bendDirection;
        const verticalSpread = Math.max(28, Math.abs(to.y - from.y) * 0.26);
        return `M ${from.x} ${from.y} C ${from.x + lateralOffset} ${from.y + verticalSpread}, ${to.x + lateralOffset} ${to.y - verticalSpread}, ${to.x} ${to.y}`;
    }
    if (to.x > from.x) {
        const horizontalOffset = Math.max(54, Math.abs(to.x - from.x) * 0.34);
        const verticalOffset = Math.max(20, Math.abs(to.y - from.y) * 0.14);
        return `M ${from.x} ${from.y} C ${from.x + horizontalOffset} ${from.y}, ${to.x - horizontalOffset} ${to.y - verticalOffset}, ${to.x} ${to.y}`;
    }
    const lateralOffset = Math.max(30, nodeWidth * 0.12);
    const verticalSpread = Math.max(30, Math.abs(to.y - from.y) * 0.24);
    return `M ${from.x} ${from.y} C ${from.x - lateralOffset} ${from.y + verticalSpread}, ${to.x - lateralOffset} ${to.y - verticalSpread}, ${to.x} ${to.y}`;
}
function resolveAnchors(from, to) {
    const deltaX = to.left - from.left;
    const fromColumn = deltaX === 0 ? (from.left <= 100 ? "left" : "right") : deltaX > 0 ? "left" : "right";
    if (deltaX === 0) {
        return {
            fromAnchor: "exit-bottom-right",
            toAnchor: "entry-top"
        };
    }
    if (deltaX > 0) {
        return { fromAnchor: "exit-right", toAnchor: "entry-left" };
    }
    return { fromAnchor: "exit-left", toAnchor: "entry-top" };
}
function getAnchorPoint(position, anchor, nodeWidth) {
    switch (anchor) {
        case "entry-top":
            return { x: position.left + nodeWidth * 0.18, y: position.top };
        case "entry-left":
            return { x: position.left, y: position.top + phaseNodeHeight * 0.28 };
        case "exit-right":
            return { x: position.left + nodeWidth, y: position.top + phaseNodeHeight * 0.68 };
        case "exit-left":
            return { x: position.left, y: position.top + phaseNodeHeight * 0.56 };
        case "exit-bottom-left":
            return { x: position.left + nodeWidth * 0.08, y: position.top + phaseNodeHeight };
        case "exit-bottom-mid":
            return { x: position.left + nodeWidth * 0.72, y: position.top + phaseNodeHeight };
        case "exit-bottom-right":
            return { x: position.left + nodeWidth * 0.92, y: position.top + phaseNodeHeight };
    }
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
function renderMarkdownToHtml(markdown) {
    const normalized = markdown.replace(/\r\n/g, "\n").trim();
    if (normalized.length === 0) {
        return "<p>Artifact content unavailable.</p>";
    }
    const lines = normalized.split("\n");
    const html = [];
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
            const codeLines = [];
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
            const quoteLines = [];
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
        const paragraphLines = [];
        while (index < lines.length && lines[index].trim()) {
            if (/^```/.test(lines[index].trim())
                || /^#{1,6}\s/.test(lines[index])
                || /^\s*>\s?/.test(lines[index])
                || /^\s*[-*+]\s+/.test(lines[index])
                || /^\s*\d+\.\s+/.test(lines[index])
                || /^\s*([-*_])(?:\s*\1){2,}\s*$/.test(lines[index])
                || isMarkdownTable(lines, index)) {
                break;
            }
            paragraphLines.push(lines[index].trim());
            index++;
        }
        html.push(`<p>${renderInlineMarkdown(paragraphLines.join(" "))}</p>`);
    }
    return html.join("\n");
}
function renderMarkdownList(lines, startIndex, ordered) {
    const items = [];
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
function isMarkdownTable(lines, index) {
    if (index + 1 >= lines.length) {
        return false;
    }
    const header = lines[index].trim();
    const separator = lines[index + 1].trim();
    return header.includes("|") && /^\|?[\s:-]+(?:\|[\s:-]+)+\|?$/.test(separator);
}
function renderMarkdownTable(lines, startIndex) {
    const headerCells = splitMarkdownTableRow(lines[startIndex]);
    let index = startIndex + 2;
    const bodyRows = [];
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
function splitMarkdownTableRow(row) {
    return row
        .trim()
        .replace(/^\|/, "")
        .replace(/\|$/, "")
        .split("|")
        .map((cell) => cell.trim());
}
function renderInlineMarkdown(text) {
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
function extractMarkdownApprovalItems(markdown) {
    if (!markdown) {
        return [];
    }
    const headingPatterns = [
        /^##\s+Human Approval Questions\s*$/i,
        /^##\s+Questions for Human Approval\s*$/i,
        /^##\s+Preguntas para aprobaci[oó]n humana\s*$/i
    ];
    const answerPattern = /^(?:[-*]\s+)?Answer:\s*(.+?)\s*$/i;
    const answeredByPattern = /^(?:[-*]\s+)?Answered By:\s*(.+?)\s*$/i;
    const answeredAtPattern = /^(?:[-*]\s+)?Answered At:\s*(.+?)\s*$/i;
    const lines = markdown.replace(/\r\n/g, "\n").split("\n");
    const startIndex = lines.findIndex((line) => headingPatterns.some((pattern) => pattern.test(line.trim())));
    if (startIndex < 0) {
        return [];
    }
    const items = [];
    let pendingQuestion = null;
    for (let index = startIndex + 1; index < lines.length; index += 1) {
        const trimmed = lines[index].trim();
        if (!trimmed) {
            continue;
        }
        if (/^##\s+/.test(trimmed)) {
            break;
        }
        const answerMatch = trimmed.match(answerPattern);
        if (answerMatch && pendingQuestion) {
            const answer = answerMatch[1].trim();
            pendingQuestion = {
                index: pendingQuestion.index,
                question: pendingQuestion.question,
                answer,
                resolved: answer.length > 0,
                answeredBy: pendingQuestion.answeredBy,
                answeredAtUtc: pendingQuestion.answeredAtUtc
            };
            items[items.length - 1] = pendingQuestion;
            continue;
        }
        const answeredByMatch = trimmed.match(answeredByPattern);
        if (answeredByMatch && pendingQuestion) {
            pendingQuestion = {
                index: pendingQuestion.index,
                question: pendingQuestion.question,
                answer: pendingQuestion.answer,
                resolved: pendingQuestion.resolved,
                answeredBy: answeredByMatch[1].trim(),
                answeredAtUtc: pendingQuestion.answeredAtUtc
            };
            items[items.length - 1] = pendingQuestion;
            continue;
        }
        const answeredAtMatch = trimmed.match(answeredAtPattern);
        if (answeredAtMatch && pendingQuestion) {
            pendingQuestion = {
                index: pendingQuestion.index,
                question: pendingQuestion.question,
                answer: pendingQuestion.answer,
                resolved: pendingQuestion.resolved,
                answeredBy: pendingQuestion.answeredBy,
                answeredAtUtc: answeredAtMatch[1].trim()
            };
            items[items.length - 1] = pendingQuestion;
            continue;
        }
        const parsedQuestion = parseApprovalQuestionLine(trimmed);
        if (!parsedQuestion) {
            continue;
        }
        const question = parsedQuestion.question;
        if (question) {
            pendingQuestion = {
                index: items.length + 1,
                question,
                answer: null,
                resolved: parsedQuestion.resolved,
                answeredBy: null,
                answeredAtUtc: null
            };
            items.push(pendingQuestion);
        }
    }
    return items;
}
function parseApprovalQuestionLine(line) {
    let normalized = line.trim();
    if (!normalized) {
        return null;
    }
    normalized = normalized.replace(/^(?:[-*]\s+|\d+\.\s+)/, "");
    let resolved = false;
    if (/^\[[xX]\]\s*/.test(normalized)) {
        resolved = true;
        normalized = normalized.replace(/^\[[xX]\]\s*/, "");
    }
    else if (/^\[\s\]\s*/.test(normalized)) {
        normalized = normalized.replace(/^\[\s\]\s*/, "");
    }
    if (!normalized
        || normalized === "..."
        || /^no human approval questions remain\.?$/i.test(normalized)
        || /^answer:\s*/i.test(normalized)
        || /^answered by:\s*/i.test(normalized)
        || /^answered at:\s*/i.test(normalized)) {
        return null;
    }
    return {
        question: normalized.trim(),
        resolved
    };
}
function extractArtifactQuestionBlock(markdown) {
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
function readLooseMarkdownSection(markdown, sectionNames) {
    const lines = markdown.split("\n");
    const normalizedNames = sectionNames.map((name) => name.trim().toLowerCase());
    const startIndex = lines.findIndex((line) => {
        const trimmed = normalizeLooseSectionHeading(line);
        return trimmed !== null && normalizedNames.includes(trimmed);
    });
    if (startIndex < 0) {
        return null;
    }
    const content = [];
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
function normalizeLooseSectionHeading(line) {
    const trimmed = line.trim();
    const match = trimmed.match(/^(?:##+\s*)?([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ\s-]+):?$/);
    if (!match) {
        return null;
    }
    return match[1].trim().toLowerCase();
}
function extractLooseQuestionLines(section) {
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
//# sourceMappingURL=workflowView.js.map