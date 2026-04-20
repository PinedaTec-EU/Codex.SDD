"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizePlaybackStateAfterManualWorkflowChange = normalizePlaybackStateAfterManualWorkflowChange;
function normalizePlaybackStateAfterManualWorkflowChange(playbackState) {
    return playbackState === "playing" ? "playing" : "idle";
}
//# sourceMappingURL=workflowPlaybackState.js.map