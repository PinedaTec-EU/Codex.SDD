import test from "node:test";
import assert from "node:assert/strict";
import { resolveWorkflowRejectPlan } from "../src-vscode/workflowRejectPlan";

test("resolveWorkflowRejectPlan maps spec approval to operate on the current artifact", () => {
  const plan = resolveWorkflowRejectPlan("spec");

  assert.deepEqual(plan, {
    targetPhaseId: "spec",
    mode: "operate-current",
    modalTitle: "Reject Spec Approval",
    modalPrompt: "Describe what is wrong so SpecForge can apply the correction directly to the spec artifact.",
    helperText: "Confirming keeps the workflow in spec, records your note, and applies it through the model over the current spec artifact.",
    confirmLabel: "Reject and Apply"
  });
});

test("resolveWorkflowRejectPlan maps release approval to rewind into review", () => {
  const plan = resolveWorkflowRejectPlan("release-approval");

  assert.deepEqual(plan, {
    targetPhaseId: "review",
    mode: "rewind-and-operate",
    modalTitle: "Reject Release Approval",
    modalPrompt: "Describe what is wrong so SpecForge can rewind to review and apply the note over the review artifact.",
    helperText: "Confirming rewinds the workflow to review, records your note, and applies it through the model over the review artifact.",
    confirmLabel: "Reject, Rewind, and Apply"
  });
});

test("resolveWorkflowRejectPlan returns null for non-approval phases", () => {
  assert.equal(resolveWorkflowRejectPlan("implementation"), null);
});
