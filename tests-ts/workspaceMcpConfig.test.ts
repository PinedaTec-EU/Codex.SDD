import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { buildPackagedServerDllPath } from "../src-vscode/backendClientModel";
import {
  buildSpecForgeWorkspaceMcpServerConfig,
  ensureWorkspaceMcpConfigAsync,
  getWorkspaceMcpConfigPath,
  specForgeWorkspaceMcpServerName
} from "../src-vscode/workspaceMcpConfig";

test("ensureWorkspaceMcpConfigAsync creates a workspace mcp.json linked to the extension server", async () => {
  const workspaceRoot = await fs.promises.mkdtemp(path.join(os.tmpdir(), "specforge-mcp-"));
  const hostRoot = "/opt/specforge";

  const result = await ensureWorkspaceMcpConfigAsync(workspaceRoot, hostRoot);
  const parsed = JSON.parse(await fs.promises.readFile(getWorkspaceMcpConfigPath(workspaceRoot), "utf8"));

  assert.deepEqual(result, {
    path: getWorkspaceMcpConfigPath(workspaceRoot),
    changed: true,
    reason: "created"
  });
  assert.deepEqual(
    parsed.servers[specForgeWorkspaceMcpServerName],
    buildSpecForgeWorkspaceMcpServerConfig(hostRoot)
  );
});

test("ensureWorkspaceMcpConfigAsync preserves existing servers and only adds SpecForge", async () => {
  const workspaceRoot = await fs.promises.mkdtemp(path.join(os.tmpdir(), "specforge-mcp-"));
  const filePath = getWorkspaceMcpConfigPath(workspaceRoot);
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
  await fs.promises.writeFile(filePath, JSON.stringify({
    inputs: [{ id: "token", type: "promptString" }],
    servers: {
      github: {
        type: "http",
        url: "https://api.githubcopilot.com/mcp"
      }
    }
  }, null, 2));

  const result = await ensureWorkspaceMcpConfigAsync(workspaceRoot, "/opt/specforge");
  const parsed = JSON.parse(await fs.promises.readFile(filePath, "utf8"));

  assert.equal(result.reason, "added");
  assert.deepEqual(parsed.inputs, [{ id: "token", type: "promptString" }]);
  assert.deepEqual(parsed.servers.github, {
    type: "http",
    url: "https://api.githubcopilot.com/mcp"
  });
  assert.deepEqual(
    parsed.servers[specForgeWorkspaceMcpServerName],
    buildSpecForgeWorkspaceMcpServerConfig("/opt/specforge")
  );
});

test("ensureWorkspaceMcpConfigAsync updates stale SpecForge server and is idempotent afterwards", async () => {
  const workspaceRoot = await fs.promises.mkdtemp(path.join(os.tmpdir(), "specforge-mcp-"));
  const filePath = getWorkspaceMcpConfigPath(workspaceRoot);
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
  await fs.promises.writeFile(filePath, JSON.stringify({
    servers: {
      [specForgeWorkspaceMcpServerName]: {
        type: "stdio",
        command: "dotnet",
        args: ["run", "--project", "/old/SpecForge.McpServer.csproj"],
        envFile: "${workspaceFolder}/.env"
      }
    }
  }, null, 2));

  const updated = await ensureWorkspaceMcpConfigAsync(workspaceRoot, "/opt/specforge");
  const unchanged = await ensureWorkspaceMcpConfigAsync(workspaceRoot, "/opt/specforge");

  assert.equal(updated.reason, "updated");
  assert.equal(updated.changed, true);
  assert.equal(unchanged.reason, "unchanged");
  assert.equal(unchanged.changed, false);
});

test("buildSpecForgeWorkspaceMcpServerConfig links to the packaged MCP server when available", async () => {
  const hostRoot = await fs.promises.mkdtemp(path.join(os.tmpdir(), "specforge-host-"));
  const packagedServerPath = buildPackagedServerDllPath(hostRoot);
  await fs.promises.mkdir(path.dirname(packagedServerPath), { recursive: true });
  await fs.promises.writeFile(packagedServerPath, "");

  assert.deepEqual(buildSpecForgeWorkspaceMcpServerConfig(hostRoot), {
    type: "stdio",
    command: "dotnet",
    args: [packagedServerPath],
    envFile: "${workspaceFolder}/.env"
  });
});
