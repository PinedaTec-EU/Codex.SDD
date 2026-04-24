namespace SpecForge.Domain.Application;

public sealed record CurrentPhaseSummary(
    string UsId,
    string CurrentPhase,
    string Status,
    bool CanAdvance,
    bool CanApprove,
    bool RequiresApproval,
    string? BlockingReason,
    string? ExecutionPhase = null);
