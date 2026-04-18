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
exports.createMcpBackendClient = createMcpBackendClient;
const node_child_process_1 = require("node:child_process");
const path = __importStar(require("node:path"));
const backendClientModel_1 = require("./backendClientModel");
const extensionSettings_1 = require("./extensionSettings");
const outputChannel_1 = require("./outputChannel");
function createMcpBackendClient(workspaceRoot, hostRoot, settings) {
    return new StdioMcpBackendClient(workspaceRoot, hostRoot, settings);
}
class StdioMcpBackendClient {
    process;
    pending = new Map();
    bufferChunks = [];
    workspaceRoot;
    hostRoot;
    writeQueue = Promise.resolve();
    nextRequestId = 1;
    initialized = false;
    disposed = false;
    constructor(workspaceRoot, hostRoot, settings) {
        this.workspaceRoot = workspaceRoot;
        this.hostRoot = hostRoot;
        const serverProjectPath = (0, backendClientModel_1.buildServerProjectPath)(hostRoot);
        (0, outputChannel_1.appendSpecForgeLog)(`Starting MCP backend for '${path.basename(workspaceRoot)}' using '${serverProjectPath}'.`);
        this.process = (0, node_child_process_1.spawn)("dotnet", ["run", "--project", serverProjectPath], {
            cwd: this.hostRoot,
            stdio: "pipe",
            env: {
                ...process.env,
                ...(0, extensionSettings_1.buildBackendEnvironment)(settings)
            }
        });
        this.process.stdout.on("data", (chunk) => {
            this.bufferChunks.push(chunk);
            void this.drainMessagesAsync();
        });
        this.process.stderr.on("data", (chunk) => {
            const message = chunk.toString("utf8").trim();
            if (!message) {
                return;
            }
            (0, outputChannel_1.appendSpecForgeLog)(`MCP stderr: ${message}`);
            this.rejectPendingRequests(message);
        });
        this.process.on("exit", (code, signal) => {
            (0, outputChannel_1.appendSpecForgeLog)(`MCP backend exited with code ${code ?? "null"} and signal ${signal ?? "null"}.`);
            if (!this.disposed) {
                this.rejectPendingRequests("SpecForge MCP backend exited while a request was in progress.");
            }
        });
    }
    async listUserStories() {
        const result = await this.callTool("list_user_stories", {
            workspaceRoot: this.workspaceRoot
        });
        return result.items;
    }
    async getUserStorySummary(usId) {
        return this.callTool("get_user_story_summary", {
            workspaceRoot: this.workspaceRoot,
            usId
        });
    }
    async getUserStoryWorkflow(usId) {
        return this.callTool("get_user_story_workflow", {
            workspaceRoot: this.workspaceRoot,
            usId
        });
    }
    async createUserStory(usId, title, kind, category, sourceText) {
        return this.callTool("create_us_from_chat", {
            workspaceRoot: this.workspaceRoot,
            usId,
            title,
            kind,
            category,
            sourceText
        });
    }
    async importUserStory(usId, sourcePath, title, kind, category) {
        return this.callTool("import_us_from_markdown", {
            workspaceRoot: this.workspaceRoot,
            usId,
            sourcePath,
            title,
            kind,
            category
        });
    }
    async initializeRepoPrompts(overwrite = false) {
        return this.callTool("initialize_repo_prompts", {
            workspaceRoot: this.workspaceRoot,
            overwrite
        });
    }
    async continuePhase(usId) {
        return this.callTool("generate_next_phase", {
            workspaceRoot: this.workspaceRoot,
            usId
        });
    }
    async approveCurrentPhase(usId, baseBranch) {
        return this.callTool("approve_phase", (0, backendClientModel_1.buildApprovePhaseArguments)(this.workspaceRoot, usId, baseBranch));
    }
    async requestRegression(usId, targetPhase, reason) {
        return this.callTool("request_regression", (0, backendClientModel_1.buildRequestRegressionArguments)(this.workspaceRoot, usId, targetPhase, reason));
    }
    async restartUserStoryFromSource(usId, reason) {
        return this.callTool("restart_user_story_from_source", (0, backendClientModel_1.buildRestartUserStoryArguments)(this.workspaceRoot, usId, reason));
    }
    cancelActiveOperations() {
        this.dispose();
    }
    dispose() {
        if (this.disposed) {
            return;
        }
        this.disposed = true;
        (0, outputChannel_1.appendSpecForgeLog)("Disposing MCP backend client.");
        this.rejectPendingRequests("SpecForge MCP backend was stopped.");
        this.process.kill();
    }
    async ensureInitializedAsync() {
        if (this.initialized) {
            return;
        }
        (0, outputChannel_1.appendSpecForgeLog)("Initializing MCP session.");
        await this.sendRequestAsync("initialize", {
            protocolVersion: "2024-11-05",
            capabilities: {},
            clientInfo: {
                name: "SpecForge VS Code Extension",
                version: "0.0.1"
            }
        });
        await this.sendNotificationAsync("notifications/initialized", {});
        this.initialized = true;
        (0, outputChannel_1.appendSpecForgeLog)("MCP session initialized.");
    }
    async callTool(toolName, args) {
        await this.ensureInitializedAsync();
        const startedAt = Date.now();
        (0, outputChannel_1.appendSpecForgeLog)(`Calling tool '${toolName}' with ${JSON.stringify(args)}.`);
        try {
            const result = await this.sendRequestAsync("tools/call", {
                name: toolName,
                arguments: args
            });
            (0, outputChannel_1.appendSpecForgeLog)(`Tool '${toolName}' completed in ${Date.now() - startedAt} ms.`);
            return (0, backendClientModel_1.parseToolContent)(toolName, result);
        }
        catch (error) {
            (0, outputChannel_1.appendSpecForgeLog)(`Tool '${toolName}' failed after ${Date.now() - startedAt} ms: ${asErrorMessage(error)}`);
            throw error;
        }
    }
    async sendNotificationAsync(method, params) {
        const payload = {
            jsonrpc: "2.0",
            method,
            params
        };
        await this.writePayloadAsync(JSON.stringify(payload));
    }
    async sendRequestAsync(method, params) {
        if (this.disposed) {
            throw new Error("SpecForge MCP backend client is disposed.");
        }
        const id = this.nextRequestId++;
        const payload = {
            jsonrpc: "2.0",
            id,
            method,
            params
        };
        const resultPromise = new Promise((resolve, reject) => {
            this.pending.set(id, { resolve, reject });
        });
        await this.writePayloadAsync(JSON.stringify(payload));
        return resultPromise;
    }
    async writePayloadAsync(json) {
        const payload = Buffer.from(json, "utf8");
        const header = Buffer.from(`Content-Length: ${payload.length}\r\n\r\n`, "ascii");
        const writeOperation = this.writeQueue.then(async () => {
            await writeAsync(this.process.stdin, header);
            await writeAsync(this.process.stdin, payload);
        });
        this.writeQueue = writeOperation.catch(() => undefined);
        await writeOperation;
    }
    async drainMessagesAsync() {
        let buffer = Buffer.concat(this.bufferChunks);
        this.bufferChunks.length = 0;
        while (true) {
            const separatorIndex = buffer.indexOf("\r\n\r\n");
            if (separatorIndex < 0) {
                if (buffer.length > 0) {
                    this.bufferChunks.push(buffer);
                }
                return;
            }
            const header = buffer.subarray(0, separatorIndex).toString("utf8");
            const match = /Content-Length:\s*(\d+)/i.exec(header);
            if (!match) {
                throw new Error("Invalid MCP response header.");
            }
            const contentLength = Number.parseInt(match[1], 10);
            const bodyStart = separatorIndex + 4;
            if (buffer.length < bodyStart + contentLength) {
                this.bufferChunks.push(buffer);
                return;
            }
            const body = buffer.subarray(bodyStart, bodyStart + contentLength).toString("utf8");
            const message = JSON.parse(body);
            this.handleMessage(message);
            buffer = buffer.subarray(bodyStart + contentLength);
        }
    }
    handleMessage(message) {
        if (typeof message.id !== "number") {
            return;
        }
        const pending = this.pending.get(message.id);
        if (!pending) {
            return;
        }
        this.pending.delete(message.id);
        if (message.error) {
            pending.reject(new Error(message.error.message));
            return;
        }
        pending.resolve(message.result);
    }
    rejectPendingRequests(message) {
        for (const request of this.pending.values()) {
            request.reject(new Error(message));
        }
        this.pending.clear();
    }
}
async function writeAsync(stream, payload) {
    await new Promise((resolve, reject) => {
        stream.write(payload, (error) => {
            if (error) {
                reject(error);
                return;
            }
            resolve();
        });
    });
}
function asErrorMessage(error) {
    if (error instanceof Error) {
        return error.message;
    }
    return "Unknown backend client error.";
}
//# sourceMappingURL=backendClient.js.map