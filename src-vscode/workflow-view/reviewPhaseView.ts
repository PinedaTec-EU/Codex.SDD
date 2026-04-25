import type { WorkflowPhaseDetails, UserStoryWorkflowDetails } from "../backendClient";
import { countImplementationAttempts } from "../workflowAutomation";
import type { PhaseSectionFragments, WorkflowViewState } from "./models";

type ReviewPhaseViewArgs = {
  readonly workflow: UserStoryWorkflowDetails;
  readonly selectedPhase: WorkflowPhaseDetails;
  readonly state: WorkflowViewState;
};

export function buildReviewPhaseSections(args: ReviewPhaseViewArgs): PhaseSectionFragments {
  const implementationAttempts = countImplementationAttempts(args.workflow);
  const currentPhaseIsReview = args.selectedPhase.isCurrent && args.selectedPhase.phaseId === "review";
  const includeReviewArtifact = args.state.reviewRegressionIncludeArtifact !== false;
  if (!currentPhaseIsReview) {
    return { beforeArtifact: [], afterArtifact: [] };
  }

  return {
    beforeArtifact: [
      `
      <section class="detail-card detail-card--review-regression">
        <div class="review-regression">
          <div class="review-regression__header">
            <div class="review-regression__copy">
              <span class="badge badge--attention">Review feedback loop</span>
              <h3>Send Back To Implementation</h3>
              <p class="panel-copy">
                Use this only when the review found concrete issues that require another implementation pass.
                SpecForge will return the workflow to the <code>implementation</code> correction loop, preserve the current review artifact as context,
                and apply your note directly over the existing implementation artifact instead of starting from scratch.
              </p>
            </div>
            <div class="review-regression__stat" aria-label="Implementation attempts so far">
              <span class="review-regression__stat-label">Attempts so far</span>
              <strong class="review-regression__stat-value">${implementationAttempts}</strong>
            </div>
          </div>
          <div class="review-regression__body">
            <label class="phase-input-shell" for="review-regression-textarea">
              <span class="phase-input-label">Implementation context source</span>
              <label class="review-regression__toggle">
                <input
                  id="review-regression-include-artifact"
                  type="checkbox"
                  ${includeReviewArtifact ? "checked" : ""} />
                <span>Send the generated review artifact to implementation as corrective context</span>
              </label>
              <span class="phase-input-label">Correction context</span>
              <p class="phase-input-copy">
                ${includeReviewArtifact
                  ? "Optional. Add only the extra constraints or steering that should accompany the review artifact when implementation runs again."
                  : "Required when the review artifact is not sent. Explain what failed, what must change now, and what constraints the next implementation pass must preserve."}
              </p>
              <textarea
                id="review-regression-textarea"
                class="phase-input-textarea phase-input-textarea--review-regression"
                rows="6"
                placeholder="${includeReviewArtifact
                  ? "Optional example: preserve the current loading flow and only address the accessibility findings from the review."
                  : "Required example: the implementation must rebuild the empty state behavior from the review findings, preserve the current loading flow, and avoid expanding scope."}"></textarea>
            </label>
            <p class="review-regression__audit-note">The user decision, selected context mode, regression reason, and resulting implementation operation are all recorded in the workflow audit trail.</p>
          </div>
        </div>
      </section>
      `
    ],
    afterArtifact: []
  };
}
