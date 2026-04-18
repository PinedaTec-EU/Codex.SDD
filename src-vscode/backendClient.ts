import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import * as path from "node:path";
import {
  buildApprovePhaseArguments,
  buildRequestRegressionArguments,
  buildRestartUserStoryArguments,
  buildServerProjectPath,
  parseToolContent
} from "./backendClientModel";
import type { SpecForgeSettings } from "./extensionSettings";
import { buildBackendEnvironment } from "./extensionSettings";
import { appendSpecForgeLog } from "./outputChannel";

export interface UserStorySummary {
  readonly usId: string;
  readonly title: string;
  readonly category: string;
  readonly directoryPath: string;
  readonly mainArtifactPath: string;
  readonly currentPhase: string;
  readonly status: string;
  readonly workBranch: string | null;
}

export interface ContinuePhaseResult {
  readonly usId: string;
  readonly currentPhase: string;
  readonly status: string;
  readonly generatedArtifactPath: string | null;
  readonly usage: TokenUsage | null;
}

export interface TokenUsage {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly totalTokens: number;
}

export interface CreateOrImportUserStoryResult {
  readonly usId: string;
  readonly rootDirectory: string;
  readonly mainArtifactPath: string;
}

export interface InitializeRepoPromptsResult {
  readonly workspaceRoot: string;
  readonly configPath: string;
  readonly promptManifestPath: string;
  readonly createdFiles: readonly string[];
  readonly skippedFiles: readonly string[];
}

export interface RequestRegressionResult {
  readonly usId: string;
  readonly currentPhase: string;
  readonly status: string;
}

export interface RestartUserStoryResult {
  readonly usId: string;
  readonly currentPhase: string;
  readonly status: string;
  readonly generatedArtifactPath: string | null;
}

export interface WorkflowPhaseDetails {
  readonly phaseId: string;
  readonly title: string;
  readonly order: number;
  readonly requiresApproval: boolean;
  readonly isApproved: boolean;
  readonly isCurrent: boolean;
  readonly state: string;
  readonly artifactPath: string | null;
  readonly executePromptPath: string | null;
  readonly approvePromptPath: string | null;
}

export interface CurrentPhaseControls {
  readonly canContinue: boolean;
  readonly canApprove: boolean;
  readonly requiresApproval: boolean;
  readonly blockingReason: string | null;
  readonly canRestartFromSource: boolean;
  readonly regressionTargets: readonly string[];
}

export interface TimelineEventDetails {
  readonly timestampUtc: string;
  readonly code: string;
  readonly actor: string | null;
  readonly phase: string | null;
  readonly summary: string | null;
  readonly artifacts: readonly string[];
}

export interface AttachmentDetails {
  readonly name: string;
  readonly path: string;
}

export interface UserStoryWorkflowDetails {
  readonly usId: string;
  readonly title: string;
  readonly category: string;
  readonly status: string;
  readonly currentPhase: string;
  readonly directoryPath: string;
  readonly workBranch: string | null;
  readonly mainArtifactPath: string;
  readonly timelinePath: string;
  readonly rawTimeline: string;
  readonly phases: readonly WorkflowPhaseDetails[];
  readonly controls: CurrentPhaseControls;
  readonly events: readonly TimelineEventDetails[];
  readonly attachmentsDirectoryPath: string;
  readonly attachments: readonly AttachmentDetails[];
}

export interface SpecForgeBackendClient {
  listUserStories(): Promise<readonly UserStorySummary[]>;
  getUserStorySummary(usId: string): Promise<UserStorySummary>;
  getUserStoryWorkflow(usId: string): Promise<UserStoryWorkflowDetails>;
  createUserStory(usId: string, title: string, kind: string, category: string, sourceText: string): Promise<CreateOrImportUserStoryResult>;
  importUserStory(usId: string, sourcePath: string, title: string, kind: string, category: string): Promise<CreateOrImportUserStoryResult>;
  initializeRepoPrompts(overwrite?: boolean): Promise<InitializeRepoPromptsResult>;
  continuePhase(usId: string): Promise<ContinuePhaseResult>;
  approveCurrentPhase(usId: string, baseBranch?: string): Promise<UserStorySummary>;
  requestRegression(usId: string, targetPhase: string, reason?: string): Promise<RequestRegressionResult>;
  restartUserStoryFromSource(usId: string, reason?: string): Promise<RestartUserStoryResult>;
  cancelActiveOperations(): void;
  dispose(): void;
}

export function createMcpBackendClient(
  workspaceRoot: string,
  hostRoot: string,
  settings: SpecForgeSettings
): SpecForgeBackendClient {
  return new StdioMcpBackendClient(workspaceRoot, hostRoot, settings);
}

class StdioMcpBackendClient implements SpecForgeBackendClient {
  private readonly process: ChildProcessWithoutNullStreams;
  private readonly pending = new Map<number, PendingRequest>();
  private readonly bufferChunks: Buffer[] = [];
  private readonly workspaceRoot: string;
  private readonly hostRoot: string;
  private nextRequestId = 1;
  private initialized = false;
  private disposed = false;

  public constructor(workspaceRoot: string, hostRoot: string, settings: SpecForgeSettings) {
    this.workspaceRoot = workspaceRoot;
    this.hostRoot = hostRoot;
    const serverProjectPath = buildServerProjectPath(hostRoot);
    appendSpecForgeLog(`Starting MCP backend for '${path.basename(workspaceRoot)}' using '${serverProjectPath}'.`);
    this.process = spawn(
      "dotnet",
      ["run", "--project", serverProjectPath],
      {
        cwd: this.hostRoot,
        stdio: "pipe",
        env: {
          ...process.env,
          ...buildBackendEnvironment(settings)
        }
      }
    );

    this.process.stdout.on("data", (chunk: Buffer) => {
      this.bufferChunks.push(chunk);
      void this.drainMessagesAsync();
    });

    this.process.stderr.on("data", (chunk: Buffer) => {
      const message = chunk.toString("utf8").trim();
      if (!message) {
        return;
      }

      appendSpecForgeLog(`MCP stderr: ${message}`);
      this.rejectPendingRequests(message);
    });

    this.process.on("exit", (code, signal) => {
      appendSpecForgeLog(`MCP backend exited with code ${code ?? "null"} and signal ${signal ?? "null"}.`);
      if (!this.disposed) {
        this.rejectPendingRequests("SpecForge MCP backend exited while a request was in progress.");
      }
    });
  }

  public async listUserStories(): Promise<readonly UserStorySummary[]> {
    const result = await this.callTool<{ items: UserStorySummary[] }>("list_user_stories", {
      workspaceRoot: this.workspaceRoot
    });
    return result.items;
  }

  public async getUserStorySummary(usId: string): Promise<UserStorySummary> {
    return this.callTool<UserStorySummary>("get_user_story_summary", {
      workspaceRoot: this.workspaceRoot,
      usId
    });
  }

  public async getUserStoryWorkflow(usId: string): Promise<UserStoryWorkflowDetails> {
    return this.callTool<UserStoryWorkflowDetails>("get_user_story_workflow", {
      workspaceRoot: this.workspaceRoot,
      usId
    });
  }

  public async createUserStory(usId: string, title: string, kind: string, category: string, sourceText: string): Promise<CreateOrImportUserStoryResult> {
    return this.callTool<CreateOrImportUserStoryResult>("create_us_from_chat", {
      workspaceRoot: this.workspaceRoot,
      usId,
      title,
      kind,
      category,
      sourceText
    });
  }

  public async importUserStory(usId: string, sourcePath: string, title: string, kind: string, category: string): Promise<CreateOrImportUserStoryResult> {
    return this.callTool<CreateOrImportUserStoryResult>("import_us_from_markdown", {
      workspaceRoot: this.workspaceRoot,
      usId,
      sourcePath,
      title,
      kind,
      category
    });
  }

  public async initializeRepoPrompts(overwrite = false): Promise<InitializeRepoPromptsResult> {
    return this.callTool<InitializeRepoPromptsResult>("initialize_repo_prompts", {
      workspaceRoot: this.workspaceRoot,
      overwrite
    });
  }

  public async continuePhase(usId: string): Promise<ContinuePhaseResult> {
    return this.callTool<ContinuePhaseResult>("generate_next_phase", {
      workspaceRoot: this.workspaceRoot,
      usId
    });
  }

  public async approveCurrentPhase(usId: string, baseBranch?: string): Promise<UserStorySummary> {
    return this.callTool<UserStorySummary>(
      "approve_phase",
      buildApprovePhaseArguments(this.workspaceRoot, usId, baseBranch)
    );
  }

  public async requestRegression(usId: string, targetPhase: string, reason?: string): Promise<RequestRegressionResult> {
    return this.callTool<RequestRegressionResult>(
      "request_regression",
      buildRequestRegressionArguments(this.workspaceRoot, usId, targetPhase, reason)
    );
  }

  public async restartUserStoryFromSource(usId: string, reason?: string): Promise<RestartUserStoryResult> {
    return this.callTool<RestartUserStoryResult>(
      "restart_user_story_from_source",
      buildRestartUserStoryArguments(this.workspaceRoot, usId, reason)
    );
  }

  public cancelActiveOperations(): void {
    this.dispose();
  }

  public dispose(): void {
    if (this.disposed) {
      return;
    }

    this.disposed = true;
    appendSpecForgeLog("Disposing MCP backend client.");
    this.rejectPendingRequests("SpecForge MCP backend was stopped.");
    this.process.kill();
  }

  private async ensureInitializedAsync(): Promise<void> {
    if (this.initialized) {
      return;
    }

    appendSpecForgeLog("Initializing MCP session.");
    await this.sendRequestAsync("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: {
        name: "SpecForge VS Code Extension",
        version: "0.0.1"
      }
    });

    await this.sendNotificationAsync("notifications/initialized", {});
    this.initialized = true;
    appendSpecForgeLog("MCP session initialized.");
  }

  private async callTool<T>(toolName: string, args: Record<string, unknown>): Promise<T> {
    await this.ensureInitializedAsync();
    const startedAt = Date.now();
    appendSpecForgeLog(`Calling tool '${toolName}' with ${JSON.stringify(args)}.`);
    try {
      const result = await this.sendRequestAsync("tools/call", {
        name: toolName,
        arguments: args
      });
      appendSpecForgeLog(`Tool '${toolName}' completed in ${Date.now() - startedAt} ms.`);
      return parseToolContent<T>(toolName, result);
    } catch (error) {
      appendSpecForgeLog(`Tool '${toolName}' failed after ${Date.now() - startedAt} ms: ${asErrorMessage(error)}`);
      throw error;
    }
  }

  private async sendNotificationAsync(method: string, params: unknown): Promise<void> {
    const payload = {
      jsonrpc: "2.0",
      method,
      params
    };

    await this.writePayloadAsync(JSON.stringify(payload));
  }

  private async sendRequestAsync(method: string, params: unknown): Promise<any> {
    if (this.disposed) {
      throw new Error("SpecForge MCP backend client is disposed.");
    }

    const id = this.nextRequestId++;
    const payload = {
      jsonrpc: "2.0",
      id,
      method,
      params
    };

    const resultPromise = new Promise<any>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
    });

    await this.writePayloadAsync(JSON.stringify(payload));
    return resultPromise;
  }

  private async writePayloadAsync(json: string): Promise<void> {
    const payload = Buffer.from(json, "utf8");
    const header = Buffer.from(`Content-Length: ${payload.length}\r\n\r\n`, "ascii");
    await writeAsync(this.process.stdin, header);
    await writeAsync(this.process.stdin, payload);
  }

  private async drainMessagesAsync(): Promise<void> {
    let buffer = Buffer.concat(this.bufferChunks);
    this.bufferChunks.length = 0;

    while (true) {
      const separatorIndex = buffer.indexOf("\r\n\r\n");
      if (separatorIndex < 0) {
        if (buffer.length > 0) {
          this.bufferChunks.push(buffer);
        }

        return;
      }

      const header = buffer.subarray(0, separatorIndex).toString("utf8");
      const match = /Content-Length:\s*(\d+)/i.exec(header);
      if (!match) {
        throw new Error("Invalid MCP response header.");
      }

      const contentLength = Number.parseInt(match[1], 10);
      const bodyStart = separatorIndex + 4;
      if (buffer.length < bodyStart + contentLength) {
        this.bufferChunks.push(buffer);
        return;
      }

      const body = buffer.subarray(bodyStart, bodyStart + contentLength).toString("utf8");
      const message = JSON.parse(body) as MpcResponse;
      this.handleMessage(message);
      buffer = buffer.subarray(bodyStart + contentLength);
    }
  }

  private handleMessage(message: MpcResponse): void {
    if (typeof message.id !== "number") {
      return;
    }

    const pending = this.pending.get(message.id);
    if (!pending) {
      return;
    }

    this.pending.delete(message.id);

    if (message.error) {
      pending.reject(new Error(message.error.message));
      return;
    }

    pending.resolve(message.result);
  }

  private rejectPendingRequests(message: string): void {
    for (const request of this.pending.values()) {
      request.reject(new Error(message));
    }

    this.pending.clear();
  }
}

interface PendingRequest {
  readonly resolve: (value: any) => void;
  readonly reject: (reason?: unknown) => void;
}

interface MpcResponse {
  readonly id?: number;
  readonly result?: any;
  readonly error?: {
    readonly code: number;
    readonly message: string;
  };
}

async function writeAsync(stream: NodeJS.WritableStream, payload: Buffer): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    stream.write(payload, (error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

function asErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return "Unknown backend client error.";
}
