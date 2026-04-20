using SpecForge.Domain.Application;
using SpecForge.Domain.Persistence;
using SpecForge.Domain.Workflow;

namespace SpecForge.Domain.Tests;

public sealed class WorkflowRunnerTests : IDisposable
{
    private readonly string workspaceRoot = Path.Combine(Path.GetTempPath(), Guid.NewGuid().ToString("N"));

    [Fact]
    public async Task CreateUserStoryAsync_CreatesSpecsStructureAndSeedFiles()
    {
        var runner = new WorkflowRunner();

        var rootDirectory = await runner.CreateUserStoryAsync(workspaceRoot, "US-0001", "Test story", "feature", "workflow", "Initial source text");

        Assert.Equal(Path.Combine(workspaceRoot, ".specs", "us", "us.US-0001"), rootDirectory);
        Assert.True(File.Exists(Path.Combine(rootDirectory, "us.md")));
        Assert.True(File.Exists(Path.Combine(rootDirectory, "state.yaml")));
        Assert.True(File.Exists(Path.Combine(rootDirectory, "timeline.md")));
    }

    [Fact]
    public async Task ContinuePhaseAsync_FromCapture_GeneratesRefinementArtifact()
    {
        var runner = new WorkflowRunner();
        await runner.CreateUserStoryAsync(workspaceRoot, "US-0001", "Test story", "feature", "workflow", "Initial source text");

        var result = await runner.ContinuePhaseAsync(workspaceRoot, "US-0001");

        Assert.Equal(PhaseId.Refinement, result.CurrentPhase);
        Assert.Equal(UserStoryStatus.WaitingUser, result.Status);
        Assert.NotNull(result.GeneratedArtifactPath);
        Assert.True(File.Exists(result.GeneratedArtifactPath!));
        var refinementContent = await File.ReadAllTextAsync(result.GeneratedArtifactPath!);
        Assert.Contains("Initial source text", refinementContent);
        Assert.Contains("## Red Team", refinementContent);
        Assert.Contains("## Blue Team", refinementContent);
    }

    [Fact]
    public async Task ContinuePhaseAsync_FromCapture_WithInsufficientSource_RequestsClarification()
    {
        var runner = new WorkflowRunner();
        await runner.CreateUserStoryAsync(workspaceRoot, "US-0001", "Test story", "feature", "workflow", "sample US");

        var result = await runner.ContinuePhaseAsync(workspaceRoot, "US-0001");

        Assert.Equal(PhaseId.Clarification, result.CurrentPhase);
        Assert.Equal(UserStoryStatus.WaitingUser, result.Status);
        Assert.NotNull(result.GeneratedArtifactPath);
        var loadedRun = await new UserStoryFileStore().LoadAsync(
            UserStoryFilePaths.FromWorkspaceRoot(workspaceRoot, "US-0001").RootDirectory);
        Assert.Equal(PhaseId.Clarification, loadedRun.CurrentPhase);

        var paths = UserStoryFilePaths.FromWorkspaceRoot(workspaceRoot, "US-0001");
        var userStoryPath = paths.MainArtifactPath;
        var userStory = await File.ReadAllTextAsync(userStoryPath);
        Assert.DoesNotContain("## Clarification Log", userStory);
        Assert.True(File.Exists(paths.ClarificationFilePath));
        var clarification = await File.ReadAllTextAsync(paths.ClarificationFilePath);
        Assert.Contains("## Clarification Log", clarification);
        Assert.Contains("### Questions", clarification);
        Assert.Contains("### Answers", clarification);

        var timelinePath = UserStoryFilePaths.FromWorkspaceRoot(workspaceRoot, "US-0001").TimelineFilePath;
        var timeline = await File.ReadAllTextAsync(timelinePath);
        Assert.Contains("`clarification_requested`", timeline);
    }

    [Fact]
    public async Task SubmitClarificationAnswersAsync_AllowsClarificationToAdvanceToRefinement()
    {
        var runner = new WorkflowRunner();
        await runner.CreateUserStoryAsync(workspaceRoot, "US-0001", "Test story", "feature", "workflow", "sample US");
        await runner.ContinuePhaseAsync(workspaceRoot, "US-0001");

        var answerResult = await runner.SubmitClarificationAnswersAsync(
            workspaceRoot,
            "US-0001",
            [
                "El analista funcional.",
                "It receives form data and must produce a refinement specification that can be validated.",
                "A clear objective and verifiable acceptance criteria must remain."
            ]);

        Assert.Equal("clarification", answerResult.CurrentPhase);
        Assert.Equal("active", answerResult.Status);
        Assert.Equal(3, answerResult.AnsweredQuestions);

        var continueResult = await runner.ContinuePhaseAsync(workspaceRoot, "US-0001");

        Assert.Equal(PhaseId.Refinement, continueResult.CurrentPhase);
        Assert.Equal(UserStoryStatus.WaitingUser, continueResult.Status);
        Assert.NotNull(continueResult.GeneratedArtifactPath);

        var timelinePath = UserStoryFilePaths.FromWorkspaceRoot(workspaceRoot, "US-0001").TimelineFilePath;
        var timeline = await File.ReadAllTextAsync(timelinePath);
        Assert.Contains("`clarification_answered`", timeline);
        Assert.Contains("`clarification_passed`", timeline);

        var paths = UserStoryFilePaths.FromWorkspaceRoot(workspaceRoot, "US-0001");
        var userStory = await File.ReadAllTextAsync(paths.MainArtifactPath);
        Assert.DoesNotContain("## Clarification Log", userStory);
        var clarification = await File.ReadAllTextAsync(paths.ClarificationFilePath);
        Assert.Contains("El analista funcional.", clarification);
    }

    [Fact]
    public async Task ContinuePhaseAsync_FromClarification_MergesNewQuestionsWithPreviousOnes()
    {
        var runner = new WorkflowRunner();
        var paths = UserStoryFilePaths.FromWorkspaceRoot(workspaceRoot, "US-0001");
        await runner.CreateUserStoryAsync(workspaceRoot, "US-0001", "Test story", "feature", "workflow", "sample US");
        await runner.ContinuePhaseAsync(workspaceRoot, "US-0001");
        await File.WriteAllTextAsync(
            paths.ClarificationFilePath,
            UserStoryClarificationMarkdown.Serialize(
                new ClarificationSession(
                    "needs_clarification",
                    "balanced",
                    "Need more detail.",
                    [
                        new ClarificationItem(1, "Question A", "Answer A"),
                        new ClarificationItem(2, "Question B", null)
                    ])));

        await runner.SubmitClarificationAnswersAsync(
            workspaceRoot,
            "US-0001",
            ["Answer A updated", "Answer B updated"]);

        var generatedClarificationPath = paths.GetPhaseArtifactPath(PhaseId.Clarification);
        await File.WriteAllTextAsync(
            generatedClarificationPath,
            """
            # Clarification · US-0001 · v02

            ## State
            - State: `pending_user_input`

            ## Decision
            needs_clarification

            ## Reason
            Still missing one more detail.

            ## Questions
            1. Question C
            """
        );

        var parseMethod = typeof(WorkflowRunner).GetMethod("ParseClarificationArtifact", System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Static)!;
        var updateMethod = typeof(WorkflowRunner).GetMethod("UpdateClarificationLogAsync", System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Static)!;
        var assessment = parseMethod.Invoke(null, [await File.ReadAllTextAsync(generatedClarificationPath)])!;
        await (Task)updateMethod.Invoke(null, [paths, assessment, CancellationToken.None])!;

        var mergedClarification = await File.ReadAllTextAsync(paths.ClarificationFilePath);
        Assert.Contains("1. Question A", mergedClarification);
        Assert.Contains("2. Question B", mergedClarification);
        Assert.Contains("3. Question C", mergedClarification);
        Assert.Contains("1. Answer A updated", mergedClarification);
        Assert.Contains("2. Answer B updated", mergedClarification);
        Assert.Contains("3. ...", mergedClarification);
    }

    [Fact]
    public async Task ContinuePhaseAsync_FromCapture_WithShortButConcreteSource_AllowsRefinement()
    {
        var runner = new WorkflowRunner();
        await runner.CreateUserStoryAsync(
            workspaceRoot,
            "US-0001",
            "Test story",
            "feature",
            "workflow",
            "Allow users to export approved invoices to CSV with date filters and totals.");

        var result = await runner.ContinuePhaseAsync(workspaceRoot, "US-0001");

        Assert.Equal(PhaseId.Refinement, result.CurrentPhase);
        Assert.NotNull(result.GeneratedArtifactPath);
    }

    [Fact]
    public async Task ApproveCurrentPhaseAsync_ThenContinuePhaseAsync_GeneratesTechnicalDesign()
    {
        var runner = new WorkflowRunner();
        await runner.CreateUserStoryAsync(workspaceRoot, "US-0001", "Test story", "feature", "workflow", "Initial source text");
        await runner.ContinuePhaseAsync(workspaceRoot, "US-0001");

        await runner.ApproveCurrentPhaseAsync(workspaceRoot, "US-0001", "main");
        var result = await runner.ContinuePhaseAsync(workspaceRoot, "US-0001");

        Assert.Equal(PhaseId.TechnicalDesign, result.CurrentPhase);
        Assert.Equal(UserStoryStatus.WaitingUser, result.Status);
        var technicalDesignContent = await File.ReadAllTextAsync(result.GeneratedArtifactPath!);
        Assert.Contains("## Affected Components", technicalDesignContent);
        Assert.Contains("SpecForge.Runner.Cli", technicalDesignContent);

        var loadedRun = await new UserStoryFileStore().LoadAsync(
            UserStoryFilePaths.FromWorkspaceRoot(workspaceRoot, "US-0001").RootDirectory);
        Assert.NotNull(loadedRun.Branch);
        Assert.Equal("main", loadedRun.Branch!.BaseBranch);
        Assert.Equal("feature/us-0001-test-story", loadedRun.Branch.WorkBranchName);
        Assert.Equal("feature", loadedRun.Branch.Kind);
        Assert.Equal("workflow", loadedRun.Branch.Category);
    }

    [Fact]
    public async Task RequestRegressionAsync_FromReviewToTechnicalDesign_PersistsStateAndTimeline()
    {
        var runner = new WorkflowRunner();
        await runner.CreateUserStoryAsync(workspaceRoot, "US-0001", "Test story", "feature", "workflow", "Initial source text");
        await runner.ContinuePhaseAsync(workspaceRoot, "US-0001");
        await runner.ApproveCurrentPhaseAsync(workspaceRoot, "US-0001", "main");
        await runner.ContinuePhaseAsync(workspaceRoot, "US-0001");
        await runner.ApproveCurrentPhaseAsync(workspaceRoot, "US-0001");
        await runner.ContinuePhaseAsync(workspaceRoot, "US-0001");
        await runner.ContinuePhaseAsync(workspaceRoot, "US-0001");

        var result = await runner.RequestRegressionAsync(workspaceRoot, "US-0001", PhaseId.TechnicalDesign, "Review found a design gap");

        Assert.Equal("technical-design", result.CurrentPhase);
        Assert.Equal("waiting-user", result.Status);

        var loadedRun = await new UserStoryFileStore().LoadAsync(
            UserStoryFilePaths.FromWorkspaceRoot(workspaceRoot, "US-0001").RootDirectory);
        Assert.Equal(PhaseId.TechnicalDesign, loadedRun.CurrentPhase);
        Assert.False(loadedRun.IsPhaseApproved(PhaseId.TechnicalDesign));

        var timelinePath = UserStoryFilePaths.FromWorkspaceRoot(workspaceRoot, "US-0001").TimelineFilePath;
        var timeline = await File.ReadAllTextAsync(timelinePath);
        Assert.Contains("`phase_regressed`", timeline);
        Assert.Contains("Review found a design gap", timeline);
    }

    [Fact]
    public async Task RestartUserStoryFromSourceAsync_WhenSourceChanged_ArchivesDerivedStateAndRegeneratesRefinement()
    {
        var runner = new WorkflowRunner();
        await runner.CreateUserStoryAsync(workspaceRoot, "US-0001", "Test story", "feature", "workflow", "Initial source text");
        await runner.ContinuePhaseAsync(workspaceRoot, "US-0001");
        await runner.ApproveCurrentPhaseAsync(workspaceRoot, "US-0001", "main");
        await runner.ContinuePhaseAsync(workspaceRoot, "US-0001");

        var paths = UserStoryFilePaths.FromWorkspaceRoot(workspaceRoot, "US-0001");
        await File.WriteAllTextAsync(
            paths.MainArtifactPath,
            "# US-0001 · Test story\n\n## Objective\nUpdated source text\n\n## Initial Scope\n- Includes:\n  - restart flow");

        var result = await runner.RestartUserStoryFromSourceAsync(
            workspaceRoot,
            "US-0001",
            "Source changed after technical design");

        Assert.Equal("refinement", result.CurrentPhase);
        Assert.Equal("waiting-user", result.Status);
        Assert.NotNull(result.GeneratedArtifactPath);
        Assert.True(File.Exists(result.GeneratedArtifactPath!));

        var refinementContent = await File.ReadAllTextAsync(result.GeneratedArtifactPath!);
        Assert.Contains("Updated source text", refinementContent);

        var loadedRun = await new UserStoryFileStore().LoadAsync(paths.RootDirectory);
        Assert.Equal(PhaseId.Refinement, loadedRun.CurrentPhase);
        Assert.False(loadedRun.IsPhaseApproved(PhaseId.Refinement));
        Assert.Null(loadedRun.Branch);

        var archiveDirectory = Directory.GetDirectories(paths.RestartsDirectoryPath).Single();
        Assert.True(File.Exists(Path.Combine(archiveDirectory, "state.yaml")));
        Assert.True(File.Exists(Path.Combine(archiveDirectory, "branch.yaml")));
        Assert.True(File.Exists(Path.Combine(archiveDirectory, "phases", "01-refinement.md")));
        Assert.True(File.Exists(Path.Combine(archiveDirectory, "phases", "02-technical-design.md")));

        var archivedBranch = await File.ReadAllTextAsync(Path.Combine(archiveDirectory, "branch.yaml"));
        Assert.Contains("status: superseded", archivedBranch);

        var timeline = await File.ReadAllTextAsync(paths.TimelineFilePath);
        Assert.Contains("`source_hash_mismatch_detected`", timeline);
        Assert.Contains("`us_restarted_from_source`", timeline);
        Assert.Contains("Source changed after technical design", timeline);
    }

    [Fact]
    public async Task ResetUserStoryToCaptureAsync_DeletesDerivedArtifactsAndReturnsToCapture()
    {
        var runner = new WorkflowRunner();
        await runner.CreateUserStoryAsync(workspaceRoot, "US-0001", "Test story", "feature", "workflow", "Initial source text");
        await runner.ContinuePhaseAsync(workspaceRoot, "US-0001");
        await runner.ApproveCurrentPhaseAsync(workspaceRoot, "US-0001", "main");
        await runner.ContinuePhaseAsync(workspaceRoot, "US-0001");

        var paths = UserStoryFilePaths.FromWorkspaceRoot(workspaceRoot, "US-0001");
        Assert.True(Directory.Exists(paths.PhasesDirectoryPath));
        Assert.True(File.Exists(paths.BranchFilePath));

        var result = await runner.ResetUserStoryToCaptureAsync(workspaceRoot, "US-0001");

        Assert.Equal("capture", result.CurrentPhase);
        Assert.Equal("active", result.Status);
        Assert.Contains(paths.PhasesDirectoryPath, result.DeletedPaths);
        Assert.Contains(paths.BranchFilePath, result.DeletedPaths);
        Assert.Contains(paths.MainArtifactPath, result.PreservedPaths);
        Assert.Contains(paths.StateFilePath, result.PreservedPaths);
        Assert.Contains(paths.TimelineFilePath, result.PreservedPaths);

        var workflowRun = await new UserStoryFileStore().LoadAsync(paths.RootDirectory);
        Assert.Equal(PhaseId.Capture, workflowRun.CurrentPhase);
        Assert.Equal(UserStoryStatus.Active, workflowRun.Status);
        Assert.False(workflowRun.IsPhaseApproved(PhaseId.Refinement));
        Assert.False(File.Exists(paths.BranchFilePath));
        Assert.False(File.Exists(paths.ClarificationFilePath));
        Assert.True(Directory.Exists(paths.PhasesDirectoryPath));
        Assert.Empty(Directory.EnumerateFileSystemEntries(paths.PhasesDirectoryPath));

        var timeline = await File.ReadAllTextAsync(paths.TimelineFilePath);
        Assert.Contains("`us_created`", timeline);
        Assert.DoesNotContain("`phase_completed`", timeline);
        Assert.DoesNotContain("`phase_approved`", timeline);
    }

    [Fact]
    public async Task RestartUserStoryFromSourceAsync_WithoutSourceChange_Throws()
    {
        var runner = new WorkflowRunner();
        await runner.CreateUserStoryAsync(workspaceRoot, "US-0001", "Test story", "feature", "workflow", "Initial source text");
        await runner.ContinuePhaseAsync(workspaceRoot, "US-0001");

        var error = await Assert.ThrowsAsync<WorkflowDomainException>(() =>
            runner.RestartUserStoryFromSourceAsync(workspaceRoot, "US-0001", "No actual source change"));

        Assert.Contains("source has not changed", error.Message);
    }

    [Fact]
    public async Task TimelineMarkdownParser_ParseEvents_ExtractsStructuredAuditData()
    {
        const string timeline = """
# Timeline · US-0001 · Test story

## Events

### 2026-04-18T09:10:00Z · `phase_approved`

- Actor: `user`
- Phase: `refinement`
- Summary: Phase `refinement` approved.
- Artifacts:
  - .specs/us/us.US-0001/branch.yaml
""";

        var events = TimelineMarkdownParser.ParseEvents(timeline);

        var timelineEvent = Assert.Single(events);
        Assert.Equal("2026-04-18T09:10:00Z", timelineEvent.TimestampUtc);
        Assert.Equal("phase_approved", timelineEvent.Code);
        Assert.Equal("user", timelineEvent.Actor);
        Assert.Equal("refinement", timelineEvent.Phase);
        Assert.Equal("Phase `refinement` approved.", timelineEvent.Summary);
        Assert.Single(timelineEvent.Artifacts);
    }

    [Fact]
    public void TimelineMarkdownParser_ParseEvents_ExtractsTokenUsageAndDuration()
    {
        const string timeline = """
# Timeline · US-0001 · Test story

## Events

### 2026-04-18T09:10:00Z · `phase_completed`

- Actor: `system`
- Phase: `refinement`
- Summary: Generated artifact for phase `refinement`.
- Artifacts:
  - .specs/us/us.US-0001/phases/01-refinement.md
- Tokens:
  - input: `486`
  - output: `1644`
  - total: `2130`
- Duration: `18765` ms
""";

        var events = TimelineMarkdownParser.ParseEvents(timeline);

        var timelineEvent = Assert.Single(events);
        Assert.NotNull(timelineEvent.Usage);
        Assert.Equal(486, timelineEvent.Usage!.InputTokens);
        Assert.Equal(1644, timelineEvent.Usage.OutputTokens);
        Assert.Equal(2130, timelineEvent.Usage.TotalTokens);
        Assert.Equal(18765, timelineEvent.DurationMs);
    }

    [Fact]
    public async Task ContinuePhaseAsync_WithProviderUsage_PersistsTokenUsageInResultAndTimeline()
    {
        var runner = new WorkflowRunner(new UsageCapturingPhaseExecutionProvider());
        await runner.CreateUserStoryAsync(workspaceRoot, "US-0001", "Test story", "feature", "workflow", "Initial source text");

        var result = await runner.ContinuePhaseAsync(workspaceRoot, "US-0001");

        Assert.NotNull(result.Usage);
        Assert.Equal(321, result.Usage!.InputTokens);
        Assert.Equal(123, result.Usage.OutputTokens);
        Assert.Equal(444, result.Usage.TotalTokens);

        var timelinePath = UserStoryFilePaths.FromWorkspaceRoot(workspaceRoot, "US-0001").TimelineFilePath;
        var timeline = await File.ReadAllTextAsync(timelinePath);
        Assert.Contains("- Tokens:", timeline);
        Assert.Contains("input: `321`", timeline);
        Assert.Contains("output: `123`", timeline);
        Assert.Contains("total: `444`", timeline);
        Assert.Contains("- Duration:", timeline);
    }

    public void Dispose()
    {
        if (Directory.Exists(workspaceRoot))
        {
            Directory.Delete(workspaceRoot, recursive: true);
        }
    }

    private sealed class UsageCapturingPhaseExecutionProvider : IPhaseExecutionProvider
    {
        public Task<PhaseExecutionResult> ExecuteAsync(
            PhaseExecutionContext context,
            CancellationToken cancellationToken = default) =>
            Task.FromResult(
                new PhaseExecutionResult(
                    "# generated markdown\n\n## Tokens\n- captured",
                    "test-double",
                    new TokenUsage(321, 123, 444)));
    }
}
