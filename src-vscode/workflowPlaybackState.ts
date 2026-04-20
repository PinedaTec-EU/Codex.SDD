export type WorkflowPlaybackState = "idle" | "playing" | "paused" | "stopping";

export function normalizePlaybackStateAfterManualWorkflowChange(
  playbackState: WorkflowPlaybackState
): "idle" | "playing" {
  return playbackState === "playing" ? "playing" : "idle";
}
