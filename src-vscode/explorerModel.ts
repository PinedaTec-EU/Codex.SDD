import type { UserStorySummary } from "./backendClient";

export const DEFAULT_USER_STORY_CATEGORIES = [
  "workflow",
  "ux",
  "prompts",
  "mcp",
  "providers",
  "branching",
  "review",
  "integrations",
  "infra"
] as const;

export function normalizeCategory(category: string | null | undefined): string {
  const normalized = category?.trim().toLowerCase();
  return normalized && normalized.length > 0 ? normalized : "uncategorized";
}

export function compareUserStories(left: UserStorySummary, right: UserStorySummary): number {
  return left.usId.localeCompare(right.usId);
}

export function parseYamlSequence(yaml: string, key: string): string[] {
  const lines = yaml.replace(/\r\n/g, "\n").split("\n");
  const result: string[] = [];
  let insideSection = false;

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();

    if (!insideSection) {
      if (line === `${key}:`) {
        insideSection = true;
      }

      continue;
    }

    if (!line) {
      continue;
    }

    if (!/^\s/.test(rawLine)) {
      break;
    }

    const trimmed = line.trim();
    if (!trimmed.startsWith("- ")) {
      continue;
    }

    const value = trimmed.slice(2).trim().toLowerCase();
    if (value) {
      result.push(value);
    }
  }

  return [...new Set(result)].sort((left, right) => left.localeCompare(right));
}

export function nextUserStoryIdFromSummaries(summaries: readonly UserStorySummary[]): string {
  const maxValue = summaries
    .map((summary) => /^US-(\d+)$/.exec(summary.usId))
    .filter((match): match is RegExpExecArray => match !== null)
    .map((match) => Number.parseInt(match[1], 10))
    .reduce((currentMax, value) => Math.max(currentMax, value), 0);

  return `US-${String(maxValue + 1).padStart(4, "0")}`;
}
