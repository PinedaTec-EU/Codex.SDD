import test from "node:test";
import assert from "node:assert/strict";
import {
  buildCompletedWorkflowReopenOperationPrompt,
  resolveCompletedWorkflowReopenTargetPhase
} from "../src-vscode/workflowCompletedReopen";

test("resolveCompletedWorkflowReopenTargetPhase routes technical issues to technical design", () => {
  assert.equal(resolveCompletedWorkflowReopenTargetPhase("merge-conflict"), "implementation");
  assert.equal(resolveCompletedWorkflowReopenTargetPhase("defect"), "implementation");
  assert.equal(resolveCompletedWorkflowReopenTargetPhase("functional-issue"), "refinement");
  assert.equal(resolveCompletedWorkflowReopenTargetPhase("technical-issue"), "technical-design");
  assert.equal(resolveCompletedWorkflowReopenTargetPhase(""), "");
});

test("buildCompletedWorkflowReopenOperationPrompt feeds the reopen note into technical design", () => {
  const prompt = buildCompletedWorkflowReopenOperationPrompt(
    "technical-issue",
    "APR found a missing fallback strategy for provider failover."
  );

  assert.match(prompt, /current technical design artifact/);
  assert.match(prompt, /corrective technical-design pass/);
  assert.match(prompt, /validation strategy/);
  assert.match(prompt, /APR found a missing fallback strategy for provider failover\./);
});
