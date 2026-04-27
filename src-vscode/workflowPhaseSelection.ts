import type { UserStoryWorkflowDetails } from "./backendClient";

export function resolvePreferredSelectedWorkflowPhaseId(
  workflow: UserStoryWorkflowDetails,
  selectedPhaseId: string
): string {
  if (workflow.status === "completed" && selectedPhaseId === "completed") {
    return "completed";
  }

  return selectedPhaseId;
}
