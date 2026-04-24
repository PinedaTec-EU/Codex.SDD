import type { WorkflowPhaseDetails, UserStoryWorkflowDetails } from "../backendClient";
import { countImplementationAttempts } from "../workflowAutomation";
import type { PhaseSectionFragments } from "./models";

type ReviewPhaseViewArgs = {
  readonly workflow: UserStoryWorkflowDetails;
  readonly selectedPhase: WorkflowPhaseDetails;
};

export function buildReviewPhaseSections(args: ReviewPhaseViewArgs): PhaseSectionFragments {
  const implementationAttempts = countImplementationAttempts(args.workflow);
  const currentPhaseIsReview = args.selectedPhase.isCurrent && args.selectedPhase.phaseId === "review";
  if (!currentPhaseIsReview) {
    return { beforeArtifact: [], afterArtifact: [] };
  }

  return {
    beforeArtifact: [
      `
      <section class="detail-card">
        <h3>Send Back To Implementation</h3>
        <p class="panel-copy">
          Add focused correction context for the implementation model. SpecForge will regress to <code>implementation</code>,
          preserve the review artifact as previous context, and apply your note directly over the implementation artifact.
        </p>
        <p class="panel-copy">Implementation attempts recorded so far: <strong>${implementationAttempts}</strong>.</p>
        <label class="phase-input-form">
          <span>Correction context</span>
          <textarea id="review-regression-textarea" rows="8" placeholder="Explain what review found, what must change, and any constraints the implementation model must preserve."></textarea>
        </label>
        <div class="detail-actions">
          <button class="workflow-action-button workflow-action-button--document" id="submit-review-regression">Send To Implementation</button>
        </div>
      </section>
      `
    ],
    afterArtifact: []
  };
}
