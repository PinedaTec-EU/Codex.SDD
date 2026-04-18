export function buildApprovePhaseArguments(
  workspaceRoot: string,
  usId: string,
  baseBranch?: string
): Record<string, string> {
  const argumentsPayload: Record<string, string> = {
    workspaceRoot,
    usId
  };

  if (baseBranch) {
    argumentsPayload.baseBranch = baseBranch;
  }

  return argumentsPayload;
}

export function buildRequestRegressionArguments(
  workspaceRoot: string,
  usId: string,
  targetPhase: string,
  reason?: string
): Record<string, string> {
  const argumentsPayload: Record<string, string> = {
    workspaceRoot,
    usId,
    targetPhase
  };

  if (reason && reason.trim().length > 0) {
    argumentsPayload.reason = reason;
  }

  return argumentsPayload;
}

export function buildRestartUserStoryArguments(
  workspaceRoot: string,
  usId: string,
  reason?: string
): Record<string, string> {
  const argumentsPayload: Record<string, string> = {
    workspaceRoot,
    usId
  };

  if (reason && reason.trim().length > 0) {
    argumentsPayload.reason = reason;
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
