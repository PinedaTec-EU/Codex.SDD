"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSpecForgeSettings = getSpecForgeSettings;
exports.readSpecForgeSettings = readSpecForgeSettings;
exports.buildBackendEnvironment = buildBackendEnvironment;
exports.getSpecForgeSettingsStatus = getSpecForgeSettingsStatus;
const executionSettingsModel_1 = require("./executionSettingsModel");
function getSpecForgeSettings() {
    const vscode = require("vscode");
    return readSpecForgeSettings(vscode.workspace.getConfiguration("specForge"));
}
function readSpecForgeSettings(configuration) {
    const modelProfiles = normalizeModelProfiles(configuration.get("execution.modelProfiles", []));
    const phaseModelAssignments = normalizePhaseModelAssignments(configuration.get("execution.phaseModels"));
    const autoRefinementAnswersProfile = normalizeUnknownOptional(configuration.get("execution.autoRefinementAnswersProfile"));
    return {
        modelProfiles,
        phaseModelAssignments,
        effectivePhaseModelAssignments: resolveEffectivePhaseModelAssignments(modelProfiles, phaseModelAssignments),
        autoRefinementAnswersProfile,
        refinementTolerance: normalizeTolerance(configuration.get("execution.refinementTolerance", "balanced")),
        reviewTolerance: normalizeTolerance(configuration.get("execution.reviewTolerance", "balanced")),
        workflowGraphLayoutMode: configuration.get("ui.workflowGraphLayoutMode", "vertical") === "horizontal"
            ? "horizontal"
            : "vertical",
        workflowGraphInitialZoomMode: configuration.get("ui.workflowGraphInitialZoomMode", "actual-size") === "fit-width"
            ? "fit-width"
            : "actual-size",
        userStoryListViewMode: configuration.get("ui.userStoryListViewMode", "category") === "phase"
            ? "phase"
            : "category",
        visualTimelineEnabled: configuration.get("ui.visualTimelineEnabled", false),
        watcherEnabled: configuration.get("ui.enableWatcher", true),
        attentionNotificationsEnabled: configuration.get("ui.notifyOnAttention", true),
        contextSuggestionsEnabled: configuration.get("features.enableContextSuggestions", true),
        requireExplicitApprovalBranchAcceptance: configuration.get("features.requireApprovalBranchAcceptance", false),
        autoRefinementAnswersEnabled: configuration.get("features.autoRefinementAnswersEnabled", false),
        autoPlayEnabled: configuration.get("features.autoPlayEnabled", false),
        autoReviewEnabled: configuration.get("features.autoReviewEnabled", false),
        maxImplementationReviewCycles: normalizeOptionalPositiveInteger(configuration.get("features.maxImplementationReviewCycles", 5)),
        destructiveRewindEnabled: configuration.get("features.destructiveRewindEnabled", false),
        pauseOnFailedReview: configuration.get("features.pauseOnFailedReview", false),
        reviewLearningEnabled: configuration.get("features.reviewLearningEnabled", true),
        reviewLearningSkillPath: normalizeUnknownOptional(configuration.get("features.reviewLearningSkillPath", ".codex/skills/sdd-phase-agents/SKILL.md")),
        completedUsLockOnCompleted: configuration.get("features.completedUsLockOnCompleted", false)
    };
}
function buildBackendEnvironment(settings) {
    const env = {};
    if (settings.modelProfiles.length > 0) {
        env.SPECFORGE_OPENAI_MODEL_PROFILES_JSON = JSON.stringify(settings.modelProfiles);
        env.SPECFORGE_OPENAI_PHASE_MODEL_ASSIGNMENTS_JSON = JSON.stringify(settings.phaseModelAssignments);
    }
    env.SPECFORGE_REFINEMENT_TOLERANCE = settings.refinementTolerance;
    env.SPECFORGE_REVIEW_TOLERANCE = settings.reviewTolerance;
    env.SPECFORGE_AUTO_REFINEMENT_ANSWERS_ENABLED = settings.autoRefinementAnswersEnabled ? "true" : "false";
    env.SPECFORGE_REVIEW_LEARNING_ENABLED = settings.reviewLearningEnabled === false ? "false" : "true";
    env.SPECFORGE_REVIEW_LEARNING_SKILL_PATH =
        settings.reviewLearningSkillPath ?? ".codex/skills/sdd-phase-agents/SKILL.md";
    env.SPECFORGE_COMPLETED_US_LOCK_ON_COMPLETED = settings.completedUsLockOnCompleted ? "true" : "false";
    if (settings.autoRefinementAnswersProfile) {
        env.SPECFORGE_AUTO_REFINEMENT_ANSWERS_PROFILE = settings.autoRefinementAnswersProfile;
    }
    return env;
}
function getSpecForgeSettingsStatus(settings) {
    if (settings.modelProfiles.length === 0) {
        return {
            executionConfigured: false,
            message: "SpecForge.AI needs at least one configured model profile before workflow stages can run.",
            diagnostics: buildSettingsDiagnostics(settings)
        };
    }
    return getModelProfileSettingsStatus(settings);
}
const defaultModelProvider = "openai-compatible";
const supportedModelProviders = new Set(["openai-compatible", "codex", "copilot", "claude"]);
const nativeCliModelProviders = new Set(["codex", "copilot", "claude"]);
function getModelProfileSettingsStatus(settings) {
    const profilesByName = new Map();
    const diagnostics = buildSettingsDiagnostics(settings);
    for (const profile of settings.modelProfiles) {
        const duplicate = profilesByName.has(profile.name);
        profilesByName.set(profile.name, profile);
        if (!profile.name) {
            return {
                executionConfigured: false,
                message: "SpecForge.AI found a model profile without a name.",
                diagnostics
            };
        }
        if (!supportedModelProviders.has(profile.provider)) {
            return {
                executionConfigured: false,
                message: `SpecForge.AI model profile '${profile.name}' uses unsupported provider '${profile.provider}'.`,
                diagnostics
            };
        }
        if (duplicate) {
            return {
                executionConfigured: false,
                message: `SpecForge.AI found duplicate model profile name '${profile.name}'.`,
                diagnostics
            };
        }
        if (!isNativeCliModelProvider(profile.provider) && !profile.baseUrl) {
            return {
                executionConfigured: false,
                message: `SpecForge.AI model profile '${profile.name}' is missing base URL.`,
                diagnostics
            };
        }
        if (!isNativeCliModelProvider(profile.provider) && !profile.model) {
            return {
                executionConfigured: false,
                message: `SpecForge.AI model profile '${profile.name}' is missing model.`,
                diagnostics
            };
        }
        if (!isNativeCliModelProvider(profile.provider) && !profile.apiKey && !isLocalOpenAiCompatibleEndpoint(profile.baseUrl)) {
            return {
                executionConfigured: false,
                message: `SpecForge.AI model profile '${profile.name}' needs an API key for a remote base URL.`,
                diagnostics
            };
        }
    }
    const defaultProfileName = settings.phaseModelAssignments.defaultProfile
        ?? (settings.modelProfiles.length === 1 ? settings.modelProfiles[0]?.name ?? null : null);
    if (!defaultProfileName && !hasExplicitProfilesForAllModelDrivenPhases(settings.phaseModelAssignments)) {
        return {
            executionConfigured: false,
            message: "SpecForge.AI needs either a default phase model assignment or explicit profiles for refinement, spec, technical design, implementation, and review.",
            diagnostics
        };
    }
    const namedAssignments = [
        ["default", defaultProfileName],
        ["refinement", settings.phaseModelAssignments.refinementProfile],
        ["spec", settings.phaseModelAssignments.specProfile],
        ["technicalDesign", settings.phaseModelAssignments.technicalDesignProfile],
        ["implementation", settings.phaseModelAssignments.implementationProfile],
        ["review", settings.phaseModelAssignments.reviewProfile],
        ["releaseApproval", settings.phaseModelAssignments.releaseApprovalProfile],
        ["prPreparation", settings.phaseModelAssignments.prPreparationProfile]
    ];
    for (const [assignmentName, profileName] of namedAssignments) {
        if (profileName && !profilesByName.has(profileName)) {
            return {
                executionConfigured: false,
                message: `SpecForge.AI phase model assignment '${assignmentName}' references unknown profile '${profileName}'.`,
                diagnostics
            };
        }
    }
    if (settings.autoRefinementAnswersEnabled && !settings.autoRefinementAnswersProfile) {
        return {
            executionConfigured: false,
            message: "SpecForge.AI needs an auto-refinement answers profile when model-driven refinement answers are enabled.",
            diagnostics
        };
    }
    if (settings.autoRefinementAnswersProfile && !profilesByName.has(settings.autoRefinementAnswersProfile)) {
        return {
            executionConfigured: false,
            message: `SpecForge.AI auto-refinement answers profile references unknown profile '${settings.autoRefinementAnswersProfile}'.`,
            diagnostics
        };
    }
    const permissionIssues = (0, executionSettingsModel_1.validatePhasePermissionAssignments)(settings.modelProfiles, settings.phaseModelAssignments);
    if (permissionIssues.length > 0) {
        return {
            executionConfigured: false,
            message: permissionIssues[0]?.message ?? "SpecForge.AI found a phase model permission mismatch.",
            diagnostics
        };
    }
    return {
        executionConfigured: true,
        message: null,
        diagnostics
    };
}
function isNativeCliModelProvider(provider) {
    return nativeCliModelProviders.has(provider);
}
function hasExplicitProfilesForAllModelDrivenPhases(assignments) {
    return [
        assignments.refinementProfile,
        assignments.specProfile,
        assignments.technicalDesignProfile,
        assignments.implementationProfile,
        assignments.reviewProfile
    ].every((value) => Boolean(value));
}
function normalizeOptionalPositiveInteger(value) {
    if (typeof value === "number" && Number.isFinite(value)) {
        const normalized = Math.trunc(value);
        return normalized > 0 ? normalized : null;
    }
    if (typeof value === "string") {
        const trimmed = value.trim();
        if (trimmed.length === 0) {
            return null;
        }
        const parsed = Number.parseInt(trimmed, 10);
        return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
    }
    return null;
}
function buildSettingsDiagnostics(settings) {
    const profiles = settings.modelProfiles.map((profile) => `${profile.name || "<missing-name>"}{provider=${profile.provider || "<missing>"},baseUrl=${profile.baseUrl || "<missing>"},model=${profile.model || "<missing>"}${profile.reasoningEffort ? `,reasoningEffort=${profile.reasoningEffort}` : ""},apiKey=${profile.apiKey ? "set" : "empty"},repositoryAccess=${profile.repositoryAccess || "<missing>"}}`);
    return [
        `profiles=${settings.modelProfiles.length}`,
        `catalog=[${profiles.join(", ")}]`,
        `phaseModels.default=${settings.phaseModelAssignments.defaultProfile ?? "<unset>"}`,
        `phaseModels.refinement=${settings.phaseModelAssignments.refinementProfile ?? "<unset>"}`,
        `phaseModels.spec=${settings.phaseModelAssignments.specProfile ?? "<unset>"}`,
        `phaseModels.technicalDesign=${settings.phaseModelAssignments.technicalDesignProfile ?? "<unset>"}`,
        `phaseModels.implementation=${settings.phaseModelAssignments.implementationProfile ?? "<unset>"}`,
        `phaseModels.review=${settings.phaseModelAssignments.reviewProfile ?? "<unset>"}`,
        `phaseModels.releaseApproval=${settings.phaseModelAssignments.releaseApprovalProfile ?? "<unset>"}`,
        `phaseModels.prPreparation=${settings.phaseModelAssignments.prPreparationProfile ?? "<unset>"}`,
        `autoRefinementAnswers.enabled=${settings.autoRefinementAnswersEnabled}`,
        `autoRefinementAnswers.profile=${settings.autoRefinementAnswersProfile ?? "<unset>"}`,
        `autoReviewEnabled=${settings.autoReviewEnabled}`,
        `maxImplementationReviewCycles=${settings.maxImplementationReviewCycles ?? "<unset>"}`,
        `pauseOnFailedReview=${settings.pauseOnFailedReview}`,
        `reviewLearningEnabled=${settings.reviewLearningEnabled === false ? false : true}`,
        `reviewLearningSkillPath=${settings.reviewLearningSkillPath ?? "<unset>"}`,
        `effective.default=${settings.effectivePhaseModelAssignments.defaultProfileName ?? "<unset>"}`,
        `effective.refinement=${settings.effectivePhaseModelAssignments.refinementProfileName ?? "<unset>"}`,
        `effective.spec=${settings.effectivePhaseModelAssignments.specProfileName ?? "<unset>"}`,
        `effective.technicalDesign=${settings.effectivePhaseModelAssignments.technicalDesignProfileName ?? "<unset>"}`,
        `effective.implementation=${settings.effectivePhaseModelAssignments.implementationProfileName ?? "<unset>"}`,
        `effective.review=${settings.effectivePhaseModelAssignments.reviewProfileName ?? "<unset>"}`,
        `effective.releaseApproval=${settings.effectivePhaseModelAssignments.releaseApprovalProfileName ?? "<unset>"}`,
        `effective.prPreparation=${settings.effectivePhaseModelAssignments.prPreparationProfileName ?? "<unset>"}`
    ].join("; ");
}
function normalizeOptional(value) {
    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
}
function normalizeRepositoryAccess(value) {
    const normalized = normalizeUnknownOptional(value)?.toLowerCase();
    return normalized === "read-write" || normalized === "readwrite" || normalized === "write"
        ? "read-write"
        : normalized === "read"
            ? "read"
            : normalized === "none"
                ? "none"
                : null;
}
function normalizeModelProfiles(value) {
    if (!Array.isArray(value)) {
        return [];
    }
    return value
        .map((entry) => normalizeModelProfile(entry))
        .filter((entry) => entry !== null);
}
function normalizeModelProfile(value) {
    if (!value || typeof value !== "object") {
        return null;
    }
    const candidate = value;
    const provider = normalizeUnknownOptional(candidate.provider)?.toLowerCase() ?? null;
    const name = normalizeUnknownOptional(candidate.name);
    const baseUrl = normalizeUnknownOptional(candidate.baseUrl);
    const apiKey = normalizeUnknownOptional(candidate.apiKey);
    const model = normalizeUnknownOptional(candidate.model);
    const reasoningEffort = normalizeReasoningEffort(candidate.reasoningEffort);
    const repositoryAccess = normalizeRepositoryAccess(candidate.repositoryAccess);
    if (!provider && !name && !baseUrl && !apiKey && !model && !reasoningEffort && !repositoryAccess) {
        return null;
    }
    return {
        name: name ?? "",
        provider: provider ?? defaultModelProvider,
        baseUrl: baseUrl ?? "",
        apiKey,
        model: model ?? "",
        ...(reasoningEffort ? { reasoningEffort } : {}),
        repositoryAccess: repositoryAccess ?? "none"
    };
}
function normalizePhaseModelAssignments(value) {
    if (!value || typeof value !== "object") {
        return {
            defaultProfile: null,
            refinementProfile: null,
            specProfile: null,
            technicalDesignProfile: null,
            implementationProfile: null,
            reviewProfile: null,
            releaseApprovalProfile: null,
            prPreparationProfile: null
        };
    }
    const candidate = value;
    return {
        defaultProfile: normalizeUnknownOptional(candidate.defaultProfile),
        refinementProfile: normalizeUnknownOptional(candidate.refinementProfile),
        specProfile: normalizeUnknownOptional(candidate.specProfile),
        technicalDesignProfile: normalizeUnknownOptional(candidate.technicalDesignProfile),
        implementationProfile: normalizeUnknownOptional(candidate.implementationProfile),
        reviewProfile: normalizeUnknownOptional(candidate.reviewProfile),
        releaseApprovalProfile: normalizeUnknownOptional(candidate.releaseApprovalProfile),
        prPreparationProfile: normalizeUnknownOptional(candidate.prPreparationProfile)
    };
}
function resolveEffectivePhaseModelAssignments(modelProfiles, assignments) {
    const defaultProfile = resolveDefaultModelProfile(modelProfiles, assignments);
    const defaultProfileName = defaultProfile?.name ?? null;
    const refinementProfileName = resolveAssignedModelProfile(modelProfiles, assignments.refinementProfile)?.name ?? defaultProfileName;
    const specProfileName = resolveAssignedModelProfile(modelProfiles, assignments.specProfile)?.name ?? defaultProfileName;
    const technicalDesignProfileName = resolveAssignedModelProfile(modelProfiles, assignments.technicalDesignProfile)?.name ?? defaultProfileName;
    const implementationProfileName = resolveAssignedModelProfile(modelProfiles, assignments.implementationProfile)?.name ?? defaultProfileName;
    const reviewProfileName = resolveAssignedModelProfile(modelProfiles, assignments.reviewProfile)?.name ?? defaultProfileName;
    const releaseApprovalProfileName = resolveAssignedModelProfile(modelProfiles, assignments.releaseApprovalProfile)?.name ?? defaultProfileName;
    const prPreparationProfileName = resolveAssignedModelProfile(modelProfiles, assignments.prPreparationProfile)?.name ?? defaultProfileName;
    return {
        defaultProfileName,
        refinementProfileName,
        specProfileName,
        technicalDesignProfileName,
        implementationProfileName,
        reviewProfileName,
        releaseApprovalProfileName,
        prPreparationProfileName
    };
}
function resolveDefaultModelProfile(modelProfiles, assignments) {
    const explicitDefault = resolveAssignedModelProfile(modelProfiles, assignments.defaultProfile);
    if (explicitDefault) {
        return explicitDefault;
    }
    return modelProfiles.length === 1 ? modelProfiles[0] : null;
}
function resolveAssignedModelProfile(modelProfiles, profileName) {
    if (!profileName) {
        return null;
    }
    return modelProfiles.find((profile) => profile.name === profileName) ?? null;
}
function normalizeUnknownOptional(value) {
    return typeof value === "string" ? normalizeOptional(value) : null;
}
function normalizeTolerance(value) {
    const normalized = value?.trim().toLowerCase();
    return normalized === "strict" || normalized === "inferential" ? normalized : "balanced";
}
function normalizeReasoningEffort(value) {
    const normalized = normalizeUnknownOptional(value)?.toLowerCase();
    return normalized === "none"
        || normalized === "minimal"
        || normalized === "low"
        || normalized === "medium"
        || normalized === "high"
        || normalized === "xhigh"
        ? normalized
        : null;
}
function isLocalOpenAiCompatibleEndpoint(baseUrl) {
    if (!baseUrl) {
        return false;
    }
    try {
        const parsed = new URL(baseUrl);
        return parsed.hostname === "localhost"
            || parsed.hostname === "127.0.0.1"
            || parsed.hostname === "::1"
            || parsed.hostname === "0.0.0.0";
    }
    catch {
        return false;
    }
}
//# sourceMappingURL=extensionSettings.js.map