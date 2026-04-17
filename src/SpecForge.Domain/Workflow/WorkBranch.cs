namespace SpecForge.Domain.Workflow;

public sealed class WorkBranch
{
    public WorkBranch(string baseBranch, string workBranch, DateTimeOffset createdAtUtc)
    {
        if (string.IsNullOrWhiteSpace(baseBranch))
        {
            throw new ArgumentException("Base branch is required.", nameof(baseBranch));
        }

        if (string.IsNullOrWhiteSpace(workBranch))
        {
            throw new ArgumentException("Work branch is required.", nameof(workBranch));
        }

        BaseBranch = baseBranch;
        WorkBranchName = workBranch;
        CreatedAtUtc = createdAtUtc;
        Status = "active";
    }

    public string BaseBranch { get; }

    public string WorkBranchName { get; }

    public DateTimeOffset CreatedAtUtc { get; }

    public string Status { get; private set; }

    public void MarkSuperseded()
    {
        Status = "superseded";
    }
}
