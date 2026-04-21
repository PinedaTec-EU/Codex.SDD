import test from "node:test";
import assert from "node:assert/strict";
import { buildWorkBranchProposal } from "../src-vscode/workflowBranchName";

test("buildWorkBranchProposal strips duplicated kind and usId prefixes from the title slug", () => {
  assert.equal(
    buildWorkBranchProposal("US-0001", "Feature US-0001 Checkout Flow", "feature"),
    "feature/us-0001-checkout-flow"
  );
});

test("buildWorkBranchProposal falls back to work when the title only repeats the identifiers", () => {
  assert.equal(
    buildWorkBranchProposal("US-0001", "Feature US-0001", "feature"),
    "feature/us-0001-work"
  );
});
