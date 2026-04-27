"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolvePreferredSelectedWorkflowPhaseId = resolvePreferredSelectedWorkflowPhaseId;
function resolvePreferredSelectedWorkflowPhaseId(workflow, selectedPhaseId) {
    if (workflow.phases.some((phase) => phase.phaseId === selectedPhaseId)) {
        return selectedPhaseId;
    }
    if (workflow.status === "completed" && workflow.phases.some((phase) => phase.phaseId === "completed")) {
        return "completed";
    }
    return workflow.phases.find((phase) => phase.isCurrent)?.phaseId
        ?? workflow.phases[0]?.phaseId
        ?? selectedPhaseId;
}
//# sourceMappingURL=workflowPhaseSelection.js.map