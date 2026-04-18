"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildApprovePhaseArguments = buildApprovePhaseArguments;
exports.buildRequestRegressionArguments = buildRequestRegressionArguments;
exports.buildRestartUserStoryArguments = buildRestartUserStoryArguments;
exports.parseToolContent = parseToolContent;
function buildApprovePhaseArguments(workspaceRoot, usId, baseBranch) {
    const argumentsPayload = {
        workspaceRoot,
        usId
    };
    if (baseBranch) {
        argumentsPayload.baseBranch = baseBranch;
    }
    return argumentsPayload;
}
function buildRequestRegressionArguments(workspaceRoot, usId, targetPhase, reason) {
    const argumentsPayload = {
        workspaceRoot,
        usId,
        targetPhase
    };
    if (reason && reason.trim().length > 0) {
        argumentsPayload.reason = reason;
    }
    return argumentsPayload;
}
function buildRestartUserStoryArguments(workspaceRoot, usId, reason) {
    const argumentsPayload = {
        workspaceRoot,
        usId
    };
    if (reason && reason.trim().length > 0) {
        argumentsPayload.reason = reason;
    }
    return argumentsPayload;
}
function parseToolContent(toolName, result) {
    const content = result?.content?.[0]?.text;
    if (typeof content !== "string") {
        throw new Error(`Tool '${toolName}' returned an invalid MCP payload.`);
    }
    return JSON.parse(content);
}
//# sourceMappingURL=backendClientModel.js.map