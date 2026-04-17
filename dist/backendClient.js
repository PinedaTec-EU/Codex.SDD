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
exports.createLocalCliBackendClient = createLocalCliBackendClient;
const node_child_process_1 = require("node:child_process");
const path = __importStar(require("node:path"));
const node_util_1 = require("node:util");
const execFileAsync = (0, node_util_1.promisify)(node_child_process_1.execFile);
function createLocalCliBackendClient(workspaceRoot) {
    return {
        listUserStories: async () => {
            const payload = await invokeRunner(workspaceRoot, [
                "list-user-stories",
                workspaceRoot
            ]);
            return payload.items;
        },
        getUserStorySummary: async (usId) => {
            return invokeRunner(workspaceRoot, [
                "get-user-story-summary",
                workspaceRoot,
                usId
            ]);
        },
        createUserStory: async (usId, title, sourceText) => {
            return invokeRunner(workspaceRoot, [
                "create-us",
                workspaceRoot,
                usId,
                title,
                sourceText
            ]);
        },
        importUserStory: async (usId, sourcePath, title) => {
            return invokeRunner(workspaceRoot, [
                "import-us",
                workspaceRoot,
                usId,
                sourcePath,
                title
            ]);
        },
        continuePhase: async (usId) => {
            return invokeRunner(workspaceRoot, [
                "continue-phase",
                workspaceRoot,
                usId
            ]);
        },
        approveCurrentPhase: async (usId, baseBranch) => {
            return invokeRunner(workspaceRoot, [
                "approve-phase",
                workspaceRoot,
                usId,
                baseBranch ?? "-"
            ]);
        }
    };
}
async function invokeRunner(workspaceRoot, args) {
    const cliProjectPath = path.join(workspaceRoot, "src", "SpecForge.Runner.Cli", "SpecForge.Runner.Cli.csproj");
    const { stdout, stderr } = await execFileAsync("dotnet", ["run", "--project", cliProjectPath, "--", ...args], {
        cwd: workspaceRoot,
        maxBuffer: 1024 * 1024
    });
    if (stderr.trim().length > 0) {
        throw new Error(stderr.trim());
    }
    return JSON.parse(stdout);
}
//# sourceMappingURL=backendClient.js.map