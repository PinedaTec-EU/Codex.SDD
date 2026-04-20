using SpecForge.Domain.Application;
using SpecForge.Domain.Persistence;

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
    public async Task RestartUserStoryFromSourceAsync_ReturnsRegeneratedRefinementState()
    {
        var runner = new WorkflowRunner();
        var applicationService = new SpecForgeApplicationService();
        await runner.CreateUserStoryAsync(workspaceRoot, "US-0001", "Story one", "feature", "workflow", "Initial source");
        await runner.ContinuePhaseAsync(workspaceRoot, "US-0001");

        var paths = UserStoryFilePaths.FromWorkspaceRoot(workspaceRoot, "US-0001");
        await File.WriteAllTextAsync(paths.MainArtifactPath, "# US-0001 · Story one\n\n## Objective\nUpdated source");

        var result = await applicationService.RestartUserStoryFromSourceAsync(
            workspaceRoot,
            "US-0001",
            "Source changed after refinement");

        Assert.Equal("US-0001", result.UsId);
        Assert.Equal("refinement", result.CurrentPhase);
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
        var paths = UserStoryFilePaths.FromWorkspaceRoot(workspaceRoot, "US-0001");
        Directory.CreateDirectory(paths.ContextDirectoryPath);
        await File.WriteAllTextAsync(Path.Combine(paths.ContextDirectoryPath, "service.cs"), "Context");
        Directory.CreateDirectory(paths.AttachmentsDirectoryPath);
        await File.WriteAllTextAsync(Path.Combine(paths.AttachmentsDirectoryPath, "notes.md"), "Attachment");

        var workflow = await applicationService.GetUserStoryWorkflowAsync(workspaceRoot, "US-0001");

        Assert.Equal("US-0001", workflow.UsId);
        Assert.Equal("refinement", workflow.CurrentPhase);
        Assert.Equal("workflow", workflow.Category);
        Assert.Equal("waiting-user", workflow.Status);
        Assert.Equal(8, workflow.Phases.Count);
        Assert.NotNull(workflow.Clarification);
        Assert.Equal("ready_for_refinement", workflow.Clarification!.Status);
        Assert.Contains(workflow.Phases, phase => phase.PhaseId == "clarification" && phase.Title == "Refinement" && phase.ExecutePromptPath is not null);
        Assert.Contains(workflow.Phases, phase => phase.PhaseId == "refinement" && phase.IsCurrent && phase.Title == "Spec" && phase.ArtifactPath is not null);
        Assert.Contains(workflow.Phases, phase => phase.PhaseId == "refinement" && phase.ExecutePromptPath is not null && phase.ApprovePromptPath is not null);
        Assert.True(workflow.Controls.CanApprove);
        Assert.False(workflow.Controls.CanContinue);
        Assert.Single(workflow.ContextFiles);
        Assert.Equal(paths.ContextDirectoryPath, workflow.ContextFilesDirectoryPath);
        Assert.Single(workflow.Attachments);
        Assert.Equal(paths.AttachmentsDirectoryPath, workflow.AttachmentsDirectoryPath);
        Assert.True(File.Exists(paths.ClarificationFilePath));
        var userStory = await File.ReadAllTextAsync(paths.MainArtifactPath);
        Assert.DoesNotContain("## Clarification Log", userStory);
        Assert.Contains("`phase_completed`", workflow.RawTimeline);
        Assert.Contains(workflow.Events, timelineEvent => timelineEvent.Code == "phase_completed");
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
        var paths = UserStoryFilePaths.FromWorkspaceRoot(workspaceRoot, "US-0001");
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

        var duplicateException = await Assert.ThrowsAsync<InvalidOperationException>(
            () => applicationService.GenerateNextPhaseAsync(workspaceRoot, "US-0001"));
        Assert.Contains("already running", duplicateException.Message);

        provider.Release();
        var result = await runningTask;
        Assert.Equal("refinement", result.CurrentPhase);

        var runtimeAfterCompletion = await applicationService.GetUserStoryRuntimeStatusAsync(workspaceRoot, "US-0001");
        Assert.Equal("idle", runtimeAfterCompletion.Status);
        Assert.Null(runtimeAfterCompletion.ActiveOperation);
        Assert.Equal("succeeded", runtimeAfterCompletion.LastOutcome);
        Assert.NotNull(runtimeAfterCompletion.LastCompletedAtUtc);
    }

    public void Dispose()
    {
        if (Directory.Exists(workspaceRoot))
        {
            Directory.Delete(workspaceRoot, recursive: true);
        }
    }

    private sealed class BlockingPhaseExecutionProvider : IPhaseExecutionProvider
    {
        private readonly TaskCompletionSource<bool> started = new(TaskCreationOptions.RunContinuationsAsynchronously);
        private readonly TaskCompletionSource<bool> release = new(TaskCreationOptions.RunContinuationsAsynchronously);
        private readonly DeterministicPhaseExecutionProvider inner = new();

        public async Task<PhaseExecutionResult> ExecuteAsync(PhaseExecutionContext context, CancellationToken cancellationToken = default)
        {
            started.TrySetResult(true);
            await release.Task.WaitAsync(cancellationToken);
            return await inner.ExecuteAsync(context, cancellationToken);
        }

        public Task WaitUntilStartedAsync() => started.Task;

        public void Release() => release.TrySetResult(true);
    }
}
