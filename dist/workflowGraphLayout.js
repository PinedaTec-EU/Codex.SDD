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
exports.defaultVerticalWorkflowGraphPositions = exports.defaultHorizontalWorkflowGraphPositions = void 0;
exports.getWorkflowGraphLayoutPath = getWorkflowGraphLayoutPath;
exports.ensureWorkflowGraphLayoutConfigExistsAsync = ensureWorkflowGraphLayoutConfigExistsAsync;
exports.readWorkflowGraphLayoutConfigAsync = readWorkflowGraphLayoutConfigAsync;
const fs = __importStar(require("node:fs"));
const path = __importStar(require("node:path"));
const outputChannel_1 = require("./outputChannel");
const workflowGraphPhaseIds = [
    "capture",
    "refinement",
    "spec",
    "technical-design",
    "implementation",
    "review",
    "release-approval",
    "pr-preparation",
    "completed"
];
exports.defaultHorizontalWorkflowGraphPositions = {
    capture: { x: 72, y: 56 },
    refinement: { x: 430, y: 56 },
    spec: { x: 788, y: 56 },
    "technical-design": { x: 788, y: 398 },
    implementation: { x: 430, y: 398 },
    review: { x: 72, y: 398 },
    "release-approval": { x: 72, y: 740 },
    "pr-preparation": { x: 430, y: 740 },
    completed: { x: 788, y: 740 }
};
exports.defaultVerticalWorkflowGraphPositions = {
    capture: { x: 298, y: 36 },
    refinement: { x: 632, y: 198 },
    spec: { x: 360, y: 418 },
    "technical-design": { x: 72, y: 590 },
    implementation: { x: 470, y: 612 },
    review: { x: 420, y: 846 },
    "release-approval": { x: 738, y: 1018 },
    "pr-preparation": { x: 356, y: 1188 },
    completed: { x: 440, y: 1378 }
};
function getWorkflowGraphLayoutPath(workspaceRoot) {
    return path.join(workspaceRoot, ".specs", "workflow-graph-layout.yaml");
}
async function ensureWorkflowGraphLayoutConfigExistsAsync(workspaceRoot) {
    const filePath = getWorkflowGraphLayoutPath(workspaceRoot);
    try {
        await fs.promises.access(filePath, fs.constants.F_OK);
        (0, outputChannel_1.appendSpecForgeDebugLog)(`Workflow graph layout already exists at '${filePath}'.`);
        return;
    }
    catch {
        // Create below.
    }
    await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
    await fs.promises.writeFile(filePath, serializeWorkflowGraphLayoutConfig({
        horizontal: exports.defaultHorizontalWorkflowGraphPositions,
        vertical: exports.defaultVerticalWorkflowGraphPositions
    }), "utf8");
    (0, outputChannel_1.appendSpecForgeLog)(`Created workflow graph layout bootstrap at '${filePath}'.`);
}
async function readWorkflowGraphLayoutConfigAsync(workspaceRoot) {
    await ensureWorkflowGraphLayoutConfigExistsAsync(workspaceRoot);
    const filePath = getWorkflowGraphLayoutPath(workspaceRoot);
    try {
        const raw = await fs.promises.readFile(filePath, "utf8");
        return parseWorkflowGraphLayoutConfig(raw);
    }
    catch (error) {
        (0, outputChannel_1.appendSpecForgeLog)(`Workflow graph layout read failed for '${filePath}'. Falling back to defaults. ${error instanceof Error ? error.message : String(error)}`);
        return {
            horizontal: { ...exports.defaultHorizontalWorkflowGraphPositions },
            vertical: { ...exports.defaultVerticalWorkflowGraphPositions }
        };
    }
}
function parseWorkflowGraphLayoutConfig(raw) {
    const horizontal = { ...exports.defaultHorizontalWorkflowGraphPositions };
    const vertical = { ...exports.defaultVerticalWorkflowGraphPositions };
    let currentMode = null;
    let currentPhaseId = null;
    let pendingX = null;
    let pendingY = null;
    const commitPending = () => {
        if (!currentMode || !currentPhaseId || pendingX === null || pendingY === null) {
            return;
        }
        const target = currentMode === "horizontal" ? horizontal : vertical;
        target[currentPhaseId] = { x: pendingX, y: pendingY };
    };
    for (const rawLine of raw.replace(/\r\n/g, "\n").split("\n")) {
        const trimmed = rawLine.trim();
        if (trimmed.length === 0 || trimmed.startsWith("#")) {
            continue;
        }
        const modeMatch = /^(horizontal|vertical):\s*$/.exec(trimmed);
        if (modeMatch) {
            commitPending();
            currentMode = modeMatch[1];
            currentPhaseId = null;
            pendingX = null;
            pendingY = null;
            continue;
        }
        const phaseMatch = /^([a-z0-9-]+):\s*$/.exec(trimmed);
        if (phaseMatch && currentMode && workflowGraphPhaseIds.includes(phaseMatch[1])) {
            commitPending();
            currentPhaseId = phaseMatch[1];
            pendingX = null;
            pendingY = null;
            continue;
        }
        const xMatch = /^x:\s*(-?\d+)\s*$/.exec(trimmed);
        if (xMatch && currentPhaseId) {
            pendingX = Number.parseInt(xMatch[1], 10);
            continue;
        }
        const yMatch = /^y:\s*(-?\d+)\s*$/.exec(trimmed);
        if (yMatch && currentPhaseId) {
            pendingY = Number.parseInt(yMatch[1], 10);
            continue;
        }
    }
    commitPending();
    return { horizontal, vertical };
}
function serializeWorkflowGraphLayoutConfig(config) {
    const serializeMode = (mode) => {
        const positions = mode === "horizontal" ? config.horizontal : config.vertical;
        const lines = [`${mode}:`];
        for (const phaseId of workflowGraphPhaseIds) {
            const position = positions[phaseId];
            lines.push(`  ${phaseId}:`);
            lines.push(`    x: ${Math.round(position.x)}`);
            lines.push(`    y: ${Math.round(position.y)}`);
        }
        return lines.join("\n");
    };
    return [
        "# SpecForge workflow graph layout",
        "# Edit x/y coordinates to reposition cards in the workflow graph.",
        serializeMode("horizontal"),
        "",
        serializeMode("vertical"),
        ""
    ].join("\n");
}
//# sourceMappingURL=workflowGraphLayout.js.map