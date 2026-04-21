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
  actor?: string
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
