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
    refinementProfile: null,
    specProfile: null,
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
    refinementProfileName: null,
    specProfileName: null,
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
    ["execution.refinementTolerance", " inferential "],
    ["execution.reviewTolerance", " strict "],
    ["ui.enableWatcher", false],
    ["ui.notifyOnAttention", true],
    ["features.enableContextSuggestions", true],
    ["features.requireApprovalBranchAcceptance", true],
    ["features.autoReviewEnabled", true],
    ["features.maxImplementationReviewCycles", 3],
    ["features.pauseOnFailedReview", true],
    ["features.completedUsLockOnCompleted", false]
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
      refinementProfileName: "light",
      specProfileName: "light",
      technicalDesignProfileName: "light",
      implementationProfileName: "top",
      reviewProfileName: "light",
      releaseApprovalProfileName: "light",
      prPreparationProfileName: "light"
    }),
    autoRefinementAnswersProfile: null,
    refinementTolerance: "inferential",
    reviewTolerance: "strict",
    workflowGraphLayoutMode: "vertical",
    watcherEnabled: false,
    attentionNotificationsEnabled: true,
    contextSuggestionsEnabled: true,
    requireExplicitApprovalBranchAcceptance: true,
    autoRefinementAnswersEnabled: false,
    autoPlayEnabled: false,
    autoReviewEnabled: true,
    maxImplementationReviewCycles: 3,
    destructiveRewindEnabled: false,
    pauseOnFailedReview: true,
    completedUsLockOnCompleted: false
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
    autoRefinementAnswersProfile: null,
    refinementTolerance: "strict",
    reviewTolerance: "inferential",
    workflowGraphLayoutMode: "vertical",
    watcherEnabled: true,
    attentionNotificationsEnabled: true,
    contextSuggestionsEnabled: true,
    requireExplicitApprovalBranchAcceptance: false,
    autoRefinementAnswersEnabled: false,
    autoPlayEnabled: false,
    autoReviewEnabled: false,
    maxImplementationReviewCycles: null,
    destructiveRewindEnabled: false,
    pauseOnFailedReview: false,
    completedUsLockOnCompleted: true
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
    SPECFORGE_REFINEMENT_TOLERANCE: "strict",
    SPECFORGE_REVIEW_TOLERANCE: "inferential",
    SPECFORGE_AUTO_REFINEMENT_ANSWERS_ENABLED: "false",
    SPECFORGE_COMPLETED_US_LOCK_ON_COMPLETED: "true"
  });
});

test("getSpecForgeSettingsStatus requires at least one model profile", () => {
  const status = getSpecForgeSettingsStatus({
    modelProfiles: [],
    phaseModelAssignments: assignments(),
    effectivePhaseModelAssignments: effective(),
    autoRefinementAnswersProfile: null,
    refinementTolerance: "balanced",
    reviewTolerance: "balanced",
    workflowGraphLayoutMode: "vertical",
    watcherEnabled: true,
    attentionNotificationsEnabled: true,
    contextSuggestionsEnabled: true,
    requireExplicitApprovalBranchAcceptance: false,
    autoRefinementAnswersEnabled: false,
    autoPlayEnabled: false,
    autoReviewEnabled: false,
    maxImplementationReviewCycles: null,
    destructiveRewindEnabled: false,
    pauseOnFailedReview: false,
    completedUsLockOnCompleted: true
  });

  assert.equal(status.executionConfigured, false);
  assert.equal(status.message, "SpecForge.AI needs at least one configured model profile before workflow stages can run.");
  assert.match(status.diagnostics, /profiles=0/);
});

test("getSpecForgeSettingsStatus rejects a single fallback profile when phase permissions are insufficient", () => {
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
    autoRefinementAnswersProfile: null,
    refinementTolerance: "balanced",
    reviewTolerance: "balanced",
    workflowGraphLayoutMode: "vertical",
    watcherEnabled: true,
    attentionNotificationsEnabled: true,
    contextSuggestionsEnabled: true,
    requireExplicitApprovalBranchAcceptance: false,
    autoRefinementAnswersEnabled: false,
    autoPlayEnabled: false,
    autoReviewEnabled: false,
    maxImplementationReviewCycles: null,
    destructiveRewindEnabled: false,
    pauseOnFailedReview: false,
    completedUsLockOnCompleted: true
  });

  assert.equal(status.executionConfigured, false);
  assert.equal(status.message, "Refinement requires repository access 'read', but profile 'light' only grants 'none'.");
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
    autoRefinementAnswersProfile: null,
    refinementTolerance: "balanced",
    reviewTolerance: "balanced",
    workflowGraphLayoutMode: "vertical",
    watcherEnabled: true,
    attentionNotificationsEnabled: true,
    contextSuggestionsEnabled: true,
    requireExplicitApprovalBranchAcceptance: false,
    autoRefinementAnswersEnabled: false,
    autoPlayEnabled: false,
    autoReviewEnabled: false,
    maxImplementationReviewCycles: null,
    destructiveRewindEnabled: false,
    pauseOnFailedReview: false,
    completedUsLockOnCompleted: true
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
        repositoryAccess: "read-write"
      }
    ],
    phaseModelAssignments: assignments(),
    effectivePhaseModelAssignments: effective(),
    autoRefinementAnswersProfile: null,
    refinementTolerance: "balanced",
    reviewTolerance: "balanced",
    workflowGraphLayoutMode: "vertical",
    watcherEnabled: true,
    attentionNotificationsEnabled: true,
    contextSuggestionsEnabled: true,
    requireExplicitApprovalBranchAcceptance: false,
    autoRefinementAnswersEnabled: false,
    autoPlayEnabled: false,
    autoReviewEnabled: false,
    maxImplementationReviewCycles: null,
    destructiveRewindEnabled: false,
    pauseOnFailedReview: false,
    completedUsLockOnCompleted: true
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
        repositoryAccess: "read-write"
      },
      {
        name: "fallback",
        provider: "copilot",
        baseUrl: "https://api.example.test/v1",
        apiKey: "secret",
        model: "gpt-4.1",
        repositoryAccess: "read"
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
    autoRefinementAnswersProfile: null,
    refinementTolerance: "balanced",
    reviewTolerance: "balanced",
    workflowGraphLayoutMode: "vertical",
    watcherEnabled: true,
    attentionNotificationsEnabled: true,
    contextSuggestionsEnabled: true,
    requireExplicitApprovalBranchAcceptance: false,
    autoRefinementAnswersEnabled: false,
    autoPlayEnabled: false,
    autoReviewEnabled: false,
    maxImplementationReviewCycles: null,
    destructiveRewindEnabled: false,
    pauseOnFailedReview: false,
    completedUsLockOnCompleted: true
  });

  assert.equal(status.executionConfigured, true);
  assert.equal(status.message, null);
  assert.match(status.diagnostics, /provider=codex/);
  assert.match(status.diagnostics, /provider=claude/);
  assert.match(status.diagnostics, /provider=copilot/);
});

test("getSpecForgeSettingsStatus allows native CLI providers without baseUrl apiKey or model", () => {
  for (const provider of ["codex", "claude", "copilot"]) {
    const status = getSpecForgeSettingsStatus({
      modelProfiles: [
        {
          name: `${provider}-main`,
          provider,
          baseUrl: "",
          apiKey: null,
          model: "",
          repositoryAccess: "read-write"
        }
      ],
      phaseModelAssignments: assignments(),
      effectivePhaseModelAssignments: effective({
        defaultProfileName: `${provider}-main`,
        implementationProfileName: `${provider}-main`,
        reviewProfileName: `${provider}-main`
      }),
      autoRefinementAnswersProfile: null,
      refinementTolerance: "balanced",
      reviewTolerance: "balanced",
      workflowGraphLayoutMode: "vertical",
      watcherEnabled: true,
      attentionNotificationsEnabled: true,
      contextSuggestionsEnabled: true,
      requireExplicitApprovalBranchAcceptance: false,
      autoRefinementAnswersEnabled: false,
      autoPlayEnabled: false,
      autoReviewEnabled: false,
      maxImplementationReviewCycles: null,
      destructiveRewindEnabled: false,
      pauseOnFailedReview: false,
      completedUsLockOnCompleted: true
    });

    assert.equal(status.executionConfigured, true);
    assert.equal(status.message, null);
    assert.match(status.diagnostics, new RegExp(`provider=${provider}`));
  }
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
    autoRefinementAnswersProfile: null,
    refinementTolerance: "balanced",
    reviewTolerance: "balanced",
    workflowGraphLayoutMode: "vertical",
    watcherEnabled: true,
    attentionNotificationsEnabled: true,
    contextSuggestionsEnabled: true,
    requireExplicitApprovalBranchAcceptance: false,
    autoRefinementAnswersEnabled: false,
    autoPlayEnabled: false,
    autoReviewEnabled: false,
    maxImplementationReviewCycles: null,
    destructiveRewindEnabled: false,
    pauseOnFailedReview: false,
    completedUsLockOnCompleted: true
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
    autoRefinementAnswersProfile: null,
    refinementTolerance: "balanced",
    reviewTolerance: "balanced",
    workflowGraphLayoutMode: "vertical",
    watcherEnabled: true,
    attentionNotificationsEnabled: true,
    contextSuggestionsEnabled: true,
    requireExplicitApprovalBranchAcceptance: false,
    autoRefinementAnswersEnabled: false,
    autoPlayEnabled: false,
    autoReviewEnabled: false,
    maxImplementationReviewCycles: null,
    destructiveRewindEnabled: false,
    pauseOnFailedReview: false,
    completedUsLockOnCompleted: true
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
      },
      {
        name: "reviewer",
        provider: "claude",
        baseUrl: "",
        apiKey: null,
        model: "",
        repositoryAccess: "read-write"
      }
    ],
    phaseModelAssignments: assignments({
      refinementProfile: "planner",
      specProfile: "planner",
      technicalDesignProfile: "planner",
      implementationProfile: "implementer",
      reviewProfile: "reviewer"
    }),
    effectivePhaseModelAssignments: effective({
      refinementProfileName: "planner",
      specProfileName: "planner",
      technicalDesignProfileName: "planner",
      implementationProfileName: "implementer",
      reviewProfileName: "reviewer"
    }),
    autoRefinementAnswersProfile: null,
    refinementTolerance: "balanced",
    reviewTolerance: "balanced",
    workflowGraphLayoutMode: "vertical",
    watcherEnabled: true,
    attentionNotificationsEnabled: true,
    contextSuggestionsEnabled: true,
    requireExplicitApprovalBranchAcceptance: false,
    autoRefinementAnswersEnabled: false,
    autoPlayEnabled: false,
    autoReviewEnabled: false,
    maxImplementationReviewCycles: null,
    destructiveRewindEnabled: false,
    pauseOnFailedReview: false,
    completedUsLockOnCompleted: true
  });

  assert.equal(status.executionConfigured, true);
  assert.equal(status.message, null);
});

test("getSpecForgeSettingsStatus rejects review when its assigned profile lacks repository write access", () => {
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
      defaultProfile: "planner",
      implementationProfile: "implementer",
      reviewProfile: "planner"
    }),
    effectivePhaseModelAssignments: effective({
      defaultProfileName: "planner",
      refinementProfileName: "planner",
      specProfileName: "planner",
      technicalDesignProfileName: "planner",
      implementationProfileName: "implementer",
      reviewProfileName: "planner"
    }),
    autoRefinementAnswersProfile: null,
    refinementTolerance: "balanced",
    reviewTolerance: "balanced",
    workflowGraphLayoutMode: "vertical",
    watcherEnabled: true,
    attentionNotificationsEnabled: true,
    contextSuggestionsEnabled: true,
    requireExplicitApprovalBranchAcceptance: false,
    autoRefinementAnswersEnabled: false,
    autoPlayEnabled: false,
    autoReviewEnabled: false,
    maxImplementationReviewCycles: null,
    destructiveRewindEnabled: false,
    pauseOnFailedReview: false,
    completedUsLockOnCompleted: true
  });

  assert.equal(status.executionConfigured, false);
  assert.equal(status.message, "Review requires repository access 'read-write', but profile 'planner' only grants 'read'.");
});

test("getSpecForgeSettingsStatus requires an explicit auto-refinement profile when enabled", () => {
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
    autoRefinementAnswersProfile: null,
    refinementTolerance: "balanced",
    reviewTolerance: "balanced",
    workflowGraphLayoutMode: "vertical",
    watcherEnabled: true,
    attentionNotificationsEnabled: true,
    contextSuggestionsEnabled: true,
    requireExplicitApprovalBranchAcceptance: false,
    autoRefinementAnswersEnabled: true,
    autoPlayEnabled: false,
    autoReviewEnabled: false,
    maxImplementationReviewCycles: null,
    destructiveRewindEnabled: false,
    pauseOnFailedReview: false,
    completedUsLockOnCompleted: true
  });

  assert.equal(status.executionConfigured, false);
  assert.equal(status.message, "SpecForge.AI needs an auto-refinement answers profile when model-driven refinement answers are enabled.");
});

test("buildBackendEnvironment serializes auto-refinement settings", () => {
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
    autoRefinementAnswersProfile: "planner",
    refinementTolerance: "balanced",
    reviewTolerance: "balanced",
    workflowGraphLayoutMode: "vertical",
    watcherEnabled: true,
    attentionNotificationsEnabled: true,
    contextSuggestionsEnabled: true,
    requireExplicitApprovalBranchAcceptance: false,
    autoRefinementAnswersEnabled: true,
    autoPlayEnabled: false,
    autoReviewEnabled: false,
    maxImplementationReviewCycles: null,
    destructiveRewindEnabled: false,
    pauseOnFailedReview: false,
    completedUsLockOnCompleted: true
  });

  assert.equal(env.SPECFORGE_AUTO_REFINEMENT_ANSWERS_ENABLED, "true");
  assert.equal(env.SPECFORGE_AUTO_REFINEMENT_ANSWERS_PROFILE, "planner");
});

test("readSpecForgeSettings falls back to balanced refinement tolerance for unsupported values", () => {
  const settings = readSpecForgeSettings({
    get<T>(section: string, defaultValue?: T): T {
      if (section === "execution.refinementTolerance" || section === "execution.reviewTolerance") {
        return "chaotic" as T;
      }

      return (defaultValue as T);
    }
  });

  assert.equal(settings.refinementTolerance, "balanced");
  assert.equal(settings.reviewTolerance, "balanced");
  assert.equal(settings.requireExplicitApprovalBranchAcceptance, false);
  assert.equal(settings.autoRefinementAnswersEnabled, false);
  assert.equal(settings.autoRefinementAnswersProfile, null);
  assert.deepEqual(settings.phaseModelAssignments, assignments());
});
