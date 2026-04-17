namespace SpecForge.Domain.Application;

public sealed record CurrentPhaseSummary(
    string UsId,
    string CurrentPhase,
    string Status,
    bool CanAdvance,
    bool RequiresApproval,
    string? BlockingReason);
