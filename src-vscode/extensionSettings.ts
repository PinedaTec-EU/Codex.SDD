import { validatePhasePermissionAssignments } from "./executionSettingsModel";

export interface SpecForgeSettings {
  readonly modelProfiles: readonly SpecForgeModelProfile[];
  readonly phaseModelAssignments: SpecForgePhaseModelAssignments;
  readonly effectivePhaseModelAssignments: EffectiveSpecForgePhaseModelAssignments;
  readonly autoClarificationAnswersProfile: string | null;
  readonly clarificationTolerance: string;
  readonly reviewTolerance: string;
  readonly watcherEnabled: boolean;
  readonly attentionNotificationsEnabled: boolean;
  readonly contextSuggestionsEnabled: boolean;
  readonly requireExplicitApprovalBranchAcceptance: boolean;
  readonly autoClarificationAnswersEnabled: boolean;
  readonly autoPlayEnabled: boolean;
  readonly autoReviewEnabled: boolean;
  readonly maxImplementationReviewCycles: number | null;
  readonly destructiveRewindEnabled: boolean;
  readonly pauseOnFailedReview: boolean;
}

export interface SpecForgeSettingsStatus {
  readonly executionConfigured: boolean;
  readonly message: string | null;
  readonly diagnostics: string;
}

export interface SpecForgeModelProfile {
  readonly name: string;
  readonly provider: string;
  readonly baseUrl: string;
  readonly apiKey: string | null;
  readonly model: string;
  readonly reasoningEffort?: string | null;
  readonly repositoryAccess: string;
}

export interface SpecForgePhaseModelAssignments {
  readonly defaultProfile: string | null;
  readonly captureProfile: string | null;
  readonly clarificationProfile: string | null;
  readonly refinementProfile: string | null;
  readonly technicalDesignProfile: string | null;
  readonly implementationProfile: string | null;
  readonly reviewProfile: string | null;
  readonly releaseApprovalProfile: string | null;
  readonly prPreparationProfile: string | null;
}

export interface EffectiveSpecForgePhaseModelAssignments {
  readonly defaultProfileName: string | null;
  readonly captureProfileName: string | null;
  readonly clarificationProfileName: string | null;
  readonly refinementProfileName: string | null;
  readonly technicalDesignProfileName: string | null;
  readonly implementationProfileName: string | null;
  readonly reviewProfileName: string | null;
  readonly releaseApprovalProfileName: string | null;
  readonly prPreparationProfileName: string | null;
}

export function getSpecForgeSettings(): SpecForgeSettings {
  const vscode = require("vscode") as typeof import("vscode");
  return readSpecForgeSettings(vscode.workspace.getConfiguration("specForge"));
}

export function readSpecForgeSettings(configuration: ConfigurationReader): SpecForgeSettings {
  const modelProfiles = normalizeModelProfiles(configuration.get<unknown[]>("execution.modelProfiles", []));
  const phaseModelAssignments = normalizePhaseModelAssignments(configuration.get<unknown>("execution.phaseModels"));
  const autoClarificationAnswersProfile = normalizeUnknownOptional(
    configuration.get<unknown>("execution.autoClarificationAnswersProfile"));

  return {
    modelProfiles,
    phaseModelAssignments,
    effectivePhaseModelAssignments: resolveEffectivePhaseModelAssignments(
      modelProfiles,
      phaseModelAssignments
    ),
    autoClarificationAnswersProfile,
    clarificationTolerance: normalizeTolerance(configuration.get<string>("execution.clarificationTolerance", "balanced")),
    reviewTolerance: normalizeTolerance(configuration.get<string>("execution.reviewTolerance", "balanced")),
    watcherEnabled: configuration.get<boolean>("ui.enableWatcher", true),
    attentionNotificationsEnabled: configuration.get<boolean>("ui.notifyOnAttention", true),
    contextSuggestionsEnabled: configuration.get<boolean>("features.enableContextSuggestions", true),
    requireExplicitApprovalBranchAcceptance: configuration.get<boolean>("features.requireApprovalBranchAcceptance", false),
    autoClarificationAnswersEnabled: configuration.get<boolean>("features.autoClarificationAnswersEnabled", false),
    autoPlayEnabled: configuration.get<boolean>("features.autoPlayEnabled", false),
    autoReviewEnabled: configuration.get<boolean>("features.autoReviewEnabled", false),
    maxImplementationReviewCycles: normalizeOptionalPositiveInteger(
      configuration.get<unknown>("features.maxImplementationReviewCycles")),
    destructiveRewindEnabled: configuration.get<boolean>("features.destructiveRewindEnabled", false),
    pauseOnFailedReview: configuration.get<boolean>("features.pauseOnFailedReview", false)
  };
}

export function buildBackendEnvironment(settings: SpecForgeSettings): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};

  if (settings.modelProfiles.length > 0) {
    env.SPECFORGE_OPENAI_MODEL_PROFILES_JSON = JSON.stringify(settings.modelProfiles);
    env.SPECFORGE_OPENAI_PHASE_MODEL_ASSIGNMENTS_JSON = JSON.stringify(settings.phaseModelAssignments);
  }

  env.SPECFORGE_CAPTURE_TOLERANCE = settings.clarificationTolerance;
  env.SPECFORGE_REVIEW_TOLERANCE = settings.reviewTolerance;
  env.SPECFORGE_AUTO_CLARIFICATION_ANSWERS_ENABLED = settings.autoClarificationAnswersEnabled ? "true" : "false";

  if (settings.autoClarificationAnswersProfile) {
    env.SPECFORGE_AUTO_CLARIFICATION_ANSWERS_PROFILE = settings.autoClarificationAnswersProfile;
  }

  return env;
}

export function getSpecForgeSettingsStatus(settings: SpecForgeSettings): SpecForgeSettingsStatus {
  if (settings.modelProfiles.length === 0) {
    return {
      executionConfigured: false,
      message: "SpecForge.AI needs at least one configured model profile before workflow stages can run.",
      diagnostics: buildSettingsDiagnostics(settings)
    };
  }

  return getModelProfileSettingsStatus(settings);
}

interface ConfigurationReader {
  get<T>(section: string, defaultValue?: T): T;
}

const defaultModelProvider = "openai-compatible";
const supportedModelProviders = new Set(["openai-compatible", "codex", "copilot", "claude"]);
const nativeCliModelProviders = new Set(["codex", "copilot", "claude"]);

function getModelProfileSettingsStatus(settings: SpecForgeSettings): SpecForgeSettingsStatus {
  const profilesByName = new Map<string, SpecForgeModelProfile>();
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
      message: "SpecForge.AI needs either a default phase model assignment or explicit profiles for clarification, refinement, technical design, implementation, and review.",
      diagnostics
    };
  }

  const namedAssignments: Array<[string, string | null]> = [
    ["default", defaultProfileName],
    ["capture", settings.phaseModelAssignments.captureProfile],
    ["clarification", settings.phaseModelAssignments.clarificationProfile],
    ["refinement", settings.phaseModelAssignments.refinementProfile],
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

  if (settings.autoClarificationAnswersEnabled && !settings.autoClarificationAnswersProfile) {
    return {
      executionConfigured: false,
      message: "SpecForge.AI needs an auto-clarification answers profile when model-driven clarification answers are enabled.",
      diagnostics
    };
  }

  if (settings.autoClarificationAnswersProfile && !profilesByName.has(settings.autoClarificationAnswersProfile)) {
    return {
      executionConfigured: false,
      message: `SpecForge.AI auto-clarification answers profile references unknown profile '${settings.autoClarificationAnswersProfile}'.`,
      diagnostics
    };
  }

  const permissionIssues = validatePhasePermissionAssignments(
    settings.modelProfiles,
    settings.phaseModelAssignments
  );
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

function isNativeCliModelProvider(provider: string): boolean {
  return nativeCliModelProviders.has(provider);
}

function hasExplicitProfilesForAllModelDrivenPhases(assignments: SpecForgePhaseModelAssignments): boolean {
  return [
    assignments.clarificationProfile,
    assignments.refinementProfile,
    assignments.technicalDesignProfile,
    assignments.implementationProfile,
    assignments.reviewProfile
  ].every((value) => Boolean(value));
}

function normalizeOptionalPositiveInteger(value: unknown): number | null {
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

function buildSettingsDiagnostics(settings: SpecForgeSettings): string {
  const profiles = settings.modelProfiles.map((profile) =>
    `${profile.name || "<missing-name>"}{provider=${profile.provider || "<missing>"},baseUrl=${profile.baseUrl || "<missing>"},model=${profile.model || "<missing>"}${profile.reasoningEffort ? `,reasoningEffort=${profile.reasoningEffort}` : ""},apiKey=${profile.apiKey ? "set" : "empty"},repositoryAccess=${profile.repositoryAccess || "<missing>"}}`);

  return [
    `profiles=${settings.modelProfiles.length}`,
    `catalog=[${profiles.join(", ")}]`,
    `phaseModels.default=${settings.phaseModelAssignments.defaultProfile ?? "<unset>"}`,
    `phaseModels.capture=${settings.phaseModelAssignments.captureProfile ?? "<unset>"}`,
    `phaseModels.clarification=${settings.phaseModelAssignments.clarificationProfile ?? "<unset>"}`,
    `phaseModels.refinement=${settings.phaseModelAssignments.refinementProfile ?? "<unset>"}`,
    `phaseModels.technicalDesign=${settings.phaseModelAssignments.technicalDesignProfile ?? "<unset>"}`,
    `phaseModels.implementation=${settings.phaseModelAssignments.implementationProfile ?? "<unset>"}`,
    `phaseModels.review=${settings.phaseModelAssignments.reviewProfile ?? "<unset>"}`,
    `phaseModels.releaseApproval=${settings.phaseModelAssignments.releaseApprovalProfile ?? "<unset>"}`,
    `phaseModels.prPreparation=${settings.phaseModelAssignments.prPreparationProfile ?? "<unset>"}`,
    `autoClarificationAnswers.enabled=${settings.autoClarificationAnswersEnabled}`,
    `autoClarificationAnswers.profile=${settings.autoClarificationAnswersProfile ?? "<unset>"}`,
    `autoReviewEnabled=${settings.autoReviewEnabled}`,
    `maxImplementationReviewCycles=${settings.maxImplementationReviewCycles ?? "<unset>"}`,
    `pauseOnFailedReview=${settings.pauseOnFailedReview}`,
    `effective.default=${settings.effectivePhaseModelAssignments.defaultProfileName ?? "<unset>"}`,
    `effective.capture=${settings.effectivePhaseModelAssignments.captureProfileName ?? "<unset>"}`,
    `effective.clarification=${settings.effectivePhaseModelAssignments.clarificationProfileName ?? "<unset>"}`,
    `effective.refinement=${settings.effectivePhaseModelAssignments.refinementProfileName ?? "<unset>"}`,
    `effective.technicalDesign=${settings.effectivePhaseModelAssignments.technicalDesignProfileName ?? "<unset>"}`,
    `effective.implementation=${settings.effectivePhaseModelAssignments.implementationProfileName ?? "<unset>"}`,
    `effective.review=${settings.effectivePhaseModelAssignments.reviewProfileName ?? "<unset>"}`,
    `effective.releaseApproval=${settings.effectivePhaseModelAssignments.releaseApprovalProfileName ?? "<unset>"}`,
    `effective.prPreparation=${settings.effectivePhaseModelAssignments.prPreparationProfileName ?? "<unset>"}`
  ].join("; ");
}

function normalizeOptional(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function normalizeRepositoryAccess(value: unknown): string | null {
  const normalized = normalizeUnknownOptional(value)?.toLowerCase();
  return normalized === "read-write" || normalized === "readwrite" || normalized === "write"
    ? "read-write"
    : normalized === "read"
      ? "read"
      : normalized === "none"
        ? "none"
        : null;
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

function normalizePhaseModelAssignments(value: unknown): SpecForgePhaseModelAssignments {
  if (!value || typeof value !== "object") {
    return {
      defaultProfile: null,
      captureProfile: null,
      clarificationProfile: null,
      refinementProfile: null,
      technicalDesignProfile: null,
      implementationProfile: null,
      reviewProfile: null,
      releaseApprovalProfile: null,
      prPreparationProfile: null
    };
  }

  const candidate = value as Record<string, unknown>;
  return {
    defaultProfile: normalizeUnknownOptional(candidate.defaultProfile),
    captureProfile: normalizeUnknownOptional(candidate.captureProfile),
    clarificationProfile: normalizeUnknownOptional(candidate.clarificationProfile),
    refinementProfile: normalizeUnknownOptional(candidate.refinementProfile),
    technicalDesignProfile: normalizeUnknownOptional(candidate.technicalDesignProfile),
    implementationProfile: normalizeUnknownOptional(candidate.implementationProfile),
    reviewProfile: normalizeUnknownOptional(candidate.reviewProfile),
    releaseApprovalProfile: normalizeUnknownOptional(candidate.releaseApprovalProfile),
    prPreparationProfile: normalizeUnknownOptional(candidate.prPreparationProfile)
  };
}

function resolveEffectivePhaseModelAssignments(
  modelProfiles: readonly SpecForgeModelProfile[],
  assignments: SpecForgePhaseModelAssignments
): EffectiveSpecForgePhaseModelAssignments {
  const defaultProfile = resolveDefaultModelProfile(modelProfiles, assignments);
  const defaultProfileName = defaultProfile?.name ?? null;
  const captureProfileName = resolveAssignedModelProfile(modelProfiles, assignments.captureProfile)?.name ?? defaultProfileName;
  const clarificationProfileName = resolveAssignedModelProfile(modelProfiles, assignments.clarificationProfile)?.name ?? defaultProfileName;
  const refinementProfileName = resolveAssignedModelProfile(modelProfiles, assignments.refinementProfile)?.name ?? defaultProfileName;
  const technicalDesignProfileName = resolveAssignedModelProfile(modelProfiles, assignments.technicalDesignProfile)?.name ?? defaultProfileName;
  const implementationProfileName = resolveAssignedModelProfile(modelProfiles, assignments.implementationProfile)?.name ?? defaultProfileName;
  const reviewProfileName = resolveAssignedModelProfile(modelProfiles, assignments.reviewProfile)?.name ?? defaultProfileName;
  const releaseApprovalProfileName = resolveAssignedModelProfile(modelProfiles, assignments.releaseApprovalProfile)?.name ?? defaultProfileName;
  const prPreparationProfileName = resolveAssignedModelProfile(modelProfiles, assignments.prPreparationProfile)?.name ?? defaultProfileName;

  return {
    defaultProfileName,
    captureProfileName,
    clarificationProfileName,
    refinementProfileName,
    technicalDesignProfileName,
    implementationProfileName,
    reviewProfileName,
    releaseApprovalProfileName,
    prPreparationProfileName
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

function normalizeReasoningEffort(value: unknown): string | null {
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
