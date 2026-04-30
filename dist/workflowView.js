"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.escapeHtml = void 0;
exports.buildWorkflowAuditHtml = buildWorkflowAuditHtml;
exports.buildWorkflowHtml = buildWorkflowHtml;
const htmlEscape_1 = require("./htmlEscape");
Object.defineProperty(exports, "escapeHtml", { enumerable: true, get: function () { return htmlEscape_1.escapeHtml; } });
const capturePhaseView_1 = require("./workflow-view/capturePhaseView");
const artifactQuestions_1 = require("./workflow-view/artifactQuestions");
const refinementPhaseView_1 = require("./workflow-view/refinementPhaseView");
const completedPhaseView_1 = require("./workflow-view/completedPhaseView");
const implementationPhaseView_1 = require("./workflow-view/implementationPhaseView");
const graphLayout_1 = require("./workflow-view/graphLayout");
const icons_1 = require("./workflow-view/icons");
const markdownRenderer_1 = require("./workflow-view/markdownRenderer");
const prPreparationPhaseView_1 = require("./workflow-view/prPreparationPhaseView");
const workflowAutomation_1 = require("./workflowAutomation");
const workflowPlaybackState_1 = require("./workflowPlaybackState");
const workflowRewind_1 = require("./workflowRewind");
const workflowRejectPlan_1 = require("./workflowRejectPlan");
const specPhaseView_1 = require("./workflow-view/specPhaseView");
const releaseApprovalPhaseView_1 = require("./workflow-view/releaseApprovalPhaseView");
const reviewPhaseView_1 = require("./workflow-view/reviewPhaseView");
const technicalDesignPhaseView_1 = require("./workflow-view/technicalDesignPhaseView");
const webviewTypography_1 = require("./webviewTypography");
const workflowGraphLayout_1 = require("./workflowGraphLayout");
const phaseNodeWidth = 240;
const phaseNodeHeight = graphLayout_1.workflowGraphNodeHeight;
const mobilePhaseNodeWidth = 206;
const graphLoopBoxWidth = 196;
const graphLoopBoxHeight = 90;
const mobileGraphLoopBoxWidth = 166;
const mobileGraphLoopBoxHeight = 76;
const defaultPhaseSequence = [
    { phaseId: "capture", expectsHumanIntervention: false },
    { phaseId: "refinement", expectsHumanIntervention: true },
    { phaseId: "spec", expectsHumanIntervention: true },
    { phaseId: "technical-design", expectsHumanIntervention: false },
    { phaseId: "implementation", expectsHumanIntervention: false },
    { phaseId: "review", expectsHumanIntervention: false },
    { phaseId: "release-approval", expectsHumanIntervention: true },
    { phaseId: "pr-preparation", expectsHumanIntervention: false },
    { phaseId: "completed", expectsHumanIntervention: false }
];
const defaultDesktopHorizontalLayout = (0, graphLayout_1.buildHorizontalPhaseLayout)(defaultPhaseSequence, phaseNodeWidth, false, workflowGraphLayout_1.defaultHorizontalWorkflowGraphPositions);
const defaultDesktopVerticalLayout = (0, graphLayout_1.buildVerticalPhaseLayout)(defaultPhaseSequence, phaseNodeWidth, false, workflowGraphLayout_1.defaultVerticalWorkflowGraphPositions);
const defaultMobileHorizontalLayout = (0, graphLayout_1.buildHorizontalPhaseLayout)(defaultPhaseSequence, mobilePhaseNodeWidth, true, workflowGraphLayout_1.defaultHorizontalWorkflowGraphPositions);
const defaultMobileVerticalLayout = (0, graphLayout_1.buildVerticalPhaseLayout)(defaultPhaseSequence, mobilePhaseNodeWidth, true, workflowGraphLayout_1.defaultVerticalWorkflowGraphPositions);
const desktopGraphHeight = Math.max(defaultDesktopHorizontalLayout.height, defaultDesktopVerticalLayout.height);
const mobileGraphHeight = Math.max(defaultMobileHorizontalLayout.height, defaultMobileVerticalLayout.height);
const desktopGraphWidth = Math.max(defaultDesktopHorizontalLayout.width, defaultDesktopVerticalLayout.width);
const mobileGraphWidth = Math.max(defaultMobileHorizontalLayout.width, defaultMobileVerticalLayout.width);
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
function formatTimelinePointTime(value) {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
        return value;
    }
    return parsed.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
}
function sumTokenUsage(usages) {
    return usages.reduce((aggregate, usage) => ({
        inputTokens: aggregate.inputTokens + usage.inputTokens,
        outputTokens: aggregate.outputTokens + usage.outputTokens,
        totalTokens: aggregate.totalTokens + usage.totalTokens
    }), { inputTokens: 0, outputTokens: 0, totalTokens: 0 });
}
function aggregateWorkflowUsage(events, state) {
    const overall = { inputTokens: 0, outputTokens: 0, totalTokens: 0, durationMs: 0, events: 0 };
    const byModel = new Map();
    const byPhase = new Map();
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
function fileNameFromPath(filePath) {
    const normalized = filePath.replace(/\\/g, "/");
    const segments = normalized.split("/");
    return segments.at(-1) ?? filePath;
}
function renderTokenSummaryRow(label, value) {
    return `
    <div class="token-summary__row">
      <span class="token-summary__label">${(0, htmlEscape_1.escapeHtml)(label)}</span>
      <span class="token-summary__value">${(0, htmlEscape_1.escapeHtml)(value)}</span>
    </div>
  `;
}
function renderTokenSummaryCard(title, rows, options) {
    const modifierClass = options?.modifierClass ? ` ${options.modifierClass}` : "";
    return `
    <div class="token-summary${modifierClass}">
      <div class="token-summary__header">${(0, htmlEscape_1.escapeHtml)(title)}</div>
      <div class="token-summary__rows">
        ${rows.join("")}
      </div>
    </div>
  `;
}
function renderUsageDashboardTable(title, headers, rows) {
    return `
    <section class="detail-card detail-card--usage-table">
      <h3>${(0, htmlEscape_1.escapeHtml)(title)}</h3>
      <div class="usage-table-wrap">
        <table class="usage-table">
          <thead>
            <tr>${headers.map((header) => `<th>${(0, htmlEscape_1.escapeHtml)(header)}</th>`).join("")}</tr>
          </thead>
          <tbody>
            ${rows.map((row) => `<tr>${row.map((cell) => `<td>${(0, htmlEscape_1.escapeHtml)(cell)}</td>`).join("")}</tr>`).join("")}
          </tbody>
        </table>
      </div>
    </section>
  `;
}
function buildPhaseIterations(workflow, phaseId) {
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
    const seen = new Set();
    const chronologicalIterations = [];
    for (const event of eventsAfterLatestLineageRepair(workflow.events)) {
        if (event.phase !== phaseId || !isPhaseIterationEvent(event.code)) {
            continue;
        }
        const artifactPath = [...event.artifacts].reverse().find((candidate) => candidate.toLowerCase().endsWith(".md"));
        if (!artifactPath || seen.has(artifactPath)) {
            continue;
        }
        seen.add(artifactPath);
        const attempt = chronologicalIterations.length + 1;
        chronologicalIterations.push({
            iterationKey: `${phaseId}:${attempt}:${event.timestampUtc}:${event.code}`,
            attempt,
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
    return chronologicalIterations.reverse();
}
function isPhaseIterationEvent(code) {
    return code === "phase_completed" || code === "artifact_operated";
}
function summarizePhaseTouches(workflow, phaseId) {
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
function normalizeExecutionIdentity(value) {
    return value?.trim().toLowerCase() ?? "";
}
function isSuspiciousExecutionModel(execution, options) {
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
function formatExecutionLabel(execution, options) {
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
function findLatestPhaseExecutionLabel(workflow, phaseId, state) {
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
function findConfiguredModelForProfile(state, profileName) {
    if (!profileName) {
        return null;
    }
    const model = state.modelProfiles?.find((profile) => profile.name === profileName)?.model?.trim();
    return model && model.length > 0 ? model : null;
}
function buildPhaseSpecificSections(workflow, selectedPhase, state, artifactPreviewHtml, artifactQuestionBlock, specApprovalQuestions, unresolvedApprovalQuestionCount) {
    switch (selectedPhase.phaseId) {
        case "capture":
            return (0, capturePhaseView_1.buildCapturePhaseSections)({
                workflow,
                selectedPhase,
                selectedArtifactContent: state.selectedArtifactContent,
                artifactPreviewHtml,
                buildArtifactPreviewSection
            });
        case "refinement":
            return (0, refinementPhaseView_1.buildRefinementPhaseSections)({
                workflow,
                selectedPhase,
                state,
                heroTokenClass,
                escapeHtml: htmlEscape_1.escapeHtml,
                escapeHtmlAttribute: htmlEscape_1.escapeHtmlAttr
            });
        case "spec":
            return (0, specPhaseView_1.buildSpecPhaseSections)({
                workflow,
                selectedPhase,
                state,
                artifactQuestionBlock,
                specApprovalQuestions,
                unresolvedApprovalQuestionCount,
                escapeHtml: htmlEscape_1.escapeHtml,
                escapeHtmlAttribute: htmlEscape_1.escapeHtmlAttr,
                heroTokenClass,
                formatUtcTimestamp,
                renderChevronIcon
            });
        case "technical-design":
            return (0, technicalDesignPhaseView_1.buildTechnicalDesignPhaseSections)();
        case "implementation":
            return (0, implementationPhaseView_1.buildImplementationPhaseSections)();
        case "review":
            return (0, reviewPhaseView_1.buildReviewPhaseSections)({
                workflow,
                selectedPhase,
                state
            });
        case "release-approval":
            return (0, releaseApprovalPhaseView_1.buildReleaseApprovalPhaseSections)();
        case "pr-preparation":
            return (0, prPreparationPhaseView_1.buildPrPreparationPhaseSections)();
        case "completed":
            return (0, completedPhaseView_1.buildCompletedPhaseSections)({
                workflow,
                selectedPhase,
                state
            });
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
        "Sorting intent from noise before spec takes over.",
        "Trying to spot ambiguity while it is still cheap."
    ],
    refinement: [
        "Preparing the awkward but necessary questions.",
        "Looking for the one missing answer that blocks everything else.",
        "Trying to convert vague scope into answerable prompts.",
        "Holding the line until the user story becomes actionable."
    ],
    spec: [
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
    const currentPhase = workflow.phases.find((phase) => phase.isCurrent) ?? workflow.phases[0];
    const effectiveExecutionPhaseId = resolveEffectiveExecutionPhaseId(workflow, state, playbackState);
    const pausedExecutionPhaseId = resolvePausedExecutionPhaseId(workflow, state, playbackState);
    const overlayPhase = playbackState === "playing" && effectiveExecutionPhaseId
        ? workflow.phases.find((phase) => phase.phaseId === effectiveExecutionPhaseId) ?? currentPhase
        : playbackState === "paused" && pausedExecutionPhaseId
            ? workflow.phases.find((phase) => phase.phaseId === pausedExecutionPhaseId) ?? currentPhase
            : currentPhase;
    const hasExecutionContext = playbackState !== "idle" || Boolean(state.executionPhaseId);
    const shouldShowPendingSettingsOverlay = Boolean(state.executionSettingsPending
        && state.executionSettingsPendingMessage
        && hasExecutionContext);
    if (playbackState === "idle" && !shouldShowPendingSettingsOverlay) {
        return "";
    }
    const pausedOnFailedReview = playbackState === "paused"
        && currentPhase.phaseId === "review"
        && workflow.controls.blockingReason === "review_failed";
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
            : playbackState === "stopping"
                ? {
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
                }
                : shouldShowPendingSettingsOverlay
                    ? {
                        usId: workflow.usId,
                        title: "Execution setup pending",
                        phaseId: state.executionPhaseId ?? currentPhase.phaseId,
                        tone: "pending-settings",
                        startedAtMs: state.playbackStartedAtMs ?? null,
                        showElapsed: false,
                        eyebrow: "SpecForge.AI Configuration",
                        actionLabel: "Open SpecForge Configuration",
                        actionCommand: "openSettings",
                        messages: [state.executionSettingsPendingMessage ?? "Execution setup changes will apply on the next phase boundary."]
                    }
                    : null;
    if (!overlay) {
        return "";
    }
    const overlayPhaseProfileLabel = phaseModelProfileLabel(overlayPhase, state);
    const overlayConfiguredModel = findConfiguredModelForProfile(state, overlayPhaseProfileLabel);
    const overlayPhaseConfiguredLabel = formatExecutionLabel(overlayConfiguredModel ? { model: overlayConfiguredModel, profileName: overlayPhaseProfileLabel } : null, { configuredModel: overlayConfiguredModel });
    const overlayPhaseModelLabel = overlayPhaseConfiguredLabel
        ?? overlayPhaseProfileLabel;
    return `
    <div
      class="execution-overlay execution-overlay--${(0, htmlEscape_1.escapeHtmlAttr)(overlay.tone)}"
      data-execution-overlay
      data-us-id="${(0, htmlEscape_1.escapeHtmlAttr)(overlay.usId)}"
      data-phase-id="${(0, htmlEscape_1.escapeHtmlAttr)(overlay.phaseId)}"
      data-anchor-phase-id="${(0, htmlEscape_1.escapeHtmlAttr)(overlay.phaseId)}"
      data-tone="${(0, htmlEscape_1.escapeHtmlAttr)(overlay.tone)}"
      data-started-at-ms="${overlay.startedAtMs ?? ""}"
      data-dismissible="${overlay.tone === "playing" ? "false" : "true"}"
      data-show-elapsed="${overlay.showElapsed ? "true" : "false"}"
      data-messages='${(0, htmlEscape_1.escapeHtmlAttr)(JSON.stringify(overlay.messages))}'>
      ${overlay.tone === "playing" ? "" : `<button type="button" class="execution-overlay__dismiss" data-execution-overlay-dismiss>Dismiss</button>`}
      <div class="execution-overlay__pulse" aria-hidden="true"></div>
      <div class="execution-overlay__body">
        <span class="execution-overlay__eyebrow">${(0, htmlEscape_1.escapeHtml)(overlay.eyebrow ?? "SpecForge.AI Runner")}</span>
        <strong class="execution-overlay__title">${(0, htmlEscape_1.escapeHtml)(overlay.title)}</strong>
        <p class="execution-overlay__message" data-execution-message>${(0, htmlEscape_1.escapeHtml)(overlay.messages[0] ?? "Processing workflow phase.")}</p>
        ${overlay.actionLabel && overlay.actionCommand
        ? `<div class="execution-overlay__actions"><button class="workflow-action-button workflow-action-button--document" type="button" data-command="${(0, htmlEscape_1.escapeHtmlAttr)(overlay.actionCommand)}">${(0, htmlEscape_1.escapeHtml)(overlay.actionLabel)}</button></div>`
        : ""}
      </div>
      ${overlay.showElapsed ? `<span class="execution-overlay__elapsed" data-execution-elapsed>00:00</span>` : ""}
      ${overlayPhaseModelLabel ? `<span class="execution-overlay__phase-model">${(0, htmlEscape_1.escapeHtml)(overlayPhaseModelLabel)}</span>` : ""}
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
        case "needs_refinement":
        case "runner:paused":
            return "attention";
        case "ready":
        case "ready-for-execution":
        case "ready_for_spec":
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
function phaseSecurityTone(readiness) {
    if (!readiness?.requiredPermissions?.modelExecutionRequired) {
        return null;
    }
    return readiness.canExecute ? "success" : "blocked";
}
function formatPhaseSecurityState(readiness) {
    if (!readiness?.requiredPermissions?.modelExecutionRequired) {
        return null;
    }
    return readiness.canExecute ? "security ok" : "security blocked";
}
function buildPhaseSecuritySummary(readiness) {
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
        <span class="token token--${(0, htmlEscape_1.escapeHtmlAttr)(tone)}">${(0, htmlEscape_1.escapeHtml)(headline)}</span>
        <span class="token">required ${(0, htmlEscape_1.escapeHtml)(requiredAccess)}</span>
        <span class="token">assigned ${(0, htmlEscape_1.escapeHtml)(effectiveAccess)}</span>
        <span class="token">${(0, htmlEscape_1.escapeHtml)(provider)}</span>
        <span class="token">${(0, htmlEscape_1.escapeHtml)(profile)}</span>
        <span class="token">${(0, htmlEscape_1.escapeHtml)(model)}</span>
        <span class="token">${(0, htmlEscape_1.escapeHtml)(nativeCliState)}</span>
      </div>
      ${readiness.validationMessage ? `<p class="panel-copy">${(0, htmlEscape_1.escapeHtml)(readiness.validationMessage)}</p>` : ""}
    </section>
  `;
}
function isCurrentPhaseFailureBlocked(workflow, phase) {
    if (!phase.isCurrent) {
        return false;
    }
    if (workflow.status === "completed" || workflow.controls.blockingReason === "workflow_completed") {
        return false;
    }
    if (workflow.controls.canContinue || workflow.controls.requiresApproval || !workflow.controls.blockingReason) {
        return false;
    }
    const blockingExecutionPhaseId = workflow.controls.executionPhase ?? null;
    return blockingExecutionPhaseId === null || blockingExecutionPhaseId === phase.phaseId;
}
function resolvePhaseVisualTone(workflowStatus, workflow, playbackState, phase, disabled, executionPhaseId, pausedPhaseId, completedPhaseIds) {
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
function phaseToneLabel(tone, fallbackState, playbackState, isCurrent) {
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
function buildEffectiveCompletedPhaseIds(workflow, completedPhaseIds) {
    const effectiveCompletedPhaseIds = new Set(completedPhaseIds);
    if (workflow.status === "completed") {
        effectiveCompletedPhaseIds.add("completed");
        if (workflow.currentPhase === "pr-preparation") {
            effectiveCompletedPhaseIds.add("pr-preparation");
        }
    }
    return effectiveCompletedPhaseIds;
}
function canRerunCurrentReview(workflow, selectedPhase, playbackState) {
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
function phaseSecondaryLabel(phase) {
    switch (phase.phaseId) {
        case "capture":
            return "Capture story intent";
        case "refinement":
            return "Resolve open questions";
        case "spec":
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
        case "completed":
            return "Workflow finished";
        default:
            return phase.phaseId;
    }
}
function phaseOutputFormat(phaseId) {
    switch (phaseId) {
        case "capture":
        case "spec":
        case "technical-design":
        case "implementation":
        case "release-approval":
            return "markdown";
        case "refinement":
        case "review":
        case "pr-preparation":
            return "json";
        default:
            return null;
    }
}
function phaseOutputFormatToken(phaseId) {
    const format = phaseOutputFormat(phaseId);
    if (!format) {
        return "";
    }
    const label = format === "json" ? "JSON output" : "Markdown output";
    return `<span class="token token--output-format token--output-format-${format}">${label}</span>`;
}
function graphPhaseSecondaryLabel(phase) {
    return phaseSecondaryLabel(phase);
}
function graphPhaseTitle(phase) {
    switch (phase.phaseId) {
        case "spec":
            return "Spec";
        default:
            return phase.title;
    }
}
function phaseSecondaryLabelForPhaseId(workflow, phaseId) {
    const phase = workflow.phases.find((candidate) => candidate.phaseId === phaseId);
    return phase ? phaseSecondaryLabel(phase) : phaseId;
}
function buildTimelinePointTooltip(workflow, point) {
    const lines = [
        point.attempt && point.attempt > 1 ? `${point.title} · iteration ${point.attempt}` : point.title,
        phaseSecondaryLabelForPhaseId(workflow, point.phaseId)
    ];
    if (point.timestampUtc) {
        lines.push(formatUtcTimestamp(point.timestampUtc));
    }
    if (point.isCurrent) {
        lines.push("Current workflow position.");
    }
    else if (!point.canSelect && point.reasonMessage) {
        lines.push(point.reasonMessage);
    }
    return lines.join(" \n");
}
function phaseModelProfileLabel(phase, state) {
    const assignments = state.phaseModelAssignments;
    if (!assignments) {
        return null;
    }
    switch (phase.phaseId) {
        case "capture":
            return assignments.captureProfileName ?? assignments.defaultProfileName;
        case "refinement":
            return assignments.refinementProfileName ?? assignments.defaultProfileName;
        case "spec":
            return assignments.specProfileName ?? assignments.defaultProfileName;
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
        case "completed":
            return null;
        default:
            return assignments.defaultProfileName;
    }
}
function buildAssignedPhaseExecutionLabel(phase, state) {
    const profileName = phaseModelProfileLabel(phase, state);
    const configuredModel = findConfiguredModelForProfile(state, profileName);
    if (!profileName && !configuredModel) {
        return null;
    }
    return formatExecutionLabel(configuredModel ? { model: configuredModel, profileName } : { model: "", profileName }, { configuredModel }) ?? profileName ?? configuredModel;
}
function buildWorkflowHeroTitle(workflow) {
    const normalizedTitle = workflow.title.trim();
    if (normalizedTitle.startsWith(`${workflow.usId} ·`) || normalizedTitle === workflow.usId) {
        return normalizedTitle;
    }
    return `${workflow.usId} · ${normalizedTitle}`;
}
function shouldRenderApprovalBranchEditor(workflow, selectedPhase, selectedPhaseIsCurrent) {
    return selectedPhase.phaseId === "spec"
        && selectedPhaseIsCurrent
        && workflow.controls.requiresApproval;
}
function buildArtifactPreviewSection(artifactPath, artifactPreviewHtml, artifactContent, options) {
    const rawArtifact = options?.rawArtifact ?? false;
    const footerNote = options?.footerNote?.trim() ?? "";
    const isMarkdownArtifact = artifactPath.trim().toLowerCase().endsWith(".md");
    const effectiveArtifactPreviewHtml = isMarkdownArtifact
        ? (artifactPreviewHtml ?? (0, markdownRenderer_1.renderMarkdownToHtml)(artifactContent))
        : null;
    const badgeLabel = rawArtifact ? "Raw Artifact" : "Preview";
    const badgeClass = rawArtifact ? " badge--muted" : "";
    return `
    <div class="detail-actions detail-actions--artifact">
      <div class="artifact-view-label">
        <span class="badge${badgeClass}">${badgeLabel}</span>
      </div>
      <button class="workflow-action-button workflow-action-button--document" data-command="openArtifact" data-path="${(0, htmlEscape_1.escapeHtmlAttr)(artifactPath)}">Open Artifact</button>
    </div>
    ${effectiveArtifactPreviewHtml
        ? `<div class="markdown-preview${rawArtifact ? " markdown-preview--raw-artifact" : ""}">${effectiveArtifactPreviewHtml}</div>`
        : `<pre class="artifact-preview${rawArtifact ? " artifact-preview--raw-artifact" : ""}">${(0, htmlEscape_1.escapeHtml)(artifactContent)}</pre>`}
    ${footerNote ? `<p class="muted">${(0, htmlEscape_1.escapeHtml)(footerNote)}</p>` : ""}
  `;
}
function buildEmbeddedArtifactSection(title, artifactPath, artifactContent, options) {
    const headingTag = options?.compactTitle ? "h4" : "h3";
    const artifactPreviewHtml = artifactPath.trim().toLowerCase().endsWith(".md")
        ? (0, markdownRenderer_1.renderMarkdownToHtml)(artifactContent)
        : null;
    return `
    <section class="detail-card detail-card--embedded-artifact">
      <${headingTag}>${(0, htmlEscape_1.escapeHtml)(title)}</${headingTag}>
      ${buildArtifactPreviewSection(artifactPath, artifactPreviewHtml, artifactContent, options)}
    </section>
  `;
}
function buildArtifactCollectionSection(artifacts, options) {
    if (artifacts.length === 0) {
        return `<p class="muted">${(0, htmlEscape_1.escapeHtml)(options?.emptyMessage ?? "No artifacts are available.")}</p>`;
    }
    return `
    <div class="embedded-artifact-list">
      ${artifacts.map((artifact) => buildEmbeddedArtifactSection(fileNameFromPath(artifact.path), artifact.path, artifact.content ?? "Artifact content unavailable.", {
        rawArtifact: options?.rawArtifact,
        compactTitle: true
    })).join("")}
    </div>
  `;
}
function auditPhaseClassName(phaseId) {
    if (!phaseId) {
        return null;
    }
    const normalizedPhaseId = phaseId.toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
    return normalizedPhaseId ? `audit-row--${normalizedPhaseId}` : null;
}
function buildWorkflowAuditRowsHtml(workflow, state) {
    return workflow.events.length > 0
        ? workflow.events.map((event) => {
            const phaseClassName = auditPhaseClassName(event.phase);
            const phaseIcon = event.phase
                ? `
          <span class="audit-row__phase-icon" aria-hidden="true">
            ${(0, icons_1.workflowPhaseIcon)(event.phase)}
          </span>
        `
                : "";
            const executionLabel = formatExecutionLabel(event.execution, {
                actor: event.actor,
                configuredModel: findConfiguredModelForProfile(state, event.execution?.profileName)
            });
            const badges = [
                event.actor ? `<span class="badge">${(0, htmlEscape_1.escapeHtml)(event.actor)}</span>` : "",
                event.phase ? `<span class="badge">${(0, htmlEscape_1.escapeHtml)(event.phase)}</span>` : "",
                executionLabel ? `<span class="badge">model ${(0, htmlEscape_1.escapeHtml)(executionLabel)}</span>` : "",
                event.usage ? `<span class="badge">in/out ${(0, htmlEscape_1.escapeHtml)(`${formatMetricNumber(event.usage.inputTokens)}/${formatMetricNumber(event.usage.outputTokens)}`)}</span>` : "",
                event.usage ? `<span class="badge">total ${(0, htmlEscape_1.escapeHtml)(formatMetricNumber(event.usage.totalTokens))}</span>` : "",
                event.durationMs !== null ? `<span class="badge">${(0, htmlEscape_1.escapeHtml)(formatDuration(event.durationMs))}</span>` : "",
                event.usage && event.durationMs !== null ? `<span class="badge">${(0, htmlEscape_1.escapeHtml)(formatTokensPerSecond(event.usage.outputTokens, event.durationMs))}</span>` : ""
            ].filter((badge) => badge.length > 0).join("");
            return `
      <div class="audit-row${phaseClassName ? ` ${(0, htmlEscape_1.escapeHtmlAttr)(phaseClassName)}` : ""}">
        ${phaseIcon}
        <div class="audit-row__content">
          <div class="audit-head">
            <span class="audit-head__title">${(0, htmlEscape_1.escapeHtml)(event.timestampUtc)} · ${(0, htmlEscape_1.escapeHtml)(event.code)}</span>
            ${badges.length > 0 ? `<div class="audit-head__meta">${badges}</div>` : ""}
          </div>
          <div class="audit-body">${(0, htmlEscape_1.escapeHtml)(event.summary ?? "")}</div>
        </div>
      </div>
    `;
        }).join("")
        : `<pre class="audit-log">${(0, htmlEscape_1.escapeHtml)(workflow.rawTimeline)}</pre>`;
}
function buildTimelineLoopGroups(points, selectedPhaseId) {
    const groups = [];
    let index = 0;
    while (index < points.length) {
        if (!isImplementationReviewTimelinePhase(points[index]?.phaseId)) {
            index += 1;
            continue;
        }
        const startIndex = index;
        while (index + 1 < points.length && isImplementationReviewTimelinePhase(points[index + 1]?.phaseId)) {
            index += 1;
        }
        const endIndex = index;
        const segment = points.slice(startIndex, endIndex + 1);
        const implementationCount = segment.filter((point) => point.phaseId === "implementation").length;
        const reviewCount = segment.filter((point) => point.phaseId === "review").length;
        const iterationCount = countPairedImplementationReviewAttempts(segment
            .filter((point) => point.phaseId === "implementation" || point.phaseId === "review")
            .map((point) => ({
            phaseId: point.phaseId,
            attempt: point.attempt
        })), implementationCount, reviewCount);
        if (implementationCount > 0 && reviewCount > 0 && iterationCount >= 2 && segment.length >= 3) {
            groups.push({
                startIndex,
                endIndex,
                iterationCount,
                isSelected: selectedPhaseId === "implementation" || selectedPhaseId === "review"
            });
        }
        index += 1;
    }
    return groups;
}
function isImplementationReviewTimelinePhase(phaseId) {
    return phaseId === "implementation" || phaseId === "review";
}
function countPairedImplementationReviewAttempts(attempts, implementationFallbackCount, reviewFallbackCount) {
    const implementationAttempts = new Set();
    const reviewAttempts = new Set();
    for (const entry of attempts) {
        if (entry.attempt === null || entry.attempt < 1) {
            continue;
        }
        if (entry.phaseId === "implementation") {
            implementationAttempts.add(entry.attempt);
            continue;
        }
        if (entry.phaseId === "review") {
            reviewAttempts.add(entry.attempt);
        }
    }
    if (implementationAttempts.size > 0 || reviewAttempts.size > 0) {
        let pairedCount = 0;
        for (const attempt of implementationAttempts) {
            if (reviewAttempts.has(attempt)) {
                pairedCount += 1;
            }
        }
        return pairedCount;
    }
    return Math.min(implementationFallbackCount, reviewFallbackCount);
}
function renderChevronIcon(className) {
    return `
    <span class="${className}" aria-hidden="true">
      <svg viewBox="0 0 20 20" fill="none" focusable="false">
        <path d="M6.25 8.25 10 12l3.75-3.75" />
      </svg>
    </span>
  `;
}
function zoomInIcon() {
    return `
    <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <path d="M8.5 3.5a5 5 0 1 0 3.2 8.84l2.98 2.98a.75.75 0 1 0 1.06-1.06l-2.98-2.98A5 5 0 0 0 8.5 3.5Zm0 1.5a3.5 3.5 0 1 1 0 7 3.5 3.5 0 0 1 0-7Zm-.75 1.5a.75.75 0 0 1 1.5 0v1.25h1.25a.75.75 0 0 1 0 1.5H9.25v1.25a.75.75 0 0 1-1.5 0V9.25H6.5a.75.75 0 0 1 0-1.5h1.25V6.5Z"></path>
    </svg>
  `;
}
function zoomOutIcon() {
    return `
    <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <path d="M8.5 3.5a5 5 0 1 0 3.2 8.84l2.98 2.98a.75.75 0 1 0 1.06-1.06l-2.98-2.98A5 5 0 0 0 8.5 3.5Zm0 1.5a3.5 3.5 0 1 1 0 7 3.5 3.5 0 0 1 0-7Zm-2 2.75a.75.75 0 0 0 0 1.5h4a.75.75 0 0 0 0-1.5h-4Z"></path>
    </svg>
  `;
}
function fitGraphIcon() {
    return `
    <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <path d="M3.75 4a.75.75 0 0 1 .75-.75h3a.75.75 0 0 1 0 1.5H5.25V7a.75.75 0 0 1-1.5 0V4Zm8.75 0a.75.75 0 0 1 .75-.75h3A.75.75 0 0 1 17 4v3a.75.75 0 0 1-1.5 0V4.75H13.25A.75.75 0 0 1 12.5 4Zm-8.75 9.25A.75.75 0 0 1 4.5 14v2.25h2.25a.75.75 0 0 1 0 1.5h-3A.75.75 0 0 1 3 17v-3a.75.75 0 0 1 .75-.75Zm12.5 0A.75.75 0 0 1 17 14v3a.75.75 0 0 1-.75.75h-3a.75.75 0 0 1 0-1.5h2.25V14a.75.75 0 0 1 .75-.75ZM7 7h6v6H7V7Zm1.5 1.5v3h3v-3h-3Z"></path>
    </svg>
  `;
}
function fitWidthGraphIcon() {
    return `
    <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <path d="M3.75 5.25A.75.75 0 0 1 4.5 4.5h2.75a.75.75 0 0 1 0 1.5H6.31l1.22 1.22a.75.75 0 0 1-1.06 1.06L5.25 7.06v.94a.75.75 0 0 1-1.5 0V5.25Zm8.25 0a.75.75 0 0 1 .75-.75h2.75a.75.75 0 0 1 .75.75V8a.75.75 0 0 1-1.5 0v-.94l-1.22 1.22a.75.75 0 0 1-1.06-1.06L13.69 6h-.94a.75.75 0 0 1-.75-.75ZM5 9.25h10a.75.75 0 0 1 0 1.5H5a.75.75 0 0 1 0-1.5Zm-.75 2.75A.75.75 0 0 1 5 12.75v.94l1.22-1.22a.75.75 0 0 1 1.06 1.06L6.06 14.75H7a.75.75 0 0 1 0 1.5H4.25A.75.75 0 0 1 3.5 15.5v-2.75a.75.75 0 0 1 .75-.75Zm11.5 0a.75.75 0 0 1 .75.75v2.75a.75.75 0 0 1-.75.75H13a.75.75 0 0 1 0-1.5h.94l-1.22-1.22a.75.75 0 0 1 1.06-1.06L15 13.69v-.94a.75.75 0 0 1 .75-.75Z"></path>
    </svg>
  `;
}
function createWebviewNonce() {
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let nonce = "";
    for (let index = 0; index < 32; index += 1) {
        nonce += alphabet[Math.floor(Math.random() * alphabet.length)];
    }
    return nonce;
}
function buildWorkflowAuditHtml(workflow, state, typographyCssVars = "", cspSource = "") {
    const scriptNonce = createWebviewNonce();
    const cspMeta = cspSource.trim().length > 0
        ? `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${(0, htmlEscape_1.escapeHtmlAttr)(cspSource)} 'unsafe-inline'; script-src 'nonce-${scriptNonce}';">`
        : "";
    const auditRows = buildWorkflowAuditRowsHtml(workflow, state);
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  ${cspMeta}
  <style>
    :root {
      ${(0, webviewTypography_1.buildWebviewTypographyRootCss)(typographyCssVars)}
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
      grid-template-columns: 46px minmax(0, 1fr);
      gap: 10px;
      align-items: start;
      --audit-phase-start: #39d7d6;
      --audit-phase-end: #2564ff;
      --audit-phase-glow: rgba(28, 106, 255, 0.24);
      --audit-phase-border: rgba(28, 106, 255, 0.28);
      --audit-phase-wash: rgba(28, 106, 255, 0.12);
      padding: 14px 16px;
      border-radius: 16px;
      border: 1px solid var(--audit-phase-border);
      background:
        linear-gradient(90deg, var(--audit-phase-wash), transparent 28%),
        linear-gradient(180deg, rgba(255, 255, 255, 0.025), rgba(255, 255, 255, 0.01)),
        rgba(12, 18, 24, 0.92);
    }
    .audit-row__phase-icon {
      position: relative;
      width: 42px;
      height: 42px;
      border-radius: 14px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      color: #fff;
      background:
        linear-gradient(180deg, rgba(255, 255, 255, 0.32), rgba(255, 255, 255, 0.08) 24%, rgba(255, 255, 255, 0) 100%),
        linear-gradient(145deg, var(--audit-phase-start), var(--audit-phase-end));
      border: 1px solid rgba(255, 255, 255, 0.28);
      box-shadow:
        inset 0 1px 0 rgba(255, 255, 255, 0.24),
        inset 0 -7px 16px rgba(0, 0, 0, 0.16),
        0 12px 20px var(--audit-phase-glow);
      overflow: hidden;
    }
    .audit-row__phase-icon::before {
      content: "";
      position: absolute;
      inset: 0;
      background:
        radial-gradient(circle at 30% 18%, rgba(255, 255, 255, 0.34), transparent 36%),
        linear-gradient(180deg, rgba(255, 255, 255, 0.14), transparent 38%);
      pointer-events: none;
    }
    .audit-row__phase-icon svg {
      position: relative;
      z-index: 1;
      width: 23px;
      height: 23px;
      fill: currentColor;
      filter: drop-shadow(0 3px 6px rgba(0, 0, 0, 0.18));
    }
    .audit-row__content {
      min-width: 0;
    }
    .audit-row--capture {
      --audit-phase-start: #23d0c7;
      --audit-phase-end: #1987ff;
      --audit-phase-glow: rgba(28, 106, 255, 0.24);
      --audit-phase-border: rgba(28, 106, 255, 0.28);
      --audit-phase-wash: rgba(28, 106, 255, 0.12);
    }
    .audit-row--refinement {
      --audit-phase-start: #4de1d6;
      --audit-phase-end: #3978ff;
      --audit-phase-glow: rgba(38, 118, 255, 0.24);
      --audit-phase-border: rgba(38, 118, 255, 0.28);
      --audit-phase-wash: rgba(38, 118, 255, 0.12);
    }
    .audit-row--spec {
      --audit-phase-start: #47dfb6;
      --audit-phase-end: #12aa72;
      --audit-phase-glow: rgba(20, 150, 95, 0.22);
      --audit-phase-border: rgba(20, 150, 95, 0.28);
      --audit-phase-wash: rgba(20, 150, 95, 0.12);
    }
    .audit-row--technical-design {
      --audit-phase-start: #78c8ff;
      --audit-phase-end: #4562ff;
      --audit-phase-glow: rgba(52, 92, 255, 0.22);
      --audit-phase-border: rgba(52, 92, 255, 0.28);
      --audit-phase-wash: rgba(52, 92, 255, 0.12);
    }
    .audit-row--implementation {
      --audit-phase-start: #8e78ff;
      --audit-phase-end: #4568ff;
      --audit-phase-glow: rgba(72, 88, 255, 0.22);
      --audit-phase-border: rgba(72, 88, 255, 0.28);
      --audit-phase-wash: rgba(72, 88, 255, 0.12);
    }
    .audit-row--review {
      --audit-phase-start: #58b9ff;
      --audit-phase-end: #2462d9;
      --audit-phase-glow: rgba(36, 98, 217, 0.22);
      --audit-phase-border: rgba(36, 98, 217, 0.28);
      --audit-phase-wash: rgba(36, 98, 217, 0.12);
    }
    .audit-row--release-approval {
      --audit-phase-start: #4cdbb6;
      --audit-phase-end: #1aaf8d;
      --audit-phase-glow: rgba(20, 150, 95, 0.22);
      --audit-phase-border: rgba(20, 150, 95, 0.28);
      --audit-phase-wash: rgba(20, 150, 95, 0.12);
    }
    .audit-row--pr-preparation {
      --audit-phase-start: #73d6ff;
      --audit-phase-end: #2588f7;
      --audit-phase-glow: rgba(37, 136, 247, 0.22);
      --audit-phase-border: rgba(37, 136, 247, 0.28);
      --audit-phase-wash: rgba(37, 136, 247, 0.12);
    }
    .audit-row--completed {
      --audit-phase-start: #b578ff;
      --audit-phase-end: #6a47ff;
      --audit-phase-glow: rgba(96, 58, 182, 0.24);
      --audit-phase-border: rgba(96, 58, 182, 0.28);
      --audit-phase-wash: rgba(96, 58, 182, 0.12);
    }
    .audit-head {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      align-items: flex-start;
      flex-wrap: wrap;
      font-size: 0.82rem;
      color: rgba(255, 255, 255, 0.74);
    }
    .audit-head__title {
      padding-top: 6px;
    }
    .audit-head__meta {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      justify-content: flex-end;
    }
    .audit-body {
      font-size: 0.92rem;
      line-height: 1.5;
      white-space: pre-wrap;
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
  <div class="audit-stream" data-audit-stream>${auditRows}</div>
  <script nonce="${scriptNonce}">
    const auditStream = document.querySelector("[data-audit-stream]");
    const scrollAuditStreamToLatest = () => {
      if (!(auditStream instanceof HTMLElement)) {
        return;
      }

      auditStream.scrollTop = auditStream.scrollHeight;
    };

    window.requestAnimationFrame(() => scrollAuditStreamToLatest());
    window.setTimeout(() => scrollAuditStreamToLatest(), 60);
  </script>
</body>
</html>`;
}
function buildWorkflowHtml(workflow, state, playbackState, typographyCssVars = "", cspSource = "") {
    const scriptNonce = createWebviewNonce();
    const cspMeta = cspSource.trim().length > 0
        ? `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${(0, htmlEscape_1.escapeHtmlAttr)(cspSource)} data: blob:; style-src ${(0, htmlEscape_1.escapeHtmlAttr)(cspSource)} 'unsafe-inline'; script-src 'nonce-${scriptNonce}';">`
        : "";
    const effectiveExecutionPhaseId = resolveEffectiveExecutionPhaseId(workflow, state, playbackState);
    const pausedExecutionPhaseId = resolvePausedExecutionPhaseId(workflow, state, playbackState);
    const displayedCurrentPhaseId = resolveDisplayedCurrentPhaseId(workflow, state, effectiveExecutionPhaseId, pausedExecutionPhaseId, playbackState);
    const selectedPhaseId = playbackState === "playing"
        ? displayedCurrentPhaseId ?? state.selectedPhaseId
        : playbackState === "paused" && state.selectedPhaseId === workflow.currentPhase
            ? displayedCurrentPhaseId ?? state.selectedPhaseId
            : state.selectedPhaseId;
    const selectedPhase = workflow.phases.find((phase) => phase.phaseId === selectedPhaseId) ?? workflow.phases[0];
    const selectedPhaseIsCurrent = selectedPhase.phaseId === displayedCurrentPhaseId;
    const isRefinementDetail = selectedPhase.phaseId === "refinement" && workflow.refinement !== null;
    const phaseGraph = buildPhaseGraph(workflow, state, selectedPhase.phaseId, playbackState, effectiveExecutionPhaseId);
    const graphStageDesktopHorizontalLegendPosition = (0, graphLayout_1.buildGraphLegendPosition)(state.workflowGraphLayout?.legend?.horizontal?.x ?? 28, state.workflowGraphLayout?.legend?.horizontal?.y ?? 748, false);
    const graphStageDesktopVerticalLegendPosition = (0, graphLayout_1.buildGraphLegendPosition)(state.workflowGraphLayout?.legend?.vertical?.x ?? 28, state.workflowGraphLayout?.legend?.vertical?.y ?? 1402, false);
    const graphStageMobileHorizontalLegendPosition = (0, graphLayout_1.buildGraphLegendPosition)(state.workflowGraphLayout?.legend?.horizontal?.x ?? 28, state.workflowGraphLayout?.legend?.horizontal?.y ?? 748, true);
    const graphStageMobileVerticalLegendPosition = (0, graphLayout_1.buildGraphLegendPosition)(state.workflowGraphLayout?.legend?.vertical?.x ?? 28, state.workflowGraphLayout?.legend?.vertical?.y ?? 1402, true);
    const graphStageLegendStyle = `--graph-legend-left-desktop-horizontal: ${graphStageDesktopHorizontalLegendPosition.left}px; --graph-legend-top-desktop-horizontal: ${graphStageDesktopHorizontalLegendPosition.top}px; --graph-legend-left-desktop-vertical: ${graphStageDesktopVerticalLegendPosition.left}px; --graph-legend-top-desktop-vertical: ${graphStageDesktopVerticalLegendPosition.top}px; --graph-legend-left-mobile-horizontal: ${graphStageMobileHorizontalLegendPosition.left}px; --graph-legend-top-mobile-horizontal: ${graphStageMobileHorizontalLegendPosition.top}px; --graph-legend-left-mobile-vertical: ${graphStageMobileVerticalLegendPosition.left}px; --graph-legend-top-mobile-vertical: ${graphStageMobileVerticalLegendPosition.top}px;`;
    const executionOverlay = buildExecutionOverlay(workflow, state, playbackState);
    const selectedPhaseVisualTone = resolvePhaseVisualTone(workflow.status, workflow, playbackState, selectedPhase, false, playbackState === "playing" ? effectiveExecutionPhaseId : null, pausedExecutionPhaseId, new Set(state.completedPhaseIds ?? []));
    const selectedPhaseDisplayState = phaseToneLabel(selectedPhaseVisualTone, selectedPhase.state, playbackState, selectedPhase.isCurrent);
    const displayedPhaseId = playbackState === "playing" && effectiveExecutionPhaseId
        ? effectiveExecutionPhaseId
        : playbackState === "paused" && pausedExecutionPhaseId
            ? pausedExecutionPhaseId
            : workflow.currentPhase;
    const implementationReviewLimitReached = workflow.currentPhase === "implementation"
        && (0, workflowAutomation_1.hasReachedImplementationReviewCycleLimit)(workflow, state.maxImplementationReviewCycles);
    const implementationReviewLimitBanner = implementationReviewLimitReached
        ? `
      <div class="settings-warning settings-warning--attention" role="status">
        <div class="settings-warning__icon">!</div>
        <div>
          <p class="eyebrow warning">Implementation Loop Paused</p>
          <p class="warning-copy">Automatic review is stopped because the implementation/review loop reached the configured limit (${(0, htmlEscape_1.escapeHtml)(String(state.maxImplementationReviewCycles ?? "?"))}). The workflow remains at implementation. Use the manual action below if you want one extra review pass.</p>
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
        ? (0, markdownRenderer_1.renderMarkdownToHtml)(state.selectedArtifactContent ?? "Artifact content unavailable.")
        : null;
    const artifactQuestionBlock = (0, artifactQuestions_1.extractArtifactQuestionBlock)(state.selectedArtifactContent);
    const specApprovalQuestions = selectedPhase.phaseId === "spec"
        ? (workflow.approvalQuestions ?? []).map((item) => ({
            index: item.index,
            question: item.question,
            answer: item.answer,
            resolved: item.isResolved,
            answeredBy: item.answeredBy,
            answeredAtUtc: item.answeredAtUtc
        }))
        : [];
    const unresolvedApprovalQuestionCount = specApprovalQuestions.filter((item) => !item.resolved).length;
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
    const selectedPhaseUsageAggregate = sumTokenUsage(selectedPhaseMetricEvents
        .map((event) => event.usage)
        .filter((usage) => Boolean(usage)));
    const selectedPhaseDurationAggregate = selectedPhaseMetricEvents.reduce((aggregate, event) => aggregate + (event.durationMs ?? 0), 0);
    const selectedPhaseIterationCount = selectedPhaseMetricEvents.length;
    const selectedPhaseRecordedIterationCount = phaseIterations.length;
    const selectedPhaseExecutionLabel = buildAssignedPhaseExecutionLabel(selectedPhase, state)
        ?? findLatestPhaseExecutionLabel(workflow, selectedPhase.phaseId, state);
    const hasTokenTelemetry = selectedPhaseMetricEvents.some((event) => event.usage);
    const completedWorkflowLocked = workflow.status === "completed" && state.completedUsLockOnCompleted !== false;
    const pullRequestUrl = workflow.pullRequest?.url?.trim() || null;
    const pullRequestLabel = workflow.pullRequest?.number
        ? `View PR #${workflow.pullRequest.number}`
        : "View PR";
    const pendingRewindPhaseId = state.pendingRewindPhaseId?.trim() || null;
    const rewindDecision = !completedWorkflowLocked && playbackState === "idle"
        ? (0, workflowRewind_1.resolveTimelineRewindDecision)(workflow, displayedCurrentPhaseId)
        : { allowed: false, targetPhaseId: null, reasonCode: "no-history", reasonMessage: null };
    const heroRewindTargetPhaseId = rewindDecision.targetPhaseId;
    const heroRewindDisabled = !rewindDecision.allowed || playbackState !== "idle";
    const timelineRewindPoints = (0, workflowRewind_1.buildTimelineRewindPoints)(workflow, displayedCurrentPhaseId);
    const timelineLoopGroups = buildTimelineLoopGroups(timelineRewindPoints, selectedPhase.phaseId);
    const timelineRewindDock = state.visualTimelineEnabled === true && timelineRewindPoints.length > 1
        ? `
      <div class="time-dock" aria-label="Workflow time navigation">
        <button class="time-dock__scroll" type="button" data-time-dock-scroll="left" aria-label="Move timeline left">&lt;</button>
        <div class="time-dock__viewport" data-time-dock-viewport>
          <div class="time-dock__track">
            ${timelineLoopGroups.map((group) => `
              <div
                class="time-dock__loop-group${group.isSelected ? " time-dock__loop-group--selected" : ""}"
                style="--loop-start-index: ${group.startIndex}; --loop-span: ${group.endIndex - group.startIndex + 1};"
                aria-hidden="true">
                <span class="time-dock__loop-label">Loop x${(0, htmlEscape_1.escapeHtml)(String(group.iterationCount))}</span>
              </div>
            `).join("")}
            ${timelineRewindPoints.map((point, index) => `
              <button
                class="time-dock__point${point.isCurrent ? " time-dock__point--current" : ""}${point.canSelect ? "" : " time-dock__point--disabled"}"
                type="button"
                ${point.canSelect ? `data-command="rewind" data-phase-id="${(0, htmlEscape_1.escapeHtmlAttr)(point.phaseId)}" data-iteration-key="${(0, htmlEscape_1.escapeHtmlAttr)(point.iterationKey ?? "")}"` : ""}
                data-time-dock-point
                data-time-dock-index="${index}"
                title="${(0, htmlEscape_1.escapeHtmlAttr)(buildTimelinePointTooltip(workflow, point))}"
                aria-label="${(0, htmlEscape_1.escapeHtmlAttr)(point.canSelect ? `Move workflow view to ${point.label}` : buildTimelinePointTooltip(workflow, point))}"
                aria-disabled="${point.canSelect ? "false" : "true"}">
                <span class="time-dock__orb" aria-hidden="true">${(0, icons_1.workflowPhaseIcon)(point.phaseId)}</span>
                <span class="time-dock__label">${(0, htmlEscape_1.escapeHtml)(point.label)}</span>
                ${point.timestampUtc ? `<span class="time-dock__time">${(0, htmlEscape_1.escapeHtml)(formatTimelinePointTime(point.timestampUtc))}</span>` : ""}
              </button>
            `).join("")}
          </div>
        </div>
        <button class="time-dock__scroll" type="button" data-time-dock-scroll="right" aria-label="Move timeline right">&gt;</button>
      </div>
    `
        : "";
    const rewindBlockedToken = rewindDecision.reasonMessage && !pendingRewindPhaseId
        ? `<span class="token token--attention" title="${(0, htmlEscape_1.escapeHtmlAttr)(rewindDecision.reasonMessage)}">rewind blocked</span>`
        : "";
    const phaseSpecificSections = buildPhaseSpecificSections(workflow, selectedPhase, state, artifactPreviewHtml, artifactQuestionBlock, specApprovalQuestions, unresolvedApprovalQuestionCount);
    const rejectPlan = selectedPhaseIsCurrent && selectedPhase.requiresApproval
        ? (0, workflowRejectPlan_1.resolveWorkflowRejectPlan)(selectedPhase.phaseId)
        : null;
    const selectedPhaseStateClass = heroTokenClass(selectedPhaseDisplayState);
    const completedPhaseTopSections = selectedPhase.phaseId === "completed"
        ? phaseSpecificSections.beforeArtifact.join("")
        : "";
    const regularBeforeArtifactSections = selectedPhase.phaseId === "completed"
        ? ""
        : phaseSpecificSections.beforeArtifact.join("");
    const continueActionLabel = "Continue";
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
        ${selectedPhaseIsCurrent && workflow.controls.canContinue
            ? `<button class="workflow-action-button workflow-action-button--progress" data-command="continue"${playDisabled ? " disabled" : ""}>${continueActionLabel}</button>`
            : ""}
        ${shouldRenderRerunReviewAction
            ? `<button class="workflow-action-button workflow-action-button--progress" data-command="continue"${rerunReviewDisabled ? " disabled" : ""}>${rerunReviewActionLabel}</button>`
            : ""}
        ${shouldRenderApproveAction
            ? `<button class="workflow-action-button workflow-action-button--approve" data-command="approve" data-approve-button data-pending-approval-count="${unresolvedApprovalQuestionCount}"${!workflow.controls.canApprove || shouldRenderApprovalBranchEditor(workflow, selectedPhase, selectedPhaseIsCurrent) && Boolean(state.requireExplicitApprovalBranchAcceptance) ? " disabled" : ""}>${approveActionLabel}</button>`
            : ""}
        ${rejectPlan ? `<button class="workflow-action-button workflow-action-button--danger" type="button" data-open-reject-modal data-reject-target-phase="${(0, htmlEscape_1.escapeHtmlAttr)(rejectPlan.targetPhaseId)}" data-reject-mode="${(0, htmlEscape_1.escapeHtmlAttr)(rejectPlan.mode)}" data-reject-title="${(0, htmlEscape_1.escapeHtmlAttr)(rejectPlan.modalTitle)}" data-reject-prompt="${(0, htmlEscape_1.escapeHtmlAttr)(rejectPlan.modalPrompt)}" data-reject-helper="${(0, htmlEscape_1.escapeHtmlAttr)(rejectPlan.helperText)}" data-reject-confirm-label="${(0, htmlEscape_1.escapeHtmlAttr)(rejectPlan.confirmLabel)}">Reject</button>` : ""}
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
        <span class="phase-duration-pill__value">${(0, htmlEscape_1.escapeHtml)(selectedPhaseDurationAggregate > 0 ? formatDuration(selectedPhaseDurationAggregate) : "n/a")}</span>
      </div>
    </div>
  `;
    const touchSummary = renderTokenSummaryCard("Touches", [
        renderTokenSummaryRow("Total", String(selectedPhaseTouches.total)),
        renderTokenSummaryRow("Generated", String(selectedPhaseTouches.generated)),
        renderTokenSummaryRow("Operated", String(selectedPhaseTouches.operated)),
        renderTokenSummaryRow("Started", String(selectedPhaseTouches.started)),
        renderTokenSummaryRow("Rewinds Here", String(selectedPhaseTouches.rewound)),
        renderTokenSummaryRow("Regressions Here", String(selectedPhaseTouches.regressed))
    ], {
        modifierClass: "token-summary--touches"
    });
    const tokenSummaryRows = [
        renderTokenSummaryRow("Input / Output", hasTokenTelemetry
            ? `${formatMetricNumber(selectedPhaseUsageAggregate.inputTokens)} / ${formatMetricNumber(selectedPhaseUsageAggregate.outputTokens)}`
            : "n/a"),
        renderTokenSummaryRow("Total", hasTokenTelemetry
            ? formatMetricNumber(selectedPhaseUsageAggregate.totalTokens)
            : "n/a"),
        renderTokenSummaryRow("Model", selectedPhaseExecutionLabel ?? "n/a"),
        renderTokenSummaryRow("Iterations", String(selectedPhaseRecordedIterationCount))
    ];
    if (hasTokenTelemetry && selectedPhaseDurationAggregate > 0) {
        tokenSummaryRows.push(renderTokenSummaryRow("Response Speed", formatTokensPerSecond(selectedPhaseUsageAggregate.outputTokens, selectedPhaseDurationAggregate)));
    }
    const tokenSummary = renderTokenSummaryCard("Tokens", tokenSummaryRows, {
        modifierClass: "token-summary--wide"
    });
    const selectedPhaseMetrics = `${durationMetric}${touchSummary}${tokenSummary}`;
    const showCompletedOnlyUsagePanels = selectedPhase.phaseId === "completed";
    const workflowUsageDashboard = showCompletedOnlyUsagePanels ? `
    <section class="detail-card detail-card--workflow-dashboard">
      <div class="detail-card__header">
        <div>
          <h3>Workflow Dashboard</h3>
          <p class="panel-copy">Global usage across the full user story lifecycle, not only the selected phase.</p>
        </div>
      </div>
      <div class="token-summary-grid token-summary-grid--workflow">
        ${renderTokenSummaryCard("Totals", [
        renderTokenSummaryRow("Input / Output", `${formatMetricNumber(workflowUsage.overall.inputTokens)} / ${formatMetricNumber(workflowUsage.overall.outputTokens)}`),
        renderTokenSummaryRow("Total Tokens", formatMetricNumber(workflowUsage.overall.totalTokens)),
        renderTokenSummaryRow("Recorded Runs", String(workflowUsage.overall.events)),
        renderTokenSummaryRow("Duration", workflowUsage.overall.durationMs > 0 ? formatDuration(workflowUsage.overall.durationMs) : "n/a"),
        renderTokenSummaryRow("Response Speed", workflowUsage.overall.durationMs > 0 ? formatTokensPerSecond(workflowUsage.overall.outputTokens, workflowUsage.overall.durationMs) : "n/a")
    ])}
        ${renderTokenSummaryCard("Timeline", [
        renderTokenSummaryRow("Events", String(workflow.events.length)),
        renderTokenSummaryRow("Iterations", String(workflow.phaseIterations?.length ?? 0)),
        renderTokenSummaryRow("Started", formatUtcTimestamp(workflow.events[0]?.timestampUtc ?? null)),
        renderTokenSummaryRow("Last Event", formatUtcTimestamp(workflow.events[workflow.events.length - 1]?.timestampUtc ?? null)),
        renderTokenSummaryRow("Current Phase", (workflow.phases.find((phase) => phase.isCurrent) ?? selectedPhase).title)
    ])}
      </div>
    </section>
  ` : "";
    const modelUsageTable = showCompletedOnlyUsagePanels
        ? renderUsageDashboardTable("Usage by Model", ["Model", "Runs", "Input", "Output", "Total", "Duration"], workflowUsage.byModel.length > 0
            ? workflowUsage.byModel.map(({ label, aggregate }) => ([
                label,
                String(aggregate.events),
                formatMetricNumber(aggregate.inputTokens),
                formatMetricNumber(aggregate.outputTokens),
                formatMetricNumber(aggregate.totalTokens),
                aggregate.durationMs > 0 ? formatDuration(aggregate.durationMs) : "n/a"
            ]))
            : [["No recorded model usage yet.", "-", "-", "-", "-", "-"]])
        : "";
    const phaseUsageTable = showCompletedOnlyUsagePanels
        ? renderUsageDashboardTable("Usage by Phase", ["Phase", "Runs", "Input", "Output", "Total", "Duration"], workflowUsage.byPhase.length > 0
            ? workflowUsage.byPhase.map(({ phaseId, aggregate }) => ([
                phaseId,
                String(aggregate.events),
                formatMetricNumber(aggregate.inputTokens),
                formatMetricNumber(aggregate.outputTokens),
                formatMetricNumber(aggregate.totalTokens),
                aggregate.durationMs > 0 ? formatDuration(aggregate.durationMs) : "n/a"
            ]))
            : [["No recorded phase usage yet.", "-", "-", "-", "-", "-"]])
        : "";
    const latestIteration = phaseIterations[0] ?? null;
    const iterationRail = phaseIterations.length > 0
        ? `
      <section class="detail-card detail-card--phase-iterations" data-iteration-rail-section data-phase-id="${(0, htmlEscape_1.escapeHtmlAttr)(selectedPhase.phaseId)}">
        <div class="detail-card__header detail-card__header--iterations">
          <div>
            <h3>Phase Iterations</h3>
            <p
              class="panel-copy"
              data-iteration-rail-copy
              data-copy-expanded="Newest first. Select any iteration to inspect its readonly artifact, metrics, and recorded context."
              data-copy-collapsed="Collapsed by default. The latest iteration stays selected until you expand the full history.">${isIterationRailExpanded
            ? "Newest first. Select any iteration to inspect its readonly artifact, metrics, and recorded context."
            : "Collapsed by default. The latest iteration stays selected until you expand the full history."}</p>
          </div>
          <button
            type="button"
            class="iteration-rail-toggle"
            data-command="togglePhaseIterations"
            data-phase-id="${(0, htmlEscape_1.escapeHtmlAttr)(selectedPhase.phaseId)}"
            data-iteration-rail-toggle
            aria-label="${isIterationRailExpanded ? "Collapse phase iterations" : "Expand phase iterations"}"
            title="${isIterationRailExpanded ? "Collapse phase iterations" : "Expand phase iterations"}"
            aria-expanded="${isIterationRailExpanded ? "true" : "false"}">
            ${renderChevronIcon(`iteration-rail-toggle__icon${isIterationRailExpanded ? " iteration-rail-toggle__icon--expanded" : ""}`)}
          </button>
        </div>
        <div class="iteration-rail${isIterationRailExpanded ? " iteration-rail--expanded" : " iteration-rail--collapsed"}">
          <span class="iteration-rail__line" aria-hidden="true"></span>
          ${phaseIterations.map((iteration, index) => `
            <button
              type="button"
              class="iteration-rail__item${selectedIteration?.iterationKey === iteration.iterationKey ? " iteration-rail__item--selected" : ""}${index === 0 ? " iteration-rail__item--latest" : ""}"
              data-command="selectIteration"
              data-iteration-key="${(0, htmlEscape_1.escapeHtmlAttr)(iteration.iterationKey)}"
              data-is-latest-iteration="${index === 0 ? "true" : "false"}">
              <span class="iteration-rail__stem" aria-hidden="true"></span>
              <span class="iteration-rail__body">
                <span class="iteration-rail__title">Iteration ${iteration.attempt} · ${(0, htmlEscape_1.escapeHtml)(formatUtcTimestamp(iteration.timestampUtc))}</span>
                <span class="iteration-rail__meta">
                  ${(0, htmlEscape_1.escapeHtml)(iteration.code)}
                  ${iteration.actor ? ` · ${(0, htmlEscape_1.escapeHtml)(iteration.actor)}` : ""}
                  ${formatExecutionLabel(iteration.execution, {
            actor: iteration.actor,
            configuredModel: findConfiguredModelForProfile(state, iteration.execution?.profileName)
        }) ? ` · ${(0, htmlEscape_1.escapeHtml)(formatExecutionLabel(iteration.execution, {
            actor: iteration.actor,
            configuredModel: findConfiguredModelForProfile(state, iteration.execution?.profileName)
        }) ?? "")}` : ""}
                  ${iteration.usage ? ` · ${(0, htmlEscape_1.escapeHtml)(`${formatMetricNumber(iteration.usage.inputTokens)}/${formatMetricNumber(iteration.usage.outputTokens)} tok`)}` : ""}
                  ${iteration.durationMs !== null ? ` · ${(0, htmlEscape_1.escapeHtml)(formatDuration(iteration.durationMs))}` : ""}
                </span>
                ${iteration.summary ? `<span class="iteration-rail__summary">${(0, htmlEscape_1.escapeHtml)(iteration.summary)}</span>` : ""}
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
          <span class="badge">iteration ${(0, htmlEscape_1.escapeHtml)(String(selectedIteration.attempt))}</span>
          <span class="badge">${(0, htmlEscape_1.escapeHtml)(selectedIteration.code)}</span>
          <span class="badge">${(0, htmlEscape_1.escapeHtml)(formatUtcTimestamp(selectedIteration.timestampUtc))}</span>
          ${selectedIteration.actor ? `<span class="badge">${(0, htmlEscape_1.escapeHtml)(selectedIteration.actor)}</span>` : ""}
          ${formatExecutionLabel(selectedIteration.execution, {
            actor: selectedIteration.actor,
            configuredModel: findConfiguredModelForProfile(state, selectedIteration.execution?.profileName)
        }) ? `<span class="badge">model ${(0, htmlEscape_1.escapeHtml)(formatExecutionLabel(selectedIteration.execution, {
            actor: selectedIteration.actor,
            configuredModel: findConfiguredModelForProfile(state, selectedIteration.execution?.profileName)
        }) ?? "")}</span>` : ""}
          ${selectedIteration.usage ? `<span class="badge">in/out ${(0, htmlEscape_1.escapeHtml)(`${formatMetricNumber(selectedIteration.usage.inputTokens)}/${formatMetricNumber(selectedIteration.usage.outputTokens)}`)}</span>` : ""}
          ${selectedIteration.usage ? `<span class="badge">total ${(0, htmlEscape_1.escapeHtml)(formatMetricNumber(selectedIteration.usage.totalTokens))}</span>` : ""}
          ${selectedIteration.durationMs !== null ? `<span class="badge">${(0, htmlEscape_1.escapeHtml)(formatDuration(selectedIteration.durationMs))}</span>` : ""}
          ${selectedIteration.usage && selectedIteration.durationMs !== null ? `<span class="badge">${(0, htmlEscape_1.escapeHtml)(formatTokensPerSecond(selectedIteration.usage.outputTokens, selectedIteration.durationMs))}</span>` : ""}
        </div>
        ${selectedIteration.summary ? `<p class="panel-copy">${(0, htmlEscape_1.escapeHtml)(selectedIteration.summary)}</p>` : ""}
        ${selectedIteration.operationPrompt ? `<pre class="artifact-preview artifact-preview--raw-artifact">${(0, htmlEscape_1.escapeHtml)(selectedIteration.operationPrompt)}</pre>` : ""}
        <div class="iteration-lineage-grid">
          <div class="iteration-lineage-card">
            <h4>Input Artifact</h4>
            <p class="muted">${selectedIteration.inputArtifactPath ? (0, htmlEscape_1.escapeHtml)(fileNameFromPath(selectedIteration.inputArtifactPath)) : "No explicit input artifact recorded for this iteration."}</p>
            ${selectedIteration.inputArtifactPath
            ? `<div class="detail-actions"><button class="workflow-action-button workflow-action-button--document" data-command="openArtifact" data-path="${(0, htmlEscape_1.escapeHtmlAttr)(selectedIteration.inputArtifactPath)}">Open Input</button></div>`
            : ""}
          </div>
          <div class="iteration-lineage-card">
            <h4>Output Artifact</h4>
            <p class="muted">${(0, htmlEscape_1.escapeHtml)(fileNameFromPath(selectedIteration.outputArtifactPath))}</p>
            <div class="detail-actions">
              <button class="workflow-action-button workflow-action-button--document" data-command="openArtifact" data-path="${(0, htmlEscape_1.escapeHtmlAttr)(selectedIteration.outputArtifactPath)}">Open Output</button>
              ${selectedIteration.operationLogPath ? `<button class="workflow-action-button workflow-action-button--document" data-command="openArtifact" data-path="${(0, htmlEscape_1.escapeHtmlAttr)(selectedIteration.operationLogPath)}">Open Operation Log</button>` : ""}
            </div>
          </div>
        </div>
        ${selectedIteration.contextArtifactPaths.length > 0
            ? `<div class="iteration-context-list">
              <h4>Context Artifacts</h4>
              ${buildArtifactCollectionSection(state.selectedIterationContextArtifacts ?? [], {
                emptyMessage: "The selected iteration recorded context artifact paths, but their contents could not be loaded."
            })}
            </div>`
            : ""}
      </section>
    `
        : "";
    const artifactSection = selectedPhase.artifactPath
        ? isRefinementDetail
            ? buildArtifactPreviewSection(selectedIteration?.outputArtifactPath ?? selectedPhase.artifactPath, artifactPreviewHtml, state.selectedArtifactContent ?? "Artifact content unavailable.", {
                rawArtifact: true,
                footerNote: "The raw artifact stays visible here to preserve model context beyond the structured refinement questions below."
            })
            : buildArtifactPreviewSection(selectedIteration?.outputArtifactPath ?? selectedPhase.artifactPath, artifactPreviewHtml, state.selectedArtifactContent ?? "Artifact content unavailable.")
        : "<p class=\"muted\">No artifact is persisted for this phase.</p>";
    const promptButtons = [
        selectedPhase.executePromptPath
            ? `<button class="workflow-action-button workflow-action-button--document" data-command="openPrompt" data-path="${(0, htmlEscape_1.escapeHtmlAttr)(selectedPhase.executePromptPath)}">Open Execute Prompt</button>`
            : "",
        selectedPhase.executeSystemPromptPath
            ? `<button class="workflow-action-button workflow-action-button--document" data-command="openPrompt" data-path="${(0, htmlEscape_1.escapeHtmlAttr)(selectedPhase.executeSystemPromptPath)}">Open Execute System Prompt</button>`
            : "",
        selectedPhase.approvePromptPath
            ? `<button class="workflow-action-button workflow-action-button--document" data-command="openPrompt" data-path="${(0, htmlEscape_1.escapeHtmlAttr)(selectedPhase.approvePromptPath)}">Open Approve Prompt</button>`
            : "",
        selectedPhase.approveSystemPromptPath
            ? `<button class="workflow-action-button workflow-action-button--document" data-command="openPrompt" data-path="${(0, htmlEscape_1.escapeHtmlAttr)(selectedPhase.approveSystemPromptPath)}">Open Approve System Prompt</button>`
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
        <p>The main source file and refinement history for this workflow.</p>
      </div>
      <div class="attachment-list">
        <div class="file-item">
          <button class="attachment-item" data-command="openArtifact" data-path="${(0, htmlEscape_1.escapeHtmlAttr)(workflow.mainArtifactPath)}">
            <strong>${(0, htmlEscape_1.escapeHtml)(fileNameFromPath(workflow.mainArtifactPath))}</strong>
            <span>${(0, htmlEscape_1.escapeHtml)(workflow.mainArtifactPath)}</span>
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
                  <button class="attachment-item" draggable="true" data-file-path="${(0, htmlEscape_1.escapeHtmlAttr)(attachment.path)}" data-file-kind="context" data-command="openAttachment" data-path="${(0, htmlEscape_1.escapeHtmlAttr)(attachment.path)}">
                    <strong>${(0, htmlEscape_1.escapeHtml)(attachment.name)}</strong>
                    <span>${(0, htmlEscape_1.escapeHtml)(attachment.path)}</span>
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
                  <button class="attachment-item" draggable="true" data-file-path="${(0, htmlEscape_1.escapeHtmlAttr)(attachment.path)}" data-file-kind="attachment" data-command="openAttachment" data-path="${(0, htmlEscape_1.escapeHtmlAttr)(attachment.path)}">
                    <strong>${(0, htmlEscape_1.escapeHtml)(attachment.name)}</strong>
                    <span>${(0, htmlEscape_1.escapeHtml)(attachment.path)}</span>
                  </button>
                </div>
              `).join("")}
            </div>`
        : "<p class=\"muted\">No user story files are attached yet.</p>"}
      </section>
    </div>
  `;
    const playbackButtons = `
    <button class="icon-button icon-button--document" data-command="rewind" data-hero-rewind-button aria-label="${heroRewindTargetPhaseId ? `Rewind workflow pointer to ${heroRewindTargetPhaseId}` : "Rewind workflow pointer"}"${heroRewindDisabled ? " disabled" : ""}>
      ${(0, icons_1.rewindIcon)()}
    </button>
    <button class="icon-button ${playWarnsAboutImplementationLimit ? "icon-button--attention" : "icon-button--primary"}${shouldPulsePlay ? " icon-button--pulse" : ""}" data-command="play" aria-label="${playWarnsAboutImplementationLimit ? "Play workflow with implementation loop limit warning" : "Play workflow"}"${playDisabled ? " disabled" : ""}>
      ${(0, icons_1.playIcon)()}
    </button>
    <button class="icon-button" data-command="pause" aria-label="Pause workflow"${playbackState !== "playing" ? " disabled" : ""}>
      ${(0, icons_1.pauseIcon)()}
    </button>
    <button class="icon-button icon-button--danger" data-command="stop" aria-label="Stop workflow"${playbackState === "playing" || playbackState === "stopping" ? "" : " disabled"}>
      ${(0, icons_1.stopIcon)()}
    </button>
  `;
    const selectedPhaseOverview = `
            <details class="detail-card detail-card--phase-overview detail-card--collapsible" open>
            <summary class="detail-card__summary detail-card__summary--phase-overview">
              <div class="detail-card__header detail-card__header--phase-overview">
                <h2>${(0, htmlEscape_1.escapeHtml)(selectedPhase.title)}</h2>
                <span class="iteration-rail-toggle detail-card__summary-toggle" aria-hidden="true">
                  ${renderChevronIcon("iteration-rail-toggle__icon detail-card__summary-toggle-icon")}
                </span>
              </div>
              <div class="detail-meta">
                <span class="token">${(0, htmlEscape_1.escapeHtml)(phaseSecondaryLabel(selectedPhase))}</span>
                ${phaseOutputFormatToken(selectedPhase.phaseId)}
                <span class="token${selectedPhaseStateClass}">${(0, htmlEscape_1.escapeHtml)(selectedPhaseDisplayState)}</span>
                ${selectedPhase.requiresApproval ? `<span class="token token--attention">approval required</span>` : ""}
                ${selectedPhase.isApproved ? `<span class="token token--success">approved</span>` : ""}
              </div>
            </summary>
            <div class="detail-card__body detail-card__body--phase-overview">
              ${selectedPhaseMetrics ? `<div class="detail-metrics">${selectedPhaseMetrics}</div>` : ""}
            </div>
            </details>
  `;
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  ${cspMeta}
  <style>
    :root {
      ${(0, webviewTypography_1.buildWebviewTypographyRootCss)(typographyCssVars)}
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
      grid-template-rows: auto minmax(0, 1fr) auto;
      height: 100vh;
      padding: 18px;
      gap: 18px;
      overflow: hidden;
    }
    .shell.shell--interaction-locked {
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
    .token-summary-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
      gap: 18px;
      align-items: start;
    }
    .token-summary-grid--workflow {
      margin-top: 14px;
      gap: 20px;
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
    .token.token--output-format {
      font-weight: 700;
      letter-spacing: 0.02em;
    }
    .token.token--output-format-markdown {
      background: rgba(92, 181, 255, 0.14);
      color: #9cd7ff;
      border-color: rgba(92, 181, 255, 0.28);
    }
    .token.token--output-format-json {
      background: rgba(179, 132, 255, 0.16);
      color: #d6c0ff;
      border-color: rgba(179, 132, 255, 0.3);
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
    .time-dock {
      display: grid;
      grid-template-columns: 42px minmax(0, 1fr) 42px;
      align-items: end;
      gap: 10px;
      min-height: 118px;
      padding: 12px 14px 14px;
      border: 1px solid rgba(114, 241, 184, 0.18);
      border-radius: 26px;
      background:
        radial-gradient(circle at 50% 0%, rgba(114, 241, 184, 0.14), transparent 34%),
        linear-gradient(180deg, rgba(12, 20, 26, 0.84), rgba(5, 10, 16, 0.94));
      box-shadow: 0 -10px 36px rgba(0, 0, 0, 0.28);
      backdrop-filter: blur(18px);
    }
    .time-dock__viewport {
      overflow-x: auto;
      overflow-y: visible;
      padding: 20px 12px 8px;
      scrollbar-width: thin;
      overscroll-behavior-x: contain;
    }
    .time-dock__track {
      --time-dock-point-width: 72px;
      --time-dock-point-gap: 12px;
      display: flex;
      position: relative;
      align-items: end;
      gap: 12px;
      min-width: max-content;
      min-height: 112px;
      padding-top: 28px;
    }
    .time-dock__loop-group {
      position: absolute;
      left: calc((var(--time-dock-point-width) + var(--time-dock-point-gap)) * var(--loop-start-index));
      bottom: 0;
      width: calc((var(--time-dock-point-width) * var(--loop-span)) + (var(--time-dock-point-gap) * (var(--loop-span) - 1)));
      height: 88px;
      border-radius: 22px;
      border: 1px solid rgba(114, 241, 184, 0.26);
      background:
        linear-gradient(180deg, rgba(25, 70, 52, 0.18), rgba(10, 24, 20, 0.12)),
        rgba(8, 16, 18, 0.18);
      box-shadow:
        inset 0 1px 0 rgba(196, 255, 226, 0.06),
        0 10px 24px rgba(6, 16, 13, 0.24);
      pointer-events: none;
      z-index: 0;
    }
    .time-dock__loop-group--selected {
      border-color: rgba(114, 241, 184, 0.42);
      background:
        linear-gradient(180deg, rgba(31, 92, 67, 0.22), rgba(10, 28, 22, 0.16)),
        rgba(8, 16, 18, 0.22);
      box-shadow:
        inset 0 1px 0 rgba(196, 255, 226, 0.08),
        0 12px 28px rgba(8, 26, 19, 0.28),
        0 0 22px rgba(114, 241, 184, 0.08);
    }
    .time-dock__loop-label {
      position: absolute;
      top: -12px;
      left: 50%;
      transform: translateX(-50%);
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 4px 10px;
      border-radius: 999px;
      border: 1px solid rgba(114, 241, 184, 0.26);
      background: rgba(8, 20, 17, 0.94);
      color: rgba(150, 250, 198, 0.96);
      font-size: 0.69rem;
      font-weight: 800;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }
    .time-dock__point {
      width: 72px;
      min-height: 70px;
      display: grid;
      justify-items: center;
      align-content: end;
      gap: 4px;
      padding: 0 4px 4px;
      border: 0;
      background: transparent;
      color: rgba(226, 244, 239, 0.86);
      cursor: pointer;
      transition: opacity 150ms ease, color 150ms ease;
      position: relative;
      z-index: 1;
    }
    .time-dock__point:hover {
      color: #f2fff8;
      z-index: 3;
    }
    .time-dock__point--current {
      color: #ffe08a;
    }
    .time-dock__point--disabled {
      cursor: default;
      opacity: 0.62;
    }
    .time-dock__orb {
      width: 46px;
      height: 46px;
      display: grid;
      place-items: center;
      border-radius: 15px;
      border: 1px solid rgba(114, 241, 184, 0.22);
      background:
        linear-gradient(180deg, rgba(114, 241, 184, 0.18), rgba(12, 31, 30, 0.94)),
        rgba(8, 16, 22, 0.92);
      box-shadow: 0 10px 24px rgba(0, 0, 0, 0.32);
      font-size: 0.76rem;
      font-weight: 900;
      letter-spacing: -0.04em;
      transition: border-color 150ms ease, background 150ms ease, box-shadow 150ms ease, color 150ms ease;
    }
    .time-dock__orb svg {
      width: 22px;
      height: 22px;
      fill: currentColor;
    }
    .time-dock__point--current .time-dock__orb {
      border-color: rgba(255, 213, 90, 0.52);
      background: linear-gradient(180deg, rgba(255, 213, 90, 0.24), rgba(55, 42, 14, 0.96));
      box-shadow: 0 12px 30px rgba(255, 213, 90, 0.14);
    }
    .time-dock__point:hover .time-dock__orb {
      border-color: rgba(114, 241, 184, 0.48);
      background:
        linear-gradient(180deg, rgba(114, 241, 184, 0.28), rgba(14, 38, 33, 0.96)),
        rgba(8, 16, 22, 0.92);
      box-shadow:
        0 10px 24px rgba(0, 0, 0, 0.32),
        0 0 0 1px rgba(177, 255, 224, 0.08),
        0 0 22px rgba(114, 241, 184, 0.14);
    }
    .time-dock__point--current:hover .time-dock__orb {
      border-color: rgba(255, 223, 116, 0.72);
      background: linear-gradient(180deg, rgba(255, 213, 90, 0.34), rgba(64, 48, 16, 0.98));
      box-shadow:
        0 12px 30px rgba(255, 213, 90, 0.16),
        0 0 0 1px rgba(255, 234, 170, 0.1),
        0 0 22px rgba(255, 213, 90, 0.16);
    }
    .time-dock__label,
    .time-dock__time {
      max-width: 112px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      text-align: center;
      line-height: 1.1;
    }
    .time-dock__label {
      font-size: 0.72rem;
      font-weight: 800;
      transition: color 150ms ease;
    }
    .time-dock__time {
      font-size: 0.66rem;
      opacity: 0.62;
      transition: opacity 150ms ease, color 150ms ease;
    }
    .time-dock__point:hover .time-dock__label {
      color: rgba(242, 255, 248, 0.98);
    }
    .time-dock__point:hover .time-dock__time {
      opacity: 0.84;
      color: rgba(214, 240, 226, 0.92);
    }
    .time-dock__point--disabled:hover .time-dock__orb {
      border-color: rgba(114, 241, 184, 0.26);
      background:
        linear-gradient(180deg, rgba(114, 241, 184, 0.18), rgba(12, 31, 30, 0.94)),
        rgba(8, 16, 22, 0.92);
      box-shadow: 0 10px 24px rgba(0, 0, 0, 0.32);
    }
    .time-dock__point--disabled:hover .time-dock__label {
      color: rgba(226, 244, 239, 0.86);
    }
    .time-dock__point--disabled:hover .time-dock__time {
      opacity: 0.62;
      color: inherit;
    }
    .time-dock__scroll {
      width: 42px;
      height: 42px;
      margin-bottom: 22px;
      border-radius: 999px;
      border: 1px solid rgba(114, 241, 184, 0.2);
      background: rgba(9, 18, 24, 0.92);
      color: rgba(236, 255, 245, 0.9);
      font-size: 1rem;
      font-weight: 900;
      cursor: pointer;
    }
    .time-dock__scroll:hover {
      border-color: rgba(114, 241, 184, 0.36);
      background: rgba(18, 38, 40, 0.98);
    }
    .graph-panel {
      padding: 22px;
      min-height: 0;
      position: relative;
      overflow: hidden;
      overscroll-behavior: contain;
      display: grid;
      grid-template-rows: auto minmax(0, 1fr);
      gap: 14px;
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
    .graph-panel__head {
      position: relative;
      z-index: 2;
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 16px;
    }
    .graph-panel__viewport {
      min-height: 0;
      overflow: auto;
      overscroll-behavior: contain;
      position: relative;
      z-index: 2;
      padding: 4px 2px 2px 0;
    }
    .graph-stage-actions {
      display: flex;
      justify-content: flex-end;
      align-items: center;
      gap: 10px;
      flex-shrink: 0;
      position: sticky;
      top: 0;
      align-self: flex-start;
      padding: 10px;
      border-radius: 16px;
      border: 1px solid rgba(114, 241, 184, 0.14);
      background: rgba(8, 16, 22, 0.72);
      backdrop-filter: blur(16px);
      box-shadow: 0 18px 32px rgba(0, 0, 0, 0.22);
    }
    .graph-stage-action-button {
      width: 38px;
      height: 38px;
      border-radius: 12px;
      border: 1px solid rgba(114, 241, 184, 0.16);
      background: rgba(9, 18, 24, 0.88);
      color: rgba(226, 244, 239, 0.84);
      display: inline-flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      transition: border-color 140ms ease, background 140ms ease, color 140ms ease, box-shadow 140ms ease;
      box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.03);
    }
    .graph-stage-action-button svg {
      width: 18px;
      height: 18px;
      fill: currentColor;
    }
    .graph-stage-action-button:hover {
      border-color: rgba(114, 241, 184, 0.3);
      background: rgba(16, 32, 31, 0.96);
      color: rgba(244, 255, 250, 0.98);
      box-shadow: 0 10px 18px rgba(0, 0, 0, 0.18);
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
      width: max-content;
      height: max-content;
    }
    .graph-stage__canvas {
      position: relative;
      width: max-content;
      height: max-content;
      transform-origin: top left;
      transform: scale(var(--graph-stage-zoom, 1));
      transition: transform 160ms ease;
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
    .execution-overlay--pending-settings {
      border-color: rgba(114, 189, 255, 0.36);
      background:
        linear-gradient(180deg, rgba(16, 44, 74, 0.96), rgba(10, 20, 34, 0.98)),
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
    .execution-overlay--pending-settings .execution-overlay__pulse {
      background: #8fd5ff;
      animation-duration: 2.2s;
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
    .execution-overlay__actions {
      margin-top: 8px;
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
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
      z-index: 1;
    }
    .graph-links path {
      fill: none;
      stroke-width: 4.2;
      stroke-linecap: round;
      stroke-linejoin: round;
      opacity: 0.94;
      filter: drop-shadow(0 0 9px rgba(76, 236, 151, 0.18));
      transition: stroke 180ms ease, opacity 180ms ease, stroke-width 180ms ease, filter 180ms ease;
    }
    .graph-links path.completed {
      stroke: rgba(67, 226, 146, 0.88);
    }
    .graph-links path.current {
      stroke: rgba(92, 181, 255, 0.94);
      stroke-width: 4.5;
      filter: drop-shadow(0 0 12px rgba(92, 181, 255, 0.26));
    }
    .graph-links path.executing {
      stroke: rgba(92, 181, 255, 0.98);
      stroke-dasharray: 22 10;
      animation: currentFlow 1.1s linear infinite;
      filter: drop-shadow(0 0 14px rgba(92, 181, 255, 0.42));
    }
    .graph-links path.pending {
      stroke: rgba(145, 158, 178, 0.76);
      stroke-dasharray: 10 13;
      stroke-width: 3.2;
      filter: none;
    }
    .graph-links path.disabled {
      stroke: rgba(255, 255, 255, 0.08);
      opacity: 0.45;
      filter: none;
    }
    .graph-loops {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      overflow: visible;
      pointer-events: none;
      z-index: 2;
    }
    .graph-loops path {
      fill: none;
      stroke: rgba(62, 153, 255, 0.88);
      stroke-width: 3.2;
      stroke-linecap: round;
      stroke-linejoin: round;
      stroke-dasharray: 10 12;
      filter: drop-shadow(0 0 10px rgba(62, 153, 255, 0.18));
    }
    .graph-loop-path--selected {
      stroke: rgba(114, 196, 255, 0.96);
      filter: drop-shadow(0 0 14px rgba(92, 181, 255, 0.24));
    }
    .graph-reopen-preview {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      overflow: visible;
      pointer-events: none;
      z-index: 2;
    }
    .graph-reopen-preview[hidden] {
      display: none;
    }
    .graph-reopen-preview__path {
      fill: none;
      stroke: rgba(255, 214, 109, 0.96);
      stroke-width: 4.2;
      stroke-linecap: round;
      stroke-linejoin: round;
      stroke-dasharray: 14 10;
      animation: reopenPreviewBlink 0.92s ease-in-out infinite;
      filter: drop-shadow(0 0 10px rgba(255, 214, 109, 0.22));
    }
    @keyframes reopenPreviewBlink {
      0%, 100% {
        opacity: 0.34;
      }
      50% {
        opacity: 0.96;
      }
    }
    .phase-graph {
      position: relative;
      width: var(--graph-width-desktop-vertical, ${desktopGraphWidth}px);
      min-width: var(--graph-width-desktop-vertical, ${desktopGraphWidth}px);
      min-height: var(--graph-height-desktop-vertical, ${desktopGraphHeight}px);
    }
    .phase-graph[data-graph-layout-mode="horizontal"] {
      width: var(--graph-width-desktop-horizontal, ${desktopGraphWidth}px);
      min-width: var(--graph-width-desktop-horizontal, ${desktopGraphWidth}px);
      min-height: var(--graph-height-desktop-horizontal, ${desktopGraphHeight}px);
    }
    .graph-links--mobile,
    .graph-loops--mobile,
    .graph-links--desktop-horizontal,
    .graph-loops--desktop-horizontal,
    .graph-links--desktop-vertical,
    .graph-loops--desktop-vertical,
    .graph-loop-box--desktop-horizontal,
    .graph-loop-box--desktop-vertical,
    .graph-loop-box--mobile-horizontal,
    .graph-loop-box--mobile-vertical {
      display: none;
    }
    .phase-graph[data-graph-layout-mode="horizontal"] .graph-links--desktop-horizontal {
      display: block;
    }
    .phase-graph[data-graph-layout-mode="horizontal"] .graph-loops--desktop-horizontal {
      display: block;
    }
    .phase-graph[data-graph-layout-mode="vertical"] .graph-links--desktop-vertical {
      display: block;
    }
    .phase-graph[data-graph-layout-mode="vertical"] .graph-loops--desktop-vertical {
      display: block;
    }
    .phase-graph[data-graph-layout-mode="horizontal"] .graph-loop-box--desktop-horizontal {
      display: grid;
    }
    .phase-graph[data-graph-layout-mode="vertical"] .graph-loop-box--desktop-vertical {
      display: grid;
    }
    .graph-loop-box {
      position: absolute;
      align-items: start;
      grid-template-columns: 32px 1fr;
      gap: 12px;
      padding: 16px 18px;
      border-radius: 18px;
      border: 1px solid rgba(54, 134, 222, 0.22);
      background: linear-gradient(180deg, rgba(8, 24, 38, 0.9), rgba(6, 18, 29, 0.94));
      box-shadow: 0 16px 28px rgba(4, 12, 22, 0.22);
      color: #8fd5ff;
      pointer-events: none;
      z-index: 2;
    }
    .graph-loop-box--selected {
      border-color: rgba(92, 181, 255, 0.42);
      box-shadow:
        0 18px 32px rgba(4, 12, 22, 0.26),
        0 0 0 1px rgba(92, 181, 255, 0.1),
        0 0 20px rgba(92, 181, 255, 0.12);
    }
    .graph-loop-box__icon {
      width: 32px;
      height: 32px;
      border-radius: 999px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      background: rgba(35, 95, 170, 0.22);
      color: #49aaff;
    }
    .graph-loop-box__icon svg {
      width: 20px;
      height: 20px;
      fill: currentColor;
    }
    .graph-loop-box__label {
      align-self: center;
      font-size: 1rem;
      font-weight: 700;
      line-height: 1.4;
      color: #6ec6ff;
      text-wrap: balance;
    }
    .graph-legend {
      position: absolute;
      left: var(--graph-legend-left-desktop-vertical, 28px);
      top: var(--graph-legend-top-desktop-vertical, 1402px);
      width: 240px;
      padding: 22px 22px 20px;
      border-radius: 18px;
      border: 1px dashed rgba(174, 188, 209, 0.26);
      background: linear-gradient(180deg, rgba(8, 18, 30, 0.86), rgba(5, 11, 20, 0.94));
      box-shadow: 0 16px 26px rgba(4, 8, 16, 0.22);
      pointer-events: auto;
      z-index: 6;
    }
    .graph-legend[hidden] {
      display: none;
    }
    .phase-graph[data-graph-layout-mode="horizontal"] .graph-legend {
      left: var(--graph-legend-left-desktop-horizontal, 28px);
      top: var(--graph-legend-top-desktop-horizontal, 748px);
    }
    .graph-legend__head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 16px;
    }
    .graph-legend__title {
      color: rgba(240, 244, 252, 0.92);
      font-size: 0.96rem;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }
    .graph-legend__dismiss {
      width: 28px;
      height: 28px;
      border-radius: 999px;
      border: 1px solid rgba(197, 208, 226, 0.18);
      background: rgba(255, 255, 255, 0.04);
      color: rgba(230, 236, 246, 0.88);
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font: inherit;
      font-size: 1rem;
      line-height: 1;
      cursor: pointer;
      transition: border-color 140ms ease, background 140ms ease, color 140ms ease;
    }
    .graph-legend__dismiss:hover {
      border-color: rgba(230, 236, 246, 0.34);
      background: rgba(255, 255, 255, 0.08);
      color: rgba(248, 250, 255, 0.96);
    }
    .graph-legend__row {
      display: flex;
      align-items: center;
      gap: 12px;
      color: rgba(214, 221, 232, 0.86);
    }
    .graph-legend__row + .graph-legend__row {
      margin-top: 14px;
    }
    .graph-legend__line {
      width: 40px;
      height: 0;
      border-top: 4px solid rgba(255, 255, 255, 0.2);
      border-radius: 999px;
      flex: 0 0 auto;
    }
    .graph-legend__line--progress {
      border-top-color: rgba(114, 241, 184, 0.82);
      box-shadow: 0 0 12px rgba(114, 241, 184, 0.2);
    }
    .graph-legend__line--pending {
      border-top-color: rgba(161, 172, 189, 0.76);
      border-top-style: dashed;
    }
    .graph-legend__dot {
      width: 18px;
      height: 18px;
      border-radius: 50%;
      border: 1px solid rgba(255, 255, 255, 0.08);
      flex: 0 0 auto;
    }
    .graph-legend__dot--completed {
      background: linear-gradient(180deg, #49d484, #2f9c62);
    }
    .graph-legend__dot--current {
      background: linear-gradient(180deg, #4297ff, #2569d6);
    }
    .graph-legend__dot--pending {
      background: linear-gradient(180deg, #9099aa, #687181);
    }
    .graph-legend__dot--final {
      background: linear-gradient(180deg, #8a4dff, #5f2bc3);
    }
    .phase-node {
      position: absolute;
      left: var(--phase-left-desktop-vertical);
      top: var(--phase-top-desktop-vertical);
      width: ${phaseNodeWidth}px;
      min-height: ${phaseNodeHeight}px;
      border-radius: 24px;
      border: 1px solid rgba(168, 205, 245, 0.3);
      padding: 12px 14px 14px;
      color: #e8f3ff;
      background:
        radial-gradient(120% 120% at 16% 0%, rgba(255, 255, 255, 0.18), rgba(255, 255, 255, 0.08) 28%, transparent 34%),
        radial-gradient(120% 130% at 100% 100%, rgba(86, 142, 229, 0.16), transparent 44%),
        linear-gradient(180deg, rgba(34, 48, 66, 0.96), rgba(17, 28, 42, 0.98) 54%, rgba(10, 18, 29, 0.99));
      text-align: left;
      cursor: pointer;
      box-shadow:
        0 24px 34px rgba(0, 0, 0, 0.26),
        0 8px 0 rgba(7, 14, 24, 0.32),
        inset 0 1px 0 rgba(255, 255, 255, 0.1);
      transition: transform 180ms ease, border-color 140ms ease, box-shadow 140ms ease, background 140ms ease;
      overflow: visible;
      isolation: isolate;
      animation: nodeRise 420ms ease both;
      z-index: 3;
    }
    .phase-graph[data-graph-layout-mode="horizontal"] .phase-node {
      left: var(--phase-left-desktop-horizontal);
      top: var(--phase-top-desktop-horizontal);
    }
    .phase-node::after {
      content: "";
      position: absolute;
      inset: 1px;
      border-radius: inherit;
      background:
        linear-gradient(180deg, rgba(255, 255, 255, 0.09), rgba(255, 255, 255, 0.02) 24%, rgba(255, 255, 255, 0) 48%),
        radial-gradient(76% 82% at 0% 0%, rgba(255, 255, 255, 0.08), transparent 32%);
      z-index: -1;
      pointer-events: none;
      opacity: 0.72;
    }
    .phase-node::before {
      content: "";
      position: absolute;
      left: 18px;
      right: 18px;
      bottom: -12px;
      height: 22px;
      border-radius: 999px;
      background: radial-gradient(closest-side, rgba(0, 0, 0, 0.36), transparent 78%);
      filter: blur(10px);
      z-index: -2;
      pointer-events: none;
      opacity: 0.9;
    }
    .phase-node:hover {
      transform: translateY(-2px);
      border-color: rgba(150, 204, 255, 0.5);
      background:
        radial-gradient(120% 120% at 16% 0%, rgba(255, 255, 255, 0.24), rgba(255, 255, 255, 0.1) 28%, transparent 34%),
        radial-gradient(120% 130% at 100% 100%, rgba(120, 173, 255, 0.22), transparent 44%),
        linear-gradient(180deg, rgba(40, 56, 77, 0.98), rgba(21, 34, 50, 0.99) 54%, rgba(12, 20, 32, 1));
      box-shadow:
        0 28px 40px rgba(0, 0, 0, 0.28),
        0 10px 0 rgba(7, 14, 24, 0.34),
        0 0 0 1px rgba(210, 229, 246, 0.12),
        0 0 28px rgba(124, 190, 255, 0.18);
    }
    .phase-node.selected {
      outline: none;
      z-index: 5;
      box-shadow:
        0 0 0 1px rgba(115, 177, 255, 0.34),
        0 26px 38px rgba(0, 0, 0, 0.28),
        0 10px 0 rgba(7, 14, 24, 0.34),
        0 0 30px rgba(119, 176, 255, 0.16);
    }
    .phase-node.phase-node--current {
      border-color: rgba(40, 147, 255, 0.86);
      box-shadow:
        0 26px 42px rgba(8, 72, 148, 0.24),
        0 10px 0 rgba(4, 18, 34, 0.42),
        0 0 28px rgba(40, 147, 255, 0.22);
      z-index: 6;
    }
    .phase-node-content {
      position: relative;
      z-index: 2;
      display: grid;
      gap: 12px;
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
      background:
        radial-gradient(120% 120% at 16% 0%, rgba(255, 255, 255, 0.2), rgba(255, 255, 255, 0.08) 28%, transparent 34%),
        radial-gradient(130% 130% at 100% 100%, rgba(95, 160, 255, 0.18), transparent 42%),
        linear-gradient(180deg, rgba(24, 48, 78, 0.97), rgba(13, 31, 54, 0.99) 54%, rgba(8, 20, 36, 1));
      border-color: rgba(40, 147, 255, 0.86);
      box-shadow:
        0 24px 38px rgba(48, 120, 255, 0.18),
        0 8px 0 rgba(4, 20, 40, 0.38);
      animation: nodeRise 420ms ease both, currentPulse 2.8s ease-in-out infinite;
    }
    .phase-node.phase-tone-active:hover {
      border-color: rgba(110, 198, 255, 0.72);
      background:
        radial-gradient(120% 120% at 16% 0%, rgba(255, 255, 255, 0.24), rgba(255, 255, 255, 0.1) 28%, transparent 34%),
        radial-gradient(130% 130% at 100% 100%, rgba(95, 160, 255, 0.22), transparent 42%),
        linear-gradient(180deg, rgba(28, 55, 88, 0.98), rgba(16, 37, 61, 0.99) 54%, rgba(10, 23, 40, 1));
      box-shadow:
        0 28px 40px rgba(30, 86, 150, 0.22),
        0 10px 0 rgba(4, 20, 40, 0.4),
        0 0 0 1px rgba(128, 205, 255, 0.18),
        0 0 28px rgba(92, 181, 255, 0.22);
    }
    .phase-node.phase-tone-waiting-user {
      background:
        radial-gradient(120% 120% at 16% 0%, rgba(255, 244, 201, 0.18), rgba(255, 232, 163, 0.08) 28%, transparent 34%),
        radial-gradient(130% 130% at 100% 100%, rgba(196, 130, 24, 0.14), transparent 42%),
        linear-gradient(180deg, rgba(60, 44, 14, 0.97), rgba(36, 26, 9, 0.99) 54%, rgba(23, 16, 6, 1));
      border-color: rgba(255, 213, 90, 0.5);
      box-shadow:
        0 22px 34px rgba(154, 118, 24, 0.2),
        0 8px 0 rgba(88, 62, 13, 0.52);
    }
    .phase-node.phase-tone-waiting-user:hover {
      border-color: rgba(255, 223, 116, 0.74);
      background:
        radial-gradient(120% 120% at 16% 0%, rgba(255, 244, 201, 0.22), rgba(255, 232, 163, 0.1) 28%, transparent 34%),
        radial-gradient(130% 130% at 100% 100%, rgba(196, 130, 24, 0.18), transparent 42%),
        linear-gradient(180deg, rgba(68, 50, 17, 0.98), rgba(42, 30, 10, 0.99) 54%, rgba(26, 18, 7, 1));
      box-shadow:
        0 28px 38px rgba(154, 118, 24, 0.22),
        0 10px 0 rgba(88, 62, 13, 0.56),
        0 0 0 1px rgba(255, 231, 162, 0.14),
        0 0 28px rgba(255, 213, 90, 0.18);
    }
    .phase-node.phase-tone-paused {
      background:
        radial-gradient(120% 120% at 16% 0%, rgba(171, 215, 255, 0.18), rgba(130, 188, 255, 0.08) 28%, transparent 34%),
        radial-gradient(130% 130% at 100% 100%, rgba(54, 118, 214, 0.16), transparent 42%),
        linear-gradient(180deg, rgba(24, 44, 72, 0.97), rgba(14, 29, 50, 0.99) 54%, rgba(9, 18, 32, 1));
      border-color: rgba(92, 181, 255, 0.34);
      box-shadow:
        0 20px 30px rgba(48, 120, 255, 0.16),
        0 8px 0 rgba(12, 32, 60, 0.52);
    }
    .phase-node.phase-tone-paused:hover {
      border-color: rgba(122, 201, 255, 0.62);
      background:
        radial-gradient(120% 120% at 16% 0%, rgba(171, 215, 255, 0.22), rgba(130, 188, 255, 0.1) 28%, transparent 34%),
        radial-gradient(130% 130% at 100% 100%, rgba(54, 118, 214, 0.2), transparent 42%),
        linear-gradient(180deg, rgba(28, 50, 82, 0.98), rgba(16, 34, 58, 0.99) 54%, rgba(10, 20, 36, 1));
      box-shadow:
        0 24px 34px rgba(40, 98, 160, 0.2),
        0 10px 0 rgba(12, 32, 60, 0.56),
        0 0 0 1px rgba(141, 208, 255, 0.14),
        0 0 24px rgba(92, 181, 255, 0.16);
    }
    .phase-node.phase-tone-blocked {
      background:
        radial-gradient(120% 120% at 16% 0%, rgba(255, 175, 175, 0.18), rgba(255, 132, 132, 0.08) 28%, transparent 34%),
        radial-gradient(130% 130% at 100% 100%, rgba(140, 38, 38, 0.16), transparent 42%),
        linear-gradient(180deg, rgba(62, 24, 24, 0.97), rgba(38, 14, 14, 0.99) 54%, rgba(24, 9, 9, 1));
      border-color: rgba(255, 120, 120, 0.28);
      box-shadow:
        0 18px 30px rgba(140, 38, 38, 0.18),
        0 8px 0 rgba(66, 20, 20, 0.52);
    }
    .phase-node.phase-tone-blocked:hover {
      border-color: rgba(255, 146, 146, 0.58);
      background:
        radial-gradient(120% 120% at 16% 0%, rgba(255, 175, 175, 0.22), rgba(255, 132, 132, 0.1) 28%, transparent 34%),
        radial-gradient(130% 130% at 100% 100%, rgba(140, 38, 38, 0.2), transparent 42%),
        linear-gradient(180deg, rgba(70, 28, 28, 0.98), rgba(43, 16, 16, 0.99) 54%, rgba(27, 10, 10, 1));
      box-shadow:
        0 22px 34px rgba(140, 38, 38, 0.22),
        0 10px 0 rgba(66, 20, 20, 0.56),
        0 0 0 1px rgba(255, 184, 184, 0.1),
        0 0 24px rgba(255, 120, 120, 0.12);
    }
    .phase-node.phase-tone-completed {
      background:
        radial-gradient(120% 120% at 16% 0%, rgba(114, 241, 184, 0.18), rgba(54, 214, 130, 0.08) 28%, transparent 34%),
        radial-gradient(circle at 100% 100%, rgba(45, 214, 126, 0.14), transparent 54%),
        linear-gradient(180deg, rgba(13, 50, 34, 0.97), rgba(7, 31, 21, 0.99) 54%, rgba(4, 20, 14, 1));
      border-color: rgba(43, 210, 122, 0.72);
      box-shadow:
        0 20px 36px rgba(8, 80, 48, 0.18),
        0 8px 0 rgba(6, 28, 19, 0.52),
        0 0 26px rgba(43, 210, 122, 0.12);
    }
    .phase-node.phase-tone-completed:hover {
      border-color: rgba(114, 241, 184, 0.56);
      background:
        radial-gradient(120% 120% at 16% 0%, rgba(114, 241, 184, 0.22), rgba(54, 214, 130, 0.1) 28%, transparent 34%),
        radial-gradient(circle at 100% 100%, rgba(45, 214, 126, 0.18), transparent 54%),
        linear-gradient(180deg, rgba(16, 58, 40, 0.98), rgba(8, 36, 24, 0.99) 54%, rgba(5, 23, 16, 1));
      box-shadow:
        0 22px 34px rgba(18, 72, 53, 0.2),
        0 10px 0 rgba(6, 28, 19, 0.56),
        0 0 0 1px rgba(173, 255, 218, 0.12),
        0 0 26px rgba(114, 241, 184, 0.16);
    }
    .phase-node--final,
    .phase-node--final.phase-tone-completed,
    .phase-node--final.phase-tone-pending {
      background:
        radial-gradient(120% 120% at 16% 0%, rgba(194, 150, 255, 0.18), rgba(140, 93, 255, 0.08) 28%, transparent 34%),
        radial-gradient(130% 130% at 100% 100%, rgba(91, 50, 170, 0.16), transparent 42%),
        linear-gradient(180deg, rgba(41, 24, 68, 0.98), rgba(24, 13, 42, 0.99) 54%, rgba(16, 9, 29, 1));
      border-color: rgba(143, 89, 255, 0.58);
      box-shadow:
        0 20px 34px rgba(44, 20, 90, 0.2),
        0 8px 0 rgba(28, 15, 48, 0.56),
        0 0 0 1px rgba(170, 132, 255, 0.12),
        0 0 28px rgba(120, 74, 255, 0.12);
      opacity: 1;
    }
    .phase-node--final:hover {
      border-color: rgba(170, 120, 255, 0.78);
      background:
        radial-gradient(120% 120% at 16% 0%, rgba(194, 150, 255, 0.22), rgba(140, 93, 255, 0.1) 28%, transparent 34%),
        radial-gradient(130% 130% at 100% 100%, rgba(91, 50, 170, 0.2), transparent 42%),
        linear-gradient(180deg, rgba(47, 28, 78, 0.98), rgba(28, 16, 48, 0.99) 54%, rgba(18, 10, 33, 1));
      box-shadow:
        0 24px 36px rgba(50, 22, 96, 0.22),
        0 10px 0 rgba(28, 15, 48, 0.58),
        0 0 0 1px rgba(185, 148, 255, 0.14),
        0 0 32px rgba(146, 100, 255, 0.18);
    }
    .phase-node--final .phase-role-badge {
      color: rgba(212, 194, 255, 0.96);
      border-color: rgba(160, 124, 255, 0.24);
      background:
        linear-gradient(180deg, rgba(255, 255, 255, 0.2), rgba(255, 255, 255, 0.04)),
        rgba(142, 93, 255, 0.14);
    }
    .phase-node.phase-tone-pending {
      background:
        radial-gradient(120% 120% at 16% 0%, rgba(196, 214, 236, 0.14), rgba(196, 214, 236, 0.06) 28%, transparent 34%),
        radial-gradient(130% 130% at 100% 100%, rgba(78, 101, 132, 0.12), transparent 42%),
        linear-gradient(180deg, rgba(39, 47, 59, 0.96), rgba(24, 31, 43, 0.98) 54%, rgba(15, 21, 31, 0.99));
      border-color: rgba(155, 171, 195, 0.34);
      box-shadow:
        0 16px 30px rgba(7, 10, 16, 0.18),
        0 8px 0 rgba(18, 24, 34, 0.5);
      opacity: 1;
    }
    .phase-node.phase-tone-pending:hover {
      border-color: rgba(214, 222, 235, 0.28);
      background:
        radial-gradient(120% 120% at 16% 0%, rgba(196, 214, 236, 0.18), rgba(196, 214, 236, 0.08) 28%, transparent 34%),
        radial-gradient(130% 130% at 100% 100%, rgba(78, 101, 132, 0.16), transparent 42%),
        linear-gradient(180deg, rgba(45, 54, 68, 0.97), rgba(28, 36, 50, 0.99) 54%, rgba(18, 24, 35, 1));
      box-shadow:
        0 22px 34px rgba(7, 10, 16, 0.2),
        0 10px 0 rgba(18, 24, 34, 0.54),
        0 0 0 1px rgba(226, 232, 240, 0.08),
        0 0 20px rgba(196, 203, 214, 0.08);
    }
    .phase-node.phase-tone-disabled {
      background:
        radial-gradient(120% 120% at 16% 0%, rgba(177, 186, 200, 0.12), rgba(177, 186, 200, 0.04) 28%, transparent 34%),
        linear-gradient(180deg, rgba(46, 50, 56, 0.94), rgba(29, 32, 38, 0.96));
      border-color: rgba(255, 255, 255, 0.08);
      opacity: 0.72;
      box-shadow:
        0 10px 18px rgba(6, 8, 12, 0.14),
        0 6px 0 rgba(17, 20, 24, 0.44);
    }
    .phase-node-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 14px;
      position: relative;
      z-index: 1;
    }
    .phase-node-header-main {
      display: flex;
      flex-direction: row;
      align-items: center;
      gap: 10px;
      min-width: 0;
      flex-wrap: wrap;
      min-height: 24px;
    }
    .phase-role-badge {
      width: 38px;
      height: 38px;
      border-radius: 14px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border: 1px solid rgba(255, 255, 255, 0.18);
      background:
        linear-gradient(180deg, rgba(255, 255, 255, 0.14), rgba(255, 255, 255, 0.03)),
        rgba(255, 255, 255, 0.05);
      color: rgba(239, 249, 255, 0.96);
      box-shadow:
        inset 0 1px 0 rgba(255, 255, 255, 0.08),
        0 8px 18px rgba(0, 0, 0, 0.18);
    }
    .phase-role-badge svg {
      width: 18px;
      height: 18px;
      fill: currentColor;
    }
    .phase-current-rail {
      position: absolute;
      top: 26px;
      bottom: 26px;
      left: -39px;
      width: 40px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border: 1px solid rgba(92, 181, 255, 0.34);
      border-right: 0;
      border-radius: 18px 0 0 18px;
      background: linear-gradient(180deg, rgba(20, 90, 154, 0.98), rgba(6, 34, 65, 0.98));
      box-shadow: 0 16px 28px rgba(4, 18, 34, 0.28);
      pointer-events: none;
      z-index: 1;
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
      top: 26px;
      bottom: 26px;
      right: -39px;
      width: 40px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border: 1px solid rgba(177, 190, 210, 0.24);
      border-left: 0;
      border-radius: 0 18px 18px 0;
      background: linear-gradient(180deg, rgba(62, 74, 96, 0.98), rgba(24, 32, 46, 0.98));
      box-shadow: 0 16px 28px rgba(4, 8, 16, 0.24);
      pointer-events: none;
      z-index: 1;
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
    .phase-node-body {
      display: grid;
      grid-template-columns: 54px minmax(0, 1fr);
      align-items: center;
      gap: 12px;
      min-width: 0;
    }
    .phase-node-visual {
      position: relative;
      width: 54px;
      height: 54px;
      border-radius: 17px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      color: #fff;
      background:
        linear-gradient(180deg, rgba(255, 255, 255, 0.3), rgba(255, 255, 255, 0.08) 24%, rgba(255, 255, 255, 0) 100%),
        linear-gradient(145deg, #39d7d6, #2564ff);
      border: 1px solid rgba(255, 255, 255, 0.34);
      box-shadow:
        inset 0 1px 0 rgba(255, 255, 255, 0.28),
        inset 0 -8px 18px rgba(0, 0, 0, 0.14),
        0 14px 24px rgba(28, 106, 255, 0.24);
      flex: 0 0 auto;
      overflow: hidden;
    }
    .phase-node-visual::before {
      content: "";
      position: absolute;
      inset: 0;
      background:
        radial-gradient(circle at 30% 18%, rgba(255, 255, 255, 0.36), transparent 36%),
        linear-gradient(180deg, rgba(255, 255, 255, 0.16), transparent 38%);
      pointer-events: none;
    }
    .phase-node-visual svg {
      position: relative;
      z-index: 1;
      width: 28px;
      height: 28px;
      fill: currentColor;
      filter: drop-shadow(0 3px 6px rgba(0, 0, 0, 0.18));
    }
    .phase-node-copy {
      min-width: 0;
      display: grid;
      gap: 4px;
      align-content: center;
    }
    .phase-node.capture .phase-node-visual {
      background:
        linear-gradient(180deg, rgba(255, 255, 255, 0.3), rgba(255, 255, 255, 0.08) 24%, rgba(255, 255, 255, 0) 100%),
        linear-gradient(145deg, #23d0c7, #1987ff);
    }
    .phase-node.refinement .phase-node-visual {
      background:
        linear-gradient(180deg, rgba(255, 255, 255, 0.32), rgba(255, 255, 255, 0.08) 24%, rgba(255, 255, 255, 0) 100%),
        linear-gradient(145deg, #4de1d6, #3978ff);
    }
    .phase-node.spec .phase-node-visual {
      background:
        linear-gradient(180deg, rgba(255, 255, 255, 0.34), rgba(255, 255, 255, 0.08) 24%, rgba(255, 255, 255, 0) 100%),
        linear-gradient(145deg, #47dfb6, #12aa72);
      box-shadow:
        inset 0 1px 0 rgba(255, 255, 255, 0.28),
        inset 0 -8px 18px rgba(0, 0, 0, 0.14),
        0 14px 24px rgba(20, 150, 95, 0.22);
    }
    .phase-node.technical-design .phase-node-visual {
      background:
        linear-gradient(180deg, rgba(255, 255, 255, 0.34), rgba(255, 255, 255, 0.08) 24%, rgba(255, 255, 255, 0) 100%),
        linear-gradient(145deg, #78c8ff, #4562ff);
    }
    .phase-node.implementation .phase-node-visual {
      background:
        linear-gradient(180deg, rgba(255, 255, 255, 0.34), rgba(255, 255, 255, 0.08) 24%, rgba(255, 255, 255, 0) 100%),
        linear-gradient(145deg, #8e78ff, #4568ff);
    }
    .phase-node.review .phase-node-visual {
      background:
        linear-gradient(180deg, rgba(255, 255, 255, 0.34), rgba(255, 255, 255, 0.08) 24%, rgba(255, 255, 255, 0) 100%),
        linear-gradient(145deg, #58b9ff, #2462d9);
    }
    .phase-node.release-approval .phase-node-visual {
      background:
        linear-gradient(180deg, rgba(255, 255, 255, 0.34), rgba(255, 255, 255, 0.08) 24%, rgba(255, 255, 255, 0) 100%),
        linear-gradient(145deg, #4cdbb6, #1aaf8d);
      box-shadow:
        inset 0 1px 0 rgba(255, 255, 255, 0.28),
        inset 0 -8px 18px rgba(0, 0, 0, 0.14),
        0 14px 24px rgba(20, 150, 95, 0.22);
    }
    .phase-node.pr-preparation .phase-node-visual {
      background:
        linear-gradient(180deg, rgba(255, 255, 255, 0.34), rgba(255, 255, 255, 0.08) 24%, rgba(255, 255, 255, 0) 100%),
        linear-gradient(145deg, #73d6ff, #2588f7);
    }
    .phase-node--final .phase-node-visual {
      background:
        linear-gradient(180deg, rgba(255, 255, 255, 0.3), rgba(255, 255, 255, 0.08) 24%, rgba(255, 255, 255, 0) 100%),
        linear-gradient(145deg, #b578ff, #6a47ff);
      box-shadow:
        inset 0 1px 0 rgba(255, 255, 255, 0.28),
        inset 0 -8px 18px rgba(0, 0, 0, 0.16),
        0 14px 24px rgba(96, 58, 182, 0.24);
    }
    .phase-node--reopen-target {
      border-color: rgba(255, 214, 109, 0.72);
      box-shadow:
        0 24px 40px rgba(66, 47, 11, 0.26),
        0 10px 0 rgba(34, 24, 8, 0.58),
        0 0 0 1px rgba(255, 230, 164, 0.18),
        0 0 34px rgba(255, 214, 109, 0.22);
    }
    .phase-node--reopen-target .phase-node-visual {
      box-shadow:
        inset 0 1px 0 rgba(255, 255, 255, 0.28),
        inset 0 -8px 18px rgba(0, 0, 0, 0.14),
        0 14px 24px rgba(28, 106, 255, 0.24),
        0 0 0 2px rgba(255, 214, 109, 0.22),
        0 0 22px rgba(255, 214, 109, 0.18);
    }
    .phase-pause-toggle {
      width: 38px;
      height: 38px;
      margin-top: 0;
      border: 1px solid rgba(255, 255, 255, 0.18);
      border-radius: 14px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 0;
      color: rgba(244, 250, 255, 0.92);
      background:
        linear-gradient(180deg, rgba(255, 255, 255, 0.14), rgba(255, 255, 255, 0.03)),
        rgba(255, 255, 255, 0.04);
      box-shadow:
        inset 0 1px 0 rgba(255, 255, 255, 0.08),
        0 8px 16px rgba(0, 0, 0, 0.16);
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
      width: 16px;
      height: 16px;
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
      margin: 0;
      font-size: 1.05rem;
      font-weight: 800;
      line-height: 1.02;
      letter-spacing: -0.02em;
      position: relative;
      z-index: 1;
      color: #eef6ff;
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
      font-family: var(--specforge-editor-font-family);
      font-size: 0.82rem;
      color: rgba(226, 236, 248, 0.86);
      opacity: 1;
      line-height: 1.22;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
      text-wrap: balance;
      position: relative;
      z-index: 1;
    }
    .phase-tag {
      border-radius: 999px;
      padding: 5px 10px;
      font-size: 0.68rem;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      background: rgba(226, 235, 247, 0.12);
      color: rgba(220, 236, 252, 0.88);
      font-weight: 800;
      border: 1px solid rgba(255, 255, 255, 0.1);
      box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04);
    }
    .phase-tag.approval {
      background: linear-gradient(180deg, rgba(255, 210, 153, 0.96), rgba(255, 189, 107, 0.9));
      color: #7a3d00;
      border-color: rgba(240, 163, 67, 0.3);
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
      background: rgba(43, 210, 122, 0.22);
      color: #c8ffe0;
      box-shadow: 0 0 18px rgba(43, 210, 122, 0.18);
    }
    .phase-tag.phase-tag--disabled {
      background: rgba(255, 255, 255, 0.05);
      color: rgba(255, 255, 255, 0.52);
    }
    .phase-tag--active,
    .phase-tag--paused {
      background: rgba(40, 147, 255, 0.22);
      color: #94cfff;
      box-shadow: 0 0 18px rgba(40, 147, 255, 0.18);
    }
    .phase-tag--pending {
      background: rgba(159, 174, 196, 0.14);
      color: rgba(242, 246, 252, 0.92);
    }
    .graph-phase-status-icon {
      margin-left: auto;
      width: 38px;
      height: 38px;
      border-radius: 14px;
      color: rgba(64, 242, 145, 0.96);
      border-color: currentColor;
      background:
        linear-gradient(180deg, rgba(255, 255, 255, 0.18), rgba(255, 255, 255, 0.04)),
        rgba(8, 42, 24, 0.88);
      box-shadow:
        inset 0 1px 0 rgba(255, 255, 255, 0.28),
        0 10px 18px rgba(16, 64, 38, 0.16),
        0 0 18px rgba(64, 242, 145, 0.16);
    }
    .phase-tone-active .graph-phase-status-icon,
    .phase-tone-paused .graph-phase-status-icon {
      color: rgba(76, 166, 255, 0.96);
      background:
        linear-gradient(180deg, rgba(255, 255, 255, 0.18), rgba(255, 255, 255, 0.04)),
        rgba(8, 32, 62, 0.9);
      box-shadow:
        inset 0 1px 0 rgba(255, 255, 255, 0.28),
        0 10px 18px rgba(9, 39, 82, 0.16),
        0 0 18px rgba(76, 166, 255, 0.16);
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
    .detail-card-shell > * + * {
      margin-top: 18px;
    }
    .detail-card {
      border: 1px solid rgba(255, 255, 255, 0.06);
      border-radius: 20px;
      padding: 18px;
      background: rgba(255, 255, 255, 0.025);
      min-width: 0;
      overflow: hidden;
    }
    .detail-card--collapsible {
      padding: 0;
    }
    .detail-card__summary {
      display: block;
      list-style: none;
      cursor: pointer;
      padding: 18px;
    }
    .detail-card__summary::-webkit-details-marker {
      display: none;
    }
    .detail-card__summary::marker {
      content: "";
    }
    .detail-card__summary:focus-visible {
      outline: none;
      box-shadow: inset 0 0 0 2px rgba(92, 181, 255, 0.22);
    }
    .detail-card__summary--phase-overview {
      display: grid;
      gap: 12px;
    }
    .detail-card__summary-toggle {
      pointer-events: none;
      align-self: center;
    }
    .detail-card__summary-toggle-icon {
      transform: rotate(90deg);
    }
    .detail-card--collapsible[open] .detail-card__summary-toggle-icon {
      transform: rotate(-90deg);
    }
    .detail-card__body--phase-overview {
      padding: 0 18px 18px;
    }
    .detail-card--collapsible .review-regression {
      padding: 0 18px 18px;
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
    .detail-card__header--phase-overview {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 16px;
      align-items: center;
    }
    .detail-card__header--phase-overview h2 {
      margin: 0;
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
    .iteration-rail-toggle {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      align-self: center;
      width: 40px;
      height: 40px;
      padding: 0;
      border: 1px solid rgba(92, 181, 255, 0.18);
      border-radius: 999px;
      background:
        radial-gradient(circle at 30% 28%, rgba(255, 255, 255, 0.12), transparent 34%),
        linear-gradient(180deg, rgba(18, 32, 47, 0.94), rgba(11, 20, 30, 0.98));
      color: rgba(236, 246, 255, 0.94);
      box-shadow:
        inset 0 1px 0 rgba(255, 255, 255, 0.05),
        0 8px 24px rgba(4, 10, 18, 0.22);
      cursor: pointer;
      transition: transform 160ms ease, border-color 160ms ease, background 160ms ease, box-shadow 160ms ease;
    }
    .iteration-rail-toggle:hover {
      transform: translateY(-1px) scale(1.02);
      border-color: rgba(92, 181, 255, 0.34);
      background:
        radial-gradient(circle at 30% 28%, rgba(255, 255, 255, 0.15), transparent 36%),
        linear-gradient(180deg, rgba(22, 40, 58, 0.96), rgba(13, 24, 36, 0.99));
      box-shadow:
        inset 0 1px 0 rgba(255, 255, 255, 0.08),
        0 12px 26px rgba(4, 10, 18, 0.28);
    }
    .iteration-rail-toggle:focus-visible {
      outline: none;
      border-color: rgba(92, 181, 255, 0.44);
      box-shadow:
        inset 0 1px 0 rgba(255, 255, 255, 0.08),
        0 0 0 3px rgba(92, 181, 255, 0.14),
        0 10px 26px rgba(4, 10, 18, 0.26);
    }
    .iteration-rail-toggle__icon {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 18px;
      height: 18px;
      transform: rotate(0deg);
      transition: transform 180ms ease;
    }
    .iteration-rail-toggle__icon svg {
      width: 18px;
      height: 18px;
      stroke: currentColor;
      stroke-width: 2.1;
      stroke-linecap: round;
      stroke-linejoin: round;
    }
    .iteration-rail-toggle__icon--expanded {
      transform: rotate(180deg);
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
    .workflow-action-button--icon {
      display: inline-flex;
      align-items: center;
      gap: 8px;
    }
    .workflow-action-button--icon svg {
      width: 14px;
      height: 14px;
      fill: currentColor;
      flex: 0 0 auto;
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
    .iteration-rail--collapsed .iteration-rail__item:not(.iteration-rail__item--latest) {
      display: none;
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
      grid-template-columns: auto minmax(0, 1fr) auto auto;
      gap: 12px;
      align-items: center;
      width: 100%;
      padding: 2px 0;
      border: none;
      background: transparent;
      color: inherit;
      text-align: left;
      cursor: pointer;
    }
    .approval-question-item__toggle:focus-visible {
      outline: none;
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
    .approval-question-item__chevron {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 18px;
      height: 18px;
      color: rgba(188, 220, 248, 0.72);
      transform: rotate(0deg);
      transition: transform 180ms ease, color 160ms ease;
    }
    .approval-question-item__chevron svg {
      width: 18px;
      height: 18px;
      stroke: currentColor;
      stroke-width: 2.1;
      stroke-linecap: round;
      stroke-linejoin: round;
    }
    .approval-question-item__chevron--expanded {
      transform: rotate(180deg);
      color: rgba(236, 246, 255, 0.92);
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
    .refinement-shell {
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
    .phase-input-copy--target {
      display: flex;
      align-items: center;
      gap: 8px;
      min-height: 30px;
    }
    .phase-input-copy__icon {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 28px;
      height: 28px;
      flex: 0 0 28px;
      border-radius: 999px;
      background: rgba(92, 181, 255, 0.14);
      color: rgba(180, 220, 255, 0.96);
      border: 1px solid rgba(92, 181, 255, 0.24);
    }
    .phase-input-copy__icon svg {
      width: 16px;
      height: 16px;
      fill: currentColor;
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
    .phase-input-select {
      min-height: 0;
      height: 52px;
      resize: none;
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
    .refinement-meta {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }
    .refinement-reason {
      margin: 0;
      line-height: 1.5;
      color: rgba(255, 255, 255, 0.82);
    }
    .refinement-list {
      display: grid;
      gap: 12px;
    }
    .refinement-context {
      margin-top: 18px;
      padding-top: 18px;
      border-top: 1px solid rgba(255, 255, 255, 0.08);
      display: grid;
      gap: 14px;
    }
    .refinement-context__copy h4 {
      margin: 0 0 8px;
      font-size: 1rem;
    }
    .refinement-context__copy p {
      margin: 0;
      color: rgba(241, 246, 255, 0.78);
      line-height: 1.55;
    }
    .detail-actions--refinement {
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
    .refinement-suggestions {
      display: grid;
      gap: 10px;
    }
    .refinement-suggestion {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 12px;
      align-items: start;
      padding: 12px 14px;
      border-radius: 16px;
      border: 1px solid rgba(114, 241, 184, 0.12);
      background: rgba(255, 255, 255, 0.03);
    }
    .refinement-suggestion__body {
      display: grid;
      gap: 4px;
      min-width: 0;
    }
    .refinement-suggestion__body strong {
      display: block;
      font-size: 0.96rem;
      line-height: 1.35;
      overflow-wrap: anywhere;
      word-break: break-word;
    }
    .refinement-suggestion__body span {
      display: block;
      color: rgba(241, 246, 255, 0.7);
      line-height: 1.4;
      overflow-wrap: anywhere;
      word-break: break-word;
    }
    .refinement-item {
      display: grid;
      gap: 8px;
    }
    .refinement-question-row {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 10px;
    }
    .refinement-question {
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
    .refinement-answer {
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
    .refinement-answer:focus {
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
      .graph-panel__viewport {
        min-height: 480px;
      }
      .graph-stage, .phase-graph {
        min-width: var(--graph-width-desktop-vertical, ${desktopGraphWidth}px);
        min-height: var(--graph-height-desktop-vertical, ${desktopGraphHeight}px);
      }
      .phase-graph[data-graph-layout-mode="horizontal"] {
        min-width: var(--graph-width-desktop-horizontal, ${desktopGraphWidth}px);
        min-height: var(--graph-height-desktop-horizontal, ${desktopGraphHeight}px);
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
      .graph-panel__head {
        flex-direction: column;
      }
      .graph-stage-actions {
        top: 0;
        width: 100%;
        justify-content: flex-start;
        flex-wrap: wrap;
      }
      .review-regression__header {
        grid-template-columns: 1fr;
      }
      .review-regression__stat {
        justify-items: start;
      }
      .phase-node {
        left: var(--phase-left-mobile-vertical);
        top: var(--phase-top-mobile-vertical);
        width: ${mobilePhaseNodeWidth}px;
        padding: 10px 12px 12px;
        border-radius: 20px;
      }
      .phase-graph[data-graph-layout-mode="horizontal"] .phase-node {
        left: var(--phase-left-mobile-horizontal);
        top: var(--phase-top-mobile-horizontal);
      }
      .phase-node-body {
        grid-template-columns: 46px minmax(0, 1fr);
        gap: 10px;
      }
      .phase-node-visual {
        width: 46px;
        height: 46px;
        border-radius: 15px;
      }
      .phase-node-visual svg {
        width: 22px;
        height: 22px;
      }
      .phase-node h3 {
        font-size: 0.95rem;
      }
      .phase-slug {
        font-size: 0.76rem;
      }
      .phase-role-badge,
      .graph-phase-status-icon,
      .phase-pause-toggle {
        min-width: 32px;
        width: 32px;
        height: 32px;
        border-radius: 11px;
      }
      .phase-tag {
        padding: 5px 9px;
        font-size: 0.62rem;
      }
      .graph-stage, .phase-graph {
        width: var(--graph-width-mobile-vertical, ${mobileGraphWidth}px);
        min-width: var(--graph-width-mobile-vertical, ${mobileGraphWidth}px);
        min-height: var(--graph-height-mobile-vertical, ${mobileGraphHeight}px);
      }
      .phase-graph[data-graph-layout-mode="horizontal"] {
        width: var(--graph-width-mobile-horizontal, ${mobileGraphWidth}px);
        min-width: var(--graph-width-mobile-horizontal, ${mobileGraphWidth}px);
        min-height: var(--graph-height-mobile-horizontal, ${mobileGraphHeight}px);
      }
      .graph-links--desktop {
        display: none;
      }
      .graph-loops--desktop {
        display: none;
      }
      .graph-links--mobile {
        display: none;
      }
      .graph-loops--mobile {
        display: none;
      }
      .phase-graph[data-graph-layout-mode="horizontal"] .graph-links--mobile-horizontal {
        display: block;
      }
      .phase-graph[data-graph-layout-mode="horizontal"] .graph-loops--mobile-horizontal {
        display: block;
      }
      .phase-graph[data-graph-layout-mode="vertical"] .graph-links--mobile-vertical {
        display: block;
      }
      .phase-graph[data-graph-layout-mode="vertical"] .graph-loops--mobile-vertical {
        display: block;
      }
      .graph-loop-box--desktop {
        display: none !important;
      }
      .phase-graph[data-graph-layout-mode="horizontal"] .graph-loop-box--mobile-horizontal {
        display: grid;
      }
      .phase-graph[data-graph-layout-mode="vertical"] .graph-loop-box--mobile-vertical {
        display: grid;
      }
      .graph-loop-box {
        grid-template-columns: 28px 1fr;
        gap: 10px;
        padding: 14px 14px 13px;
      }
      .graph-loop-box__icon {
        width: 28px;
        height: 28px;
      }
      .graph-loop-box__icon svg {
        width: 18px;
        height: 18px;
      }
      .graph-loop-box__label {
        font-size: 0.9rem;
      }
      .graph-legend {
        left: var(--graph-legend-left-mobile-vertical, 20px);
        top: var(--graph-legend-top-mobile-vertical, 1009px);
        width: 188px;
        padding: 16px 16px 14px;
      }
      .phase-graph[data-graph-layout-mode="horizontal"] .graph-legend {
        left: var(--graph-legend-left-mobile-horizontal, 20px);
        top: var(--graph-legend-top-mobile-horizontal, 539px);
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
      .refinement-suggestion {
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
          <h2 id="workflow-files-title">${(0, htmlEscape_1.escapeHtml)(workflow.usId)} files and context</h2>
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
  <div class="shell" data-workflow-shell data-us-id="${(0, htmlEscape_1.escapeHtmlAttr)(workflow.usId)}">
    <section class="panel hero">
      <div class="hero-head">
        <div class="hero-main">
          <div class="hero-caption">
            <p class="eyebrow">SpecForge.AI Workflow Graph</p>
            ${state.runtimeVersion ? `<span class="runtime-version">v.${(0, htmlEscape_1.escapeHtml)(state.runtimeVersion)}</span>` : ""}
          </div>
          <h1>${(0, htmlEscape_1.escapeHtml)(buildWorkflowHeroTitle(workflow))}</h1>
          <div class="hero-meta">
            <span class="token accent">${(0, htmlEscape_1.escapeHtml)(workflow.category)}</span>
            <span class="token${heroTokenClass(workflow.status)}">${(0, htmlEscape_1.escapeHtml)(workflow.status)}</span>
            <span class="token">${(0, htmlEscape_1.escapeHtml)(displayedPhaseId)}</span>
            ${pendingRewindPhaseId ? `<span class="token token--attention">rewind:${(0, htmlEscape_1.escapeHtml)(pendingRewindPhaseId)}</span>` : ""}
            <span class="token">${(0, htmlEscape_1.escapeHtml)(workflow.workBranch ?? "branch:not-created")}</span>
            <span class="token${heroTokenClass(`runner:${playbackState}`)}">runner:${(0, htmlEscape_1.escapeHtml)(playbackState)}</span>
            ${rewindBlockedToken}
          </div>
        </div>
        <div class="control-strip">
          ${pullRequestUrl
        ? `<button class="workflow-action-button workflow-action-button--document workflow-action-button--icon" type="button" data-command="openExternalUrl" data-url="${(0, htmlEscape_1.escapeHtmlAttr)(pullRequestUrl)}">${(0, icons_1.externalLinkIcon)()}<span>${(0, htmlEscape_1.escapeHtml)(pullRequestLabel)}</span></button>`
        : ""}
          ${playbackButtons}
          <button class="icon-button icon-button--document" type="button" data-open-workflow-files aria-label="Open workflow files">
            ${(0, icons_1.fileIcon)()}
          </button>
        </div>
      </div>
      ${implementationReviewLimitBanner}
    </section>
    <div class="shell-body">
      <section class="layout">
        <div class="layout-main">
        <aside class="panel graph-panel">
          <div class="graph-panel__head">
            <div>
              <h2 class="panel-title">Workflow Constellation</h2>
              <p class="panel-copy">The graph is the primary surface. Click any phase node to move the detail focus and inspect its artifact and phase context.</p>
            </div>
            <div class="graph-stage-actions">
              <button
                class="graph-stage-action-button"
                type="button"
                data-graph-zoom-out
                aria-label="Zoom out workflow graph"
                title="Zoom out workflow graph">
                ${zoomOutIcon()}
              </button>
              <button
                class="graph-stage-action-button"
                type="button"
                data-graph-auto-fit
                aria-label="Set workflow graph zoom to 100%"
                title="Set workflow graph zoom to 100%">
                ${fitGraphIcon()}
              </button>
              <button
                class="graph-stage-action-button"
                type="button"
                data-graph-fit-width
                aria-label="Fit workflow graph to panel width"
                title="Fit workflow graph to panel width">
                ${fitWidthGraphIcon()}
              </button>
              <button
                class="graph-stage-action-button"
                type="button"
                data-graph-zoom-in
                aria-label="Zoom in workflow graph"
                title="Zoom in workflow graph">
                ${zoomInIcon()}
              </button>
              <button
                class="graph-stage-action-button"
                type="button"
                data-export-workflow-snapshot
                aria-label="Copy workflow snapshot to clipboard"
                title="Copy workflow snapshot to clipboard">
                ${(0, icons_1.cameraIcon)()}
              </button>
            </div>
          </div>
          <div class="graph-panel__viewport" data-panel-scroll="graph">
            <div class="graph-stage${executionOverlay ? " graph-stage--overlay-active" : ""}${playbackState === "playing" || playbackState === "stopping" ? " graph-stage--overlay-blocking" : ""}" style="${graphStageLegendStyle}">
              <div class="graph-stage__canvas" data-graph-stage-canvas>
                ${executionOverlay}
                ${phaseGraph}
                ${renderGraphLegend(workflow.usId)}
              </div>
            </div>
          </div>
        </aside>
        <main class="panel detail-panel" data-panel-scroll="detail">
          <div class="detail-card-shell">
            ${detailActions}
            ${selectedPhaseOverview}
            ${completedPhaseTopSections}
          </div>
          ${workflowUsageDashboard}
          ${modelUsageTable}
          ${phaseUsageTable}
          ${buildPhaseSecuritySummary(selectedPhase.executionReadiness)}
          ${regularBeforeArtifactSections}
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
    ${timelineRewindDock}
  </div>
  <script nonce="${scriptNonce}">
    const vscode = (() => {
      if (window.__specForgeVsCodeApi) {
        return window.__specForgeVsCodeApi;
      }

      const acquiredApi = acquireVsCodeApi();
      window.__specForgeVsCodeApi = acquiredApi;
      return acquiredApi;
    })();
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
    const graphStage = document.querySelector(".graph-stage");
    const graphStageCanvas = document.querySelector("[data-graph-stage-canvas]");
    const phaseGraph = document.querySelector(".phase-graph");
    const graphZoomInButton = document.querySelector("[data-graph-zoom-in]");
    const graphZoomOutButton = document.querySelector("[data-graph-zoom-out]");
    const graphAutoFitButton = document.querySelector("[data-graph-auto-fit]");
    const graphFitWidthButton = document.querySelector("[data-graph-fit-width]");
    const completedReopenTargetPhaseByReason = ${JSON.stringify({
        "merge-conflict": "implementation",
        defect: "implementation",
        "functional-issue": "spec",
        "technical-issue": "technical-design"
    })};
    const completedReopenTargetDescriptors = ${JSON.stringify({
        implementation: {
            title: "Implementation",
            iconHtml: (0, icons_1.workflowPhaseIcon)("implementation")
        },
        spec: {
            title: "Spec",
            iconHtml: (0, icons_1.workflowPhaseIcon)("spec")
        },
        "technical-design": {
            title: "Technical Design",
            iconHtml: (0, icons_1.workflowPhaseIcon)("technical-design")
        }
    })};
    const graphLegendElements = Array.from(document.querySelectorAll("[data-graph-legend]"));
    const exportWorkflowSnapshotButton = document.querySelector("[data-export-workflow-snapshot]");
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
    const graphZoomMin = 0.35;
    const graphZoomMax = 2.2;
    const graphZoomStep = 0.12;
    const configuredGraphInitialZoomMode = ${JSON.stringify(state.graphInitialZoomMode === "fit-width" ? "fit-width" : "actual-size")};
    const graphZoomState = {
      mode: configuredGraphInitialZoomMode === "fit-width" ? "fit-width" : "manual",
      scale: 1
    };
    let shouldCenterGraphOnInitialZoom = configuredGraphInitialZoomMode === "actual-size";
    const graphPointerState = {
      clientX: null,
      clientY: null
    };
    const getGraphZoomScale = () => graphZoomState.scale;
    const measureGraphContentBounds = () => {
      if (!(phaseGraph instanceof HTMLElement)) {
        return { left: 0, top: 0, right: 1, bottom: 1, width: 1, height: 1 };
      }

      let minLeft = Number.POSITIVE_INFINITY;
      let minTop = Number.POSITIVE_INFINITY;
      let maxRight = 0;
      let maxBottom = 0;
      const includeBounds = (left, top, width, height) => {
        if (!Number.isFinite(left) || !Number.isFinite(top) || !Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
          return;
        }

        minLeft = Math.min(minLeft, left);
        minTop = Math.min(minTop, top);
        maxRight = Math.max(maxRight, left + width);
        maxBottom = Math.max(maxBottom, top + height);
      };

      for (const element of Array.from(phaseGraph.querySelectorAll(".phase-node, .graph-loop-box, .graph-legend"))) {
        if (!(element instanceof HTMLElement) || element.hidden) {
          continue;
        }

        includeBounds(element.offsetLeft, element.offsetTop, element.offsetWidth, element.offsetHeight);
      }

      for (const path of Array.from(phaseGraph.querySelectorAll(".graph-links path, .graph-loops path, .graph-reopen-preview__path"))) {
        if (!(path instanceof SVGGraphicsElement)) {
          continue;
        }

        const ownerSvg = path.ownerSVGElement;
        if (ownerSvg instanceof SVGSVGElement && ownerSvg.hidden) {
          continue;
        }

        try {
          const bbox = path.getBBox();
          const svgLeft = ownerSvg instanceof SVGSVGElement ? Number.parseFloat(ownerSvg.style.left || "0") || 0 : 0;
          const svgTop = ownerSvg instanceof SVGSVGElement ? Number.parseFloat(ownerSvg.style.top || "0") || 0 : 0;
          includeBounds(svgLeft + bbox.x, svgTop + bbox.y, bbox.width, bbox.height);
        } catch {
          // Some SVG runtimes throw for non-rendered paths; visible graph nodes still define the usable bounds.
        }
      }

      if (!Number.isFinite(minLeft) || !Number.isFinite(minTop)) {
        return { left: 0, top: 0, right: 1, bottom: 1, width: 1, height: 1 };
      }

      const padding = 28;
      const left = Math.max(0, minLeft - padding);
      const top = Math.max(0, minTop - padding);
      const right = Math.max(left + 1, maxRight + padding);
      const bottom = Math.max(top + 1, maxBottom + padding);
      return {
        left,
        top,
        right,
        bottom,
        width: right - left,
        height: bottom - top
      };
    };
    const measureGraphStageCanvasBounds = () => {
      if (!(graphStageCanvas instanceof HTMLElement)) {
        return { width: 0, height: 0 };
      }

      let maxRight = 0;
      let maxBottom = 0;
      for (const child of Array.from(graphStageCanvas.children)) {
        if (!(child instanceof HTMLElement || child instanceof SVGElement)) {
          continue;
        }

        const childLeft = child instanceof HTMLElement ? child.offsetLeft : 0;
        const childTop = child instanceof HTMLElement ? child.offsetTop : 0;
        const childWidth = child instanceof HTMLElement ? child.offsetWidth : child.getBoundingClientRect().width;
        const childHeight = child instanceof HTMLElement ? child.offsetHeight : child.getBoundingClientRect().height;
        maxRight = Math.max(maxRight, childLeft + childWidth);
        maxBottom = Math.max(maxBottom, childTop + childHeight);
      }

      return {
        width: Math.max(maxRight, graphStageCanvas.scrollWidth, graphStageCanvas.offsetWidth, 1),
        height: Math.max(maxBottom, graphStageCanvas.scrollHeight, graphStageCanvas.offsetHeight, 1)
      };
    };
    const measureGraphPanelViewport = () => {
      if (!(graphPanel instanceof HTMLElement) || !(graphStage instanceof HTMLElement)) {
        return { availableWidth: 120, availableHeight: 120 };
      }

      const panelStyle = window.getComputedStyle(graphPanel);
      const paddingLeft = Number.parseFloat(panelStyle.paddingLeft) || 0;
      const paddingRight = Number.parseFloat(panelStyle.paddingRight) || 0;
      const paddingBottom = Number.parseFloat(panelStyle.paddingBottom) || 0;
      const availableWidth = Math.max(120, graphPanel.clientWidth - paddingLeft - paddingRight);
      const stageTop = graphStage.offsetTop;
      const availableHeight = Math.max(120, graphPanel.clientHeight - stageTop - paddingBottom);
      return { availableWidth, availableHeight };
    };
    const computeAutoFitGraphZoom = () => {
      const contentBounds = measureGraphContentBounds();
      const { availableWidth, availableHeight } = measureGraphPanelViewport();
      const widthRatio = availableWidth / Math.max(1, contentBounds.width);
      const heightRatio = availableHeight / Math.max(1, contentBounds.height);
      return Math.max(graphZoomMin, Math.min(graphZoomMax, Math.min(widthRatio, heightRatio)));
    };
    const computeFitWidthGraphZoom = () => {
      const canvasBounds = measureGraphStageCanvasBounds();
      const { availableWidth } = measureGraphPanelViewport();
      return Math.max(graphZoomMin, Math.min(graphZoomMax, availableWidth / Math.max(1, canvasBounds.width)));
    };
    const resolveGraphZoomViewportAnchor = (clientX, clientY) => {
      if (!(graphPanel instanceof HTMLElement)) {
        return { viewportX: 0, viewportY: 0 };
      }

      const panelRect = graphPanel.getBoundingClientRect();
      const hasPointer = Number.isFinite(clientX) && Number.isFinite(clientY);
      const fallbackClientX = Number.isFinite(graphPointerState.clientX) ? graphPointerState.clientX : null;
      const fallbackClientY = Number.isFinite(graphPointerState.clientY) ? graphPointerState.clientY : null;
      const resolvedClientX = hasPointer ? clientX : fallbackClientX;
      const resolvedClientY = hasPointer ? clientY : fallbackClientY;
      const viewportX = resolvedClientX === null
        ? graphPanel.clientWidth / 2
        : Math.max(0, Math.min(graphPanel.clientWidth, resolvedClientX - panelRect.left));
      const viewportY = resolvedClientY === null
        ? graphPanel.clientHeight / 2
        : Math.max(0, Math.min(graphPanel.clientHeight, resolvedClientY - panelRect.top));

      return { viewportX, viewportY };
    };
    const applyGraphZoom = (scale, mode, anchor = {}) => {
      if (!(graphStage instanceof HTMLElement) || !(graphPanel instanceof HTMLElement)) {
        return;
      }

      const previousScale = Math.max(graphZoomMin, Math.min(graphZoomMax, getGraphZoomScale()));
      const nextScale = Math.max(graphZoomMin, Math.min(graphZoomMax, scale));
      const { viewportX, viewportY } = resolveGraphZoomViewportAnchor(anchor.clientX, anchor.clientY);
      const contentX = (graphPanel.scrollLeft + viewportX) / previousScale;
      const contentY = (graphPanel.scrollTop + viewportY) / previousScale;
      const canvasBounds = measureGraphStageCanvasBounds();
      graphZoomState.mode = mode;
      graphZoomState.scale = nextScale;
      graphStage.style.setProperty("--graph-stage-zoom", String(nextScale));
      graphStage.style.width = Math.max(1, Math.ceil(canvasBounds.width * nextScale)) + "px";
      graphStage.style.height = Math.max(1, Math.ceil(canvasBounds.height * nextScale)) + "px";
      if (graphZoomOutButton instanceof HTMLButtonElement) {
        graphZoomOutButton.disabled = nextScale <= graphZoomMin + 0.001;
      }
      if (graphZoomInButton instanceof HTMLButtonElement) {
        graphZoomInButton.disabled = nextScale >= graphZoomMax - 0.001;
      }
      window.requestAnimationFrame(() => {
        graphPanel.scrollLeft = Math.max(0, (contentX * nextScale) - viewportX);
        graphPanel.scrollTop = Math.max(0, (contentY * nextScale) - viewportY);
      });
    };
    const autoFitGraph = () => {
      applyGraphZoom(computeAutoFitGraphZoom(), "fit");
    };
    const fitGraphWidth = () => {
      applyGraphZoom(computeFitWidthGraphZoom(), "fit-width");
    };
    const setManualGraphZoom = (scale) => {
      applyGraphZoom(scale, "manual");
    };
    const setActualSizeGraphZoom = () => {
      applyGraphZoom(1, "manual");
    };
    const centerGraphInViewport = () => {
      if (!(graphPanel instanceof HTMLElement)) {
        return;
      }

      const zoomScale = getGraphZoomScale();
      const contentBounds = measureGraphContentBounds();
      const contentCenterX = (contentBounds.left + (contentBounds.width / 2)) * zoomScale;
      const contentCenterY = (contentBounds.top + (contentBounds.height / 2)) * zoomScale;
      graphPanel.scrollLeft = Math.max(0, contentCenterX - (graphPanel.clientWidth / 2));
      graphPanel.scrollTop = Math.max(0, contentCenterY - (graphPanel.clientHeight / 2));
    };
    const centerFocusedPhaseInGraph = () => {
      if (!(graphPanel instanceof HTMLElement) || !(focusedPhaseNode instanceof HTMLElement) || !focusedPhaseId) {
        return;
      }

      const zoomScale = getGraphZoomScale();
      const targetTop = (focusedPhaseNode.offsetTop * zoomScale) - ((graphPanel.clientHeight - (focusedPhaseNode.offsetHeight * zoomScale)) / 2);
      const targetLeft = (focusedPhaseNode.offsetLeft * zoomScale) - ((graphPanel.clientWidth - (focusedPhaseNode.offsetWidth * zoomScale)) / 2);
      graphPanel.scrollTop = Math.max(0, targetTop);
      graphPanel.scrollLeft = Math.max(0, targetLeft);
    };
    const getPhaseNodeById = (phaseId) => {
      if (!(phaseGraph instanceof HTMLElement) || !phaseId) {
        return null;
      }

      const escapedPhaseId = typeof CSS !== "undefined" && typeof CSS.escape === "function"
        ? CSS.escape(phaseId)
        : phaseId.replace(/"/g, '\\"');
      const phaseNode = phaseGraph.querySelector('.phase-node[data-phase-id="' + escapedPhaseId + '"]');
      return phaseNode instanceof HTMLElement ? phaseNode : null;
    };
    const getOrCreateReopenPreviewOverlay = () => {
      if (!(phaseGraph instanceof HTMLElement)) {
        return { overlay: null, path: null };
      }

      let overlay = phaseGraph.querySelector("[data-graph-reopen-preview]");
      if (!(overlay instanceof SVGSVGElement)) {
        overlay = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        overlay.setAttribute("class", "graph-reopen-preview");
        overlay.setAttribute("data-graph-reopen-preview", "true");
        overlay.setAttribute("aria-hidden", "true");
        overlay.setAttribute("preserveAspectRatio", "none");
        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        path.setAttribute("class", "graph-reopen-preview__path");
        overlay.appendChild(path);
        phaseGraph.appendChild(overlay);
      }

      const path = overlay.querySelector("path");
      return {
        overlay,
        path: path instanceof SVGPathElement ? path : null
      };
    };
    const resolveCompletedReopenTargetPhaseId = (reasonKind) => {
      const normalizedReasonKind = typeof reasonKind === "string"
        ? reasonKind.trim()
        : "";
      return completedReopenTargetPhaseByReason[normalizedReasonKind] ?? "";
    };
    const buildReopenPreviewPath = (fromNode, toNode) => {
      const startCenterX = fromNode.offsetLeft + (fromNode.offsetWidth / 2);
      const startCenterY = fromNode.offsetTop + (fromNode.offsetHeight / 2);
      const targetCenterX = toNode.offsetLeft + (toNode.offsetWidth / 2);
      const targetCenterY = toNode.offsetTop + (toNode.offsetHeight / 2);
      const horizontalDirection = targetCenterX >= startCenterX ? 1 : -1;
      const startX = startCenterX + ((fromNode.offsetWidth / 2) * horizontalDirection);
      const startY = startCenterY;
      const targetX = targetCenterX - ((toNode.offsetWidth / 2) * horizontalDirection);
      const targetY = targetCenterY;
      const horizontalDistance = Math.abs(targetX - startX);
      const verticalDistance = Math.abs(targetY - startY);
      const curveX = Math.max(88, Math.min(220, horizontalDistance * 0.42));
      const curveY = Math.max(16, Math.min(72, verticalDistance * 0.18));
      const control1X = startX + (curveX * horizontalDirection);
      const control1Y = startY - curveY;
      const control2X = targetX - (curveX * horizontalDirection);
      const control2Y = targetY + curveY;

      return [
        "M", startX, startY,
        "C", control1X, control1Y, control2X, control2Y, targetX, targetY
      ].join(" ");
    };
    const hideReopenPreviewPath = () => {
      const { overlay, path } = getOrCreateReopenPreviewOverlay();
      if (overlay instanceof SVGSVGElement) {
        overlay.hidden = true;
      }
      if (path instanceof SVGPathElement) {
        path.removeAttribute("d");
      }
    };
    const clearReopenTargetHighlight = () => {
      if (!(phaseGraph instanceof HTMLElement)) {
        return;
      }

      for (const node of phaseGraph.querySelectorAll(".phase-node--reopen-target")) {
        node.classList.remove("phase-node--reopen-target");
      }
    };
    const resolvePhaseTitleById = (phaseId) => {
      const phaseNode = getPhaseNodeById(phaseId);
      const titleElement = phaseNode instanceof HTMLElement ? phaseNode.querySelector("h3") : null;
      if (titleElement instanceof HTMLElement) {
        return titleElement.textContent?.trim() ?? phaseId;
      }

      const fallbackDescriptor = completedReopenTargetDescriptors[phaseId];
      return fallbackDescriptor?.title ?? phaseId;
    };
    const resolvePhaseIconHtmlById = (phaseId) => {
      const phaseNode = getPhaseNodeById(phaseId);
      const iconElement = phaseNode instanceof HTMLElement ? phaseNode.querySelector(".phase-node-visual") : null;
      if (iconElement instanceof HTMLElement) {
        return iconElement.innerHTML;
      }

      const fallbackDescriptor = completedReopenTargetDescriptors[phaseId];
      return fallbackDescriptor?.iconHtml ?? "";
    };
    const syncReopenTargetHighlight = (targetPhaseId) => {
      clearReopenTargetHighlight();
      if (!targetPhaseId) {
        return;
      }

      const targetNode = getPhaseNodeById(targetPhaseId);
      if (targetNode instanceof HTMLElement) {
        targetNode.classList.add("phase-node--reopen-target");
      }
    };
    const renderCompletedReopenTargetMessage = (targetPhaseId) => {
      if (!(completedReopenTargetMessage instanceof HTMLElement)) {
        return;
      }

      completedReopenTargetMessage.classList.toggle("phase-input-copy--target", Boolean(targetPhaseId));
      if (!targetPhaseId) {
        completedReopenTargetMessage.textContent = "Select a reopen reason to see the destination phase.";
        return;
      }

      const iconHtml = resolvePhaseIconHtmlById(targetPhaseId);
      const title = resolvePhaseTitleById(targetPhaseId);
      completedReopenTargetMessage.replaceChildren();
      if (iconHtml) {
        const iconContainer = document.createElement("span");
        iconContainer.className = "phase-input-copy__icon";
        iconContainer.setAttribute("aria-hidden", "true");
        iconContainer.innerHTML = iconHtml;
        completedReopenTargetMessage.appendChild(iconContainer);
      }

      const copy = document.createElement("span");
      copy.appendChild(document.createTextNode("Workflow will return to phase "));
      const strong = document.createElement("strong");
      strong.textContent = title;
      copy.appendChild(strong);
      copy.appendChild(document.createTextNode("."));
      completedReopenTargetMessage.appendChild(copy);
    };
    const ensureReopenTargetVisible = (targetPhaseId) => {
      if (!(graphPanel instanceof HTMLElement)) {
        return;
      }

      const targetNode = getPhaseNodeById(targetPhaseId);
      if (!(targetNode instanceof HTMLElement)) {
        return;
      }

      const panelBounds = graphPanel.getBoundingClientRect();
      const targetBounds = targetNode.getBoundingClientRect();
      const verticalPadding = Math.max(24, Math.round(graphPanel.clientHeight * 0.08));
      const topComfort = panelBounds.top + verticalPadding;
      const bottomComfort = panelBounds.bottom - Math.max(24, Math.round(graphPanel.clientHeight * 0.18));
      const outsideVisibleZone = targetBounds.top < topComfort || targetBounds.bottom > bottomComfort;
      const horizontalOutside = targetBounds.left < panelBounds.left + 20 || targetBounds.right > panelBounds.right - 20;

      if (!outsideVisibleZone && !horizontalOutside) {
        return;
      }

      const zoomScale = getGraphZoomScale();
      const nextTop = Math.max(0, (targetNode.offsetTop * zoomScale) - verticalPadding);
      const nextLeft = Math.max(0, (targetNode.offsetLeft * zoomScale) - Math.max(24, Math.round((graphPanel.clientWidth - (targetNode.offsetWidth * zoomScale)) / 2)));
      graphPanel.scrollTo({
        top: nextTop,
        left: nextLeft,
        behavior: "smooth"
      });
    };
    const syncCompletedReopenPreviewPath = () => {
      const targetPhaseId = completedReopenReason instanceof HTMLSelectElement
        ? resolveCompletedReopenTargetPhaseId(completedReopenReason.value)
        : "";
      syncReopenTargetHighlight(targetPhaseId);
      if (!targetPhaseId) {
        hideReopenPreviewPath();
        return;
      }

      const sourceNode = getPhaseNodeById("completed");
      const targetNode = getPhaseNodeById(targetPhaseId);
      const { overlay, path } = getOrCreateReopenPreviewOverlay();
      if (!(sourceNode instanceof HTMLElement) || !(targetNode instanceof HTMLElement) || !(overlay instanceof SVGSVGElement) || !(path instanceof SVGPathElement) || !(phaseGraph instanceof HTMLElement)) {
        hideReopenPreviewPath();
        return;
      }

      const graphWidth = Math.max(1, phaseGraph.scrollWidth, phaseGraph.clientWidth);
      const graphHeight = Math.max(1, phaseGraph.scrollHeight, phaseGraph.clientHeight);
      overlay.setAttribute("viewBox", "0 0 " + graphWidth + " " + graphHeight);
      overlay.style.width = graphWidth + "px";
      overlay.style.height = graphHeight + "px";
      path.setAttribute("d", buildReopenPreviewPath(sourceNode, targetNode));
      overlay.hidden = false;
    };
    const autoScrollStateKey = workflowShell instanceof HTMLElement
      ? "specforge-ai:auto-scroll-phase:" + (workflowShell.dataset.usId ?? "")
      : "";
    const graphLegendDismissKey = workflowShell instanceof HTMLElement
      ? "specforge-ai:graph-legend-dismissed:" + (workflowShell.dataset.usId ?? "")
      : "";
    const syncGraphLegendVisibility = () => {
      let dismissed = false;
      if (graphLegendDismissKey) {
        try {
          dismissed = window.sessionStorage.getItem(graphLegendDismissKey) === "true";
        } catch {
          dismissed = false;
        }
      }

      for (const legendElement of graphLegendElements) {
        if (legendElement instanceof HTMLElement) {
          legendElement.hidden = dismissed;
        }
      }
    };
    syncGraphLegendVisibility();
    for (const legendElement of graphLegendElements) {
      if (!(legendElement instanceof HTMLElement)) {
        continue;
      }

      const dismissButton = legendElement.querySelector("[data-graph-legend-dismiss]");
      if (dismissButton instanceof HTMLButtonElement) {
        dismissButton.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          if (graphLegendDismissKey) {
            try {
              window.sessionStorage.setItem(graphLegendDismissKey, "true");
            } catch {
              // Ignore storage failures and still hide the legend for this render.
            }
          }
          syncGraphLegendVisibility();
        });
      }
    }
    const cloneElementForSnapshot = (sourceNode) => {
      if (!(sourceNode instanceof Element)) {
        return sourceNode.cloneNode(true);
      }

      const appendPseudoElementSnapshot = (sourceElement, targetElement, pseudoSelector) => {
        const pseudoStyle = window.getComputedStyle(sourceElement, pseudoSelector);
        if (!pseudoStyle) {
          return;
        }

        const content = pseudoStyle.getPropertyValue("content");
        const hasRenderablePseudo = pseudoStyle.display !== "none"
          && pseudoStyle.position !== ""
          && (content && content !== "none");
        if (!hasRenderablePseudo) {
          return;
        }

        const pseudoElement = document.createElement("span");
        pseudoElement.setAttribute("aria-hidden", "true");
        const inlineStyle = Array.from(pseudoStyle)
          .map((propertyName) => propertyName + ":" + pseudoStyle.getPropertyValue(propertyName) + ";")
          .join("");
        if (inlineStyle) {
          pseudoElement.setAttribute("style", inlineStyle);
        }

        const normalizedContent = content.replace(/^"(.*)"$/, "$1");
        if (normalizedContent) {
          pseudoElement.textContent = normalizedContent;
        }

        if (pseudoSelector === "::after") {
          targetElement.appendChild(pseudoElement);
          return;
        }

        targetElement.insertBefore(pseudoElement, targetElement.firstChild);
      };

      const clonedNode = sourceNode.cloneNode(false);
      if (!(clonedNode instanceof Element)) {
        return clonedNode;
      }

      const computedStyle = window.getComputedStyle(sourceNode);
      const inlineStyle = Array.from(computedStyle)
        .map((propertyName) => propertyName + ":" + computedStyle.getPropertyValue(propertyName) + ";")
        .join("");
      if (inlineStyle) {
        clonedNode.setAttribute("style", inlineStyle);
      }

      appendPseudoElementSnapshot(sourceNode, clonedNode, "::before");

      for (const childNode of Array.from(sourceNode.childNodes)) {
        clonedNode.appendChild(cloneElementForSnapshot(childNode));
      }

      appendPseudoElementSnapshot(sourceNode, clonedNode, "::after");

      if (sourceNode instanceof HTMLTextAreaElement || sourceNode instanceof HTMLInputElement) {
        clonedNode.setAttribute("value", sourceNode.value);
      }

      return clonedNode;
    };
    const applySnapshotBackground = (targetNode) => {
      if (!(targetNode instanceof HTMLElement)) {
        return;
      }

      const bodyStyle = window.getComputedStyle(document.body);
      const rootStyle = window.getComputedStyle(document.documentElement);
      targetNode.style.backgroundColor = bodyStyle.backgroundColor || rootStyle.backgroundColor || "#0a1418";
      targetNode.style.backgroundImage = bodyStyle.backgroundImage || rootStyle.backgroundImage || "none";
      targetNode.style.backgroundPosition = bodyStyle.backgroundPosition || rootStyle.backgroundPosition || "center";
      targetNode.style.backgroundSize = bodyStyle.backgroundSize || rootStyle.backgroundSize || "cover";
      targetNode.style.backgroundRepeat = bodyStyle.backgroundRepeat || rootStyle.backgroundRepeat || "no-repeat";
      targetNode.style.backgroundAttachment = "scroll";
    };
    const encodeSvgDataUri = (svgMarkup) => {
      const encoded = typeof window.btoa === "function"
        ? window.btoa(unescape(encodeURIComponent(svgMarkup)))
        : "";
      if (!encoded) {
        throw new Error("Unable to encode workflow snapshot markup.");
      }

      return "data:image/svg+xml;base64," + encoded;
    };
    const renderPngBlobFromMarkup = async (svgMarkup, captureWidth, captureHeight) => {
      const image = new Image();
      await new Promise((resolve, reject) => {
        image.onload = resolve;
        image.onerror = reject;
        image.src = encodeSvgDataUri(svgMarkup);
      });

      const canvas = document.createElement("canvas");
      canvas.width = captureWidth;
      canvas.height = captureHeight;
      const context = canvas.getContext("2d");
      if (!context) {
        throw new Error("Canvas 2D context is unavailable.");
      }

      context.drawImage(image, 0, 0);
      const blob = await new Promise((resolve, reject) => {
        canvas.toBlob((value) => {
          if (value) {
            resolve(value);
            return;
          }

          reject(new Error("PNG encoding failed."));
        }, "image/png");
      });

      if (!(blob instanceof Blob)) {
        throw new Error("PNG encoding failed.");
      }

      return blob;
    };
    const writeSnapshotBlobToClipboard = async (blob, successMessage) => {
      if (!navigator.clipboard || typeof navigator.clipboard.write !== "function" || typeof ClipboardItem === "undefined") {
        throw new Error("Clipboard image copy is unavailable in this VS Code runtime.");
      }

      await navigator.clipboard.write([
        new ClipboardItem({
          [blob.type]: blob
        })
      ]);
      vscode.postMessage({
        command: "workflowSnapshotCopied",
        detail: successMessage
      });
    };
    const exportWorkflowSnapshot = async () => {
      if (!(workflowShell instanceof HTMLElement) || !(graphPanel instanceof HTMLElement) || !(phaseGraph instanceof HTMLElement)) {
        return;
      }

      if (!(graphStage instanceof HTMLElement)) {
        return;
      }

      const captureBounds = measureGraphStageCanvasBounds();
      const captureWidth = Math.ceil(captureBounds.width);
      const captureHeight = Math.ceil(captureBounds.height);
      const clonedGraphStage = cloneElementForSnapshot(graphStage);
      if (!(clonedGraphStage instanceof HTMLElement)) {
        return;
      }

      const clonedExecutionOverlay = clonedGraphStage.querySelector(".execution-overlay");
      if (clonedExecutionOverlay instanceof HTMLElement) {
        clonedExecutionOverlay.remove();
      }

      clonedGraphStage.style.width = captureWidth + "px";
      clonedGraphStage.style.minWidth = captureWidth + "px";
      clonedGraphStage.style.height = captureHeight + "px";
      clonedGraphStage.style.minHeight = captureHeight + "px";
      clonedGraphStage.style.overflow = "visible";
      clonedGraphStage.style.padding = "0";
      clonedGraphStage.style.margin = "0";
      clonedGraphStage.style.transform = "none";
      clonedGraphStage.style.boxSizing = "border-box";
      applySnapshotBackground(clonedGraphStage);

      const clonedGraphStageCanvas = clonedGraphStage.querySelector("[data-graph-stage-canvas]");
      if (clonedGraphStageCanvas instanceof HTMLElement) {
        clonedGraphStageCanvas.style.transform = "none";
        clonedGraphStageCanvas.style.width = captureWidth + "px";
        clonedGraphStageCanvas.style.height = captureHeight + "px";
      }

      const clonedPhaseGraph = clonedGraphStage.querySelector(".phase-graph");
      if (clonedPhaseGraph instanceof HTMLElement) {
        clonedPhaseGraph.style.width = captureWidth + "px";
        clonedPhaseGraph.style.minWidth = captureWidth + "px";
        clonedPhaseGraph.style.height = captureHeight + "px";
        clonedPhaseGraph.style.minHeight = captureHeight + "px";
      }

      const serializedMarkup = new XMLSerializer().serializeToString(clonedGraphStage);
      const svgMarkup =
        '<svg xmlns="http://www.w3.org/2000/svg" width="' + captureWidth + '" height="' + captureHeight + '" viewBox="0 0 ' + captureWidth + ' ' + captureHeight + '">'
        + '<foreignObject width="100%" height="100%">'
        + '<div xmlns="http://www.w3.org/1999/xhtml" style="width:' + captureWidth + 'px;height:' + captureHeight + 'px;">'
        + serializedMarkup
        + "</div>"
        + "</foreignObject>"
        + "</svg>";

      try {
        const pngBlob = await renderPngBlobFromMarkup(svgMarkup, captureWidth, captureHeight);
        await writeSnapshotBlobToClipboard(pngBlob, "Workflow snapshot copied to clipboard.");
      } catch (error) {
        try {
          const svgBlob = new Blob([svgMarkup], { type: "image/svg+xml" });
          await writeSnapshotBlobToClipboard(svgBlob, "Workflow snapshot copied to clipboard as SVG.");
        } catch (clipboardFallbackError) {
          const detailSource = clipboardFallbackError instanceof Error
            ? clipboardFallbackError
            : error instanceof Error
              ? error
              : String(error);
          vscode.postMessage({
            command: "webviewClientError",
            detail: "snapshot:" + (detailSource instanceof Error ? detailSource.message : String(detailSource))
          });
        }
      }
    };
    if (exportWorkflowSnapshotButton instanceof HTMLButtonElement) {
      exportWorkflowSnapshotButton.addEventListener("click", () => {
        void exportWorkflowSnapshot();
      });
    }
    window.requestAnimationFrame(() => {
      if (graphZoomState.mode === "manual") {
        applyGraphZoom(graphZoomState.scale, "manual");
      } else if (graphZoomState.mode === "fit-width") {
        fitGraphWidth();
      } else {
        autoFitGraph();
      }
      if (shouldCenterGraphOnInitialZoom) {
        window.requestAnimationFrame(() => centerGraphInViewport());
        window.setTimeout(() => centerGraphInViewport(), 80);
      } else if (graphZoomState.mode === "fit-width") {
        window.requestAnimationFrame(() => centerGraphInViewport());
      }
    });
    if (focusedPhaseNode instanceof HTMLElement && focusedPhaseId && autoScrollStateKey) {
      try {
        const previousPhaseId = window.sessionStorage.getItem(autoScrollStateKey) ?? "";
        const bounds = focusedPhaseNode.getBoundingClientRect();
        const panelBounds = graphPanel instanceof HTMLElement ? graphPanel.getBoundingClientRect() : null;
        const outsideComfortZone = panelBounds
          ? bounds.top < panelBounds.top + (panelBounds.height * 0.14) || bounds.bottom > panelBounds.bottom - (panelBounds.height * 0.18)
          : bounds.top < window.innerHeight * 0.14 || bounds.bottom > window.innerHeight * 0.82;
        if (previousPhaseId !== focusedPhaseId && outsideComfortZone) {
          shouldCenterGraphOnInitialZoom = false;
          window.requestAnimationFrame(() => {
            centerFocusedPhaseInGraph();
          });
        }
        if (!shouldCenterGraphOnInitialZoom) {
          window.requestAnimationFrame(() => centerFocusedPhaseInGraph());
          window.setTimeout(() => centerFocusedPhaseInGraph(), 80);
        }
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
          graphScrollLeft: graphPanel instanceof HTMLElement ? graphPanel.scrollLeft : 0,
          detailScrollTop: detailPanel instanceof HTMLElement ? detailPanel.scrollTop : 0,
          graphInitialZoomMode: configuredGraphInitialZoomMode,
          graphZoomMode: graphZoomState.mode,
          graphZoomScale: graphZoomState.scale
        });
      } catch {
        // Do not let view-state persistence break workflow interaction.
      }
    };
    const timeDockViewport = document.querySelector("[data-time-dock-viewport]");
    const centerCurrentTimeDockPoint = () => {
      if (!(timeDockViewport instanceof HTMLElement)) {
        return;
      }

      const activePoint = timeDockViewport.querySelector(".time-dock__point--current");
      if (!(activePoint instanceof HTMLElement)) {
        return;
      }

      const targetLeft = activePoint.offsetLeft - ((timeDockViewport.clientWidth - activePoint.offsetWidth) / 2);
      timeDockViewport.scrollLeft = Math.max(0, targetLeft);
    };
    window.requestAnimationFrame(() => centerCurrentTimeDockPoint());
    document.querySelectorAll("[data-time-dock-scroll]").forEach((element) => {
      element.addEventListener("click", () => {
        if (!(timeDockViewport instanceof HTMLElement) || !(element instanceof HTMLElement)) {
          return;
        }

        const direction = element.dataset.timeDockScroll === "left" ? -1 : 1;
        timeDockViewport.scrollBy({
          left: direction * Math.max(220, Math.floor(timeDockViewport.clientWidth * 0.72)),
          behavior: "smooth"
        });
      });
    });
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
          url: element.dataset.url,
          kind: element.dataset.kind
        });
      } catch {
        // Last-resort swallow to avoid breaking the webview script.
      }
    };
    const syncIterationRailSection = (section, expanded) => {
      if (!(section instanceof HTMLElement)) {
        return;
      }

      const rail = section.querySelector(".iteration-rail");
      const toggle = section.querySelector("[data-iteration-rail-toggle]");
      const copy = section.querySelector("[data-iteration-rail-copy]");
      const icon = toggle instanceof HTMLElement
        ? toggle.querySelector(".iteration-rail-toggle__icon")
        : null;

      if (rail instanceof HTMLElement) {
        rail.classList.toggle("iteration-rail--expanded", expanded);
        rail.classList.toggle("iteration-rail--collapsed", !expanded);
      }

      if (toggle instanceof HTMLElement) {
        toggle.setAttribute("aria-expanded", expanded ? "true" : "false");
        toggle.setAttribute("aria-label", expanded ? "Collapse phase iterations" : "Expand phase iterations");
        toggle.setAttribute("title", expanded ? "Collapse phase iterations" : "Expand phase iterations");
      }

      if (icon instanceof HTMLElement) {
        icon.classList.toggle("iteration-rail-toggle__icon--expanded", expanded);
      }

      if (copy instanceof HTMLElement) {
        copy.textContent = expanded
          ? (copy.dataset.copyExpanded ?? copy.textContent ?? "")
          : (copy.dataset.copyCollapsed ?? copy.textContent ?? "");
      }
    };
    const toggleIterationRailLocally = (toggleElement) => {
      if (!(toggleElement instanceof HTMLElement)) {
        return;
      }

      const section = toggleElement.closest("[data-iteration-rail-section]");
      if (!(section instanceof HTMLElement)) {
        return;
      }

      const isExpanded = toggleElement.getAttribute("aria-expanded") === "true";
      const nextExpanded = !isExpanded;
      syncIterationRailSection(section, nextExpanded);

      const phaseId = toggleElement.dataset.phaseId ?? "";
      if (Array.isArray(viewState.expandedIterationPhaseIds)) {
        const nextPhaseIds = new Set(viewState.expandedIterationPhaseIds);
        if (nextExpanded) {
          nextPhaseIds.add(phaseId);
        } else {
          nextPhaseIds.delete(phaseId);
        }
        viewState.expandedIterationPhaseIds = [...nextPhaseIds];
      }
    };
    const markSelectedPhaseNode = (element) => {
      if (!(element instanceof HTMLElement) || element.dataset.command !== "selectPhase") {
        return;
      }

      document.querySelectorAll(".phase-node.selected").forEach((selectedElement) => {
        selectedElement.classList.remove("selected");
      });
      element.classList.add("selected");
    };
    const bindCommandElement = (element) => {
      if (!(element instanceof HTMLElement)) {
        return;
      }

      const command = element.dataset.command ?? "";
      if (!command || command === "approve" || command === "selectPhase") {
        return;
      }

      element.addEventListener("click", (event) => {
        if (element instanceof HTMLButtonElement && element.disabled) {
          return;
        }

        event.preventDefault();
        event.stopPropagation();
        if (command === "togglePhaseIterations") {
          toggleIterationRailLocally(element);
        }
        postCommand(element);
      });
    };
    const bindPhaseSelectionElement = (element) => {
      if (!(element instanceof HTMLElement)) {
        return;
      }

      element.addEventListener("pointerdown", (event) => {
        if (event.button !== 0) {
          return;
        }

        event.preventDefault();
        event.stopPropagation();
        markSelectedPhaseNode(element);
        postCommand(element);
      });
      element.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") {
          return;
        }

        event.preventDefault();
        event.stopPropagation();
        markSelectedPhaseNode(element);
        postCommand(element);
      });
    };
    document.querySelectorAll('[data-command="selectPhase"]').forEach((element) => {
      bindPhaseSelectionElement(element);
    });
    document.querySelectorAll("[data-command]").forEach((element) => {
      bindCommandElement(element);
    });
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
      const restoredGraphScrollLeft = typeof viewState.graphScrollLeft === "number" ? viewState.graphScrollLeft : null;
      if (!shouldCenterGraphOnInitialZoom && ((restoredGraphScrollTop !== null && restoredGraphScrollTop > 0) || (restoredGraphScrollLeft !== null && restoredGraphScrollLeft > 0))) {
        window.requestAnimationFrame(() => {
          graphPanel.scrollTop = Math.max(0, restoredGraphScrollTop ?? 0);
          graphPanel.scrollLeft = Math.max(0, restoredGraphScrollLeft ?? 0);
        });
      }
      graphPanel.addEventListener("scroll", () => {
        persistWorkflowScrollState();
      }, { passive: true });
      graphPanel.addEventListener("pointermove", (event) => {
        graphPointerState.clientX = event.clientX;
        graphPointerState.clientY = event.clientY;
      }, { passive: true });
    }
    if (graphZoomOutButton instanceof HTMLButtonElement) {
      graphZoomOutButton.addEventListener("click", () => {
        setManualGraphZoom(getGraphZoomScale() - graphZoomStep);
        persistWorkflowScrollState();
      });
    }
    if (graphZoomInButton instanceof HTMLButtonElement) {
      graphZoomInButton.addEventListener("click", () => {
        setManualGraphZoom(getGraphZoomScale() + graphZoomStep);
        persistWorkflowScrollState();
      });
    }
    if (graphAutoFitButton instanceof HTMLButtonElement) {
      graphAutoFitButton.addEventListener("click", () => {
        setActualSizeGraphZoom();
        window.requestAnimationFrame(() => {
          centerGraphInViewport();
          persistWorkflowScrollState();
        });
      });
    }
    if (graphFitWidthButton instanceof HTMLButtonElement) {
      graphFitWidthButton.addEventListener("click", () => {
        fitGraphWidth();
        window.requestAnimationFrame(() => {
          centerGraphInViewport();
          persistWorkflowScrollState();
        });
      });
    }
    if (graphPanel instanceof HTMLElement) {
      graphPanel.addEventListener("wheel", (event) => {
        if (!event.ctrlKey && !event.metaKey) {
          return;
        }

        event.preventDefault();
        const direction = event.deltaY > 0 ? -1 : 1;
        applyGraphZoom(getGraphZoomScale() + (graphZoomStep * direction), "manual", {
          clientX: event.clientX,
          clientY: event.clientY
        });
        persistWorkflowScrollState();
      }, { passive: false });
    }
    window.addEventListener("resize", () => {
      if (graphZoomState.mode === "fit") {
        autoFitGraph();
      } else if (graphZoomState.mode === "fit-width") {
        fitGraphWidth();
      } else {
        applyGraphZoom(graphZoomState.scale, "manual");
      }
    });
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
      const chevron = item.querySelector(".approval-question-item__chevron");
      if (!(toggle instanceof HTMLButtonElement) || !(editor instanceof HTMLElement)) {
        continue;
      }
      const syncApprovalQuestionToggle = () => {
        const expanded = !editor.hidden;
        toggle.setAttribute("aria-expanded", expanded ? "true" : "false");
        if (chevron instanceof HTMLElement) {
          chevron.classList.toggle("approval-question-item__chevron--expanded", expanded);
        }
      };
      syncApprovalQuestionToggle();
      toggle.addEventListener("click", () => {
        editor.hidden = !editor.hidden;
        syncApprovalQuestionToggle();
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

    const refinementSubmit = document.getElementById("submit-refinement-answers");
    if (refinementSubmit) {
      refinementSubmit.addEventListener("click", () => {
        const answers = Array.from(document.querySelectorAll("[data-refinement-answer]"))
          .sort((left, right) => Number(left.dataset.index) - Number(right.dataset.index))
          .map((element) => element.value ?? "");

        vscode.postMessage({
          command: "submitRefinementAnswers",
          answers
        });
      });
    }

    const specQuestionSubmit = document.getElementById("submit-spec-questions");
    if (specQuestionSubmit) {
      specQuestionSubmit.addEventListener("click", () => {
        const pairs = Array.from(document.querySelectorAll("[data-spec-question-answer]"))
          .sort((left, right) => Number(left.dataset.index) - Number(right.dataset.index))
          .map((element) => {
            const answer = (element.value ?? "").trim();
            const questionElement = element.parentElement?.querySelector(".refinement-question");
            const question = (questionElement?.textContent ?? "").replace(/^\\d+\\.\\s*/, "").trim();
            return question && answer ? { question, answer } : null;
          })
          .filter((value) => value !== null);

        if (pairs.length === 0) {
          return;
        }

        const prompt = [
          "Update the current spec artifact using these human answers.",
          "Preserve the existing section structure unless the artifact itself needs a structural correction.",
          "Resolve the blocking refinement points concretely inside the spec and remove or rewrite the blocking questions if they are no longer needed.",
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

    const completedReopenReason = document.querySelector("[data-completed-reopen-reason]");
    const completedReopenDescription = document.getElementById("completed-reopen-description");
    const completedReopenSubmitButton = document.querySelector("[data-submit-completed-reopen]");
    const completedReopenTargetMessage = document.querySelector("[data-completed-reopen-target-message]");
    const syncCompletedReopenState = () => {
      const reasonValue = completedReopenReason instanceof HTMLSelectElement
        ? completedReopenReason.value.trim()
        : "";
      const targetPhaseLabel = resolveCompletedReopenTargetPhaseId(reasonValue);
      renderCompletedReopenTargetMessage(targetPhaseLabel);

      if (!(completedReopenSubmitButton instanceof HTMLButtonElement)) {
        return;
      }

      const descriptionValue = completedReopenDescription instanceof HTMLTextAreaElement
        ? completedReopenDescription.value.trim()
        : "";
      completedReopenSubmitButton.disabled = reasonValue.length === 0 || descriptionValue.length === 0;
      syncCompletedReopenPreviewPath();
      if (targetPhaseLabel) {
        window.requestAnimationFrame(() => {
          ensureReopenTargetVisible(targetPhaseLabel);
        });
      }
    };

    if (completedReopenReason instanceof HTMLSelectElement) {
      completedReopenReason.addEventListener("input", syncCompletedReopenState);
      completedReopenReason.addEventListener("change", syncCompletedReopenState);
    }

    if (completedReopenDescription instanceof HTMLTextAreaElement) {
      completedReopenDescription.addEventListener("input", syncCompletedReopenState);
    }

    window.addEventListener("resize", () => {
      syncCompletedReopenPreviewPath();
    });

    syncCompletedReopenState();

    if (completedReopenSubmitButton instanceof HTMLButtonElement) {
      completedReopenSubmitButton.addEventListener("click", () => {
        const reasonKind = completedReopenReason instanceof HTMLSelectElement
          ? completedReopenReason.value.trim()
          : "";
        const description = completedReopenDescription instanceof HTMLTextAreaElement
          ? completedReopenDescription.value.trim()
          : "";
        if (!reasonKind || !description) {
          syncCompletedReopenState();
          return;
        }

        vscode.postMessage({
          command: "reopenCompletedWorkflow",
          reasonKind,
          description
        });
      });

      syncCompletedReopenState();
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
function buildPhaseGraph(workflow, state, selectedPhaseId, playbackState, effectiveExecutionPhaseId) {
    const executionPhaseId = playbackState === "playing" ? effectiveExecutionPhaseId : null;
    const pausedExecutionPhaseId = resolvePausedExecutionPhaseId(workflow, state, playbackState);
    const displayedCurrentPhaseId = resolveDisplayedCurrentPhaseId(workflow, state, effectiveExecutionPhaseId, pausedExecutionPhaseId, playbackState);
    const currentPhase = workflow.phases.find((phase) => phase.phaseId === displayedCurrentPhaseId)
        ?? workflow.phases.find((phase) => phase.isCurrent)
        ?? workflow.phases[0];
    const pausedPhaseIds = new Set(state.pausedPhaseIds ?? []);
    const completedPhaseIds = buildEffectiveCompletedPhaseIds(workflow, new Set(state.completedPhaseIds ?? []));
    const completedWorkflowLocked = workflow.status === "completed" && state.completedUsLockOnCompleted !== false;
    const refinementVisible = shouldShowRefinementPhase(workflow, executionPhaseId);
    const visiblePhases = workflow.phases.filter((phase) => shouldShowPhase(phase.phaseId, refinementVisible, currentPhase.phaseId, executionPhaseId));
    const layoutPhases = visiblePhases.map((phase) => ({
        phaseId: phase.phaseId,
        expectsHumanIntervention: phase.expectsHumanIntervention
    }));
    const graphLayoutMode = state.graphLayoutMode === "horizontal" ? "horizontal" : "vertical";
    const desktopHorizontalLegendPosition = (0, graphLayout_1.buildGraphLegendPosition)(state.workflowGraphLayout?.legend?.horizontal?.x ?? 28, state.workflowGraphLayout?.legend?.horizontal?.y ?? 748, false);
    const desktopVerticalLegendPosition = (0, graphLayout_1.buildGraphLegendPosition)(state.workflowGraphLayout?.legend?.vertical?.x ?? 28, state.workflowGraphLayout?.legend?.vertical?.y ?? 1402, false);
    const mobileHorizontalLegendPosition = (0, graphLayout_1.buildGraphLegendPosition)(state.workflowGraphLayout?.legend?.horizontal?.x ?? 28, state.workflowGraphLayout?.legend?.horizontal?.y ?? 748, true);
    const mobileVerticalLegendPosition = (0, graphLayout_1.buildGraphLegendPosition)(state.workflowGraphLayout?.legend?.vertical?.x ?? 28, state.workflowGraphLayout?.legend?.vertical?.y ?? 1402, true);
    const desktopHorizontalLayout = (0, graphLayout_1.buildHorizontalPhaseLayout)(layoutPhases, phaseNodeWidth, false, state.workflowGraphLayout?.horizontal ?? workflowGraphLayout_1.defaultHorizontalWorkflowGraphPositions);
    const desktopVerticalLayout = (0, graphLayout_1.buildVerticalPhaseLayout)(layoutPhases, phaseNodeWidth, false, state.workflowGraphLayout?.vertical ?? workflowGraphLayout_1.defaultVerticalWorkflowGraphPositions);
    const mobileHorizontalLayout = (0, graphLayout_1.buildHorizontalPhaseLayout)(layoutPhases, mobilePhaseNodeWidth, true, state.workflowGraphLayout?.horizontal ?? workflowGraphLayout_1.defaultHorizontalWorkflowGraphPositions);
    const mobileVerticalLayout = (0, graphLayout_1.buildVerticalPhaseLayout)(layoutPhases, mobilePhaseNodeWidth, true, state.workflowGraphLayout?.vertical ?? workflowGraphLayout_1.defaultVerticalWorkflowGraphPositions);
    const horizontalConnections = state.workflowGraphLayout?.connections?.horizontal ?? workflowGraphLayout_1.defaultHorizontalWorkflowGraphConnections;
    const verticalConnections = state.workflowGraphLayout?.connections?.vertical ?? workflowGraphLayout_1.defaultVerticalWorkflowGraphConnections;
    const horizontalLoops = state.workflowGraphLayout?.loops?.horizontal ?? workflowGraphLayout_1.defaultHorizontalWorkflowGraphLoops;
    const verticalLoops = state.workflowGraphLayout?.loops?.vertical ?? workflowGraphLayout_1.defaultVerticalWorkflowGraphLoops;
    const desktopHorizontalLinks = buildGraphLinks(visiblePhases, executionPhaseId, currentPhase.phaseId, completedPhaseIds, desktopHorizontalLayout.positions, phaseNodeWidth, "horizontal", horizontalConnections);
    const desktopVerticalLinks = buildGraphLinks(visiblePhases, executionPhaseId, currentPhase.phaseId, completedPhaseIds, desktopVerticalLayout.positions, phaseNodeWidth, "vertical", verticalConnections);
    const mobileHorizontalLinks = buildGraphLinks(visiblePhases, executionPhaseId, currentPhase.phaseId, completedPhaseIds, mobileHorizontalLayout.positions, mobilePhaseNodeWidth, "horizontal", horizontalConnections);
    const mobileVerticalLinks = buildGraphLinks(visiblePhases, executionPhaseId, currentPhase.phaseId, completedPhaseIds, mobileVerticalLayout.positions, mobilePhaseNodeWidth, "vertical", verticalConnections);
    const desktopHorizontalLoopOverlays = buildGraphLoopOverlays(workflow, visiblePhases, desktopHorizontalLayout.positions, phaseNodeWidth, graphLoopBoxWidth, graphLoopBoxHeight, horizontalLoops, selectedPhaseId);
    const desktopVerticalLoopOverlays = buildGraphLoopOverlays(workflow, visiblePhases, desktopVerticalLayout.positions, phaseNodeWidth, graphLoopBoxWidth, graphLoopBoxHeight, verticalLoops, selectedPhaseId);
    const mobileHorizontalLoopOverlays = buildGraphLoopOverlays(workflow, visiblePhases, mobileHorizontalLayout.positions, mobilePhaseNodeWidth, mobileGraphLoopBoxWidth, mobileGraphLoopBoxHeight, horizontalLoops, selectedPhaseId);
    const mobileVerticalLoopOverlays = buildGraphLoopOverlays(workflow, visiblePhases, mobileVerticalLayout.positions, mobilePhaseNodeWidth, mobileGraphLoopBoxWidth, mobileGraphLoopBoxHeight, verticalLoops, selectedPhaseId);
    const desktopHorizontalLoopPaths = renderGraphLoopPaths(desktopHorizontalLoopOverlays);
    const desktopVerticalLoopPaths = renderGraphLoopPaths(desktopVerticalLoopOverlays);
    const mobileHorizontalLoopPaths = renderGraphLoopPaths(mobileHorizontalLoopOverlays);
    const mobileVerticalLoopPaths = renderGraphLoopPaths(mobileVerticalLoopOverlays);
    const loopBoxes = renderGraphLoopBoxes(desktopHorizontalLoopOverlays, desktopVerticalLoopOverlays, mobileHorizontalLoopOverlays, mobileVerticalLoopOverlays);
    const desktopHorizontalLoopBounds = computeGraphLoopBounds(desktopHorizontalLoopOverlays);
    const desktopVerticalLoopBounds = computeGraphLoopBounds(desktopVerticalLoopOverlays);
    const mobileHorizontalLoopBounds = computeGraphLoopBounds(mobileHorizontalLoopOverlays);
    const mobileVerticalLoopBounds = computeGraphLoopBounds(mobileVerticalLoopOverlays);
    const desktopHorizontalGraphWidth = Math.max(desktopHorizontalLayout.width, desktopHorizontalLoopBounds.width);
    const desktopVerticalGraphWidth = Math.max(desktopVerticalLayout.width, desktopVerticalLoopBounds.width);
    const mobileHorizontalGraphWidth = Math.max(mobileHorizontalLayout.width, mobileHorizontalLoopBounds.width);
    const mobileVerticalGraphWidth = Math.max(mobileVerticalLayout.width, mobileVerticalLoopBounds.width);
    const desktopHorizontalGraphHeight = Math.max(desktopHorizontalLayout.height, desktopHorizontalLoopBounds.height);
    const desktopVerticalGraphHeight = Math.max(desktopVerticalLayout.height, desktopVerticalLoopBounds.height);
    const mobileHorizontalGraphHeight = Math.max(mobileHorizontalLayout.height, mobileHorizontalLoopBounds.height);
    const mobileVerticalGraphHeight = Math.max(mobileVerticalLayout.height, mobileVerticalLoopBounds.height);
    const nodes = visiblePhases.map((phase, index) => {
        const disabled = false;
        const visualTone = resolvePhaseVisualTone(workflow.status, workflow, playbackState, phase, disabled, executionPhaseId, pausedExecutionPhaseId, completedPhaseIds);
        const desktopHorizontalPosition = desktopHorizontalLayout.positions[phase.phaseId] ?? { left: 40, top: 36 };
        const desktopVerticalPosition = desktopVerticalLayout.positions[phase.phaseId] ?? { left: 38, top: 34 };
        const mobileHorizontalPosition = mobileHorizontalLayout.positions[phase.phaseId] ?? { left: 18, top: 18 };
        const mobileVerticalPosition = mobileVerticalLayout.positions[phase.phaseId] ?? { left: 18, top: 18 };
        const canPausePhase = (0, workflowPlaybackState_1.canPauseWorkflowExecutionPhase)(phase.phaseId) && phase.state === "pending";
        const pauseArmed = pausedPhaseIds.has(phase.phaseId);
        const phaseIsCurrent = phase.phaseId === displayedCurrentPhaseId;
        const phaseIsSelected = phase.phaseId === selectedPhaseId;
        const phaseSelectTargetId = phase.phaseId;
        const phaseRoleIcon = phase.expectsHumanIntervention ? (0, icons_1.userPhaseIcon)() : (0, icons_1.automationPhaseIcon)();
        const phaseRoleLabel = phase.expectsHumanIntervention ? "User step" : "Automated step";
        const phaseVisualIcon = (0, icons_1.workflowPhaseIcon)(phase.phaseId);
        const phaseHeaderMeta = phase.requiresApproval ? `<span class="phase-tag approval">approval</span>` : "";
        const pauseButtonLabel = pauseArmed
            ? `Remove pause before ${phase.title}`
            : `Pause before ${phase.title}`;
        const statusIcon = renderGraphPhaseStatusIcon(phase, visualTone, state.completedUsLockOnCompleted !== false);
        return `
    <div
      class="phase-node ${(0, htmlEscape_1.escapeHtmlAttr)(phase.phaseId)} phase-tone-${(0, htmlEscape_1.escapeHtmlAttr)(visualTone)}${phaseIsSelected ? " selected" : ""}${phaseIsCurrent ? " phase-node--current" : ""}${phase.phaseId === "completed" ? " phase-node--final" : ""}"
      data-command="selectPhase"
      data-phase-id="${(0, htmlEscape_1.escapeHtmlAttr)(phaseSelectTargetId)}"
      role="button"
      tabindex="0"
      style="--phase-left-desktop-horizontal: ${desktopHorizontalPosition.left}px; --phase-top-desktop-horizontal: ${desktopHorizontalPosition.top}px; --phase-left-desktop-vertical: ${desktopVerticalPosition.left}px; --phase-top-desktop-vertical: ${desktopVerticalPosition.top}px; --phase-left-mobile-horizontal: ${mobileHorizontalPosition.left}px; --phase-top-mobile-horizontal: ${mobileHorizontalPosition.top}px; --phase-left-mobile-vertical: ${mobileVerticalPosition.left}px; --phase-top-mobile-vertical: ${mobileVerticalPosition.top}px;">
      ${phaseIsCurrent ? `<span class="phase-current-rail"><span class="phase-current-rail__label">Current</span></span>` : ""}
      ${phaseIsSelected ? `<span class="phase-viewing-rail"><span class="phase-viewing-rail__label">Viewing</span></span>` : ""}
      <div class="phase-node-content${phaseIsCurrent ? " phase-node-content--current" : ""}">
        <div class="phase-node-header">
          <div class="phase-node-header-main">${phaseHeaderMeta}</div>
          ${canPausePhase
            ? `<button
                class="phase-pause-toggle${pauseArmed ? " phase-pause-toggle--armed" : ""}"
                type="button"
                data-command="togglePhasePause"
                data-phase-id="${(0, htmlEscape_1.escapeHtmlAttr)(phase.phaseId)}"
                data-phase-pause-button
                aria-label="${(0, htmlEscape_1.escapeHtmlAttr)(pauseButtonLabel)}"
                aria-pressed="${pauseArmed ? "true" : "false"}"
                title="${(0, htmlEscape_1.escapeHtmlAttr)(pauseButtonLabel)}">
                ${(0, icons_1.pauseIcon)()}
              </button>`
            : `<span class="phase-role-badge graph-phase-status-icon" title="${(0, htmlEscape_1.escapeHtmlAttr)(phaseRoleLabel)}" aria-label="${(0, htmlEscape_1.escapeHtmlAttr)(phaseRoleLabel)}">${statusIcon || phaseRoleIcon}</span>`}
        </div>
        <div class="phase-node-body">
          <span class="phase-node-visual" aria-hidden="true">${phaseVisualIcon}</span>
          <div class="phase-node-copy">
            <h3>${(0, htmlEscape_1.escapeHtml)(graphPhaseTitle(phase))}</h3>
            <div class="phase-slug">${(0, htmlEscape_1.escapeHtml)(graphPhaseSecondaryLabel(phase))}</div>
          </div>
        </div>
      </div>
    </div>
  `;
    }).join("");
    return `
    <div class="phase-graph" data-graph-layout-mode="${(0, htmlEscape_1.escapeHtmlAttr)(graphLayoutMode)}" aria-label="Workflow graph" style="--graph-width-desktop-horizontal: ${desktopHorizontalGraphWidth}px; --graph-height-desktop-horizontal: ${desktopHorizontalGraphHeight}px; --graph-width-desktop-vertical: ${desktopVerticalGraphWidth}px; --graph-height-desktop-vertical: ${desktopVerticalGraphHeight}px; --graph-width-mobile-horizontal: ${mobileHorizontalGraphWidth}px; --graph-height-mobile-horizontal: ${mobileHorizontalGraphHeight}px; --graph-width-mobile-vertical: ${mobileVerticalGraphWidth}px; --graph-height-mobile-vertical: ${mobileVerticalGraphHeight}px; --graph-legend-left-desktop-horizontal: ${desktopHorizontalLegendPosition.left}px; --graph-legend-top-desktop-horizontal: ${desktopHorizontalLegendPosition.top}px; --graph-legend-left-desktop-vertical: ${desktopVerticalLegendPosition.left}px; --graph-legend-top-desktop-vertical: ${desktopVerticalLegendPosition.top}px; --graph-legend-left-mobile-horizontal: ${mobileHorizontalLegendPosition.left}px; --graph-legend-top-mobile-horizontal: ${mobileHorizontalLegendPosition.top}px; --graph-legend-left-mobile-vertical: ${mobileVerticalLegendPosition.left}px; --graph-legend-top-mobile-vertical: ${mobileVerticalLegendPosition.top}px;">
      <svg class="graph-links graph-links--desktop graph-links--desktop-horizontal" viewBox="0 0 ${desktopHorizontalGraphWidth} ${desktopHorizontalGraphHeight}" preserveAspectRatio="none" aria-hidden="true">
        ${desktopHorizontalLinks}
      </svg>
      <svg class="graph-links graph-links--desktop graph-links--desktop-vertical" viewBox="0 0 ${desktopVerticalGraphWidth} ${desktopVerticalGraphHeight}" preserveAspectRatio="none" aria-hidden="true">
        ${desktopVerticalLinks}
      </svg>
      <svg class="graph-links graph-links--mobile graph-links--mobile-horizontal" viewBox="0 0 ${mobileHorizontalGraphWidth} ${mobileHorizontalGraphHeight}" preserveAspectRatio="none" aria-hidden="true">
        ${mobileHorizontalLinks}
      </svg>
      <svg class="graph-links graph-links--mobile graph-links--mobile-vertical" viewBox="0 0 ${mobileVerticalGraphWidth} ${mobileVerticalGraphHeight}" preserveAspectRatio="none" aria-hidden="true">
        ${mobileVerticalLinks}
      </svg>
      <svg class="graph-loops graph-loops--desktop graph-loops--desktop-horizontal" viewBox="0 0 ${desktopHorizontalGraphWidth} ${desktopHorizontalGraphHeight}" preserveAspectRatio="none" aria-hidden="true">
        ${desktopHorizontalLoopPaths}
      </svg>
      <svg class="graph-loops graph-loops--desktop graph-loops--desktop-vertical" viewBox="0 0 ${desktopVerticalGraphWidth} ${desktopVerticalGraphHeight}" preserveAspectRatio="none" aria-hidden="true">
        ${desktopVerticalLoopPaths}
      </svg>
      <svg class="graph-loops graph-loops--mobile graph-loops--mobile-horizontal" viewBox="0 0 ${mobileHorizontalGraphWidth} ${mobileHorizontalGraphHeight}" preserveAspectRatio="none" aria-hidden="true">
        ${mobileHorizontalLoopPaths}
      </svg>
      <svg class="graph-loops graph-loops--mobile graph-loops--mobile-vertical" viewBox="0 0 ${mobileVerticalGraphWidth} ${mobileVerticalGraphHeight}" preserveAspectRatio="none" aria-hidden="true">
        ${mobileVerticalLoopPaths}
      </svg>
      ${loopBoxes}
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
    return (0, workflowPlaybackState_1.resolveWorkflowExecutionPhaseId)(workflow.currentPhase);
}
function resolvePausedExecutionPhaseId(workflow, state, playbackState) {
    if (playbackState !== "paused" && playbackState !== "stopping") {
        return null;
    }
    if (state.executionPhaseId) {
        return state.executionPhaseId;
    }
    return workflow.currentPhase;
}
function resolveDisplayedCurrentPhaseId(workflow, state, effectiveExecutionPhaseId, pausedExecutionPhaseId, playbackState) {
    if (playbackState === "playing" && effectiveExecutionPhaseId) {
        return effectiveExecutionPhaseId;
    }
    if ((playbackState === "paused" || playbackState === "stopping") && pausedExecutionPhaseId) {
        return pausedExecutionPhaseId;
    }
    if (playbackState === "idle" && state.pendingRewindPhaseId) {
        return state.pendingRewindPhaseId;
    }
    if (workflow.status === "completed") {
        return "completed";
    }
    return workflow.currentPhase;
}
function buildGraphLoopOverlays(workflow, visiblePhases, positions, nodeWidth, boxWidth, boxHeight, loopDefinitions, selectedPhaseId) {
    const visiblePhaseMap = new Map(visiblePhases.map((phase) => [phase.phaseId, phase]));
    const overlays = [];
    for (const [loopId, definition] of Object.entries(loopDefinitions)) {
        const sourcePhase = visiblePhaseMap.get(definition.fromPhaseId);
        const targetPhase = visiblePhaseMap.get(definition.toPhaseId);
        if (!sourcePhase || !targetPhase) {
            continue;
        }
        const sourcePosition = positions[definition.fromPhaseId];
        const targetPosition = positions[definition.toPhaseId];
        if (!sourcePosition || !targetPosition) {
            continue;
        }
        const cycleCount = countGraphLoopCycles(workflow, definition.fromPhaseId, definition.toPhaseId);
        if (cycleCount < 2) {
            continue;
        }
        const box = computeGraphLoopBox(sourcePosition, targetPosition, nodeWidth, boxWidth, boxHeight, definition.side);
        overlays.push({
            loopId,
            box,
            selected: selectedPhaseId === definition.fromPhaseId || selectedPhaseId === definition.toPhaseId,
            label: `${cycleCount} cycles between ${sourcePhase.title} and ${targetPhase.title}`,
            pathToSource: buildGraphLoopConnectorPath(sourcePosition, nodeWidth, box, definition.side, "source"),
            pathToTarget: buildGraphLoopConnectorPath(targetPosition, nodeWidth, box, definition.side, "target")
        });
    }
    return overlays;
}
function countGraphLoopCycles(workflow, fromPhaseId, toPhaseId) {
    const iterations = workflow.phaseIterations ?? [];
    const relevantIterations = iterations.filter((iteration) => iteration.phaseId === fromPhaseId || iteration.phaseId === toPhaseId);
    if (relevantIterations.length > 0) {
        return countPairedImplementationReviewAttempts(relevantIterations, 0, 0);
    }
    const completedEvents = eventsAfterLatestLineageRepair(workflow.events)
        .filter((event) => event.code === "phase_completed");
    const fromCount = completedEvents.filter((event) => event.phase === fromPhaseId).length;
    const toCount = completedEvents.filter((event) => event.phase === toPhaseId).length;
    return Math.min(fromCount, toCount);
}
function eventsAfterLatestLineageRepair(events) {
    let latestRepairIndex = -1;
    for (let index = events.length - 1; index >= 0; index -= 1) {
        if (events[index]?.code === "workflow_repaired") {
            latestRepairIndex = index;
            break;
        }
    }
    return latestRepairIndex < 0 ? events : events.slice(latestRepairIndex + 1);
}
function computeGraphLoopBox(sourcePosition, targetPosition, nodeWidth, boxWidth, boxHeight, side) {
    const sourceCenterX = sourcePosition.left + nodeWidth * 0.5;
    const targetCenterX = targetPosition.left + nodeWidth * 0.5;
    const sourceCenterY = sourcePosition.top + phaseNodeHeight * 0.5;
    const targetCenterY = targetPosition.top + phaseNodeHeight * 0.5;
    const minLeft = Math.min(sourcePosition.left, targetPosition.left);
    const maxRight = Math.max(sourcePosition.left + nodeWidth, targetPosition.left + nodeWidth);
    const minTop = Math.min(sourcePosition.top, targetPosition.top);
    const maxBottom = Math.max(sourcePosition.top + phaseNodeHeight, targetPosition.top + phaseNodeHeight);
    const midpointX = (sourceCenterX + targetCenterX) * 0.5;
    const midpointY = (sourceCenterY + targetCenterY) * 0.5;
    const lateralGap = Math.max(56, boxWidth * 0.24);
    const verticalGap = Math.max(42, boxHeight * 0.22);
    switch (side) {
        case "left":
            return {
                left: Math.max(16, Math.round(minLeft - lateralGap - boxWidth)),
                top: Math.max(16, Math.round(midpointY - boxHeight * 0.5)),
                width: boxWidth,
                height: boxHeight
            };
        case "top":
            return {
                left: Math.max(16, Math.round(midpointX - boxWidth * 0.5)),
                top: Math.max(16, Math.round(minTop - verticalGap - boxHeight)),
                width: boxWidth,
                height: boxHeight
            };
        case "bottom":
            return {
                left: Math.max(16, Math.round(midpointX - boxWidth * 0.5)),
                top: Math.round(maxBottom + verticalGap),
                width: boxWidth,
                height: boxHeight
            };
        case "right":
        default:
            return {
                left: Math.round(maxRight + lateralGap),
                top: Math.max(16, Math.round(midpointY - boxHeight * 0.5)),
                width: boxWidth,
                height: boxHeight
            };
    }
}
function buildGraphLoopConnectorPath(phasePosition, nodeWidth, box, side, branch) {
    const branchSign = branch === "source" ? -1 : 1;
    switch (side) {
        case "left": {
            const from = { x: box.left + box.width, y: box.top + box.height * (branch === "source" ? 0.34 : 0.66) };
            const to = { x: phasePosition.left, y: phasePosition.top + phaseNodeHeight * 0.5 };
            const spread = Math.max(56, Math.abs(to.x - from.x) * 0.34);
            return `M ${from.x} ${from.y} C ${from.x - spread * 0.2} ${from.y}, ${to.x + spread} ${to.y + 18 * branchSign}, ${to.x} ${to.y}`;
        }
        case "top": {
            const from = { x: box.left + box.width * (branch === "source" ? 0.34 : 0.66), y: box.top + box.height };
            const to = { x: phasePosition.left + nodeWidth * 0.5, y: phasePosition.top };
            const spread = Math.max(52, Math.abs(to.y - from.y) * 0.34);
            return `M ${from.x} ${from.y} C ${from.x} ${from.y + spread * 0.12}, ${to.x + 24 * branchSign} ${to.y - spread}, ${to.x} ${to.y}`;
        }
        case "bottom": {
            const from = { x: box.left + box.width * (branch === "source" ? 0.34 : 0.66), y: box.top };
            const to = { x: phasePosition.left + nodeWidth * 0.5, y: phasePosition.top + phaseNodeHeight };
            const spread = Math.max(52, Math.abs(to.y - from.y) * 0.34);
            return `M ${from.x} ${from.y} C ${from.x} ${from.y - spread * 0.12}, ${to.x + 24 * branchSign} ${to.y + spread}, ${to.x} ${to.y}`;
        }
        case "right":
        default: {
            const from = { x: box.left, y: box.top + box.height * (branch === "source" ? 0.34 : 0.66) };
            const to = { x: phasePosition.left + nodeWidth, y: phasePosition.top + phaseNodeHeight * 0.5 };
            const spread = Math.max(56, Math.abs(to.x - from.x) * 0.34);
            return `M ${from.x} ${from.y} C ${from.x + spread * 0.2} ${from.y}, ${to.x - spread} ${to.y + 18 * branchSign}, ${to.x} ${to.y}`;
        }
    }
}
function renderGraphLoopPaths(loopOverlays) {
    return loopOverlays
        .flatMap((overlay) => [
        `<path class="graph-loop-path${overlay.selected ? " graph-loop-path--selected" : ""}" data-loop-id="${(0, htmlEscape_1.escapeHtmlAttr)(overlay.loopId)}" d="${overlay.pathToSource}"></path>`,
        `<path class="graph-loop-path${overlay.selected ? " graph-loop-path--selected" : ""}" data-loop-id="${(0, htmlEscape_1.escapeHtmlAttr)(overlay.loopId)}" d="${overlay.pathToTarget}"></path>`
    ])
        .join("");
}
function renderGraphLoopBoxes(desktopHorizontalLoops, desktopVerticalLoops, mobileHorizontalLoops, mobileVerticalLoops) {
    const renderLoopSet = (loopOverlays, className) => loopOverlays.map((overlay) => `
      <div
        class="graph-loop-box ${className}${overlay.selected ? " graph-loop-box--selected" : ""}"
        data-loop-id="${(0, htmlEscape_1.escapeHtmlAttr)(overlay.loopId)}"
        style="left: ${overlay.box.left}px; top: ${overlay.box.top}px; width: ${overlay.box.width}px; min-height: ${overlay.box.height}px;">
        <span class="graph-loop-box__icon" aria-hidden="true">${renderGraphLoopIcon()}</span>
        <span class="graph-loop-box__label">${(0, htmlEscape_1.escapeHtml)(overlay.label)}</span>
      </div>
    `).join("");
    return [
        renderLoopSet(desktopHorizontalLoops, "graph-loop-box--desktop graph-loop-box--desktop-horizontal"),
        renderLoopSet(desktopVerticalLoops, "graph-loop-box--desktop graph-loop-box--desktop-vertical"),
        renderLoopSet(mobileHorizontalLoops, "graph-loop-box--mobile graph-loop-box--mobile-horizontal"),
        renderLoopSet(mobileVerticalLoops, "graph-loop-box--mobile graph-loop-box--mobile-vertical")
    ].join("");
}
function renderGraphLoopIcon() {
    return `
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M12 5a7 7 0 1 1-6.77 8.8.75.75 0 1 1 1.46-.38A5.5 5.5 0 1 0 8.2 7.22l1.55 1.55a.75.75 0 1 1-1.06 1.06L5.9 7.04a.75.75 0 0 1 0-1.06l2.8-2.8a.75.75 0 0 1 1.06 1.06L8.33 5.66A6.96 6.96 0 0 1 12 5Z"></path>
    </svg>
  `;
}
function computeGraphLoopBounds(loopOverlays) {
    return loopOverlays.reduce((aggregate, overlay) => ({
        width: Math.max(aggregate.width, overlay.box.left + overlay.box.width + 24),
        height: Math.max(aggregate.height, overlay.box.top + overlay.box.height + 24)
    }), { width: 0, height: 0 });
}
function buildGraphLinks(visiblePhases, executingTargetPhaseId, currentPhaseId, completedPhaseIds, positions, nodeWidth, graphLayoutMode, edgeConnections) {
    const visiblePhaseMap = new Map(visiblePhases.map((phase) => [phase.phaseId, phase]));
    const edges = buildPrimaryGraphEdges(visiblePhases, visiblePhaseMap, executingTargetPhaseId, currentPhaseId, completedPhaseIds);
    const classPriority = {
        pending: 0,
        completed: 1,
        current: 2,
        executing: 3
    };
    return edges
        .sort((left, right) => (classPriority[left.className] ?? 0) - (classPriority[right.className] ?? 0))
        .map((edge) => `<path class="${edge.className}" data-edge="${(0, htmlEscape_1.escapeHtmlAttr)(`${edge.fromPhaseId}->${edge.toPhaseId}`)}" d="${(0, graphLayout_1.graphPath)(edge.fromPhaseId, edge.toPhaseId, positions, nodeWidth, graphLayoutMode, edgeConnections[`${edge.fromPhaseId}->${edge.toPhaseId}`])}"></path>`)
        .join("");
}
function renderGraphLegend(usId) {
    return `
    <aside class="graph-legend" data-graph-legend data-us-id="${(0, htmlEscape_1.escapeHtmlAttr)(usId)}" aria-label="Graph legend">
      <div class="graph-legend__head">
        <div class="graph-legend__title">Legend</div>
        <button type="button" class="graph-legend__dismiss" data-graph-legend-dismiss aria-label="Dismiss graph legend">×</button>
      </div>
      <div class="graph-legend__row"><span class="graph-legend__line graph-legend__line--progress"></span><span>Progress</span></div>
      <div class="graph-legend__row"><span class="graph-legend__line graph-legend__line--pending"></span><span>Pending / skip</span></div>
      <div class="graph-legend__row"><span class="graph-legend__dot graph-legend__dot--completed"></span><span>Completed</span></div>
      <div class="graph-legend__row"><span class="graph-legend__dot graph-legend__dot--current"></span><span>Current</span></div>
      <div class="graph-legend__row"><span class="graph-legend__dot graph-legend__dot--pending"></span><span>Pending</span></div>
      <div class="graph-legend__row"><span class="graph-legend__dot graph-legend__dot--final"></span><span>Final</span></div>
    </aside>
  `;
}
function renderGraphPhaseStatusIcon(phase, tone, completedWorkflowLocked) {
    if (phase.phaseId === "completed") {
        return completedWorkflowLocked ? (0, icons_1.lockClosedIcon)() : (0, icons_1.lockOpenIcon)();
    }
    if (tone === "completed") {
        return `
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M10.05 16.62a1 1 0 0 1-1.42 0l-3.1-3.1a1 1 0 1 1 1.42-1.42l2.39 2.39 7.7-8.1a1 1 0 0 1 1.45 1.38l-8.44 8.85Z"></path>
      </svg>
    `;
    }
    if (tone === "active" || tone === "paused") {
        return `
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M12 4.5a7.5 7.5 0 1 0 0 15 7.5 7.5 0 0 0 0-15Zm0 2a5.5 5.5 0 1 1 0 11 5.5 5.5 0 0 1 0-11Zm0 2.25a1 1 0 0 1 1 1V12h2.25a1 1 0 1 1 0 2H12a1 1 0 0 1-1-1V9.75a1 1 0 0 1 1-1Z"></path>
      </svg>
    `;
    }
    return "";
}
function buildPrimaryGraphEdges(visiblePhases, visiblePhaseMap, executingTargetPhaseId, currentPhaseId, completedPhaseIds) {
    const edges = [];
    const hasRefinement = visiblePhaseMap.has("refinement");
    const primaryDefinitions = [
        ...(hasRefinement ? [{ fromPhaseId: "capture", toPhaseId: "refinement" }] : []),
        ...(hasRefinement ? [{ fromPhaseId: "refinement", toPhaseId: "spec" }] : []),
        { fromPhaseId: "spec", toPhaseId: "technical-design" },
        { fromPhaseId: "technical-design", toPhaseId: "implementation" },
        { fromPhaseId: "implementation", toPhaseId: "review" },
        { fromPhaseId: "review", toPhaseId: "release-approval" },
        { fromPhaseId: "release-approval", toPhaseId: "pr-preparation" },
        { fromPhaseId: "pr-preparation", toPhaseId: "completed" }
    ];
    for (const definition of primaryDefinitions) {
        const targetPhase = visiblePhaseMap.get(definition.toPhaseId);
        if (!visiblePhaseMap.has(definition.fromPhaseId) || !targetPhase) {
            continue;
        }
        edges.push({
            fromPhaseId: definition.fromPhaseId,
            toPhaseId: definition.toPhaseId,
            className: linkClass(targetPhase, executingTargetPhaseId, currentPhaseId, completedPhaseIds)
        });
    }
    return edges;
}
function shouldShowRefinementPhase(_workflow, _executionPhaseId) {
    return true;
}
function linkClass(targetPhase, executingTargetPhaseId, currentPhaseId, completedPhaseIds) {
    if (executingTargetPhaseId === targetPhase.phaseId) {
        return "executing";
    }
    if (targetPhase.phaseId === currentPhaseId) {
        return "current";
    }
    if (completedPhaseIds.has(targetPhase.phaseId) || targetPhase.state === "completed") {
        return "completed";
    }
    return "pending";
}
function shouldShowPhase(phaseId, refinementVisible, currentPhaseId, executionPhaseId) {
    return phaseId !== "refinement"
        || refinementVisible
        || currentPhaseId === "refinement"
        || executionPhaseId === "refinement";
}
//# sourceMappingURL=workflowView.js.map