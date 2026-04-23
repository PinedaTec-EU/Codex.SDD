namespace SpecForge.Domain.Application;

public sealed record PhaseExecutionMetadata(
    string ProviderKind,
    string Model,
    string? ProfileName = null,
    string? BaseUrl = null,
    IReadOnlyCollection<string>? Warnings = null);
