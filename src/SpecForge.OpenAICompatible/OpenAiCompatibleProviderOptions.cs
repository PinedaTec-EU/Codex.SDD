namespace SpecForge.OpenAICompatible;

public sealed record OpenAiCompatibleModelProfile(
    string Name,
    string Provider,
    string BaseUrl,
    string ApiKey,
    string Model,
    string? ReasoningEffort = null,
    string RepositoryAccess = "none");

public sealed record OpenAiCompatiblePhaseModelAssignments(
    string? DefaultProfile = null,
    string? CaptureProfile = null,
    string? ClarificationProfile = null,
    string? RefinementProfile = null,
    string? TechnicalDesignProfile = null,
    string? ImplementationProfile = null,
    string? ReviewProfile = null,
    string? ReleaseApprovalProfile = null,
    string? PrPreparationProfile = null);

public sealed record OpenAiCompatibleProviderOptions(
    string? SystemPrompt = null,
    string ClarificationTolerance = "balanced",
    string ReviewTolerance = "balanced",
    bool AutoClarificationAnswersEnabled = false,
    string? AutoClarificationAnswersProfile = null,
    IReadOnlyList<OpenAiCompatibleModelProfile>? ModelProfiles = null,
    OpenAiCompatiblePhaseModelAssignments? PhaseModelAssignments = null);
