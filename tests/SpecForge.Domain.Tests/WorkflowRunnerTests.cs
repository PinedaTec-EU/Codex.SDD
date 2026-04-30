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
        var runner = new WorkflowRunner(new DeterministicPhaseExecutionProvider(), "0.1.3.224", "balanced");

        var rootDirectory = await runner.CreateUserStoryAsync(workspaceRoot, "US-0001", "Test story", "feature", "workflow", "Initial source text");

        Assert.Equal(Path.Combine(workspaceRoot, ".specs", "us", "workflow", "US-0001"), rootDirectory);
        Assert.True(File.Exists(Path.Combine(rootDirectory, "us.md")));
        Assert.True(File.Exists(Path.Combine(rootDirectory, "state.yaml")));
        Assert.True(File.Exists(Path.Combine(rootDirectory, "timeline.md")));
        var timeline = await File.ReadAllTextAsync(Path.Combine(rootDirectory, "timeline.md"));
        Assert.Contains("runtime-version: `0.1.3.224`", timeline);
    }

    [Fact]
    public async Task ContinuePhaseAsync_FromCapture_GeneratesSpecArtifact()
    {
        var runner = new WorkflowRunner();
        await runner.CreateUserStoryAsync(workspaceRoot, "US-0001", "Test story", "feature", "workflow", "Initial source text");

        var result = await runner.ContinuePhaseAsync(workspaceRoot, "US-0001");

        Assert.Equal(PhaseId.Spec, result.CurrentPhase);
        Assert.Equal(UserStoryStatus.WaitingUser, result.Status);
        Assert.NotNull(result.GeneratedArtifactPath);
        Assert.True(File.Exists(result.GeneratedArtifactPath!));
        Assert.True(File.Exists(Path.ChangeExtension(result.GeneratedArtifactPath!, ".json")));
        var specContent = await File.ReadAllTextAsync(result.GeneratedArtifactPath!);
        Assert.Contains("# Spec · US-0001 · v01", specContent);
        Assert.Contains("Initial source text", specContent);
        Assert.Contains("## Inputs", specContent);
        Assert.Contains("## Acceptance Criteria", specContent);
        Assert.Contains("## Red Team", specContent);
        Assert.Contains("## Blue Team", specContent);
    }

    [Fact]
    public async Task ContinuePhaseAsync_FromCapture_WithInsufficientSource_RequestsRefinement()
    {
        var runner = new WorkflowRunner();
        await runner.CreateUserStoryAsync(workspaceRoot, "US-0001", "Test story", "feature", "workflow", "sample US");

        var result = await runner.ContinuePhaseAsync(workspaceRoot, "US-0001");

        Assert.Equal(PhaseId.Refinement, result.CurrentPhase);
        Assert.Equal(UserStoryStatus.WaitingUser, result.Status);
        Assert.NotNull(result.GeneratedArtifactPath);
        var loadedRun = await new UserStoryFileStore().LoadAsync(
            UserStoryFilePaths.ResolveFromWorkspaceRoot(workspaceRoot, "US-0001").RootDirectory);
        Assert.Equal(PhaseId.Refinement, loadedRun.CurrentPhase);

        var paths = UserStoryFilePaths.ResolveFromWorkspaceRoot(workspaceRoot, "US-0001");
        var userStoryPath = paths.MainArtifactPath;
        var userStory = await File.ReadAllTextAsync(userStoryPath);
        Assert.DoesNotContain("## Refinement Log", userStory);
        Assert.True(File.Exists(paths.RefinementFilePath));
        var refinement = await File.ReadAllTextAsync(paths.RefinementFilePath);
        Assert.Contains("## Refinement Log", refinement);
        Assert.Contains("### Questions", refinement);
        Assert.Contains("### Answers", refinement);

        var timelinePath = UserStoryFilePaths.ResolveFromWorkspaceRoot(workspaceRoot, "US-0001").TimelineFilePath;
        var timeline = await File.ReadAllTextAsync(timelinePath);
        Assert.Contains("`refinement_requested`", timeline);
    }

    [Fact]
    public async Task SubmitRefinementAnswersAsync_AllowsRefinementToAdvanceToSpec()
    {
        var runner = new WorkflowRunner();
        await runner.CreateUserStoryAsync(workspaceRoot, "US-0001", "Test story", "feature", "workflow", "sample US");
        await runner.ContinuePhaseAsync(workspaceRoot, "US-0001");

        var answerResult = await runner.SubmitRefinementAnswersAsync(
            workspaceRoot,
            "US-0001",
            [
                "El analista funcional.",
                "It receives form data and must produce a spec specification that can be validated.",
                "A clear objective and verifiable acceptance criteria must remain."
            ]);

        Assert.Equal("refinement", answerResult.CurrentPhase);
        Assert.Equal("active", answerResult.Status);
        Assert.Equal(3, answerResult.AnsweredQuestions);

        var continueResult = await runner.ContinuePhaseAsync(workspaceRoot, "US-0001");

        Assert.Equal(PhaseId.Spec, continueResult.CurrentPhase);
        Assert.Equal(UserStoryStatus.WaitingUser, continueResult.Status);
        Assert.NotNull(continueResult.GeneratedArtifactPath);

        var timelinePath = UserStoryFilePaths.ResolveFromWorkspaceRoot(workspaceRoot, "US-0001").TimelineFilePath;
        var timeline = await File.ReadAllTextAsync(timelinePath);
        Assert.Contains("`refinement_answered`", timeline);
        Assert.Contains("`refinement_passed`", timeline);

        var paths = UserStoryFilePaths.ResolveFromWorkspaceRoot(workspaceRoot, "US-0001");
        var userStory = await File.ReadAllTextAsync(paths.MainArtifactPath);
        Assert.DoesNotContain("## Refinement Log", userStory);
        var refinement = await File.ReadAllTextAsync(paths.RefinementFilePath);
        Assert.Contains("- Status: `ready_for_spec`", refinement);
        Assert.DoesNotContain("El analista funcional.", refinement);
    }

    [Fact]
    public async Task ContinuePhaseAsync_WithAutoRefinementAnswers_ContinuesToSpecWithoutUserInput()
    {
        var runner = new WorkflowRunner(new AutoAnsweringPhaseExecutionProvider());
        await runner.CreateUserStoryAsync(workspaceRoot, "US-0001", "Test story", "feature", "workflow", "sample US");

        var result = await runner.ContinuePhaseAsync(workspaceRoot, "US-0001");

        Assert.Equal(PhaseId.Spec, result.CurrentPhase);
        Assert.Equal(UserStoryStatus.WaitingUser, result.Status);
        Assert.NotNull(result.GeneratedArtifactPath);

        var timeline = await File.ReadAllTextAsync(UserStoryFilePaths.ResolveFromWorkspaceRoot(workspaceRoot, "US-0001").TimelineFilePath);
        Assert.Contains("`refinement_auto_answered`", timeline);
        Assert.Contains("after automatic refinement answers", timeline);

        var refinement = await File.ReadAllTextAsync(UserStoryFilePaths.ResolveFromWorkspaceRoot(workspaceRoot, "US-0001").RefinementFilePath);
        Assert.Contains("- Status: `ready_for_spec`", refinement);
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
            actor: "bob");

        Assert.Equal("US-0001", result.UsId);
        Assert.Equal("spec", result.CurrentPhase);
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
        Assert.Contains(Path.GetFileName(result.OperationLogPath), timeline);
        Assert.Contains(Path.GetFileName(result.GeneratedArtifactPath), timeline);
    }

    [Fact]
    public async Task ContinuePhaseAsync_FromRefinement_ReplacesPreviousQuestionsWithNewOnes()
    {
        var runner = new WorkflowRunner();
        var paths = UserStoryFilePaths.FromWorkspaceRoot(workspaceRoot, "workflow", "US-0001");
        await runner.CreateUserStoryAsync(workspaceRoot, "US-0001", "Test story", "feature", "workflow", "sample US");
        await runner.ContinuePhaseAsync(workspaceRoot, "US-0001");
        await File.WriteAllTextAsync(
            paths.RefinementFilePath,
            UserStoryRefinementMarkdown.Serialize(
                new RefinementSession(
                    "needs_refinement",
                    "balanced",
                    "Need more detail.",
                    [
                        new RefinementItem(1, "Question A", "Answer A"),
                        new RefinementItem(2, "Question B", null)
                    ])));

        await runner.SubmitRefinementAnswersAsync(
            workspaceRoot,
            "US-0001",
            ["Answer A updated", "Answer B updated"]);

        var generatedRefinementPath = paths.GetPhaseArtifactPath(PhaseId.Refinement);
        await File.WriteAllTextAsync(
            generatedRefinementPath,
            """
            # Refinement · US-0001 · v02

            ## State
            - State: `pending_user_input`

            ## Decision
            needs_refinement

            ## Reason
            Still missing one more detail.

            ## Questions
            1. Question C
            """
        );

        var parseMethod = typeof(WorkflowRunner).GetMethod("ParseRefinementArtifact", System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Static)!;
        var updateMethod = typeof(WorkflowRunner).GetMethod("UpdateRefinementLogAsync", System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Static)!;
        var assessment = parseMethod.Invoke(null, [await File.ReadAllTextAsync(generatedRefinementPath)])!;
        await (Task)updateMethod.Invoke(null, [paths, assessment, "balanced", CancellationToken.None])!;

        var updatedRefinement = await File.ReadAllTextAsync(paths.RefinementFilePath);
        Assert.DoesNotContain("Question A", updatedRefinement);
        Assert.DoesNotContain("Question B", updatedRefinement);
        Assert.Contains("1. Question C", updatedRefinement);
        Assert.Contains("1. ...", updatedRefinement);
    }

    [Fact]
    public void ParseRefinementArtifact_DeduplicatesSemanticallyEquivalentQuestions()
    {
        const string refinementMarkdown =
            """
            # Refinement · US-0001 · v01

            ## State
            - State: `pending_user_input`

            ## Decision
            needs_refinement

            ## Reason
            More detail is required.

            ## Questions
            1. What visible label should the field use in the Recent events UI: Source, TrackId, or Source / TrackId?
            2. Should the user see the field in Recent events as Source, TrackId, or Source / TrackId?
            3. Should the source filter require exact match or allow case-insensitive partial search?
            4. Must the source filter be exact, or can it use case-insensitive partial matching?
            """;

        var parseMethod = typeof(WorkflowRunner).GetMethod("ParseRefinementArtifact", System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Static)!;
        var assessment = parseMethod.Invoke(null, [refinementMarkdown])!;
        var questions = (IReadOnlyCollection<string>)assessment.GetType().GetProperty("Questions")!.GetValue(assessment)!;

        Assert.Equal(2, questions.Count);
        Assert.Contains("What visible label should the field use in the Recent events UI: Source, TrackId, or Source / TrackId?", questions);
        Assert.Contains("Should the source filter require exact match or allow case-insensitive partial search?", questions);
    }

    [Fact]
    public async Task ContinuePhaseAsync_FromCapture_WithShortButConcreteSource_AllowsSpec()
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

        Assert.Equal(PhaseId.Spec, result.CurrentPhase);
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
            paths.GetPhaseArtifactPath(PhaseId.Spec),
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
    public async Task RewindWorkflowAsync_FromReviewWithSingleImplementationReviewIteration_AllowsTechnicalDesign()
    {
        var runner = new WorkflowRunner(
            new UserStoryFileStore(),
            new PassingReviewPhaseExecutionProvider(),
            new RepositoryCategoryCatalog(),
            new NoOpWorkBranchManager());
        await runner.CreateUserStoryAsync(workspaceRoot, "US-0001", "Test story", "feature", "workflow", "Initial source text");
        await runner.ContinuePhaseAsync(workspaceRoot, "US-0001");
        await ResolvePendingApprovalQuestionsAsync(runner, "US-0001");
        await runner.ApproveCurrentPhaseAsync(workspaceRoot, "US-0001", "main");
        await runner.ContinuePhaseAsync(workspaceRoot, "US-0001");
        await runner.ContinuePhaseAsync(workspaceRoot, "US-0001");
        await runner.ContinuePhaseAsync(workspaceRoot, "US-0001");

        var result = await runner.RewindWorkflowAsync(workspaceRoot, "US-0001", PhaseId.TechnicalDesign);

        Assert.Equal("technical-design", result.CurrentPhase);
        Assert.Equal("active", result.Status);
    }

    [Fact]
    public async Task RewindWorkflowAsync_AfterMultipleImplementationReviewIterations_ThrowsWithGuardrailMessage()
    {
        var runner = new WorkflowRunner(
            new UserStoryFileStore(),
            new PassingReviewPhaseExecutionProvider(),
            new RepositoryCategoryCatalog(),
            new NoOpWorkBranchManager());
        await runner.CreateUserStoryAsync(workspaceRoot, "US-0001", "Test story", "feature", "workflow", "Initial source text");
        await runner.ContinuePhaseAsync(workspaceRoot, "US-0001");
        await ResolvePendingApprovalQuestionsAsync(runner, "US-0001");
        await runner.ApproveCurrentPhaseAsync(workspaceRoot, "US-0001", "main");
        await runner.ContinuePhaseAsync(workspaceRoot, "US-0001");
        await runner.ContinuePhaseAsync(workspaceRoot, "US-0001");
        await runner.ContinuePhaseAsync(workspaceRoot, "US-0001");

        var paths = UserStoryFilePaths.ResolveFromWorkspaceRoot(workspaceRoot, "US-0001");
        await File.AppendAllTextAsync(
            paths.TimelineFilePath,
            """

            ### 2026-04-27T09:10:00.0000000Z · `phase_completed`
            - Actor: `system`
            - Phase: `implementation`
            - Summary: Second implementation pass.
            - Artifacts:
              - `.specs/us/workflow/US-0001/phases/03-implementation.v02.md`

            ### 2026-04-27T09:20:00.0000000Z · `phase_completed`
            - Actor: `system`
            - Phase: `review`
            - Summary: Second review pass.
            - Artifacts:
              - `.specs/us/workflow/US-0001/phases/04-review.v02.md`
            """);

        var error = await Assert.ThrowsAsync<WorkflowDomainException>(() =>
            runner.RewindWorkflowAsync(workspaceRoot, "US-0001", PhaseId.TechnicalDesign));

        Assert.Contains("multiple implementation/review iterations", error.Message);
    }

    [Fact]
    public async Task RewindWorkflowAsync_FromCompletedWorkflowReopenLandingPhase_ThrowsWithGuardrailMessage()
    {
        var runner = new WorkflowRunner(
            new UserStoryFileStore(),
            new PassingReviewPhaseExecutionProvider(),
            new RepositoryCategoryCatalog(),
            new NoOpWorkBranchManager(),
            new RecordingPullRequestPublisher());
        await runner.CreateUserStoryAsync(workspaceRoot, "US-0001", "Test story", "feature", "workflow", "Initial source text");
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
        await runner.ReopenCompletedWorkflowAsync(
            workspaceRoot,
            "US-0001",
            PhaseId.TechnicalDesign,
            "technical-issue",
            "APR found a technical design issue.");

        var error = await Assert.ThrowsAsync<WorkflowDomainException>(() =>
            runner.RewindWorkflowAsync(workspaceRoot, "US-0001", PhaseId.Spec));

        Assert.Contains("recovery phase", error.Message);
    }

    [Fact]
    public async Task ContinuePhaseAsync_AfterCompletedWorkflowTechnicalReopen_RegeneratesTechnicalDesignBeforeImplementation()
    {
        var provider = new CompletedReopenCapturingPhaseExecutionProvider();
        var runner = new WorkflowRunner(
            new UserStoryFileStore(),
            provider,
            new RepositoryCategoryCatalog(),
            new NoOpWorkBranchManager(),
            new RecordingPullRequestPublisher());
        await runner.CreateUserStoryAsync(workspaceRoot, "US-0001", "Test story", "feature", "workflow", "Initial source text");
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
        await runner.ReopenCompletedWorkflowAsync(
            workspaceRoot,
            "US-0001",
            PhaseId.TechnicalDesign,
            "technical-issue",
            "CultureInfo.InvariantCulture is missing from decimal serialization tests.");

        var paths = UserStoryFilePaths.ResolveFromWorkspaceRoot(workspaceRoot, "US-0001");
        var firstResult = await runner.ContinuePhaseAsync(workspaceRoot, "US-0001");

        Assert.Equal(PhaseId.TechnicalDesign, firstResult.CurrentPhase);
        Assert.NotNull(provider.LastTechnicalDesignOperationContext);
        Assert.Equal(paths.GetPhaseArtifactPath(PhaseId.TechnicalDesign), provider.LastTechnicalDesignOperationContext!.CurrentArtifactPath);
        Assert.Contains("current technical design artifact", provider.LastTechnicalDesignOperationContext.OperationPrompt);
        Assert.Contains("CultureInfo.InvariantCulture", provider.LastTechnicalDesignOperationContext.OperationPrompt);
        Assert.Equal(paths.GetPhaseArtifactPath(PhaseId.TechnicalDesign, 2), firstResult.GeneratedArtifactPath);

        var secondResult = await runner.ContinuePhaseAsync(workspaceRoot, "US-0001");

        Assert.Equal(PhaseId.Implementation, secondResult.CurrentPhase);
        Assert.NotNull(provider.LastImplementationContext);
        Assert.True(provider.LastImplementationContext!.PreviousArtifactPaths.TryGetValue(PhaseId.TechnicalDesign, out var technicalDesignPath));
        Assert.Equal(paths.GetPhaseArtifactPath(PhaseId.TechnicalDesign, 2), technicalDesignPath);

        var timeline = await File.ReadAllTextAsync(paths.TimelineFilePath);
        Assert.Contains("`workflow_reopened`", timeline);
        Assert.Contains("`artifact_operated`", timeline);
    }

    [Fact]
    public async Task AnalyzeUserStoryLineageAsync_DetectsCompletedReopenSkippedLandingPhase()
    {
        var runner = new WorkflowRunner();
        await runner.CreateUserStoryAsync(workspaceRoot, "US-0001", "Test story", "feature", "workflow", "Initial source text");
        var paths = UserStoryFilePaths.ResolveFromWorkspaceRoot(workspaceRoot, "US-0001");
        Directory.CreateDirectory(paths.PhasesDirectoryPath);
        await File.WriteAllTextAsync(paths.GetPhaseArtifactPath(PhaseId.TechnicalDesign), "# TD v1");
        await File.WriteAllTextAsync(paths.GetPhaseArtifactPath(PhaseId.Implementation, 2), "# Impl v2");
        await File.WriteAllTextAsync(paths.GetPhaseArtifactPath(PhaseId.Review, 2), "# Review v2");
        await File.WriteAllTextAsync(paths.TimelineFilePath, $$"""
# Timeline · US-0001 · Test story

## Events

### 2026-04-29T16:07:06.5897180+00:00 · `workflow_reopened`

- Actor: `user`
- Phase: `technical-design`
- Summary: Reopened completed workflow due to `technical-issue`.

### 2026-04-29T16:56:11.6215830+00:00 · `phase_completed`

- Actor: `user`
- Phase: `implementation`
- Summary: Generated artifact for phase `implementation`.
- Artifacts:
  - `{{paths.GetPhaseArtifactPath(PhaseId.Implementation, 2)}}`

### 2026-04-29T16:56:46.3000860+00:00 · `phase_completed`

- Actor: `user`
- Phase: `review`
- Summary: Generated artifact for phase `review`.
- Artifacts:
  - `{{paths.GetPhaseArtifactPath(PhaseId.Review, 2)}}`
""");
        var applicationService = new SpecForgeApplicationService(
            new UserStoryFileStore(),
            runner,
            runtimeVersion: "test");

        var analysis = await applicationService.AnalyzeUserStoryLineageAsync(workspaceRoot, "US-0001");

        Assert.Equal("inconsistent", analysis.Status);
        var finding = Assert.Single(analysis.Findings, item => item.Code == "completed_reopen_skipped_landing_phase");
        Assert.Equal("certain", finding.Confidence);
        Assert.Equal("technical-design", analysis.RecommendedTargetPhase);
        Assert.Contains(paths.GetPhaseArtifactPath(PhaseId.Implementation, 2), analysis.DeprecatedCandidatePaths);
        Assert.Contains(paths.GetPhaseArtifactPath(PhaseId.Review, 2), analysis.DeprecatedCandidatePaths);
    }

    [Fact]
    public async Task RepairUserStoryLineageAsync_ArchivesDeprecatedArtifactsAndReturnsToLandingPhase()
    {
        var runner = new WorkflowRunner();
        await runner.CreateUserStoryAsync(workspaceRoot, "US-0001", "Test story", "feature", "workflow", "Initial source text");
        var paths = UserStoryFilePaths.ResolveFromWorkspaceRoot(workspaceRoot, "US-0001");
        Directory.CreateDirectory(paths.PhasesDirectoryPath);
        var implementationPath = paths.GetPhaseArtifactPath(PhaseId.Implementation, 2);
        var implementationJsonPath = paths.GetPhaseArtifactJsonPath(PhaseId.Implementation, 2);
        var reviewPath = paths.GetPhaseArtifactPath(PhaseId.Review, 2);
        await File.WriteAllTextAsync(paths.GetPhaseArtifactPath(PhaseId.TechnicalDesign), "# TD v1");
        await File.WriteAllTextAsync(implementationPath, "# Impl v2");
        await File.WriteAllTextAsync(implementationJsonPath, "{}");
        await File.WriteAllTextAsync(reviewPath, "# Review v2");
        await File.WriteAllTextAsync(paths.TimelineFilePath, $$"""
# Timeline · US-0001 · Test story

## Events

### 2026-04-29T16:07:06.5897180+00:00 · `workflow_reopened`

- Actor: `user`
- Phase: `technical-design`
- Summary: Reopened completed workflow due to `technical-issue`.

### 2026-04-29T16:56:11.6215830+00:00 · `phase_completed`

- Actor: `user`
- Phase: `implementation`
- Summary: Generated artifact for phase `implementation`.
- Artifacts:
  - `{{implementationPath}}`

### 2026-04-29T16:56:46.3000860+00:00 · `phase_completed`

- Actor: `user`
- Phase: `review`
- Summary: Generated artifact for phase `review`.
- Artifacts:
  - `{{reviewPath}}`
""");
        var applicationService = new SpecForgeApplicationService(
            new UserStoryFileStore(),
            runner,
            runtimeVersion: "test");

        var repair = await applicationService.RepairUserStoryLineageAsync(workspaceRoot, "US-0001", "test");

        Assert.Equal("technical-design", repair.CurrentPhase);
        Assert.NotEmpty(repair.ArchiveDirectoryPath);
        Assert.False(File.Exists(implementationPath));
        Assert.False(File.Exists(implementationJsonPath));
        Assert.False(File.Exists(reviewPath));
        Assert.Contains(repair.ArchivedPaths, path => path.EndsWith("03-implementation.v02.md", StringComparison.Ordinal));
        Assert.Contains(repair.ArchivedPaths, path => path.EndsWith("03-implementation.v02.json", StringComparison.Ordinal));
        Assert.Contains(repair.ArchivedPaths, path => path.EndsWith("04-review.v02.md", StringComparison.Ordinal));
        Assert.All(repair.ArchivedPaths, path => Assert.True(File.Exists(path)));
        Assert.DoesNotContain(repair.Analysis.Findings, finding => finding.Code == "completed_reopen_skipped_landing_phase");
        var workflowRun = await new UserStoryFileStore().LoadAsync(paths.RootDirectory);
        Assert.Equal(PhaseId.TechnicalDesign, workflowRun.CurrentPhase);
        var timeline = await File.ReadAllTextAsync(paths.TimelineFilePath);
        Assert.Contains("`workflow_repaired`", timeline);
    }

    [Fact]
    public async Task RepairUserStoryLineageAsync_ClosesPublishedPullRequestWhenReturningBeforePrPreparation()
    {
        var invalidator = new RecordingPullRequestInvalidator();
        var runner = new WorkflowRunner(
            new UserStoryFileStore(),
            new PassingReviewPhaseExecutionProvider(),
            new RepositoryCategoryCatalog(),
            new NoOpWorkBranchManager(),
            new RecordingPullRequestPublisher(),
            invalidator);
        await runner.CreateUserStoryAsync(workspaceRoot, "US-0001", "Test story", "feature", "workflow", "Initial source text");
        var paths = UserStoryFilePaths.ResolveFromWorkspaceRoot(workspaceRoot, "US-0001");
        Directory.CreateDirectory(paths.PhasesDirectoryPath);
        var implementationPath = paths.GetPhaseArtifactPath(PhaseId.Implementation, 2);
        var reviewPath = paths.GetPhaseArtifactPath(PhaseId.Review, 2);
        await File.WriteAllTextAsync(paths.GetPhaseArtifactPath(PhaseId.TechnicalDesign), "# TD v1");
        await File.WriteAllTextAsync(implementationPath, "# Impl v2");
        await File.WriteAllTextAsync(reviewPath, "# Review v2");
        await File.WriteAllTextAsync(paths.TimelineFilePath, $$"""
# Timeline · US-0001 · Test story

## Events

### 2026-04-29T16:07:06.5897180+00:00 · `workflow_reopened`

- Actor: `user`
- Phase: `technical-design`
- Summary: Reopened completed workflow due to `technical-issue`.

### 2026-04-29T16:56:11.6215830+00:00 · `phase_completed`

- Actor: `user`
- Phase: `implementation`
- Summary: Generated artifact for phase `implementation`.
- Artifacts:
  - `{{implementationPath}}`

### 2026-04-29T16:56:46.3000860+00:00 · `phase_completed`

- Actor: `user`
- Phase: `review`
- Summary: Generated artifact for phase `review`.
- Artifacts:
  - `{{reviewPath}}`
""");
        var storedRun = await new UserStoryFileStore().LoadAsync(paths.RootDirectory);
        var branch = new WorkBranch(
            "main",
            "feature/us-0001-test-story",
            "feature",
            "workflow",
            "Test story",
            paths.MainArtifactPath,
            new DateTimeOffset(2026, 4, 27, 10, 0, 0, TimeSpan.Zero));
        branch.RecordPublishedPullRequest(
            new PullRequestRecord(
                "draft",
                "main",
                "US-0001: deliver approved workflow scope",
                paths.GetPhaseArtifactPath(PhaseId.PrPreparation),
                true,
                101,
                "https://github.com/example/repo/pull/101",
                branch.WorkBranchName,
                "abc123",
                new DateTimeOffset(2026, 4, 27, 10, 0, 0, TimeSpan.Zero)));
        storedRun.RestoreBranch(branch);
        storedRun.RestoreState(PhaseId.Review, UserStoryStatus.Active);
        await new UserStoryFileStore().SaveAsync(storedRun, paths.RootDirectory);
        var applicationService = new SpecForgeApplicationService(
            new UserStoryFileStore(),
            runner,
            runtimeVersion: "test");

        await applicationService.RepairUserStoryLineageAsync(workspaceRoot, "US-0001", "test");

        Assert.Equal(101, invalidator.LastPullRequest?.Number);
        var reloadedRun = await new UserStoryFileStore().LoadAsync(paths.RootDirectory);
        Assert.Equal("superseded", reloadedRun.Branch?.PullRequest?.Status);
        Assert.Equal("https://github.com/example/repo/pull/101", reloadedRun.Branch?.PullRequest?.Url);
        var workflow = await applicationService.GetUserStoryWorkflowAsync(workspaceRoot, "US-0001");
        Assert.Null(workflow.PullRequest);
        var timeline = await File.ReadAllTextAsync(paths.TimelineFilePath);
        Assert.Contains("`pull_request_closed`", timeline);
        Assert.Contains("`workflow_repaired`", timeline);
    }

    [Fact]
    public async Task ContinuePhaseAsync_FromPrPreparation_PublishesDraftPullRequestAndCompletesWorkflow()
    {
        var publisher = new RecordingPullRequestPublisher();
        var runner = new WorkflowRunner(
            new UserStoryFileStore(),
            new PassingReviewPhaseExecutionProvider(),
            new RepositoryCategoryCatalog(),
            new NoOpWorkBranchManager(),
            publisher);
        await runner.CreateUserStoryAsync(workspaceRoot, "US-0001", "Test story", "feature", "workflow", "Initial source text");
        await runner.ContinuePhaseAsync(workspaceRoot, "US-0001");
        await ResolvePendingApprovalQuestionsAsync(runner, "US-0001");
        await runner.ApproveCurrentPhaseAsync(workspaceRoot, "US-0001", "main");
        await runner.ContinuePhaseAsync(workspaceRoot, "US-0001");
        await runner.ContinuePhaseAsync(workspaceRoot, "US-0001");
        await runner.ContinuePhaseAsync(workspaceRoot, "US-0001");
        await runner.ContinuePhaseAsync(workspaceRoot, "US-0001");
        await runner.ApproveCurrentPhaseAsync(workspaceRoot, "US-0001");
        await runner.ContinuePhaseAsync(workspaceRoot, "US-0001");

        var result = await runner.ContinuePhaseAsync(workspaceRoot, "US-0001");

        Assert.Equal(PhaseId.PrPreparation, result.CurrentPhase);
        Assert.Equal(UserStoryStatus.Completed, result.Status);
        Assert.Equal("US-0001: deliver approved workflow scope", publisher.LastArtifact?.PrTitle);

        var loadedRun = await new UserStoryFileStore().LoadAsync(
            UserStoryFilePaths.ResolveFromWorkspaceRoot(workspaceRoot, "US-0001").RootDirectory);
        Assert.Equal(UserStoryStatus.Completed, loadedRun.Status);
        Assert.NotNull(loadedRun.Branch?.PullRequest);
        Assert.Equal("draft", loadedRun.Branch!.PullRequest!.Status);
        Assert.Equal("https://github.com/example/repo/pull/101", loadedRun.Branch.PullRequest.Url);

        var timeline = await File.ReadAllTextAsync(UserStoryFilePaths.ResolveFromWorkspaceRoot(workspaceRoot, "US-0001").TimelineFilePath);
        Assert.Contains("`pull_request_published`", timeline);
        Assert.Contains("https://github.com/example/repo/pull/101", timeline);
    }

    [Fact]
    public async Task ContinuePhaseAsync_FromPrPreparation_DoesNotCompleteWorkflowWhenPublicationLacksUrlOrNumber()
    {
        var publisher = new IncompletePullRequestPublisher();
        var runner = new WorkflowRunner(
            new UserStoryFileStore(),
            new PassingReviewPhaseExecutionProvider(),
            new RepositoryCategoryCatalog(),
            new NoOpWorkBranchManager(),
            publisher);
        await runner.CreateUserStoryAsync(workspaceRoot, "US-0001", "Test story", "feature", "workflow", "Initial source text");
        await runner.ContinuePhaseAsync(workspaceRoot, "US-0001");
        await ResolvePendingApprovalQuestionsAsync(runner, "US-0001");
        await runner.ApproveCurrentPhaseAsync(workspaceRoot, "US-0001", "main");
        await runner.ContinuePhaseAsync(workspaceRoot, "US-0001");
        await runner.ContinuePhaseAsync(workspaceRoot, "US-0001");
        await runner.ContinuePhaseAsync(workspaceRoot, "US-0001");
        await runner.ContinuePhaseAsync(workspaceRoot, "US-0001");
        await runner.ApproveCurrentPhaseAsync(workspaceRoot, "US-0001");
        await runner.ContinuePhaseAsync(workspaceRoot, "US-0001");

        var error = await Assert.ThrowsAsync<WorkflowDomainException>(() =>
            runner.ContinuePhaseAsync(workspaceRoot, "US-0001"));

        Assert.Contains("did not return a valid pull request number", error.Message);

        var loadedRun = await new UserStoryFileStore().LoadAsync(
            UserStoryFilePaths.ResolveFromWorkspaceRoot(workspaceRoot, "US-0001").RootDirectory);
        Assert.Equal(UserStoryStatus.Active, loadedRun.Status);
        Assert.Equal(PhaseId.PrPreparation, loadedRun.CurrentPhase);
        Assert.NotNull(loadedRun.Branch?.PullRequest);
        Assert.Equal("prepared", loadedRun.Branch!.PullRequest!.Status);
        Assert.Null(loadedRun.Branch.PullRequest.Number);
        Assert.Null(loadedRun.Branch.PullRequest.Url);

        var timeline = await File.ReadAllTextAsync(UserStoryFilePaths.ResolveFromWorkspaceRoot(workspaceRoot, "US-0001").TimelineFilePath);
        Assert.DoesNotContain("`pull_request_published`", timeline);
    }

    [Fact]
    public async Task ContinuePhaseAsync_FromPrPreparation_ReusesExistingPullRequestAfterReopenWithoutRepublishing()
    {
        var publisher = new RecordingPullRequestPublisher();
        var runner = new WorkflowRunner(
            new UserStoryFileStore(),
            new PassingReviewPhaseExecutionProvider(),
            new RepositoryCategoryCatalog(),
            new NoOpWorkBranchManager(),
            publisher);
        await runner.CreateUserStoryAsync(workspaceRoot, "US-0001", "Test story", "feature", "workflow", "Initial source text");
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

        publisher.Clear();

        var paths = UserStoryFilePaths.ResolveFromWorkspaceRoot(workspaceRoot, "US-0001");
        var loadedRun = await new UserStoryFileStore().LoadAsync(paths.RootDirectory);
        loadedRun.Branch!.RecordPublishedPullRequest(
            new PullRequestRecord(
                Status: "draft",
                TargetBaseBranch: "main",
                Title: "US-0001: deliver approved workflow scope",
                ArtifactPath: paths.GetPhaseArtifactPath(PhaseId.PrPreparation),
                IsDraft: true,
                Number: 101,
                Url: "https://github.com/example/repo/pull/101",
                RemoteBranch: loadedRun.Branch.WorkBranchName,
                HeadCommitSha: "abc123",
                PublishedAtUtc: new DateTimeOffset(2026, 4, 27, 10, 0, 0, TimeSpan.Zero)));
        loadedRun.RestoreState(PhaseId.PrPreparation, UserStoryStatus.Active);
        await new UserStoryFileStore().SaveAsync(loadedRun, paths.RootDirectory);

        var result = await runner.ContinuePhaseAsync(workspaceRoot, "US-0001");

        Assert.Equal(PhaseId.PrPreparation, result.CurrentPhase);
        Assert.Equal(UserStoryStatus.Completed, result.Status);
        Assert.Null(publisher.LastArtifact);

        var reloadedRun = await new UserStoryFileStore().LoadAsync(paths.RootDirectory);
        Assert.Equal(UserStoryStatus.Completed, reloadedRun.Status);
        Assert.NotNull(reloadedRun.Branch?.PullRequest);
        Assert.Equal("draft", reloadedRun.Branch!.PullRequest!.Status);
        Assert.Equal(101, reloadedRun.Branch.PullRequest.Number);
        Assert.Equal("https://github.com/example/repo/pull/101", reloadedRun.Branch.PullRequest.Url);

        var timeline = await File.ReadAllTextAsync(paths.TimelineFilePath);
        Assert.Contains("`pull_request_reused`", timeline);
        Assert.Contains("https://github.com/example/repo/pull/101", timeline);
    }

    [Fact]
    public async Task ContinuePhaseAsync_PrPreparation_ThrowsWhenArtifactIsPlaceholderOnly()
    {
        var runner = new WorkflowRunner(
            new UserStoryFileStore(),
            new PlaceholderPrPreparationPhaseExecutionProvider(),
            new RepositoryCategoryCatalog(),
            new NoOpWorkBranchManager(),
            new RecordingPullRequestPublisher());
        await runner.CreateUserStoryAsync(workspaceRoot, "US-0001", "Test story", "feature", "workflow", "Initial source text");
        await runner.ContinuePhaseAsync(workspaceRoot, "US-0001");
        await ResolvePendingApprovalQuestionsAsync(runner, "US-0001");
        await runner.ApproveCurrentPhaseAsync(workspaceRoot, "US-0001", "main");
        await runner.ContinuePhaseAsync(workspaceRoot, "US-0001");
        await runner.ContinuePhaseAsync(workspaceRoot, "US-0001");
        await runner.ContinuePhaseAsync(workspaceRoot, "US-0001");
        await runner.ContinuePhaseAsync(workspaceRoot, "US-0001");
        await runner.ApproveCurrentPhaseAsync(workspaceRoot, "US-0001");

        var error = await Assert.ThrowsAsync<WorkflowDomainException>(() =>
            runner.ContinuePhaseAsync(workspaceRoot, "US-0001"));

        Assert.Contains("PR preparation artifact is incomplete", error.Message);
        Assert.Contains("prTitle", error.Message);
        Assert.Contains("prBody", error.Message);
    }

    [Fact]
    public async Task RestartUserStoryFromSourceAsync_WhenSourceChanged_ArchivesDerivedStateAndRegeneratesSpec()
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

        Assert.Equal("spec", result.CurrentPhase);
        Assert.Equal("waiting-user", result.Status);
        Assert.NotNull(result.GeneratedArtifactPath);
        Assert.True(File.Exists(result.GeneratedArtifactPath!));

        var specContent = await File.ReadAllTextAsync(result.GeneratedArtifactPath!);
        Assert.Contains("Updated source text", specContent);

        var loadedRun = await new UserStoryFileStore().LoadAsync(paths.RootDirectory);
        Assert.Equal(PhaseId.Spec, loadedRun.CurrentPhase);
        Assert.False(loadedRun.IsPhaseApproved(PhaseId.Spec));
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
        Assert.False(workflowRun.IsPhaseApproved(PhaseId.Spec));
        Assert.False(File.Exists(paths.BranchFilePath));
        Assert.False(File.Exists(paths.RefinementFilePath));
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
- Phase: `spec`
- Summary: Phase `spec` approved.
- Artifacts:
  - .specs/us/workflow/US-0001/branch.yaml
""";

        var events = TimelineMarkdownParser.ParseEvents(timeline);

        var timelineEvent = Assert.Single(events);
        Assert.Equal("2026-04-18T09:10:00Z", timelineEvent.TimestampUtc);
        Assert.Equal("phase_approved", timelineEvent.Code);
        Assert.Equal("user", timelineEvent.Actor);
        Assert.Equal("spec", timelineEvent.Phase);
        Assert.Equal("Phase `spec` approved.", timelineEvent.Summary);
        Assert.Single(timelineEvent.Artifacts);
        Assert.Equal(".specs/us/workflow/US-0001/branch.yaml", timelineEvent.Artifacts.First());
    }

    [Fact]
    public void TimelineMarkdownParser_ParseEvents_ExtractsTokenUsageAndDuration()
    {
        const string timeline = """
# Timeline · US-0001 · Test story

## Events

### 2026-04-18T09:10:00Z · `phase_completed`

- Actor: `system`
- Phase: `spec`
- Summary: Generated artifact for phase `spec`.
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
<!-- specforge-execution-hashes input-sha256="aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" output-sha256="bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" structured-output-sha256="cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc" -->
- Duration: `18765` ms
""";

        var events = TimelineMarkdownParser.ParseEvents(timeline);

        var timelineEvent = Assert.Single(events);
        Assert.Single(timelineEvent.Artifacts);
        Assert.Equal(".specs/us/workflow/US-0001/phases/01-spec.md", timelineEvent.Artifacts.First());
        Assert.NotNull(timelineEvent.Usage);
        Assert.Equal(486, timelineEvent.Usage!.InputTokens);
        Assert.Equal(1644, timelineEvent.Usage.OutputTokens);
        Assert.Equal(2130, timelineEvent.Usage.TotalTokens);
        Assert.NotNull(timelineEvent.Execution);
        Assert.Equal("openai-compatible", timelineEvent.Execution!.ProviderKind);
        Assert.Equal("gpt-4.1-mini", timelineEvent.Execution.Model);
        Assert.Equal("light", timelineEvent.Execution.ProfileName);
        Assert.Equal("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", timelineEvent.Execution.InputSha256);
        Assert.Equal("bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", timelineEvent.Execution.OutputSha256);
        Assert.Equal("cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc", timelineEvent.Execution.StructuredOutputSha256);
        Assert.Equal(18765, timelineEvent.DurationMs);
    }

    [Fact]
    public async Task ContinuePhaseAsync_WithProviderUsage_PersistsTokenUsageInResultAndTimeline()
    {
        var runner = new WorkflowRunner(new UsageCapturingPhaseExecutionProvider(), "0.1.3.224", "balanced");
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
        Assert.Contains("runtime-version: `0.1.3.224`", timeline);
        Assert.Contains("input-sha256=\"input-hash\"", timeline);
        Assert.Contains("output-sha256=\"output-hash\"", timeline);
        Assert.Contains("structured-output-sha256=\"structured-hash\"", timeline);
        Assert.Contains("receipt=\"", timeline);
        Assert.Contains("- Duration:", timeline);
        var receiptsDirectoryPath = UserStoryFilePaths.ResolveFromWorkspaceRoot(workspaceRoot, "US-0001").ExecutionReceiptsDirectoryPath;
        var receiptPath = Assert.Single(Directory.GetFiles(receiptsDirectoryPath, "*.json"));
        var receiptJson = await File.ReadAllTextAsync(receiptPath);
        Assert.Contains("\"manifestSha256\"", receiptJson);
        Assert.Contains("\"outputManifest\"", receiptJson);
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
        var reviewArtifact = await File.ReadAllTextAsync(paths.GetPhaseArtifactPath(PhaseId.Review));
        var evidenceMarkdown = await File.ReadAllTextAsync(paths.GetPhaseEvidenceMarkdownPath(PhaseId.Implementation));
        var evidenceJson = await File.ReadAllTextAsync(paths.GetPhaseEvidenceJsonPath(PhaseId.Implementation));

        Assert.Contains("## Captured Phase Evidence", implementationArtifact);
        Assert.Contains("src/Feature.cs", implementationArtifact);
        Assert.Contains("## Validation Checklist", reviewArtifact);
        Assert.Contains("✅ Review must compare implementation back to the approved spec before final release approval.", reviewArtifact);
        Assert.DoesNotContain("## Checks Performed", reviewArtifact);
        Assert.Contains("Meaningful touched repository files detected: `1`.", evidenceMarkdown);
        Assert.Contains("\"Path\": \"src/Feature.cs\"", evidenceJson);
        Assert.NotNull(provider.ReviewContext);
        Assert.Contains(paths.GetPhaseEvidenceMarkdownPath(PhaseId.Implementation), provider.ReviewContext!.ContextFilePaths);
    }

    [Fact]
    public async Task OperateCurrentPhaseArtifactAsync_AfterReviewRegression_PassesReviewArtifactAndCorrectionPromptToImplementation()
    {
        await InitializeGitWorkspaceAsync(workspaceRoot);
        await RunGitAsync(workspaceRoot, "checkout", "-b", "main");
        await File.WriteAllTextAsync(Path.Combine(workspaceRoot, "README.md"), "seed");
        await RunGitAsync(workspaceRoot, "add", "README.md");
        await RunGitAsync(workspaceRoot, "commit", "-m", "seed");

        var provider = new ImplementationOperationCapturingPhaseExecutionProvider();
        var runner = new WorkflowRunner(
            new UserStoryFileStore(),
            provider,
            new RepositoryCategoryCatalog(),
            new NoOpWorkBranchManager());
        await runner.CreateUserStoryAsync(workspaceRoot, "US-0001", "Review correction context", "feature", "workflow", "Initial source text");
        await runner.ContinuePhaseAsync(workspaceRoot, "US-0001");
        await ResolvePendingApprovalQuestionsAsync(runner, "US-0001");
        await runner.ApproveCurrentPhaseAsync(workspaceRoot, "US-0001", "main");
        await runner.ContinuePhaseAsync(workspaceRoot, "US-0001");
        await runner.ContinuePhaseAsync(workspaceRoot, "US-0001");
        await runner.ContinuePhaseAsync(workspaceRoot, "US-0001");

        var paths = UserStoryFilePaths.ResolveFromWorkspaceRoot(workspaceRoot, "US-0001");
        var reviewArtifactPath = paths.GetPhaseArtifactPath(PhaseId.Review);
        Assert.True(File.Exists(reviewArtifactPath));

        await runner.RequestRegressionAsync(workspaceRoot, "US-0001", PhaseId.Implementation, "Review found missing correction coverage");
        const string correctionPrompt = "Review found a missing validation fix. Update implementation without expanding scope.";
        await runner.OperateCurrentPhaseArtifactAsync(workspaceRoot, "US-0001", correctionPrompt);

        Assert.NotNull(provider.LastImplementationOperationContext);
        Assert.Equal(PhaseId.Implementation, provider.LastImplementationOperationContext!.PhaseId);
        Assert.Equal(correctionPrompt, provider.LastImplementationOperationContext.OperationPrompt);
        Assert.Equal(paths.GetPhaseArtifactPath(PhaseId.Implementation), provider.LastImplementationOperationContext.CurrentArtifactPath);
        Assert.True(provider.LastImplementationOperationContext.PreviousArtifactPaths.TryGetValue(PhaseId.Review, out var capturedReviewArtifactPath));
        Assert.Equal(reviewArtifactPath, capturedReviewArtifactPath);
    }

    [Fact]
    public async Task OperateCurrentPhaseArtifactAsync_AfterReviewRegression_CanExcludeReviewArtifactFromImplementationContext()
    {
        await InitializeGitWorkspaceAsync(workspaceRoot);
        await RunGitAsync(workspaceRoot, "checkout", "-b", "main");
        await File.WriteAllTextAsync(Path.Combine(workspaceRoot, "README.md"), "seed");
        await RunGitAsync(workspaceRoot, "add", "README.md");
        await RunGitAsync(workspaceRoot, "commit", "-m", "seed");

        var provider = new ImplementationOperationCapturingPhaseExecutionProvider();
        var runner = new WorkflowRunner(
            new UserStoryFileStore(),
            provider,
            new RepositoryCategoryCatalog(),
            new NoOpWorkBranchManager());
        await runner.CreateUserStoryAsync(workspaceRoot, "US-0001", "Review correction context", "feature", "workflow", "Initial source text");
        await runner.ContinuePhaseAsync(workspaceRoot, "US-0001");
        await ResolvePendingApprovalQuestionsAsync(runner, "US-0001");
        await runner.ApproveCurrentPhaseAsync(workspaceRoot, "US-0001", "main");
        await runner.ContinuePhaseAsync(workspaceRoot, "US-0001");
        await runner.ContinuePhaseAsync(workspaceRoot, "US-0001");
        await runner.ContinuePhaseAsync(workspaceRoot, "US-0001");

        await runner.RequestRegressionAsync(workspaceRoot, "US-0001", PhaseId.Implementation, "User approved a manual correction path without passing the review artifact");
        const string correctionPrompt = "Rebuild the missing validation logic from the explicit correction note only.";
        await runner.OperateCurrentPhaseArtifactAsync(workspaceRoot, "US-0001", correctionPrompt, includeReviewArtifactInContext: false);

        Assert.NotNull(provider.LastImplementationOperationContext);
        Assert.Equal(PhaseId.Implementation, provider.LastImplementationOperationContext!.PhaseId);
        Assert.Equal(correctionPrompt, provider.LastImplementationOperationContext.OperationPrompt);
        Assert.False(provider.LastImplementationOperationContext.PreviousArtifactPaths.ContainsKey(PhaseId.Review));
    }

    [Fact]
    public async Task OperateCurrentPhaseArtifactAsync_WithoutReviewArtifactStillRequiresPrompt()
    {
        await InitializeGitWorkspaceAsync(workspaceRoot);
        await RunGitAsync(workspaceRoot, "checkout", "-b", "main");
        await File.WriteAllTextAsync(Path.Combine(workspaceRoot, "README.md"), "seed");
        await RunGitAsync(workspaceRoot, "add", "README.md");
        await RunGitAsync(workspaceRoot, "commit", "-m", "seed");

        var runner = new WorkflowRunner(
            new UserStoryFileStore(),
            new ImplementationOperationCapturingPhaseExecutionProvider(),
            new RepositoryCategoryCatalog(),
            new NoOpWorkBranchManager());
        await runner.CreateUserStoryAsync(workspaceRoot, "US-0001", "Review correction context", "feature", "workflow", "Initial source text");
        await runner.ContinuePhaseAsync(workspaceRoot, "US-0001");
        await ResolvePendingApprovalQuestionsAsync(runner, "US-0001");
        await runner.ApproveCurrentPhaseAsync(workspaceRoot, "US-0001", "main");
        await runner.ContinuePhaseAsync(workspaceRoot, "US-0001");
        await runner.ContinuePhaseAsync(workspaceRoot, "US-0001");
        await runner.ContinuePhaseAsync(workspaceRoot, "US-0001");
        await runner.RequestRegressionAsync(workspaceRoot, "US-0001", PhaseId.Implementation, "Regression ready");

        var act = () => runner.OperateCurrentPhaseArtifactAsync(workspaceRoot, "US-0001", "", includeReviewArtifactInContext: false);

        await Assert.ThrowsAsync<ArgumentException>(act);
    }

    [Fact]
    public async Task ApproveReviewAnywayAsync_AdvancesToReleaseApproval_AndAuditsDecision()
    {
        await InitializeGitWorkspaceAsync(workspaceRoot);
        await RunGitAsync(workspaceRoot, "checkout", "-b", "main");
        await File.WriteAllTextAsync(Path.Combine(workspaceRoot, "README.md"), "seed");
        await RunGitAsync(workspaceRoot, "add", "README.md");
        await RunGitAsync(workspaceRoot, "commit", "-m", "seed");

        var runner = new WorkflowRunner(
            new UserStoryFileStore(),
            new EvidenceCapturingPhaseExecutionProvider(),
            new RepositoryCategoryCatalog(),
            new NoOpWorkBranchManager());
        await runner.CreateUserStoryAsync(workspaceRoot, "US-0001", "Review override", "feature", "workflow", "Initial source text");
        await runner.ContinuePhaseAsync(workspaceRoot, "US-0001");
        await ResolvePendingApprovalQuestionsAsync(runner, "US-0001");
        await runner.ApproveCurrentPhaseAsync(workspaceRoot, "US-0001", "main");
        await runner.ContinuePhaseAsync(workspaceRoot, "US-0001");
        await runner.ContinuePhaseAsync(workspaceRoot, "US-0001");
        await runner.ContinuePhaseAsync(workspaceRoot, "US-0001");

        var result = await runner.ApproveReviewAnywayAsync(workspaceRoot, "US-0001", "User accepts the remaining review risk for this release.");
        var paths = UserStoryFilePaths.ResolveFromWorkspaceRoot(workspaceRoot, "US-0001");
        var timeline = await File.ReadAllTextAsync(paths.TimelineFilePath);

        Assert.Equal(PhaseId.ReleaseApproval, result.CurrentPhase);
        Assert.Equal(UserStoryStatus.WaitingUser, result.Status);
        Assert.Contains("`review_force_approved`", timeline);
        Assert.Contains("User accepts the remaining review risk for this release.", timeline);
    }

    [Fact]
    public async Task ContinuePhaseAsync_Review_FailsClosedWhenReviewOmitsValidationStrategyChecklist()
    {
        await InitializeGitWorkspaceAsync(workspaceRoot);
        await RunGitAsync(workspaceRoot, "checkout", "-b", "main");
        await File.WriteAllTextAsync(Path.Combine(workspaceRoot, "README.md"), "seed");
        await RunGitAsync(workspaceRoot, "add", "README.md");
        await RunGitAsync(workspaceRoot, "commit", "-m", "seed");

        var fileStore = new UserStoryFileStore();
        var runner = new WorkflowRunner(
            fileStore,
            new MissingReviewChecklistPhaseExecutionProvider(),
            new RepositoryCategoryCatalog(),
            new NoOpWorkBranchManager());
        var service = new SpecForgeApplicationService(fileStore, runner);
        await runner.CreateUserStoryAsync(workspaceRoot, "US-0001", "Review guard", "feature", "workflow", "Initial source text");
        await runner.ContinuePhaseAsync(workspaceRoot, "US-0001");
        await ResolvePendingApprovalQuestionsAsync(runner, "US-0001");
        await runner.ApproveCurrentPhaseAsync(workspaceRoot, "US-0001", "main");
        await runner.ContinuePhaseAsync(workspaceRoot, "US-0001");
        await runner.ContinuePhaseAsync(workspaceRoot, "US-0001");
        await runner.ContinuePhaseAsync(workspaceRoot, "US-0001");

        var paths = UserStoryFilePaths.ResolveFromWorkspaceRoot(workspaceRoot, "US-0001");
        var reviewArtifact = await File.ReadAllTextAsync(paths.GetPhaseArtifactPath(PhaseId.Review));
        var reviewJson = await File.ReadAllTextAsync(paths.GetPhaseArtifactJsonPath(PhaseId.Review));
        var currentPhase = await service.GetCurrentPhaseAsync(workspaceRoot, "US-0001");

        Assert.Contains("- Result: `fail`", reviewArtifact);
        Assert.Contains("## Validation Checklist", reviewArtifact);
        Assert.Contains("❌ Review must compare implementation back to the approved spec before final release approval.", reviewArtifact);
        Assert.Contains("did not include the required Validation Checklist", reviewArtifact);
        Assert.Contains("\"result\": \"fail\"", reviewJson);
        Assert.Contains("\"validationChecklist\"", reviewJson);
        Assert.False(currentPhase.CanAdvance);
        Assert.Equal("review_failed", currentPhase.BlockingReason);
    }

    [Fact]
    public async Task ContinuePhaseAsync_ReviewFailed_ReplaysCurrentReviewInsteadOfAdvancing()
    {
        await InitializeGitWorkspaceAsync(workspaceRoot);
        await RunGitAsync(workspaceRoot, "checkout", "-b", "main");
        await File.WriteAllTextAsync(Path.Combine(workspaceRoot, "README.md"), "seed");
        await RunGitAsync(workspaceRoot, "add", "README.md");
        await RunGitAsync(workspaceRoot, "commit", "-m", "seed");

        var fileStore = new UserStoryFileStore();
        var runner = new WorkflowRunner(
            fileStore,
            new RetryPassingReviewPhaseExecutionProvider(),
            new RepositoryCategoryCatalog(),
            new NoOpWorkBranchManager());
        var service = new SpecForgeApplicationService(fileStore, runner);
        await runner.CreateUserStoryAsync(workspaceRoot, "US-0001", "Review rerun", "feature", "workflow", "Initial source text");
        await runner.ContinuePhaseAsync(workspaceRoot, "US-0001");
        await ResolvePendingApprovalQuestionsAsync(runner, "US-0001");
        await runner.ApproveCurrentPhaseAsync(workspaceRoot, "US-0001", "main");
        await runner.ContinuePhaseAsync(workspaceRoot, "US-0001");
        await runner.ContinuePhaseAsync(workspaceRoot, "US-0001");
        await runner.ContinuePhaseAsync(workspaceRoot, "US-0001");

        var currentPhase = await service.GetCurrentPhaseAsync(workspaceRoot, "US-0001");
        Assert.False(currentPhase.CanAdvance);
        Assert.Equal("review_failed", currentPhase.BlockingReason);

        var replay = await runner.ContinuePhaseAsync(workspaceRoot, "US-0001");

        Assert.Equal(PhaseId.Review, replay.CurrentPhase);
        Assert.NotNull(replay.GeneratedArtifactPath);
        Assert.EndsWith("04-review.v02.md", replay.GeneratedArtifactPath, StringComparison.Ordinal);
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

    private sealed class UsageCapturingPhaseExecutionProvider : IPhaseExecutionProvider
    {
        public PhaseExecutionReadiness GetPhaseExecutionReadiness(PhaseId phaseId) =>
            new(phaseId, CanExecute: true);

        public Task<AutoRefinementAnswersResult?> TryAutoAnswerRefinementAsync(
            PhaseExecutionContext context,
            RefinementSession session,
            CancellationToken cancellationToken = default) =>
            Task.FromResult<AutoRefinementAnswersResult?>(null);

        public Task<PhaseExecutionResult> ExecuteAsync(
            PhaseExecutionContext context,
            CancellationToken cancellationToken = default) =>
            Task.FromResult(
                new PhaseExecutionResult(
                    "# generated markdown\n\n## Tokens\n- captured",
                    "test-double",
                    new TokenUsage(321, 123, 444),
                    new PhaseExecutionMetadata(
                        "test-double",
                        "stub-model",
                        "test-profile",
                        "http://stub.test/v1",
                        InputSha256: "input-hash",
                        OutputSha256: "output-hash",
                        StructuredOutputSha256: "structured-hash")));
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

        public Task<AutoRefinementAnswersResult?> TryAutoAnswerRefinementAsync(
            PhaseExecutionContext context,
            RefinementSession session,
            CancellationToken cancellationToken = default) =>
            inner.TryAutoAnswerRefinementAsync(context, session, cancellationToken);

        public Task WaitUntilStartedAsync() => started.Task;
    }

    private sealed class AutoAnsweringPhaseExecutionProvider : IPhaseExecutionProvider
    {
        private readonly DeterministicPhaseExecutionProvider inner = new();

        public PhaseExecutionReadiness GetPhaseExecutionReadiness(PhaseId phaseId) =>
            inner.GetPhaseExecutionReadiness(phaseId);

        public Task<AutoRefinementAnswersResult?> TryAutoAnswerRefinementAsync(
            PhaseExecutionContext context,
            RefinementSession session,
            CancellationToken cancellationToken = default) =>
            Task.FromResult<AutoRefinementAnswersResult?>(
                new AutoRefinementAnswersResult(
                    true,
                    session.Items
                        .OrderBy(static item => item.Index)
                        .Select(item => $"Auto answer for: {item.Question}")
                        .Cast<string?>()
                        .ToArray(),
                    "The model answered the refinement questions from the available context.",
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

        public Task<AutoRefinementAnswersResult?> TryAutoAnswerRefinementAsync(
            PhaseExecutionContext context,
            RefinementSession session,
            CancellationToken cancellationToken = default) =>
            inner.TryAutoAnswerRefinementAsync(context, session, cancellationToken);

        public Task<PhaseExecutionResult> ExecuteAsync(
            PhaseExecutionContext context,
            CancellationToken cancellationToken = default) =>
            inner.ExecuteAsync(context, cancellationToken);
    }

    private sealed class ImplementationOperationCapturingPhaseExecutionProvider : IPhaseExecutionProvider
    {
        private readonly DeterministicPhaseExecutionProvider inner = new();

        public PhaseExecutionContext? LastImplementationOperationContext { get; private set; }

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

                if (!string.IsNullOrWhiteSpace(context.OperationPrompt))
                {
                    LastImplementationOperationContext = context;
                }
            }

            return await inner.ExecuteAsync(context, cancellationToken);
        }
    }

    private sealed class MissingReviewChecklistPhaseExecutionProvider : IPhaseExecutionProvider
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
                return new PhaseExecutionResult(
                    string.Join(
                        Environment.NewLine,
                        [
                            $"# Review · {context.UsId} · v01",
                            string.Empty,
                            "## State",
                            "- Result: `pass`",
                            string.Empty,
                            "## Checks Performed",
                            "- [x] Schema conformance",
                            "- [x] Artifact completeness",
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
                        ]) + Environment.NewLine,
                    "test-double");
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
                    return await new MissingReviewChecklistPhaseExecutionProvider().ExecuteAsync(context, cancellationToken);
                }

                var paths = UserStoryFilePaths.ResolveFromWorkspaceRoot(context.WorkspaceRoot, context.UsId);
                var validationItems = WorkflowRunner.ReadTechnicalDesignValidationStrategy(paths);
                var checklist = validationItems.Select(item => $"- ✅ {item} Evidence: Validated on retry.").ToArray();
                return new PhaseExecutionResult(
                    string.Join(
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
                        ]) + Environment.NewLine,
                    "test-double");
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
        public PrPreparationArtifactDocument? LastArtifact { get; private set; }

        public void Clear() => LastArtifact = null;

        public Task<PullRequestPublicationResult> PublishAsync(
            string workspaceRoot,
            string usId,
            WorkBranch branch,
            PrPreparationArtifactDocument artifact,
            CancellationToken cancellationToken = default)
        {
            LastArtifact = artifact;
            return Task.FromResult(new PullRequestPublicationResult(
                CommitCreated: true,
                CommitSha: "abc123",
                RemoteBranch: branch.WorkBranchName,
                IsDraft: true,
                Number: 101,
                Url: "https://github.com/example/repo/pull/101"));
        }
    }

    private sealed class RecordingPullRequestInvalidator : IPullRequestInvalidator
    {
        public PullRequestRecord? LastPullRequest { get; private set; }

        public Task<PullRequestInvalidationResult> InvalidateAsync(
            string workspaceRoot,
            string usId,
            WorkBranch branch,
            PullRequestRecord pullRequest,
            string reason,
            CancellationToken cancellationToken = default)
        {
            LastPullRequest = pullRequest;
            return Task.FromResult(new PullRequestInvalidationResult(true, "closed"));
        }
    }

    private sealed class IncompletePullRequestPublisher : IPullRequestPublisher
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
                Number: null,
                Url: null));
    }

    private sealed class PlaceholderPrPreparationPhaseExecutionProvider : IPhaseExecutionProvider
    {
        private readonly PassingReviewPhaseExecutionProvider inner = new();

        public PhaseExecutionReadiness GetPhaseExecutionReadiness(PhaseId phaseId) => inner.GetPhaseExecutionReadiness(phaseId);

        public Task<PhaseExecutionResult> ExecuteAsync(PhaseExecutionContext context, CancellationToken cancellationToken = default)
        {
            if (context.PhaseId == PhaseId.PrPreparation)
            {
                return Task.FromResult(new PhaseExecutionResult(
                    """
                    {
                      "state": "",
                      "basedOn": [],
                      "prTitle": "",
                      "prSummary": "",
                      "branchSummary": [],
                      "participants": [],
                      "changeNarrative": [],
                      "validationSummary": [],
                      "reviewerChecklist": [],
                      "risksAndFollowUps": [],
                      "prBody": []
                    }
                    """,
                    "test-double"));
            }

            return inner.ExecuteAsync(context, cancellationToken);
        }

        public Task<AutoRefinementAnswersResult?> TryAutoAnswerRefinementAsync(
            PhaseExecutionContext context,
            RefinementSession session,
            CancellationToken cancellationToken = default) =>
            inner.TryAutoAnswerRefinementAsync(context, session, cancellationToken);
    }

    private sealed class PassingReviewPhaseExecutionProvider : IPhaseExecutionProvider
    {
        private readonly DeterministicPhaseExecutionProvider inner = new();

        public PhaseExecutionReadiness GetPhaseExecutionReadiness(PhaseId phaseId) => inner.GetPhaseExecutionReadiness(phaseId);

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
                var checklist = validationItems.Select(item => $"- ✅ {item} Evidence: Validated in PR publication test.").ToArray();
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
                        "- Primary reason: Review passed.",
                        string.Empty,
                        "## Recommendation",
                        "- Advance."
                    ]) + Environment.NewLine;

                return new PhaseExecutionResult(content, "test-double");
            }

            return await inner.ExecuteAsync(context, cancellationToken);
        }
    }

    private sealed class CompletedReopenCapturingPhaseExecutionProvider : IPhaseExecutionProvider
    {
        private readonly DeterministicPhaseExecutionProvider inner = new();

        public PhaseExecutionContext? LastTechnicalDesignOperationContext { get; private set; }

        public PhaseExecutionContext? LastImplementationContext { get; private set; }

        public PhaseExecutionReadiness GetPhaseExecutionReadiness(PhaseId phaseId) => inner.GetPhaseExecutionReadiness(phaseId);

        public Task<AutoRefinementAnswersResult?> TryAutoAnswerRefinementAsync(
            PhaseExecutionContext context,
            RefinementSession session,
            CancellationToken cancellationToken = default) =>
            inner.TryAutoAnswerRefinementAsync(context, session, cancellationToken);

        public async Task<PhaseExecutionResult> ExecuteAsync(
            PhaseExecutionContext context,
            CancellationToken cancellationToken = default)
        {
            if (context.PhaseId == PhaseId.TechnicalDesign &&
                !string.IsNullOrWhiteSpace(context.OperationPrompt))
            {
                LastTechnicalDesignOperationContext = context;
            }

            if (context.PhaseId == PhaseId.Implementation)
            {
                LastImplementationContext = context;
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
                var checklist = validationItems.Select(item => $"- ✅ {item} Evidence: Validated in completed reopen test.").ToArray();
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
                        "- Primary reason: Review passed.",
                        string.Empty,
                        "## Recommendation",
                        "- Advance."
                    ]) + Environment.NewLine;

                return new PhaseExecutionResult(content, "test-double");
            }

            return await inner.ExecuteAsync(context, cancellationToken);
        }
    }
}
