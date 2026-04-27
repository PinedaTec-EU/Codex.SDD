"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveWorkflowRejectPlan = resolveWorkflowRejectPlan;
function resolveWorkflowRejectPlan(currentPhaseId) {
    switch (currentPhaseId) {
        case "spec":
            return {
                targetPhaseId: "spec",
                mode: "operate-current",
                modalTitle: "Reject Spec Approval",
                modalPrompt: "Describe what is wrong so SpecForge can apply the correction directly to the spec artifact.",
                helperText: "Confirming keeps the workflow in spec, records your note, and applies it through the model over the current spec artifact.",
                confirmLabel: "Reject and Apply"
            };
        case "release-approval":
            return {
                targetPhaseId: "review",
                mode: "rewind-and-operate",
                modalTitle: "Reject Release Approval",
                modalPrompt: "Describe what is wrong so SpecForge can rewind to review and apply the note over the review artifact.",
                helperText: "Confirming rewinds the workflow to review, records your note, and applies it through the model over the review artifact.",
                confirmLabel: "Reject, Rewind, and Apply"
            };
        default:
            return null;
    }
}
//# sourceMappingURL=workflowRejectPlan.js.map