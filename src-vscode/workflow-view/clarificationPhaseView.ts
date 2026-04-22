import type { UserStoryWorkflowDetails, WorkflowPhaseDetails } from "../backendClient";
import type { WorkflowViewState, PhaseSectionFragments } from "./models";

interface ClarificationPhaseViewArgs {
  readonly workflow: UserStoryWorkflowDetails;
  readonly selectedPhase: WorkflowPhaseDetails;
  readonly state: WorkflowViewState;
  readonly heroTokenClass: (value: string) => string;
  readonly escapeHtml: (value: string) => string;
  readonly escapeHtmlAttribute: (value: string) => string;
}

export function buildClarificationPhaseSections(args: ClarificationPhaseViewArgs): PhaseSectionFragments {
  const { workflow, selectedPhase, state, heroTokenClass, escapeHtml, escapeHtmlAttribute } = args;
  const clarificationSuggestionsSection = `
    <div class="clarification-context">
      <div class="clarification-context__copy">
        <h4>Need more repo context?</h4>
        <p>
          If the model is blocked by missing repository knowledge, add code, tests, configs, or docs as
          <strong> Context</strong>. Those files are injected into execution. <strong>US Info</strong> stays attached
          to the story, but is not sent to the model by default.
        </p>
      </div>
      <div class="detail-actions detail-actions--files detail-actions--clarification">
        <button class="workflow-action-button workflow-action-button--document" data-command="attachFiles" data-kind="context">Add Context Files</button>
        ${state.contextSuggestions.length > 1
          ? `<button class="workflow-action-button workflow-action-button--document" data-add-suggested-context-files='${escapeHtmlAttribute(JSON.stringify(state.contextSuggestions.map((item) => item.path)))}'>Add All Suggested</button>`
          : ""}
      </div>
      ${state.contextSuggestions.length > 0
        ? `
          <div class="clarification-suggestions">
            ${state.contextSuggestions.map((suggestion) => `
              <div class="clarification-suggestion">
                <div class="clarification-suggestion__body">
                  <strong>${escapeHtml(suggestion.relativePath)}</strong>
                  <span>${escapeHtml(suggestion.reason)}</span>
                </div>
                <button class="workflow-action-button workflow-action-button--document workflow-action-button--compact" data-command="addSuggestedContextFile" data-path="${escapeHtmlAttribute(suggestion.path)}">Add to Context</button>
              </div>
            `).join("")}
          </div>
        `
        : `<p class="muted">No local context suggestions matched this clarification yet. You can still add files manually.</p>`}
    </div>
  `;

  const clarificationSection = selectedPhase.phaseId === "clarification" && workflow.clarification
    ? `
      <div class="clarification-shell">
        <div class="clarification-meta">
          <span class="badge${heroTokenClass(workflow.clarification.status)}">${escapeHtml(workflow.clarification.status)}</span>
          <span class="badge">${escapeHtml(workflow.clarification.tolerance)}</span>
        </div>
        ${workflow.clarification.reason ? `<p class="clarification-reason">${escapeHtml(workflow.clarification.reason)}</p>` : ""}
        ${workflow.clarification.items.length > 0
      ? `
            <div class="clarification-list">
              ${workflow.clarification.items.map((item) => `
                <label class="clarification-item">
                  <span class="clarification-question-row">
                    <span class="clarification-question">${item.index}. ${escapeHtml(item.question)}</span>
                    <button
                      type="button"
                      class="copy-question-button"
                      data-copy-text="${escapeHtmlAttribute(item.question)}"
                      aria-label="Copy question ${item.index}">${renderCopyQuestionIcon()}</button>
                  </span>
                  <textarea
                    class="clarification-answer"
                    data-clarification-answer
                    data-index="${item.index}"
                    rows="3"
                    placeholder="Write the answer that should remain persisted in us.md">${escapeHtml(item.answer ?? "")}</textarea>
                </label>
              `).join("")}
            </div>
            <div class="detail-actions">
              <button id="submit-clarification-answers" class="workflow-action-button workflow-action-button--progress" ${selectedPhase.isCurrent ? "" : "disabled"}>
                Submit Answers
              </button>
            </div>
          `
      : "<p class=\"muted\">No clarification questions are currently registered for this user story.</p>"}
        ${clarificationSuggestionsSection}
      </div>
    `
    : "";

  return {
    beforeArtifact: [],
    afterArtifact: clarificationSection
      ? [
          `
            <section class="detail-card">
              <h3>Clarification</h3>
              ${clarificationSection}
            </section>
          `
        ]
      : []
  };
}

function renderCopyQuestionIcon(): string {
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
