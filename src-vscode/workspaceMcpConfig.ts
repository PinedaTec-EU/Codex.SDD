import * as fs from "node:fs";
import * as path from "node:path";
import { buildServerProjectPath } from "./backendClientModel";

export const specForgeWorkspaceMcpServerName = "specforge";

export interface WorkspaceMcpServerConfig {
  readonly type: "stdio";
  readonly command: string;
  readonly args: readonly string[];
  readonly envFile: string;
}

interface WorkspaceMcpConfig {
  servers?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface EnsureWorkspaceMcpConfigResult {
  readonly path: string;
  readonly changed: boolean;
  readonly reason: "created" | "added" | "updated" | "unchanged";
}

export function getWorkspaceMcpConfigPath(workspaceRoot: string): string {
  return path.join(workspaceRoot, ".vscode", "mcp.json");
}

export function buildSpecForgeWorkspaceMcpServerConfig(hostRoot: string): WorkspaceMcpServerConfig {
  return {
    type: "stdio",
    command: "dotnet",
    args: ["run", "--project", buildServerProjectPath(hostRoot)],
    envFile: "${workspaceFolder}/.env"
  };
}

export async function ensureWorkspaceMcpConfigAsync(
  workspaceRoot: string,
  hostRoot: string
): Promise<EnsureWorkspaceMcpConfigResult> {
  const filePath = getWorkspaceMcpConfigPath(workspaceRoot);
  const expectedServer = buildSpecForgeWorkspaceMcpServerConfig(hostRoot);
  const existingConfig = await readExistingConfigAsync(filePath);
  const previousServer = existingConfig.servers?.[specForgeWorkspaceMcpServerName];

  if (isSameServerConfig(previousServer, expectedServer)) {
    return {
      path: filePath,
      changed: false,
      reason: "unchanged"
    };
  }

  const nextConfig: WorkspaceMcpConfig = {
    ...existingConfig,
    servers: {
      ...(existingConfig.servers ?? {}),
      [specForgeWorkspaceMcpServerName]: expectedServer
    }
  };

  await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
  await fs.promises.writeFile(filePath, `${JSON.stringify(nextConfig, null, 2)}\n`, "utf8");

  return {
    path: filePath,
    changed: true,
    reason: previousServer === undefined
      ? existingConfig.servers === undefined ? "created" : "added"
      : "updated"
  };
}

async function readExistingConfigAsync(filePath: string): Promise<WorkspaceMcpConfig> {
  let raw: string;
  try {
    raw = await fs.promises.readFile(filePath, "utf8");
  } catch (error) {
    if (isNodeErrorWithCode(error, "ENOENT")) {
      return {};
    }

    throw error;
  }

  const parsed = JSON.parse(raw) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`Workspace MCP configuration '${filePath}' must be a JSON object.`);
  }

  return parsed as WorkspaceMcpConfig;
}

function isSameServerConfig(actual: unknown, expected: WorkspaceMcpServerConfig): boolean {
  if (!actual || typeof actual !== "object" || Array.isArray(actual)) {
    return false;
  }

  const candidate = actual as Record<string, unknown>;
  return candidate.type === expected.type
    && candidate.command === expected.command
    && Array.isArray(candidate.args)
    && candidate.args.length === expected.args.length
    && candidate.args.every((value, index) => value === expected.args[index])
    && candidate.envFile === expected.envFile;
}

function isNodeErrorWithCode(error: unknown, code: string): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === code;
}
