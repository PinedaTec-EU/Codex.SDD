namespace SpecForge.Domain.Application;

public sealed record UserStorySummary(
    string UsId,
    string Title,
    string Description,
    string Category,
    string DirectoryPath,
    string MainArtifactPath,
    string CurrentPhase,
    string Status,
    string? WorkBranch);
