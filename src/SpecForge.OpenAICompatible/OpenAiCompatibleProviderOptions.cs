namespace SpecForge.OpenAICompatible;

public sealed record OpenAiCompatibleModelProfile(
    string Name,
    string Provider,
    string BaseUrl,
    string ApiKey,
    string Model,
    string RepositoryAccess = "none");

public sealed record OpenAiCompatiblePhaseModelAssignments(
    string? DefaultProfile = null,
    string? ImplementationProfile = null,
    string? ReviewProfile = null);

public sealed record OpenAiCompatibleProviderOptions(
    string? SystemPrompt = null,
    string ClarificationTolerance = "balanced",
    string ReviewTolerance = "balanced",
    IReadOnlyList<OpenAiCompatibleModelProfile>? ModelProfiles = null,
    OpenAiCompatiblePhaseModelAssignments? PhaseModelAssignments = null);
