import type { TimelineEventDetails, UserStoryWorkflowDetails } from "./backendClient";

const ignoredTimelineRewindCodes = new Set(["workflow_rewound"]);
const implementationReviewPhases = new Set(["technical-design", "implementation", "review"]);

export type TimelineRewindBlockReason =
  | "none"
  | "no-history"
  | "reopened-landing"
  | "ambiguous-implementation-review";

export interface TimelineRewindPoint {
  readonly phaseId: string;
  readonly title: string;
  readonly timestampUtc: string | null;
  readonly code: string | null;
  readonly isCurrent: boolean;
  readonly canSelect: boolean;
  readonly reasonCode: TimelineRewindBlockReason;
  readonly reasonMessage: string | null;
}

export interface TimelineRewindDecision {
  readonly allowed: boolean;
  readonly targetPhaseId: string | null;
  readonly reasonCode: TimelineRewindBlockReason;
  readonly reasonMessage: string | null;
}

interface TimelinePhaseEntry {
  readonly phaseId: string;
  readonly timestampUtc: string | null;
  readonly code: string | null;
}

export function buildTimelineRewindPhaseHistory(workflow: UserStoryWorkflowDetails): readonly string[] {
  return buildTimelineRewindEntries(workflow).map((entry) => entry.phaseId);
}

export function buildTimelineRewindPoints(
  workflow: UserStoryWorkflowDetails,
  displayedCurrentPhaseId: string | null | undefined
): readonly TimelineRewindPoint[] {
  const currentPhaseId = normalizePhaseId(displayedCurrentPhaseId) || workflow.currentPhase;
  const entries = buildTimelineRewindEntries(workflow);

  return entries.map((entry, index) => {
    const decision = resolveTimelineRewindDecision(workflow, currentPhaseId, entry.phaseId);
    const isCurrent = entry.phaseId === currentPhaseId && index === findLatestEntryIndex(entries, currentPhaseId);

    return {
      phaseId: entry.phaseId,
      title: titleForPhase(workflow, entry.phaseId),
      timestampUtc: entry.timestampUtc,
      code: entry.code,
      isCurrent,
      canSelect: !isCurrent && decision.allowed,
      reasonCode: isCurrent ? "no-history" : decision.reasonCode,
      reasonMessage: isCurrent ? "This is the current workflow position." : decision.reasonMessage
    };
  });
}

export function resolveTimelineRewindTargetPhase(
  workflow: UserStoryWorkflowDetails,
  displayedCurrentPhaseId: string | null | undefined
): string | null {
  return resolveTimelineRewindDecision(workflow, displayedCurrentPhaseId).targetPhaseId;
}

export function resolveTimelineRewindDecision(
  workflow: UserStoryWorkflowDetails,
  displayedCurrentPhaseId: string | null | undefined,
  requestedTargetPhaseId?: string | null
): TimelineRewindDecision {
  const history = buildTimelineRewindPhaseHistory(workflow);
  const currentPhaseId = normalizePhaseId(displayedCurrentPhaseId) || workflow.currentPhase;
  const currentIndex = history.lastIndexOf(currentPhaseId);
  const requestedTarget = normalizePhaseId(requestedTargetPhaseId);
  const targetIndex = requestedTarget
    ? findLatestIndexBefore(history, requestedTarget, currentIndex)
    : currentIndex - 1;
  const targetPhaseId = targetIndex >= 0 ? history[targetIndex] : null;

  if (isLatestReopenLandingPhase(workflow, currentPhaseId)) {
    return blocked(
      "reopened-landing",
      "Rewind unavailable: this workflow was reopened from a completed state and this is the recovery landing phase.",
      targetPhaseId);
  }

  if (targetPhaseId && implementationReviewPhases.has(targetPhaseId) && hasMultipleImplementationReviewIterations(workflow)) {
    return blocked(
      "ambiguous-implementation-review",
      "Rewind unavailable: implementation/review already has multiple iterations, so moving back through that segment would be ambiguous. Use regression instead.",
      targetPhaseId);
  }

  if (!targetPhaseId || currentIndex <= 0) {
    return blocked("no-history", null, null);
  }

  return {
    allowed: true,
    targetPhaseId,
    reasonCode: "none",
    reasonMessage: null
  };
}

function buildTimelineRewindEntries(workflow: UserStoryWorkflowDetails): readonly TimelinePhaseEntry[] {
  const history: TimelinePhaseEntry[] = [];

  const pushPhase = (phaseId: string | null | undefined, event?: TimelineEventDetails): void => {
    const normalizedPhaseId = normalizePhaseId(phaseId);
    if (!normalizedPhaseId || normalizedPhaseId === "completed") {
      return;
    }

    if (history[history.length - 1]?.phaseId === normalizedPhaseId) {
      return;
    }

    history.push({
      phaseId: normalizedPhaseId,
      timestampUtc: event?.timestampUtc ?? null,
      code: event?.code ?? null
    });
  };

  if (workflow.currentPhase !== "capture" && workflow.controls.canRestartFromSource) {
    pushPhase("capture");
  }

  for (const event of workflow.events) {
    if (ignoredTimelineRewindCodes.has(event.code)) {
      continue;
    }

    pushPhase(event.phase, event);
  }

  pushPhase(workflow.currentPhase);
  return history;
}

function findLatestIndexBefore(history: readonly string[], targetPhaseId: string, currentIndex: number): number {
  if (currentIndex <= 0) {
    return -1;
  }

  for (let index = currentIndex - 1; index >= 0; index--) {
    if (history[index] === targetPhaseId) {
      return index;
    }
  }

  return -1;
}

function findLatestEntryIndex(entries: readonly TimelinePhaseEntry[], phaseId: string): number {
  for (let index = entries.length - 1; index >= 0; index--) {
    if (entries[index].phaseId === phaseId) {
      return index;
    }
  }

  return -1;
}

function isLatestReopenLandingPhase(workflow: UserStoryWorkflowDetails, currentPhaseId: string): boolean {
  const latestReopen = [...workflow.events].reverse().find((event) => event.code === "workflow_reopened");
  return normalizePhaseId(latestReopen?.phase) === currentPhaseId;
}

function hasMultipleImplementationReviewIterations(workflow: UserStoryWorkflowDetails): boolean {
  return (workflow.phaseIterations ?? []).some((iteration) =>
    (iteration.phaseId === "implementation" || iteration.phaseId === "review") && iteration.attempt > 1);
}

function blocked(
  reasonCode: TimelineRewindBlockReason,
  reasonMessage: string | null,
  targetPhaseId: string | null
): TimelineRewindDecision {
  return {
    allowed: false,
    targetPhaseId,
    reasonCode,
    reasonMessage
  };
}

function normalizePhaseId(phaseId: string | null | undefined): string {
  return phaseId?.trim() ?? "";
}

function titleForPhase(workflow: UserStoryWorkflowDetails, phaseId: string): string {
  return workflow.phases.find((phase) => phase.phaseId === phaseId)?.title ?? phaseId;
}
