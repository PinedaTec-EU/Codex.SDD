namespace SpecForge.Domain.Application;

public sealed record RegisterPhaseInputResult(
    string UsId,
    string CurrentPhase,
    string Status,
    string InputArtifactPath,
    string GeneratedArtifactPath,
    TokenUsage? Usage);
