import test from "node:test";
import assert from "node:assert/strict";
import { buildBackendEnvironment, getSpecForgeSettingsStatus, readSpecForgeSettings } from "../src-vscode/extensionSettings";

test("readSpecForgeSettings normalizes optional strings and preserves toggles", () => {
  const values = new Map<string, unknown>([
    ["execution.provider", "openai-compatible"],
    ["execution.baseUrl", " https://api.example.test/v1 "],
    ["execution.apiKey", " secret "],
    ["execution.model", " gpt-test "],
    ["execution.modelProfiles", [
      {
        name: "light",
        baseUrl: " https://light.example.test/v1 ",
        apiKey: " light-secret ",
        model: " gpt-light "
      },
      {
        name: "top",
        baseUrl: " http://localhost:11434/v1 ",
        apiKey: " ",
        model: " llama-top "
      }
    ]],
    ["execution.phaseModels", {
      defaultProfile: " light ",
      implementationProfile: " top ",
      reviewProfile: " light "
    }],
    ["execution.clarificationTolerance", " inferential "],
    ["execution.reviewTolerance", " strict "],
    ["ui.enableWatcher", false],
    ["ui.notifyOnAttention", true],
    ["features.enableContextSuggestions", true],
    ["features.requireApprovalBranchAcceptance", true]
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
    modelProfiles: [
      {
        name: "light",
        baseUrl: "https://light.example.test/v1",
        apiKey: "light-secret",
        model: "gpt-light"
      },
      {
        name: "top",
        baseUrl: "http://localhost:11434/v1",
        apiKey: null,
        model: "llama-top"
      }
    ],
    phaseModelAssignments: {
      defaultProfile: "light",
      implementationProfile: "top",
      reviewProfile: "light"
    },
    effectivePhaseModelAssignments: {
      defaultProfileName: "light",
      implementationProfileName: "top",
      reviewProfileName: "light"
    },
    clarificationTolerance: "inferential",
    reviewTolerance: "strict",
    watcherEnabled: false,
    attentionNotificationsEnabled: true,
    contextSuggestionsEnabled: true,
    requireExplicitApprovalBranchAcceptance: true,
    autoPlayEnabled: false,
    destructiveRewindEnabled: false
  });
});

test("buildBackendEnvironment maps extension settings to provider environment variables", () => {
  assert.deepEqual(buildBackendEnvironment({
    provider: "openai-compatible",
    baseUrl: "https://api.example.test/v1",
    apiKey: "secret",
    model: "gpt-test",
    modelProfiles: [],
    phaseModelAssignments: {
      defaultProfile: null,
      implementationProfile: null,
      reviewProfile: null
    },
    effectivePhaseModelAssignments: {
      defaultProfileName: "gpt-test",
      implementationProfileName: "gpt-test",
      reviewProfileName: "gpt-test"
    },
    clarificationTolerance: "strict",
    reviewTolerance: "inferential",
    watcherEnabled: true,
    attentionNotificationsEnabled: true,
    contextSuggestionsEnabled: true,
    requireExplicitApprovalBranchAcceptance: false,
    autoPlayEnabled: false,
    destructiveRewindEnabled: false
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
    modelProfiles: [],
    phaseModelAssignments: {
      defaultProfile: null,
      implementationProfile: null,
      reviewProfile: null
    },
    effectivePhaseModelAssignments: {
      defaultProfileName: null,
      implementationProfileName: null,
      reviewProfileName: null
    },
    clarificationTolerance: "balanced",
    reviewTolerance: "balanced",
    watcherEnabled: true,
    attentionNotificationsEnabled: true,
    contextSuggestionsEnabled: true,
    requireExplicitApprovalBranchAcceptance: false,
    autoPlayEnabled: false,
    destructiveRewindEnabled: false
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
    modelProfiles: [],
    phaseModelAssignments: {
      defaultProfile: null,
      implementationProfile: null,
      reviewProfile: null
    },
    effectivePhaseModelAssignments: {
      defaultProfileName: "llama3.1",
      implementationProfileName: "llama3.1",
      reviewProfileName: "llama3.1"
    },
    clarificationTolerance: "balanced",
    reviewTolerance: "balanced",
    watcherEnabled: true,
    attentionNotificationsEnabled: true,
    contextSuggestionsEnabled: true,
    requireExplicitApprovalBranchAcceptance: false,
    autoPlayEnabled: false,
    destructiveRewindEnabled: false
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
    modelProfiles: [],
    phaseModelAssignments: {
      defaultProfile: null,
      implementationProfile: null,
      reviewProfile: null
    },
    effectivePhaseModelAssignments: {
      defaultProfileName: "gpt-test",
      implementationProfileName: "gpt-test",
      reviewProfileName: "gpt-test"
    },
    clarificationTolerance: "balanced",
    reviewTolerance: "balanced",
    watcherEnabled: true,
    attentionNotificationsEnabled: true,
    contextSuggestionsEnabled: true,
    requireExplicitApprovalBranchAcceptance: false,
    autoPlayEnabled: false,
    destructiveRewindEnabled: false
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
    modelProfiles: [],
    phaseModelAssignments: {
      defaultProfile: null,
      implementationProfile: null,
      reviewProfile: null
    },
    effectivePhaseModelAssignments: {
      defaultProfileName: null,
      implementationProfileName: null,
      reviewProfileName: null
    },
    clarificationTolerance: "balanced",
    reviewTolerance: "balanced",
    watcherEnabled: true,
    attentionNotificationsEnabled: true,
    contextSuggestionsEnabled: true,
    requireExplicitApprovalBranchAcceptance: false,
    autoPlayEnabled: false,
    destructiveRewindEnabled: false
  }), {
    executionConfigured: false,
    message: "SpecForge.AI needs an SLM/LLM execution provider before workflow stages can run. Select an OpenAI-compatible provider and configure either base URL, API key, and model or a model profile catalog."
  });
});

test("buildBackendEnvironment serializes named model profiles and phase assignments", () => {
  assert.deepEqual(buildBackendEnvironment({
    provider: "openai-compatible",
    baseUrl: null,
    apiKey: null,
    model: null,
    modelProfiles: [
      {
        name: "light",
        baseUrl: "https://light.example.test/v1",
        apiKey: "light-secret",
        model: "gpt-light"
      },
      {
        name: "top",
        baseUrl: "http://localhost:11434/v1",
        apiKey: null,
        model: "llama-top"
      }
    ],
    phaseModelAssignments: {
      defaultProfile: "light",
      implementationProfile: "top",
      reviewProfile: "light"
    },
    effectivePhaseModelAssignments: {
      defaultProfileName: "light",
      implementationProfileName: "top",
      reviewProfileName: "light"
    },
    clarificationTolerance: "balanced",
    reviewTolerance: "strict",
    watcherEnabled: true,
    attentionNotificationsEnabled: true,
    contextSuggestionsEnabled: true,
    requireExplicitApprovalBranchAcceptance: false,
    autoPlayEnabled: false,
    destructiveRewindEnabled: false
  }), {
    SPECFORGE_PHASE_PROVIDER: "openai-compatible",
    SPECFORGE_OPENAI_BASE_URL: "https://light.example.test/v1",
    SPECFORGE_OPENAI_API_KEY: "light-secret",
    SPECFORGE_OPENAI_MODEL: "gpt-light",
    SPECFORGE_OPENAI_MODEL_PROFILES_JSON: JSON.stringify([
      {
        name: "light",
        baseUrl: "https://light.example.test/v1",
        apiKey: "light-secret",
        model: "gpt-light"
      },
      {
        name: "top",
        baseUrl: "http://localhost:11434/v1",
        apiKey: null,
        model: "llama-top"
      }
    ]),
    SPECFORGE_OPENAI_PHASE_MODEL_ASSIGNMENTS_JSON: JSON.stringify({
      defaultProfile: "light",
      implementationProfile: "top",
      reviewProfile: "light"
    }),
    SPECFORGE_CAPTURE_TOLERANCE: "balanced",
    SPECFORGE_REVIEW_TOLERANCE: "strict"
  });
});

test("getSpecForgeSettingsStatus validates named profile assignments", () => {
  assert.deepEqual(getSpecForgeSettingsStatus({
    provider: "openai-compatible",
    baseUrl: null,
    apiKey: null,
    model: null,
    modelProfiles: [
      {
        name: "light",
        baseUrl: "https://light.example.test/v1",
        apiKey: "light-secret",
        model: "gpt-light"
      }
    ],
    phaseModelAssignments: {
      defaultProfile: "missing",
      implementationProfile: null,
      reviewProfile: null
    },
    effectivePhaseModelAssignments: {
      defaultProfileName: null,
      implementationProfileName: null,
      reviewProfileName: null
    },
    clarificationTolerance: "balanced",
    reviewTolerance: "balanced",
    watcherEnabled: true,
    attentionNotificationsEnabled: true,
    contextSuggestionsEnabled: true,
    requireExplicitApprovalBranchAcceptance: false,
    autoPlayEnabled: false,
    destructiveRewindEnabled: false
  }), {
    executionConfigured: false,
    message: "SpecForge.AI phase model assignment 'default' references unknown profile 'missing'."
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
  assert.equal(settings.requireExplicitApprovalBranchAcceptance, false);
  assert.deepEqual(settings.phaseModelAssignments, {
    defaultProfile: null,
    implementationProfile: null,
    reviewProfile: null
  });
});
