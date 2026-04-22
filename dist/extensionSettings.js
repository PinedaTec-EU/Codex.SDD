"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSpecForgeSettings = getSpecForgeSettings;
exports.readSpecForgeSettings = readSpecForgeSettings;
exports.buildBackendEnvironment = buildBackendEnvironment;
exports.getSpecForgeSettingsStatus = getSpecForgeSettingsStatus;
function getSpecForgeSettings() {
    const vscode = require("vscode");
    return readSpecForgeSettings(vscode.workspace.getConfiguration("specForge"));
}
function readSpecForgeSettings(configuration) {
    const modelProfiles = normalizeModelProfiles(configuration.get("execution.modelProfiles", []));
    const phaseModelAssignments = normalizePhaseModelAssignments(configuration.get("execution.phaseModels"));
    return {
        provider: configuration.get("execution.provider", "deterministic"),
        baseUrl: normalizeOptional(configuration.get("execution.baseUrl")),
        apiKey: normalizeOptional(configuration.get("execution.apiKey")),
        model: normalizeOptional(configuration.get("execution.model")),
        modelProfiles,
        phaseModelAssignments,
        effectivePhaseModelAssignments: resolveEffectivePhaseModelAssignments(modelProfiles, phaseModelAssignments, normalizeOptional(configuration.get("execution.model"))),
        clarificationTolerance: normalizeTolerance(configuration.get("execution.clarificationTolerance", "balanced")),
        reviewTolerance: normalizeTolerance(configuration.get("execution.reviewTolerance", "balanced")),
        watcherEnabled: configuration.get("ui.enableWatcher", true),
        attentionNotificationsEnabled: configuration.get("ui.notifyOnAttention", true),
        contextSuggestionsEnabled: configuration.get("features.enableContextSuggestions", true),
        requireExplicitApprovalBranchAcceptance: configuration.get("features.requireApprovalBranchAcceptance", false),
        autoPlayEnabled: configuration.get("features.autoPlayEnabled", false),
        destructiveRewindEnabled: configuration.get("features.destructiveRewindEnabled", false)
    };
}
function buildBackendEnvironment(settings) {
    const env = {
        SPECFORGE_PHASE_PROVIDER: settings.provider
    };
    const legacyFallback = settings.modelProfiles.length > 0
        ? resolveDefaultModelProfile(settings.modelProfiles, settings.phaseModelAssignments)
        : null;
    const effectiveBaseUrl = legacyFallback?.baseUrl ?? settings.baseUrl;
    const effectiveApiKey = legacyFallback?.apiKey ?? settings.apiKey;
    const effectiveModel = legacyFallback?.model ?? settings.model;
    if (effectiveBaseUrl) {
        env.SPECFORGE_OPENAI_BASE_URL = effectiveBaseUrl;
    }
    if (effectiveApiKey) {
        env.SPECFORGE_OPENAI_API_KEY = effectiveApiKey;
    }
    if (effectiveModel) {
        env.SPECFORGE_OPENAI_MODEL = effectiveModel;
    }
    if (settings.modelProfiles.length > 0) {
        env.SPECFORGE_OPENAI_MODEL_PROFILES_JSON = JSON.stringify(settings.modelProfiles);
        env.SPECFORGE_OPENAI_PHASE_MODEL_ASSIGNMENTS_JSON = JSON.stringify(settings.phaseModelAssignments);
    }
    env.SPECFORGE_CAPTURE_TOLERANCE = settings.clarificationTolerance;
    env.SPECFORGE_REVIEW_TOLERANCE = settings.reviewTolerance;
    return env;
}
function getSpecForgeSettingsStatus(settings) {
    if (settings.provider === "deterministic") {
        return {
            executionConfigured: false,
            message: "SpecForge.AI needs an SLM/LLM execution provider before workflow stages can run. Select an OpenAI-compatible provider and configure either base URL, API key, and model or a model profile catalog."
        };
    }
    if (settings.modelProfiles.length > 0) {
        return getModelProfileSettingsStatus(settings);
    }
    const requiresApiKey = !isLocalOpenAiCompatibleEndpoint(settings.baseUrl);
    const missingFields = [
        settings.baseUrl ? null : "base URL",
        requiresApiKey && !settings.apiKey ? "API key" : null,
        settings.model ? null : "model"
    ].filter((value) => value !== null);
    if (settings.provider === "openai-compatible" && missingFields.length === 0) {
        return {
            executionConfigured: true,
            message: null
        };
    }
    return {
        executionConfigured: false,
        message: `SpecForge.AI is not configured for the current provider. Missing ${missingFields.join(", ")}.`
    };
}
function getModelProfileSettingsStatus(settings) {
    const profilesByName = new Map();
    for (const profile of settings.modelProfiles) {
        const duplicate = profilesByName.has(profile.name);
        profilesByName.set(profile.name, profile);
        if (!profile.name) {
            return {
                executionConfigured: false,
                message: "SpecForge.AI found a model profile without a name."
            };
        }
        if (duplicate) {
            return {
                executionConfigured: false,
                message: `SpecForge.AI found duplicate model profile name '${profile.name}'.`
            };
        }
        if (!profile.baseUrl) {
            return {
                executionConfigured: false,
                message: `SpecForge.AI model profile '${profile.name}' is missing base URL.`
            };
        }
        if (!profile.model) {
            return {
                executionConfigured: false,
                message: `SpecForge.AI model profile '${profile.name}' is missing model.`
            };
        }
        if (!profile.apiKey && !isLocalOpenAiCompatibleEndpoint(profile.baseUrl)) {
            return {
                executionConfigured: false,
                message: `SpecForge.AI model profile '${profile.name}' needs an API key for a remote base URL.`
            };
        }
    }
    const defaultProfileName = settings.phaseModelAssignments.defaultProfile
        ?? (settings.modelProfiles.length === 1 ? settings.modelProfiles[0]?.name ?? null : null);
    if (!defaultProfileName) {
        return {
            executionConfigured: false,
            message: "SpecForge.AI needs a default phase model assignment when model profiles are configured."
        };
    }
    const namedAssignments = [
        ["default", defaultProfileName],
        ["implementation", settings.phaseModelAssignments.implementationProfile],
        ["review", settings.phaseModelAssignments.reviewProfile]
    ];
    for (const [assignmentName, profileName] of namedAssignments) {
        if (profileName && !profilesByName.has(profileName)) {
            return {
                executionConfigured: false,
                message: `SpecForge.AI phase model assignment '${assignmentName}' references unknown profile '${profileName}'.`
            };
        }
    }
    return {
        executionConfigured: true,
        message: null
    };
}
function normalizeOptional(value) {
    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
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
    const name = normalizeUnknownOptional(candidate.name);
    const baseUrl = normalizeUnknownOptional(candidate.baseUrl);
    const apiKey = normalizeUnknownOptional(candidate.apiKey);
    const model = normalizeUnknownOptional(candidate.model);
    if (!name && !baseUrl && !apiKey && !model) {
        return null;
    }
    return {
        name: name ?? "",
        baseUrl: baseUrl ?? "",
        apiKey,
        model: model ?? ""
    };
}
function normalizePhaseModelAssignments(value) {
    if (!value || typeof value !== "object") {
        return {
            defaultProfile: null,
            implementationProfile: null,
            reviewProfile: null
        };
    }
    const candidate = value;
    return {
        defaultProfile: normalizeUnknownOptional(candidate.defaultProfile),
        implementationProfile: normalizeUnknownOptional(candidate.implementationProfile),
        reviewProfile: normalizeUnknownOptional(candidate.reviewProfile)
    };
}
function resolveEffectivePhaseModelAssignments(modelProfiles, assignments, legacyModel) {
    const defaultProfile = resolveDefaultModelProfile(modelProfiles, assignments);
    const defaultProfileName = defaultProfile?.name ?? legacyModel;
    const implementationProfileName = resolveAssignedModelProfile(modelProfiles, assignments.implementationProfile)?.name ?? defaultProfileName;
    const reviewProfileName = resolveAssignedModelProfile(modelProfiles, assignments.reviewProfile)?.name ?? defaultProfileName;
    return {
        defaultProfileName,
        implementationProfileName,
        reviewProfileName
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