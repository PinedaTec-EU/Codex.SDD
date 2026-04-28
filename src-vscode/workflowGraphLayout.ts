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

export interface WorkflowGraphLayoutConfig {
  readonly horizontal: Record<string, WorkflowGraphPhasePosition>;
  readonly vertical: Record<string, WorkflowGraphPhasePosition>;
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
    vertical: defaultVerticalWorkflowGraphPositions
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
      vertical: { ...defaultVerticalWorkflowGraphPositions }
    };
  }
}

function parseWorkflowGraphLayoutConfig(raw: string): WorkflowGraphLayoutConfig {
  const horizontal = { ...defaultHorizontalWorkflowGraphPositions };
  const vertical = { ...defaultVerticalWorkflowGraphPositions };
  let currentMode: WorkflowGraphLayoutMode | null = null;
  let currentPhaseId: WorkflowGraphPhaseId | null = null;
  let pendingX: number | null = null;
  let pendingY: number | null = null;

  const commitPending = (): void => {
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
      currentMode = modeMatch[1] as WorkflowGraphLayoutMode;
      currentPhaseId = null;
      pendingX = null;
      pendingY = null;
      continue;
    }

    const phaseMatch = /^([a-z0-9-]+):\s*$/.exec(trimmed);
    if (phaseMatch && currentMode && workflowGraphPhaseIds.includes(phaseMatch[1] as WorkflowGraphPhaseId)) {
      commitPending();
      currentPhaseId = phaseMatch[1] as WorkflowGraphPhaseId;
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

function serializeWorkflowGraphLayoutConfig(config: WorkflowGraphLayoutConfig): string {
  const serializeMode = (mode: WorkflowGraphLayoutMode): string => {
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
