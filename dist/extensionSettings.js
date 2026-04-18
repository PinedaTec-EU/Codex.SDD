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
        watcherEnabled: configuration.get("ui.enableWatcher", true),
        attentionNotificationsEnabled: configuration.get("ui.notifyOnAttention", true)
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
    return env;
}
function getSpecForgeSettingsStatus(settings) {
    if (settings.provider === "deterministic") {
        return {
            executionConfigured: true,
            message: null
        };
    }
    const missingFields = [
        settings.baseUrl ? null : "base URL",
        settings.apiKey ? null : "API key",
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
//# sourceMappingURL=extensionSettings.js.map