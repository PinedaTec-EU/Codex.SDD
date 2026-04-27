import type { UserStoryWorkflowDetails } from "./backendClient";

const ignoredTimelineRewindCodes = new Set(["workflow_rewound"]);

export function buildTimelineRewindPhaseHistory(workflow: UserStoryWorkflowDetails): readonly string[] {
  const history: string[] = [];

  const pushPhase = (phaseId: string | null | undefined): void => {
    const normalizedPhaseId = phaseId?.trim() ?? "";
    if (normalizedPhaseId.length === 0 || normalizedPhaseId === "completed") {
      return;
    }

    if (history[history.length - 1] === normalizedPhaseId) {
      return;
    }

    history.push(normalizedPhaseId);
  };

  if (workflow.currentPhase !== "capture" && workflow.controls.canRestartFromSource) {
    pushPhase("capture");
  }

  for (const event of workflow.events) {
    if (ignoredTimelineRewindCodes.has(event.code)) {
      continue;
    }

    pushPhase(event.phase);
  }

  pushPhase(workflow.currentPhase);
  return history;
}

export function resolveTimelineRewindTargetPhase(
  workflow: UserStoryWorkflowDetails,
  displayedCurrentPhaseId: string | null | undefined
): string | null {
  const history = buildTimelineRewindPhaseHistory(workflow);
  if (history.length <= 1) {
    return null;
  }

  const currentPhaseId = (displayedCurrentPhaseId?.trim() || workflow.currentPhase).trim();
  const currentIndex = history.lastIndexOf(currentPhaseId);
  if (currentIndex <= 0) {
    return null;
  }

  return history[currentIndex - 1] ?? null;
}
