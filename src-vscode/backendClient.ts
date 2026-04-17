import { execFile } from "node:child_process";
import * as path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

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

export interface SpecForgeBackendClient {
  listUserStories(): Promise<readonly UserStorySummary[]>;
  getUserStorySummary(usId: string): Promise<UserStorySummary>;
  createUserStory(usId: string, title: string, sourceText: string): Promise<CreateOrImportUserStoryResult>;
  importUserStory(usId: string, sourcePath: string, title: string): Promise<CreateOrImportUserStoryResult>;
  continuePhase(usId: string): Promise<ContinuePhaseResult>;
  approveCurrentPhase(usId: string, baseBranch?: string): Promise<UserStorySummary>;
}

export function createLocalCliBackendClient(workspaceRoot: string): SpecForgeBackendClient {
  return {
    listUserStories: async () => {
      const payload = await invokeRunner<{ items: UserStorySummary[] }>(workspaceRoot, [
        "list-user-stories",
        workspaceRoot
      ]);
      return payload.items;
    },
    getUserStorySummary: async (usId) => {
      return invokeRunner<UserStorySummary>(workspaceRoot, [
        "get-user-story-summary",
        workspaceRoot,
        usId
      ]);
    },
    createUserStory: async (usId, title, sourceText) => {
      return invokeRunner<CreateOrImportUserStoryResult>(workspaceRoot, [
        "create-us",
        workspaceRoot,
        usId,
        title,
        sourceText
      ]);
    },
    importUserStory: async (usId, sourcePath, title) => {
      return invokeRunner<CreateOrImportUserStoryResult>(workspaceRoot, [
        "import-us",
        workspaceRoot,
        usId,
        sourcePath,
        title
      ]);
    },
    continuePhase: async (usId) => {
      return invokeRunner<ContinuePhaseResult>(workspaceRoot, [
        "continue-phase",
        workspaceRoot,
        usId
      ]);
    },
    approveCurrentPhase: async (usId, baseBranch) => {
      return invokeRunner<UserStorySummary>(workspaceRoot, [
        "approve-phase",
        workspaceRoot,
        usId,
        baseBranch ?? "-"
      ]);
    }
  };
}

async function invokeRunner<T>(workspaceRoot: string, args: string[]): Promise<T> {
  const cliProjectPath = path.join(workspaceRoot, "src", "SpecForge.Runner.Cli", "SpecForge.Runner.Cli.csproj");
  const { stdout, stderr } = await execFileAsync(
    "dotnet",
    ["run", "--project", cliProjectPath, "--", ...args],
    {
      cwd: workspaceRoot,
      maxBuffer: 1024 * 1024
    }
  );

  if (stderr.trim().length > 0) {
    throw new Error(stderr.trim());
  }

  return JSON.parse(stdout) as T;
}
