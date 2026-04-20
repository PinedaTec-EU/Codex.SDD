namespace SpecForge.Domain.Application;

public sealed record ResetUserStoryResult(
    string UsId,
    string Status,
    string CurrentPhase);
