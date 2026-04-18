namespace SpecForge.Domain.Application;

public sealed record TokenUsage(
    int InputTokens,
    int OutputTokens,
    int TotalTokens);
