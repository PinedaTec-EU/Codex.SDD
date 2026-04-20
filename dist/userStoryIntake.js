"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EMPTY_USER_STORY_WIZARD_DRAFT = void 0;
exports.normalizeWizardDraft = normalizeWizardDraft;
exports.getWizardMissingFields = getWizardMissingFields;
exports.buildWizardSourceText = buildWizardSourceText;
exports.EMPTY_USER_STORY_WIZARD_DRAFT = {
    actor: "",
    objective: "",
    value: "",
    inScope: "",
    acceptanceCriteria: "",
    repoContext: "",
    outOfScope: "",
    constraints: "",
    notes: ""
};
function normalizeWizardDraft(draft) {
    return {
        actor: draft?.actor?.trim() ?? "",
        objective: draft?.objective?.trim() ?? "",
        value: draft?.value?.trim() ?? "",
        inScope: draft?.inScope?.trim() ?? "",
        acceptanceCriteria: draft?.acceptanceCriteria?.trim() ?? "",
        repoContext: draft?.repoContext?.trim() ?? "",
        outOfScope: draft?.outOfScope?.trim() ?? "",
        constraints: draft?.constraints?.trim() ?? "",
        notes: draft?.notes?.trim() ?? ""
    };
}
function getWizardMissingFields(draft) {
    const normalized = normalizeWizardDraft(draft);
    const missing = [];
    if (!normalized.actor) {
        missing.push("who is affected");
    }
    if (!normalized.objective) {
        missing.push("objective or change");
    }
    if (!normalized.acceptanceCriteria) {
        missing.push("acceptance criteria");
    }
    return missing;
}
function buildWizardSourceText(draft) {
    const normalized = normalizeWizardDraft(draft);
    const sections = [];
    sections.push("## Minimum Information");
    sections.push(`- Actor / affected area: ${fallback(normalized.actor)}`);
    sections.push(`- Objective / requested change: ${fallback(normalized.objective)}`);
    sections.push(`- Acceptance criteria: ${fallback(normalized.acceptanceCriteria)}`);
    const recommended = [];
    if (normalized.value) {
        recommended.push(`- Why this matters: ${normalized.value}`);
    }
    if (normalized.inScope) {
        recommended.push(`- Scope / expected touchpoints: ${normalized.inScope}`);
    }
    if (normalized.repoContext) {
        recommended.push(`- Repo context or likely files: ${normalized.repoContext}`);
    }
    if (normalized.outOfScope) {
        recommended.push(`- Out of scope: ${normalized.outOfScope}`);
    }
    if (normalized.constraints) {
        recommended.push(`- Constraints / guardrails: ${normalized.constraints}`);
    }
    if (normalized.notes) {
        recommended.push(`- Extra notes: ${normalized.notes}`);
    }
    if (recommended.length > 0) {
        sections.push("");
        sections.push("## Recommended Detail");
        sections.push(...recommended);
    }
    return `${sections.join("\n").trim()}\n`;
}
function fallback(value) {
    return value.length > 0 ? value : "_missing_";
}
//# sourceMappingURL=userStoryIntake.js.map