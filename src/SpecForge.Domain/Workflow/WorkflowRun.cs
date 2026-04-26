namespace SpecForge.Domain.Workflow;

public sealed class WorkflowRun
{
    private readonly HashSet<PhaseId> approvedPhases = [];

    public WorkflowRun(
        string usId,
        string sourceHash,
        WorkflowDefinition definition)
    {
        if (string.IsNullOrWhiteSpace(usId))
        {
            throw new ArgumentException("US id is required.", nameof(usId));
        }

        if (string.IsNullOrWhiteSpace(sourceHash))
        {
            throw new ArgumentException("Source hash is required.", nameof(sourceHash));
        }

        Definition = definition ?? throw new ArgumentNullException(nameof(definition));
        UsId = usId;
        SourceHash = sourceHash;
        CurrentPhase = PhaseId.Capture;
        Status = UserStoryStatus.Active;
    }

    public string UsId { get; }

    public string SourceHash { get; }

    public WorkflowDefinition Definition { get; }

    public PhaseId CurrentPhase { get; private set; }

    public UserStoryStatus Status { get; private set; }

    public WorkBranch? Branch { get; private set; }

    public bool IsPhaseApproved(PhaseId phaseId) => approvedPhases.Contains(phaseId);

    public IReadOnlyCollection<PhaseId> ApprovedPhases => approvedPhases.OrderBy(static phase => phase).ToArray();

    public void GenerateNextPhase()
    {
        EnsureNotCompleted();

        if (Definition.RequiresApproval(CurrentPhase) && !approvedPhases.Contains(CurrentPhase))
        {
            throw new WorkflowDomainException(
                $"Phase '{CurrentPhase}' requires approval before advancing.");
        }

        CurrentPhase = Definition.GetNextPhase(CurrentPhase);
        Status = Definition.RequiresApproval(CurrentPhase)
            ? UserStoryStatus.WaitingUser
            : UserStoryStatus.Active;
    }

    public void ApproveCurrentPhase(
        string? baseBranch = null,
        string? workBranchName = null,
        string? workBranchKind = null,
        string? workBranchCategory = null,
        string? titleSnapshot = null,
        string? sourceUsPath = null,
        DateTimeOffset? approvedAtUtc = null)
    {
        EnsureNotCompleted();

        if (!Definition.RequiresApproval(CurrentPhase))
        {
            throw new WorkflowDomainException($"Phase '{CurrentPhase}' does not require approval.");
        }

        if (CurrentPhase == PhaseId.Refinement)
        {
            if (Branch is null)
            {
                if (string.IsNullOrWhiteSpace(baseBranch))
                {
                    throw new WorkflowDomainException("Base branch is required to approve refinement.");
                }

                if (string.IsNullOrWhiteSpace(workBranchName))
                {
                    throw new WorkflowDomainException("Work branch name is required to approve refinement.");
                }

                if (string.IsNullOrWhiteSpace(workBranchKind))
                {
                    throw new WorkflowDomainException("Work branch kind is required to approve refinement.");
                }

                if (string.IsNullOrWhiteSpace(workBranchCategory))
                {
                    throw new WorkflowDomainException("Work branch category is required to approve refinement.");
                }

                Branch = new WorkBranch(
                    baseBranch,
                    workBranchName,
                    workBranchKind,
                    workBranchCategory,
                    titleSnapshot,
                    sourceUsPath,
                    approvedAtUtc ?? DateTimeOffset.UtcNow);
            }
        }

        approvedPhases.Add(CurrentPhase);
        Status = UserStoryStatus.Active;
    }

    public void ReopenCurrentPhaseApproval()
    {
        if (!Definition.RequiresApproval(CurrentPhase))
        {
            throw new WorkflowDomainException($"Phase '{CurrentPhase}' does not require approval.");
        }

        approvedPhases.Remove(CurrentPhase);
        Status = UserStoryStatus.WaitingUser;
    }

    public void RequestRegression(PhaseId targetPhase)
    {
        EnsureNotCompleted();

        if (!Definition.CanRegress(CurrentPhase, targetPhase))
        {
            throw new WorkflowDomainException(
                $"Regression from '{CurrentPhase}' to '{targetPhase}' is not allowed.");
        }

        approvedPhases.RemoveWhere(phase => phase >= targetPhase);

        CurrentPhase = targetPhase;
        Status = Definition.RequiresApproval(targetPhase)
            ? UserStoryStatus.WaitingUser
            : UserStoryStatus.Active;
    }

    public void CompleteCurrentWorkflow()
    {
        if (CurrentPhase != PhaseId.PrPreparation)
        {
            throw new WorkflowDomainException("Only the final PR preparation phase can complete the workflow.");
        }

        EnsureNotCompleted();
        Status = UserStoryStatus.Completed;
    }

    public void RewindToPhase(PhaseId targetPhase)
    {
        if (targetPhase >= CurrentPhase)
        {
            throw new WorkflowDomainException(
                $"Rewind from '{CurrentPhase}' to '{targetPhase}' is not allowed.");
        }

        approvedPhases.RemoveWhere(phase => phase >= targetPhase);
        CurrentPhase = targetPhase;
        Status = Definition.RequiresApproval(targetPhase)
            ? UserStoryStatus.WaitingUser
            : UserStoryStatus.Active;
    }

    public void RemoveBranch()
    {
        Branch = null;
    }

    public void RestoreBranch(WorkBranch branch)
    {
        Branch = branch ?? throw new ArgumentNullException(nameof(branch));
    }

    public void RestoreApproval(PhaseId phaseId)
    {
        approvedPhases.Add(phaseId);
    }

    public void RestoreState(PhaseId currentPhase, UserStoryStatus status)
    {
        CurrentPhase = currentPhase;
        Status = status;
    }

    private void EnsureNotCompleted()
    {
        if (Status == UserStoryStatus.Completed)
        {
            throw new WorkflowDomainException("Completed workflows cannot be modified.");
        }
    }
}
