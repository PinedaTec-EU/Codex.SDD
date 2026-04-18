import test from "node:test";
import assert from "node:assert/strict";
import { buildUserStoryDetailsHtml, escapeHtml } from "../src-vscode/detailsView";

test("escapeHtml encodes reserved html characters", () => {
  assert.equal(escapeHtml(`a&b<c>"'`), "a&amp;b&lt;c&gt;&quot;&#39;");
});

test("buildUserStoryDetailsHtml escapes user controlled fields and marks current phase", () => {
  const html = buildUserStoryDetailsHtml({
    usId: "US-0001<script>",
    title: "Fix <branch>",
    category: "workflow",
    directoryPath: "/tmp/us-0001",
    mainArtifactPath: "/tmp/us-0001/us.md",
    currentPhase: "review",
    status: "blocked",
    workBranch: "feature/us-0001-fix-branch"
  });

  assert.match(html, /US-0001&lt;script&gt;/);
  assert.match(html, /Fix &lt;branch&gt;/);
  assert.match(html, /<li class="current">● review<\/li>/);
});
