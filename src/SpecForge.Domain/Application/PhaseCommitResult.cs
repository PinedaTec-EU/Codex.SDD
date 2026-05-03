namespace SpecForge.Domain.Application;

public sealed record PhaseCommitResult(
    bool IsGitWorkspace,
    bool CommitCreated,
    string? CommitSha,
    string? Message,
    IReadOnlyCollection<string> StagedPaths);
