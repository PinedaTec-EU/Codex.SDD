import type { UserStoryWorkflowDetails } from "./backendClient";

export function resolvePreferredSelectedWorkflowPhaseId(
  workflow: UserStoryWorkflowDetails,
  selectedPhaseId: string
): string {
  if (workflow.status === "completed" && workflow.phases.some((phase) => phase.phaseId === "completed")) {
    return "completed";
  }

  return selectedPhaseId;
}
