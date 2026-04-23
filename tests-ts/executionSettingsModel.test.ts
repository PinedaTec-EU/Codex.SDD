import test from "node:test";
import assert from "node:assert/strict";
import { requiresDefaultFallback } from "../src-vscode/executionSettingsModel";

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
