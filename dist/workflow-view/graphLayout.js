"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.workflowGraphNodeHeight = void 0;
exports.buildGraphLegendPosition = buildGraphLegendPosition;
exports.buildHorizontalPhaseLayout = buildHorizontalPhaseLayout;
exports.buildVerticalPhaseLayout = buildVerticalPhaseLayout;
exports.graphPath = graphPath;
const workflowGraphLayout_1 = require("../workflowGraphLayout");
exports.workflowGraphNodeHeight = 102;
function buildGraphLegendPosition(x, y, compact = false) {
    const scale = compact ? 0.72 : 1;
    return {
        left: Math.round(x * scale),
        top: Math.round(y * scale)
    };
}
function buildHorizontalPhaseLayout(phases, nodeWidth, compact = false, sourcePositions = workflowGraphLayout_1.defaultHorizontalWorkflowGraphPositions) {
    const positions = {};
    const scale = compact ? 0.72 : 1;
    for (const phase of phases) {
        const source = sourcePositions[phase.phaseId];
        positions[phase.phaseId] = source
            ? { left: Math.round(source.x * scale), top: Math.round(source.y * scale) }
            : { left: Math.round(150 * scale), top: Math.round(120 * scale) };
    }
    return {
        positions,
        width: computeGraphWidth(positions, nodeWidth, compact ? 92 : 186),
        height: computeGraphHeight(positions, exports.workflowGraphNodeHeight, compact ? 98 : 162)
    };
}
function buildVerticalPhaseLayout(phases, nodeWidth, compact = false, sourcePositions = workflowGraphLayout_1.defaultVerticalWorkflowGraphPositions) {
    const positions = {};
    const scale = compact ? 0.72 : 1;
    for (const phase of phases) {
        const source = sourcePositions[phase.phaseId];
        positions[phase.phaseId] = source
            ? { left: Math.round(source.x * scale), top: Math.round(source.y * scale) }
            : { left: Math.round(72 * scale), top: Math.round(36 * scale) };
    }
    return {
        positions,
        width: computeGraphWidth(positions, nodeWidth, compact ? 84 : 152),
        height: computeGraphHeight(positions, exports.workflowGraphNodeHeight, compact ? 128 : 178)
    };
}
function graphPath(fromPhaseId, toPhaseId, positions, nodeWidth, graphLayoutMode, edgeConnection) {
    const fromPosition = positions[fromPhaseId];
    const toPosition = positions[toPhaseId];
    if (!fromPosition || !toPosition) {
        return "";
    }
    if (graphLayoutMode === "horizontal") {
        return buildHorizontalGraphPath(fromPosition, toPosition, nodeWidth, edgeConnection);
    }
    const resolvedAnchors = resolveAnchors(fromPosition, toPosition, edgeConnection);
    const from = getAnchorPointFromCodeOrAnchor(fromPosition, resolvedAnchors.fromAnchor, nodeWidth, true);
    const to = getAnchorPointFromCodeOrAnchor(toPosition, resolvedAnchors.toAnchor, nodeWidth, false);
    const fromAnchor = toGraphAnchor(resolvedAnchors.fromAnchor, true);
    const toAnchor = toGraphAnchor(resolvedAnchors.toAnchor, false);
    const sameColumn = fromPosition.left === toPosition.left;
    if (sameColumn) {
        return buildSameColumnGraphPath(fromPosition, toPosition, fromAnchor, toAnchor, from, to, nodeWidth);
    }
    return buildCrossColumnGraphPath(fromPosition, toPosition, fromAnchor, toAnchor, from, to, nodeWidth);
}
function computeGraphHeight(positions, nodeHeight, bottomPadding) {
    const maxTop = Math.max(...Object.values(positions).map((position) => position.top));
    return maxTop + nodeHeight + bottomPadding;
}
function computeGraphWidth(positions, nodeWidth, rightPadding) {
    const maxLeft = Math.max(...Object.values(positions).map((position) => position.left));
    return maxLeft + nodeWidth + rightPadding;
}
function buildHorizontalGraphPath(fromPosition, toPosition, nodeWidth, edgeConnection) {
    const from = getAnchorPointFromCodeOrAnchor(fromPosition, edgeConnection?.from ?? (toPosition.left >= fromPosition.left ? "R3" : "L3"), nodeWidth, true);
    const to = getAnchorPointFromCodeOrAnchor(toPosition, edgeConnection?.to ?? (toPosition.left >= fromPosition.left ? "L3" : "R3"), nodeWidth, false);
    const deltaX = to.x - from.x;
    const deltaY = to.y - from.y;
    const movingRight = deltaX >= 0;
    const sameRow = Math.abs(deltaY) <= Math.max(24, exports.workflowGraphNodeHeight * 0.16);
    const sameColumn = Math.abs(deltaX) <= Math.max(24, nodeWidth * 0.08);
    if (sameRow) {
        const spread = Math.max(88, Math.abs(to.x - from.x) * 0.32);
        const sign = movingRight ? 1 : -1;
        return `M ${from.x} ${from.y} C ${from.x + spread * sign} ${from.y}, ${to.x - spread * sign} ${to.y}, ${to.x} ${to.y}`;
    }
    if (sameColumn) {
        const movingDown = deltaY >= 0;
        const spread = Math.max(88, Math.abs(to.y - from.y) * 0.32);
        const sign = movingDown ? 1 : -1;
        return `M ${from.x} ${from.y} C ${from.x} ${from.y + spread * sign}, ${to.x} ${to.y - spread * sign}, ${to.x} ${to.y}`;
    }
    const midX = from.x + (to.x - from.x) * 0.5;
    const bendY = from.y + (to.y - from.y) * 0.5;
    return `M ${from.x} ${from.y} C ${midX} ${from.y}, ${midX} ${bendY}, ${midX} ${bendY} S ${midX} ${to.y}, ${to.x} ${to.y}`;
}
function buildSameColumnGraphPath(fromPosition, toPosition, fromAnchor, toAnchor, from, to, nodeWidth) {
    const verticalGap = Math.abs(to.y - from.y);
    const laneOffset = Math.max(42, nodeWidth * 0.18);
    const exitPull = projectAwayFromNode(fromPosition, fromAnchor, from, laneOffset);
    const entryPull = projectAwayFromNode(toPosition, toAnchor, to, laneOffset);
    if (to.y > from.y) {
        const verticalSpread = Math.max(48, verticalGap * 0.3);
        return `M ${from.x} ${from.y} C ${from.x} ${from.y + verticalSpread}, ${to.x} ${to.y - verticalSpread}, ${to.x} ${to.y}`;
    }
    const laneX = fromAnchor === "exit-left" || toAnchor === "entry-left"
        ? fromPosition.left - laneOffset
        : fromPosition.left + nodeWidth + laneOffset;
    const verticalSpread = Math.max(44, verticalGap * 0.3);
    return `M ${from.x} ${from.y} C ${exitPull.x} ${from.y}, ${laneX} ${from.y - verticalSpread * 0.12}, ${laneX} ${from.y - verticalSpread} S ${laneX} ${to.y + verticalSpread}, ${entryPull.x} ${to.y} S ${to.x} ${to.y}, ${to.x} ${to.y}`;
}
function buildCrossColumnGraphPath(fromPosition, toPosition, fromAnchor, toAnchor, from, to, nodeWidth) {
    if (to.y > from.y && isDownwardFlowAnchor(fromAnchor) && isTopEntryAnchor(toAnchor)) {
        return buildDownwardCrossColumnGraphPath(fromPosition, toPosition, from, to, nodeWidth);
    }
    const channelOffset = Math.max(38, nodeWidth * 0.18);
    const exitPull = projectAwayFromNode(fromPosition, fromAnchor, from, channelOffset);
    const entryPull = projectAwayFromNode(toPosition, toAnchor, to, channelOffset);
    const deltaX = to.x - from.x;
    const deltaY = to.y - from.y;
    const horizontalSpread = Math.max(62, Math.abs(deltaX) * 0.28);
    const verticalBias = Math.max(30, Math.abs(deltaY) * 0.22);
    const exitX = from.x + Math.sign(deltaX || 1) * horizontalSpread;
    const entryX = to.x - Math.sign(deltaX || 1) * Math.max(46, Math.abs(deltaX) * 0.22);
    const crestY = deltaY >= 0
        ? Math.min(from.y, to.y) + verticalBias
        : Math.max(from.y, to.y) - verticalBias;
    return `M ${from.x} ${from.y} C ${exitPull.x} ${from.y}, ${exitX} ${crestY}, ${from.x + deltaX * 0.52} ${from.y + deltaY * 0.52} S ${entryX} ${to.y}, ${to.x} ${to.y}`;
}
function buildDownwardCrossColumnGraphPath(_fromPosition, _toPosition, from, to, nodeWidth) {
    const deltaX = to.x - from.x;
    const deltaY = to.y - from.y;
    const verticalExit = Math.max(42, Math.min(92, deltaY * 0.28));
    const verticalEntry = Math.max(42, Math.min(88, deltaY * 0.26));
    const midY = from.y + deltaY * 0.54;
    const horizontalDrift = Math.max(36, Math.min(nodeWidth * 0.34, Math.abs(deltaX) * 0.42));
    const controlFromX = from.x + Math.sign(deltaX || 1) * horizontalDrift;
    const controlToX = to.x - Math.sign(deltaX || 1) * horizontalDrift;
    return `M ${from.x} ${from.y} C ${from.x} ${from.y + verticalExit}, ${controlFromX} ${midY - verticalExit * 0.22}, ${from.x + deltaX * 0.5} ${midY} S ${controlToX} ${to.y - verticalEntry}, ${to.x} ${to.y}`;
}
function resolveAnchors(from, to, edgeConnection) {
    if (edgeConnection?.from && edgeConnection?.to) {
        return {
            fromAnchor: edgeConnection.from,
            toAnchor: edgeConnection.to
        };
    }
    const deltaX = to.left - from.left;
    const deltaY = to.top - from.top;
    if (deltaY > 0) {
        if (Math.abs(deltaX) <= 28) {
            return { fromAnchor: "exit-bottom-mid", toAnchor: "entry-top" };
        }
        if (deltaX > 0) {
            return { fromAnchor: "exit-bottom-right", toAnchor: "entry-top-left" };
        }
        return { fromAnchor: "exit-bottom-left", toAnchor: "entry-top-right" };
    }
    if (deltaX === 0) {
        return { fromAnchor: "exit-right", toAnchor: "entry-right" };
    }
    if (deltaX > 0) {
        return { fromAnchor: "exit-right", toAnchor: "entry-left" };
    }
    return { fromAnchor: "exit-left", toAnchor: "entry-right" };
}
function getAnchorPointFromCodeOrAnchor(position, anchor, nodeWidth, isExit) {
    return isAnchorCode(anchor)
        ? getAnchorPointFromCode(position, anchor, nodeWidth)
        : getAnchorPoint(position, anchor, nodeWidth);
}
function getAnchorPointFromCode(position, anchorCode, nodeWidth) {
    const face = anchorCode[0];
    const slot = Number.parseInt(anchorCode[1], 10);
    const fraction = slot / 6;
    switch (face) {
        case "T":
            return { x: position.left + nodeWidth * fraction, y: position.top };
        case "R":
            return { x: position.left + nodeWidth, y: position.top + exports.workflowGraphNodeHeight * fraction };
        case "B":
            return { x: position.left + nodeWidth * fraction, y: position.top + exports.workflowGraphNodeHeight };
        case "L":
            return { x: position.left, y: position.top + exports.workflowGraphNodeHeight * fraction };
        default:
            return { x: position.left + nodeWidth * 0.5, y: position.top + exports.workflowGraphNodeHeight * 0.5 };
    }
}
function toGraphAnchor(anchor, isExit) {
    if (!isAnchorCode(anchor)) {
        return anchor;
    }
    switch (anchor[0]) {
        case "T":
            return "entry-top";
        case "R":
            return isExit ? "exit-right" : "entry-right";
        case "B":
            return "exit-bottom-mid";
        case "L":
            return isExit ? "exit-left" : "entry-left";
        default:
            return isExit ? "exit-right" : "entry-left";
    }
}
function isAnchorCode(anchor) {
    return /^[TLRB][1-5]$/.test(anchor);
}
function getAnchorPoint(position, anchor, nodeWidth) {
    switch (anchor) {
        case "entry-top":
            return { x: position.left + nodeWidth * 0.5, y: position.top };
        case "entry-top-left":
            return { x: position.left + nodeWidth * 0.26, y: position.top };
        case "entry-top-right":
            return { x: position.left + nodeWidth * 0.74, y: position.top };
        case "entry-left":
            return { x: position.left, y: position.top + exports.workflowGraphNodeHeight * 0.36 };
        case "entry-center-left":
            return { x: position.left, y: position.top + exports.workflowGraphNodeHeight * 0.5 };
        case "entry-right":
            return { x: position.left + nodeWidth, y: position.top + exports.workflowGraphNodeHeight * 0.34 };
        case "entry-center-right":
            return { x: position.left + nodeWidth, y: position.top + exports.workflowGraphNodeHeight * 0.5 };
        case "exit-right":
            return { x: position.left + nodeWidth, y: position.top + exports.workflowGraphNodeHeight * 0.78 };
        case "exit-center-right":
            return { x: position.left + nodeWidth, y: position.top + exports.workflowGraphNodeHeight * 0.5 };
        case "exit-left":
            return { x: position.left, y: position.top + exports.workflowGraphNodeHeight * 0.78 };
        case "exit-center-left":
            return { x: position.left, y: position.top + exports.workflowGraphNodeHeight * 0.5 };
        case "exit-bottom-left":
            return { x: position.left + nodeWidth * 0.1, y: position.top + exports.workflowGraphNodeHeight * 0.96 };
        case "exit-bottom-mid":
            return { x: position.left + nodeWidth * 0.62, y: position.top + exports.workflowGraphNodeHeight };
        case "exit-bottom-right":
            return { x: position.left + nodeWidth * 0.9, y: position.top + exports.workflowGraphNodeHeight * 0.96 };
    }
}
function projectAwayFromNode(position, anchor, point, offset) {
    switch (anchor) {
        case "entry-top":
        case "entry-top-left":
        case "entry-top-right":
            return { x: point.x, y: position.top - offset };
        case "entry-left":
        case "entry-center-left":
            return { x: position.left - offset, y: point.y };
        case "entry-right":
        case "entry-center-right":
            return { x: point.x + offset, y: point.y };
        case "exit-right":
        case "exit-center-right":
            return { x: point.x + offset, y: point.y };
        case "exit-left":
        case "exit-center-left":
            return { x: position.left - offset, y: point.y };
        case "exit-bottom-left":
        case "exit-bottom-mid":
        case "exit-bottom-right":
            return { x: point.x, y: position.top + exports.workflowGraphNodeHeight + offset };
    }
}
function isDownwardFlowAnchor(anchor) {
    return anchor === "exit-bottom-left" || anchor === "exit-bottom-mid" || anchor === "exit-bottom-right";
}
function isTopEntryAnchor(anchor) {
    return anchor === "entry-top" || anchor === "entry-top-left" || anchor === "entry-top-right";
}
//# sourceMappingURL=graphLayout.js.map