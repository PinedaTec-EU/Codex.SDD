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
    string? RefinementProfile = null,
    string? SpecProfile = null,
    string? TechnicalDesignProfile = null,
    string? ImplementationProfile = null,
    string? ReviewProfile = null,
    string? ReleaseApprovalProfile = null,
    string? PrPreparationProfile = null);

public sealed record OpenAiCompatibleProviderOptions(
    string? SystemPrompt = null,
    string RefinementTolerance = "balanced",
    string ReviewTolerance = "balanced",
    bool AutoRefinementAnswersEnabled = false,
    string? AutoRefinementAnswersProfile = null,
    bool ReviewLearningEnabled = true,
    string ReviewLearningSkillPath = ".codex/skills/sdd-phase-agents/SKILL.md",
    IReadOnlyList<OpenAiCompatibleModelProfile>? ModelProfiles = null,
    OpenAiCompatiblePhaseModelAssignments? PhaseModelAssignments = null);
