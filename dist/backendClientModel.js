"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildApprovePhaseArguments = buildApprovePhaseArguments;
exports.buildRequestRegressionArguments = buildRequestRegressionArguments;
exports.buildRestartUserStoryArguments = buildRestartUserStoryArguments;
exports.buildRewindWorkflowArguments = buildRewindWorkflowArguments;
exports.buildReopenCompletedWorkflowArguments = buildReopenCompletedWorkflowArguments;
exports.parseToolContent = parseToolContent;
exports.buildServerProjectPath = buildServerProjectPath;
exports.buildPackagedServerDllPath = buildPackagedServerDllPath;
exports.resolveMcpServerLaunchConfig = resolveMcpServerLaunchConfig;
const fs = __importStar(require("node:fs"));
const path = __importStar(require("node:path"));
function buildApprovePhaseArguments(workspaceRoot, usId, baseBranch, workBranch, actor) {
    const argumentsPayload = {
        workspaceRoot,
        usId
    };
    if (baseBranch) {
        argumentsPayload.baseBranch = baseBranch;
    }
    if (workBranch) {
        argumentsPayload.workBranch = workBranch;
    }
    if (actor && actor.trim().length > 0) {
        argumentsPayload.actor = actor;
    }
    return argumentsPayload;
}
function buildRequestRegressionArguments(workspaceRoot, usId, targetPhase, reason, actor, destructive) {
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
    if (destructive) {
        argumentsPayload.destructive = "true";
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
function buildRewindWorkflowArguments(workspaceRoot, usId, targetPhase, actor, destructive) {
    const argumentsPayload = {
        workspaceRoot,
        usId,
        targetPhase
    };
    if (actor && actor.trim().length > 0) {
        argumentsPayload.actor = actor;
    }
    if (destructive) {
        argumentsPayload.destructive = "true";
    }
    return argumentsPayload;
}
function buildReopenCompletedWorkflowArguments(workspaceRoot, usId, reasonKind, description, actor) {
    const argumentsPayload = {
        workspaceRoot,
        usId,
        reasonKind,
        description
    };
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
function buildPackagedServerDllPath(hostRoot) {
    return path.join(trimTrailingPathSeparators(hostRoot), "dist", "mcp", "SpecForge.McpServer.dll");
}
function resolveMcpServerLaunchConfig(hostRoot) {
    const packagedServerPath = buildPackagedServerDllPath(hostRoot);
    if (fs.existsSync(packagedServerPath)) {
        return {
            command: "dotnet",
            args: [packagedServerPath],
            cwd: path.dirname(packagedServerPath),
            source: "packaged",
            targetPath: packagedServerPath
        };
    }
    const serverProjectPath = buildServerProjectPath(hostRoot);
    return {
        command: "dotnet",
        args: ["run", "--project", serverProjectPath],
        cwd: trimTrailingPathSeparators(hostRoot),
        source: "project",
        targetPath: serverProjectPath
    };
}
function trimTrailingPathSeparators(value) {
    return value.replace(/[\\\/]+$/, "");
}
//# sourceMappingURL=backendClientModel.js.map