import test from "node:test";
import assert from "node:assert/strict";
import { requiresDefaultFallback, validatePhasePermissionAssignments } from "../src-vscode/executionSettingsModel";

test("requiresDefaultFallback returns true when multiple profiles exist without default", () => {
  assert.equal(requiresDefaultFallback([
    { name: "planner" },
    { name: "implementer" }
  ], {
    defaultProfile: null
  }), true);
});

test("requiresDefaultFallback returns false for a single profile or explicit default", () => {
  assert.equal(requiresDefaultFallback([
    { name: "planner" }
  ], {
    defaultProfile: null
  }), false);

  assert.equal(requiresDefaultFallback([
    { name: "planner" },
    { name: "implementer" }
  ], {
    defaultProfile: "planner"
  }), false);
});

test("validatePhasePermissionAssignments rejects implementation and review when assigned profile lacks write access", () => {
  const issues = validatePhasePermissionAssignments([
    { name: "planner", repositoryAccess: "read" }
  ], {
    defaultProfile: "planner",
    refinementProfile: null,
    specProfile: null,
    technicalDesignProfile: null,
    implementationProfile: null,
    reviewProfile: null,
    releaseApprovalProfile: null,
    prPreparationProfile: null
  });

  assert.deepEqual(issues.map((item) => item.assignmentKey), ["implementationProfile", "reviewProfile"]);
  assert.match(issues[0]?.message ?? "", /Implementation requires repository access 'read-write'/);
});

test("validatePhasePermissionAssignments accepts read phases on read and write phases on read-write", () => {
  const issues = validatePhasePermissionAssignments([
    { name: "planner", repositoryAccess: "read" },
    { name: "implementer", repositoryAccess: "read-write" }
  ], {
    defaultProfile: "planner",
    refinementProfile: null,
    specProfile: null,
    technicalDesignProfile: null,
    implementationProfile: "implementer",
    reviewProfile: "implementer",
    releaseApprovalProfile: null,
    prPreparationProfile: null
  });

  assert.equal(issues.length, 0);
});
