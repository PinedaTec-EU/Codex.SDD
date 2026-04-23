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
        modelProfiles,
        phaseModelAssignments,
        effectivePhaseModelAssignments: resolveEffectivePhaseModelAssignments(modelProfiles, phaseModelAssignments),
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
    const env = {};
    if (settings.modelProfiles.length > 0) {
        env.SPECFORGE_OPENAI_MODEL_PROFILES_JSON = JSON.stringify(settings.modelProfiles);
        env.SPECFORGE_OPENAI_PHASE_MODEL_ASSIGNMENTS_JSON = JSON.stringify(settings.phaseModelAssignments);
    }
    env.SPECFORGE_CAPTURE_TOLERANCE = settings.clarificationTolerance;
    env.SPECFORGE_REVIEW_TOLERANCE = settings.reviewTolerance;
    return env;
}
function getSpecForgeSettingsStatus(settings) {
    if (settings.modelProfiles.length === 0) {
        return {
            executionConfigured: false,
            message: "SpecForge.AI needs at least one configured model profile before workflow stages can run."
        };
    }
    return getModelProfileSettingsStatus(settings);
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
        if (!profile.provider) {
            return {
                executionConfigured: false,
                message: `SpecForge.AI model profile '${profile.name}' is missing provider.`
            };
        }
        if (profile.provider !== "openai-compatible") {
            return {
                executionConfigured: false,
                message: `SpecForge.AI model profile '${profile.name}' uses unsupported provider '${profile.provider}'.`
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
    const provider = normalizeUnknownOptional(candidate.provider);
    const name = normalizeUnknownOptional(candidate.name);
    const baseUrl = normalizeUnknownOptional(candidate.baseUrl);
    const apiKey = normalizeUnknownOptional(candidate.apiKey);
    const model = normalizeUnknownOptional(candidate.model);
    if (!provider && !name && !baseUrl && !apiKey && !model) {
        return null;
    }
    return {
        name: name ?? "",
        provider: provider ?? "",
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
function resolveEffectivePhaseModelAssignments(modelProfiles, assignments) {
    const defaultProfile = resolveDefaultModelProfile(modelProfiles, assignments);
    const defaultProfileName = defaultProfile?.name ?? null;
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