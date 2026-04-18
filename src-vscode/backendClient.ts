import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import * as path from "node:path";

export interface UserStorySummary {
  readonly usId: string;
  readonly title: string;
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

export interface SpecForgeBackendClient {
  listUserStories(): Promise<readonly UserStorySummary[]>;
  getUserStorySummary(usId: string): Promise<UserStorySummary>;
  createUserStory(usId: string, title: string, sourceText: string): Promise<CreateOrImportUserStoryResult>;
  importUserStory(usId: string, sourcePath: string, title: string): Promise<CreateOrImportUserStoryResult>;
  initializeRepoPrompts(overwrite?: boolean): Promise<InitializeRepoPromptsResult>;
  continuePhase(usId: string): Promise<ContinuePhaseResult>;
  approveCurrentPhase(usId: string, baseBranch?: string): Promise<UserStorySummary>;
  requestRegression(usId: string, targetPhase: string, reason?: string): Promise<RequestRegressionResult>;
  restartUserStoryFromSource(usId: string, reason?: string): Promise<RestartUserStoryResult>;
  dispose(): void;
}

export function createMcpBackendClient(workspaceRoot: string): SpecForgeBackendClient {
  return new StdioMcpBackendClient(workspaceRoot);
}

class StdioMcpBackendClient implements SpecForgeBackendClient {
  private readonly process: ChildProcessWithoutNullStreams;
  private readonly pending = new Map<number, PendingRequest>();
  private readonly bufferChunks: Buffer[] = [];
  private readonly workspaceRoot: string;
  private nextRequestId = 1;
  private initialized = false;

  public constructor(workspaceRoot: string) {
    this.workspaceRoot = workspaceRoot;
    const serverProjectPath = path.join(workspaceRoot, "src", "SpecForge.McpServer", "SpecForge.McpServer.csproj");
    this.process = spawn(
      "dotnet",
      ["run", "--project", serverProjectPath],
      {
        cwd: workspaceRoot,
        stdio: "pipe"
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

      for (const request of this.pending.values()) {
        request.reject(new Error(message));
      }

      this.pending.clear();
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

  public async createUserStory(usId: string, title: string, sourceText: string): Promise<CreateOrImportUserStoryResult> {
    return this.callTool<CreateOrImportUserStoryResult>("create_us_from_chat", {
      workspaceRoot: this.workspaceRoot,
      usId,
      title,
      sourceText
    });
  }

  public async importUserStory(usId: string, sourcePath: string, title: string): Promise<CreateOrImportUserStoryResult> {
    return this.callTool<CreateOrImportUserStoryResult>("import_us_from_markdown", {
      workspaceRoot: this.workspaceRoot,
      usId,
      sourcePath,
      title
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
    const argumentsPayload: Record<string, string> = {
      workspaceRoot: this.workspaceRoot,
      usId
    };

    if (baseBranch) {
      argumentsPayload.baseBranch = baseBranch;
    }

    return this.callTool<UserStorySummary>("approve_phase", argumentsPayload);
  }

  public async requestRegression(usId: string, targetPhase: string, reason?: string): Promise<RequestRegressionResult> {
    const argumentsPayload: Record<string, string> = {
      workspaceRoot: this.workspaceRoot,
      usId,
      targetPhase
    };

    if (reason && reason.trim().length > 0) {
      argumentsPayload.reason = reason;
    }

    return this.callTool<RequestRegressionResult>("request_regression", argumentsPayload);
  }

  public async restartUserStoryFromSource(usId: string, reason?: string): Promise<RestartUserStoryResult> {
    const argumentsPayload: Record<string, string> = {
      workspaceRoot: this.workspaceRoot,
      usId
    };

    if (reason && reason.trim().length > 0) {
      argumentsPayload.reason = reason;
    }

    return this.callTool<RestartUserStoryResult>("restart_user_story_from_source", argumentsPayload);
  }

  public dispose(): void {
    this.process.kill();
  }

  private async ensureInitializedAsync(): Promise<void> {
    if (this.initialized) {
      return;
    }

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
  }

  private async callTool<T>(toolName: string, args: Record<string, unknown>): Promise<T> {
    await this.ensureInitializedAsync();
    const result = await this.sendRequestAsync("tools/call", {
      name: toolName,
      arguments: args
    });
    const content = result?.content?.[0]?.text;
    if (typeof content !== "string") {
      throw new Error(`Tool '${toolName}' returned an invalid MCP payload.`);
    }

    return JSON.parse(content) as T;
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
