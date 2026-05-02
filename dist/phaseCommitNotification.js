"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildPhaseCommitNotification = buildPhaseCommitNotification;
function buildPhaseCommitNotification(usId, commit) {
    if (!commit?.commitCreated || !commit.commitSha) {
        return null;
    }
    const shortSha = commit.commitSha.slice(0, 12);
    return {
        shortSha,
        logMessage: `Workflow '${usId}' created git commit ${shortSha}: ${commit.message ?? "(no message)"}. Files: ${commit.stagedPaths.length}.`,
        userMessage: `${usId} phase commit created: ${shortSha}`
    };
}
//# sourceMappingURL=phaseCommitNotification.js.map