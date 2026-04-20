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
    return {
        provider: configuration.get("execution.provider", "deterministic"),
        baseUrl: normalizeOptional(configuration.get("execution.baseUrl")),
        apiKey: normalizeOptional(configuration.get("execution.apiKey")),
        model: normalizeOptional(configuration.get("execution.model")),
        clarificationTolerance: normalizeTolerance(configuration.get("execution.clarificationTolerance", "balanced")),
        reviewTolerance: normalizeTolerance(configuration.get("execution.reviewTolerance", "balanced")),
        watcherEnabled: configuration.get("ui.enableWatcher", true),
        attentionNotificationsEnabled: configuration.get("ui.notifyOnAttention", true),
        contextSuggestionsEnabled: configuration.get("features.enableContextSuggestions", true)
    };
}
function buildBackendEnvironment(settings) {
    const env = {
        SPECFORGE_PHASE_PROVIDER: settings.provider
    };
    if (settings.baseUrl) {
        env.SPECFORGE_OPENAI_BASE_URL = settings.baseUrl;
    }
    if (settings.apiKey) {
        env.SPECFORGE_OPENAI_API_KEY = settings.apiKey;
    }
    if (settings.model) {
        env.SPECFORGE_OPENAI_MODEL = settings.model;
    }
    env.SPECFORGE_CAPTURE_TOLERANCE = settings.clarificationTolerance;
    env.SPECFORGE_REVIEW_TOLERANCE = settings.reviewTolerance;
    return env;
}
function getSpecForgeSettingsStatus(settings) {
    if (settings.provider === "deterministic") {
        return {
            executionConfigured: false,
            message: "SpecForge.AI needs an SLM/LLM execution provider before workflow stages can run. Select an OpenAI-compatible provider and configure base URL, API key, and model."
        };
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
function normalizeOptional(value) {
    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
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