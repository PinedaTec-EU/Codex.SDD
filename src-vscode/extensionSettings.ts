export interface SpecForgeSettings {
  readonly provider: string;
  readonly baseUrl: string | null;
  readonly apiKey: string | null;
  readonly model: string | null;
  readonly watcherEnabled: boolean;
  readonly attentionNotificationsEnabled: boolean;
}

export interface SpecForgeSettingsStatus {
  readonly executionConfigured: boolean;
  readonly message: string | null;
}

export function getSpecForgeSettings(): SpecForgeSettings {
  const vscode = require("vscode") as typeof import("vscode");
  return readSpecForgeSettings(vscode.workspace.getConfiguration("specForge"));
}

export function readSpecForgeSettings(configuration: ConfigurationReader): SpecForgeSettings {
  return {
    provider: configuration.get<string>("execution.provider", "deterministic"),
    baseUrl: normalizeOptional(configuration.get<string>("execution.baseUrl")),
    apiKey: normalizeOptional(configuration.get<string>("execution.apiKey")),
    model: normalizeOptional(configuration.get<string>("execution.model")),
    watcherEnabled: configuration.get<boolean>("ui.enableWatcher", true),
    attentionNotificationsEnabled: configuration.get<boolean>("ui.notifyOnAttention", true)
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

  return env;
}

export function getSpecForgeSettingsStatus(settings: SpecForgeSettings): SpecForgeSettingsStatus {
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
