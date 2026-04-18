import test from "node:test";
import assert from "node:assert/strict";
import { buildBackendEnvironment, readSpecForgeSettings } from "../src-vscode/extensionSettings";

test("readSpecForgeSettings normalizes optional strings and preserves toggles", () => {
  const values = new Map<string, unknown>([
    ["execution.provider", "openai-compatible"],
    ["execution.baseUrl", " https://api.example.test/v1 "],
    ["execution.apiKey", " secret "],
    ["execution.model", " gpt-test "],
    ["ui.enableWatcher", false],
    ["ui.notifyOnAttention", true]
  ]);

  const settings = readSpecForgeSettings({
    get<T>(section: string, defaultValue?: T): T {
      return (values.get(section) as T | undefined) ?? (defaultValue as T);
    }
  });

  assert.deepEqual(settings, {
    provider: "openai-compatible",
    baseUrl: "https://api.example.test/v1",
    apiKey: "secret",
    model: "gpt-test",
    watcherEnabled: false,
    attentionNotificationsEnabled: true
  });
});

test("buildBackendEnvironment maps extension settings to provider environment variables", () => {
  assert.deepEqual(buildBackendEnvironment({
    provider: "openai-compatible",
    baseUrl: "https://api.example.test/v1",
    apiKey: "secret",
    model: "gpt-test",
    watcherEnabled: true,
    attentionNotificationsEnabled: true
  }), {
    SPECFORGE_PHASE_PROVIDER: "openai-compatible",
    SPECFORGE_OPENAI_BASE_URL: "https://api.example.test/v1",
    SPECFORGE_OPENAI_API_KEY: "secret",
    SPECFORGE_OPENAI_MODEL: "gpt-test"
  });
});
