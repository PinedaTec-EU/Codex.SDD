import test from "node:test";
import assert from "node:assert/strict";
import { buildBackendEnvironment, getSpecForgeSettingsStatus, readSpecForgeSettings } from "../src-vscode/extensionSettings";

type AssignmentShape = ReturnType<typeof emptyAssignments>;
type EffectiveAssignmentShape = ReturnType<typeof emptyEffectiveAssignments>;

function assignments(overrides: Partial<Record<keyof AssignmentShape, string | null>> = {}) {
  return {
    ...emptyAssignments(),
    ...overrides
  };
}

function effective(overrides: Partial<Record<keyof EffectiveAssignmentShape, string | null>> = {}) {
  return {
    ...emptyEffectiveAssignments(),
    ...overrides
  };
}

function emptyAssignments() {
  return {
    defaultProfile: null,
    captureProfile: null,
    clarificationProfile: null,
    refinementProfile: null,
    technicalDesignProfile: null,
    implementationProfile: null,
    reviewProfile: null,
    releaseApprovalProfile: null,
    prPreparationProfile: null
  };
}

function emptyEffectiveAssignments() {
  return {
    defaultProfileName: null,
    captureProfileName: null,
    clarificationProfileName: null,
    refinementProfileName: null,
    technicalDesignProfileName: null,
    implementationProfileName: null,
    reviewProfileName: null,
    releaseApprovalProfileName: null,
    prPreparationProfileName: null
  };
}

test("readSpecForgeSettings normalizes model profiles and preserves toggles", () => {
  const values = new Map<string, unknown>([
    ["execution.modelProfiles", [
      {
        name: "light",
        provider: " CODEX ",
        baseUrl: " https://light.example.test/v1 ",
        apiKey: " light-secret ",
        model: " gpt-light ",
        repositoryAccess: " read "
      },
      {
        name: "top",
        provider: " openai-compatible ",
        baseUrl: " http://localhost:11434/v1 ",
        apiKey: " ",
        model: " llama-top ",
        repositoryAccess: " read-write "
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
        provider: "codex",
        baseUrl: "https://light.example.test/v1",
        apiKey: "light-secret",
        model: "gpt-light",
        repositoryAccess: "read"
      },
      {
        name: "top",
        provider: "openai-compatible",
        baseUrl: "http://localhost:11434/v1",
        apiKey: null,
        model: "llama-top",
        repositoryAccess: "read-write"
      }
    ],
    phaseModelAssignments: assignments({
      defaultProfile: "light",
      implementationProfile: "top",
      reviewProfile: "light"
    }),
    effectivePhaseModelAssignments: effective({
      defaultProfileName: "light",
      captureProfileName: "light",
      clarificationProfileName: "light",
      refinementProfileName: "light",
      technicalDesignProfileName: "light",
      implementationProfileName: "top",
      reviewProfileName: "light",
      releaseApprovalProfileName: "light",
      prPreparationProfileName: "light"
    }),
    autoClarificationAnswersProfile: null,
    clarificationTolerance: "inferential",
    reviewTolerance: "strict",
    watcherEnabled: false,
    attentionNotificationsEnabled: true,
    contextSuggestionsEnabled: true,
    requireExplicitApprovalBranchAcceptance: true,
    autoClarificationAnswersEnabled: false,
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
        model: "gpt-light",
        repositoryAccess: "none"
      },
      {
        name: "top",
        provider: "openai-compatible",
        baseUrl: "http://localhost:11434/v1",
        apiKey: null,
        model: "llama-top",
        repositoryAccess: "read-write"
      }
    ],
    phaseModelAssignments: assignments({
      defaultProfile: "light",
      implementationProfile: "top",
      reviewProfile: "light"
    }),
    effectivePhaseModelAssignments: effective({
      defaultProfileName: "light",
      implementationProfileName: "top",
      reviewProfileName: "light"
    }),
    autoClarificationAnswersProfile: null,
    clarificationTolerance: "strict",
    reviewTolerance: "inferential",
    watcherEnabled: true,
    attentionNotificationsEnabled: true,
    contextSuggestionsEnabled: true,
    requireExplicitApprovalBranchAcceptance: false,
    autoClarificationAnswersEnabled: false,
    autoPlayEnabled: false,
    destructiveRewindEnabled: false
  }), {
    SPECFORGE_OPENAI_MODEL_PROFILES_JSON: JSON.stringify([
      {
        name: "light",
        provider: "openai-compatible",
        baseUrl: "https://light.example.test/v1",
        apiKey: "light-secret",
        model: "gpt-light",
        repositoryAccess: "none"
      },
      {
        name: "top",
        provider: "openai-compatible",
        baseUrl: "http://localhost:11434/v1",
        apiKey: null,
        model: "llama-top",
        repositoryAccess: "read-write"
      }
    ]),
    SPECFORGE_OPENAI_PHASE_MODEL_ASSIGNMENTS_JSON: JSON.stringify(assignments({
      defaultProfile: "light",
      implementationProfile: "top",
      reviewProfile: "light"
    })),
    SPECFORGE_CAPTURE_TOLERANCE: "strict",
    SPECFORGE_REVIEW_TOLERANCE: "inferential",
    SPECFORGE_AUTO_CLARIFICATION_ANSWERS_ENABLED: "false"
  });
});

test("getSpecForgeSettingsStatus requires at least one model profile", () => {
  const status = getSpecForgeSettingsStatus({
    modelProfiles: [],
    phaseModelAssignments: assignments(),
    effectivePhaseModelAssignments: effective(),
    autoClarificationAnswersProfile: null,
    clarificationTolerance: "balanced",
    reviewTolerance: "balanced",
    watcherEnabled: true,
    attentionNotificationsEnabled: true,
    contextSuggestionsEnabled: true,
    requireExplicitApprovalBranchAcceptance: false,
    autoClarificationAnswersEnabled: false,
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
        model: "llama3.1",
        repositoryAccess: "none"
      }
    ],
    phaseModelAssignments: assignments(),
    effectivePhaseModelAssignments: effective({
      defaultProfileName: "light",
      implementationProfileName: "light",
      reviewProfileName: "light"
    }),
    autoClarificationAnswersProfile: null,
    clarificationTolerance: "balanced",
    reviewTolerance: "balanced",
    watcherEnabled: true,
    attentionNotificationsEnabled: true,
    contextSuggestionsEnabled: true,
    requireExplicitApprovalBranchAcceptance: false,
    autoClarificationAnswersEnabled: false,
    autoPlayEnabled: false,
    destructiveRewindEnabled: false
  });

  assert.equal(status.executionConfigured, true);
  assert.equal(status.message, null);
  assert.match(status.diagnostics, /catalog=\[light\{provider=openai-compatible,baseUrl=http:\/\/localhost:11434\/v1,model=llama3\.1,apiKey=empty,repositoryAccess=none\}\]/);
});

test("getSpecForgeSettingsStatus still requires an api key for remote profiles", () => {
  const status = getSpecForgeSettingsStatus({
    modelProfiles: [
      {
        name: "light",
        provider: "openai-compatible",
        baseUrl: "https://api.example.test/v1",
        apiKey: null,
        model: "gpt-test",
        repositoryAccess: "none"
      }
    ],
    phaseModelAssignments: assignments(),
    effectivePhaseModelAssignments: effective({
      defaultProfileName: "light",
      implementationProfileName: "light",
      reviewProfileName: "light"
    }),
    autoClarificationAnswersProfile: null,
    clarificationTolerance: "balanced",
    reviewTolerance: "balanced",
    watcherEnabled: true,
    attentionNotificationsEnabled: true,
    contextSuggestionsEnabled: true,
    requireExplicitApprovalBranchAcceptance: false,
    autoClarificationAnswersEnabled: false,
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
        model: "gpt-test",
        repositoryAccess: "none"
      }
    ],
    phaseModelAssignments: assignments(),
    effectivePhaseModelAssignments: effective(),
    autoClarificationAnswersProfile: null,
    clarificationTolerance: "balanced",
    reviewTolerance: "balanced",
    watcherEnabled: true,
    attentionNotificationsEnabled: true,
    contextSuggestionsEnabled: true,
    requireExplicitApprovalBranchAcceptance: false,
    autoClarificationAnswersEnabled: false,
    autoPlayEnabled: false,
    destructiveRewindEnabled: false
  });

  assert.equal(status.executionConfigured, true);
  assert.equal(status.message, null);
  assert.match(status.diagnostics, /effective\.default=<unset>/);
});

test("getSpecForgeSettingsStatus accepts codex, copilot, and claude providers", () => {
  const status = getSpecForgeSettingsStatus({
    modelProfiles: [
      {
        name: "implementer",
        provider: "codex",
        baseUrl: "https://api.example.test/v1",
        apiKey: "secret",
        model: "codex-5",
        repositoryAccess: "read-write"
      },
      {
        name: "reviewer",
        provider: "claude",
        baseUrl: "https://api.example.test/v1",
        apiKey: "secret",
        model: "claude-sonnet",
        repositoryAccess: "read"
      },
      {
        name: "fallback",
        provider: "copilot",
        baseUrl: "https://api.example.test/v1",
        apiKey: "secret",
        model: "gpt-4.1",
        repositoryAccess: "none"
      }
    ],
    phaseModelAssignments: assignments({
      defaultProfile: "fallback",
      implementationProfile: "implementer",
      reviewProfile: "reviewer"
    }),
    effectivePhaseModelAssignments: effective({
      defaultProfileName: "fallback",
      implementationProfileName: "implementer",
      reviewProfileName: "reviewer"
    }),
    autoClarificationAnswersProfile: null,
    clarificationTolerance: "balanced",
    reviewTolerance: "balanced",
    watcherEnabled: true,
    attentionNotificationsEnabled: true,
    contextSuggestionsEnabled: true,
    requireExplicitApprovalBranchAcceptance: false,
    autoClarificationAnswersEnabled: false,
    autoPlayEnabled: false,
    destructiveRewindEnabled: false
  });

  assert.equal(status.executionConfigured, true);
  assert.equal(status.message, null);
  assert.match(status.diagnostics, /provider=codex/);
  assert.match(status.diagnostics, /provider=claude/);
  assert.match(status.diagnostics, /provider=copilot/);
});

test("getSpecForgeSettingsStatus allows codex without baseUrl apiKey or model", () => {
  const status = getSpecForgeSettingsStatus({
    modelProfiles: [
      {
        name: "codex-main",
        provider: "codex",
        baseUrl: "",
        apiKey: null,
        model: "",
        repositoryAccess: "read-write"
      }
    ],
    phaseModelAssignments: assignments(),
    effectivePhaseModelAssignments: effective({
      defaultProfileName: "codex-main",
      implementationProfileName: "codex-main",
      reviewProfileName: "codex-main"
    }),
    autoClarificationAnswersProfile: null,
    clarificationTolerance: "balanced",
    reviewTolerance: "balanced",
    watcherEnabled: true,
    attentionNotificationsEnabled: true,
    contextSuggestionsEnabled: true,
    requireExplicitApprovalBranchAcceptance: false,
    autoClarificationAnswersEnabled: false,
    autoPlayEnabled: false,
    destructiveRewindEnabled: false
  });

  assert.equal(status.executionConfigured, true);
  assert.equal(status.message, null);
  assert.match(status.diagnostics, /provider=codex/);
});

test("getSpecForgeSettingsStatus rejects unsupported providers", () => {
  const status = getSpecForgeSettingsStatus({
    modelProfiles: [
      {
        name: "light",
        provider: "anthropic",
        baseUrl: "https://api.example.test/v1",
        apiKey: "secret",
        model: "claude",
        repositoryAccess: "none"
      }
    ],
    phaseModelAssignments: assignments(),
    effectivePhaseModelAssignments: effective(),
    autoClarificationAnswersProfile: null,
    clarificationTolerance: "balanced",
    reviewTolerance: "balanced",
    watcherEnabled: true,
    attentionNotificationsEnabled: true,
    contextSuggestionsEnabled: true,
    requireExplicitApprovalBranchAcceptance: false,
    autoClarificationAnswersEnabled: false,
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
        model: "gpt-light",
        repositoryAccess: "none"
      }
    ],
    phaseModelAssignments: assignments({
      defaultProfile: "missing"
    }),
    effectivePhaseModelAssignments: effective(),
    autoClarificationAnswersProfile: null,
    clarificationTolerance: "balanced",
    reviewTolerance: "balanced",
    watcherEnabled: true,
    attentionNotificationsEnabled: true,
    contextSuggestionsEnabled: true,
    requireExplicitApprovalBranchAcceptance: false,
    autoClarificationAnswersEnabled: false,
    autoPlayEnabled: false,
    destructiveRewindEnabled: false
  });

  assert.equal(status.executionConfigured, false);
  assert.equal(status.message, "SpecForge.AI phase model assignment 'default' references unknown profile 'missing'.");
  assert.match(status.diagnostics, /phaseModels\.default=missing/);
});

test("getSpecForgeSettingsStatus allows multiple profiles without default when all model-driven phases are assigned", () => {
  const status = getSpecForgeSettingsStatus({
    modelProfiles: [
      {
        name: "planner",
        provider: "openai-compatible",
        baseUrl: "https://api.example.test/v1",
        apiKey: "secret",
        model: "gpt-5.4",
        repositoryAccess: "read"
      },
      {
        name: "implementer",
        provider: "codex",
        baseUrl: "",
        apiKey: null,
        model: "",
        repositoryAccess: "read-write"
      }
    ],
    phaseModelAssignments: assignments({
      clarificationProfile: "planner",
      refinementProfile: "planner",
      technicalDesignProfile: "planner",
      implementationProfile: "implementer",
      reviewProfile: "planner"
    }),
    effectivePhaseModelAssignments: effective({
      clarificationProfileName: "planner",
      refinementProfileName: "planner",
      technicalDesignProfileName: "planner",
      implementationProfileName: "implementer",
      reviewProfileName: "planner"
    }),
    autoClarificationAnswersProfile: null,
    clarificationTolerance: "balanced",
    reviewTolerance: "balanced",
    watcherEnabled: true,
    attentionNotificationsEnabled: true,
    contextSuggestionsEnabled: true,
    requireExplicitApprovalBranchAcceptance: false,
    autoClarificationAnswersEnabled: false,
    autoPlayEnabled: false,
    destructiveRewindEnabled: false
  });

  assert.equal(status.executionConfigured, true);
  assert.equal(status.message, null);
});

test("getSpecForgeSettingsStatus requires an explicit auto-clarification profile when enabled", () => {
  const status = getSpecForgeSettingsStatus({
    modelProfiles: [
      {
        name: "planner",
        provider: "openai-compatible",
        baseUrl: "https://api.example.test/v1",
        apiKey: "secret",
        model: "gpt-5.4",
        repositoryAccess: "read"
      }
    ],
    phaseModelAssignments: assignments(),
    effectivePhaseModelAssignments: effective({
      defaultProfileName: "planner"
    }),
    autoClarificationAnswersProfile: null,
    clarificationTolerance: "balanced",
    reviewTolerance: "balanced",
    watcherEnabled: true,
    attentionNotificationsEnabled: true,
    contextSuggestionsEnabled: true,
    requireExplicitApprovalBranchAcceptance: false,
    autoClarificationAnswersEnabled: true,
    autoPlayEnabled: false,
    destructiveRewindEnabled: false
  });

  assert.equal(status.executionConfigured, false);
  assert.equal(status.message, "SpecForge.AI needs an auto-clarification answers profile when model-driven clarification answers are enabled.");
});

test("buildBackendEnvironment serializes auto-clarification settings", () => {
  const env = buildBackendEnvironment({
    modelProfiles: [
      {
        name: "planner",
        provider: "openai-compatible",
        baseUrl: "https://api.example.test/v1",
        apiKey: "secret",
        model: "gpt-5.4",
        repositoryAccess: "read"
      }
    ],
    phaseModelAssignments: assignments({
      defaultProfile: "planner"
    }),
    effectivePhaseModelAssignments: effective({
      defaultProfileName: "planner"
    }),
    autoClarificationAnswersProfile: "planner",
    clarificationTolerance: "balanced",
    reviewTolerance: "balanced",
    watcherEnabled: true,
    attentionNotificationsEnabled: true,
    contextSuggestionsEnabled: true,
    requireExplicitApprovalBranchAcceptance: false,
    autoClarificationAnswersEnabled: true,
    autoPlayEnabled: false,
    destructiveRewindEnabled: false
  });

  assert.equal(env.SPECFORGE_AUTO_CLARIFICATION_ANSWERS_ENABLED, "true");
  assert.equal(env.SPECFORGE_AUTO_CLARIFICATION_ANSWERS_PROFILE, "planner");
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
  assert.equal(settings.autoClarificationAnswersEnabled, false);
  assert.equal(settings.autoClarificationAnswersProfile, null);
  assert.deepEqual(settings.phaseModelAssignments, assignments());
});
