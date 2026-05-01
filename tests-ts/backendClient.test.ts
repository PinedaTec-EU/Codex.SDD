import test from "node:test";
import assert from "node:assert/strict";
import { parseModelResponseDiagnosticLine, summarizeMcpDiagnosticLine } from "../src-vscode/mcpDiagnostics";

test("summarizeMcpDiagnosticLine converts native stdout chunks into readable output", () => {
  const line =
    "[2026-04-24T14:33:00.0000000+00:00] [provider.native.exec.stdout] provider=claude pid=123 chunk=\"working...\\nnext step\"";

  assert.equal(
    summarizeMcpDiagnosticLine(line),
    "Claude stdout: working...\nnext step"
  );
});

test("summarizeMcpDiagnosticLine surfaces native silence heartbeats", () => {
  const line =
    "[2026-04-24T14:33:00.0000000+00:00] [provider.native.exec] provider=claude pid=123 no stdout/stderr for 30s.";

  assert.equal(
    summarizeMcpDiagnosticLine(line),
    "Claude CLI still running without output. provider=claude pid=123 no stdout/stderr for 30s."
  );
});

test("summarizeMcpDiagnosticLine ignores non-native diagnostics", () => {
  const line =
    "[2026-04-24T14:33:00.0000000+00:00] [runner.materialize] usId=US-0001 phase=review started.";

  assert.equal(summarizeMcpDiagnosticLine(line), null);
});

test("model response diagnostics expose transport and decoded response text", () => {
  const line =
    "[2026-04-24T14:33:00.0000000+00:00] [provider.model.response] provider=codex profile=main model=gpt-5 transport=cli mode=delta chunk=\"## Spec\\nGenerated response\"";

  assert.equal(
    summarizeMcpDiagnosticLine(line),
    "codex cli delta response: ## Spec\nGenerated response"
  );
  assert.deepEqual(parseModelResponseDiagnosticLine(line), {
    providerKind: "codex",
    transport: "cli",
    mode: "delta",
    text: "## Spec\nGenerated response"
  });
});

test("native stdout diagnostics can feed model response preview deltas", () => {
  const line =
    "[2026-04-24T14:33:00.0000000+00:00] [provider.native.exec.stdout] provider=claude pid=123 chunk=\"Drafting answer...\"";

  assert.deepEqual(parseModelResponseDiagnosticLine(line), {
    providerKind: "claude",
    transport: "cli",
    mode: "delta",
    text: "Drafting answer..."
  });
});

test("summarizeMcpDiagnosticLine truncates oversized process diagnostics", () => {
  const longCommand = `${"x".repeat(400)}`;
  const line =
    `[2026-04-24T14:33:00.0000000+00:00] [provider.native.exec] provider=claude command="${longCommand}" pid=123 started.`;

  const summary = summarizeMcpDiagnosticLine(line);
  assert.ok(summary?.startsWith("Claude process started."));
  assert.ok(summary?.endsWith("..."));
});
