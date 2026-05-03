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
    const configuredAgentProfiles = normalizeAgentProfiles(configuration.get("execution.agentProfiles", []));
    const effectiveAgentProfiles = configuredAgentProfiles.length > 0
        ? configuredAgentProfiles
        : modelProfiles.map((profile) => ({
            name: profile.name,
            role: profile.name,
            modelProfile: profile.name,
            instructions: "",
            repositoryAccess: profile.repositoryAccess,
            ...(profile.reasoningEffort ? { reasoningEffort: profile.reasoningEffort } : {})
        }));
    const phaseAgentAssignments = normalizePhaseAgentAssignments(configuration.get("execution.phaseAgents"));
    const autoRefinementAnswersProfile = normalizeUnknownOptional(configuration.get("execution.autoRefinementAnswersProfile"));
    return {
        modelProfiles,
        ...(configuredAgentProfiles.length > 0 ? { agentProfiles: configuredAgentProfiles } : {}),
        phaseAgentAssignments,
        effectivePhaseAgentAssignments: resolveEffectivePhaseAgentAssignments(effectiveAgentProfiles, phaseAgentAssignments),
        autoRefinementAnswersProfile,
        refinementTolerance: normalizeTolerance(configuration.get("execution.refinementTolerance", "balanced")),
        reviewTolerance: normalizeTolerance(configuration.get("execution.reviewTolerance", "balanced")),
        workflowGraphLayoutMode: configuration.get("ui.workflowGraphLayoutMode", "vertical") === "horizontal" ? "horizontal" : "vertical",
        workflowGraphInitialZoomMode: configuration.get("ui.workflowGraphInitialZoomMode", "actual-size") === "fit-width" ? "fit-width" : "actual-size",
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
        completedUsLockOnCompleted: configuration.get("features.completedUsLockOnCompleted", false)
    };
}
function buildBackendEnvironment(settings) {
    const env = {};
    if (settings.modelProfiles.length > 0) {
        env.SPECFORGE_OPENAI_MODEL_PROFILES_JSON = JSON.stringify(settings.modelProfiles);
        env.SPECFORGE_OPENAI_AGENT_PROFILES_JSON = JSON.stringify(resolveConfiguredOrDerivedAgentProfiles(settings));
        env.SPECFORGE_OPENAI_PHASE_AGENT_ASSIGNMENTS_JSON = JSON.stringify(settings.phaseAgentAssignments);
    }
    env.SPECFORGE_REFINEMENT_TOLERANCE = settings.refinementTolerance;
    env.SPECFORGE_REVIEW_TOLERANCE = settings.reviewTolerance;
    env.SPECFORGE_AUTO_REFINEMENT_ANSWERS_ENABLED = settings.autoRefinementAnswersEnabled ? "true" : "false";
    env.SPECFORGE_COMPLETED_US_LOCK_ON_COMPLETED = settings.completedUsLockOnCompleted ? "true" : "false";
    if (settings.autoRefinementAnswersProfile) {
        env.SPECFORGE_AUTO_REFINEMENT_ANSWERS_PROFILE = settings.autoRefinementAnswersProfile;
    }
    return env;
}
function getSpecForgeSettingsStatus(settings) {
    const diagnostics = buildSettingsDiagnostics(settings);
    const agentProfiles = resolveConfiguredOrDerivedAgentProfiles(settings);
    if (settings.modelProfiles.length === 0) {
        return {
            executionConfigured: false,
            message: "SpecForge.AI needs at least one configured model profile before workflow stages can run.",
            diagnostics
        };
    }
    if (agentProfiles.length === 0) {
        return {
            executionConfigured: false,
            message: "SpecForge.AI needs at least one configured agent profile before workflow stages can run.",
            diagnostics
        };
    }
    return getProfileSettingsStatus(settings, diagnostics);
}
const defaultModelProvider = "openai-compatible";
const supportedModelProviders = new Set(["openai-compatible", "codex", "copilot", "claude"]);
const nativeCliModelProviders = new Set(["codex", "copilot", "claude"]);
function getProfileSettingsStatus(settings, diagnostics) {
    const agentProfiles = resolveConfiguredOrDerivedAgentProfiles(settings);
    const modelsByName = new Map();
    for (const profile of settings.modelProfiles) {
        const duplicate = modelsByName.has(profile.name);
        modelsByName.set(profile.name, profile);
        if (!profile.name) {
            return { executionConfigured: false, message: "SpecForge.AI found a model profile without a name.", diagnostics };
        }
        if (!supportedModelProviders.has(profile.provider)) {
            return { executionConfigured: false, message: `SpecForge.AI model profile '${profile.name}' uses unsupported provider '${profile.provider}'.`, diagnostics };
        }
        if (duplicate) {
            return { executionConfigured: false, message: `SpecForge.AI found duplicate model profile name '${profile.name}'.`, diagnostics };
        }
        if (!isNativeCliModelProvider(profile.provider) && !profile.baseUrl) {
            return { executionConfigured: false, message: `SpecForge.AI model profile '${profile.name}' is missing base URL.`, diagnostics };
        }
        if (!isNativeCliModelProvider(profile.provider) && !profile.model) {
            return { executionConfigured: false, message: `SpecForge.AI model profile '${profile.name}' is missing model.`, diagnostics };
        }
        if (!isNativeCliModelProvider(profile.provider) && !profile.apiKey && !isLocalOpenAiCompatibleEndpoint(profile.baseUrl)) {
            return { executionConfigured: false, message: `SpecForge.AI model profile '${profile.name}' needs an API key for a remote base URL.`, diagnostics };
        }
    }
    const agentsByName = new Map();
    for (const agent of agentProfiles) {
        const duplicate = agentsByName.has(agent.name);
        agentsByName.set(agent.name, agent);
        if (!agent.name) {
            return { executionConfigured: false, message: "SpecForge.AI found an agent profile without a name.", diagnostics };
        }
        if (duplicate) {
            return { executionConfigured: false, message: `SpecForge.AI found duplicate agent profile name '${agent.name}'.`, diagnostics };
        }
        if (!agent.modelProfile || !modelsByName.has(agent.modelProfile)) {
            return { executionConfigured: false, message: `SpecForge.AI agent profile '${agent.name}' references unknown model profile '${agent.modelProfile}'.`, diagnostics };
        }
    }
    const defaultAgentName = settings.phaseAgentAssignments.defaultAgent
        ?? (agentProfiles.length === 1 ? agentProfiles[0]?.name ?? null : null);
    if (!defaultAgentName && !hasExplicitAgentsForAllModelDrivenPhases(settings.phaseAgentAssignments)) {
        return {
            executionConfigured: false,
            message: "SpecForge.AI needs either a default phase agent assignment or explicit agents for refinement, spec, technical design, implementation, and review.",
            diagnostics
        };
    }
    const namedAssignments = [
        ["default", defaultAgentName],
        ["capture", settings.phaseAgentAssignments.captureAgent],
        ["refinement", settings.phaseAgentAssignments.refinementAgent],
        ["spec", settings.phaseAgentAssignments.specAgent],
        ["technicalDesign", settings.phaseAgentAssignments.technicalDesignAgent],
        ["implementation", settings.phaseAgentAssignments.implementationAgent],
        ["review", settings.phaseAgentAssignments.reviewAgent],
        ["releaseApproval", settings.phaseAgentAssignments.releaseApprovalAgent],
        ["prPreparation", settings.phaseAgentAssignments.prPreparationAgent]
    ];
    for (const [assignmentName, agentName] of namedAssignments) {
        if (agentName && !agentsByName.has(agentName)) {
            return { executionConfigured: false, message: `SpecForge.AI phase agent assignment '${assignmentName}' references unknown agent '${agentName}'.`, diagnostics };
        }
    }
    if (settings.autoRefinementAnswersEnabled && !settings.autoRefinementAnswersProfile) {
        return { executionConfigured: false, message: "SpecForge.AI needs an auto-refinement answers agent when model-driven refinement answers are enabled.", diagnostics };
    }
    if (settings.autoRefinementAnswersProfile && !agentsByName.has(settings.autoRefinementAnswersProfile)) {
        return { executionConfigured: false, message: `SpecForge.AI auto-refinement answers agent references unknown agent '${settings.autoRefinementAnswersProfile}'.`, diagnostics };
    }
    const permissionIssues = (0, executionSettingsModel_1.validatePhasePermissionAssignments)(agentProfiles, settings.phaseAgentAssignments);
    if (permissionIssues.length > 0) {
        return {
            executionConfigured: false,
            message: permissionIssues[0]?.message ?? "SpecForge.AI found a phase agent permission mismatch.",
            diagnostics
        };
    }
    return { executionConfigured: true, message: null, diagnostics };
}
function isNativeCliModelProvider(provider) {
    return nativeCliModelProviders.has(provider);
}
function resolveConfiguredOrDerivedAgentProfiles(settings) {
    if (settings.agentProfiles && settings.agentProfiles.length > 0) {
        return settings.agentProfiles;
    }
    return settings.modelProfiles.map((profile) => ({
        name: profile.name,
        role: profile.name,
        modelProfile: profile.name,
        instructions: "",
        repositoryAccess: profile.repositoryAccess,
        ...(profile.reasoningEffort ? { reasoningEffort: profile.reasoningEffort } : {})
    }));
}
function hasExplicitAgentsForAllModelDrivenPhases(assignments) {
    return [
        assignments.refinementAgent,
        assignments.specAgent,
        assignments.technicalDesignAgent,
        assignments.implementationAgent,
        assignments.reviewAgent
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
    const agentProfiles = resolveConfiguredOrDerivedAgentProfiles(settings);
    const models = settings.modelProfiles.map((profile) => `${profile.name || "<missing-name>"}{provider=${profile.provider || "<missing>"},baseUrl=${profile.baseUrl || "<missing>"},model=${profile.model || "<missing>"}${profile.reasoningEffort ? `,reasoningEffort=${profile.reasoningEffort}` : ""},apiKey=${profile.apiKey ? "set" : "empty"}}`);
    const agents = agentProfiles.map((agent) => `${agent.name || "<missing-name>"}{role=${agent.role || "<missing>"},modelProfile=${agent.modelProfile || "<missing>"},repositoryAccess=${agent.repositoryAccess || "<missing>"}}`);
    return [
        `modelProfiles=${settings.modelProfiles.length}`,
        `models=[${models.join(", ")}]`,
        `agentProfiles=${agentProfiles.length}`,
        `agents=[${agents.join(", ")}]`,
        `phaseAgents.default=${settings.phaseAgentAssignments.defaultAgent ?? "<unset>"}`,
        `phaseAgents.capture=${settings.phaseAgentAssignments.captureAgent ?? "<unset>"}`,
        `phaseAgents.refinement=${settings.phaseAgentAssignments.refinementAgent ?? "<unset>"}`,
        `phaseAgents.spec=${settings.phaseAgentAssignments.specAgent ?? "<unset>"}`,
        `phaseAgents.technicalDesign=${settings.phaseAgentAssignments.technicalDesignAgent ?? "<unset>"}`,
        `phaseAgents.implementation=${settings.phaseAgentAssignments.implementationAgent ?? "<unset>"}`,
        `phaseAgents.review=${settings.phaseAgentAssignments.reviewAgent ?? "<unset>"}`,
        `phaseAgents.releaseApproval=${settings.phaseAgentAssignments.releaseApprovalAgent ?? "<unset>"}`,
        `phaseAgents.prPreparation=${settings.phaseAgentAssignments.prPreparationAgent ?? "<unset>"}`,
        `autoRefinementAnswers.enabled=${settings.autoRefinementAnswersEnabled}`,
        `autoRefinementAnswers.agent=${settings.autoRefinementAnswersProfile ?? "<unset>"}`,
        `autoReviewEnabled=${settings.autoReviewEnabled}`,
        `maxImplementationReviewCycles=${settings.maxImplementationReviewCycles ?? "<unset>"}`,
        `pauseOnFailedReview=${settings.pauseOnFailedReview}`,
        `effective.default=${settings.effectivePhaseAgentAssignments.defaultAgentName ?? "<unset>"}`,
        `effective.capture=${settings.effectivePhaseAgentAssignments.captureAgentName ?? "<unset>"}`,
        `effective.refinement=${settings.effectivePhaseAgentAssignments.refinementAgentName ?? "<unset>"}`,
        `effective.spec=${settings.effectivePhaseAgentAssignments.specAgentName ?? "<unset>"}`,
        `effective.technicalDesign=${settings.effectivePhaseAgentAssignments.technicalDesignAgentName ?? "<unset>"}`,
        `effective.implementation=${settings.effectivePhaseAgentAssignments.implementationAgentName ?? "<unset>"}`,
        `effective.review=${settings.effectivePhaseAgentAssignments.reviewAgentName ?? "<unset>"}`,
        `effective.releaseApproval=${settings.effectivePhaseAgentAssignments.releaseApprovalAgentName ?? "<unset>"}`,
        `effective.prPreparation=${settings.effectivePhaseAgentAssignments.prPreparationAgentName ?? "<unset>"}`
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
function normalizeAgentProfiles(value) {
    if (!Array.isArray(value)) {
        return [];
    }
    return value
        .map((entry) => normalizeAgentProfile(entry))
        .filter((entry) => entry !== null);
}
function normalizeAgentProfile(value) {
    if (!value || typeof value !== "object") {
        return null;
    }
    const candidate = value;
    const name = normalizeUnknownOptional(candidate.name);
    const role = normalizeUnknownOptional(candidate.role);
    const modelProfile = normalizeUnknownOptional(candidate.modelProfile);
    const instructions = normalizeUnknownOptional(candidate.instructions);
    const reasoningEffort = normalizeReasoningEffort(candidate.reasoningEffort);
    const repositoryAccess = normalizeRepositoryAccess(candidate.repositoryAccess);
    if (!name && !role && !modelProfile && !instructions && !reasoningEffort && !repositoryAccess) {
        return null;
    }
    return {
        name: name ?? "",
        role: role ?? "",
        modelProfile: modelProfile ?? "",
        instructions: instructions ?? "",
        repositoryAccess: repositoryAccess ?? "none",
        ...(reasoningEffort ? { reasoningEffort } : {})
    };
}
function normalizePhaseAgentAssignments(value) {
    if (!value || typeof value !== "object") {
        return emptyPhaseAgentAssignments();
    }
    const candidate = value;
    return {
        defaultAgent: normalizeUnknownOptional(candidate.defaultAgent),
        captureAgent: normalizeUnknownOptional(candidate.captureAgent),
        refinementAgent: normalizeUnknownOptional(candidate.refinementAgent),
        specAgent: normalizeUnknownOptional(candidate.specAgent),
        technicalDesignAgent: normalizeUnknownOptional(candidate.technicalDesignAgent),
        implementationAgent: normalizeUnknownOptional(candidate.implementationAgent),
        reviewAgent: normalizeUnknownOptional(candidate.reviewAgent),
        releaseApprovalAgent: normalizeUnknownOptional(candidate.releaseApprovalAgent),
        prPreparationAgent: normalizeUnknownOptional(candidate.prPreparationAgent)
    };
}
function emptyPhaseAgentAssignments() {
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
function resolveEffectivePhaseAgentAssignments(agentProfiles, assignments) {
    const defaultAgent = resolveDefaultAgentProfile(agentProfiles, assignments);
    const defaultAgentName = defaultAgent?.name ?? null;
    return {
        defaultAgentName,
        captureAgentName: resolveAssignedAgentProfile(agentProfiles, assignments.captureAgent)?.name ?? defaultAgentName,
        refinementAgentName: resolveAssignedAgentProfile(agentProfiles, assignments.refinementAgent)?.name ?? defaultAgentName,
        specAgentName: resolveAssignedAgentProfile(agentProfiles, assignments.specAgent)?.name ?? defaultAgentName,
        technicalDesignAgentName: resolveAssignedAgentProfile(agentProfiles, assignments.technicalDesignAgent)?.name ?? defaultAgentName,
        implementationAgentName: resolveAssignedAgentProfile(agentProfiles, assignments.implementationAgent)?.name ?? defaultAgentName,
        reviewAgentName: resolveAssignedAgentProfile(agentProfiles, assignments.reviewAgent)?.name ?? defaultAgentName,
        releaseApprovalAgentName: resolveAssignedAgentProfile(agentProfiles, assignments.releaseApprovalAgent)?.name ?? defaultAgentName,
        prPreparationAgentName: resolveAssignedAgentProfile(agentProfiles, assignments.prPreparationAgent)?.name ?? defaultAgentName
    };
}
function resolveDefaultAgentProfile(agentProfiles, assignments) {
    const explicitDefault = resolveAssignedAgentProfile(agentProfiles, assignments.defaultAgent);
    if (explicitDefault) {
        return explicitDefault;
    }
    return agentProfiles.length === 1 ? agentProfiles[0] : null;
}
function resolveAssignedAgentProfile(agentProfiles, agentName) {
    if (!agentName) {
        return null;
    }
    return agentProfiles.find((profile) => profile.name === agentName) ?? null;
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