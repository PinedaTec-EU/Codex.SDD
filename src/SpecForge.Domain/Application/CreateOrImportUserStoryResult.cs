namespace SpecForge.Domain.Application;

public sealed record CreateOrImportUserStoryResult(
    string UsId,
    string RootDirectory,
    string MainArtifactPath);
