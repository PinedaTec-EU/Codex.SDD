import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

export type UserWorkflowGraphLayoutMode = "horizontal" | "vertical";

export interface UserWorkspacePreferences {
  readonly starredUserStoryId: string | null;
  readonly pausedWorkflowPhaseIdsByUsId: Record<string, readonly string[]>;
  readonly watcherEnabled: boolean;
  readonly attentionNotificationsEnabled: boolean;
  readonly contextSuggestionsEnabled: boolean;
  readonly workflowGraphLayoutMode: UserWorkflowGraphLayoutMode;
}

const defaultPreferences: UserWorkspacePreferences = {
  starredUserStoryId: null,
  pausedWorkflowPhaseIdsByUsId: {},
  watcherEnabled: true,
  attentionNotificationsEnabled: true,
  contextSuggestionsEnabled: true,
  workflowGraphLayoutMode: "vertical"
};

export async function readUserWorkspacePreferences(
  workspaceRoot: string,
  fallbacks?: Partial<UserWorkspacePreferences>
): Promise<UserWorkspacePreferences> {
  const filePath = getUserWorkspacePreferencesPath(workspaceRoot);

  try {
    const raw = await fs.promises.readFile(filePath, "utf8");
    const parsed = JSON.parse(raw);
    return {
      starredUserStoryId: typeof parsed?.starredUserStoryId === "string" && parsed.starredUserStoryId.trim().length > 0
        ? parsed.starredUserStoryId.trim()
        : null,
      pausedWorkflowPhaseIdsByUsId: normalizePausedWorkflowPhaseIdsByUsId(parsed?.pausedWorkflowPhaseIdsByUsId),
      watcherEnabled: normalizeBooleanPreference(parsed, "watcherEnabled", fallbacks?.watcherEnabled ?? defaultPreferences.watcherEnabled),
      attentionNotificationsEnabled: normalizeBooleanPreference(
        parsed,
        "attentionNotificationsEnabled",
        fallbacks?.attentionNotificationsEnabled ?? defaultPreferences.attentionNotificationsEnabled
      ),
      contextSuggestionsEnabled: normalizeBooleanPreference(
        parsed,
        "contextSuggestionsEnabled",
        fallbacks?.contextSuggestionsEnabled ?? defaultPreferences.contextSuggestionsEnabled
      ),
      workflowGraphLayoutMode: normalizeWorkflowGraphLayoutMode(
        parsed?.workflowGraphLayoutMode,
        fallbacks?.workflowGraphLayoutMode ?? defaultPreferences.workflowGraphLayoutMode
      )
    };
  } catch {
    return {
      ...defaultPreferences,
      ...fallbacks
    };
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

export async function setUserWorkspaceUiPreferences(
  workspaceRoot: string,
  updates: Partial<Pick<
    UserWorkspacePreferences,
    "watcherEnabled" | "attentionNotificationsEnabled" | "contextSuggestionsEnabled" | "workflowGraphLayoutMode"
  >>
): Promise<void> {
  const preferences = await readUserWorkspacePreferences(workspaceRoot);
  await writeUserWorkspacePreferences(workspaceRoot, {
    ...preferences,
    watcherEnabled: typeof updates.watcherEnabled === "boolean"
      ? updates.watcherEnabled
      : preferences.watcherEnabled,
    attentionNotificationsEnabled: typeof updates.attentionNotificationsEnabled === "boolean"
      ? updates.attentionNotificationsEnabled
      : preferences.attentionNotificationsEnabled,
    contextSuggestionsEnabled: typeof updates.contextSuggestionsEnabled === "boolean"
      ? updates.contextSuggestionsEnabled
      : preferences.contextSuggestionsEnabled,
    workflowGraphLayoutMode: normalizeWorkflowGraphLayoutMode(
      updates.workflowGraphLayoutMode,
      preferences.workflowGraphLayoutMode
    )
  });
}

export async function setWorkflowGraphLayoutMode(
  workspaceRoot: string,
  mode: UserWorkflowGraphLayoutMode
): Promise<void> {
  await setUserWorkspaceUiPreferences(workspaceRoot, {
    workflowGraphLayoutMode: mode
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

function normalizeBooleanPreference(
  parsed: Record<string, unknown> | null | undefined,
  key: string,
  fallback: boolean
): boolean {
  return typeof parsed?.[key] === "boolean" ? parsed[key] as boolean : fallback;
}

function normalizeWorkflowGraphLayoutMode(value: unknown, fallback: UserWorkflowGraphLayoutMode): UserWorkflowGraphLayoutMode {
  return value === "horizontal" || value === "vertical"
    ? value
    : fallback;
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
