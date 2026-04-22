"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildClarificationPhaseSections = buildClarificationPhaseSections;
function buildClarificationPhaseSections(args) {
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
                      aria-label="Copy question ${item.index}">
                      Copy
                    </button>
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
//# sourceMappingURL=clarificationPhaseView.js.map