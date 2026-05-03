import test from "node:test";
import assert from "node:assert/strict";
import { requiresDefaultFallback, validatePhasePermissionAssignments } from "../src-vscode/executionSettingsModel";

test("requiresDefaultFallback returns true when multiple profiles exist without default", () => {
  assert.equal(requiresDefaultFallback([
    { name: "planner" },
    { name: "implementer" }
  ], {
    defaultAgent: null
  }), true);
});

test("requiresDefaultFallback returns false for a single profile or explicit default", () => {
  assert.equal(requiresDefaultFallback([
    { name: "planner" }
  ], {
    defaultAgent: null
  }), false);

  assert.equal(requiresDefaultFallback([
    { name: "planner" },
    { name: "implementer" }
  ], {
    defaultAgent: "planner"
  }), false);
});

test("validatePhasePermissionAssignments rejects implementation and review when assigned profile lacks write access", () => {
  const issues = validatePhasePermissionAssignments([
    { name: "planner", repositoryAccess: "read" }
  ], {
    defaultAgent: "planner",
    refinementAgent: null,
    specAgent: null,
    technicalDesignAgent: null,
    implementationAgent: null,
    reviewAgent: null,
    releaseApprovalAgent: null,
    prPreparationAgent: null
  });

  assert.deepEqual(issues.map((item) => item.assignmentKey), ["implementationAgent", "reviewAgent"]);
  assert.match(issues[0]?.message ?? "", /Implementation requires repository access 'read-write'/);
});

test("validatePhasePermissionAssignments accepts read phases on read and write phases on read-write", () => {
  const issues = validatePhasePermissionAssignments([
    { name: "planner", repositoryAccess: "read" },
    { name: "implementer", repositoryAccess: "read-write" }
  ], {
    defaultAgent: "planner",
    refinementAgent: null,
    specAgent: null,
    technicalDesignAgent: null,
    implementationAgent: "implementer",
    reviewAgent: "implementer",
    releaseApprovalAgent: null,
    prPreparationAgent: null
  });

  assert.equal(issues.length, 0);
});
