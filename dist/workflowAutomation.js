"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.countImplementationAttempts = countImplementationAttempts;
exports.hasReachedImplementationReviewCycleLimit = hasReachedImplementationReviewCycleLimit;
function countImplementationAttempts(workflow) {
    const artifacts = new Set();
    for (const event of workflow.events) {
        if (event.phase !== "implementation") {
            continue;
        }
        if (event.code !== "phase_completed" && event.code !== "artifact_operated") {
            continue;
        }
        for (const artifactPath of event.artifacts) {
            if (artifactPath.toLowerCase().endsWith(".md")) {
                artifacts.add(artifactPath);
            }
        }
    }
    return artifacts.size;
}
function hasReachedImplementationReviewCycleLimit(workflow, maxImplementationReviewCycles) {
    return typeof maxImplementationReviewCycles === "number"
        && maxImplementationReviewCycles > 0
        && countImplementationAttempts(workflow) >= maxImplementationReviewCycles;
}
//# sourceMappingURL=workflowAutomation.js.map