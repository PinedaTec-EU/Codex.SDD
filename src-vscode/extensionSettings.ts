import * as vscode from "vscode";

export interface SpecForgeSettings {
  readonly provider: string;
  readonly baseUrl: string | null;
  readonly apiKey: string | null;
  readonly model: string | null;
  readonly clarificationTolerance: string;
  readonly reviewTolerance: string;
  readonly watcherEnabled: boolean;
  readonly attentionNotificationsEnabled: boolean;
  readonly contextSuggestionsEnabled: boolean;
  readonly requireExplicitApprovalBranchAcceptance: boolean;
  readonly autoPlayEnabled: boolean;
  readonly destructiveRewindEnabled: boolean;
}

export interface SpecForgeSettingsStatus {
  readonly executionConfigured: boolean;
  readonly message: string | null;
}

export function getSpecForgeSettings(): SpecForgeSettings {
  return readSpecForgeSettings(vscode.workspace.getConfiguration("specForge"));
}

export function readSpecForgeSettings(configuration: ConfigurationReader): SpecForgeSettings {
  return {
    provider: configuration.get<string>("execution.provider", "deterministic"),
    baseUrl: normalizeOptional(configuration.get<string>("execution.baseUrl")),
    apiKey: normalizeOptional(configuration.get<string>("execution.apiKey")),
    model: normalizeOptional(configuration.get<string>("execution.model")),
    clarificationTolerance: normalizeTolerance(configuration.get<string>("execution.clarificationTolerance", "balanced")),
    reviewTolerance: normalizeTolerance(configuration.get<string>("execution.reviewTolerance", "balanced")),
    watcherEnabled: configuration.get<boolean>("ui.enableWatcher", true),
    attentionNotificationsEnabled: configuration.get<boolean>("ui.notifyOnAttention", true),
    contextSuggestionsEnabled: configuration.get<boolean>("features.enableContextSuggestions", true),
    requireExplicitApprovalBranchAcceptance: configuration.get<boolean>("features.requireApprovalBranchAcceptance", false),
    autoPlayEnabled: configuration.get<boolean>("features.autoPlayEnabled", false),
    destructiveRewindEnabled: configuration.get<boolean>("features.destructiveRewindEnabled", false)
  };
}

export function buildBackendEnvironment(settings: SpecForgeSettings): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
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

export function getSpecForgeSettingsStatus(settings: SpecForgeSettings): SpecForgeSettingsStatus {
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
  ].filter((value): value is string => value !== null);

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

interface ConfigurationReader {
  get<T>(section: string, defaultValue?: T): T;
}

function normalizeOptional(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function normalizeTolerance(value: string | undefined): string {
  const normalized = value?.trim().toLowerCase();
  return normalized === "strict" || normalized === "inferential" ? normalized : "balanced";
}

function isLocalOpenAiCompatibleEndpoint(baseUrl: string | null): boolean {
  if (!baseUrl) {
    return false;
  }

  try {
    const parsed = new URL(baseUrl);
    return parsed.hostname === "localhost"
      || parsed.hostname === "127.0.0.1"
      || parsed.hostname === "::1"
      || parsed.hostname === "0.0.0.0";
  } catch {
    return false;
  }
}
