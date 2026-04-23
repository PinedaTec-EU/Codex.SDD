export interface SpecForgeSettings {
  readonly provider: string;
  readonly baseUrl: string | null;
  readonly apiKey: string | null;
  readonly model: string | null;
  readonly modelProfiles: readonly SpecForgeModelProfile[];
  readonly phaseModelAssignments: SpecForgePhaseModelAssignments;
  readonly effectivePhaseModelAssignments: EffectiveSpecForgePhaseModelAssignments;
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

export interface SpecForgeModelProfile {
  readonly name: string;
  readonly baseUrl: string;
  readonly apiKey: string | null;
  readonly model: string;
}

export interface SpecForgePhaseModelAssignments {
  readonly defaultProfile: string | null;
  readonly implementationProfile: string | null;
  readonly reviewProfile: string | null;
}

export interface EffectiveSpecForgePhaseModelAssignments {
  readonly defaultProfileName: string | null;
  readonly implementationProfileName: string | null;
  readonly reviewProfileName: string | null;
}

export function getSpecForgeSettings(): SpecForgeSettings {
  const vscode = require("vscode") as typeof import("vscode");
  return readSpecForgeSettings(vscode.workspace.getConfiguration("specForge"));
}

export function readSpecForgeSettings(configuration: ConfigurationReader): SpecForgeSettings {
  const modelProfiles = normalizeModelProfiles(configuration.get<unknown[]>("execution.modelProfiles", []));
  const phaseModelAssignments = normalizePhaseModelAssignments(configuration.get<unknown>("execution.phaseModels"));

  return {
    provider: configuration.get<string>("execution.provider", "deterministic"),
    baseUrl: normalizeOptional(configuration.get<string>("execution.baseUrl")),
    apiKey: normalizeOptional(configuration.get<string>("execution.apiKey")),
    model: normalizeOptional(configuration.get<string>("execution.model")),
    modelProfiles,
    phaseModelAssignments,
    effectivePhaseModelAssignments: resolveEffectivePhaseModelAssignments(
      modelProfiles,
      phaseModelAssignments,
      normalizeOptional(configuration.get<string>("execution.model"))
    ),
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

  if (settings.modelProfiles.length > 0) {
    env.SPECFORGE_OPENAI_MODEL_PROFILES_JSON = JSON.stringify(settings.modelProfiles);
    env.SPECFORGE_OPENAI_PHASE_MODEL_ASSIGNMENTS_JSON = JSON.stringify(settings.phaseModelAssignments);
  } else {
    if (settings.baseUrl) {
      env.SPECFORGE_OPENAI_BASE_URL = settings.baseUrl;
    }

    if (settings.apiKey) {
      env.SPECFORGE_OPENAI_API_KEY = settings.apiKey;
    }

    if (settings.model) {
      env.SPECFORGE_OPENAI_MODEL = settings.model;
    }
  }

  env.SPECFORGE_CAPTURE_TOLERANCE = settings.clarificationTolerance;
  env.SPECFORGE_REVIEW_TOLERANCE = settings.reviewTolerance;

  return env;
}

export function getSpecForgeSettingsStatus(settings: SpecForgeSettings): SpecForgeSettingsStatus {
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

function getModelProfileSettingsStatus(settings: SpecForgeSettings): SpecForgeSettingsStatus {
  const profilesByName = new Map<string, SpecForgeModelProfile>();

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

  const namedAssignments: Array<[string, string | null]> = [
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

function normalizeOptional(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function normalizeModelProfiles(value: unknown): readonly SpecForgeModelProfile[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => normalizeModelProfile(entry))
    .filter((entry): entry is SpecForgeModelProfile => entry !== null);
}

function normalizeModelProfile(value: unknown): SpecForgeModelProfile | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Record<string, unknown>;
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

function normalizePhaseModelAssignments(value: unknown): SpecForgePhaseModelAssignments {
  if (!value || typeof value !== "object") {
    return {
      defaultProfile: null,
      implementationProfile: null,
      reviewProfile: null
    };
  }

  const candidate = value as Record<string, unknown>;
  return {
    defaultProfile: normalizeUnknownOptional(candidate.defaultProfile),
    implementationProfile: normalizeUnknownOptional(candidate.implementationProfile),
    reviewProfile: normalizeUnknownOptional(candidate.reviewProfile)
  };
}

function resolveEffectivePhaseModelAssignments(
  modelProfiles: readonly SpecForgeModelProfile[],
  assignments: SpecForgePhaseModelAssignments,
  legacyModel: string | null
): EffectiveSpecForgePhaseModelAssignments {
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

function resolveDefaultModelProfile(
  modelProfiles: readonly SpecForgeModelProfile[],
  assignments: SpecForgePhaseModelAssignments
): SpecForgeModelProfile | null {
  const explicitDefault = resolveAssignedModelProfile(modelProfiles, assignments.defaultProfile);
  if (explicitDefault) {
    return explicitDefault;
  }

  return modelProfiles.length === 1 ? modelProfiles[0] : null;
}

function resolveAssignedModelProfile(
  modelProfiles: readonly SpecForgeModelProfile[],
  profileName: string | null
): SpecForgeModelProfile | null {
  if (!profileName) {
    return null;
  }

  return modelProfiles.find((profile) => profile.name === profileName) ?? null;
}

function normalizeUnknownOptional(value: unknown): string | null {
  return typeof value === "string" ? normalizeOptional(value) : null;
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
