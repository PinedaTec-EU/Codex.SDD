import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

export interface UserWorkspacePreferences {
  readonly starredUserStoryId: string | null;
  readonly pausedWorkflowPhaseIdsByUsId: Record<string, readonly string[]>;
}

const defaultPreferences: UserWorkspacePreferences = {
  starredUserStoryId: null,
  pausedWorkflowPhaseIdsByUsId: {}
};

export async function readUserWorkspacePreferences(workspaceRoot: string): Promise<UserWorkspacePreferences> {
  const filePath = getUserWorkspacePreferencesPath(workspaceRoot);

  try {
    const raw = await fs.promises.readFile(filePath, "utf8");
    const parsed = JSON.parse(raw);
    return {
      starredUserStoryId: typeof parsed?.starredUserStoryId === "string" && parsed.starredUserStoryId.trim().length > 0
        ? parsed.starredUserStoryId.trim()
        : null,
      pausedWorkflowPhaseIdsByUsId: normalizePausedWorkflowPhaseIdsByUsId(parsed?.pausedWorkflowPhaseIdsByUsId)
    };
  } catch {
    return defaultPreferences;
  }
}

export async function writeUserWorkspacePreferences(
  workspaceRoot: string,
  preferences: UserWorkspacePreferences
): Promise<void> {
  const filePath = getUserWorkspacePreferencesPath(workspaceRoot);
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
  await fs.promises.writeFile(filePath, `${JSON.stringify(preferences, null, 2)}\n`, "utf8");
}

export async function setStarredUserStory(workspaceRoot: string, usId: string | null): Promise<void> {
  const preferences = await readUserWorkspacePreferences(workspaceRoot);
  await writeUserWorkspacePreferences(workspaceRoot, {
    ...preferences,
    starredUserStoryId: usId?.trim() || null
  });
}

export async function setPausedWorkflowPhaseIds(
  workspaceRoot: string,
  usId: string,
  phaseIds: readonly string[]
): Promise<void> {
  const preferences = await readUserWorkspacePreferences(workspaceRoot);
  const normalizedUsId = usId.trim();
  if (!normalizedUsId) {
    return;
  }

  const nextPausedWorkflowPhaseIdsByUsId = {
    ...preferences.pausedWorkflowPhaseIdsByUsId
  };
  const normalizedPhaseIds = [...new Set(
    phaseIds
      .map((phaseId) => phaseId.trim())
      .filter((phaseId) => phaseId.length > 0)
  )];

  if (normalizedPhaseIds.length > 0) {
    nextPausedWorkflowPhaseIdsByUsId[normalizedUsId] = normalizedPhaseIds;
  } else {
    delete nextPausedWorkflowPhaseIdsByUsId[normalizedUsId];
  }

  await writeUserWorkspacePreferences(workspaceRoot, {
    ...preferences,
    pausedWorkflowPhaseIdsByUsId: nextPausedWorkflowPhaseIdsByUsId
  });
}

function normalizePausedWorkflowPhaseIdsByUsId(value: unknown): Record<string, readonly string[]> {
  if (!value || typeof value !== "object") {
    return {};
  }

  const result: Record<string, readonly string[]> = {};
  for (const [usId, phaseIds] of Object.entries(value)) {
    if (typeof usId !== "string" || !Array.isArray(phaseIds)) {
      continue;
    }

    const normalizedUsId = usId.trim();
    const normalizedPhaseIds = [...new Set(
      phaseIds
        .filter((phaseId): phaseId is string => typeof phaseId === "string")
        .map((phaseId) => phaseId.trim())
        .filter((phaseId) => phaseId.length > 0)
    )];
    if (!normalizedUsId || normalizedPhaseIds.length === 0) {
      continue;
    }

    result[normalizedUsId] = normalizedPhaseIds;
  }

  return result;
}

export function getUserWorkspacePreferencesPath(workspaceRoot: string): string {
  return path.join(workspaceRoot, ".specs", "users", normalizeUserSegment(os.userInfo().username), "vscode-preferences.json");
}

function normalizeUserSegment(userName: string): string {
  return userName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    || "unknown-user";
}
