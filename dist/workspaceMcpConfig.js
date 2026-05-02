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
exports.specForgeWorkspaceMcpServerName = void 0;
exports.getWorkspaceMcpConfigPath = getWorkspaceMcpConfigPath;
exports.buildSpecForgeWorkspaceMcpServerConfig = buildSpecForgeWorkspaceMcpServerConfig;
exports.ensureWorkspaceMcpConfigAsync = ensureWorkspaceMcpConfigAsync;
const fs = __importStar(require("node:fs"));
const path = __importStar(require("node:path"));
const backendClientModel_1 = require("./backendClientModel");
exports.specForgeWorkspaceMcpServerName = "specforge";
function getWorkspaceMcpConfigPath(workspaceRoot) {
    return path.join(workspaceRoot, ".vscode", "mcp.json");
}
function buildSpecForgeWorkspaceMcpServerConfig(hostRoot) {
    const launchConfig = (0, backendClientModel_1.resolveMcpServerLaunchConfig)(hostRoot);
    return {
        type: "stdio",
        command: launchConfig.command,
        args: launchConfig.args,
        envFile: "${workspaceFolder}/.env"
    };
}
async function ensureWorkspaceMcpConfigAsync(workspaceRoot, hostRoot) {
    const filePath = getWorkspaceMcpConfigPath(workspaceRoot);
    const expectedServer = buildSpecForgeWorkspaceMcpServerConfig(hostRoot);
    const existingConfig = await readExistingConfigAsync(filePath);
    const previousServer = existingConfig.servers?.[exports.specForgeWorkspaceMcpServerName];
    if (isSameServerConfig(previousServer, expectedServer)) {
        return {
            path: filePath,
            changed: false,
            reason: "unchanged"
        };
    }
    const nextConfig = {
        ...existingConfig,
        servers: {
            ...(existingConfig.servers ?? {}),
            [exports.specForgeWorkspaceMcpServerName]: expectedServer
        }
    };
    await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
    await fs.promises.writeFile(filePath, `${JSON.stringify(nextConfig, null, 2)}\n`, "utf8");
    return {
        path: filePath,
        changed: true,
        reason: previousServer === undefined
            ? existingConfig.servers === undefined ? "created" : "added"
            : "updated"
    };
}
async function readExistingConfigAsync(filePath) {
    let raw;
    try {
        raw = await fs.promises.readFile(filePath, "utf8");
    }
    catch (error) {
        if (isNodeErrorWithCode(error, "ENOENT")) {
            return {};
        }
        throw error;
    }
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error(`Workspace MCP configuration '${filePath}' must be a JSON object.`);
    }
    return parsed;
}
function isSameServerConfig(actual, expected) {
    if (!actual || typeof actual !== "object" || Array.isArray(actual)) {
        return false;
    }
    const candidate = actual;
    return candidate.type === expected.type
        && candidate.command === expected.command
        && Array.isArray(candidate.args)
        && candidate.args.length === expected.args.length
        && candidate.args.every((value, index) => value === expected.args[index])
        && candidate.envFile === expected.envFile;
}
function isNodeErrorWithCode(error, code) {
    return error instanceof Error && "code" in error && error.code === code;
}
//# sourceMappingURL=workspaceMcpConfig.js.map