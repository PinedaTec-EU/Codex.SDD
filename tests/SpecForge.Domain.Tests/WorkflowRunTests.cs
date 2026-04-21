using SpecForge.Domain.Workflow;

namespace SpecForge.Domain.Tests;

public sealed class WorkflowRunTests
{
    [Fact]
    public void GenerateNextPhase_FromCapture_MovesToClarificationAndStaysActive()
    {
        var run = CreateRun();

        run.GenerateNextPhase();

        Assert.Equal(PhaseId.Clarification, run.CurrentPhase);
        Assert.Equal(UserStoryStatus.Active, run.Status);
    }

    [Fact]
    public void GenerateNextPhase_FromApprovalRequiredPhaseWithoutApproval_Throws()
    {
        var run = CreateRun();
        run.GenerateNextPhase();
        run.GenerateNextPhase();

        var act = () => run.GenerateNextPhase();

        var exception = Assert.Throws<WorkflowDomainException>(act);
        Assert.Contains("requires approval", exception.Message);
    }

    [Fact]
    public void ApproveCurrentPhase_OnRefinement_CreatesWorkBranch()
    {
        var run = CreateRun();
        run.GenerateNextPhase();
        run.GenerateNextPhase();

        run.ApproveCurrentPhase(
            "main",
            "feature/us-0001-test-story",
            "feature",
            "workflow",
            "Test story",
            ".specs/us/workflow/US-0001/us.md",
            new DateTimeOffset(2026, 4, 18, 10, 0, 0, TimeSpan.Zero));

        Assert.True(run.IsPhaseApproved(PhaseId.Refinement));
        Assert.Equal(UserStoryStatus.Active, run.Status);
        Assert.NotNull(run.Branch);
        Assert.Equal("main", run.Branch!.BaseBranch);
        Assert.Equal("feature/us-0001-test-story", run.Branch.WorkBranchName);
        Assert.Equal("feature", run.Branch.Kind);
        Assert.Equal("workflow", run.Branch.Category);
    }

    [Fact]
    public void ApproveCurrentPhase_OnRefinementWithoutBaseBranch_Throws()
    {
        var run = CreateRun();
        run.GenerateNextPhase();
        run.GenerateNextPhase();

        var act = () => run.ApproveCurrentPhase();

        var exception = Assert.Throws<WorkflowDomainException>(act);
        Assert.Contains("Base branch is required", exception.Message);
    }

    [Fact]
    public void ApprovedRefinement_CanAdvanceLinearlyToTechnicalDesign()
    {
        var run = CreateRun();
        run.GenerateNextPhase();
        run.GenerateNextPhase();
        run.ApproveCurrentPhase("main", "feature/us-0001-test-story", "feature", "workflow", "Test story", ".specs/us/workflow/US-0001/us.md");

        run.GenerateNextPhase();

        Assert.Equal(PhaseId.TechnicalDesign, run.CurrentPhase);
        Assert.Equal(UserStoryStatus.Active, run.Status);
    }

    [Fact]
    public void RequestRegression_FromReviewToTechnicalDesign_IsAllowed()
    {
        var run = CreateRun();
        AdvanceToReview(run);

        run.RequestRegression(PhaseId.TechnicalDesign);

        Assert.Equal(PhaseId.TechnicalDesign, run.CurrentPhase);
        Assert.Equal(UserStoryStatus.Active, run.Status);
        Assert.False(run.IsPhaseApproved(PhaseId.TechnicalDesign));
    }

    [Fact]
    public void RequestRegression_FromImplementationToRefinement_Throws()
    {
        var run = CreateRun();
        AdvanceToImplementation(run);

        var act = () => run.RequestRegression(PhaseId.Refinement);

        Assert.Throws<WorkflowDomainException>(act);
    }

    [Fact]
    public void RequestRegression_ClearsApprovalsFromTargetPhaseOnward()
    {
        var run = CreateRun();
        AdvanceToReleaseApproval(run);

        run.RequestRegression(PhaseId.Refinement);

        Assert.False(run.IsPhaseApproved(PhaseId.Refinement));
        Assert.False(run.IsPhaseApproved(PhaseId.TechnicalDesign));
        Assert.Equal(UserStoryStatus.WaitingUser, run.Status);
    }

    private static WorkflowRun CreateRun()
    {
        return new WorkflowRun("US-0001", "sha256:abc", WorkflowDefinition.CanonicalV1);
    }

    private static void AdvanceToImplementation(WorkflowRun run)
    {
        run.GenerateNextPhase();
        run.GenerateNextPhase();
        run.ApproveCurrentPhase("main", "feature/us-0001-test-story", "feature", "workflow", "Test story", ".specs/us/workflow/US-0001/us.md");
        run.GenerateNextPhase();
        run.GenerateNextPhase();
    }

    private static void AdvanceToReview(WorkflowRun run)
    {
        AdvanceToImplementation(run);
        run.GenerateNextPhase();
    }

    private static void AdvanceToReleaseApproval(WorkflowRun run)
    {
        AdvanceToReview(run);
        run.GenerateNextPhase();
    }
}
