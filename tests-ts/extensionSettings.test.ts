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
    defaultAgent: null,
    captureAgent: null,
    refinementAgent: null,
    specAgent: null,
    technicalDesignAgent: null,
    implementationAgent: null,
    reviewAgent: null,
    releaseApprovalAgent: null,
    prPreparationAgent: null
  };
}

function emptyEffectiveAssignments() {
  return {
    defaultAgentName: null,
    captureAgentName: null,
    refinementAgentName: null,
    specAgentName: null,
    technicalDesignAgentName: null,
    implementationAgentName: null,
    reviewAgentName: null,
    releaseApprovalAgentName: null,
    prPreparationAgentName: null
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
    ["execution.phaseAgents", {
      defaultAgent: " light ",
      implementationAgent: " top ",
      reviewAgent: " light "
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
    phaseAgentAssignments: assignments({
      defaultAgent: "light",
      implementationAgent: "top",
      reviewAgent: "light"
    }),
    effectivePhaseAgentAssignments: effective({
      defaultAgentName: "light",
      captureAgentName: "light",
      refinementAgentName: "light",
      specAgentName: "light",
      technicalDesignAgentName: "light",
      implementationAgentName: "top",
      reviewAgentName: "light",
      releaseApprovalAgentName: "light",
      prPreparationAgentName: "light"
    }),
    autoRefinementAnswersProfile: null,
    refinementTolerance: "inferential",
    reviewTolerance: "strict",
    workflowGraphLayoutMode: "vertical",
    workflowGraphInitialZoomMode: "actual-size",
    visualTimelineEnabled: false,
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

test("readSpecForgeSettings normalizes workflow graph initial zoom preference", () => {
  const fitWidthSettings = readSpecForgeSettings({
    get<T>(section: string, defaultValue?: T): T {
      return (section === "ui.workflowGraphInitialZoomMode" ? "fit-width" : defaultValue) as T;
    }
  });
  const unsupportedSettings = readSpecForgeSettings({
    get<T>(section: string, defaultValue?: T): T {
      return (section === "ui.workflowGraphInitialZoomMode" ? "unknown" : defaultValue) as T;
    }
  });

  assert.equal(fitWidthSettings.workflowGraphInitialZoomMode, "fit-width");
  assert.equal(unsupportedSettings.workflowGraphInitialZoomMode, "actual-size");
});

test("buildBackendEnvironment serializes model profiles, agent profiles, and assignments", () => {
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
    phaseAgentAssignments: assignments({
      defaultAgent: "light",
      implementationAgent: "top",
      reviewAgent: "light"
    }),
    effectivePhaseAgentAssignments: effective({
      defaultAgentName: "light",
      implementationAgentName: "top",
      reviewAgentName: "light"
    }),
    autoRefinementAnswersProfile: null,
    refinementTolerance: "strict",
    reviewTolerance: "inferential",
    workflowGraphLayoutMode: "vertical",
    workflowGraphInitialZoomMode: "actual-size",
    visualTimelineEnabled: false,
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
    SPECFORGE_OPENAI_AGENT_PROFILES_JSON: JSON.stringify([
      {
        name: "light",
        role: "light",
        modelProfile: "light",
        instructions: "",
        repositoryAccess: "none"
      },
      {
        name: "top",
        role: "top",
        modelProfile: "top",
        instructions: "",
        repositoryAccess: "read-write"
      }
    ]),
    SPECFORGE_OPENAI_PHASE_AGENT_ASSIGNMENTS_JSON: JSON.stringify(assignments({
      defaultAgent: "light",
      implementationAgent: "top",
      reviewAgent: "light"
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
    phaseAgentAssignments: assignments(),
    effectivePhaseAgentAssignments: effective(),
    autoRefinementAnswersProfile: null,
    refinementTolerance: "balanced",
    reviewTolerance: "balanced",
    workflowGraphLayoutMode: "vertical",
    workflowGraphInitialZoomMode: "actual-size",
    visualTimelineEnabled: false,
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
  assert.match(status.diagnostics, /modelProfiles=0/);
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
    phaseAgentAssignments: assignments(),
    effectivePhaseAgentAssignments: effective({
      defaultAgentName: "light",
      implementationAgentName: "light",
      reviewAgentName: "light"
    }),
    autoRefinementAnswersProfile: null,
    refinementTolerance: "balanced",
    reviewTolerance: "balanced",
    workflowGraphLayoutMode: "vertical",
    workflowGraphInitialZoomMode: "actual-size",
    visualTimelineEnabled: false,
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
  assert.equal(status.message, "Refinement requires repository access 'read', but agent 'light' only grants 'none'.");
  assert.match(status.diagnostics, /models=\[light\{provider=openai-compatible,baseUrl=http:\/\/localhost:11434\/v1,model=llama3\.1,apiKey=empty\}\]/);
  assert.match(status.diagnostics, /agents=\[light\{role=light,modelProfile=light,repositoryAccess=none\}\]/);
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
    phaseAgentAssignments: assignments(),
    effectivePhaseAgentAssignments: effective({
      defaultAgentName: "light",
      implementationAgentName: "light",
      reviewAgentName: "light"
    }),
    autoRefinementAnswersProfile: null,
    refinementTolerance: "balanced",
    reviewTolerance: "balanced",
    workflowGraphLayoutMode: "vertical",
    workflowGraphInitialZoomMode: "actual-size",
    visualTimelineEnabled: false,
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
    phaseAgentAssignments: assignments(),
    effectivePhaseAgentAssignments: effective(),
    autoRefinementAnswersProfile: null,
    refinementTolerance: "balanced",
    reviewTolerance: "balanced",
    workflowGraphLayoutMode: "vertical",
    workflowGraphInitialZoomMode: "actual-size",
    visualTimelineEnabled: false,
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
    phaseAgentAssignments: assignments({
      defaultAgent: "fallback",
      implementationAgent: "implementer",
      reviewAgent: "reviewer"
    }),
    effectivePhaseAgentAssignments: effective({
      defaultAgentName: "fallback",
      implementationAgentName: "implementer",
      reviewAgentName: "reviewer"
    }),
    autoRefinementAnswersProfile: null,
    refinementTolerance: "balanced",
    reviewTolerance: "balanced",
    workflowGraphLayoutMode: "vertical",
    workflowGraphInitialZoomMode: "actual-size",
    visualTimelineEnabled: false,
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
      phaseAgentAssignments: assignments(),
      effectivePhaseAgentAssignments: effective({
        defaultAgentName: `${provider}-main`,
        implementationAgentName: `${provider}-main`,
        reviewAgentName: `${provider}-main`
      }),
      autoRefinementAnswersProfile: null,
      refinementTolerance: "balanced",
      reviewTolerance: "balanced",
      workflowGraphLayoutMode: "vertical",
      workflowGraphInitialZoomMode: "actual-size",
      visualTimelineEnabled: false,
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
    phaseAgentAssignments: assignments(),
    effectivePhaseAgentAssignments: effective(),
    autoRefinementAnswersProfile: null,
    refinementTolerance: "balanced",
    reviewTolerance: "balanced",
    workflowGraphLayoutMode: "vertical",
    workflowGraphInitialZoomMode: "actual-size",
    visualTimelineEnabled: false,
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
    phaseAgentAssignments: assignments({
      defaultAgent: "missing"
    }),
    effectivePhaseAgentAssignments: effective(),
    autoRefinementAnswersProfile: null,
    refinementTolerance: "balanced",
    reviewTolerance: "balanced",
    workflowGraphLayoutMode: "vertical",
    workflowGraphInitialZoomMode: "actual-size",
    visualTimelineEnabled: false,
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
  assert.equal(status.message, "SpecForge.AI phase agent assignment 'default' references unknown agent 'missing'.");
  assert.match(status.diagnostics, /phaseAgents\.default=missing/);
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
    phaseAgentAssignments: assignments({
      refinementAgent: "planner",
      specAgent: "planner",
      technicalDesignAgent: "planner",
      implementationAgent: "implementer",
      reviewAgent: "reviewer"
    }),
    effectivePhaseAgentAssignments: effective({
      refinementAgentName: "planner",
      specAgentName: "planner",
      technicalDesignAgentName: "planner",
      implementationAgentName: "implementer",
      reviewAgentName: "reviewer"
    }),
    autoRefinementAnswersProfile: null,
    refinementTolerance: "balanced",
    reviewTolerance: "balanced",
    workflowGraphLayoutMode: "vertical",
    workflowGraphInitialZoomMode: "actual-size",
    visualTimelineEnabled: false,
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
    phaseAgentAssignments: assignments({
      defaultAgent: "planner",
      implementationAgent: "implementer",
      reviewAgent: "planner"
    }),
    effectivePhaseAgentAssignments: effective({
      defaultAgentName: "planner",
      refinementAgentName: "planner",
      specAgentName: "planner",
      technicalDesignAgentName: "planner",
      implementationAgentName: "implementer",
      reviewAgentName: "planner"
    }),
    autoRefinementAnswersProfile: null,
    refinementTolerance: "balanced",
    reviewTolerance: "balanced",
    workflowGraphLayoutMode: "vertical",
    workflowGraphInitialZoomMode: "actual-size",
    visualTimelineEnabled: false,
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
  assert.equal(status.message, "Review requires repository access 'read-write', but agent 'planner' only grants 'read'.");
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
    phaseAgentAssignments: assignments(),
    effectivePhaseAgentAssignments: effective({
      defaultAgentName: "planner"
    }),
    autoRefinementAnswersProfile: null,
    refinementTolerance: "balanced",
    reviewTolerance: "balanced",
    workflowGraphLayoutMode: "vertical",
    workflowGraphInitialZoomMode: "actual-size",
    visualTimelineEnabled: false,
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
  assert.equal(status.message, "SpecForge.AI needs an auto-refinement answers agent when model-driven refinement answers are enabled.");
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
    phaseAgentAssignments: assignments({
      defaultAgent: "planner"
    }),
    effectivePhaseAgentAssignments: effective({
      defaultAgentName: "planner"
    }),
    autoRefinementAnswersProfile: "planner",
    refinementTolerance: "balanced",
    reviewTolerance: "balanced",
    workflowGraphLayoutMode: "vertical",
    workflowGraphInitialZoomMode: "actual-size",
    visualTimelineEnabled: false,
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
  assert.deepEqual(settings.phaseAgentAssignments, assignments());
});
