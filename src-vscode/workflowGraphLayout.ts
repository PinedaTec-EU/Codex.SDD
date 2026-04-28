import * as fs from "node:fs";
import * as path from "node:path";
import { appendSpecForgeDebugLog, appendSpecForgeLog } from "./outputChannel";

export type WorkflowGraphLayoutMode = "horizontal" | "vertical";
export type WorkflowGraphPhaseId =
  | "capture"
  | "refinement"
  | "spec"
  | "technical-design"
  | "implementation"
  | "review"
  | "release-approval"
  | "pr-preparation"
  | "completed";

export interface WorkflowGraphPhasePosition {
  readonly x: number;
  readonly y: number;
}

export interface WorkflowGraphEdgeConnection {
  readonly from: string;
  readonly to: string;
}

export type WorkflowGraphLoopSide = "top" | "right" | "bottom" | "left";

export interface WorkflowGraphLoopDefinition {
  readonly fromPhaseId: WorkflowGraphPhaseId;
  readonly toPhaseId: WorkflowGraphPhaseId;
  readonly side: WorkflowGraphLoopSide;
}

export interface WorkflowGraphLayoutConfig {
  readonly horizontal: Record<string, WorkflowGraphPhasePosition>;
  readonly vertical: Record<string, WorkflowGraphPhasePosition>;
  readonly connections: {
    readonly horizontal: Record<string, WorkflowGraphEdgeConnection>;
    readonly vertical: Record<string, WorkflowGraphEdgeConnection>;
  };
  readonly loops: {
    readonly horizontal: Record<string, WorkflowGraphLoopDefinition>;
    readonly vertical: Record<string, WorkflowGraphLoopDefinition>;
  };
}

const workflowGraphPhaseIds: readonly WorkflowGraphPhaseId[] = [
  "capture",
  "refinement",
  "spec",
  "technical-design",
  "implementation",
  "review",
  "release-approval",
  "pr-preparation",
  "completed"
] as const;

// Keep this comment aligned with workflowView.ts card constants.
// Card dimensions used by the renderer: desktop 240x118, mobile 206x118.
export const defaultHorizontalWorkflowGraphPositions: Record<string, WorkflowGraphPhasePosition> = {
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

export const defaultVerticalWorkflowGraphPositions: Record<string, WorkflowGraphPhasePosition> = {
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

export const defaultHorizontalWorkflowGraphConnections: Record<string, WorkflowGraphEdgeConnection> = {
  "capture->refinement": { from: "R3", to: "L3" },
  "refinement->spec": { from: "R3", to: "L3" },
  "spec->technical-design": { from: "B3", to: "T3" },
  "technical-design->implementation": { from: "L3", to: "R3" },
  "implementation->review": { from: "L3", to: "R3" },
  "review->release-approval": { from: "B3", to: "T3" },
  "release-approval->pr-preparation": { from: "R3", to: "L3" },
  "pr-preparation->completed": { from: "R3", to: "L3" }
};

export const defaultVerticalWorkflowGraphConnections: Record<string, WorkflowGraphEdgeConnection> = {
  "capture->refinement": { from: "R4", to: "T2" },
  "refinement->spec": { from: "B2", to: "T4" },
  "spec->technical-design": { from: "L4", to: "T3" },
  "technical-design->implementation": { from: "R4", to: "L3" },
  "implementation->review": { from: "B3", to: "T3" },
  "review->release-approval": { from: "R3", to: "T2" },
  "release-approval->pr-preparation": { from: "B2", to: "R3" },
  "pr-preparation->completed": { from: "R3", to: "L3" }
};

export const defaultHorizontalWorkflowGraphLoops: Record<string, WorkflowGraphLoopDefinition> = {
  "implementation-review": { fromPhaseId: "implementation", toPhaseId: "review", side: "right" }
};

export const defaultVerticalWorkflowGraphLoops: Record<string, WorkflowGraphLoopDefinition> = {
  "implementation-review": { fromPhaseId: "implementation", toPhaseId: "review", side: "right" }
};

export function getWorkflowGraphLayoutPath(workspaceRoot: string): string {
  return path.join(workspaceRoot, ".specs", "workflow-graph-layout.yaml");
}

export async function ensureWorkflowGraphLayoutConfigExistsAsync(workspaceRoot: string): Promise<void> {
  const filePath = getWorkflowGraphLayoutPath(workspaceRoot);
  try {
    await fs.promises.access(filePath, fs.constants.F_OK);
    appendSpecForgeDebugLog(`Workflow graph layout already exists at '${filePath}'.`);
    return;
  } catch {
    // Create below.
  }

  await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
  await fs.promises.writeFile(filePath, serializeWorkflowGraphLayoutConfig({
    horizontal: defaultHorizontalWorkflowGraphPositions,
    vertical: defaultVerticalWorkflowGraphPositions,
    connections: {
      horizontal: defaultHorizontalWorkflowGraphConnections,
      vertical: defaultVerticalWorkflowGraphConnections
    },
    loops: {
      horizontal: defaultHorizontalWorkflowGraphLoops,
      vertical: defaultVerticalWorkflowGraphLoops
    }
  }), "utf8");
  appendSpecForgeLog(`Created workflow graph layout bootstrap at '${filePath}'.`);
}

export async function readWorkflowGraphLayoutConfigAsync(workspaceRoot: string): Promise<WorkflowGraphLayoutConfig> {
  await ensureWorkflowGraphLayoutConfigExistsAsync(workspaceRoot);
  const filePath = getWorkflowGraphLayoutPath(workspaceRoot);

  try {
    const raw = await fs.promises.readFile(filePath, "utf8");
    return parseWorkflowGraphLayoutConfig(raw);
  } catch (error) {
    appendSpecForgeLog(
      `Workflow graph layout read failed for '${filePath}'. Falling back to defaults. ${error instanceof Error ? error.message : String(error)}`
    );
    return {
      horizontal: { ...defaultHorizontalWorkflowGraphPositions },
      vertical: { ...defaultVerticalWorkflowGraphPositions },
      connections: {
        horizontal: { ...defaultHorizontalWorkflowGraphConnections },
        vertical: { ...defaultVerticalWorkflowGraphConnections }
      },
      loops: {
        horizontal: { ...defaultHorizontalWorkflowGraphLoops },
        vertical: { ...defaultVerticalWorkflowGraphLoops }
      }
    };
  }
}

function parseWorkflowGraphLayoutConfig(raw: string): WorkflowGraphLayoutConfig {
  const horizontal = { ...defaultHorizontalWorkflowGraphPositions };
  const vertical = { ...defaultVerticalWorkflowGraphPositions };
  const connections = {
    horizontal: { ...defaultHorizontalWorkflowGraphConnections },
    vertical: { ...defaultVerticalWorkflowGraphConnections }
  };
  const loops = {
    horizontal: { ...defaultHorizontalWorkflowGraphLoops },
    vertical: { ...defaultVerticalWorkflowGraphLoops }
  };
  let currentMode: WorkflowGraphLayoutMode | null = null;
  let currentSection: "positions" | "connections" | "loops" = "positions";
  let currentPhaseId: WorkflowGraphPhaseId | null = null;
  let currentEdgeId: string | null = null;
  let currentLoopId: string | null = null;
  let pendingX: number | null = null;
  let pendingY: number | null = null;
  let pendingFromAnchor: string | null = null;
  let pendingToAnchor: string | null = null;
  let pendingLoopFromPhaseId: WorkflowGraphPhaseId | null = null;
  let pendingLoopToPhaseId: WorkflowGraphPhaseId | null = null;
  let pendingLoopSide: WorkflowGraphLoopSide | null = null;

  const commitPending = (): void => {
    if (currentSection === "positions") {
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
      currentMode = modeMatch[1] as WorkflowGraphLayoutMode;
      currentSection = "positions";
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

    if (trimmed === "connections:") {
      commitPending();
      currentSection = "connections";
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

    if (trimmed === "loops:") {
      commitPending();
      currentSection = "loops";
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

    const phaseMatch = /^([a-z0-9-]+):\s*$/.exec(trimmed);
    if (phaseMatch && currentMode && currentSection === "positions" && workflowGraphPhaseIds.includes(phaseMatch[1] as WorkflowGraphPhaseId)) {
      commitPending();
      currentPhaseId = phaseMatch[1] as WorkflowGraphPhaseId;
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

    const edgeMatch = /^([a-z0-9-]+->[a-z0-9-]+):\s*$/.exec(trimmed);
    if (edgeMatch && currentMode && currentSection === "connections") {
      commitPending();
      currentEdgeId = edgeMatch[1];
      currentPhaseId = null;
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

    const loopMatch = /^([a-z0-9-]+):\s*$/.exec(trimmed);
    if (loopMatch && currentMode && currentSection === "loops") {
      commitPending();
      currentLoopId = loopMatch[1];
      currentPhaseId = null;
      currentEdgeId = null;
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
      pendingLoopSide = sideMatch[1] as WorkflowGraphLoopSide;
      continue;
    }
  }

  commitPending();
  return { horizontal, vertical, connections, loops };
}

function serializeWorkflowGraphLayoutConfig(config: WorkflowGraphLayoutConfig): string {
  const serializeMode = (mode: WorkflowGraphLayoutMode): string => {
    const positions = mode === "horizontal" ? config.horizontal : config.vertical;
    const edges = mode === "horizontal" ? config.connections.horizontal : config.connections.vertical;
    const modeLoops = mode === "horizontal" ? config.loops.horizontal : config.loops.vertical;
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

function isAnchorCode(value: string | null): value is string {
  return Boolean(value && /^[TLRB][1-5]$/.test(value));
}

function isWorkflowGraphPhaseId(value: string): value is WorkflowGraphPhaseId {
  return workflowGraphPhaseIds.includes(value as WorkflowGraphPhaseId);
}
