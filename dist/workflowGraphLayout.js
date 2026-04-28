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
exports.defaultVerticalWorkflowGraphConnections = exports.defaultHorizontalWorkflowGraphConnections = exports.defaultVerticalWorkflowGraphPositions = exports.defaultHorizontalWorkflowGraphPositions = void 0;
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
// Keep this comment aligned with workflowView.ts card constants.
// Card dimensions used by the renderer: desktop 240x118, mobile 206x118.
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
exports.defaultHorizontalWorkflowGraphConnections = {
    "capture->refinement": { from: "R3", to: "L3" },
    "refinement->spec": { from: "R3", to: "L3" },
    "spec->technical-design": { from: "B3", to: "T3" },
    "technical-design->implementation": { from: "L3", to: "R3" },
    "implementation->review": { from: "L3", to: "R3" },
    "review->release-approval": { from: "B3", to: "T3" },
    "release-approval->pr-preparation": { from: "R3", to: "L3" },
    "pr-preparation->completed": { from: "R3", to: "L3" }
};
exports.defaultVerticalWorkflowGraphConnections = {
    "capture->refinement": { from: "R4", to: "T2" },
    "refinement->spec": { from: "B2", to: "T4" },
    "spec->technical-design": { from: "L4", to: "T3" },
    "technical-design->implementation": { from: "R4", to: "L3" },
    "implementation->review": { from: "B3", to: "T3" },
    "review->release-approval": { from: "R3", to: "T2" },
    "release-approval->pr-preparation": { from: "B2", to: "R3" },
    "pr-preparation->completed": { from: "R3", to: "L3" }
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
        vertical: exports.defaultVerticalWorkflowGraphPositions,
        connections: {
            horizontal: exports.defaultHorizontalWorkflowGraphConnections,
            vertical: exports.defaultVerticalWorkflowGraphConnections
        }
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
            vertical: { ...exports.defaultVerticalWorkflowGraphPositions },
            connections: {
                horizontal: { ...exports.defaultHorizontalWorkflowGraphConnections },
                vertical: { ...exports.defaultVerticalWorkflowGraphConnections }
            }
        };
    }
}
function parseWorkflowGraphLayoutConfig(raw) {
    const horizontal = { ...exports.defaultHorizontalWorkflowGraphPositions };
    const vertical = { ...exports.defaultVerticalWorkflowGraphPositions };
    const connections = {
        horizontal: { ...exports.defaultHorizontalWorkflowGraphConnections },
        vertical: { ...exports.defaultVerticalWorkflowGraphConnections }
    };
    let currentMode = null;
    let currentSection = "positions";
    let currentPhaseId = null;
    let currentEdgeId = null;
    let pendingX = null;
    let pendingY = null;
    let pendingFromAnchor = null;
    let pendingToAnchor = null;
    const commitPending = () => {
        if (currentSection === "positions") {
            if (!currentMode || !currentPhaseId || pendingX === null || pendingY === null) {
                return;
            }
            const target = currentMode === "horizontal" ? horizontal : vertical;
            target[currentPhaseId] = { x: pendingX, y: pendingY };
            return;
        }
        if (!currentMode || !currentEdgeId || !isAnchorCode(pendingFromAnchor) || !isAnchorCode(pendingToAnchor)) {
            return;
        }
        const target = currentMode === "horizontal" ? connections.horizontal : connections.vertical;
        target[currentEdgeId] = { from: pendingFromAnchor, to: pendingToAnchor };
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
            currentSection = "positions";
            currentPhaseId = null;
            currentEdgeId = null;
            pendingX = null;
            pendingY = null;
            pendingFromAnchor = null;
            pendingToAnchor = null;
            continue;
        }
        if (trimmed === "connections:") {
            commitPending();
            currentSection = "connections";
            currentPhaseId = null;
            currentEdgeId = null;
            pendingX = null;
            pendingY = null;
            pendingFromAnchor = null;
            pendingToAnchor = null;
            continue;
        }
        const phaseMatch = /^([a-z0-9-]+):\s*$/.exec(trimmed);
        if (phaseMatch && currentMode && currentSection === "positions" && workflowGraphPhaseIds.includes(phaseMatch[1])) {
            commitPending();
            currentPhaseId = phaseMatch[1];
            currentEdgeId = null;
            pendingX = null;
            pendingY = null;
            pendingFromAnchor = null;
            pendingToAnchor = null;
            continue;
        }
        const edgeMatch = /^([a-z0-9-]+->[a-z0-9-]+):\s*$/.exec(trimmed);
        if (edgeMatch && currentMode && currentSection === "connections") {
            commitPending();
            currentEdgeId = edgeMatch[1];
            currentPhaseId = null;
            pendingX = null;
            pendingY = null;
            pendingFromAnchor = null;
            pendingToAnchor = null;
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
        const fromMatch = /^from:\s*([TLRB][1-5])\s*$/.exec(trimmed);
        if (fromMatch && currentEdgeId) {
            pendingFromAnchor = fromMatch[1];
            continue;
        }
        const toMatch = /^to:\s*([TLRB][1-5])\s*$/.exec(trimmed);
        if (toMatch && currentEdgeId) {
            pendingToAnchor = toMatch[1];
            continue;
        }
    }
    commitPending();
    return { horizontal, vertical, connections };
}
function serializeWorkflowGraphLayoutConfig(config) {
    const serializeMode = (mode) => {
        const positions = mode === "horizontal" ? config.horizontal : config.vertical;
        const edges = mode === "horizontal" ? config.connections.horizontal : config.connections.vertical;
        const lines = [`${mode}:`];
        for (const phaseId of workflowGraphPhaseIds) {
            const position = positions[phaseId];
            lines.push(`  ${phaseId}:`);
            lines.push(`    x: ${Math.round(position.x)}`);
            lines.push(`    y: ${Math.round(position.y)}`);
        }
        lines.push("  connections:");
        for (const edgeId of Object.keys(edges)) {
            lines.push(`    ${edgeId}:`);
            lines.push(`      from: ${edges[edgeId].from}`);
            lines.push(`      to: ${edges[edgeId].to}`);
        }
        return lines.join("\n");
    };
    return [
        "# SpecForge workflow graph layout",
        "# Edit x/y coordinates to reposition cards in the workflow graph.",
        "# Card dimensions used by the renderer: desktop 240x118, mobile 206x118.",
        "# Connection anchors use T1..T5, R1..R5, B1..B5, L1..L5.",
        serializeMode("horizontal"),
        "",
        serializeMode("vertical"),
        ""
    ].join("\n");
}
function isAnchorCode(value) {
    return Boolean(value && /^[TLRB][1-5]$/.test(value));
}
//# sourceMappingURL=workflowGraphLayout.js.map