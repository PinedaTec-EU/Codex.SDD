namespace SpecForge.Domain.Application;

public sealed record UserStoryRuntimeStatus(
    string UsId,
    string Status,
    string? ActiveOperation,
    string CurrentPhase,
    string? StartedAtUtc,
    string? LastHeartbeatUtc,
    string? LastOutcome,
    string? LastCompletedAtUtc,
    string? Message,
    bool IsStale);
