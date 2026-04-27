namespace SpecForge.Domain.Application;

public sealed record AutoRefinementAnswersResult(
    bool CanResolve,
    IReadOnlyList<string?> Answers,
    string? Reason = null,
    TokenUsage? Usage = null,
    PhaseExecutionMetadata? Execution = null);
