"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.suggestContextFiles = suggestContextFiles;
const fs = __importStar(require("node:fs"));
const path = __importStar(require("node:path"));
const ignoredDirectoryNames = new Set([
    ".git",
    ".specs",
    "node_modules",
    "bin",
    "obj",
    "dist",
    "dist-tests",
    ".next",
    ".turbo",
    ".yarn",
    ".pnpm-store"
]);
const allowedExtensions = new Set([
    ".cs",
    ".csproj",
    ".fs",
    ".fsproj",
    ".js",
    ".jsx",
    ".json",
    ".jsonc",
    ".md",
    ".mjs",
    ".mts",
    ".props",
    ".py",
    ".rb",
    ".sln",
    ".slnx",
    ".sql",
    ".swift",
    ".targets",
    ".ts",
    ".tsx",
    ".txt",
    ".xml",
    ".yaml",
    ".yml"
]);
const stopWords = new Set([
    "able",
    "about",
    "after",
    "against",
    "also",
    "another",
    "before",
    "being",
    "between",
    "build",
    "could",
    "does",
    "from",
    "have",
    "into",
    "just",
    "more",
    "need",
    "only",
    "over",
    "repo",
    "same",
    "should",
    "that",
    "them",
    "then",
    "there",
    "these",
    "this",
    "for",
    "user",
    "using",
    "want",
    "when",
    "with",
    "workflow",
    "story"
]);
async function suggestContextFiles(workspaceRoot, workflow, sourceText) {
    const candidates = await collectWorkspaceCandidatesAsync(workspaceRoot);
    const alreadyAttached = new Set([
        ...(workflow.contextFiles ?? []).map((file) => path.normalize(file.path)),
        ...workflow.attachments.map((file) => path.normalize(file.path))
    ]);
    const tokens = buildQueryTokens(workflow, sourceText);
    const heuristicSuggestions = scoreHeuristicSuggestions(candidates, tokens, alreadyAttached);
    const neighborhoodSuggestions = buildNeighborhoodSuggestions(candidates, heuristicSuggestions, alreadyAttached);
    return [...heuristicSuggestions, ...neighborhoodSuggestions]
        .sort((left, right) => right.score - left.score || left.relativePath.localeCompare(right.relativePath))
        .slice(0, 8);
}
function buildQueryTokens(workflow, sourceText) {
    const text = [
        workflow.title,
        workflow.category,
        workflow.currentPhase,
        workflow.status,
        workflow.clarification?.reason ?? "",
        ...((workflow.clarification?.items ?? []).map((item) => item.question)),
        sourceText
    ].join(" ");
    const normalizedTokens = text
        .toLowerCase()
        .replace(/[^a-z0-9/._-]+/g, " ")
        .split(/\s+/)
        .flatMap((token) => token.split(/[./_-]+/))
        .map((token) => token.trim())
        .filter((token) => token.length >= 3 && !stopWords.has(token));
    return Array.from(new Set(normalizedTokens));
}
async function collectWorkspaceCandidatesAsync(workspaceRoot) {
    const files = [];
    await walkDirectoryAsync(workspaceRoot, workspaceRoot, files);
    return files;
}
async function walkDirectoryAsync(workspaceRoot, directoryPath, files) {
    const entries = await fs.promises.readdir(directoryPath, { withFileTypes: true });
    for (const entry of entries) {
        if (ignoredDirectoryNames.has(entry.name)) {
            continue;
        }
        const entryPath = path.join(directoryPath, entry.name);
        if (entry.isDirectory()) {
            await walkDirectoryAsync(workspaceRoot, entryPath, files);
            continue;
        }
        if (!entry.isFile()) {
            continue;
        }
        const extension = path.extname(entry.name).toLowerCase();
        if (extension.length > 0 && !allowedExtensions.has(extension)) {
            continue;
        }
        const relativePath = normalizeRelativePath(path.relative(workspaceRoot, entryPath));
        if (!relativePath || relativePath.startsWith(".specs/")) {
            continue;
        }
        files.push({
            absolutePath: entryPath,
            relativePath,
            lowercasePath: relativePath.toLowerCase(),
            lowercaseName: entry.name.toLowerCase(),
            extension
        });
    }
}
function scoreHeuristicSuggestions(candidates, tokens, alreadyAttached) {
    const matches = [];
    for (const candidate of candidates) {
        if (alreadyAttached.has(path.normalize(candidate.absolutePath))) {
            continue;
        }
        const score = scoreCandidate(candidate, tokens);
        if (score <= 0) {
            continue;
        }
        matches.push({
            path: candidate.absolutePath,
            relativePath: candidate.relativePath,
            source: "heuristic",
            score,
            reason: buildHeuristicReason(candidate, tokens)
        });
    }
    return matches
        .sort((left, right) => right.score - left.score || left.relativePath.localeCompare(right.relativePath))
        .slice(0, 5);
}
function scoreCandidate(candidate, tokens) {
    let score = 0;
    const tokenSet = new Set(tokens);
    for (const token of tokens) {
        if (candidate.lowercaseName.includes(token)) {
            score += 16;
            continue;
        }
        if (candidate.lowercasePath.includes(`/${token}`) || candidate.lowercasePath.includes(`${token}/`)) {
            score += 11;
            continue;
        }
        if (candidate.lowercasePath.includes(token)) {
            score += 6;
        }
    }
    if (tokenSet.has("test") || tokenSet.has("tests") || tokenSet.has("coverage")) {
        if (candidate.lowercasePath.includes("test")) {
            score += 18;
        }
    }
    if (tokenSet.has("prompt") || tokenSet.has("prompts")) {
        if (candidate.lowercasePath.includes("prompt")) {
            score += 16;
        }
    }
    if (tokenSet.has("workflow") || tokenSet.has("phase")) {
        if (candidate.lowercasePath.includes("workflow") || candidate.lowercasePath.includes("phase")) {
            score += 14;
        }
    }
    if (tokenSet.has("vscode") || tokenSet.has("extension") || tokenSet.has("sidebar") || tokenSet.has("panel")) {
        if (candidate.lowercasePath.startsWith("src-vscode/")) {
            score += 18;
        }
    }
    if (tokenSet.has("mcp") || tokenSet.has("server")) {
        if (candidate.lowercasePath.includes("mcp")) {
            score += 18;
        }
    }
    if (candidate.extension === ".md" || candidate.extension === ".json" || candidate.extension === ".yaml" || candidate.extension === ".yml") {
        score += 2;
    }
    return score;
}
function buildHeuristicReason(candidate, tokens) {
    const matchedTokens = tokens
        .filter((token) => candidate.lowercasePath.includes(token))
        .slice(0, 3);
    if (matchedTokens.length > 0) {
        return `Matches clarification keywords: ${matchedTokens.join(", ")}.`;
    }
    return "Matches the current user story wording and likely implementation area.";
}
function buildNeighborhoodSuggestions(candidates, heuristicSuggestions, alreadyAttached) {
    if (heuristicSuggestions.length === 0) {
        return [];
    }
    const byRelativePath = new Map(candidates.map((candidate) => [candidate.relativePath, candidate]));
    const seen = new Set(heuristicSuggestions.map((suggestion) => normalizeRelativePath(suggestion.relativePath)));
    const suggestions = [];
    for (const anchor of heuristicSuggestions.slice(0, 3)) {
        const anchorCandidate = byRelativePath.get(anchor.relativePath);
        if (!anchorCandidate) {
            continue;
        }
        for (const neighbor of collectSameDirectoryNeighbors(candidates, anchorCandidate)) {
            const normalizedRelativePath = normalizeRelativePath(neighbor.relativePath);
            if (seen.has(normalizedRelativePath) || alreadyAttached.has(path.normalize(neighbor.absolutePath))) {
                continue;
            }
            seen.add(normalizedRelativePath);
            suggestions.push({
                path: neighbor.absolutePath,
                relativePath: neighbor.relativePath,
                source: "neighborhood",
                score: Math.max(1, anchor.score - 6),
                reason: `Lives next to likely relevant file ${anchor.relativePath}.`
            });
        }
        for (const counterpart of collectCounterparts(candidates, anchorCandidate)) {
            const normalizedRelativePath = normalizeRelativePath(counterpart.relativePath);
            if (seen.has(normalizedRelativePath) || alreadyAttached.has(path.normalize(counterpart.absolutePath))) {
                continue;
            }
            seen.add(normalizedRelativePath);
            suggestions.push({
                path: counterpart.absolutePath,
                relativePath: counterpart.relativePath,
                source: "neighborhood",
                score: Math.max(1, anchor.score - 4),
                reason: `Looks like a source/test neighbor of ${anchor.relativePath}.`
            });
        }
    }
    return suggestions
        .sort((left, right) => right.score - left.score || left.relativePath.localeCompare(right.relativePath))
        .slice(0, 3);
}
function collectSameDirectoryNeighbors(candidates, anchor) {
    const directory = path.posix.dirname(anchor.relativePath);
    return candidates
        .filter((candidate) => candidate.relativePath !== anchor.relativePath && path.posix.dirname(candidate.relativePath) === directory)
        .sort((left, right) => left.relativePath.localeCompare(right.relativePath))
        .slice(0, 2);
}
function collectCounterparts(candidates, anchor) {
    const stem = anchor.lowercaseName.replace(/\.[^.]+$/, "").replace(/(\.tests?|\.spec|tests?)$/i, "");
    if (stem.length < 3) {
        return [];
    }
    const directory = path.posix.dirname(anchor.relativePath);
    return candidates.filter((candidate) => {
        if (candidate.relativePath === anchor.relativePath) {
            return false;
        }
        if (!candidate.lowercaseName.includes(stem)) {
            return false;
        }
        const candidateDirectory = path.posix.dirname(candidate.relativePath);
        const directoryPair = (directory.includes("/tests") && candidateDirectory.includes("/src"))
            || (directory.includes("/src") && candidateDirectory.includes("/tests"))
            || (directory.startsWith("tests") && candidateDirectory.startsWith("src"))
            || (directory.startsWith("src") && candidateDirectory.startsWith("tests"));
        return directoryPair;
    }).slice(0, 2);
}
function normalizeRelativePath(value) {
    return value.split(path.sep).join(path.posix.sep);
}
//# sourceMappingURL=contextSuggestions.js.map