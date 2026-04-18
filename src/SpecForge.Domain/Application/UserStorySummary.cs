namespace SpecForge.Domain.Application;

public sealed record UserStorySummary(
    string UsId,
    string Title,
    string Category,
    string DirectoryPath,
    string MainArtifactPath,
    string CurrentPhase,
    string Status,
    string? WorkBranch);
