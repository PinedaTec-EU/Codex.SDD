"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolvePreferredSelectedWorkflowPhaseId = resolvePreferredSelectedWorkflowPhaseId;
function resolvePreferredSelectedWorkflowPhaseId(workflow, selectedPhaseId) {
    if (workflow.status === "completed" && workflow.phases.some((phase) => phase.phaseId === "completed")) {
        return "completed";
    }
    return selectedPhaseId;
}
//# sourceMappingURL=workflowPhaseSelection.js.map