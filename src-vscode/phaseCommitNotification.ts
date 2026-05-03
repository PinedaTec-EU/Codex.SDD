import type { PhaseCommitResult } from "./backendClient";

export interface PhaseCommitNotification {
  readonly shortSha: string;
  readonly logMessage: string;
  readonly userMessage: string;
}

export function buildPhaseCommitNotification(
  usId: string,
  commit?: PhaseCommitResult | null
): PhaseCommitNotification | null {
  if (!commit?.commitCreated || !commit.commitSha) {
    return null;
  }

  const shortSha = commit.commitSha.slice(0, 12);
  return {
    shortSha,
    logMessage: `Workflow '${usId}' created git commit ${shortSha}: ${commit.message ?? "(no message)"}. Files: ${commit.stagedPaths.length}.`,
    userMessage: `${usId} phase commit created: ${shortSha}`
  };
}
