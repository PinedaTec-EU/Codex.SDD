using SpecForge.Domain.Application;
using SpecForge.Domain.Persistence;
using SpecForge.Domain.Workflow;

namespace SpecForge.Domain.Tests;

public sealed class SpecForgeApplicationServiceTests : IDisposable
{
    private readonly string workspaceRoot = Path.Combine(Path.GetTempPath(), Guid.NewGuid().ToString("N"));

    [Fact]
    public async Task ListUserStoriesAsync_ReturnsSummariesFromSpecsDirectory()
    {
        var runner = new WorkflowRunner();
        var applicationService = new SpecForgeApplicationService();
        await runner.CreateUserStoryAsync(workspaceRoot, "US-0001", "Story one", "feature", "workflow", "Initial source");

        var items = await applicationService.ListUserStoriesAsync(workspaceRoot);

        var summary = Assert.Single(items);
        Assert.Equal("US-0001", summary.UsId);
        Assert.Equal("workflow", summary.Category);
        Assert.Equal("capture", summary.CurrentPhase);
        Assert.Equal("active", summary.Status);
    }

    [Fact]
    public async Task GetUserStorySummaryAsync_ReturnsBranchNameWhenAvailable()
    {
        var runner = new WorkflowRunner();
        var applicationService = new SpecForgeApplicationService();
        await runner.CreateUserStoryAsync(workspaceRoot, "US-0001", "Story one", "feature", "workflow", "Initial source");
        await runner.ContinuePhaseAsync(workspaceRoot, "US-0001");
        await ResolvePendingApprovalQuestionsAsync(runner, "US-0001");
        await runner.ApproveCurrentPhaseAsync(workspaceRoot, "US-0001", "main");

        var summary = await applicationService.GetUserStorySummaryAsync(workspaceRoot, "US-0001");

        Assert.Equal("feature/us-0001-story-one", summary.WorkBranch);
        Assert.Equal("workflow", summary.Category);
        Assert.Equal("active", summary.Status);
    }

    [Fact]
    public async Task RequestRegressionAsync_UsesPhaseSlugAndReturnsUpdatedState()
    {
        var runner = new WorkflowRunner();
        var applicationService = new SpecForgeApplicationService();
        await runner.CreateUserStoryAsync(workspaceRoot, "US-0001", "Story one", "feature", "workflow", "Initial source");
        await runner.ContinuePhaseAsync(workspaceRoot, "US-0001");
        await ResolvePendingApprovalQuestionsAsync(runner, "US-0001");
        await runner.ApproveCurrentPhaseAsync(workspaceRoot, "US-0001", "main");
        await runner.ContinuePhaseAsync(workspaceRoot, "US-0001");
        await runner.ContinuePhaseAsync(workspaceRoot, "US-0001");
        await runner.ContinuePhaseAsync(workspaceRoot, "US-0001");

        var result = await applicationService.RequestRegressionAsync(
            workspaceRoot,
            "US-0001",
            "technical-design",
            "Review requested regression");

        Assert.Equal("US-0001", result.UsId);
        Assert.Equal("technical-design", result.CurrentPhase);
        Assert.Equal("active", result.Status);
    }

    [Fact]
    public async Task RequestRegressionAsync_ToApprovedSpec_NonDestructivePreservesContinuationControls()
    {
        var runner = new WorkflowRunner();
        var applicationService = new SpecForgeApplicationService();
        await runner.CreateUserStoryAsync(workspaceRoot, "US-0001", "Story one", "feature", "workflow", "Initial source");
        await runner.ContinuePhaseAsync(workspaceRoot, "US-0001");
        await ResolvePendingApprovalQuestionsAsync(runner, "US-0001");
        await runner.ApproveCurrentPhaseAsync(workspaceRoot, "US-0001", "main");
        await runner.ContinuePhaseAsync(workspaceRoot, "US-0001");
        await runner.ContinuePhaseAsync(workspaceRoot, "US-0001");
        await runner.ContinuePhaseAsync(workspaceRoot, "US-0001");

        var result = await applicationService.RequestRegressionAsync(
            workspaceRoot,
            "US-0001",
            "spec",
            "Return to approved spec");

        Assert.Equal("spec", result.CurrentPhase);
        Assert.Equal("active", result.Status);

        var currentPhase = await applicationService.GetCurrentPhaseAsync(workspaceRoot, "US-0001");
        Assert.True(currentPhase.CanAdvance);
        Assert.False(currentPhase.CanApprove);
        Assert.True(currentPhase.RequiresApproval);
        Assert.Null(currentPhase.BlockingReason);
    }

    [Fact]
    public async Task RewindWorkflowAsync_ToApprovedSpec_NonDestructivePreservesContinuationControls()
    {
        var runner = new WorkflowRunner();
        var applicationService = new SpecForgeApplicationService();
        await runner.CreateUserStoryAsync(workspaceRoot, "US-0001", "Story one", "feature", "workflow", "Initial source");
        await runner.ContinuePhaseAsync(workspaceRoot, "US-0001");
        await ResolvePendingApprovalQuestionsAsync(runner, "US-0001");
        await runner.ApproveCurrentPhaseAsync(workspaceRoot, "US-0001", "main");
        await runner.ContinuePhaseAsync(workspaceRoot, "US-0001");

        var result = await applicationService.RewindWorkflowAsync(
            workspaceRoot,
            "US-0001",
            "spec");

        Assert.Equal("spec", result.CurrentPhase);
        Assert.Equal("active", result.Status);

        var currentPhase = await applicationService.GetCurrentPhaseAsync(workspaceRoot, "US-0001");
        Assert.True(currentPhase.CanAdvance);
        Assert.False(currentPhase.CanApprove);
        Assert.True(currentPhase.RequiresApproval);
        Assert.Null(currentPhase.BlockingReason);
    }

    [Fact]
    public async Task GenerateNextPhaseAsync_AfterNonDestructiveReviewRewind_ReplaysReviewBeforeReleaseApproval()
    {
        var runner = new WorkflowRunner(new PassingReviewPhaseExecutionProvider());
        var applicationService = new SpecForgeApplicationService(new UserStoryFileStore(), runner);
        await runner.CreateUserStoryAsync(workspaceRoot, "US-0001", "Story one", "feature", "workflow", "Initial source");
        await runner.ContinuePhaseAsync(workspaceRoot, "US-0001");
        await ResolvePendingApprovalQuestionsAsync(runner, "US-0001");
        await runner.ApproveCurrentPhaseAsync(workspaceRoot, "US-0001", "main");
        await runner.ContinuePhaseAsync(workspaceRoot, "US-0001");
        await runner.ContinuePhaseAsync(workspaceRoot, "US-0001");
        await runner.ContinuePhaseAsync(workspaceRoot, "US-0001");
        await applicationService.GenerateNextPhaseAsync(workspaceRoot, "US-0001");

        var rewind = await applicationService.RewindWorkflowAsync(
            workspaceRoot,
            "US-0001",
            "review");

        Assert.Equal("review", rewind.CurrentPhase);
        Assert.Equal("active", rewind.Status);
        var currentPhase = await applicationService.GetCurrentPhaseAsync(workspaceRoot, "US-0001");
        Assert.True(currentPhase.CanAdvance);
        Assert.Null(currentPhase.BlockingReason);
        Assert.Equal("review", currentPhase.ExecutionPhase);

        var rewoundWorkflow = await applicationService.GetUserStoryWorkflowAsync(workspaceRoot, "US-0001");
        Assert.Equal("review", rewoundWorkflow.Controls.ExecutionPhase);

        var replay = await applicationService.GenerateNextPhaseAsync(workspaceRoot, "US-0001");

        Assert.Equal("review", replay.CurrentPhase);
        Assert.Equal("active", replay.Status);
        Assert.NotNull(replay.GeneratedArtifactPath);
        Assert.EndsWith("04-review.v02.md", replay.GeneratedArtifactPath, StringComparison.Ordinal);

        var paths = UserStoryFilePaths.ResolveFromWorkspaceRoot(workspaceRoot, "US-0001");
        Assert.True(File.Exists(paths.GetPhaseArtifactPath(PhaseId.Review, version: 2)));
        var workflow = await applicationService.GetUserStoryWorkflowAsync(workspaceRoot, "US-0001");
        Assert.Equal("review", workflow.CurrentPhase);
        Assert.Contains(workflow.Events, timelineEvent =>
            timelineEvent.Code == "phase_completed" &&
            timelineEvent.Phase == "review" &&
            timelineEvent.Artifacts.Any(artifact => artifact.Contains("04-review.v02.md", StringComparison.Ordinal)));
    }

    [Fact]
    public async Task GenerateNextPhaseAsync_AfterFailedReview_ReplaysCurrentReview()
    {
        var fileStore = new UserStoryFileStore();
        var runner = new WorkflowRunner(
            fileStore,
            new RetryPassingReviewPhaseExecutionProvider(),
            new RepositoryCategoryCatalog(),
            new NoOpWorkBranchManager());
        var applicationService = new SpecForgeApplicationService(fileStore, runner);
        await runner.CreateUserStoryAsync(workspaceRoot, "US-0001", "Review rerun", "feature", "workflow", "Initial source");
        await runner.ContinuePhaseAsync(workspaceRoot, "US-0001");
        await ResolvePendingApprovalQuestionsAsync(runner, "US-0001");
        await runner.ApproveCurrentPhaseAsync(workspaceRoot, "US-0001", "main");
        await runner.ContinuePhaseAsync(workspaceRoot, "US-0001");
        await runner.ContinuePhaseAsync(workspaceRoot, "US-0001");
        await runner.ContinuePhaseAsync(workspaceRoot, "US-0001");

        var currentPhase = await applicationService.GetCurrentPhaseAsync(workspaceRoot, "US-0001");
        Assert.False(currentPhase.CanAdvance);
        Assert.Equal("review_failed", currentPhase.BlockingReason);
        Assert.Equal("review", currentPhase.ExecutionPhase);
        Assert.NotNull(currentPhase.ExecutionReadiness);
        Assert.True(currentPhase.ExecutionReadiness!.CanExecute);

        var replay = await applicationService.GenerateNextPhaseAsync(workspaceRoot, "US-0001");

        Assert.Equal("review", replay.CurrentPhase);
        Assert.NotNull(replay.GeneratedArtifactPath);
        Assert.EndsWith("04-review.v02.md", replay.GeneratedArtifactPath, StringComparison.Ordinal);
    }

    [Fact]
    public async Task RestartUserStoryFromSourceAsync_ReturnsRegeneratedSpecState()
    {
        var runner = new WorkflowRunner();
        var applicationService = new SpecForgeApplicationService();
        await runner.CreateUserStoryAsync(workspaceRoot, "US-0001", "Story one", "feature", "workflow", "Initial source");
        await runner.ContinuePhaseAsync(workspaceRoot, "US-0001");

        var paths = UserStoryFilePaths.ResolveFromWorkspaceRoot(workspaceRoot, "US-0001");
        await File.WriteAllTextAsync(paths.MainArtifactPath, "# US-0001 · Story one\n\n## Objective\nUpdated source");

        var result = await applicationService.RestartUserStoryFromSourceAsync(
            workspaceRoot,
            "US-0001",
            "Source changed after spec");

        Assert.Equal("US-0001", result.UsId);
        Assert.Equal("spec", result.CurrentPhase);
        Assert.Equal("waiting-user", result.Status);
        Assert.NotNull(result.GeneratedArtifactPath);
    }

    [Fact]
    public async Task GetUserStoryWorkflowAsync_ReturnsPhaseDetailsControlsAndTimelineEvents()
    {
        var runner = new WorkflowRunner();
        var applicationService = new SpecForgeApplicationService();
        var promptInitializer = new RepositoryPromptInitializer();
        await promptInitializer.InitializeAsync(workspaceRoot);
        await runner.CreateUserStoryAsync(workspaceRoot, "US-0001", "Story one", "feature", "workflow", "Initial source");
        await runner.ContinuePhaseAsync(workspaceRoot, "US-0001");
        await runner.OperateCurrentPhaseArtifactAsync(workspaceRoot, "US-0001", "Keep the spec implementation-only.", actor: "alice");
        var paths = UserStoryFilePaths.ResolveFromWorkspaceRoot(workspaceRoot, "US-0001");
        Directory.CreateDirectory(paths.ContextDirectoryPath);
        await File.WriteAllTextAsync(Path.Combine(paths.ContextDirectoryPath, "service.cs"), "Context");
        Directory.CreateDirectory(paths.AttachmentsDirectoryPath);
        await File.WriteAllTextAsync(Path.Combine(paths.AttachmentsDirectoryPath, "notes.md"), "Attachment");

        var workflow = await applicationService.GetUserStoryWorkflowAsync(workspaceRoot, "US-0001");

        Assert.Equal("US-0001", workflow.UsId);
        Assert.Equal("spec", workflow.CurrentPhase);
        Assert.Equal("workflow", workflow.Category);
        Assert.Equal("waiting-user", workflow.Status);
        Assert.Equal(8, workflow.Phases.Count);
        Assert.NotNull(workflow.Refinement);
        Assert.Equal("ready_for_spec", workflow.Refinement!.Status);
        Assert.Contains(workflow.Phases, phase => phase.PhaseId == "refinement" && phase.ExpectsHumanIntervention);
        Assert.Contains(workflow.Phases, phase => phase.PhaseId == "technical-design" && !phase.ExpectsHumanIntervention);
        Assert.Contains(workflow.Phases, phase => phase.PhaseId == "refinement" && phase.Title == "Refinement" && phase.ExecutePromptPath is not null);
        Assert.Contains(workflow.Phases, phase => phase.PhaseId == "spec" && phase.IsCurrent && phase.Title == "Spec" && phase.ArtifactPath is not null && phase.OperationLogPath is not null);
        Assert.Contains(workflow.Phases, phase => phase.PhaseId == "spec" && phase.ExecutePromptPath is not null && phase.ApprovePromptPath is not null);
        Assert.All(workflow.ApprovalQuestions, question => Assert.Equal(question.IsResolved, string.Equals(question.Status, "resolved", StringComparison.Ordinal)));
        Assert.False(workflow.Controls.CanApprove);
        Assert.False(workflow.Controls.CanContinue);
        Assert.Empty(workflow.Controls.RegressionTargets);
        Assert.Contains("refinement", workflow.Controls.RewindTargets);
        Assert.Single(workflow.ContextFiles);
        Assert.Equal(paths.ContextDirectoryPath, workflow.ContextFilesDirectoryPath);
        Assert.Single(workflow.Attachments);
        Assert.Equal(paths.AttachmentsDirectoryPath, workflow.AttachmentsDirectoryPath);
        Assert.True(File.Exists(paths.RefinementFilePath));
        var userStory = await File.ReadAllTextAsync(paths.MainArtifactPath);
        Assert.DoesNotContain("## Refinement Log", userStory);
        Assert.Contains("`phase_completed`", workflow.RawTimeline);
        Assert.Contains("`artifact_operated`", workflow.RawTimeline);
        Assert.Contains(workflow.Events, timelineEvent => timelineEvent.Code == "phase_completed");
        Assert.Contains(workflow.Events, timelineEvent => timelineEvent.Code == "artifact_operated" && timelineEvent.Actor == "alice");
        var specIterations = workflow.PhaseIterations
            .Where(iteration => iteration.PhaseId == "spec")
            .OrderBy(iteration => iteration.Attempt)
            .ToArray();
        Assert.Equal(2, specIterations.Length);
        Assert.EndsWith(".ops.md", specIterations[1].OperationLogPath, StringComparison.OrdinalIgnoreCase);
        Assert.EndsWith(".md", specIterations[1].OutputArtifactPath, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task GetCurrentPhaseAsync_CompletedWorkflow_CannotAdvance()
    {
        var runner = new WorkflowRunner(
            new UserStoryFileStore(),
            new PassingReviewPhaseExecutionProvider(),
            new RepositoryCategoryCatalog(),
            new NoOpWorkBranchManager(),
            new RecordingPullRequestPublisher());
        var applicationService = new SpecForgeApplicationService();
        await runner.CreateUserStoryAsync(workspaceRoot, "US-0001", "Story one", "feature", "workflow", "Initial source");
        await runner.ContinuePhaseAsync(workspaceRoot, "US-0001");
        await ResolvePendingApprovalQuestionsAsync(runner, "US-0001");
        await runner.ApproveCurrentPhaseAsync(workspaceRoot, "US-0001", "main");
        await runner.ContinuePhaseAsync(workspaceRoot, "US-0001");
        await runner.ContinuePhaseAsync(workspaceRoot, "US-0001");
        await runner.ContinuePhaseAsync(workspaceRoot, "US-0001");
        await runner.ContinuePhaseAsync(workspaceRoot, "US-0001");
        await runner.ApproveCurrentPhaseAsync(workspaceRoot, "US-0001");
        await runner.ContinuePhaseAsync(workspaceRoot, "US-0001");
        await runner.ContinuePhaseAsync(workspaceRoot, "US-0001");

        var currentPhase = await applicationService.GetCurrentPhaseAsync(workspaceRoot, "US-0001");

        Assert.Equal("pr-preparation", currentPhase.CurrentPhase);
        Assert.Equal("completed", currentPhase.Status);
        Assert.False(currentPhase.CanAdvance);
        Assert.False(currentPhase.CanApprove);
        Assert.False(currentPhase.RequiresApproval);
        Assert.Equal("workflow_completed", currentPhase.BlockingReason);
    }

    [Fact]
    public async Task GetUserStoryWorkflowAsync_CompletedWorkflow_AppendsCompletedPhaseAsCurrent()
    {
        var runner = new WorkflowRunner(
            new UserStoryFileStore(),
            new PassingReviewPhaseExecutionProvider(),
            new RepositoryCategoryCatalog(),
            new NoOpWorkBranchManager(),
            new RecordingPullRequestPublisher());
        var applicationService = new SpecForgeApplicationService();
        await runner.CreateUserStoryAsync(workspaceRoot, "US-0001", "Story one", "feature", "workflow", "Initial source");
        await runner.ContinuePhaseAsync(workspaceRoot, "US-0001");
        await ResolvePendingApprovalQuestionsAsync(runner, "US-0001");
        await runner.ApproveCurrentPhaseAsync(workspaceRoot, "US-0001", "main");
        await runner.ContinuePhaseAsync(workspaceRoot, "US-0001");
        await runner.ContinuePhaseAsync(workspaceRoot, "US-0001");
        await runner.ContinuePhaseAsync(workspaceRoot, "US-0001");
        await runner.ContinuePhaseAsync(workspaceRoot, "US-0001");
        await runner.ApproveCurrentPhaseAsync(workspaceRoot, "US-0001");
        await runner.ContinuePhaseAsync(workspaceRoot, "US-0001");
        await runner.ContinuePhaseAsync(workspaceRoot, "US-0001");

        var workflow = await applicationService.GetUserStoryWorkflowAsync(workspaceRoot, "US-0001");

        var completedPhase = Assert.Single(workflow.Phases, phase => phase.PhaseId == "completed");
        Assert.True(completedPhase.IsCurrent);
        Assert.Equal("current", completedPhase.State);
        Assert.Contains(workflow.Phases, phase => phase.PhaseId == "pr-preparation" && !phase.IsCurrent);
    }

    [Fact]
    public async Task ReopenCompletedWorkflowAsync_FunctionalIssue_ReturnsWorkflowToSpec()
    {
        var runner = new WorkflowRunner(
            new UserStoryFileStore(),
            new PassingReviewPhaseExecutionProvider(),
            new RepositoryCategoryCatalog(),
            new NoOpWorkBranchManager(),
            new RecordingPullRequestPublisher());
        var applicationService = new SpecForgeApplicationService();
        await runner.CreateUserStoryAsync(workspaceRoot, "US-0001", "Story one", "feature", "workflow", "Initial source");
        await runner.ContinuePhaseAsync(workspaceRoot, "US-0001");
        await ResolvePendingApprovalQuestionsAsync(runner, "US-0001");
        await runner.ApproveCurrentPhaseAsync(workspaceRoot, "US-0001", "main");
        await runner.ContinuePhaseAsync(workspaceRoot, "US-0001");
        await runner.ContinuePhaseAsync(workspaceRoot, "US-0001");
        await runner.ContinuePhaseAsync(workspaceRoot, "US-0001");
        await runner.ContinuePhaseAsync(workspaceRoot, "US-0001");
        await runner.ApproveCurrentPhaseAsync(workspaceRoot, "US-0001");
        await runner.ContinuePhaseAsync(workspaceRoot, "US-0001");
        await runner.ContinuePhaseAsync(workspaceRoot, "US-0001");

        var result = await applicationService.ReopenCompletedWorkflowAsync(
            workspaceRoot,
            "US-0001",
            "functional-issue",
            "Customer validation found a business rule gap.",
            actor: "alice");

        Assert.Equal("US-0001", result.UsId);
        Assert.Equal("spec", result.CurrentPhase);
        Assert.Equal("waiting-user", result.Status);

        var workflow = await applicationService.GetUserStoryWorkflowAsync(workspaceRoot, "US-0001");
        Assert.Equal("spec", workflow.CurrentPhase);
        Assert.Equal("waiting-user", workflow.Status);
        Assert.Contains(workflow.Events, timelineEvent =>
            timelineEvent.Code == "workflow_reopened"
            && timelineEvent.Actor == "alice"
            && timelineEvent.Summary is not null
            && timelineEvent.Summary.Contains("functional-issue", StringComparison.Ordinal)
            && timelineEvent.Summary.Contains("spec", StringComparison.Ordinal));
    }

    [Fact]
    public async Task ReopenCompletedWorkflowAsync_Defect_ReturnsWorkflowToImplementation()
    {
        var runner = new WorkflowRunner(
            new UserStoryFileStore(),
            new PassingReviewPhaseExecutionProvider(),
            new RepositoryCategoryCatalog(),
            new NoOpWorkBranchManager(),
            new RecordingPullRequestPublisher());
        var applicationService = new SpecForgeApplicationService();
        await runner.CreateUserStoryAsync(workspaceRoot, "US-0001", "Story one", "feature", "workflow", "Initial source");
        await runner.ContinuePhaseAsync(workspaceRoot, "US-0001");
        await ResolvePendingApprovalQuestionsAsync(runner, "US-0001");
        await runner.ApproveCurrentPhaseAsync(workspaceRoot, "US-0001", "main");
        await runner.ContinuePhaseAsync(workspaceRoot, "US-0001");
        await runner.ContinuePhaseAsync(workspaceRoot, "US-0001");
        await runner.ContinuePhaseAsync(workspaceRoot, "US-0001");
        await runner.ContinuePhaseAsync(workspaceRoot, "US-0001");
        await runner.ApproveCurrentPhaseAsync(workspaceRoot, "US-0001");
        await runner.ContinuePhaseAsync(workspaceRoot, "US-0001");
        await runner.ContinuePhaseAsync(workspaceRoot, "US-0001");

        var result = await applicationService.ReopenCompletedWorkflowAsync(
            workspaceRoot,
            "US-0001",
            "defect",
            "Production validation found a bug in the delivered behavior.",
            actor: "alice");

        Assert.Equal("US-0001", result.UsId);
        Assert.Equal("implementation", result.CurrentPhase);
        Assert.Equal("active", result.Status);

        var workflow = await applicationService.GetUserStoryWorkflowAsync(workspaceRoot, "US-0001");
        Assert.Equal("implementation", workflow.CurrentPhase);
        Assert.Equal("active", workflow.Status);
        Assert.Contains(workflow.Events, timelineEvent =>
            timelineEvent.Code == "workflow_reopened"
            && timelineEvent.Actor == "alice"
            && timelineEvent.Summary is not null
            && timelineEvent.Summary.Contains("defect", StringComparison.Ordinal)
            && timelineEvent.Summary.Contains("implementation", StringComparison.Ordinal));
    }

    [Fact]
    public async Task ReopenCompletedWorkflowAsync_TechnicalIssue_ReturnsWorkflowToTechnicalDesign()
    {
        var runner = new WorkflowRunner(
            new UserStoryFileStore(),
            new PassingReviewPhaseExecutionProvider(),
            new RepositoryCategoryCatalog(),
            new NoOpWorkBranchManager(),
            new RecordingPullRequestPublisher());
        var applicationService = new SpecForgeApplicationService();
        await runner.CreateUserStoryAsync(workspaceRoot, "US-0001", "Story one", "feature", "workflow", "Initial source");
        await runner.ContinuePhaseAsync(workspaceRoot, "US-0001");
        await ResolvePendingApprovalQuestionsAsync(runner, "US-0001");
        await runner.ApproveCurrentPhaseAsync(workspaceRoot, "US-0001", "main");
        await runner.ContinuePhaseAsync(workspaceRoot, "US-0001");
        await runner.ContinuePhaseAsync(workspaceRoot, "US-0001");
        await runner.ContinuePhaseAsync(workspaceRoot, "US-0001");
        await runner.ContinuePhaseAsync(workspaceRoot, "US-0001");
        await runner.ApproveCurrentPhaseAsync(workspaceRoot, "US-0001");
        await runner.ContinuePhaseAsync(workspaceRoot, "US-0001");
        await runner.ContinuePhaseAsync(workspaceRoot, "US-0001");

        var result = await applicationService.ReopenCompletedWorkflowAsync(
            workspaceRoot,
            "US-0001",
            "technical-issue",
            "APR found technical debt that requires design corrections.",
            actor: "alice");

        Assert.Equal("US-0001", result.UsId);
        Assert.Equal("technical-design", result.CurrentPhase);
        Assert.Equal("active", result.Status);

        var workflow = await applicationService.GetUserStoryWorkflowAsync(workspaceRoot, "US-0001");
        Assert.Equal("technical-design", workflow.CurrentPhase);
        Assert.Equal("active", workflow.Status);
        Assert.Contains(workflow.Events, timelineEvent =>
            timelineEvent.Code == "workflow_reopened"
            && timelineEvent.Actor == "alice"
            && timelineEvent.Summary is not null
            && timelineEvent.Summary.Contains("technical-issue", StringComparison.Ordinal)
            && timelineEvent.Summary.Contains("technical-design", StringComparison.Ordinal));
    }

    [Fact]
    public async Task RewindWorkflowAsync_CompletedWorkflowWithLockEnabled_Throws()
    {
        var runner = new WorkflowRunner(
            new UserStoryFileStore(),
            new PassingReviewPhaseExecutionProvider(),
            new RepositoryCategoryCatalog(),
            new NoOpWorkBranchManager(),
            new RecordingPullRequestPublisher(),
            runtimeVersion: null,
            refinementTolerance: "balanced",
            completedUsLockOnCompleted: true);
        var applicationService = new SpecForgeApplicationService();
        await runner.CreateUserStoryAsync(workspaceRoot, "US-0001", "Story one", "feature", "workflow", "Initial source");
        await runner.ContinuePhaseAsync(workspaceRoot, "US-0001");
        await ResolvePendingApprovalQuestionsAsync(runner, "US-0001");
        await runner.ApproveCurrentPhaseAsync(workspaceRoot, "US-0001", "main");
        await runner.ContinuePhaseAsync(workspaceRoot, "US-0001");
        await runner.ContinuePhaseAsync(workspaceRoot, "US-0001");
        await runner.ContinuePhaseAsync(workspaceRoot, "US-0001");
        await runner.ContinuePhaseAsync(workspaceRoot, "US-0001");
        await runner.ApproveCurrentPhaseAsync(workspaceRoot, "US-0001");
        await runner.ContinuePhaseAsync(workspaceRoot, "US-0001");
        await runner.ContinuePhaseAsync(workspaceRoot, "US-0001");

        var error = await Assert.ThrowsAsync<WorkflowDomainException>(() =>
            applicationService.RewindWorkflowAsync(workspaceRoot, "US-0001", "review"));

        Assert.Contains("locked", error.Message, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task GetCurrentPhaseAsync_WithUnresolvedSpecApprovalQuestions_CannotApprove()
    {
        var runner = new WorkflowRunner();
        var applicationService = new SpecForgeApplicationService();
        await runner.CreateUserStoryAsync(workspaceRoot, "US-0001", "Story one", "feature", "workflow", "Initial source");
        await runner.ContinuePhaseAsync(workspaceRoot, "US-0001");

        var currentPhase = await applicationService.GetCurrentPhaseAsync(workspaceRoot, "US-0001");

        Assert.Equal("spec", currentPhase.CurrentPhase);
        Assert.False(currentPhase.CanAdvance);
        Assert.False(currentPhase.CanApprove);
        Assert.True(currentPhase.RequiresApproval);
        Assert.Equal("spec_pending_user_approval", currentPhase.BlockingReason);
    }

    [Fact]
    public async Task AddUserStoryFilesAsync_CopiesFilesIntoRequestedKind()
    {
        var runner = new WorkflowRunner();
        var applicationService = new SpecForgeApplicationService();
        await runner.CreateUserStoryAsync(workspaceRoot, "US-0001", "Story one", "feature", "workflow", "Initial source");
        var sourcePath = Path.Combine(workspaceRoot, "src", "service.cs");
        Directory.CreateDirectory(Path.GetDirectoryName(sourcePath)!);
        await File.WriteAllTextAsync(sourcePath, "class Service {}");

        var result = await applicationService.AddUserStoryFilesAsync(
            workspaceRoot,
            "US-0001",
            [sourcePath],
            "context");

        var contextFile = Assert.Single(result.ContextFiles);
        Assert.Equal("service.cs", contextFile.Name);
        Assert.Empty(result.Attachments);
        Assert.True(File.Exists(contextFile.Path));
    }

    [Fact]
    public async Task SetUserStoryFileKindAsync_MovesFilesBetweenContextAndAttachments()
    {
        var runner = new WorkflowRunner();
        var applicationService = new SpecForgeApplicationService();
        await runner.CreateUserStoryAsync(workspaceRoot, "US-0001", "Story one", "feature", "workflow", "Initial source");
        var paths = UserStoryFilePaths.ResolveFromWorkspaceRoot(workspaceRoot, "US-0001");
        Directory.CreateDirectory(paths.AttachmentsDirectoryPath);
        var attachmentPath = Path.Combine(paths.AttachmentsDirectoryPath, "notes.md");
        await File.WriteAllTextAsync(attachmentPath, "Attachment");

        var result = await applicationService.SetUserStoryFileKindAsync(
            workspaceRoot,
            "US-0001",
            attachmentPath,
            "context");

        Assert.Empty(result.Attachments);
        var contextFile = Assert.Single(result.ContextFiles);
        Assert.Equal("notes.md", contextFile.Name);
        Assert.True(File.Exists(contextFile.Path));
        Assert.False(File.Exists(attachmentPath));
    }

    [Fact]
    public async Task GenerateNextPhaseAsync_PersistsRuntimeStatusAndRejectsDuplicateExecutionWhileRunning()
    {
        var provider = new BlockingPhaseExecutionProvider();
        var runner = new WorkflowRunner(provider);
        var applicationService = new SpecForgeApplicationService(
            new UserStoryFileStore(),
            runner,
            new RepositoryPromptInitializer(),
            new RepositoryCategoryCatalog(),
            new UserStoryRuntimeStatusStore());

        await runner.CreateUserStoryAsync(workspaceRoot, "US-0001", "Story one", "feature", "workflow", "Initial source");

        var runningTask = applicationService.GenerateNextPhaseAsync(workspaceRoot, "US-0001");
        await provider.WaitUntilStartedAsync();

        var runtimeWhileRunning = await applicationService.GetUserStoryRuntimeStatusAsync(workspaceRoot, "US-0001");
        Assert.Equal("running", runtimeWhileRunning.Status);
        Assert.Equal("generate-next-phase", runtimeWhileRunning.ActiveOperation);
        Assert.Equal("capture", runtimeWhileRunning.CurrentPhase);
        Assert.False(runtimeWhileRunning.IsStale);
        Assert.NotNull(runtimeWhileRunning.StartedAtUtc);
        Assert.NotNull(runtimeWhileRunning.LastHeartbeatUtc);

        var currentPhaseWhileRunning = await applicationService.GetCurrentPhaseAsync(workspaceRoot, "US-0001");
        Assert.False(currentPhaseWhileRunning.CanAdvance);
        Assert.False(currentPhaseWhileRunning.CanApprove);
        Assert.Equal("phase_execution_in_progress", currentPhaseWhileRunning.BlockingReason);

        var duplicateException = await Assert.ThrowsAsync<WorkflowDomainException>(
            () => applicationService.GenerateNextPhaseAsync(workspaceRoot, "US-0001"));
        Assert.Contains("phase_execution_in_progress", duplicateException.Message);

        provider.Release();
        var result = await runningTask;
        Assert.Equal("spec", result.CurrentPhase);

        var runtimeAfterCompletion = await applicationService.GetUserStoryRuntimeStatusAsync(workspaceRoot, "US-0001");
        Assert.Equal("idle", runtimeAfterCompletion.Status);
        Assert.Null(runtimeAfterCompletion.ActiveOperation);
        Assert.Equal("succeeded", runtimeAfterCompletion.LastOutcome);
        Assert.NotNull(runtimeAfterCompletion.LastCompletedAtUtc);
    }

    [Fact]
    public async Task GenerateNextPhaseAsync_IgnoresRuntimeLockFromDeadOwnerProcess()
    {
        var runner = new WorkflowRunner(new DeterministicPhaseExecutionProvider());
        var deadOwnerStore = new UserStoryRuntimeStatusStore(currentProcessId: int.MaxValue);
        var applicationService = new SpecForgeApplicationService(
            new UserStoryFileStore(),
            runner,
            new RepositoryPromptInitializer(),
            new RepositoryCategoryCatalog(),
            deadOwnerStore);

        await runner.CreateUserStoryAsync(workspaceRoot, "US-0001", "Story one", "feature", "workflow", "Initial source");

        var paths = UserStoryFilePaths.ResolveFromWorkspaceRoot(workspaceRoot, "US-0001");
        await using (var ignored = await deadOwnerStore.StartOperationAsync(
            paths.RootDirectory,
            "US-0001",
            "capture",
            "generate-next-phase"))
        {
        }

        var runtimeBeforeRecovery = await applicationService.GetUserStoryRuntimeStatusAsync(workspaceRoot, "US-0001");
        Assert.Equal("running", runtimeBeforeRecovery.Status);
        Assert.True(runtimeBeforeRecovery.IsStale);

        var currentPhaseBeforeRecovery = await applicationService.GetCurrentPhaseAsync(workspaceRoot, "US-0001");
        Assert.True(currentPhaseBeforeRecovery.CanAdvance);
        Assert.Null(currentPhaseBeforeRecovery.BlockingReason);

        var result = await applicationService.GenerateNextPhaseAsync(workspaceRoot, "US-0001");

        Assert.Equal("spec", result.CurrentPhase);
    }

    [Fact]
    public async Task GetCurrentPhaseAsync_BlocksAdvanceWhenImplementationProfileLacksRepositoryWriteAccess()
    {
        var runner = new WorkflowRunner(new CapabilityAwarePhaseExecutionProvider(
            new PhaseExecutionReadiness(PhaseId.Implementation, CanExecute: false, PhaseExecutionBlockingReasons.ImplementationRequiresRepositoryWriteAccess)));
        var applicationService = new SpecForgeApplicationService(
            new UserStoryFileStore(),
            runner,
            new RepositoryPromptInitializer(),
            new RepositoryCategoryCatalog(),
            new UserStoryRuntimeStatusStore());

        await runner.CreateUserStoryAsync(workspaceRoot, "US-0001", "Story one", "feature", "workflow", "Initial source");
        await runner.ContinuePhaseAsync(workspaceRoot, "US-0001");
        await ResolvePendingApprovalQuestionsAsync(runner, "US-0001");
        await runner.ApproveCurrentPhaseAsync(workspaceRoot, "US-0001", "main");
        await runner.ContinuePhaseAsync(workspaceRoot, "US-0001");

        var currentPhase = await applicationService.GetCurrentPhaseAsync(workspaceRoot, "US-0001");

        Assert.Equal("technical-design", currentPhase.CurrentPhase);
        Assert.False(currentPhase.CanAdvance);
        Assert.False(currentPhase.CanApprove);
        Assert.False(currentPhase.RequiresApproval);
        Assert.Equal(PhaseExecutionBlockingReasons.ImplementationRequiresRepositoryWriteAccess, currentPhase.BlockingReason);

        var error = await Assert.ThrowsAsync<WorkflowDomainException>(() =>
            applicationService.GenerateNextPhaseAsync(workspaceRoot, "US-0001"));
        Assert.Contains(PhaseExecutionBlockingReasons.ImplementationRequiresRepositoryWriteAccess, error.Message);
    }

    public void Dispose()
    {
        if (Directory.Exists(workspaceRoot))
        {
            Directory.Delete(workspaceRoot, recursive: true);
        }
    }

    private async Task ResolvePendingApprovalQuestionsAsync(WorkflowRunner runner, string usId)
    {
        var paths = UserStoryFilePaths.ResolveFromWorkspaceRoot(workspaceRoot, usId);
        var artifactPath = paths.GetLatestExistingPhaseArtifactPath(PhaseId.Spec)
            ?? throw new InvalidOperationException("Expected a spec artifact before resolving approval questions.");
        var markdown = await File.ReadAllTextAsync(artifactPath);
        var pendingQuestions = ApprovalQuestionMarkdown.ParseFromMarkdown(markdown)
            .Where(static item => !item.Resolved)
            .Select(static item => item.Question)
            .ToArray();

        foreach (var question in pendingQuestions)
        {
            await runner.SubmitApprovalAnswerAsync(
                workspaceRoot,
                usId,
                question,
                $"Resolved in test setup for: {question}",
                "test-user");
        }
    }

    private sealed class BlockingPhaseExecutionProvider : IPhaseExecutionProvider
    {
        private readonly TaskCompletionSource<bool> started = new(TaskCreationOptions.RunContinuationsAsynchronously);
        private readonly TaskCompletionSource<bool> release = new(TaskCreationOptions.RunContinuationsAsynchronously);
        private readonly DeterministicPhaseExecutionProvider inner = new();

        public PhaseExecutionReadiness GetPhaseExecutionReadiness(PhaseId phaseId) =>
            inner.GetPhaseExecutionReadiness(phaseId);

        public async Task<PhaseExecutionResult> ExecuteAsync(PhaseExecutionContext context, CancellationToken cancellationToken = default)
        {
            started.TrySetResult(true);
            await release.Task.WaitAsync(cancellationToken);
            return await inner.ExecuteAsync(context, cancellationToken);
        }

        public Task<AutoRefinementAnswersResult?> TryAutoAnswerRefinementAsync(
            PhaseExecutionContext context,
            RefinementSession session,
            CancellationToken cancellationToken = default) =>
            inner.TryAutoAnswerRefinementAsync(context, session, cancellationToken);

        public Task WaitUntilStartedAsync() => started.Task;

        public void Release() => release.TrySetResult(true);
    }

    private sealed class CapabilityAwarePhaseExecutionProvider : IPhaseExecutionProvider
    {
        private readonly DeterministicPhaseExecutionProvider inner = new();
        private readonly IReadOnlyDictionary<PhaseId, PhaseExecutionReadiness> readinessByPhase;

        public CapabilityAwarePhaseExecutionProvider(params PhaseExecutionReadiness[] readiness)
        {
            readinessByPhase = readiness.ToDictionary(item => item.PhaseId);
        }

        public PhaseExecutionReadiness GetPhaseExecutionReadiness(PhaseId phaseId) =>
            readinessByPhase.TryGetValue(phaseId, out var readiness)
                ? readiness
                : inner.GetPhaseExecutionReadiness(phaseId);

        public Task<AutoRefinementAnswersResult?> TryAutoAnswerRefinementAsync(
            PhaseExecutionContext context,
            RefinementSession session,
            CancellationToken cancellationToken = default) =>
            inner.TryAutoAnswerRefinementAsync(context, session, cancellationToken);

        public Task<PhaseExecutionResult> ExecuteAsync(PhaseExecutionContext context, CancellationToken cancellationToken = default) =>
            inner.ExecuteAsync(context, cancellationToken);
    }

    private sealed class PassingReviewPhaseExecutionProvider : IPhaseExecutionProvider
    {
        private readonly DeterministicPhaseExecutionProvider inner = new();

        public PhaseExecutionReadiness GetPhaseExecutionReadiness(PhaseId phaseId) =>
            inner.GetPhaseExecutionReadiness(phaseId);

        public Task<AutoRefinementAnswersResult?> TryAutoAnswerRefinementAsync(
            PhaseExecutionContext context,
            RefinementSession session,
            CancellationToken cancellationToken = default) =>
            inner.TryAutoAnswerRefinementAsync(context, session, cancellationToken);

        public async Task<PhaseExecutionResult> ExecuteAsync(
            PhaseExecutionContext context,
            CancellationToken cancellationToken = default)
        {
            if (context.PhaseId == PhaseId.Implementation)
            {
                var featurePath = Path.Combine(context.WorkspaceRoot, "src", "Feature.cs");
                Directory.CreateDirectory(Path.GetDirectoryName(featurePath)!);
                await File.WriteAllTextAsync(
                    featurePath,
                    "namespace SpecForge;\npublic static class Feature { public const int Enabled = 1; }\n",
                    cancellationToken);
            }

            if (context.PhaseId == PhaseId.Review)
            {
                var paths = UserStoryFilePaths.ResolveFromWorkspaceRoot(context.WorkspaceRoot, context.UsId);
                var validationItems = WorkflowRunner.ReadTechnicalDesignValidationStrategy(paths);
                var checklist = validationItems.Select(item => $"- ✅ {item} Evidence: Validated by replay test.").ToArray();
                var content = string.Join(
                    Environment.NewLine,
                    [
                        $"# Review · {context.UsId} · v01",
                        string.Empty,
                        "## State",
                        "- Result: `pass`",
                        string.Empty,
                        "## Validation Checklist",
                        ..checklist,
                        string.Empty,
                        "## Findings",
                        "- No findings.",
                        string.Empty,
                        "## Verdict",
                        "- Final result: `pass`",
                        "- Primary reason: Replay test review passed.",
                        string.Empty,
                        "## Recommendation",
                        "- Advance."
                    ]) + Environment.NewLine;

                return new PhaseExecutionResult(
                    content,
                    ExecutionKind: "test-double");
            }

            return await inner.ExecuteAsync(context, cancellationToken);
        }
    }

    private sealed class RetryPassingReviewPhaseExecutionProvider : IPhaseExecutionProvider
    {
        private readonly DeterministicPhaseExecutionProvider inner = new();
        private int reviewAttemptCount;

        public PhaseExecutionReadiness GetPhaseExecutionReadiness(PhaseId phaseId) =>
            inner.GetPhaseExecutionReadiness(phaseId);

        public Task<AutoRefinementAnswersResult?> TryAutoAnswerRefinementAsync(
            PhaseExecutionContext context,
            RefinementSession session,
            CancellationToken cancellationToken = default) =>
            inner.TryAutoAnswerRefinementAsync(context, session, cancellationToken);

        public async Task<PhaseExecutionResult> ExecuteAsync(
            PhaseExecutionContext context,
            CancellationToken cancellationToken = default)
        {
            if (context.PhaseId == PhaseId.Implementation)
            {
                var featurePath = Path.Combine(context.WorkspaceRoot, "src", "Feature.cs");
                Directory.CreateDirectory(Path.GetDirectoryName(featurePath)!);
                await File.WriteAllTextAsync(
                    featurePath,
                    "namespace SpecForge;\npublic static class Feature { public const int Enabled = 1; }\n",
                    cancellationToken);
            }

            if (context.PhaseId == PhaseId.Review)
            {
                reviewAttemptCount++;
                if (reviewAttemptCount == 1)
                {
                    var failingContent = string.Join(
                        Environment.NewLine,
                        [
                            $"# Review · {context.UsId} · v01",
                            string.Empty,
                            "## State",
                            "- Result: `pass`",
                            string.Empty,
                            "## Checks Performed",
                            "- [x] Schema conformance",
                            string.Empty,
                            "## Findings",
                            "- No findings.",
                            string.Empty,
                            "## Verdict",
                            "- Final result: `pass`",
                            "- Primary reason: Generic review claimed success.",
                            string.Empty,
                            "## Recommendation",
                            "- Advance."
                        ]) + Environment.NewLine;

                    return new PhaseExecutionResult(failingContent, ExecutionKind: "test-double");
                }

                var paths = UserStoryFilePaths.ResolveFromWorkspaceRoot(context.WorkspaceRoot, context.UsId);
                var validationItems = WorkflowRunner.ReadTechnicalDesignValidationStrategy(paths);
                var checklist = validationItems.Select(item => $"- ✅ {item} Evidence: Validated on retry.").ToArray();
                var content = string.Join(
                    Environment.NewLine,
                    [
                        $"# Review · {context.UsId} · v02",
                        string.Empty,
                        "## State",
                        "- Result: `pass`",
                        string.Empty,
                        "## Validation Checklist",
                        ..checklist,
                        string.Empty,
                        "## Findings",
                        "- No findings.",
                        string.Empty,
                        "## Verdict",
                        "- Final result: `pass`",
                        "- Primary reason: Retry validated every required item.",
                        string.Empty,
                        "## Recommendation",
                        "- Advance."
                    ]) + Environment.NewLine;

                return new PhaseExecutionResult(content, ExecutionKind: "test-double");
            }

            return await inner.ExecuteAsync(context, cancellationToken);
        }
    }

    private sealed class NoOpWorkBranchManager : IWorkBranchManager
    {
        public Task<WorkBranchCreationResult> CreateBranchAsync(
            string workspaceRoot,
            string baseBranch,
            string workBranch,
            CancellationToken cancellationToken = default) =>
            Task.FromResult(new WorkBranchCreationResult(
                IsGitWorkspace: true,
                BranchCreated: false,
                CurrentBranch: baseBranch,
                UpstreamBranch: $"origin/{baseBranch}"));
    }

    private sealed class RecordingPullRequestPublisher : IPullRequestPublisher
    {
        public Task<PullRequestPublicationResult> PublishAsync(
            string workspaceRoot,
            string usId,
            WorkBranch branch,
            PrPreparationArtifactDocument artifact,
            CancellationToken cancellationToken = default) =>
            Task.FromResult(new PullRequestPublicationResult(
                CommitCreated: true,
                CommitSha: "abc123",
                RemoteBranch: branch.WorkBranchName,
                IsDraft: true,
                Number: 101,
                Url: "https://github.com/example/repo/pull/101"));
    }
}
