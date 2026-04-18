namespace SpecForge.Domain.Application;

public sealed record RestartUserStoryResult(
    string UsId,
    string Status,
    string CurrentPhase,
    string? GeneratedArtifactPath);
