import * as fs from "node:fs";
import * as path from "node:path";

export interface McpServerLaunchConfig {
  readonly command: string;
  readonly args: readonly string[];
  readonly cwd: string;
  readonly source: "packaged" | "project";
  readonly targetPath: string;
}

export function buildApprovePhaseArguments(
  workspaceRoot: string,
  usId: string,
  baseBranch?: string,
  workBranch?: string,
  actor?: string
): Record<string, string> {
  const argumentsPayload: Record<string, string> = {
    workspaceRoot,
    usId
  };

  if (baseBranch) {
    argumentsPayload.baseBranch = baseBranch;
  }

  if (workBranch) {
    argumentsPayload.workBranch = workBranch;
  }

  if (actor && actor.trim().length > 0) {
    argumentsPayload.actor = actor;
  }

  return argumentsPayload;
}

export function buildRequestRegressionArguments(
  workspaceRoot: string,
  usId: string,
  targetPhase: string,
  reason?: string,
  actor?: string,
  destructive?: boolean
): Record<string, string> {
  const argumentsPayload: Record<string, string> = {
    workspaceRoot,
    usId,
    targetPhase
  };

  if (reason && reason.trim().length > 0) {
    argumentsPayload.reason = reason;
  }

  if (actor && actor.trim().length > 0) {
    argumentsPayload.actor = actor;
  }

  if (destructive) {
    argumentsPayload.destructive = "true";
  }

  return argumentsPayload;
}

export function buildRestartUserStoryArguments(
  workspaceRoot: string,
  usId: string,
  reason?: string,
  actor?: string
): Record<string, string> {
  const argumentsPayload: Record<string, string> = {
    workspaceRoot,
    usId
  };

  if (reason && reason.trim().length > 0) {
    argumentsPayload.reason = reason;
  }

  if (actor && actor.trim().length > 0) {
    argumentsPayload.actor = actor;
  }

  return argumentsPayload;
}

export function buildRewindWorkflowArguments(
  workspaceRoot: string,
  usId: string,
  targetPhase: string,
  actor?: string,
  destructive?: boolean
): Record<string, string> {
  const argumentsPayload: Record<string, string> = {
    workspaceRoot,
    usId,
    targetPhase
  };

  if (actor && actor.trim().length > 0) {
    argumentsPayload.actor = actor;
  }

  if (destructive) {
    argumentsPayload.destructive = "true";
  }

  return argumentsPayload;
}

export function buildReopenCompletedWorkflowArguments(
  workspaceRoot: string,
  usId: string,
  reasonKind: string,
  description: string,
  actor?: string
): Record<string, string> {
  const argumentsPayload: Record<string, string> = {
    workspaceRoot,
    usId,
    reasonKind,
    description
  };

  if (actor && actor.trim().length > 0) {
    argumentsPayload.actor = actor;
  }

  return argumentsPayload;
}

export function parseToolContent<T>(toolName: string, result: any): T {
  const content = result?.content?.[0]?.text;
  if (typeof content !== "string") {
    throw new Error(`Tool '${toolName}' returned an invalid MCP payload.`);
  }

  return JSON.parse(content) as T;
}

export function buildServerProjectPath(hostRoot: string): string {
  return `${hostRoot.replace(/[\\\/]+$/, "")}/src/SpecForge.McpServer/SpecForge.McpServer.csproj`;
}

export function buildPackagedServerDllPath(hostRoot: string): string {
  return path.join(trimTrailingPathSeparators(hostRoot), "dist", "mcp", "SpecForge.McpServer.dll");
}

export function resolveMcpServerLaunchConfig(hostRoot: string): McpServerLaunchConfig {
  const packagedServerPath = buildPackagedServerDllPath(hostRoot);
  if (fs.existsSync(packagedServerPath)) {
    return {
      command: "dotnet",
      args: [packagedServerPath],
      cwd: path.dirname(packagedServerPath),
      source: "packaged",
      targetPath: packagedServerPath
    };
  }

  const serverProjectPath = buildServerProjectPath(hostRoot);
  return {
    command: "dotnet",
    args: ["run", "--project", serverProjectPath],
    cwd: trimTrailingPathSeparators(hostRoot),
    source: "project",
    targetPath: serverProjectPath
  };
}

function trimTrailingPathSeparators(value: string): string {
  return value.replace(/[\\\/]+$/, "");
}
