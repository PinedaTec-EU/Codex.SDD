namespace SpecForge.Domain.Application;

public sealed record InitializeRepoPromptsResult(
    string WorkspaceRoot,
    string ConfigPath,
    string PromptManifestPath,
    string PromptSystemHashesPath,
    IReadOnlyCollection<string> CreatedFiles,
    IReadOnlyCollection<string> SkippedFiles);
