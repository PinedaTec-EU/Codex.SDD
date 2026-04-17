namespace SpecForge.Domain.Application;

public sealed record InitializeRepoPromptsResult(
    string WorkspaceRoot,
    string ConfigPath,
    string PromptManifestPath,
    IReadOnlyCollection<string> CreatedFiles,
    IReadOnlyCollection<string> SkippedFiles);
