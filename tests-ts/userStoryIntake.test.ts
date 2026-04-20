import test from "node:test";
import assert from "node:assert/strict";
import {
  buildWizardSourceText,
  getWizardMissingFields,
  normalizeWizardDraft
} from "../src-vscode/userStoryIntake";

test("buildWizardSourceText renders minimum and recommended sections", () => {
  const markdown = buildWizardSourceText({
    actor: "Developer working in the workflow view",
    objective: "Add an optional guided user-story wizard in the sidebar",
    acceptanceCriteria: "Users can choose freeform or wizard intake and still create the US",
    repoContext: "src-vscode/sidebarView.ts and src-vscode/sidebarViewContent.ts",
    constraints: "Keep the backend contract unchanged"
  });

  assert.match(markdown, /## Minimum Information/);
  assert.match(markdown, /Actor \/ affected area: Developer working in the workflow view/);
  assert.match(markdown, /## Recommended Detail/);
  assert.match(markdown, /Repo context or likely files: src-vscode\/sidebarView.ts and src-vscode\/sidebarViewContent.ts/);
  assert.match(markdown, /Constraints \/ guardrails: Keep the backend contract unchanged/);
});

test("buildWizardSourceText marks missing minimum fields explicitly", () => {
  const markdown = buildWizardSourceText({
    actor: "",
    objective: "Improve intake guidance",
    acceptanceCriteria: ""
  });

  assert.match(markdown, /Actor \/ affected area: _missing_/);
  assert.match(markdown, /Acceptance criteria: _missing_/);
});

test("getWizardMissingFields reports the required wizard prompts", () => {
  assert.deepEqual(
    getWizardMissingFields({
      actor: "",
      objective: "Only objective present",
      acceptanceCriteria: ""
    }),
    ["who is affected", "acceptance criteria"]
  );
});

test("normalizeWizardDraft trims optional fields safely", () => {
  assert.deepEqual(
    normalizeWizardDraft({
      actor: "  developer  ",
      objective: "  add wizard  ",
      constraints: "  keep mcp stable  "
    }),
    {
      actor: "developer",
      objective: "add wizard",
      value: "",
      inScope: "",
      acceptanceCriteria: "",
      repoContext: "",
      outOfScope: "",
      constraints: "keep mcp stable",
      notes: ""
    }
  );
});
