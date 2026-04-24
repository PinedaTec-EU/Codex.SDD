export type WorkflowPlaybackState = "idle" | "playing" | "paused" | "stopping";

const workflowExecutionPhaseOrder = [
  "clarification",
  "refinement",
  "technical-design",
  "implementation",
  "review",
  "release-approval",
  "pr-preparation"
] as const;

export function normalizePlaybackStateAfterManualWorkflowChange(
  playbackState: WorkflowPlaybackState
): "idle" | "playing" {
  return playbackState === "playing" ? "playing" : "idle";
}

export function canPauseWorkflowExecutionPhase(phaseId: string): boolean {
  // Capture is intentionally excluded: the first pauseable boundary is before clarification.
  return workflowExecutionPhaseOrder.includes(phaseId as typeof workflowExecutionPhaseOrder[number]);
}

export function resolveWorkflowExecutionPhaseId(currentPhaseId: string): string | null {
  if (currentPhaseId === "capture") {
    return "clarification";
  }

  const phaseIndex = workflowExecutionPhaseOrder.indexOf(currentPhaseId as typeof workflowExecutionPhaseOrder[number]);
  if (phaseIndex < 0 || phaseIndex + 1 >= workflowExecutionPhaseOrder.length) {
    return null;
  }

  return workflowExecutionPhaseOrder[phaseIndex + 1];
}

export function resolveNextWorkflowExecutionPhaseId(executionPhaseId: string): string | null {
  const phaseIndex = workflowExecutionPhaseOrder.indexOf(executionPhaseId as typeof workflowExecutionPhaseOrder[number]);
  if (phaseIndex < 0 || phaseIndex + 1 >= workflowExecutionPhaseOrder.length) {
    return null;
  }

  return workflowExecutionPhaseOrder[phaseIndex + 1];
}
