import test from "node:test";
import assert from "node:assert/strict";
import {
  buildPackagedServerDllPath,
  buildApprovePhaseArguments,
  buildRequestRegressionArguments,
  buildRestartUserStoryArguments,
  buildServerProjectPath,
  parseToolContent,
  resolveMcpServerLaunchConfig
} from "../src-vscode/backendClientModel";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

test("buildApprovePhaseArguments omits empty optional base branch", () => {
  assert.deepEqual(buildApprovePhaseArguments("/repo", "US-0001"), {
    workspaceRoot: "/repo",
    usId: "US-0001"
  });

  assert.deepEqual(buildApprovePhaseArguments("/repo", "US-0001", "main"), {
    workspaceRoot: "/repo",
    usId: "US-0001",
    baseBranch: "main"
  });
});

test("buildRequestRegressionArguments only includes non-empty reasons", () => {
  assert.deepEqual(buildRequestRegressionArguments("/repo", "US-0001", "spec"), {
    workspaceRoot: "/repo",
    usId: "US-0001",
    targetPhase: "spec"
  });

  assert.deepEqual(buildRequestRegressionArguments("/repo", "US-0001", "spec", "Needs redesign"), {
    workspaceRoot: "/repo",
    usId: "US-0001",
    targetPhase: "spec",
    reason: "Needs redesign"
  });
});

test("buildRestartUserStoryArguments only includes non-empty reasons", () => {
  assert.deepEqual(buildRestartUserStoryArguments("/repo", "US-0001", " "), {
    workspaceRoot: "/repo",
    usId: "US-0001"
  });

  assert.deepEqual(buildRestartUserStoryArguments("/repo", "US-0001", "Source changed"), {
    workspaceRoot: "/repo",
    usId: "US-0001",
    reason: "Source changed"
  });
});

test("parseToolContent returns parsed text payload and rejects invalid payloads", () => {
  assert.deepEqual(parseToolContent("list_user_stories", {
    content: [
      { text: "{\"items\":[{\"usId\":\"US-0001\"}]}" }
    ]
  }), {
    items: [{ usId: "US-0001" }]
  });

  assert.throws(
    () => parseToolContent("list_user_stories", { content: [{}] }),
    /Tool 'list_user_stories' returned an invalid MCP payload\./
  );
});

test("buildServerProjectPath anchors the MCP server under the extension host root", () => {
  assert.equal(
    buildServerProjectPath("/Users/me/SpecForge.AI"),
    "/Users/me/SpecForge.AI/src/SpecForge.McpServer/SpecForge.McpServer.csproj"
  );
  assert.equal(
    buildServerProjectPath("/Users/me/SpecForge.AI/"),
    "/Users/me/SpecForge.AI/src/SpecForge.McpServer/SpecForge.McpServer.csproj"
  );
});

test("resolveMcpServerLaunchConfig prefers packaged MCP server when present", async () => {
  const hostRoot = await fs.promises.mkdtemp(path.join(os.tmpdir(), "specforge-host-"));
  const packagedServerPath = buildPackagedServerDllPath(hostRoot);
  await fs.promises.mkdir(path.dirname(packagedServerPath), { recursive: true });
  await fs.promises.writeFile(packagedServerPath, "");

  assert.deepEqual(resolveMcpServerLaunchConfig(hostRoot), {
    command: "dotnet",
    args: [packagedServerPath],
    cwd: path.dirname(packagedServerPath),
    source: "packaged",
    targetPath: packagedServerPath
  });
});

test("resolveMcpServerLaunchConfig falls back to project server in development", () => {
  assert.deepEqual(resolveMcpServerLaunchConfig("/Users/me/SpecForge.AI"), {
    command: "dotnet",
    args: ["run", "--project", "/Users/me/SpecForge.AI/src/SpecForge.McpServer/SpecForge.McpServer.csproj"],
    cwd: "/Users/me/SpecForge.AI",
    source: "project",
    targetPath: "/Users/me/SpecForge.AI/src/SpecForge.McpServer/SpecForge.McpServer.csproj"
  });
});
