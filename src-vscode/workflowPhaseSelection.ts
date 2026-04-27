import type { UserStoryWorkflowDetails } from "./backendClient";

export function resolvePreferredSelectedWorkflowPhaseId(
  workflow: UserStoryWorkflowDetails,
  selectedPhaseId: string
): string {
  if (workflow.phases.some((phase) => phase.phaseId === selectedPhaseId)) {
    return selectedPhaseId;
  }

  if (workflow.status === "completed" && workflow.phases.some((phase) => phase.phaseId === "completed")) {
    return "completed";
  }

  return workflow.phases.find((phase) => phase.isCurrent)?.phaseId
    ?? workflow.phases[0]?.phaseId
    ?? selectedPhaseId;
}
