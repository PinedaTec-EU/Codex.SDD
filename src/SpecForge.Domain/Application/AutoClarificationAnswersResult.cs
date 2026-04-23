namespace SpecForge.Domain.Application;

public sealed record AutoClarificationAnswersResult(
    bool CanResolve,
    IReadOnlyList<string?> Answers,
    string? Reason = null,
    TokenUsage? Usage = null,
    PhaseExecutionMetadata? Execution = null);
