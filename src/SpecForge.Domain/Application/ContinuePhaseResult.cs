using SpecForge.Domain.Workflow;

namespace SpecForge.Domain.Application;

public sealed record ContinuePhaseResult(
    string UsId,
    PhaseId CurrentPhase,
    UserStoryStatus Status,
    string? GeneratedArtifactPath,
    TokenUsage? Usage = null,
    PhaseExecutionMetadata? Execution = null);
