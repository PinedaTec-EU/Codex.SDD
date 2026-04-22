import * as path from "node:path";
import * as vscode from "vscode";

export interface ReferencedWorkspaceFile {
  readonly sourcePath: string;
  readonly workspaceRelativePath: string;
  readonly name: string;
}

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

export async function findReferencedWorkspaceFilesAsync(
  workspaceRoot: string,
  sourceText: string,
  selectedSourcePaths: readonly string[] = []
): Promise<readonly ReferencedWorkspaceFile[]> {
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
  const exactRelative = new Map<string, vscode.Uri>();
  const lowerRelative = new Map<string, vscode.Uri>();
  const byBasename = new Map<string, vscode.Uri[]>();

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

  const matches = new Map<string, ReferencedWorkspaceFile>();
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

function appendMatch(
  workspaceRoot: string,
  fileUri: vscode.Uri,
  selectedPaths: ReadonlySet<string>,
  matches: Map<string, ReferencedWorkspaceFile>
): void {
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

function extractReferenceCandidates(sourceText: string): readonly string[] {
  if (sourceText.trim().length === 0) {
    return [];
  }

  const candidates = new Set<string>();
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

function sanitizeCandidate(candidate: string): string {
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

function looksLikeSupportedFile(candidate: string): boolean {
  const extension = path.extname(candidate).replace(/^\./, "").toLowerCase();
  return extension.length > 0 && supportedReferenceExtensions.has(extension);
}

function resolveCandidate(candidate: string, workspaceRoot: string): string {
  if (path.isAbsolute(candidate)) {
    const relativePath = path.relative(workspaceRoot, candidate);
    return normalizeReferencePath(relativePath);
  }

  return normalizeReferencePath(candidate);
}

function normalizeReferencePath(candidate: string): string {
  const normalized = path.posix.normalize(candidate.replace(/\\/g, "/"));
  return normalized.replace(/^\.\/+/, "").replace(/^\/+/, "");
}
