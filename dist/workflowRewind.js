"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildTimelineRewindPhaseHistory = buildTimelineRewindPhaseHistory;
exports.resolveTimelineRewindTargetPhase = resolveTimelineRewindTargetPhase;
const ignoredTimelineRewindCodes = new Set(["workflow_rewound"]);
function buildTimelineRewindPhaseHistory(workflow) {
    const history = [];
    const pushPhase = (phaseId) => {
        const normalizedPhaseId = phaseId?.trim() ?? "";
        if (normalizedPhaseId.length === 0 || normalizedPhaseId === "completed") {
            return;
        }
        if (history[history.length - 1] === normalizedPhaseId) {
            return;
        }
        history.push(normalizedPhaseId);
    };
    if (workflow.currentPhase !== "capture" && workflow.controls.canRestartFromSource) {
        pushPhase("capture");
    }
    for (const event of workflow.events) {
        if (ignoredTimelineRewindCodes.has(event.code)) {
            continue;
        }
        pushPhase(event.phase);
    }
    pushPhase(workflow.currentPhase);
    return history;
}
function resolveTimelineRewindTargetPhase(workflow, displayedCurrentPhaseId) {
    const history = buildTimelineRewindPhaseHistory(workflow);
    if (history.length <= 1) {
        return null;
    }
    const currentPhaseId = (displayedCurrentPhaseId?.trim() || workflow.currentPhase).trim();
    const currentIndex = history.lastIndexOf(currentPhaseId);
    if (currentIndex <= 0) {
        return null;
    }
    return history[currentIndex - 1] ?? null;
}
//# sourceMappingURL=workflowRewind.js.map