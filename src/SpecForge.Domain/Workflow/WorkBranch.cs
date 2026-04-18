namespace SpecForge.Domain.Workflow;

public sealed class WorkBranch
{
    public const string SingleBranchPerUserStoryStrategy = "single-branch-per-user-story";

    public WorkBranch(
        string baseBranch,
        string workBranch,
        string kind,
        string category,
        string? titleSnapshot,
        string? sourceUsPath,
        DateTimeOffset createdAtUtc,
        string strategy = SingleBranchPerUserStoryStrategy)
    {
        if (string.IsNullOrWhiteSpace(baseBranch))
        {
            throw new ArgumentException("Base branch is required.", nameof(baseBranch));
        }

        if (string.IsNullOrWhiteSpace(workBranch))
        {
            throw new ArgumentException("Work branch is required.", nameof(workBranch));
        }

        if (string.IsNullOrWhiteSpace(kind))
        {
            throw new ArgumentException("Kind is required.", nameof(kind));
        }

        if (string.IsNullOrWhiteSpace(category))
        {
            throw new ArgumentException("Category is required.", nameof(category));
        }

        BaseBranch = baseBranch;
        WorkBranchName = workBranch;
        Kind = kind;
        Category = category;
        TitleSnapshot = titleSnapshot;
        SourceUsPath = sourceUsPath;
        CreatedAtUtc = createdAtUtc;
        Strategy = strategy;
        Status = "active";
    }

    public string BaseBranch { get; }

    public string WorkBranchName { get; }

    public string Kind { get; }

    public string Category { get; }

    public string? TitleSnapshot { get; }

    public string? SourceUsPath { get; }

    public DateTimeOffset CreatedAtUtc { get; }

    public string Strategy { get; }

    public string Status { get; private set; }

    public void MarkSuperseded()
    {
        Status = "superseded";
    }
}
