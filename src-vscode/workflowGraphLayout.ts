import * as fs from "node:fs";
import * as path from "node:path";

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

export interface WorkflowGraphLegendPosition {
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
  readonly legend: {
    readonly horizontal: WorkflowGraphLegendPosition;
    readonly vertical: WorkflowGraphLegendPosition;
  };
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
  capture: { x: 80, y: 60 },
  refinement: { x: 380, y: 100 },
  spec: { x: 580, y: 280 },
  "technical-design": { x: 880, y: 320 },
  implementation: { x: 1080, y: 500 },
  review: { x: 1080, y: 680 },
  "release-approval": { x: 1280, y: 860 },
  "pr-preparation": { x: 1580, y: 900 },
  completed: { x: 1880, y: 1080 }
};

export const defaultVerticalWorkflowGraphPositions: Record<string, WorkflowGraphPhasePosition> = {
  capture: { x: 80, y: 60 },
  refinement: { x: 380, y: 100 },
  spec: { x: 430, y: 280 },
  "technical-design": { x: 430, y: 460 },
  implementation: { x: 80, y: 640 },
  review: { x: 80, y: 820 },
  "release-approval": { x: 230, y: 1000 },
  "pr-preparation": { x: 380, y: 1180 },
  completed: { x: 230, y: 1360 }
};

export const defaultWorkflowGraphLegendPositions: {
  readonly horizontal: WorkflowGraphLegendPosition;
  readonly vertical: WorkflowGraphLegendPosition;
} = {
  horizontal: { x: 20, y: 300 },
  vertical: { x: 20, y: 300 }
};

export const defaultHorizontalWorkflowGraphConnections: Record<string, WorkflowGraphEdgeConnection> = {
  "capture->refinement": { from: "R3", to: "L3" },
  "refinement->spec": { from: "B3", to: "L3" },
  "spec->technical-design": { from: "R3", to: "L3" },
  "technical-design->implementation": { from: "B3", to: "L3" },
  "implementation->review": { from: "B3", to: "T3" },
  "review->release-approval": { from: "B3", to: "L3" },
  "release-approval->pr-preparation": { from: "R3", to: "L3" },
  "pr-preparation->completed": { from: "B3", to: "L3" }
};

export const defaultVerticalWorkflowGraphConnections: Record<string, WorkflowGraphEdgeConnection> = {
  "capture->refinement": { from: "R3", to: "L3" },
  "refinement->spec": { from: "B3", to: "T3" },
  "spec->technical-design": { from: "B3", to: "T3" },
  "technical-design->implementation": { from: "B3", to: "R3" },
  "implementation->review": { from: "B3", to: "T3" },
  "review->release-approval": { from: "B3", to: "L3" },
  "release-approval->pr-preparation": { from: "B3", to: "L3" },
  "pr-preparation->completed": { from: "B3", to: "R3" }
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

function appendWorkflowGraphLayoutLog(message: string): void {
  const { appendSpecForgeLog } = require("./outputChannel") as typeof import("./outputChannel");
  appendSpecForgeLog(message);
}

function appendWorkflowGraphLayoutDebugLog(message: string): void {
  const { appendSpecForgeDebugLog } = require("./outputChannel") as typeof import("./outputChannel");
  appendSpecForgeDebugLog(message);
}

export async function ensureWorkflowGraphLayoutConfigExistsAsync(workspaceRoot: string): Promise<void> {
  const filePath = getWorkflowGraphLayoutPath(workspaceRoot);
  try {
    await fs.promises.access(filePath, fs.constants.F_OK);
    appendWorkflowGraphLayoutDebugLog(`Workflow graph layout already exists at '${filePath}'.`);
    return;
  } catch {
    // Create below.
  }

  await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
  await fs.promises.writeFile(filePath, serializeWorkflowGraphLayoutConfig({
    horizontal: defaultHorizontalWorkflowGraphPositions,
    vertical: defaultVerticalWorkflowGraphPositions,
    legend: defaultWorkflowGraphLegendPositions,
    connections: {
      horizontal: defaultHorizontalWorkflowGraphConnections,
      vertical: defaultVerticalWorkflowGraphConnections
    },
    loops: {
      horizontal: defaultHorizontalWorkflowGraphLoops,
      vertical: defaultVerticalWorkflowGraphLoops
    }
  }), "utf8");
  appendWorkflowGraphLayoutLog(`Created workflow graph layout bootstrap at '${filePath}'.`);
}

export async function readWorkflowGraphLayoutConfigAsync(workspaceRoot: string): Promise<WorkflowGraphLayoutConfig> {
  await ensureWorkflowGraphLayoutConfigExistsAsync(workspaceRoot);
  const filePath = getWorkflowGraphLayoutPath(workspaceRoot);

  try {
    const raw = await fs.promises.readFile(filePath, "utf8");
    return parseWorkflowGraphLayoutConfig(raw);
  } catch (error) {
    appendWorkflowGraphLayoutLog(
      `Workflow graph layout read failed for '${filePath}'. Falling back to defaults. ${error instanceof Error ? error.message : String(error)}`
    );
    return {
      horizontal: { ...defaultHorizontalWorkflowGraphPositions },
      vertical: { ...defaultVerticalWorkflowGraphPositions },
      legend: {
        horizontal: { ...defaultWorkflowGraphLegendPositions.horizontal },
        vertical: { ...defaultWorkflowGraphLegendPositions.vertical }
      },
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
  const legend = {
    horizontal: { ...defaultWorkflowGraphLegendPositions.horizontal },
    vertical: { ...defaultWorkflowGraphLegendPositions.vertical }
  };
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
  let currentLegendTarget: WorkflowGraphLayoutMode | null = null;
  let pendingX: number | null = null;
  let pendingY: number | null = null;
  let pendingFromAnchor: string | null = null;
  let pendingToAnchor: string | null = null;
  let pendingLoopFromPhaseId: WorkflowGraphPhaseId | null = null;
  let pendingLoopToPhaseId: WorkflowGraphPhaseId | null = null;
  let pendingLoopSide: WorkflowGraphLoopSide | null = null;

  const commitPending = (): void => {
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
      currentMode = modeMatch[1] as WorkflowGraphLayoutMode;
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
    if (phaseMatch && currentMode && currentSection === "positions" && workflowGraphPhaseIds.includes(phaseMatch[1] as WorkflowGraphPhaseId)) {
      commitPending();
      currentPhaseId = phaseMatch[1] as WorkflowGraphPhaseId;
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
      pendingLoopSide = sideMatch[1] as WorkflowGraphLoopSide;
      continue;
    }
  }

  commitPending();
  return { horizontal, vertical, legend, connections, loops };
}

function serializeWorkflowGraphLayoutConfig(config: WorkflowGraphLayoutConfig): string {
  const serializeMode = (mode: WorkflowGraphLayoutMode): string => {
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

function isAnchorCode(value: string | null): value is string {
  return Boolean(value && /^[TLRB][1-5]$/.test(value));
}

function isWorkflowGraphPhaseId(value: string): value is WorkflowGraphPhaseId {
  return workflowGraphPhaseIds.includes(value as WorkflowGraphPhaseId);
}
