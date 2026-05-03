import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import * as path from "node:path";
import {
  buildApprovePhaseArguments,
  buildReopenCompletedWorkflowArguments,
  buildRewindWorkflowArguments,
  buildRequestRegressionArguments,
  buildRestartUserStoryArguments,
  parseToolContent,
  resolveMcpServerLaunchConfig
} from "./backendClientModel";
import type { SpecForgeSettings } from "./extensionSettings";
import { buildBackendEnvironment } from "./extensionSettings";
import { parseModelResponseDiagnosticLine, summarizeMcpDiagnosticLine, type ModelResponseDiagnostic } from "./mcpDiagnostics";
import { appendSpecForgeDebugLog, appendSpecForgeLog } from "./outputChannel";
import { asErrorMessage } from "./utils";

export interface UserStorySummary {
  readonly usId: string;
  readonly title: string;
  readonly description?: string;
  readonly category: string;
  readonly directoryPath: string;
  readonly mainArtifactPath: string;
  readonly currentPhase: string;
  readonly status: string;
  readonly workBranch: string | null;
}

export interface UserStoryRuntimeStatus {
  readonly usId: string;
  readonly status: string;
  readonly activeOperation: string | null;
  readonly currentPhase: string;
  readonly startedAtUtc: string | null;
  readonly lastHeartbeatUtc: string | null;
  readonly lastOutcome: string | null;
  readonly lastCompletedAtUtc: string | null;
  readonly message: string | null;
  readonly isStale: boolean;
}

export interface ContinuePhaseResult {
  readonly usId: string;
  readonly currentPhase: string;
  readonly status: string;
  readonly generatedArtifactPath: string | null;
  readonly usage: TokenUsage | null;
  readonly execution?: PhaseExecutionMetadata | null;
  readonly commit?: PhaseCommitResult | null;
}

export interface PhaseCommitResult {
  readonly isGitWorkspace: boolean;
  readonly commitCreated: boolean;
  readonly commitSha: string | null;
  readonly message: string | null;
  readonly stagedPaths: readonly string[];
}

export interface TokenUsage {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly totalTokens: number;
}

export interface PhaseExecutionMetadata {
  readonly providerKind: string;
  readonly model: string;
  readonly profileName: string | null;
  readonly agentName?: string | null;
  readonly agentRole?: string | null;
  readonly baseUrl: string | null;
  readonly warnings?: readonly string[] | null;
  readonly inputSha256?: string | null;
  readonly outputSha256?: string | null;
  readonly structuredOutputSha256?: string | null;
  readonly receiptPath?: string | null;
}

type ModelResponseListener = (diagnostic: ModelResponseDiagnostic) => void;

const modelResponseListeners = new Set<ModelResponseListener>();

export function onModelResponseDiagnostic(listener: ModelResponseListener): () => void {
  modelResponseListeners.add(listener);
  return () => {
    modelResponseListeners.delete(listener);
  };
}

function notifyModelResponseDiagnostic(diagnostic: ModelResponseDiagnostic): void {
  for (const listener of modelResponseListeners) {
    listener(diagnostic);
  }
}

export interface WorkflowLineageFinding {
  readonly severity: string;
  readonly confidence: string;
  readonly code: string;
  readonly summary: string;
  readonly phaseId: string | null;
  readonly eventTimestampUtc: string | null;
  readonly affectedArtifacts: readonly string[];
}

export interface WorkflowLineageAnalysisResult {
  readonly usId: string;
  readonly status: string;
  readonly findings: readonly WorkflowLineageFinding[];
  readonly deprecatedCandidatePaths: readonly string[];
  readonly recommendedTargetPhase: string | null;
}

export interface WorkflowLineageRepairResult {
  readonly usId: string;
  readonly status: string;
  readonly currentPhase: string;
  readonly archiveDirectoryPath: string;
  readonly archivedPaths: readonly string[];
  readonly analysis: WorkflowLineageAnalysisResult;
}

export interface CreateOrImportUserStoryResult {
  readonly usId: string;
  readonly rootDirectory: string;
  readonly mainArtifactPath: string;
}

export interface OperateCurrentPhaseArtifactResult {
  readonly usId: string;
  readonly currentPhase: string;
  readonly status: string;
  readonly operationLogPath: string;
  readonly sourceArtifactPath: string;
  readonly generatedArtifactPath: string;
  readonly usage: TokenUsage | null;
  readonly execution?: PhaseExecutionMetadata | null;
  readonly commit?: PhaseCommitResult | null;
}

export interface SubmitApprovalAnswerResult {
  readonly usId: string;
  readonly currentPhase: string;
  readonly status: string;
  readonly generatedArtifactPath: string;
}

export interface InitializeRepoPromptsResult {
  readonly workspaceRoot: string;
  readonly configPath: string;
  readonly promptManifestPath: string;
  readonly promptSystemHashesPath: string;
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

export interface ResetUserStoryResult {
  readonly usId: string;
  readonly currentPhase: string;
  readonly status: string;
  readonly deletedPaths: readonly string[];
  readonly preservedPaths: readonly string[];
}

export interface RewindWorkflowResult {
  readonly usId: string;
  readonly currentPhase: string;
  readonly status: string;
  readonly deletedPaths: readonly string[];
  readonly preservedPaths: readonly string[];
}

export interface WorkflowPhaseDetails {
  readonly phaseId: string;
  readonly title: string;
  readonly order: number;
  readonly requiresApproval: boolean;
  readonly expectsHumanIntervention: boolean;
  readonly isApproved: boolean;
  readonly isCurrent: boolean;
  readonly state: string;
  readonly artifactPath: string | null;
  readonly operationLogPath?: string | null;
  readonly executePromptPath: string | null;
  readonly approvePromptPath: string | null;
  readonly executeSystemPromptPath?: string | null;
  readonly approveSystemPromptPath?: string | null;
  readonly executionReadiness?: PhaseExecutionReadiness | null;
}

export interface PhaseExecutionRequirements {
  readonly modelExecutionRequired: boolean;
  readonly repositoryAccess: string;
  readonly workspaceWriteAccess: boolean;
}

export interface PhaseExecutionModelSecurity {
  readonly providerKind: string;
  readonly model: string;
  readonly profileName: string | null;
  readonly repositoryAccess: string;
  readonly nativeCliRequired: boolean;
  readonly nativeCliAvailable: boolean;
  readonly agentName?: string | null;
  readonly agentRole?: string | null;
}

export interface PhaseExecutionReadiness {
  readonly phaseId: string;
  readonly canExecute: boolean;
  readonly blockingReason: string | null;
  readonly requiredPermissions?: PhaseExecutionRequirements | null;
  readonly assignedModelSecurity?: PhaseExecutionModelSecurity | null;
  readonly validationMessage?: string | null;
}

export interface RefinementQuestionAnswerDetails {
  readonly index: number;
  readonly question: string;
  readonly answer: string | null;
}

export interface RefinementSessionDetails {
  readonly status: string;
  readonly tolerance: string;
  readonly reason: string | null;
  readonly items: readonly RefinementQuestionAnswerDetails[];
}

export interface ApprovalQuestionDetails {
  readonly index: number;
  readonly question: string;
  readonly status: string;
  readonly isResolved: boolean;
  readonly answer: string | null;
  readonly answeredBy: string | null;
  readonly answeredAtUtc: string | null;
}

export interface CurrentPhaseControls {
  readonly canContinue: boolean;
  readonly canApprove: boolean;
  readonly requiresApproval: boolean;
  readonly blockingReason: string | null;
  readonly canRestartFromSource: boolean;
  readonly regressionTargets: readonly string[];
  readonly rewindTargets?: readonly string[];
  readonly executionPhase?: string | null;
  readonly executionReadiness?: PhaseExecutionReadiness | null;
}

export interface TimelineEventDetails {
  readonly timestampUtc: string;
  readonly code: string;
  readonly actor: string | null;
  readonly phase: string | null;
  readonly summary: string | null;
  readonly artifacts: readonly string[];
  readonly usage: TokenUsage | null;
  readonly durationMs: number | null;
  readonly execution?: PhaseExecutionMetadata | null;
}

export interface PhaseIterationDetails {
  readonly iterationKey: string;
  readonly attempt: number;
  readonly phaseId: string;
  readonly timestampUtc: string;
  readonly code: string;
  readonly actor: string | null;
  readonly summary: string | null;
  readonly outputArtifactPath: string;
  readonly inputArtifactPath: string | null;
  readonly contextArtifactPaths: readonly string[];
  readonly operationLogPath: string | null;
  readonly operationPrompt: string | null;
  readonly usage: TokenUsage | null;
  readonly durationMs: number | null;
  readonly execution?: PhaseExecutionMetadata | null;
}

export interface UserStoryFileDetails {
  readonly name: string;
  readonly path: string;
}

export interface PullRequestDetails {
  readonly status: string;
  readonly title: string;
  readonly isDraft: boolean;
  readonly number: number | null;
  readonly url: string | null;
  readonly remoteBranch: string | null;
  readonly publishedAtUtc: string | null;
}

export interface UserStoryWorkflowDetails {
  readonly usId: string;
  readonly title: string;
  readonly kind?: string;
  readonly category: string;
  readonly status: string;
  readonly currentPhase: string;
  readonly directoryPath: string;
  readonly workBranch: string | null;
  readonly mainArtifactPath: string;
  readonly timelinePath: string;
  readonly rawTimeline: string;
  readonly pullRequest?: PullRequestDetails | null;
  readonly phases: readonly WorkflowPhaseDetails[];
  readonly controls: CurrentPhaseControls;
  readonly refinement: RefinementSessionDetails | null;
  readonly approvalQuestions?: readonly ApprovalQuestionDetails[];
  readonly events: readonly TimelineEventDetails[];
  readonly phaseIterations?: readonly PhaseIterationDetails[];
  readonly contextFilesDirectoryPath?: string;
  readonly contextFiles?: readonly UserStoryFileDetails[];
  readonly attachmentsDirectoryPath: string;
  readonly attachments: readonly UserStoryFileDetails[];
}

export interface SpecForgeBackendClient {
  listUserStories(): Promise<readonly UserStorySummary[]>;
  getUserStorySummary(usId: string): Promise<UserStorySummary>;
  getUserStoryWorkflow(usId: string): Promise<UserStoryWorkflowDetails>;
  getUserStoryRuntimeStatus(usId: string): Promise<UserStoryRuntimeStatus>;
  analyzeUserStoryLineage(usId: string): Promise<WorkflowLineageAnalysisResult>;
  repairUserStoryLineage(usId: string, actor?: string): Promise<WorkflowLineageRepairResult>;
  createUserStory(usId: string, title: string, kind: string, category: string, sourceText: string, actor?: string): Promise<CreateOrImportUserStoryResult>;
  importUserStory(usId: string, sourcePath: string, title: string, kind: string, category: string, actor?: string): Promise<CreateOrImportUserStoryResult>;
  initializeRepoPrompts(overwrite?: boolean): Promise<InitializeRepoPromptsResult>;
  exportPromptTemplate(promptPath: string, overwrite?: boolean): Promise<InitializeRepoPromptsResult>;
  continuePhase(usId: string, actor?: string): Promise<ContinuePhaseResult>;
  approveReviewAnyway(usId: string, reason: string, actor?: string): Promise<ContinuePhaseResult>;
  approveCurrentPhase(usId: string, baseBranch?: string, workBranch?: string, actor?: string): Promise<UserStorySummary>;
  requestRegression(usId: string, targetPhase: string, reason?: string, actor?: string, destructive?: boolean): Promise<RequestRegressionResult>;
  reopenCompletedWorkflow(usId: string, reasonKind: string, description: string, actor?: string): Promise<RequestRegressionResult>;
  restartUserStoryFromSource(usId: string, reason?: string, actor?: string): Promise<RestartUserStoryResult>;
  rewindWorkflow(usId: string, targetPhase: string, actor?: string, destructive?: boolean): Promise<RewindWorkflowResult>;
  resetUserStoryToCapture(usId: string): Promise<ResetUserStoryResult>;
  submitRefinementAnswers(usId: string, answers: readonly string[], actor?: string): Promise<void>;
  submitApprovalAnswer(usId: string, question: string, answer: string, actor?: string): Promise<SubmitApprovalAnswerResult>;
  operateCurrentPhaseArtifact(
    usId: string,
    prompt: string,
    actor?: string,
    includeReviewArtifactInContext?: boolean
  ): Promise<OperateCurrentPhaseArtifactResult>;
  isBusy(): boolean;
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
  private stderrRemainder = "";
  private writeQueue: Promise<void> = Promise.resolve();
  private nextRequestId = 1;
  private initialized = false;
  private initializationPromise: Promise<void> | null = null;
  private disposed = false;

  public constructor(workspaceRoot: string, hostRoot: string, settings: SpecForgeSettings) {
    this.workspaceRoot = workspaceRoot;
    const launchConfig = resolveMcpServerLaunchConfig(hostRoot);
    appendSpecForgeLog(
      `Starting MCP backend for '${path.basename(workspaceRoot)}' using ${launchConfig.source} server '${launchConfig.targetPath}'.`
    );
    this.process = spawn(
      launchConfig.command,
      [...launchConfig.args],
      {
        cwd: launchConfig.cwd,
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
      this.handleStderrChunk(chunk.toString("utf8"));
    });

    this.process.on("exit", (code, signal) => {
      this.flushPendingStderr();
      appendSpecForgeLog(`MCP backend exited with code ${code ?? "null"} and signal ${signal ?? "null"}.`);
      if (!this.disposed) {
        this.rejectPendingRequests("SpecForge MCP backend exited while a request was in progress.");
      }
    });
  }

  public async listUserStories(): Promise<readonly UserStorySummary[]> {
    appendSpecForgeLog(`Listing user stories for workspace '${this.workspaceRoot}'.`);
    const result = await this.callTool<{ items: UserStorySummary[] }>("list_user_stories", {
      workspaceRoot: this.workspaceRoot
    });
    appendSpecForgeLog(
      `list_user_stories returned ${result.items.length} item(s) for '${this.workspaceRoot}': ${result.items.map((item) => `${item.usId}@${item.category}`).join(", ") || "none"}.`
    );
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

  public async getUserStoryRuntimeStatus(usId: string): Promise<UserStoryRuntimeStatus> {
    return this.callTool<UserStoryRuntimeStatus>("get_user_story_runtime_status", {
      workspaceRoot: this.workspaceRoot,
      usId
    });
  }

  public async analyzeUserStoryLineage(usId: string): Promise<WorkflowLineageAnalysisResult> {
    return this.callTool<WorkflowLineageAnalysisResult>("analyze_user_story_lineage", {
      workspaceRoot: this.workspaceRoot,
      usId
    });
  }

  public async repairUserStoryLineage(usId: string, actor?: string): Promise<WorkflowLineageRepairResult> {
    return this.callTool<WorkflowLineageRepairResult>("repair_user_story_lineage", {
      workspaceRoot: this.workspaceRoot,
      usId,
      ...(actor && actor.trim().length > 0 ? { actor } : {})
    });
  }

  public async createUserStory(usId: string, title: string, kind: string, category: string, sourceText: string, actor?: string): Promise<CreateOrImportUserStoryResult> {
    return this.callTool<CreateOrImportUserStoryResult>("create_us_from_chat", {
      workspaceRoot: this.workspaceRoot,
      usId,
      title,
      kind,
      category,
      sourceText,
      ...(actor && actor.trim().length > 0 ? { actor } : {})
    });
  }

  public async importUserStory(usId: string, sourcePath: string, title: string, kind: string, category: string, actor?: string): Promise<CreateOrImportUserStoryResult> {
    return this.callTool<CreateOrImportUserStoryResult>("import_us_from_markdown", {
      workspaceRoot: this.workspaceRoot,
      usId,
      sourcePath,
      title,
      kind,
      category,
      ...(actor && actor.trim().length > 0 ? { actor } : {})
    });
  }

  public async initializeRepoPrompts(overwrite = false): Promise<InitializeRepoPromptsResult> {
    return this.callTool<InitializeRepoPromptsResult>("initialize_repo_prompts", {
      workspaceRoot: this.workspaceRoot,
      overwrite
    });
  }

  public async exportPromptTemplate(promptPath: string, overwrite = false): Promise<InitializeRepoPromptsResult> {
    return this.callTool<InitializeRepoPromptsResult>("export_prompt_template", {
      workspaceRoot: this.workspaceRoot,
      promptPath,
      overwrite
    });
  }

  public async continuePhase(usId: string, actor?: string): Promise<ContinuePhaseResult> {
    return this.callTool<ContinuePhaseResult>("generate_next_phase", {
      workspaceRoot: this.workspaceRoot,
      usId,
      ...(actor && actor.trim().length > 0 ? { actor } : {})
    });
  }

  public async approveReviewAnyway(usId: string, reason: string, actor?: string): Promise<ContinuePhaseResult> {
    return this.callTool<ContinuePhaseResult>("approve_review_anyway", {
      workspaceRoot: this.workspaceRoot,
      usId,
      reason,
      ...(actor && actor.trim().length > 0 ? { actor } : {})
    });
  }

  public async approveCurrentPhase(usId: string, baseBranch?: string, workBranch?: string, actor?: string): Promise<UserStorySummary> {
    return this.callTool<UserStorySummary>(
      "approve_phase",
      buildApprovePhaseArguments(this.workspaceRoot, usId, baseBranch, workBranch, actor)
    );
  }

  public async requestRegression(usId: string, targetPhase: string, reason?: string, actor?: string, destructive?: boolean): Promise<RequestRegressionResult> {
    return this.callTool<RequestRegressionResult>(
      "request_regression",
      buildRequestRegressionArguments(this.workspaceRoot, usId, targetPhase, reason, actor, destructive)
    );
  }

  public async reopenCompletedWorkflow(usId: string, reasonKind: string, description: string, actor?: string): Promise<RequestRegressionResult> {
    return this.callTool<RequestRegressionResult>(
      "reopen_completed_workflow",
      buildReopenCompletedWorkflowArguments(this.workspaceRoot, usId, reasonKind, description, actor)
    );
  }

  public async restartUserStoryFromSource(usId: string, reason?: string, actor?: string): Promise<RestartUserStoryResult> {
    return this.callTool<RestartUserStoryResult>(
      "restart_user_story_from_source",
      buildRestartUserStoryArguments(this.workspaceRoot, usId, reason, actor)
    );
  }

  public async rewindWorkflow(usId: string, targetPhase: string, actor?: string, destructive?: boolean): Promise<RewindWorkflowResult> {
    return this.callTool<RewindWorkflowResult>(
      "rewind_workflow",
      buildRewindWorkflowArguments(this.workspaceRoot, usId, targetPhase, actor, destructive)
    );
  }

  public async resetUserStoryToCapture(usId: string): Promise<ResetUserStoryResult> {
    return this.callTool<ResetUserStoryResult>("reset_user_story_to_capture", {
      workspaceRoot: this.workspaceRoot,
      usId
    });
  }

  public async submitRefinementAnswers(usId: string, answers: readonly string[], actor?: string): Promise<void> {
    await this.callTool<void>("submit_refinement_answers", {
      workspaceRoot: this.workspaceRoot,
      usId,
      answers,
      ...(actor && actor.trim().length > 0 ? { actor } : {})
    });
  }

  public async submitApprovalAnswer(usId: string, question: string, answer: string, actor?: string): Promise<SubmitApprovalAnswerResult> {
    return this.callTool<SubmitApprovalAnswerResult>("submit_approval_answer", {
      workspaceRoot: this.workspaceRoot,
      usId,
      question,
      answer,
      ...(actor && actor.trim().length > 0 ? { actor } : {})
    });
  }

  public async operateCurrentPhaseArtifact(
    usId: string,
    prompt: string,
    actor?: string,
    includeReviewArtifactInContext?: boolean
  ): Promise<OperateCurrentPhaseArtifactResult> {
    return this.callTool<OperateCurrentPhaseArtifactResult>("operate_current_phase_artifact", {
      workspaceRoot: this.workspaceRoot,
      usId,
      prompt,
      ...(actor && actor.trim().length > 0 ? { actor } : {}),
      ...(includeReviewArtifactInContext === false ? { includeReviewArtifactInContext: false } : {})
    });
  }

  public isBusy(): boolean {
    return this.pending.size > 0 || this.initializationPromise !== null;
  }

  public cancelActiveOperations(): void {
    this.dispose();
  }

  public dispose(): void {
    if (this.disposed) {
      return;
    }

    this.disposed = true;
    this.flushPendingStderr();
    appendSpecForgeLog("Disposing MCP backend client.");
    this.rejectPendingRequests("SpecForge MCP backend was stopped.");
    this.process.kill();
  }

  private async ensureInitializedAsync(): Promise<void> {
    if (this.initialized) {
      return;
    }

    if (this.initializationPromise) {
      appendSpecForgeDebugLog("Awaiting in-flight MCP session initialization.");
      await this.initializationPromise;
      return;
    }

    this.initializationPromise = (async () => {
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
    })();

    try {
      await this.initializationPromise;
    } finally {
      this.initializationPromise = null;
    }
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
      this.pending.set(id, { method, resolve, reject });
    });

    appendSpecForgeDebugLog(
      `MCP request queued. id=${id}, method='${method}', pending=${this.pending.size}, bytes=${Buffer.byteLength(JSON.stringify(payload), "utf8")}.`
    );

    await this.writePayloadAsync(JSON.stringify(payload));
    return resultPromise;
  }

  private async writePayloadAsync(json: string): Promise<void> {
    const payload = Buffer.from(json, "utf8");
    const header = Buffer.from(`Content-Length: ${payload.length}\r\n\r\n`, "ascii");
    const writeOperation = this.writeQueue.then(async () => {
      await writeAsync(this.process.stdin, header);
      await writeAsync(this.process.stdin, payload);
    });

    this.writeQueue = writeOperation.catch(() => undefined);
    await writeOperation;
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
      const message = JSON.parse(body) as McpResponse;
      this.handleMessage(message);
      buffer = buffer.subarray(bodyStart + contentLength);
    }
  }

  private handleMessage(message: McpResponse): void {
    appendSpecForgeDebugLog(
      `MCP message received. id=${typeof message.id === "number" ? message.id : "n/a"}, hasResult=${message.result !== undefined}, hasError=${message.error !== undefined}.`
    );

    if (typeof message.id !== "number") {
      return;
    }

    const pending = this.pending.get(message.id);
    if (!pending) {
      appendSpecForgeDebugLog(`MCP response ignored because no pending request matched id=${message.id}.`);
      return;
    }

    this.pending.delete(message.id);

    if (message.error) {
      appendSpecForgeDebugLog(
        `MCP request failed. id=${message.id}, method='${pending.method}', pending=${this.pending.size}, error='${message.error.message}'.`
      );
      pending.reject(new Error(message.error.message));
      return;
    }

    appendSpecForgeDebugLog(
      `MCP request resolved. id=${message.id}, method='${pending.method}', pending=${this.pending.size}.`
    );
    pending.resolve(message.result);
  }

  private rejectPendingRequests(message: string): void {
    appendSpecForgeDebugLog(`Rejecting ${this.pending.size} pending MCP request(s). reason='${message}'.`);
    for (const request of this.pending.values()) {
      request.reject(new Error(message));
    }

    this.pending.clear();
  }

  private handleStderrChunk(chunk: string): void {
    if (!chunk) {
      return;
    }

    this.stderrRemainder += chunk;
    const lines = this.stderrRemainder.split(/\r?\n/);
    this.stderrRemainder = lines.pop() ?? "";

    for (const line of lines) {
      this.logStderrLine(line);
    }
  }

  private flushPendingStderr(): void {
    if (!this.stderrRemainder.trim()) {
      this.stderrRemainder = "";
      return;
    }

    this.logStderrLine(this.stderrRemainder);
    this.stderrRemainder = "";
  }

  private logStderrLine(line: string): void {
    const message = line.trim();
    if (!message) {
      return;
    }

    const summarized = summarizeMcpDiagnosticLine(message);
    const modelResponse = parseModelResponseDiagnosticLine(message);
    if (modelResponse) {
      notifyModelResponseDiagnostic(modelResponse);
    }

    if (summarized) {
      appendSpecForgeLog(summarized);
      appendSpecForgeDebugLog(`MCP stderr: ${message}`);
      appendSpecForgeDebugLog("MCP stderr was summarized without rejecting pending requests.");
      return;
    }

    appendSpecForgeLog(`MCP stderr: ${message}`);
    appendSpecForgeDebugLog("MCP stderr was logged without rejecting pending requests.");
  }
}

interface PendingRequest {
  readonly method: string;
  readonly resolve: (value: any) => void;
  readonly reject: (reason?: unknown) => void;
}

interface McpResponse {
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
