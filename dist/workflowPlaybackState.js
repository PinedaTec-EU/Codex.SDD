"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizePlaybackStateAfterManualWorkflowChange = normalizePlaybackStateAfterManualWorkflowChange;
exports.canPauseWorkflowExecutionPhase = canPauseWorkflowExecutionPhase;
exports.resolveWorkflowExecutionPhaseId = resolveWorkflowExecutionPhaseId;
exports.resolveNextWorkflowExecutionPhaseId = resolveNextWorkflowExecutionPhaseId;
const workflowExecutionPhaseOrder = [
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
    // Capture is intentionally excluded: the first pauseable boundary is before refinement.
    return workflowExecutionPhaseOrder.includes(phaseId);
}
function resolveWorkflowExecutionPhaseId(currentPhaseId) {
    if (currentPhaseId === "capture") {
        return "refinement";
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