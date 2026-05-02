"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizePlaybackStateAfterManualWorkflowChange = normalizePlaybackStateAfterManualWorkflowChange;
exports.canPauseWorkflowExecutionPhase = canPauseWorkflowExecutionPhase;
exports.resolveWorkflowExecutionPhaseId = resolveWorkflowExecutionPhaseId;
exports.resolveNextWorkflowExecutionPhaseId = resolveNextWorkflowExecutionPhaseId;
const workflowExecutionPhaseOrder = [
    "capture",
    "refinement",
    "spec",
    "technical-design",
    "implementation",
    "review",
    "release-approval",
    "pr-preparation"
];
function normalizePlaybackStateAfterManualWorkflowChange(playbackState) {
    return playbackState === "playing" ? "playing" : "idle";
}
function canPauseWorkflowExecutionPhase(phaseId) {
    // Capture starts the model-routed transition, but pause boundaries begin before refinement.
    return phaseId !== "capture" && workflowExecutionPhaseOrder.includes(phaseId);
}
function resolveWorkflowExecutionPhaseId(currentPhaseId) {
    if (currentPhaseId === "capture") {
        return "capture";
    }
    const phaseIndex = workflowExecutionPhaseOrder.indexOf(currentPhaseId);
    if (phaseIndex < 0 || phaseIndex + 1 >= workflowExecutionPhaseOrder.length) {
        return null;
    }
    return workflowExecutionPhaseOrder[phaseIndex + 1];
}
function resolveNextWorkflowExecutionPhaseId(executionPhaseId) {
    const phaseIndex = workflowExecutionPhaseOrder.indexOf(executionPhaseId);
    if (phaseIndex < 0 || phaseIndex + 1 >= workflowExecutionPhaseOrder.length) {
        return null;
    }
    return workflowExecutionPhaseOrder[phaseIndex + 1];
}
//# sourceMappingURL=workflowPlaybackState.js.map