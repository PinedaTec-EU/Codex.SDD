import test from "node:test";
import assert from "node:assert/strict";
import { buildBackendEnvironment, getSpecForgeSettingsStatus, readSpecForgeSettings } from "../src-vscode/extensionSettings";

test("readSpecForgeSettings normalizes model profiles and preserves toggles", () => {
  const values = new Map<string, unknown>([
    ["execution.modelProfiles", [
      {
        name: "light",
        provider: " openai-compatible ",
        baseUrl: " https://light.example.test/v1 ",
        apiKey: " light-secret ",
        model: " gpt-light "
      },
      {
        name: "top",
        provider: " openai-compatible ",
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
    modelProfiles: [
      {
        name: "light",
        provider: "openai-compatible",
        baseUrl: "https://light.example.test/v1",
        apiKey: "light-secret",
        model: "gpt-light"
      },
      {
        name: "top",
        provider: "openai-compatible",
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

test("readSpecForgeSettings defaults missing profile provider to openai-compatible", () => {
  const values = new Map<string, unknown>([
    ["execution.modelProfiles", [
      {
        name: "light",
        baseUrl: " https://light.example.test/v1 ",
        apiKey: " light-secret ",
        model: " gpt-light "
      }
    ]]
  ]);

  const settings = readSpecForgeSettings({
    get<T>(section: string, defaultValue?: T): T {
      return (values.get(section) as T | undefined) ?? (defaultValue as T);
    }
  });

  assert.equal(settings.modelProfiles[0]?.provider, "openai-compatible");
});

test("buildBackendEnvironment only serializes model profiles and assignments", () => {
  assert.deepEqual(buildBackendEnvironment({
    modelProfiles: [
      {
        name: "light",
        provider: "openai-compatible",
        baseUrl: "https://light.example.test/v1",
        apiKey: "light-secret",
        model: "gpt-light"
      },
      {
        name: "top",
        provider: "openai-compatible",
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
    clarificationTolerance: "strict",
    reviewTolerance: "inferential",
    watcherEnabled: true,
    attentionNotificationsEnabled: true,
    contextSuggestionsEnabled: true,
    requireExplicitApprovalBranchAcceptance: false,
    autoPlayEnabled: false,
    destructiveRewindEnabled: false
  }), {
    SPECFORGE_OPENAI_MODEL_PROFILES_JSON: JSON.stringify([
      {
        name: "light",
        provider: "openai-compatible",
        baseUrl: "https://light.example.test/v1",
        apiKey: "light-secret",
        model: "gpt-light"
      },
      {
        name: "top",
        provider: "openai-compatible",
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
    SPECFORGE_CAPTURE_TOLERANCE: "strict",
    SPECFORGE_REVIEW_TOLERANCE: "inferential"
  });
});

test("getSpecForgeSettingsStatus requires at least one model profile", () => {
  const status = getSpecForgeSettingsStatus({
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
  });

  assert.equal(status.executionConfigured, false);
  assert.equal(status.message, "SpecForge.AI needs at least one configured model profile before workflow stages can run.");
  assert.match(status.diagnostics, /profiles=0/);
});

test("getSpecForgeSettingsStatus allows a single valid local profile without api key", () => {
  const status = getSpecForgeSettingsStatus({
    modelProfiles: [
      {
        name: "light",
        provider: "openai-compatible",
        baseUrl: "http://localhost:11434/v1",
        apiKey: null,
        model: "llama3.1"
      }
    ],
    phaseModelAssignments: {
      defaultProfile: null,
      implementationProfile: null,
      reviewProfile: null
    },
    effectivePhaseModelAssignments: {
      defaultProfileName: "light",
      implementationProfileName: "light",
      reviewProfileName: "light"
    },
    clarificationTolerance: "balanced",
    reviewTolerance: "balanced",
    watcherEnabled: true,
    attentionNotificationsEnabled: true,
    contextSuggestionsEnabled: true,
    requireExplicitApprovalBranchAcceptance: false,
    autoPlayEnabled: false,
    destructiveRewindEnabled: false
  });

  assert.equal(status.executionConfigured, true);
  assert.equal(status.message, null);
  assert.match(status.diagnostics, /catalog=\[light\{provider=openai-compatible,baseUrl=http:\/\/localhost:11434\/v1,model=llama3\.1,apiKey=empty\}\]/);
});

test("getSpecForgeSettingsStatus still requires an api key for remote profiles", () => {
  const status = getSpecForgeSettingsStatus({
    modelProfiles: [
      {
        name: "light",
        provider: "openai-compatible",
        baseUrl: "https://api.example.test/v1",
        apiKey: null,
        model: "gpt-test"
      }
    ],
    phaseModelAssignments: {
      defaultProfile: null,
      implementationProfile: null,
      reviewProfile: null
    },
    effectivePhaseModelAssignments: {
      defaultProfileName: "light",
      implementationProfileName: "light",
      reviewProfileName: "light"
    },
    clarificationTolerance: "balanced",
    reviewTolerance: "balanced",
    watcherEnabled: true,
    attentionNotificationsEnabled: true,
    contextSuggestionsEnabled: true,
    requireExplicitApprovalBranchAcceptance: false,
    autoPlayEnabled: false,
    destructiveRewindEnabled: false
  });

  assert.equal(status.executionConfigured, false);
  assert.equal(status.message, "SpecForge.AI model profile 'light' needs an API key for a remote base URL.");
  assert.match(status.diagnostics, /apiKey=empty/);
});

test("getSpecForgeSettingsStatus accepts profiles using the default provider", () => {
  const status = getSpecForgeSettingsStatus({
    modelProfiles: [
      {
        name: "light",
        provider: "openai-compatible",
        baseUrl: "https://api.example.test/v1",
        apiKey: "secret",
        model: "gpt-test"
      }
    ],
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
  });

  assert.equal(status.executionConfigured, true);
  assert.equal(status.message, null);
  assert.match(status.diagnostics, /effective\.default=<unset>/);
});

test("getSpecForgeSettingsStatus rejects unsupported providers", () => {
  const status = getSpecForgeSettingsStatus({
    modelProfiles: [
      {
        name: "light",
        provider: "anthropic",
        baseUrl: "https://api.example.test/v1",
        apiKey: "secret",
        model: "claude"
      }
    ],
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
  });

  assert.equal(status.executionConfigured, false);
  assert.equal(status.message, "SpecForge.AI model profile 'light' uses unsupported provider 'anthropic'.");
  assert.match(status.diagnostics, /provider=anthropic/);
});

test("getSpecForgeSettingsStatus validates named profile assignments", () => {
  const status = getSpecForgeSettingsStatus({
    modelProfiles: [
      {
        name: "light",
        provider: "openai-compatible",
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
  });

  assert.equal(status.executionConfigured, false);
  assert.equal(status.message, "SpecForge.AI phase model assignment 'default' references unknown profile 'missing'.");
  assert.match(status.diagnostics, /phaseModels\.default=missing/);
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
