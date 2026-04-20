"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildApprovePhaseArguments = buildApprovePhaseArguments;
exports.buildRequestRegressionArguments = buildRequestRegressionArguments;
exports.buildRestartUserStoryArguments = buildRestartUserStoryArguments;
exports.parseToolContent = parseToolContent;
exports.buildServerProjectPath = buildServerProjectPath;
function buildApprovePhaseArguments(workspaceRoot, usId, baseBranch, actor) {
    const argumentsPayload = {
        workspaceRoot,
        usId
    };
    if (baseBranch) {
        argumentsPayload.baseBranch = baseBranch;
    }
    if (actor && actor.trim().length > 0) {
        argumentsPayload.actor = actor;
    }
    return argumentsPayload;
}
function buildRequestRegressionArguments(workspaceRoot, usId, targetPhase, reason, actor) {
    const argumentsPayload = {
        workspaceRoot,
        usId,
        targetPhase
    };
    if (reason && reason.trim().length > 0) {
        argumentsPayload.reason = reason;
    }
    if (actor && actor.trim().length > 0) {
        argumentsPayload.actor = actor;
    }
    return argumentsPayload;
}
function buildRestartUserStoryArguments(workspaceRoot, usId, reason, actor) {
    const argumentsPayload = {
        workspaceRoot,
        usId
    };
    if (reason && reason.trim().length > 0) {
        argumentsPayload.reason = reason;
    }
    if (actor && actor.trim().length > 0) {
        argumentsPayload.actor = actor;
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
function buildServerProjectPath(hostRoot) {
    return `${hostRoot.replace(/[\\\/]+$/, "")}/src/SpecForge.McpServer/SpecForge.McpServer.csproj`;
}
//# sourceMappingURL=backendClientModel.js.map