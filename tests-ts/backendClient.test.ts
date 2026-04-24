import test from "node:test";
import assert from "node:assert/strict";
import { summarizeMcpDiagnosticLine } from "../src-vscode/mcpDiagnostics";

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

test("summarizeMcpDiagnosticLine truncates oversized process diagnostics", () => {
  const longCommand = `${"x".repeat(400)}`;
  const line =
    `[2026-04-24T14:33:00.0000000+00:00] [provider.native.exec] provider=claude command="${longCommand}" pid=123 started.`;

  const summary = summarizeMcpDiagnosticLine(line);
  assert.ok(summary?.startsWith("Claude process started."));
  assert.ok(summary?.endsWith("..."));
});
