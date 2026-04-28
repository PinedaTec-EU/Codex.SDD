"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildSpecPhaseSections = buildSpecPhaseSections;
function buildSpecPhaseSections(args) {
    const { workflow, selectedPhase, state, artifactQuestionBlock, specApprovalQuestions, unresolvedApprovalQuestionCount, escapeHtml, escapeHtmlAttribute, heroTokenClass, formatUtcTimestamp, renderChevronIcon } = args;
    const approvalBranchEditorVisible = selectedPhase.phaseId === "spec"
        && selectedPhase.isCurrent
        && workflow.controls.requiresApproval;
    const branchAlreadyCreated = selectedPhase.phaseId === "spec"
        && !selectedPhase.isCurrent
        && Boolean(workflow.workBranch?.trim());
    const approvalBranchSectionVisible = approvalBranchEditorVisible || (selectedPhase.phaseId === "spec" && branchAlreadyCreated);
    const approvalBaseBranchProposal = state.approvalBaseBranchProposal?.trim() || "main";
    const approvalWorkBranchProposal = state.approvalWorkBranchProposal?.trim() || workflow.workBranch?.trim() || "";
    const requiresExplicitApprovalBranchAcceptance = Boolean(state.requireExplicitApprovalBranchAcceptance);
    const approvalBranchSection = approvalBranchSectionVisible
        ? `
      <section class="detail-card detail-card--approval-branch" data-approval-branch-shell data-require-explicit-approval-branch-acceptance="${requiresExplicitApprovalBranchAcceptance ? "true" : "false"}">
        <div class="approval-branch__copy">
          <h3>Approval Branch</h3>
          <p>${branchAlreadyCreated
            ? "This is the work branch captured when the spec was approved."
            : "Confirm the base branch used to create the user story work branch before approving the spec."}</p>
        </div>
        <div class="approval-branch__controls">
          ${branchAlreadyCreated
            ? ""
            : `
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
                ${unresolvedApprovalQuestionCount > 0
                ? "Approve stays disabled until all human approval questions are resolved below."
                : requiresExplicitApprovalBranchAcceptance
                    ? "Approve stays disabled until you accept this branch value explicitly."
                    : "You can approve directly, and the current branch value will be sent with the action."}
              </p>
            `}
          <label class="approval-branch__field" for="approval-work-branch">Work Branch</label>
          <input
            id="approval-work-branch"
            class="approval-branch__input"
            type="text"
            value="${escapeHtmlAttribute(approvalWorkBranchProposal)}"
            data-approval-work-branch-input
            spellcheck="false"
            autocomplete="off"
            ${branchAlreadyCreated ? "readonly" : ""} />
          <p class="approval-branch__hint">${branchAlreadyCreated
            ? "The work branch has already been created for this user story and is now shown here as read only."
            : "This is the branch that will be created after approval. You can edit the proposed name before continuing."}</p>
        </div>
      </section>
    `
        : "";
    const specApprovalQuestionsSection = specApprovalQuestions.length > 0
        ? `
      <section class="detail-card detail-card--approval-questions">
        <h3>Human Approval Questions</h3>
        <p class="panel-copy">These are the open decisions the approver still needs to resolve before freezing the spec baseline. Pending questions stay amber. Answered questions turn green. Approval stays disabled until all are resolved.</p>
        <div class="approval-question-list">
          ${specApprovalQuestions.map((item) => `
            <article
              class="approval-question-item${item.resolved ? " approval-question-item--resolved" : " approval-question-item--pending"}"
              data-approval-question-item
              data-approval-question-index="${item.index}">
              <div class="approval-question-item__head">
                <button
                  class="approval-question-item__toggle"
                  type="button"
                  data-approval-question-toggle
                  aria-expanded="${item.resolved ? "false" : "true"}"
                  data-approval-question-index="${item.index}">
                  <span class="approval-question-item__index">${item.index}</span>
                  <span class="approval-question-item__body">${escapeHtml(item.question)}</span>
                  ${renderChevronIcon(`approval-question-item__chevron${item.resolved ? "" : " approval-question-item__chevron--expanded"}`)}
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
    const specRefinementSection = selectedPhase.phaseId === "spec"
        && artifactQuestionBlock?.decision?.toLowerCase() === "needs_refinement"
        ? `
      <section class="detail-card detail-card--artifact-questions">
        <h3>Spec Questions</h3>
        <div class="refinement-meta">
          ${artifactQuestionBlock.state ? `<span class="badge">${escapeHtml(artifactQuestionBlock.state)}</span>` : ""}
          <span class="badge${heroTokenClass(artifactQuestionBlock.decision)}">${escapeHtml(artifactQuestionBlock.decision)}</span>
        </div>
        ${artifactQuestionBlock.reason ? `<p class="refinement-reason">${escapeHtml(artifactQuestionBlock.reason)}</p>` : ""}
        ${artifactQuestionBlock.questions.length > 0
            ? `
            <div class="refinement-list">
              ${artifactQuestionBlock.questions.map((question, index) => `
                <label class="refinement-item">
                  <span class="refinement-question-row">
                    <span class="refinement-question">${index + 1}. ${escapeHtml(question)}</span>
                    <button
                      type="button"
                      class="copy-question-button"
                      data-copy-text="${escapeHtmlAttribute(question)}"
                      aria-label="Copy spec question ${index + 1}">${renderCopyQuestionIcon()}</button>
                  </span>
                  <textarea
                    class="refinement-answer"
                    data-spec-question-answer
                    data-index="${index + 1}"
                    rows="3"
                    placeholder="Write the answer and apply it back into the current spec via model."></textarea>
                </label>
              `).join("")}
            </div>
            <div class="detail-actions">
              <button id="submit-spec-questions" class="workflow-action-button workflow-action-button--progress" ${selectedPhase.isCurrent ? "" : "disabled"}>
                Apply Answers via Model
              </button>
            </div>
          `
            : "<p class=\"muted\">The artifact requests refinement, but no structured questions were detected.</p>"}
      </section>
    `
        : "";
    const phaseOperationSection = selectedPhase.phaseId === "spec"
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
            ...(specRefinementSection ? [specRefinementSection] : []),
            ...(specApprovalQuestionsSection ? [specApprovalQuestionsSection] : [])
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
//# sourceMappingURL=specPhaseView.js.map