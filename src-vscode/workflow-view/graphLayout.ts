import {
  defaultHorizontalWorkflowGraphPositions,
  defaultVerticalWorkflowGraphPositions,
  type WorkflowGraphEdgeConnection,
  type WorkflowGraphPhasePosition
} from "../workflowGraphLayout";
import type { WorkflowPhaseDetails } from "../backendClient";

export type PhasePosition = { left: number; top: number };
export type GraphLegendPosition = { left: number; top: number };
export type LayoutPhaseDescriptor = Pick<WorkflowPhaseDetails, "phaseId" | "expectsHumanIntervention">;
export type PhaseGraphLayout = {
  readonly positions: Record<string, PhasePosition>;
  readonly width: number;
  readonly height: number;
};

type GraphAnchor =
  | "entry-top"
  | "entry-top-left"
  | "entry-top-right"
  | "entry-left"
  | "entry-center-right"
  | "entry-right"
  | "entry-center-left"
  | "exit-right"
  | "exit-center-right"
  | "exit-left"
  | "exit-center-left"
  | "exit-bottom-left"
  | "exit-bottom-mid"
  | "exit-bottom-right";

export const workflowGraphNodeHeight = 102;

export function buildGraphLegendPosition(x: number, y: number, compact = false): GraphLegendPosition {
  const scale = compact ? 0.72 : 1;

  return {
    left: Math.round(x * scale),
    top: Math.round(y * scale)
  };
}

export function buildHorizontalPhaseLayout(
  phases: readonly LayoutPhaseDescriptor[],
  nodeWidth: number,
  compact = false,
  sourcePositions: Record<string, WorkflowGraphPhasePosition> = defaultHorizontalWorkflowGraphPositions
): PhaseGraphLayout {
  const positions: Record<string, PhasePosition> = {};
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
    height: computeGraphHeight(positions, workflowGraphNodeHeight, compact ? 98 : 162)
  };
}

export function buildVerticalPhaseLayout(
  phases: readonly LayoutPhaseDescriptor[],
  nodeWidth: number,
  compact = false,
  sourcePositions: Record<string, WorkflowGraphPhasePosition> = defaultVerticalWorkflowGraphPositions
): PhaseGraphLayout {
  const positions: Record<string, PhasePosition> = {};
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
    height: computeGraphHeight(positions, workflowGraphNodeHeight, compact ? 128 : 178)
  };
}

export function graphPath(
  fromPhaseId: string,
  toPhaseId: string,
  positions: Record<string, PhasePosition>,
  nodeWidth: number,
  graphLayoutMode: "horizontal" | "vertical",
  edgeConnection?: WorkflowGraphEdgeConnection
): string {
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

function computeGraphHeight(positions: Record<string, PhasePosition>, nodeHeight: number, bottomPadding: number): number {
  const maxTop = Math.max(...Object.values(positions).map((position) => position.top));

  return maxTop + nodeHeight + bottomPadding;
}

function computeGraphWidth(positions: Record<string, PhasePosition>, nodeWidth: number, rightPadding: number): number {
  const maxLeft = Math.max(...Object.values(positions).map((position) => position.left));

  return maxLeft + nodeWidth + rightPadding;
}

function buildHorizontalGraphPath(
  fromPosition: PhasePosition,
  toPosition: PhasePosition,
  nodeWidth: number,
  edgeConnection?: WorkflowGraphEdgeConnection
): string {
  const from = getAnchorPointFromCodeOrAnchor(
    fromPosition,
    edgeConnection?.from ?? (toPosition.left >= fromPosition.left ? "R3" : "L3"),
    nodeWidth,
    true
  );
  const to = getAnchorPointFromCodeOrAnchor(
    toPosition,
    edgeConnection?.to ?? (toPosition.left >= fromPosition.left ? "L3" : "R3"),
    nodeWidth,
    false
  );
  const deltaX = to.x - from.x;
  const deltaY = to.y - from.y;
  const movingRight = deltaX >= 0;
  const sameRow = Math.abs(deltaY) <= Math.max(24, workflowGraphNodeHeight * 0.16);
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

function buildSameColumnGraphPath(
  fromPosition: PhasePosition,
  toPosition: PhasePosition,
  fromAnchor: GraphAnchor,
  toAnchor: GraphAnchor,
  from: { x: number; y: number },
  to: { x: number; y: number },
  nodeWidth: number
): string {
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

function buildCrossColumnGraphPath(
  fromPosition: PhasePosition,
  toPosition: PhasePosition,
  fromAnchor: GraphAnchor,
  toAnchor: GraphAnchor,
  from: { x: number; y: number },
  to: { x: number; y: number },
  nodeWidth: number
): string {
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

function buildDownwardCrossColumnGraphPath(
  _fromPosition: PhasePosition,
  _toPosition: PhasePosition,
  from: { x: number; y: number },
  to: { x: number; y: number },
  nodeWidth: number
): string {
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

function resolveAnchors(
  from: PhasePosition,
  to: PhasePosition,
  edgeConnection?: WorkflowGraphEdgeConnection
): { fromAnchor: string; toAnchor: string } {
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

function getAnchorPointFromCodeOrAnchor(
  position: PhasePosition,
  anchor: string,
  nodeWidth: number,
  isExit: boolean
): { x: number; y: number } {
  return isAnchorCode(anchor)
    ? getAnchorPointFromCode(position, anchor, nodeWidth)
    : getAnchorPoint(position, anchor as GraphAnchor, nodeWidth);
}

function getAnchorPointFromCode(
  position: PhasePosition,
  anchorCode: string,
  nodeWidth: number
): { x: number; y: number } {
  const face = anchorCode[0];
  const slot = Number.parseInt(anchorCode[1], 10);
  const fraction = slot / 6;

  switch (face) {
    case "T":
      return { x: position.left + nodeWidth * fraction, y: position.top };
    case "R":
      return { x: position.left + nodeWidth, y: position.top + workflowGraphNodeHeight * fraction };
    case "B":
      return { x: position.left + nodeWidth * fraction, y: position.top + workflowGraphNodeHeight };
    case "L":
      return { x: position.left, y: position.top + workflowGraphNodeHeight * fraction };
    default:
      return { x: position.left + nodeWidth * 0.5, y: position.top + workflowGraphNodeHeight * 0.5 };
  }
}

function toGraphAnchor(anchor: string, isExit: boolean): GraphAnchor {
  if (!isAnchorCode(anchor)) {
    return anchor as GraphAnchor;
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

function isAnchorCode(anchor: string): boolean {
  return /^[TLRB][1-5]$/.test(anchor);
}

function getAnchorPoint(position: PhasePosition, anchor: GraphAnchor, nodeWidth: number): { x: number; y: number } {
  switch (anchor) {
    case "entry-top":
      return { x: position.left + nodeWidth * 0.5, y: position.top };
    case "entry-top-left":
      return { x: position.left + nodeWidth * 0.26, y: position.top };
    case "entry-top-right":
      return { x: position.left + nodeWidth * 0.74, y: position.top };
    case "entry-left":
      return { x: position.left, y: position.top + workflowGraphNodeHeight * 0.36 };
    case "entry-center-left":
      return { x: position.left, y: position.top + workflowGraphNodeHeight * 0.5 };
    case "entry-right":
      return { x: position.left + nodeWidth, y: position.top + workflowGraphNodeHeight * 0.34 };
    case "entry-center-right":
      return { x: position.left + nodeWidth, y: position.top + workflowGraphNodeHeight * 0.5 };
    case "exit-right":
      return { x: position.left + nodeWidth, y: position.top + workflowGraphNodeHeight * 0.78 };
    case "exit-center-right":
      return { x: position.left + nodeWidth, y: position.top + workflowGraphNodeHeight * 0.5 };
    case "exit-left":
      return { x: position.left, y: position.top + workflowGraphNodeHeight * 0.78 };
    case "exit-center-left":
      return { x: position.left, y: position.top + workflowGraphNodeHeight * 0.5 };
    case "exit-bottom-left":
      return { x: position.left + nodeWidth * 0.1, y: position.top + workflowGraphNodeHeight * 0.96 };
    case "exit-bottom-mid":
      return { x: position.left + nodeWidth * 0.62, y: position.top + workflowGraphNodeHeight };
    case "exit-bottom-right":
      return { x: position.left + nodeWidth * 0.9, y: position.top + workflowGraphNodeHeight * 0.96 };
  }
}

function projectAwayFromNode(
  position: PhasePosition,
  anchor: GraphAnchor,
  point: { x: number; y: number },
  offset: number
): { x: number; y: number } {
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
      return { x: point.x, y: position.top + workflowGraphNodeHeight + offset };
  }
}

function isDownwardFlowAnchor(anchor: GraphAnchor): boolean {
  return anchor === "exit-bottom-left" || anchor === "exit-bottom-mid" || anchor === "exit-bottom-right";
}

function isTopEntryAnchor(anchor: GraphAnchor): boolean {
  return anchor === "entry-top" || anchor === "entry-top-left" || anchor === "entry-top-right";
}
