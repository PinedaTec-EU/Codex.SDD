namespace SpecForge.Domain.Application;

public sealed record ContinuePhaseResponse(
    string UsId,
    string CurrentPhase,
    string Status,
    string? GeneratedArtifactPath,
    TokenUsage? Usage);
