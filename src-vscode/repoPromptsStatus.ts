import * as fs from "node:fs";
import * as path from "node:path";

export interface RepoPromptsStatus {
  readonly initialized: boolean;
  readonly message: string | null;
  readonly missingPaths: readonly string[];
  readonly checkedPaths: readonly string[];
}

export async function getRepoPromptsStatusAsync(workspaceRoot: string): Promise<RepoPromptsStatus> {
  const checkedPaths = [
    path.join(workspaceRoot, ".specs", "config.yaml"),
    path.join(workspaceRoot, ".specs", "prompts", "prompts.yaml"),
    path.join(workspaceRoot, ".specs", "prompts", "system-prompt-hashes.json"),
    path.join(workspaceRoot, ".specs", "prompts", "shared", "system.md"),
    path.join(workspaceRoot, ".specs", "prompts", "shared", "style.md"),
    path.join(workspaceRoot, ".specs", "prompts", "shared", "output-rules.md"),
    path.join(workspaceRoot, ".specs", "prompts", "phases", "refinement.execute.system.md"),
    path.join(workspaceRoot, ".specs", "prompts", "phases", "refinement.execute.md"),
    path.join(workspaceRoot, ".specs", "prompts", "phases", "spec.execute.system.md"),
    path.join(workspaceRoot, ".specs", "prompts", "phases", "spec.execute.md"),
    path.join(workspaceRoot, ".specs", "prompts", "phases", "spec.approve.system.md"),
    path.join(workspaceRoot, ".specs", "prompts", "phases", "spec.approve.md"),
    path.join(workspaceRoot, ".specs", "prompts", "phases", "technical-design.execute.system.md"),
    path.join(workspaceRoot, ".specs", "prompts", "phases", "technical-design.execute.md"),
    path.join(workspaceRoot, ".specs", "prompts", "phases", "implementation.execute.system.md"),
    path.join(workspaceRoot, ".specs", "prompts", "phases", "implementation.execute.md"),
    path.join(workspaceRoot, ".specs", "prompts", "phases", "review.execute.system.md"),
    path.join(workspaceRoot, ".specs", "prompts", "phases", "review.execute.md"),
    path.join(workspaceRoot, ".specs", "prompts", "phases", "release-approval.execute.system.md"),
    path.join(workspaceRoot, ".specs", "prompts", "phases", "release-approval.execute.md"),
    path.join(workspaceRoot, ".specs", "prompts", "phases", "release-approval.approve.system.md"),
    path.join(workspaceRoot, ".specs", "prompts", "phases", "release-approval.approve.md"),
    path.join(workspaceRoot, ".specs", "prompts", "phases", "pr-preparation.execute.system.md"),
    path.join(workspaceRoot, ".specs", "prompts", "phases", "pr-preparation.execute.md"),
    path.join(workspaceRoot, ".specs", "prompts", "phases", "refinement.auto-answer.system.md")
  ];

  const missingPaths: string[] = [];
  for (const checkedPath of checkedPaths) {
    if (!await pathExistsAsync(checkedPath)) {
      missingPaths.push(checkedPath);
    }
  }

  if (missingPaths.length === 0) {
    return {
      initialized: true,
      message: null,
      missingPaths: [],
      checkedPaths
    };
  }

  const missingPreview = missingPaths
    .slice(0, 3)
    .map((filePath) => path.relative(workspaceRoot, filePath) || filePath)
    .join(", ");
  const extraCount = missingPaths.length - Math.min(missingPaths.length, 3);

  return {
    initialized: false,
    message: `Missing ${missingPaths.length} required prompt file(s): ${missingPreview}${extraCount > 0 ? `, +${extraCount} more` : ""}.`,
    missingPaths,
    checkedPaths
  };
}

async function pathExistsAsync(filePath: string): Promise<boolean> {
  try {
    await fs.promises.access(filePath, fs.constants.F_OK);
    return true;
  } catch {
    return false;
  }
}
