import test from "node:test";
import assert from "node:assert/strict";
import type { UserStoryWorkflowDetails } from "../src-vscode/backendClient";
import { countImplementationAttempts, hasReachedImplementationReviewCycleLimit } from "../src-vscode/workflowAutomation";

function createWorkflow(events: UserStoryWorkflowDetails["events"]): Pick<UserStoryWorkflowDetails, "events"> {
  return { events };
}

function createEvent(
  phase: string,
  code: string,
  artifacts: readonly string[]
): UserStoryWorkflowDetails["events"][number] {
  return {
    timestampUtc: "2026-04-24T12:00:00Z",
    code,
    actor: "system",
    phase,
    summary: null,
    artifacts,
    usage: null,
    durationMs: null,
    execution: null
  };
}

test("countImplementationAttempts counts unique implementation markdown artifacts", () => {
  const workflow = createWorkflow([
    createEvent("implementation", "phase_completed", ["/tmp/03-implementation.v1.md"]),
    createEvent("implementation", "phase_completed", ["/tmp/03-implementation.v1.md"]),
    createEvent("implementation", "artifact_operated", ["/tmp/03-implementation.v2.md"]),
    createEvent("review", "phase_completed", ["/tmp/04-review.v1.md"])
  ]);

  assert.equal(countImplementationAttempts(workflow), 2);
});

test("hasReachedImplementationReviewCycleLimit stops when configured maximum is reached", () => {
  const workflow = createWorkflow([
    createEvent("implementation", "phase_completed", ["/tmp/03-implementation.v1.md"]),
    createEvent("implementation", "artifact_operated", ["/tmp/03-implementation.v2.md"])
  ]);

  assert.equal(hasReachedImplementationReviewCycleLimit(workflow, 3), false);
  assert.equal(hasReachedImplementationReviewCycleLimit(workflow, 2), true);
  assert.equal(hasReachedImplementationReviewCycleLimit(workflow, null), false);
});
