"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSpecForgeSettings = getSpecForgeSettings;
exports.readSpecForgeSettings = readSpecForgeSettings;
exports.buildBackendEnvironment = buildBackendEnvironment;
exports.getSpecForgeSettingsStatus = getSpecForgeSettingsStatus;
const vscode = __importStar(require("vscode"));
function getSpecForgeSettings() {
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