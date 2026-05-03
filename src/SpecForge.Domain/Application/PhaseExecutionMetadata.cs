namespace SpecForge.Domain.Application;

public sealed record PhaseExecutionMetadata(
    string ProviderKind,
    string Model,
    string? ProfileName = null,
    string? BaseUrl = null,
    string? AgentName = null,
    string? AgentRole = null,
    IReadOnlyCollection<string>? Warnings = null,
    string? RuntimeVersion = null,
    string? InputSha256 = null,
    string? OutputSha256 = null,
    string? StructuredOutputSha256 = null,
    string? ReceiptPath = null);
