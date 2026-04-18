namespace SpecForge.Domain.Application;

public sealed record RequestRegressionResult(
    string UsId,
    string Status,
    string CurrentPhase);
