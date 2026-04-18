"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_USER_STORY_CATEGORIES = void 0;
exports.normalizeCategory = normalizeCategory;
exports.compareUserStories = compareUserStories;
exports.parseYamlSequence = parseYamlSequence;
exports.nextUserStoryIdFromSummaries = nextUserStoryIdFromSummaries;
exports.groupUserStoriesByCategory = groupUserStoriesByCategory;
exports.DEFAULT_USER_STORY_CATEGORIES = [
    "workflow",
    "ux",
    "prompts",
    "mcp",
    "providers",
    "branching",
    "review",
    "integrations",
    "infra"
];
function normalizeCategory(category) {
    const normalized = category?.trim().toLowerCase();
    return normalized && normalized.length > 0 ? normalized : "uncategorized";
}
function compareUserStories(left, right) {
    return left.usId.localeCompare(right.usId);
}
function parseYamlSequence(yaml, key) {
    const lines = yaml.replace(/\r\n/g, "\n").split("\n");
    const result = [];
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
function nextUserStoryIdFromSummaries(summaries) {
    const maxValue = summaries
        .map((summary) => /^US-(\d+)$/.exec(summary.usId))
        .filter((match) => match !== null)
        .map((match) => Number.parseInt(match[1], 10))
        .reduce((currentMax, value) => Math.max(currentMax, value), 0);
    return `US-${String(maxValue + 1).padStart(4, "0")}`;
}
function groupUserStoriesByCategory(summaries) {
    const grouped = new Map();
    for (const summary of summaries) {
        const category = normalizeCategory(summary.category);
        const bucket = grouped.get(category);
        if (bucket) {
            bucket.push(summary);
        }
        else {
            grouped.set(category, [summary]);
        }
    }
    return [...grouped.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([category, items]) => ({
        category,
        summaries: [...items].sort(compareUserStories)
    }));
}
//# sourceMappingURL=explorerModel.js.map