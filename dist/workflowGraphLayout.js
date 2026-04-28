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
exports.defaultVerticalWorkflowGraphLoops = exports.defaultHorizontalWorkflowGraphLoops = exports.defaultVerticalWorkflowGraphConnections = exports.defaultHorizontalWorkflowGraphConnections = exports.defaultWorkflowGraphLegendPositions = exports.defaultVerticalWorkflowGraphPositions = exports.defaultHorizontalWorkflowGraphPositions = void 0;
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
exports.defaultWorkflowGraphLegendPositions = {
    horizontal: { x: 28, y: 748 },
    vertical: { x: 28, y: 1402 }
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
exports.defaultHorizontalWorkflowGraphLoops = {
    "implementation-review": { fromPhaseId: "implementation", toPhaseId: "review", side: "right" }
};
exports.defaultVerticalWorkflowGraphLoops = {
    "implementation-review": { fromPhaseId: "implementation", toPhaseId: "review", side: "right" }
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
        legend: exports.defaultWorkflowGraphLegendPositions,
        connections: {
            horizontal: exports.defaultHorizontalWorkflowGraphConnections,
            vertical: exports.defaultVerticalWorkflowGraphConnections
        },
        loops: {
            horizontal: exports.defaultHorizontalWorkflowGraphLoops,
            vertical: exports.defaultVerticalWorkflowGraphLoops
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
            legend: {
                horizontal: { ...exports.defaultWorkflowGraphLegendPositions.horizontal },
                vertical: { ...exports.defaultWorkflowGraphLegendPositions.vertical }
            },
            connections: {
                horizontal: { ...exports.defaultHorizontalWorkflowGraphConnections },
                vertical: { ...exports.defaultVerticalWorkflowGraphConnections }
            },
            loops: {
                horizontal: { ...exports.defaultHorizontalWorkflowGraphLoops },
                vertical: { ...exports.defaultVerticalWorkflowGraphLoops }
            }
        };
    }
}
function parseWorkflowGraphLayoutConfig(raw) {
    const horizontal = { ...exports.defaultHorizontalWorkflowGraphPositions };
    const vertical = { ...exports.defaultVerticalWorkflowGraphPositions };
    const legend = {
        horizontal: { ...exports.defaultWorkflowGraphLegendPositions.horizontal },
        vertical: { ...exports.defaultWorkflowGraphLegendPositions.vertical }
    };
    const connections = {
        horizontal: { ...exports.defaultHorizontalWorkflowGraphConnections },
        vertical: { ...exports.defaultVerticalWorkflowGraphConnections }
    };
    const loops = {
        horizontal: { ...exports.defaultHorizontalWorkflowGraphLoops },
        vertical: { ...exports.defaultVerticalWorkflowGraphLoops }
    };
    let currentMode = null;
    let currentSection = "positions";
    let currentPhaseId = null;
    let currentEdgeId = null;
    let currentLoopId = null;
    let currentLegendTarget = null;
    let pendingX = null;
    let pendingY = null;
    let pendingFromAnchor = null;
    let pendingToAnchor = null;
    let pendingLoopFromPhaseId = null;
    let pendingLoopToPhaseId = null;
    let pendingLoopSide = null;
    const commitPending = () => {
        if (currentSection === "positions") {
            if (currentLegendTarget && pendingX !== null && pendingY !== null) {
                legend[currentLegendTarget] = { x: pendingX, y: pendingY };
                return;
            }
            if (!currentMode || !currentPhaseId || pendingX === null || pendingY === null) {
                return;
            }
            const target = currentMode === "horizontal" ? horizontal : vertical;
            target[currentPhaseId] = { x: pendingX, y: pendingY };
            return;
        }
        if (currentSection === "connections") {
            if (!currentMode || !currentEdgeId || !isAnchorCode(pendingFromAnchor) || !isAnchorCode(pendingToAnchor)) {
                return;
            }
            const target = currentMode === "horizontal" ? connections.horizontal : connections.vertical;
            target[currentEdgeId] = { from: pendingFromAnchor, to: pendingToAnchor };
            return;
        }
        if (!currentMode || !currentLoopId || !pendingLoopFromPhaseId || !pendingLoopToPhaseId || !pendingLoopSide) {
            return;
        }
        const target = currentMode === "horizontal" ? loops.horizontal : loops.vertical;
        target[currentLoopId] = {
            fromPhaseId: pendingLoopFromPhaseId,
            toPhaseId: pendingLoopToPhaseId,
            side: pendingLoopSide
        };
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
            currentLoopId = null;
            currentLegendTarget = null;
            pendingX = null;
            pendingY = null;
            pendingFromAnchor = null;
            pendingToAnchor = null;
            pendingLoopFromPhaseId = null;
            pendingLoopToPhaseId = null;
            pendingLoopSide = null;
            continue;
        }
        if (trimmed === "connections:") {
            commitPending();
            currentSection = "connections";
            currentPhaseId = null;
            currentEdgeId = null;
            currentLoopId = null;
            currentLegendTarget = null;
            pendingX = null;
            pendingY = null;
            pendingFromAnchor = null;
            pendingToAnchor = null;
            pendingLoopFromPhaseId = null;
            pendingLoopToPhaseId = null;
            pendingLoopSide = null;
            continue;
        }
        if (trimmed === "loops:") {
            commitPending();
            currentSection = "loops";
            currentPhaseId = null;
            currentEdgeId = null;
            currentLoopId = null;
            currentLegendTarget = null;
            pendingX = null;
            pendingY = null;
            pendingFromAnchor = null;
            pendingToAnchor = null;
            pendingLoopFromPhaseId = null;
            pendingLoopToPhaseId = null;
            pendingLoopSide = null;
            continue;
        }
        const phaseMatch = /^([a-z0-9-]+):\s*$/.exec(trimmed);
        if (phaseMatch && currentMode && currentSection === "positions" && workflowGraphPhaseIds.includes(phaseMatch[1])) {
            commitPending();
            currentPhaseId = phaseMatch[1];
            currentEdgeId = null;
            currentLoopId = null;
            currentLegendTarget = null;
            pendingX = null;
            pendingY = null;
            pendingFromAnchor = null;
            pendingToAnchor = null;
            pendingLoopFromPhaseId = null;
            pendingLoopToPhaseId = null;
            pendingLoopSide = null;
            continue;
        }
        const edgeMatch = /^([a-z0-9-]+->[a-z0-9-]+):\s*$/.exec(trimmed);
        if (edgeMatch && currentMode && currentSection === "connections") {
            commitPending();
            currentEdgeId = edgeMatch[1];
            currentPhaseId = null;
            currentLoopId = null;
            currentLegendTarget = null;
            pendingX = null;
            pendingY = null;
            pendingFromAnchor = null;
            pendingToAnchor = null;
            pendingLoopFromPhaseId = null;
            pendingLoopToPhaseId = null;
            pendingLoopSide = null;
            continue;
        }
        const loopMatch = /^([a-z0-9-]+):\s*$/.exec(trimmed);
        if (loopMatch && currentMode && currentSection === "loops") {
            commitPending();
            currentLoopId = loopMatch[1];
            currentPhaseId = null;
            currentEdgeId = null;
            currentLegendTarget = null;
            pendingX = null;
            pendingY = null;
            pendingFromAnchor = null;
            pendingToAnchor = null;
            pendingLoopFromPhaseId = null;
            pendingLoopToPhaseId = null;
            pendingLoopSide = null;
            continue;
        }
        if (trimmed === "legend:") {
            commitPending();
            currentLegendTarget = currentMode;
            currentPhaseId = null;
            currentEdgeId = null;
            currentLoopId = null;
            pendingX = null;
            pendingY = null;
            pendingFromAnchor = null;
            pendingToAnchor = null;
            pendingLoopFromPhaseId = null;
            pendingLoopToPhaseId = null;
            pendingLoopSide = null;
            continue;
        }
        const xMatch = /^x:\s*(-?\d+)\s*$/.exec(trimmed);
        if (xMatch && (currentPhaseId || currentLegendTarget)) {
            pendingX = Number.parseInt(xMatch[1], 10);
            continue;
        }
        const yMatch = /^y:\s*(-?\d+)\s*$/.exec(trimmed);
        if (yMatch && (currentPhaseId || currentLegendTarget)) {
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
        const fromPhaseMatch = /^fromPhaseId:\s*([a-z0-9-]+)\s*$/.exec(trimmed);
        if (fromPhaseMatch && currentLoopId && isWorkflowGraphPhaseId(fromPhaseMatch[1])) {
            pendingLoopFromPhaseId = fromPhaseMatch[1];
            continue;
        }
        const toPhaseMatch = /^toPhaseId:\s*([a-z0-9-]+)\s*$/.exec(trimmed);
        if (toPhaseMatch && currentLoopId && isWorkflowGraphPhaseId(toPhaseMatch[1])) {
            pendingLoopToPhaseId = toPhaseMatch[1];
            continue;
        }
        const sideMatch = /^side:\s*(top|right|bottom|left)\s*$/.exec(trimmed);
        if (sideMatch && currentLoopId) {
            pendingLoopSide = sideMatch[1];
            continue;
        }
    }
    commitPending();
    return { horizontal, vertical, legend, connections, loops };
}
function serializeWorkflowGraphLayoutConfig(config) {
    const serializeMode = (mode) => {
        const positions = mode === "horizontal" ? config.horizontal : config.vertical;
        const legendPosition = mode === "horizontal" ? config.legend.horizontal : config.legend.vertical;
        const edges = mode === "horizontal" ? config.connections.horizontal : config.connections.vertical;
        const modeLoops = mode === "horizontal" ? config.loops.horizontal : config.loops.vertical;
        const lines = [`${mode}:`];
        for (const phaseId of workflowGraphPhaseIds) {
            const position = positions[phaseId];
            lines.push(`  ${phaseId}:`);
            lines.push(`    x: ${Math.round(position.x)}`);
            lines.push(`    y: ${Math.round(position.y)}`);
        }
        lines.push("  legend:");
        lines.push(`    x: ${Math.round(legendPosition.x)}`);
        lines.push(`    y: ${Math.round(legendPosition.y)}`);
        lines.push("  connections:");
        for (const edgeId of Object.keys(edges)) {
            lines.push(`    ${edgeId}:`);
            lines.push(`      from: ${edges[edgeId].from}`);
            lines.push(`      to: ${edges[edgeId].to}`);
        }
        lines.push("  loops:");
        for (const loopId of Object.keys(modeLoops)) {
            lines.push(`    ${loopId}:`);
            lines.push(`      fromPhaseId: ${modeLoops[loopId].fromPhaseId}`);
            lines.push(`      toPhaseId: ${modeLoops[loopId].toPhaseId}`);
            lines.push(`      side: ${modeLoops[loopId].side}`);
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
function isWorkflowGraphPhaseId(value) {
    return workflowGraphPhaseIds.includes(value);
}
//# sourceMappingURL=workflowGraphLayout.js.map