import type { WorkflowPhaseDetails, UserStoryWorkflowDetails } from "../backendClient";
import type { PhaseSectionFragments, WorkflowViewState } from "./models";

type CompletedPhaseViewArgs = {
  readonly workflow: UserStoryWorkflowDetails;
  readonly selectedPhase: WorkflowPhaseDetails;
  readonly state: WorkflowViewState;
};

export function buildCompletedPhaseSections(args: CompletedPhaseViewArgs): PhaseSectionFragments {
  if (!args.selectedPhase.isCurrent || args.selectedPhase.phaseId !== "completed") {
    return { beforeArtifact: [], afterArtifact: [] };
  }

  const locked = args.state.completedUsLockOnCompleted !== false;
  const hasCompletedPhaseData = args.workflow.events.some((event) => event.phase === "completed")
    || (args.workflow.phaseIterations?.some((iteration) => iteration.phaseId === "completed") ?? false)
    || Boolean(args.selectedPhase.artifactPath)
    || Boolean(args.selectedPhase.operationLogPath);

  return {
    beforeArtifact: [
      `
      <details class="detail-card detail-card--completed-reopen detail-card--collapsible"${hasCompletedPhaseData ? " open" : ""}>
        <summary class="detail-card__summary">
          <div class="review-regression__header">
            <div class="review-regression__copy">
              <span class="badge ${locked ? "badge--attention" : "badge--active"}">${locked ? "Completed and locked" : "Completed and unlocked"}</span>
              <h3>Reopen Completed Workflow</h3>
              <p class="panel-copy">
                Choose why this user story must be reopened and describe exactly what failed or what must now be incorporated.
                SpecForge will route the workflow back to the appropriate phase and record the decision in the audit trail.
              </p>
            </div>
            <div class="review-regression__stat" aria-label="Completed workflow reopen policy">
              <span class="review-regression__stat-label">Lock policy</span>
              <strong class="review-regression__stat-value">${locked ? "Locked" : "Open"}</strong>
            </div>
          </div>
        </summary>
        <div class="review-regression">
          <div class="review-regression__body">
            <label class="phase-input-shell" for="completed-reopen-reason">
              <span class="phase-input-label">Reopen reason</span>
              <select id="completed-reopen-reason" class="phase-input-textarea phase-input-select" data-completed-reopen-reason>
                <option value="">Select a reopen reason</option>
                <option value="merge-conflict">re-open by merge conflict</option>
                <option value="defect">re-open by defect</option>
                <option value="functional-issue">re-open by functional issue</option>
                <option value="technical-issue">re-open by technical issue</option>
              </select>
              <span class="phase-input-label">Description</span>
              <p class="phase-input-copy">
                Required. Explain what failed or what must now be incorporated so the reopened phase starts with the right context.
              </p>
              <textarea
                id="completed-reopen-description"
                class="phase-input-textarea"
                rows="6"
                placeholder="Example: merge to main exposed a conflict in the branch integration script and the implementation must re-sync with the latest base changes."></textarea>
            </label>
            <div class="detail-actions detail-actions--review-regression">
              <button class="workflow-action-button workflow-action-button--progress" type="button" data-submit-completed-reopen disabled>Open</button>
            </div>
          </div>
        </div>
      </details>
      `
    ],
    afterArtifact: []
  };
}
