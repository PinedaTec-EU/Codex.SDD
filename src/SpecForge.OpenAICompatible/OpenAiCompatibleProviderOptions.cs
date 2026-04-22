namespace SpecForge.OpenAICompatible;

public sealed record OpenAiCompatibleModelProfile(
    string Name,
    string BaseUrl,
    string ApiKey,
    string Model);

public sealed record OpenAiCompatiblePhaseModelAssignments(
    string? DefaultProfile = null,
    string? ImplementationProfile = null,
    string? ReviewProfile = null);

public sealed record OpenAiCompatibleProviderOptions(
    string? BaseUrl,
    string? ApiKey,
    string? Model,
    string? SystemPrompt = null,
    string ClarificationTolerance = "balanced",
    string ReviewTolerance = "balanced",
    IReadOnlyList<OpenAiCompatibleModelProfile>? ModelProfiles = null,
    OpenAiCompatiblePhaseModelAssignments? PhaseModelAssignments = null);
