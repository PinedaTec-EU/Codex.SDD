"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveCompletedWorkflowReopenTargetPhase = resolveCompletedWorkflowReopenTargetPhase;
exports.buildCompletedWorkflowReopenOperationPrompt = buildCompletedWorkflowReopenOperationPrompt;
function resolveCompletedWorkflowReopenTargetPhase(reasonKind) {
    switch ((reasonKind ?? "").trim()) {
        case "merge-conflict":
        case "defect":
            return "implementation";
        case "functional-issue":
            return "refinement";
        case "technical-issue":
            return "technical-design";
        default:
            return "";
    }
}
function buildCompletedWorkflowReopenOperationPrompt(reasonKind, description) {
    const normalizedDescription = description?.trim() ?? "";
    const targetPhase = resolveCompletedWorkflowReopenTargetPhase(reasonKind);
    if (normalizedDescription.length === 0) {
        return "";
    }
    switch (targetPhase) {
        case "refinement":
            return [
                "Apply this completed-workflow reopen note directly to the current refinement artifact.",
                "Treat this as a corrective refinement pass over the approved spec, not a restart.",
                "Update scope, constraints, acceptance criteria, and approval-facing details so the reopened issue is explicit and reviewable.",
                "",
                "Reopen note:",
                normalizedDescription
            ].join("\n");
        case "technical-design":
            return [
                "Apply this completed-workflow reopen note directly to the current technical design artifact.",
                "Treat this as a corrective technical-design pass over the approved design, not a restart.",
                "Update architecture, implementation plan, and validation strategy so the reopened technical issue is explicit and testable.",
                "",
                "Reopen note:",
                normalizedDescription
            ].join("\n");
        case "implementation":
            return [
                "Apply this completed-workflow reopen note directly to the current implementation artifact.",
                "Treat this as a corrective implementation pass over the delivered implementation, not a restart.",
                "Update the implementation narrative and execution intent so the reopened defect or merge issue is explicit and actionable.",
                "",
                "Reopen note:",
                normalizedDescription
            ].join("\n");
        default:
            return normalizedDescription;
    }
}
//# sourceMappingURL=workflowCompletedReopen.js.map