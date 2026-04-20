import test from "node:test";
import assert from "node:assert/strict";
import { buildBackendEnvironment, getSpecForgeSettingsStatus, readSpecForgeSettings } from "../src-vscode/extensionSettings";

test("readSpecForgeSettings normalizes optional strings and preserves toggles", () => {
  const values = new Map<string, unknown>([
    ["execution.provider", "openai-compatible"],
    ["execution.baseUrl", " https://api.example.test/v1 "],
    ["execution.apiKey", " secret "],
    ["execution.model", " gpt-test "],
    ["execution.clarificationTolerance", " inferential "],
    ["execution.reviewTolerance", " strict "],
    ["ui.enableWatcher", false],
    ["ui.notifyOnAttention", true],
    ["features.enableContextSuggestions", true]
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
    clarificationTolerance: "inferential",
    reviewTolerance: "strict",
    watcherEnabled: false,
    attentionNotificationsEnabled: true,
    contextSuggestionsEnabled: true
  });
});

test("buildBackendEnvironment maps extension settings to provider environment variables", () => {
  assert.deepEqual(buildBackendEnvironment({
    provider: "openai-compatible",
    baseUrl: "https://api.example.test/v1",
    apiKey: "secret",
    model: "gpt-test",
    clarificationTolerance: "strict",
    reviewTolerance: "inferential",
    watcherEnabled: true,
    attentionNotificationsEnabled: true,
    contextSuggestionsEnabled: true
  }), {
    SPECFORGE_PHASE_PROVIDER: "openai-compatible",
    SPECFORGE_OPENAI_BASE_URL: "https://api.example.test/v1",
    SPECFORGE_OPENAI_API_KEY: "secret",
    SPECFORGE_OPENAI_MODEL: "gpt-test",
    SPECFORGE_CAPTURE_TOLERANCE: "strict",
    SPECFORGE_REVIEW_TOLERANCE: "inferential"
  });
});

test("getSpecForgeSettingsStatus requires connection fields for openai-compatible providers", () => {
  assert.deepEqual(getSpecForgeSettingsStatus({
    provider: "openai-compatible",
    baseUrl: null,
    apiKey: "secret",
    model: null,
    clarificationTolerance: "balanced",
    reviewTolerance: "balanced",
    watcherEnabled: true,
    attentionNotificationsEnabled: true,
    contextSuggestionsEnabled: true
  }), {
    executionConfigured: false,
    message: "SpecForge.AI is not configured for the current provider. Missing base URL, model."
  });
});

test("getSpecForgeSettingsStatus allows local openai-compatible endpoints without an api key", () => {
  assert.deepEqual(getSpecForgeSettingsStatus({
    provider: "openai-compatible",
    baseUrl: "http://localhost:11434/v1",
    apiKey: null,
    model: "llama3.1",
    clarificationTolerance: "balanced",
    reviewTolerance: "balanced",
    watcherEnabled: true,
    attentionNotificationsEnabled: true,
    contextSuggestionsEnabled: true
  }), {
    executionConfigured: true,
    message: null
  });
});

test("getSpecForgeSettingsStatus still requires an api key for remote openai-compatible endpoints", () => {
  assert.deepEqual(getSpecForgeSettingsStatus({
    provider: "openai-compatible",
    baseUrl: "https://api.example.test/v1",
    apiKey: null,
    model: "gpt-test",
    clarificationTolerance: "balanced",
    reviewTolerance: "balanced",
    watcherEnabled: true,
    attentionNotificationsEnabled: true,
    contextSuggestionsEnabled: true
  }), {
    executionConfigured: false,
    message: "SpecForge.AI is not configured for the current provider. Missing API key."
  });
});

test("getSpecForgeSettingsStatus requires a real model-backed provider instead of the deterministic fallback", () => {
  assert.deepEqual(getSpecForgeSettingsStatus({
    provider: "deterministic",
    baseUrl: null,
    apiKey: null,
    model: null,
    clarificationTolerance: "balanced",
    reviewTolerance: "balanced",
    watcherEnabled: true,
    attentionNotificationsEnabled: true,
    contextSuggestionsEnabled: true
  }), {
    executionConfigured: false,
    message: "SpecForge.AI needs an SLM/LLM execution provider before workflow stages can run. Select an OpenAI-compatible provider and configure base URL, API key, and model."
  });
});

test("readSpecForgeSettings falls back to balanced clarification tolerance for unsupported values", () => {
  const settings = readSpecForgeSettings({
    get<T>(section: string, defaultValue?: T): T {
      if (section === "execution.clarificationTolerance" || section === "execution.reviewTolerance") {
        return "chaotic" as T;
      }

      return (defaultValue as T);
    }
  });

  assert.equal(settings.clarificationTolerance, "balanced");
  assert.equal(settings.reviewTolerance, "balanced");
});
