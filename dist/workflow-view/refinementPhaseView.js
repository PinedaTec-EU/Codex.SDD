"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildRefinementPhaseSections = buildRefinementPhaseSections;
function buildRefinementPhaseSections(args) {
    const { workflow, selectedPhase, state, artifactQuestionBlock, refinementApprovalQuestions, unresolvedApprovalQuestionCount, escapeHtml, escapeHtmlAttribute, heroTokenClass, formatUtcTimestamp } = args;
    const approvalBranchEditorVisible = selectedPhase.phaseId === "refinement"
        && selectedPhase.isCurrent
        && workflow.controls.canApprove;
    const approvalBaseBranchProposal = state.approvalBaseBranchProposal?.trim() || "main";
    const approvalWorkBranchProposal = state.approvalWorkBranchProposal?.trim() || workflow.workBranch?.trim() || "";
    const requiresExplicitApprovalBranchAcceptance = Boolean(state.requireExplicitApprovalBranchAcceptance);
    const approvalBranchSection = approvalBranchEditorVisible
        ? `
      <section class="detail-card detail-card--approval-branch" data-approval-branch-shell data-require-explicit-approval-branch-acceptance="${requiresExplicitApprovalBranchAcceptance ? "true" : "false"}">
        <div class="approval-branch__copy">
          <h3>Approval Branch</h3>
          <p>Confirm the base branch used to create the user story work branch before approving the refinement.</p>
        </div>
        <div class="approval-branch__controls">
          <label class="approval-branch__field" for="approval-base-branch">Base Branch</label>
          <div class="approval-branch__input-row">
            <input
              id="approval-base-branch"
              class="approval-branch__input"
              type="text"
              value="${escapeHtmlAttribute(approvalBaseBranchProposal)}"
              data-approval-base-branch-input
              spellcheck="false"
              autocomplete="off" />
            ${requiresExplicitApprovalBranchAcceptance
            ? `<button type="button" class="workflow-action-button workflow-action-button--progress approval-branch__accept" data-approval-branch-accept>Accept</button>`
            : ""}
            <span class="approval-branch__accepted" data-approval-branch-accepted hidden>Accepted ✓</span>
          </div>
          <p class="approval-branch__hint" data-approval-branch-hint>
            ${requiresExplicitApprovalBranchAcceptance
            ? "Approve stays disabled until you accept this branch value explicitly."
            : "You can approve directly, and the current branch value will be sent with the action."}
          </p>
          <label class="approval-branch__field" for="approval-work-branch">Work Branch</label>
          <input
            id="approval-work-branch"
            class="approval-branch__input"
            type="text"
            value="${escapeHtmlAttribute(approvalWorkBranchProposal)}"
            data-approval-work-branch-input
            spellcheck="false"
            autocomplete="off" />
          <p class="approval-branch__hint">This is the branch that will be created after approval. You can edit the proposed name before continuing.</p>
        </div>
      </section>
    `
        : "";
    const refinementApprovalQuestionsSection = refinementApprovalQuestions.length > 0
        ? `
      <section class="detail-card detail-card--approval-questions">
        <h3>Human Approval Questions</h3>
        <p class="panel-copy">These are the open decisions the approver still needs to resolve before freezing the spec baseline. Pending questions stay amber. Answered questions turn green. Approval stays disabled until all are resolved.</p>
        <div class="approval-question-list">
          ${refinementApprovalQuestions.map((item) => `
            <article
              class="approval-question-item${item.resolved ? " approval-question-item--resolved" : " approval-question-item--pending"}"
              data-approval-question-item
              data-approval-question-index="${item.index}">
              <div class="approval-question-item__head">
                <button
                  class="approval-question-item__toggle"
                  type="button"
                  data-approval-question-toggle
                  data-approval-question-index="${item.index}">
                  <span class="approval-question-item__index">${item.index}</span>
                  <span class="approval-question-item__body">${escapeHtml(item.question)}</span>
                  <span class="approval-question-item__status">${item.resolved ? "Resolved" : "Pending"}</span>
                </button>
                <span class="approval-question-item__actions">
                  <button
                    type="button"
                    class="copy-question-button"
                    data-copy-text="${escapeHtmlAttribute(item.question)}"
                    aria-label="Copy approval question ${item.index}">${renderCopyQuestionIcon()}</button>
                </span>
              </div>
              <div class="approval-question-item__editor" data-approval-question-editor${item.resolved ? " hidden" : ""}>
                <label class="approval-question-item__label" for="approval-answer-${item.index}">
                  ${item.resolved ? "Update answer" : "Provide answer"}
                </label>
                ${item.resolved && (item.answeredBy || item.answeredAtUtc)
            ? `<div class="approval-question-item__meta">${[
                item.answeredBy ? `Answered by ${escapeHtml(item.answeredBy)}` : "",
                item.answeredAtUtc ? escapeHtml(formatUtcTimestamp(item.answeredAtUtc)) : ""
            ].filter(Boolean).join(" · ")}</div>`
            : ""}
                <textarea
                  id="approval-answer-${item.index}"
                  class="approval-question-item__textarea"
                  data-approval-answer-input
                  data-index="${item.index}"
                  data-question="${escapeHtmlAttribute(item.question)}"
                  rows="4"
                  placeholder="Write the human answer that should be reflected in the spec and persisted in the approval questions section.">${escapeHtml(item.answer ?? "")}</textarea>
                <div class="detail-actions">
                  <button
                    class="workflow-action-button workflow-action-button--progress"
                    type="button"
                    data-approval-answer-apply
                    data-index="${item.index}"
                    ${selectedPhase.isCurrent ? "" : "disabled"}>
                    ${item.resolved ? "Update Answer" : "Apply Answer"}
                  </button>
                </div>
              </div>
            </article>
          `).join("")}
        </div>
      </section>
    `
        : "";
    const refinementClarificationSection = selectedPhase.phaseId === "refinement"
        && artifactQuestionBlock?.decision?.toLowerCase() === "needs_clarification"
        ? `
      <section class="detail-card detail-card--artifact-questions">
        <h3>Refinement Questions</h3>
        <div class="clarification-meta">
          ${artifactQuestionBlock.state ? `<span class="badge">${escapeHtml(artifactQuestionBlock.state)}</span>` : ""}
          <span class="badge${heroTokenClass(artifactQuestionBlock.decision)}">${escapeHtml(artifactQuestionBlock.decision)}</span>
        </div>
        ${artifactQuestionBlock.reason ? `<p class="clarification-reason">${escapeHtml(artifactQuestionBlock.reason)}</p>` : ""}
        ${artifactQuestionBlock.questions.length > 0
            ? `
            <div class="clarification-list">
              ${artifactQuestionBlock.questions.map((question, index) => `
                <label class="clarification-item">
                  <span class="clarification-question-row">
                    <span class="clarification-question">${index + 1}. ${escapeHtml(question)}</span>
                    <button
                      type="button"
                      class="copy-question-button"
                      data-copy-text="${escapeHtmlAttribute(question)}"
                      aria-label="Copy refinement question ${index + 1}">${renderCopyQuestionIcon()}</button>
                  </span>
                  <textarea
                    class="clarification-answer"
                    data-refinement-question-answer
                    data-index="${index + 1}"
                    rows="3"
                    placeholder="Write the answer and apply it back into the current spec via model."></textarea>
                </label>
              `).join("")}
            </div>
            <div class="detail-actions">
              <button id="submit-refinement-questions" class="workflow-action-button workflow-action-button--progress" ${selectedPhase.isCurrent ? "" : "disabled"}>
                Apply Answers via Model
              </button>
            </div>
          `
            : "<p class=\"muted\">The artifact requests clarification, but no structured questions were detected.</p>"}
      </section>
    `
        : "";
    const phaseOperationSection = selectedPhase.phaseId === "refinement"
        ? `
      <section class="detail-card">
        <h3>Operate Current Spec</h3>
        <div class="phase-input-shell">
          <p class="phase-input-copy">
            Operate over the current spec without leaving the workflow. The prompt is recorded as an auditable operation with
            source artifact, actor, UTC timestamp, and resulting spec version.
          </p>
          <label class="phase-input-label" for="phase-input-textarea">Operate Current Spec</label>
          <textarea
            id="phase-input-textarea"
            class="phase-input-textarea"
            rows="8"
            placeholder="Describe the correction or adjustment to apply over the current spec. Example: the background color is not green, it is blue."
            ${selectedPhase.isCurrent ? "" : "disabled"}></textarea>
          <div class="detail-actions detail-actions--phase-input">
            <button class="workflow-action-button workflow-action-button--document" data-command="openArtifact" data-path="${escapeHtmlAttribute(selectedPhase.operationLogPath ?? "")}" ${selectedPhase.operationLogPath ? "" : "disabled"}>Open Operation Log</button>
            <button id="submit-phase-input" class="workflow-action-button workflow-action-button--progress" ${selectedPhase.isCurrent ? "" : "disabled"}>Apply via Model</button>
          </div>
          ${state.selectedOperationContent
            ? `<div class="phase-input-log"><div class="phase-input-log__header">Current operation log</div><pre class="artifact-preview">${escapeHtml(state.selectedOperationContent)}</pre></div>`
            : "<p class=\"muted\">No model-assisted operations have been recorded for this spec yet.</p>"}
        </div>
      </section>
    `
        : "";
    return {
        beforeArtifact: [
            ...(approvalBranchSection ? [approvalBranchSection] : []),
            ...(refinementClarificationSection ? [refinementClarificationSection] : []),
            ...(refinementApprovalQuestionsSection ? [refinementApprovalQuestionsSection] : [])
        ],
        afterArtifact: phaseOperationSection ? [phaseOperationSection] : []
    };
}
function renderCopyQuestionIcon() {
    return `
    <span class="copy-question-button__icon copy-question-button__icon--copy" aria-hidden="true">
      <svg viewBox="0 0 24 24" focusable="false">
        <path d="M9 9.75A2.75 2.75 0 0 1 11.75 7h6.5A2.75 2.75 0 0 1 21 9.75v8.5A2.75 2.75 0 0 1 18.25 21h-6.5A2.75 2.75 0 0 1 9 18.25v-8.5Zm2.75-1.25c-.69 0-1.25.56-1.25 1.25v8.5c0 .69.56 1.25 1.25 1.25h6.5c.69 0 1.25-.56 1.25-1.25v-8.5c0-.69-.56-1.25-1.25-1.25h-6.5ZM5.75 3h6.5A2.75 2.75 0 0 1 15 5.75V6.5h-1.5v-.75c0-.69-.56-1.25-1.25-1.25h-6.5c-.69 0-1.25.56-1.25 1.25v8.5c0 .69.56 1.25 1.25 1.25h.75V17h-.75A2.75 2.75 0 0 1 3 14.25v-8.5A2.75 2.75 0 0 1 5.75 3Z"></path>
      </svg>
    </span>
    <span class="copy-question-button__icon copy-question-button__icon--done" aria-hidden="true">
      <svg viewBox="0 0 24 24" focusable="false">
        <path d="M9.55 16.6 5.7 12.75l1.06-1.06 2.8 2.8 7.68-7.68 1.06 1.06-8.74 8.73Z"></path>
      </svg>
    </span>
  `;
}
//# sourceMappingURL=refinementPhaseView.js.map