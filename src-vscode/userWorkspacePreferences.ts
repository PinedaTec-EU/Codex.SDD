import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

export interface UserWorkspacePreferences {
  readonly starredUserStoryId: string | null;
}

const defaultPreferences: UserWorkspacePreferences = {
  starredUserStoryId: null
};

export async function readUserWorkspacePreferences(workspaceRoot: string): Promise<UserWorkspacePreferences> {
  const filePath = getUserWorkspacePreferencesPath(workspaceRoot);

  try {
    const raw = await fs.promises.readFile(filePath, "utf8");
    const parsed = JSON.parse(raw);
    return {
      starredUserStoryId: typeof parsed?.starredUserStoryId === "string" && parsed.starredUserStoryId.trim().length > 0
        ? parsed.starredUserStoryId.trim()
        : null
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
  await writeUserWorkspacePreferences(workspaceRoot, {
    starredUserStoryId: usId?.trim() || null
  });
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
