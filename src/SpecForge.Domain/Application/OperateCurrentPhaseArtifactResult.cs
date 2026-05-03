namespace SpecForge.Domain.Application;

public sealed record OperateCurrentPhaseArtifactResult(
    string UsId,
    string CurrentPhase,
    string Status,
    string OperationLogPath,
    string SourceArtifactPath,
    string GeneratedArtifactPath,
    TokenUsage? Usage,
    PhaseExecutionMetadata? Execution,
    PhaseCommitResult? Commit = null);
