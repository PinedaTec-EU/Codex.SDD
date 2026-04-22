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
exports.findReferencedWorkspaceFilesAsync = findReferencedWorkspaceFilesAsync;
const path = __importStar(require("node:path"));
const vscode = __importStar(require("vscode"));
const workspaceFileExcludeGlob = "**/{.git,.specs,node_modules,dist,dist-tests,out,coverage}/**";
const supportedReferenceExtensions = new Set([
    "cjs",
    "config",
    "cs",
    "css",
    "cts",
    "env",
    "gif",
    "graphql",
    "h",
    "html",
    "ico",
    "jpeg",
    "jpg",
    "js",
    "json",
    "jsx",
    "kt",
    "less",
    "md",
    "mjs",
    "png",
    "prompt",
    "ps1",
    "py",
    "scss",
    "sh",
    "sql",
    "svg",
    "toml",
    "ts",
    "tsx",
    "txt",
    "xml",
    "yaml",
    "yml"
]);
async function findReferencedWorkspaceFilesAsync(workspaceRoot, sourceText, selectedSourcePaths = []) {
    const candidates = extractReferenceCandidates(sourceText);
    if (candidates.length === 0) {
        return [];
    }
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(workspaceRoot));
    if (!workspaceFolder) {
        return [];
    }
    const workspaceFiles = await vscode.workspace.findFiles("**/*", workspaceFileExcludeGlob, 3000);
    const selectedPaths = new Set(selectedSourcePaths.map((entry) => path.normalize(entry)));
    const exactRelative = new Map();
    const lowerRelative = new Map();
    const byBasename = new Map();
    for (const fileUri of workspaceFiles) {
        const relativePath = normalizeReferencePath(path.relative(workspaceRoot, fileUri.fsPath));
        if (!relativePath) {
            continue;
        }
        exactRelative.set(relativePath, fileUri);
        lowerRelative.set(relativePath.toLowerCase(), fileUri);
        const fileName = path.basename(relativePath).toLowerCase();
        const bucket = byBasename.get(fileName) ?? [];
        bucket.push(fileUri);
        byBasename.set(fileName, bucket);
    }
    const matches = new Map();
    for (const candidate of candidates) {
        const candidatePath = resolveCandidate(candidate, workspaceRoot);
        const exactMatch = exactRelative.get(candidatePath) ?? lowerRelative.get(candidatePath.toLowerCase());
        if (exactMatch) {
            appendMatch(workspaceRoot, exactMatch, selectedPaths, matches);
            continue;
        }
        if (!candidatePath.includes("/")) {
            const basenameMatches = byBasename.get(candidatePath.toLowerCase()) ?? [];
            if (basenameMatches.length === 1) {
                appendMatch(workspaceRoot, basenameMatches[0], selectedPaths, matches);
            }
        }
    }
    return [...matches.values()]
        .sort((left, right) => left.workspaceRelativePath.localeCompare(right.workspaceRelativePath))
        .slice(0, 12);
}
function appendMatch(workspaceRoot, fileUri, selectedPaths, matches) {
    const normalizedSourcePath = path.normalize(fileUri.fsPath);
    if (selectedPaths.has(normalizedSourcePath)) {
        return;
    }
    const workspaceRelativePath = normalizeReferencePath(path.relative(workspaceRoot, fileUri.fsPath));
    matches.set(normalizedSourcePath, {
        sourcePath: normalizedSourcePath,
        workspaceRelativePath,
        name: path.basename(normalizedSourcePath)
    });
}
function extractReferenceCandidates(sourceText) {
    if (sourceText.trim().length === 0) {
        return [];
    }
    const candidates = new Set();
    const patterns = [
        /`([^`\r\n]+)`/g,
        /\[[^\]]+\]\(([^)\r\n]+)\)/g,
        /["']([^"'`\r\n]+?\.[A-Za-z0-9_-]{1,12})["']/g,
        /\b(?:\.{1,2}\/)?(?:[\w.-]+\/)+[\w./-]+\.[A-Za-z0-9_-]{1,12}\b/g,
        /\b[\w.-]+\.[A-Za-z0-9_-]{1,12}\b/g
    ];
    for (const pattern of patterns) {
        for (const match of sourceText.matchAll(pattern)) {
            const rawCandidate = typeof match[1] === "string" ? match[1] : match[0];
            const candidate = sanitizeCandidate(rawCandidate);
            if (!candidate || !looksLikeSupportedFile(candidate)) {
                continue;
            }
            candidates.add(candidate);
        }
    }
    return [...candidates];
}
function sanitizeCandidate(candidate) {
    const trimmed = candidate
        .trim()
        .replace(/^file:(\/\/)?/i, "")
        .replace(/^[<(]+/, "")
        .replace(/[)>:;,.]+$/, "")
        .replace(/\\/g, "/");
    if (trimmed.length === 0 || /^[a-z]+:\/\//i.test(trimmed) || trimmed.includes("*")) {
        return "";
    }
    return normalizeReferencePath(trimmed);
}
function looksLikeSupportedFile(candidate) {
    const extension = path.extname(candidate).replace(/^\./, "").toLowerCase();
    return extension.length > 0 && supportedReferenceExtensions.has(extension);
}
function resolveCandidate(candidate, workspaceRoot) {
    if (path.isAbsolute(candidate)) {
        const relativePath = path.relative(workspaceRoot, candidate);
        return normalizeReferencePath(relativePath);
    }
    return normalizeReferencePath(candidate);
}
function normalizeReferencePath(candidate) {
    const normalized = path.posix.normalize(candidate.replace(/\\/g, "/"));
    return normalized.replace(/^\.\/+/, "").replace(/^\/+/, "");
}
//# sourceMappingURL=sourceFileReferences.js.map