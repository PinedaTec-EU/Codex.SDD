using System.Diagnostics;
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

        Assert.Equal(Path.Combine(workspaceRoot, ".specs", "us", "workflow", "US-0001"), rootDirectory);
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
        Assert.True(File.Exists(Path.ChangeExtension(result.GeneratedArtifactPath!, ".json")));
        var refinementContent = await File.ReadAllTextAsync(result.GeneratedArtifactPath!);
        Assert.Contains("# Spec · US-0001 · v01", refinementContent);
        Assert.Contains("Initial source text", refinementContent);
        Assert.Contains("## Inputs", refinementContent);
        Assert.Contains("## Acceptance Criteria", refinementContent);
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
            UserStoryFilePaths.ResolveFromWorkspaceRoot(workspaceRoot, "US-0001").RootDirectory);
        Assert.Equal(PhaseId.Clarification, loadedRun.CurrentPhase);

        var paths = UserStoryFilePaths.ResolveFromWorkspaceRoot(workspaceRoot, "US-0001");
        var userStoryPath = paths.MainArtifactPath;
        var userStory = await File.ReadAllTextAsync(userStoryPath);
        Assert.DoesNotContain("## Clarification Log", userStory);
        Assert.True(File.Exists(paths.ClarificationFilePath));
        var clarification = await File.ReadAllTextAsync(paths.ClarificationFilePath);
        Assert.Contains("## Clarification Log", clarification);
        Assert.Contains("### Questions", clarification);
        Assert.Contains("### Answers", clarification);

        var timelinePath = UserStoryFilePaths.ResolveFromWorkspaceRoot(workspaceRoot, "US-0001").TimelineFilePath;
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

        var timelinePath = UserStoryFilePaths.ResolveFromWorkspaceRoot(workspaceRoot, "US-0001").TimelineFilePath;
        var timeline = await File.ReadAllTextAsync(timelinePath);
        Assert.Contains("`clarification_answered`", timeline);
        Assert.Contains("`clarification_passed`", timeline);

        var paths = UserStoryFilePaths.ResolveFromWorkspaceRoot(workspaceRoot, "US-0001");
        var userStory = await File.ReadAllTextAsync(paths.MainArtifactPath);
        Assert.DoesNotContain("## Clarification Log", userStory);
        var clarification = await File.ReadAllTextAsync(paths.ClarificationFilePath);
        Assert.Contains("- Status: `ready_for_refinement`", clarification);
        Assert.DoesNotContain("El analista funcional.", clarification);
    }

    [Fact]
    public async Task ContinuePhaseAsync_WithAutoClarificationAnswers_ContinuesToRefinementWithoutUserInput()
    {
        var runner = new WorkflowRunner(new AutoAnsweringPhaseExecutionProvider());
        await runner.CreateUserStoryAsync(workspaceRoot, "US-0001", "Test story", "feature", "workflow", "sample US");

        var result = await runner.ContinuePhaseAsync(workspaceRoot, "US-0001");

        Assert.Equal(PhaseId.Refinement, result.CurrentPhase);
        Assert.Equal(UserStoryStatus.WaitingUser, result.Status);
        Assert.NotNull(result.GeneratedArtifactPath);

        var timeline = await File.ReadAllTextAsync(UserStoryFilePaths.ResolveFromWorkspaceRoot(workspaceRoot, "US-0001").TimelineFilePath);
        Assert.Contains("`clarification_auto_answered`", timeline);
        Assert.Contains("after automatic clarification answers", timeline);

        var clarification = await File.ReadAllTextAsync(UserStoryFilePaths.ResolveFromWorkspaceRoot(workspaceRoot, "US-0001").ClarificationFilePath);
        Assert.Contains("- Status: `ready_for_refinement`", clarification);
    }

    [Fact]
    public async Task OperateCurrentPhaseArtifactAsync_PersistsOperationSequenceAndRegeneratesSpec()
    {
        var runner = new WorkflowRunner();
        await runner.CreateUserStoryAsync(workspaceRoot, "US-0001", "Test story", "feature", "workflow", "Initial source text", "alice");
        await runner.ContinuePhaseAsync(workspaceRoot, "US-0001");

        var result = await runner.OperateCurrentPhaseArtifactAsync(
            workspaceRoot,
            "US-0001",
            "Do not expand scope into roadmap work. Keep the export columns fixed.",
            "bob");

        Assert.Equal("US-0001", result.UsId);
        Assert.Equal("refinement", result.CurrentPhase);
        Assert.Equal("waiting-user", result.Status);
        Assert.True(File.Exists(result.OperationLogPath));
        Assert.True(File.Exists(result.SourceArtifactPath));
        Assert.True(File.Exists(result.GeneratedArtifactPath));

        var operationMarkdown = await File.ReadAllTextAsync(result.OperationLogPath);
        Assert.Contains("`bob`", operationMarkdown);
        Assert.Contains("Keep the export columns fixed.", operationMarkdown);
        Assert.Contains(Path.GetFileName(result.SourceArtifactPath), operationMarkdown);
        Assert.Contains(Path.GetFileName(result.GeneratedArtifactPath), operationMarkdown);

        var regeneratedSpec = await File.ReadAllTextAsync(result.GeneratedArtifactPath);
        Assert.Contains("Applied artifact operation", regeneratedSpec);

        var timeline = await File.ReadAllTextAsync(UserStoryFilePaths.ResolveFromWorkspaceRoot(workspaceRoot, "US-0001").TimelineFilePath);
        Assert.Contains("`artifact_operated`", timeline);
        Assert.Contains("- Actor: `alice`", timeline);
        Assert.Contains("- Actor: `bob`", timeline);
    }

    [Fact]
    public async Task ContinuePhaseAsync_FromClarification_ReplacesPreviousQuestionsWithNewOnes()
    {
        var runner = new WorkflowRunner();
        var paths = UserStoryFilePaths.FromWorkspaceRoot(workspaceRoot, "workflow", "US-0001");
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
        await (Task)updateMethod.Invoke(null, [paths, assessment, "balanced", CancellationToken.None])!;

        var updatedClarification = await File.ReadAllTextAsync(paths.ClarificationFilePath);
        Assert.DoesNotContain("Question A", updatedClarification);
        Assert.DoesNotContain("Question B", updatedClarification);
        Assert.Contains("1. Question C", updatedClarification);
        Assert.Contains("1. ...", updatedClarification);
    }

    [Fact]
    public void ParseClarificationArtifact_DeduplicatesSemanticallyEquivalentQuestions()
    {
        const string clarificationMarkdown =
            """
            # Clarification · US-0001 · v01

            ## State
            - State: `pending_user_input`

            ## Decision
            needs_clarification

            ## Reason
            More detail is required.

            ## Questions
            1. What visible label should the field use in the Recent events UI: Source, TrackId, or Source / TrackId?
            2. Should the user see the field in Recent events as Source, TrackId, or Source / TrackId?
            3. Should the source filter require exact match or allow case-insensitive partial search?
            4. Must the source filter be exact, or can it use case-insensitive partial matching?
            """;

        var parseMethod = typeof(WorkflowRunner).GetMethod("ParseClarificationArtifact", System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Static)!;
        var assessment = parseMethod.Invoke(null, [clarificationMarkdown])!;
        var questions = (IReadOnlyCollection<string>)assessment.GetType().GetProperty("Questions")!.GetValue(assessment)!;

        Assert.Equal(2, questions.Count);
        Assert.Contains("What visible label should the field use in the Recent events UI: Source, TrackId, or Source / TrackId?", questions);
        Assert.Contains("Should the source filter require exact match or allow case-insensitive partial search?", questions);
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
        await ResolvePendingApprovalQuestionsAsync(runner, "US-0001");

        await runner.ApproveCurrentPhaseAsync(workspaceRoot, "US-0001", "main");
        var result = await runner.ContinuePhaseAsync(workspaceRoot, "US-0001");

        Assert.Equal(PhaseId.TechnicalDesign, result.CurrentPhase);
        Assert.Equal(UserStoryStatus.Active, result.Status);
        var technicalDesignContent = await File.ReadAllTextAsync(result.GeneratedArtifactPath!);
        Assert.Contains("## Affected Components", technicalDesignContent);
        Assert.Contains("Cross-cutting concerns", technicalDesignContent);
        Assert.Contains("## Validation Strategy", technicalDesignContent);

        var loadedRun = await new UserStoryFileStore().LoadAsync(
            UserStoryFilePaths.ResolveFromWorkspaceRoot(workspaceRoot, "US-0001").RootDirectory);
        Assert.NotNull(loadedRun.Branch);
        Assert.Equal("main", loadedRun.Branch!.BaseBranch);
        Assert.Equal("feature/us-0001-test-story", loadedRun.Branch.WorkBranchName);
        Assert.Equal("feature", loadedRun.Branch.Kind);
        Assert.Equal("workflow", loadedRun.Branch.Category);
    }

    [Fact]
    public async Task ApproveCurrentPhaseAsync_WhenApprovalQuestionsRemain_ThrowsValidationError()
    {
        var runner = new WorkflowRunner();
        await runner.CreateUserStoryAsync(workspaceRoot, "US-0001", "Test story", "feature", "workflow", "Initial source text");
        await runner.ContinuePhaseAsync(workspaceRoot, "US-0001");

        var error = await Assert.ThrowsAsync<WorkflowDomainException>(() =>
            runner.ApproveCurrentPhaseAsync(workspaceRoot, "US-0001", "main"));

        Assert.NotEmpty(error.Message);
    }

    [Fact]
    public async Task ApproveCurrentPhaseAsync_WhenTitleRepeatsKindAndUsId_DeduplicatesWorkBranchProposal()
    {
        var runner = new WorkflowRunner();
        await runner.CreateUserStoryAsync(
            workspaceRoot,
            "US-0001",
            "Feature US-0001 Checkout Flow",
            "feature",
            "workflow",
            "Initial source text");
        await runner.ContinuePhaseAsync(workspaceRoot, "US-0001");
        await ResolvePendingApprovalQuestionsAsync(runner, "US-0001");

        await runner.ApproveCurrentPhaseAsync(workspaceRoot, "US-0001", "main");

        var loadedRun = await new UserStoryFileStore().LoadAsync(
            UserStoryFilePaths.ResolveFromWorkspaceRoot(workspaceRoot, "US-0001").RootDirectory);
        Assert.NotNull(loadedRun.Branch);
        Assert.Equal("feature/us-0001-checkout-flow", loadedRun.Branch!.WorkBranchName);
    }

    [Fact]
    public async Task ApproveCurrentPhaseAsync_WhenSpecSchemaIsInvalid_ThrowsValidationError()
    {
        var runner = new WorkflowRunner();
        await runner.CreateUserStoryAsync(workspaceRoot, "US-0001", "Test story", "feature", "workflow", "Initial source text");
        await runner.ContinuePhaseAsync(workspaceRoot, "US-0001");

        var paths = UserStoryFilePaths.ResolveFromWorkspaceRoot(workspaceRoot, "US-0001");
        await File.WriteAllTextAsync(
            paths.GetPhaseArtifactPath(PhaseId.Refinement),
            """
            # Spec · US-0001 · v01

            ## History Log
            - `2026-04-20T10:15:00Z` · Initial spec creation.

            ## State
            - State: `pending_approval`
            - Based on: `us.md`

            ## Spec Summary
            ...
            """);

        var error = await Assert.ThrowsAsync<WorkflowDomainException>(() =>
            runner.ApproveCurrentPhaseAsync(workspaceRoot, "US-0001", "main"));

        Assert.Contains("required schema", error.Message);
        Assert.Contains("Inputs", error.Message);
    }

    [Fact]
    public async Task RequestRegressionAsync_FromReviewToTechnicalDesign_PersistsStateAndTimeline()
    {
        var runner = new WorkflowRunner();
        await runner.CreateUserStoryAsync(workspaceRoot, "US-0001", "Test story", "feature", "workflow", "Initial source text");
        await runner.ContinuePhaseAsync(workspaceRoot, "US-0001");
        await ResolvePendingApprovalQuestionsAsync(runner, "US-0001");
        await runner.ApproveCurrentPhaseAsync(workspaceRoot, "US-0001", "main");
        await runner.ContinuePhaseAsync(workspaceRoot, "US-0001");
        await runner.ContinuePhaseAsync(workspaceRoot, "US-0001");
        await runner.ContinuePhaseAsync(workspaceRoot, "US-0001");

        var result = await runner.RequestRegressionAsync(workspaceRoot, "US-0001", PhaseId.TechnicalDesign, "Review found a design gap");

        Assert.Equal("technical-design", result.CurrentPhase);
        Assert.Equal("active", result.Status);

        var loadedRun = await new UserStoryFileStore().LoadAsync(
            UserStoryFilePaths.ResolveFromWorkspaceRoot(workspaceRoot, "US-0001").RootDirectory);
        Assert.Equal(PhaseId.TechnicalDesign, loadedRun.CurrentPhase);
        Assert.False(loadedRun.IsPhaseApproved(PhaseId.TechnicalDesign));

        var timelinePath = UserStoryFilePaths.ResolveFromWorkspaceRoot(workspaceRoot, "US-0001").TimelineFilePath;
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
        await ResolvePendingApprovalQuestionsAsync(runner, "US-0001");
        await runner.ApproveCurrentPhaseAsync(workspaceRoot, "US-0001", "main");
        await runner.ContinuePhaseAsync(workspaceRoot, "US-0001");

        var paths = UserStoryFilePaths.ResolveFromWorkspaceRoot(workspaceRoot, "US-0001");
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
        Assert.True(File.Exists(Path.Combine(archiveDirectory, "phases", "01-spec.md")));
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
        await ResolvePendingApprovalQuestionsAsync(runner, "US-0001");
        await runner.ApproveCurrentPhaseAsync(workspaceRoot, "US-0001", "main");
        await runner.ContinuePhaseAsync(workspaceRoot, "US-0001");

        var paths = UserStoryFilePaths.ResolveFromWorkspaceRoot(workspaceRoot, "US-0001");
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
  - .specs/us/workflow/US-0001/branch.yaml
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
  - .specs/us/workflow/US-0001/phases/01-spec.md
- Tokens:
  - input: `486`
  - output: `1644`
  - total: `2130`
- Execution:
  - provider: `openai-compatible`
  - model: `gpt-4.1-mini`
  - profile: `light`
- Duration: `18765` ms
""";

        var events = TimelineMarkdownParser.ParseEvents(timeline);

        var timelineEvent = Assert.Single(events);
        Assert.NotNull(timelineEvent.Usage);
        Assert.Equal(486, timelineEvent.Usage!.InputTokens);
        Assert.Equal(1644, timelineEvent.Usage.OutputTokens);
        Assert.Equal(2130, timelineEvent.Usage.TotalTokens);
        Assert.NotNull(timelineEvent.Execution);
        Assert.Equal("openai-compatible", timelineEvent.Execution!.ProviderKind);
        Assert.Equal("gpt-4.1-mini", timelineEvent.Execution.Model);
        Assert.Equal("light", timelineEvent.Execution.ProfileName);
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

        var timelinePath = UserStoryFilePaths.ResolveFromWorkspaceRoot(workspaceRoot, "US-0001").TimelineFilePath;
        var timeline = await File.ReadAllTextAsync(timelinePath);
        Assert.Contains("- Tokens:", timeline);
        Assert.Contains("input: `321`", timeline);
        Assert.Contains("output: `123`", timeline);
        Assert.Contains("total: `444`", timeline);
        Assert.Contains("- Execution:", timeline);
        Assert.Contains("model: `stub-model`", timeline);
        Assert.Contains("profile: `test-profile`", timeline);
        Assert.Contains("- Duration:", timeline);
    }

    [Fact]
    public async Task ContinuePhaseAsync_WhenImplementationExecutionIsNotReady_ThrowsBeforeAdvancing()
    {
        var runner = new WorkflowRunner(new CapabilityAwarePhaseExecutionProvider(
            new PhaseExecutionReadiness(PhaseId.Implementation, CanExecute: false, PhaseExecutionBlockingReasons.ImplementationRequiresRepositoryWriteAccess)));
        await runner.CreateUserStoryAsync(workspaceRoot, "US-0001", "Test story", "feature", "workflow", "Initial source text");
        await runner.ContinuePhaseAsync(workspaceRoot, "US-0001");
        await ResolvePendingApprovalQuestionsAsync(runner, "US-0001");
        await runner.ApproveCurrentPhaseAsync(workspaceRoot, "US-0001", "main");
        await runner.ContinuePhaseAsync(workspaceRoot, "US-0001");

        var error = await Assert.ThrowsAsync<WorkflowDomainException>(() =>
            runner.ContinuePhaseAsync(workspaceRoot, "US-0001"));

        Assert.Contains(PhaseExecutionBlockingReasons.ImplementationRequiresRepositoryWriteAccess, error.Message);

        var loadedRun = await new UserStoryFileStore().LoadAsync(
            UserStoryFilePaths.ResolveFromWorkspaceRoot(workspaceRoot, "US-0001").RootDirectory);
        Assert.Equal(PhaseId.TechnicalDesign, loadedRun.CurrentPhase);
    }

    [Fact]
    public async Task ContinuePhaseAsync_WhenImplementationExecutionIsCanceled_PersistsImplementationAsCurrentPhase()
    {
        var provider = new BlockingPhaseExecutionProvider(PhaseId.Implementation);
        var runner = new WorkflowRunner(provider);
        await runner.CreateUserStoryAsync(workspaceRoot, "US-0001", "Test story", "feature", "workflow", "Initial source text");
        await runner.ContinuePhaseAsync(workspaceRoot, "US-0001");
        await ResolvePendingApprovalQuestionsAsync(runner, "US-0001");
        await runner.ApproveCurrentPhaseAsync(workspaceRoot, "US-0001", "main");
        await runner.ContinuePhaseAsync(workspaceRoot, "US-0001");

        using var cancellation = new CancellationTokenSource();
        var runningTask = runner.ContinuePhaseAsync(workspaceRoot, "US-0001", cancellationToken: cancellation.Token);
        await provider.WaitUntilStartedAsync();
        await cancellation.CancelAsync();

        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => runningTask);

        var paths = UserStoryFilePaths.ResolveFromWorkspaceRoot(workspaceRoot, "US-0001");
        var loadedRun = await new UserStoryFileStore().LoadAsync(paths.RootDirectory);
        Assert.Equal(PhaseId.Implementation, loadedRun.CurrentPhase);
        Assert.Equal(UserStoryStatus.Active, loadedRun.Status);
        Assert.False(File.Exists(paths.GetPhaseArtifactPath(PhaseId.Implementation)));
    }

    [Fact]
    public async Task ContinuePhaseAsync_Implementation_PersistsPhaseScopedEvidence_AndReviewConsumesIt()
    {
        await InitializeGitWorkspaceAsync(workspaceRoot);
        await RunGitAsync(workspaceRoot, "checkout", "-b", "main");
        await File.WriteAllTextAsync(Path.Combine(workspaceRoot, "README.md"), "seed");
        await RunGitAsync(workspaceRoot, "add", "README.md");
        await RunGitAsync(workspaceRoot, "commit", "-m", "seed");

        var provider = new EvidenceCapturingPhaseExecutionProvider();
        var runner = new WorkflowRunner(
            new UserStoryFileStore(),
            provider,
            new RepositoryCategoryCatalog(),
            new NoOpWorkBranchManager());
        await runner.CreateUserStoryAsync(workspaceRoot, "US-0001", "Implementation evidence", "feature", "workflow", "Initial source text");
        await runner.ContinuePhaseAsync(workspaceRoot, "US-0001");
        await ResolvePendingApprovalQuestionsAsync(runner, "US-0001");
        await runner.ApproveCurrentPhaseAsync(workspaceRoot, "US-0001", "main");
        await runner.ContinuePhaseAsync(workspaceRoot, "US-0001");
        await runner.ContinuePhaseAsync(workspaceRoot, "US-0001");
        await runner.ContinuePhaseAsync(workspaceRoot, "US-0001");

        var paths = UserStoryFilePaths.ResolveFromWorkspaceRoot(workspaceRoot, "US-0001");
        var implementationArtifact = await File.ReadAllTextAsync(paths.GetPhaseArtifactPath(PhaseId.Implementation));
        var evidenceMarkdown = await File.ReadAllTextAsync(paths.GetPhaseEvidenceMarkdownPath(PhaseId.Implementation));
        var evidenceJson = await File.ReadAllTextAsync(paths.GetPhaseEvidenceJsonPath(PhaseId.Implementation));

        Assert.Contains("## Captured Phase Evidence", implementationArtifact);
        Assert.Contains("src/Feature.cs", implementationArtifact);
        Assert.Contains("Meaningful touched repository files detected: `1`.", evidenceMarkdown);
        Assert.Contains("\"Path\": \"src/Feature.cs\"", evidenceJson);
        Assert.NotNull(provider.ReviewContext);
        Assert.Contains(paths.GetPhaseEvidenceMarkdownPath(PhaseId.Implementation), provider.ReviewContext!.ContextFilePaths);
    }

    [Fact]
    public async Task ContinuePhaseAsync_Review_ThrowsWhenImplementationDidNotTouchRepositoryFiles()
    {
        await InitializeGitWorkspaceAsync(workspaceRoot);
        await RunGitAsync(workspaceRoot, "checkout", "-b", "main");
        await File.WriteAllTextAsync(Path.Combine(workspaceRoot, "README.md"), "seed");
        await RunGitAsync(workspaceRoot, "add", "README.md");
        await RunGitAsync(workspaceRoot, "commit", "-m", "seed");

        var runner = new WorkflowRunner(
            new UserStoryFileStore(),
            new NoRepositoryDeltaPhaseExecutionProvider(),
            new RepositoryCategoryCatalog(),
            new NoOpWorkBranchManager());
        await runner.CreateUserStoryAsync(workspaceRoot, "US-0001", "Implementation evidence", "feature", "workflow", "Initial source text");
        await runner.ContinuePhaseAsync(workspaceRoot, "US-0001");
        await ResolvePendingApprovalQuestionsAsync(runner, "US-0001");
        await runner.ApproveCurrentPhaseAsync(workspaceRoot, "US-0001", "main");
        await runner.ContinuePhaseAsync(workspaceRoot, "US-0001");
        await runner.ContinuePhaseAsync(workspaceRoot, "US-0001");

        var error = await Assert.ThrowsAsync<WorkflowDomainException>(() =>
            runner.ContinuePhaseAsync(workspaceRoot, "US-0001"));

        Assert.Contains("requires implementation evidence with at least one touched repository file", error.Message);
    }

    public void Dispose()
    {
        if (Directory.Exists(workspaceRoot))
        {
            Directory.Delete(workspaceRoot, recursive: true);
        }
    }

    [Fact]
    public async Task ApproveCurrentPhaseAsync_CreatesAndChecksOutWorkBranch_WhenBaseBranchMatchesUpstream()
    {
        await InitializeGitWorkspaceAsync(workspaceRoot);
        await RunGitAsync(workspaceRoot, "checkout", "-b", "main");
        await File.WriteAllTextAsync(Path.Combine(workspaceRoot, "README.md"), "seed");
        await RunGitAsync(workspaceRoot, "add", "README.md");
        await RunGitAsync(workspaceRoot, "commit", "-m", "seed");

        var remoteDirectory = Path.Combine(Path.GetTempPath(), Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(remoteDirectory);
        try
        {
            await RunGitAsync(remoteDirectory, "init", "--bare");
            await RunGitAsync(workspaceRoot, "remote", "add", "origin", remoteDirectory);
            await RunGitAsync(workspaceRoot, "push", "-u", "origin", "main");

            var runner = new WorkflowRunner();
            await runner.CreateUserStoryAsync(workspaceRoot, "US-0001", "Branch creation", "feature", "workflow", "Initial source text");
            await runner.ContinuePhaseAsync(workspaceRoot, "US-0001");
            await ResolvePendingApprovalQuestionsAsync(runner, "US-0001");

            await runner.ApproveCurrentPhaseAsync(workspaceRoot, "US-0001", "main");

            var currentBranch = (await RunGitAsync(workspaceRoot, "branch", "--show-current")).Trim();
            Assert.Equal("feature/us-0001-branch-creation", currentBranch);

            var paths = UserStoryFilePaths.ResolveFromWorkspaceRoot(workspaceRoot, "US-0001");
            var timeline = await File.ReadAllTextAsync(paths.TimelineFilePath);
            Assert.Contains("`branch_created`", timeline);
        }
        finally
        {
            if (Directory.Exists(remoteDirectory))
            {
                Directory.Delete(remoteDirectory, recursive: true);
            }
        }
    }

    [Fact]
    public async Task ApproveCurrentPhaseAsync_DoesNotCreateWorkBranch_WhenAlreadyOnWorkBranch()
    {
        await InitializeGitWorkspaceAsync(workspaceRoot);
        await RunGitAsync(workspaceRoot, "checkout", "-b", "feature/us-0001-branch-creation");
        await File.WriteAllTextAsync(Path.Combine(workspaceRoot, "README.md"), "seed");
        await RunGitAsync(workspaceRoot, "add", "README.md");
        await RunGitAsync(workspaceRoot, "commit", "-m", "seed");

        var runner = new WorkflowRunner();
        await runner.CreateUserStoryAsync(workspaceRoot, "US-0001", "Branch creation", "feature", "workflow", "Initial source text");
        await runner.ContinuePhaseAsync(workspaceRoot, "US-0001");
        await ResolvePendingApprovalQuestionsAsync(runner, "US-0001");

        await runner.ApproveCurrentPhaseAsync(workspaceRoot, "US-0001", "main");

        var currentBranch = (await RunGitAsync(workspaceRoot, "branch", "--show-current")).Trim();
        Assert.Equal("feature/us-0001-branch-creation", currentBranch);

        var paths = UserStoryFilePaths.ResolveFromWorkspaceRoot(workspaceRoot, "US-0001");
        var workflowRun = await new UserStoryFileStore().LoadAsync(paths.RootDirectory);
        Assert.NotNull(workflowRun.Branch);
        Assert.Equal("main", workflowRun.Branch!.BaseBranch);
        Assert.Equal("feature/us-0001-branch-creation", workflowRun.Branch.WorkBranchName);

        var timeline = await File.ReadAllTextAsync(paths.TimelineFilePath);
        Assert.DoesNotContain("`branch_created`", timeline);
    }

    [Fact]
    public async Task ApproveCurrentPhaseAsync_Throws_WhenBaseBranchIsBehindUpstream()
    {
        await InitializeGitWorkspaceAsync(workspaceRoot);
        await RunGitAsync(workspaceRoot, "checkout", "-b", "main");
        await File.WriteAllTextAsync(Path.Combine(workspaceRoot, "README.md"), "seed");
        await RunGitAsync(workspaceRoot, "add", "README.md");
        await RunGitAsync(workspaceRoot, "commit", "-m", "seed");

        var remoteDirectory = Path.Combine(Path.GetTempPath(), Guid.NewGuid().ToString("N"));
        var peerDirectory = Path.Combine(Path.GetTempPath(), Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(remoteDirectory);
        Directory.CreateDirectory(peerDirectory);
        try
        {
            await RunGitAsync(remoteDirectory, "init", "--bare");
            await RunGitAsync(workspaceRoot, "remote", "add", "origin", remoteDirectory);
            await RunGitAsync(workspaceRoot, "push", "-u", "origin", "main");

            await RunGitAsync(peerDirectory, "clone", remoteDirectory, ".");
            await RunGitAsync(peerDirectory, "checkout", "main");
            await File.WriteAllTextAsync(Path.Combine(peerDirectory, "CHANGELOG.md"), "remote");
            await RunGitAsync(peerDirectory, "add", "CHANGELOG.md");
            await RunGitAsync(peerDirectory, "commit", "-m", "remote update");
            await RunGitAsync(peerDirectory, "push", "origin", "main");
            await RunGitAsync(workspaceRoot, "fetch", "origin");

            var runner = new WorkflowRunner();
            await runner.CreateUserStoryAsync(workspaceRoot, "US-0001", "Behind upstream", "feature", "workflow", "Initial source text");
            await runner.ContinuePhaseAsync(workspaceRoot, "US-0001");
            await ResolvePendingApprovalQuestionsAsync(runner, "US-0001");

            var error = await Assert.ThrowsAsync<WorkflowDomainException>(() =>
                runner.ApproveCurrentPhaseAsync(workspaceRoot, "US-0001", "main"));

            Assert.Contains("not up to date with upstream", error.Message);
        }
        finally
        {
            if (Directory.Exists(remoteDirectory))
            {
                Directory.Delete(remoteDirectory, recursive: true);
            }

            if (Directory.Exists(peerDirectory))
            {
                Directory.Delete(peerDirectory, recursive: true);
            }
        }
    }

    private static async Task InitializeGitWorkspaceAsync(string workingDirectory)
    {
        Directory.CreateDirectory(workingDirectory);
        await RunGitAsync(workingDirectory, "init");
        await RunGitAsync(workingDirectory, "config", "user.email", "specforge-tests@example.com");
        await RunGitAsync(workingDirectory, "config", "user.name", "SpecForge Tests");
    }

    private static async Task<string> RunGitAsync(string workingDirectory, params string[] arguments)
    {
        var startInfo = new ProcessStartInfo
        {
            FileName = "git",
            WorkingDirectory = workingDirectory,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false
        };

        foreach (var argument in arguments)
        {
            startInfo.ArgumentList.Add(argument);
        }

        using var process = new Process { StartInfo = startInfo };
        process.Start();
        var stdoutTask = process.StandardOutput.ReadToEndAsync();
        var stderrTask = process.StandardError.ReadToEndAsync();
        await process.WaitForExitAsync();
        var stdout = await stdoutTask;
        var stderr = await stderrTask;

        if (process.ExitCode != 0)
        {
            throw new InvalidOperationException(
                $"git {string.Join(' ', arguments)} failed with exit code {process.ExitCode}. stderr: {stderr.Trim()} stdout: {stdout.Trim()}");
        }

        return stdout;
    }

    private async Task ResolvePendingApprovalQuestionsAsync(WorkflowRunner runner, string usId)
    {
        var paths = UserStoryFilePaths.ResolveFromWorkspaceRoot(workspaceRoot, usId);
        var artifactPath = paths.GetLatestExistingPhaseArtifactPath(PhaseId.Refinement)
            ?? throw new InvalidOperationException("Expected a refinement artifact before resolving approval questions.");
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

    private sealed class UsageCapturingPhaseExecutionProvider : IPhaseExecutionProvider
    {
        public PhaseExecutionReadiness GetPhaseExecutionReadiness(PhaseId phaseId) =>
            new(phaseId, CanExecute: true);

        public Task<AutoClarificationAnswersResult?> TryAutoAnswerClarificationAsync(
            PhaseExecutionContext context,
            ClarificationSession session,
            CancellationToken cancellationToken = default) =>
            Task.FromResult<AutoClarificationAnswersResult?>(null);

        public Task<PhaseExecutionResult> ExecuteAsync(
            PhaseExecutionContext context,
            CancellationToken cancellationToken = default) =>
            Task.FromResult(
                new PhaseExecutionResult(
                    "# generated markdown\n\n## Tokens\n- captured",
                    "test-double",
                    new TokenUsage(321, 123, 444),
                    new PhaseExecutionMetadata("test-double", "stub-model", "test-profile", "http://stub.test/v1")));
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

        public Task<AutoClarificationAnswersResult?> TryAutoAnswerClarificationAsync(
            PhaseExecutionContext context,
            ClarificationSession session,
            CancellationToken cancellationToken = default) =>
            inner.TryAutoAnswerClarificationAsync(context, session, cancellationToken);

        public Task<PhaseExecutionResult> ExecuteAsync(
            PhaseExecutionContext context,
            CancellationToken cancellationToken = default) =>
            inner.ExecuteAsync(context, cancellationToken);
    }

    private sealed class BlockingPhaseExecutionProvider : IPhaseExecutionProvider
    {
        private readonly PhaseId blockedPhase;
        private readonly TaskCompletionSource<bool> started = new(TaskCreationOptions.RunContinuationsAsynchronously);
        private readonly DeterministicPhaseExecutionProvider inner = new();

        public BlockingPhaseExecutionProvider(PhaseId blockedPhase)
        {
            this.blockedPhase = blockedPhase;
        }

        public PhaseExecutionReadiness GetPhaseExecutionReadiness(PhaseId phaseId) =>
            inner.GetPhaseExecutionReadiness(phaseId);

        public async Task<PhaseExecutionResult> ExecuteAsync(
            PhaseExecutionContext context,
            CancellationToken cancellationToken = default)
        {
            if (context.PhaseId == blockedPhase)
            {
                started.TrySetResult(true);
                await Task.Delay(Timeout.InfiniteTimeSpan, cancellationToken);
            }

            return await inner.ExecuteAsync(context, cancellationToken);
        }

        public Task<AutoClarificationAnswersResult?> TryAutoAnswerClarificationAsync(
            PhaseExecutionContext context,
            ClarificationSession session,
            CancellationToken cancellationToken = default) =>
            inner.TryAutoAnswerClarificationAsync(context, session, cancellationToken);

        public Task WaitUntilStartedAsync() => started.Task;
    }

    private sealed class AutoAnsweringPhaseExecutionProvider : IPhaseExecutionProvider
    {
        private readonly DeterministicPhaseExecutionProvider inner = new();

        public PhaseExecutionReadiness GetPhaseExecutionReadiness(PhaseId phaseId) =>
            inner.GetPhaseExecutionReadiness(phaseId);

        public Task<AutoClarificationAnswersResult?> TryAutoAnswerClarificationAsync(
            PhaseExecutionContext context,
            ClarificationSession session,
            CancellationToken cancellationToken = default) =>
            Task.FromResult<AutoClarificationAnswersResult?>(
                new AutoClarificationAnswersResult(
                    true,
                    session.Items
                        .OrderBy(static item => item.Index)
                        .Select(item => $"Auto answer for: {item.Question}")
                        .Cast<string?>()
                        .ToArray(),
                    "The model answered the clarification questions from the available context.",
                    Execution: new PhaseExecutionMetadata("test-double", "auto-answer-model", "auto-answer-profile", "http://stub.test/v1")));

        public Task<PhaseExecutionResult> ExecuteAsync(
            PhaseExecutionContext context,
            CancellationToken cancellationToken = default) =>
            inner.ExecuteAsync(context, cancellationToken);
    }

    private sealed class EvidenceCapturingPhaseExecutionProvider : IPhaseExecutionProvider
    {
        private readonly DeterministicPhaseExecutionProvider inner = new();

        public PhaseExecutionContext? ReviewContext { get; private set; }

        public PhaseExecutionReadiness GetPhaseExecutionReadiness(PhaseId phaseId) =>
            inner.GetPhaseExecutionReadiness(phaseId);

        public Task<AutoClarificationAnswersResult?> TryAutoAnswerClarificationAsync(
            PhaseExecutionContext context,
            ClarificationSession session,
            CancellationToken cancellationToken = default) =>
            inner.TryAutoAnswerClarificationAsync(context, session, cancellationToken);

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
                ReviewContext = context;
            }

            return await inner.ExecuteAsync(context, cancellationToken);
        }
    }

    private sealed class NoRepositoryDeltaPhaseExecutionProvider : IPhaseExecutionProvider
    {
        private readonly DeterministicPhaseExecutionProvider inner = new();

        public PhaseExecutionReadiness GetPhaseExecutionReadiness(PhaseId phaseId) =>
            inner.GetPhaseExecutionReadiness(phaseId);

        public Task<AutoClarificationAnswersResult?> TryAutoAnswerClarificationAsync(
            PhaseExecutionContext context,
            ClarificationSession session,
            CancellationToken cancellationToken = default) =>
            inner.TryAutoAnswerClarificationAsync(context, session, cancellationToken);

        public Task<PhaseExecutionResult> ExecuteAsync(
            PhaseExecutionContext context,
            CancellationToken cancellationToken = default) =>
            inner.ExecuteAsync(context, cancellationToken);
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
}
