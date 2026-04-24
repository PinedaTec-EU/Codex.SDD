import type { UserStoryWorkflowDetails } from "./backendClient";

export function countImplementationAttempts(workflow: Pick<UserStoryWorkflowDetails, "events">): number {
  const artifacts = new Set<string>();
  for (const event of workflow.events) {
    if (event.phase !== "implementation") {
      continue;
    }

    if (event.code !== "phase_completed" && event.code !== "artifact_operated") {
      continue;
    }

    for (const artifactPath of event.artifacts) {
      if (artifactPath.toLowerCase().endsWith(".md")) {
        artifacts.add(artifactPath);
      }
    }
  }

  return artifacts.size;
}

export function hasReachedImplementationReviewCycleLimit(
  workflow: Pick<UserStoryWorkflowDetails, "events">,
  maxImplementationReviewCycles: number | null | undefined
): boolean {
  return typeof maxImplementationReviewCycles === "number"
    && maxImplementationReviewCycles > 0
    && countImplementationAttempts(workflow) >= maxImplementationReviewCycles;
}
