"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildReviewPhaseSections = buildReviewPhaseSections;
const workflowAutomation_1 = require("../workflowAutomation");
function buildReviewPhaseSections(args) {
    const implementationAttempts = (0, workflowAutomation_1.countImplementationAttempts)(args.workflow);
    const currentPhaseIsReview = args.selectedPhase.isCurrent && args.selectedPhase.phaseId === "review";
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
                SpecForge will move the workflow back to <code>implementation</code>, keep the review artifact as context,
                and apply your note directly over the implementation artifact.
              </p>
            </div>
            <div class="review-regression__stat" aria-label="Implementation attempts so far">
              <span class="review-regression__stat-label">Attempts so far</span>
              <strong class="review-regression__stat-value">${implementationAttempts}</strong>
            </div>
          </div>
          <div class="review-regression__body">
            <label class="phase-input-shell" for="review-regression-textarea">
              <span class="phase-input-label">Correction context</span>
              <p class="phase-input-copy">
                Summarize what failed in review, what must change now, and what constraints the next implementation pass must preserve.
              </p>
              <textarea
                id="review-regression-textarea"
                class="phase-input-textarea phase-input-textarea--review-regression"
                rows="6"
                placeholder="Example: the implementation fixes the API contract but still breaks the empty state. Preserve the current loading flow and update only the review findings listed above."></textarea>
            </label>
            <div class="detail-actions detail-actions--review-regression">
              <button class="workflow-action-button workflow-action-button--document" id="submit-review-regression">Send To Implementation</button>
            </div>
          </div>
        </div>
      </section>
      `
        ],
        afterArtifact: []
    };
}
//# sourceMappingURL=reviewPhaseView.js.map