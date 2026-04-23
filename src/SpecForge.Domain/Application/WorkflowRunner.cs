using System.Security.Cryptography;
using System.Text;
using System.Diagnostics;
using System.Text.RegularExpressions;
using SpecForge.Domain.Persistence;
using SpecForge.Domain.Workflow;

namespace SpecForge.Domain.Application;

public sealed class WorkflowRunner
{
    private static readonly HashSet<string> ClarificationQuestionStopWords =
    [
        "the", "and", "for", "with", "that", "this", "from", "into", "when", "where", "what", "which", "should", "does",
        "must", "have", "there", "will", "then", "than", "user", "users", "field", "exactly", "only",
        "use", "used", "using", "see", "show", "shown", "visible", "label", "allow", "allowed", "require", "required",
        "que", "del", "las", "los", "para", "por", "con", "una", "uno", "unos", "unas", "como", "debe", "deben",
        "deberia", "tambien", "sobre", "desde", "esta", "este", "estos", "estas", "hay", "cual", "cuales", "campo",
        "usuario", "de", "la", "el", "un", "es", "en", "si", "sin", "sea", "solo"
    ];

    private readonly UserStoryFileStore fileStore;
    private readonly IPhaseExecutionProvider phaseExecutionProvider;
    private readonly RepositoryCategoryCatalog repositoryCategoryCatalog;
    private readonly string captureTolerance;

    public WorkflowRunner()
        : this(new UserStoryFileStore(), new DeterministicPhaseExecutionProvider(), new RepositoryCategoryCatalog())
    {
    }

    public WorkflowRunner(IPhaseExecutionProvider phaseExecutionProvider, string captureTolerance = "balanced")
        : this(new UserStoryFileStore(), phaseExecutionProvider, new RepositoryCategoryCatalog(), captureTolerance)
    {
    }

    internal WorkflowRunner(
        UserStoryFileStore fileStore,
        IPhaseExecutionProvider phaseExecutionProvider,
        RepositoryCategoryCatalog? repositoryCategoryCatalog = null,
        string captureTolerance = "balanced")
    {
        this.fileStore = fileStore ?? throw new ArgumentNullException(nameof(fileStore));
        this.phaseExecutionProvider = phaseExecutionProvider ?? throw new ArgumentNullException(nameof(phaseExecutionProvider));
        this.repositoryCategoryCatalog = repositoryCategoryCatalog ?? new RepositoryCategoryCatalog();
        this.captureTolerance = captureTolerance is "strict" or "balanced" or "inferential" ? captureTolerance : "balanced";
    }

    public async Task<string> CreateUserStoryAsync(
        string workspaceRoot,
        string usId,
        string title,
        string kind,
        string category,
        string sourceText,
        string actor = "user",
        CancellationToken cancellationToken = default)
    {
        ValidateRequired(workspaceRoot, nameof(workspaceRoot));
        ValidateRequired(usId, nameof(usId));
        ValidateRequired(title, nameof(title));
        ValidateRequired(kind, nameof(kind));
        ValidateRequired(category, nameof(category));
        ValidateRequired(sourceText, nameof(sourceText));
        ValidateUserStoryKind(kind);
        repositoryCategoryCatalog.EnsureCategoryIsAllowed(workspaceRoot, category);

        var paths = UserStoryFilePaths.FromWorkspaceRoot(workspaceRoot, category, usId);
        Directory.CreateDirectory(paths.RootDirectory);
        Directory.CreateDirectory(paths.PhasesDirectoryPath);
        Directory.CreateDirectory(paths.AttachmentsDirectoryPath);

        var workflowRun = new WorkflowRun(usId, ComputeSourceHash(sourceText), WorkflowDefinition.CanonicalV1);

        await File.WriteAllTextAsync(paths.MainArtifactPath, BuildUserStoryMarkdown(usId, title, kind, category, sourceText), cancellationToken);
        await File.WriteAllTextAsync(paths.TimelineFilePath, BuildInitialTimeline(usId, title, actor), cancellationToken);
        await fileStore.SaveAsync(workflowRun, paths.RootDirectory, cancellationToken);
        return paths.RootDirectory;
    }

    public async Task ApproveCurrentPhaseAsync(
        string workspaceRoot,
        string usId,
        string? baseBranch = null,
        string? workBranch = null,
        string actor = "user",
        CancellationToken cancellationToken = default)
    {
        var paths = UserStoryFilePaths.ResolveFromWorkspaceRoot(workspaceRoot, usId);
        var workflowRun = await fileStore.LoadAsync(paths.RootDirectory, cancellationToken);
        var branchWasMissing = workflowRun.Branch is null;
        await EnsureCurrentPhaseIsApprovableAsync(paths, workflowRun.CurrentPhase, cancellationToken);
        var metadata = await ReadUserStoryMetadataAsync(paths.MainArtifactPath, usId, cancellationToken);
        var workBranchName = string.IsNullOrWhiteSpace(workBranch)
            ? BuildWorkBranchName(usId, metadata.Title, metadata.Kind)
            : workBranch.Trim();
        workflowRun.ApproveCurrentPhase(
            baseBranch,
            workBranchName,
            metadata.Kind,
            metadata.Category,
            metadata.Title,
            paths.MainArtifactPath,
            DateTimeOffset.UtcNow);
        await fileStore.SaveAsync(workflowRun, paths.RootDirectory, cancellationToken);
        await AppendTimelineEventAsync(
            paths.TimelineFilePath,
            "phase_approved",
            NormalizeActor(actor),
            workflowRun.CurrentPhase,
            $"Phase `{WorkflowPresentation.ToPhaseSlug(workflowRun.CurrentPhase)}` approved.",
            cancellationToken);

        if (branchWasMissing && workflowRun.Branch is not null && workflowRun.CurrentPhase == PhaseId.Refinement)
        {
            await AppendTimelineEventAsync(
                paths.TimelineFilePath,
                "branch_created",
                "system",
                workflowRun.CurrentPhase,
                $"Created branch `{workflowRun.Branch.WorkBranchName}` from `{workflowRun.Branch.BaseBranch}`.",
                cancellationToken);
        }
    }

    public async Task<SubmitApprovalAnswerResult> SubmitApprovalAnswerAsync(
        string workspaceRoot,
        string usId,
        string question,
        string answer,
        string actor = "user",
        CancellationToken cancellationToken = default)
    {
        ValidateRequired(question, nameof(question));
        ValidateRequired(answer, nameof(answer));

        var paths = UserStoryFilePaths.ResolveFromWorkspaceRoot(workspaceRoot, usId);
        var workflowRun = await fileStore.LoadAsync(paths.RootDirectory, cancellationToken);
        if (workflowRun.CurrentPhase != PhaseId.Refinement)
        {
            throw new WorkflowDomainException("Approval answers can only be recorded while the workflow is in the refinement phase.");
        }

        var currentArtifactPath = paths.GetLatestExistingPhaseArtifactPath(PhaseId.Refinement)
            ?? throw new WorkflowDomainException("The refinement artifact does not exist yet.");
        var answeredAtUtc = DateTimeOffset.UtcNow;
        var normalizedActor = NormalizeActor(actor);
        var currentDocument = await LoadCurrentRefinementDocumentAsync(paths, cancellationToken);
        var updatedDocument = RefinementSpecJson.ApplyApprovalAnswer(
            currentDocument,
            question.Trim(),
            answer.Trim(),
            normalizedActor,
            answeredAtUtc);

        var generatedArtifactPath = NextAvailableArtifactPath(paths, PhaseId.Refinement);
        var generatedVersion = ExtractArtifactVersion(generatedArtifactPath);
        var generatedArtifactJsonPath = paths.GetPhaseArtifactJsonPath(PhaseId.Refinement, generatedVersion);
        await File.WriteAllTextAsync(generatedArtifactJsonPath, RefinementSpecJson.Serialize(updatedDocument), cancellationToken);
        await File.WriteAllTextAsync(generatedArtifactPath, RefinementSpecJson.RenderMarkdown(updatedDocument, workflowRun.UsId, generatedVersion), cancellationToken);

        if (workflowRun.IsPhaseApproved(PhaseId.Refinement))
        {
            workflowRun.ReopenCurrentPhaseApproval();
            await fileStore.SaveAsync(workflowRun, paths.RootDirectory, cancellationToken);
        }

        await AppendTimelineEventAsync(
            paths.TimelineFilePath,
            "approval_answer_recorded",
            normalizedActor,
            workflowRun.CurrentPhase,
            $"Recorded human approval answer for refinement question `{SummarizeQuestion(question)}`.",
            cancellationToken,
            generatedArtifactPath);

        return new SubmitApprovalAnswerResult(
            workflowRun.UsId,
            WorkflowPresentation.ToPhaseSlug(workflowRun.CurrentPhase),
            WorkflowPresentation.ToStatusSlug(workflowRun.Status),
            generatedArtifactPath);
    }

    public async Task<RequestRegressionResult> RequestRegressionAsync(
        string workspaceRoot,
        string usId,
        PhaseId targetPhase,
        string? reason = null,
        bool destructive = false,
        string actor = "user",
        CancellationToken cancellationToken = default)
    {
        var paths = UserStoryFilePaths.ResolveFromWorkspaceRoot(workspaceRoot, usId);
        var workflowRun = await fileStore.LoadAsync(paths.RootDirectory, cancellationToken);
        var targetPhaseWasApproved = workflowRun.IsPhaseApproved(targetPhase);
        if (destructive)
        {
            await RewindDerivedArtifactsAsync(paths, workflowRun.CurrentPhase, targetPhase, workflowRun.Branch is not null, cancellationToken);
            if (targetPhase <= PhaseId.Refinement && workflowRun.Branch is not null)
            {
                workflowRun.RemoveBranch();
            }
        }

        workflowRun.RequestRegression(targetPhase);
        RestoreTargetApprovalIfApplicable(workflowRun, targetPhase, destructive, targetPhaseWasApproved);
        await fileStore.SaveAsync(workflowRun, paths.RootDirectory, cancellationToken);

        var summary = destructive
            ? $"Workflow regressed to phase `{WorkflowPresentation.ToPhaseSlug(targetPhase)}` and deleted later derived artifacts."
            : $"Workflow regressed to phase `{WorkflowPresentation.ToPhaseSlug(targetPhase)}`.";
        if (!string.IsNullOrWhiteSpace(reason))
        {
            summary = $"{summary} Reason: {reason.Trim()}.";
        }

        await AppendTimelineEventAsync(
            paths.TimelineFilePath,
            "phase_regressed",
            NormalizeActor(actor),
            workflowRun.CurrentPhase,
            summary,
            cancellationToken);

        return new RequestRegressionResult(
            workflowRun.UsId,
            WorkflowPresentation.ToStatusSlug(workflowRun.Status),
            WorkflowPresentation.ToPhaseSlug(workflowRun.CurrentPhase));
    }

    public async Task<RestartUserStoryResult> RestartUserStoryFromSourceAsync(
        string workspaceRoot,
        string usId,
        string? reason = null,
        string actor = "user",
        CancellationToken cancellationToken = default)
    {
        var paths = UserStoryFilePaths.ResolveFromWorkspaceRoot(workspaceRoot, usId);
        var existingRun = await fileStore.LoadAsync(paths.RootDirectory, cancellationToken);

        if (existingRun.CurrentPhase == PhaseId.Capture)
        {
            throw new WorkflowDomainException("Restart is not allowed before refinement has started.");
        }

        var currentSourceText = await ReadSourceTextFromUserStoryAsync(paths.MainArtifactPath, cancellationToken);
        var currentSourceHash = ComputeSourceHash(currentSourceText);
        if (string.Equals(existingRun.SourceHash, currentSourceHash, StringComparison.Ordinal))
        {
            throw new WorkflowDomainException("Restart is not allowed because the source has not changed.");
        }

        var restartTimestamp = DateTimeOffset.UtcNow;
        await ArchiveDerivedArtifactsAsync(paths, existingRun, restartTimestamp, cancellationToken);

        var restartedRun = new WorkflowRun(existingRun.UsId, currentSourceHash, existingRun.Definition);
        var normalizedActor = NormalizeActor(actor);
        var regeneration = await ContinueFromCaptureOrClarificationAsync(workspaceRoot, paths, restartedRun, normalizedActor, cancellationToken);
        var generatedArtifactPath = regeneration.ArtifactPath;
        await fileStore.SaveAsync(restartedRun, paths.RootDirectory, cancellationToken);

        await AppendTimelineEventAsync(
            paths.TimelineFilePath,
            "source_hash_mismatch_detected",
            normalizedActor,
            restartedRun.CurrentPhase,
            $"Detected source change. Previous hash `{existingRun.SourceHash}` differs from current hash `{currentSourceHash}`.",
            cancellationToken);

        var summary = restartedRun.CurrentPhase == PhaseId.Refinement
            ? "Restarted workflow from the updated source and regenerated refinement."
            : "Restarted workflow from the updated source and requested clarification before refinement.";
        if (!string.IsNullOrWhiteSpace(reason))
        {
            summary = $"{summary} Reason: {reason.Trim()}.";
        }

        await AppendTimelineEventAsync(
            paths.TimelineFilePath,
            "us_restarted_from_source",
            NormalizeActor(actor),
            restartedRun.CurrentPhase,
            summary,
            cancellationToken,
            generatedArtifactPath,
            regeneration.Usage,
            regeneration.DurationMs);

        return new RestartUserStoryResult(
            restartedRun.UsId,
            WorkflowPresentation.ToStatusSlug(restartedRun.Status),
            WorkflowPresentation.ToPhaseSlug(restartedRun.CurrentPhase),
            generatedArtifactPath);
    }

    public async Task<ResetUserStoryResult> ResetUserStoryToCaptureAsync(
        string workspaceRoot,
        string usId,
        CancellationToken cancellationToken = default)
    {
        var paths = UserStoryFilePaths.ResolveFromWorkspaceRoot(workspaceRoot, usId);
        var existingRun = await fileStore.LoadAsync(paths.RootDirectory, cancellationToken);
        var metadata = await ReadUserStoryMetadataAsync(paths.MainArtifactPath, usId, cancellationToken);
        var currentSourceText = await ReadSourceTextFromUserStoryAsync(paths.MainArtifactPath, cancellationToken);
        var currentSourceHash = ComputeSourceHash(currentSourceText);

        var deletedPaths = await ResetDerivedArtifactsAsync(paths, existingRun, cancellationToken);

        var cleanedUserStory = UserStoryClarificationMarkdown.Remove(
            await File.ReadAllTextAsync(paths.MainArtifactPath, cancellationToken));
        await File.WriteAllTextAsync(paths.MainArtifactPath, cleanedUserStory, cancellationToken);
        await File.WriteAllTextAsync(paths.TimelineFilePath, BuildInitialTimeline(usId, metadata.Title, "system"), cancellationToken);

        await AppendTimelineEventAsync(
            paths.TimelineFilePath,
            "workflow_reset_to_capture",
            "system",
            PhaseId.Capture,
            BuildFileDeletionSummary(
                "Reset the workflow to `capture` and removed derived artifacts.",
                deletedPaths),
            cancellationToken);

        var resetRun = new WorkflowRun(usId, currentSourceHash, existingRun.Definition);
        await fileStore.SaveAsync(resetRun, paths.RootDirectory, cancellationToken);

        return new ResetUserStoryResult(
            resetRun.UsId,
            WorkflowPresentation.ToStatusSlug(resetRun.Status),
            WorkflowPresentation.ToPhaseSlug(resetRun.CurrentPhase),
            deletedPaths,
            [
                paths.MainArtifactPath,
                paths.ContextDirectoryPath,
                paths.AttachmentsDirectoryPath,
                paths.StateFilePath,
                paths.TimelineFilePath
            ]);
    }

    public async Task<RewindWorkflowResult> RewindWorkflowAsync(
        string workspaceRoot,
        string usId,
        PhaseId targetPhase,
        bool destructive = false,
        string actor = "user",
        CancellationToken cancellationToken = default)
    {
        var paths = UserStoryFilePaths.ResolveFromWorkspaceRoot(workspaceRoot, usId);
        var workflowRun = await fileStore.LoadAsync(paths.RootDirectory, cancellationToken);
        ValidateRewindTarget(workflowRun, targetPhase);
        var targetPhaseWasApproved = workflowRun.IsPhaseApproved(targetPhase);

        IReadOnlyCollection<string> deletedPaths = [];
        if (destructive)
        {
            deletedPaths = await RewindDerivedArtifactsAsync(paths, workflowRun.CurrentPhase, targetPhase, workflowRun.Branch is not null, cancellationToken);
        }

        workflowRun.RewindToPhase(targetPhase);
        RestoreTargetApprovalIfApplicable(workflowRun, targetPhase, destructive, targetPhaseWasApproved);

        if (destructive && targetPhase <= PhaseId.Refinement && workflowRun.Branch is not null)
        {
            workflowRun.RemoveBranch();
        }

        await fileStore.SaveAsync(workflowRun, paths.RootDirectory, cancellationToken);

        await AppendTimelineEventAsync(
            paths.TimelineFilePath,
            "workflow_rewound",
            NormalizeActor(actor),
            workflowRun.CurrentPhase,
            destructive
                ? BuildFileDeletionSummary(
                    $"Rewound the workflow to phase `{WorkflowPresentation.ToPhaseSlug(targetPhase)}`.",
                    deletedPaths)
                : $"Rewound the workflow to phase `{WorkflowPresentation.ToPhaseSlug(targetPhase)}` without deleting later artifacts.",
            cancellationToken);

        return new RewindWorkflowResult(
            workflowRun.UsId,
            WorkflowPresentation.ToStatusSlug(workflowRun.Status),
            WorkflowPresentation.ToPhaseSlug(workflowRun.CurrentPhase),
            deletedPaths,
            destructive ? BuildRewindPreservedPaths(paths, targetPhase) : BuildNonDestructiveRewindPreservedPaths(paths));
    }

    public async Task<ContinuePhaseResult> ContinuePhaseAsync(
        string workspaceRoot,
        string usId,
        string actor = "user",
        CancellationToken cancellationToken = default)
    {
        var paths = UserStoryFilePaths.ResolveFromWorkspaceRoot(workspaceRoot, usId);
        var workflowRun = await fileStore.LoadAsync(paths.RootDirectory, cancellationToken);
        var normalizedActor = NormalizeActor(actor);

        if (workflowRun.CurrentPhase is PhaseId.Capture or PhaseId.Clarification)
        {
            var clarificationResult = await ContinueFromCaptureOrClarificationAsync(workspaceRoot, paths, workflowRun, normalizedActor, cancellationToken);
            await fileStore.SaveAsync(workflowRun, paths.RootDirectory, cancellationToken);
            return new ContinuePhaseResult(
                workflowRun.UsId,
                workflowRun.CurrentPhase,
                workflowRun.Status,
                clarificationResult.ArtifactPath,
                clarificationResult.Usage,
                clarificationResult.Execution);
        }

        if (workflowRun.CurrentPhase == PhaseId.Refinement)
        {
            var validationResult = await ValidateApprovedRefinementAsync(workspaceRoot, paths, workflowRun, normalizedActor, cancellationToken);
            if (validationResult is not null)
            {
                await fileStore.SaveAsync(workflowRun, paths.RootDirectory, cancellationToken);
                return validationResult;
            }
        }

        workflowRun.GenerateNextPhase();

        string? artifactPath = null;
        TokenUsage? usage = null;
        long? durationMs = null;
        PhaseExecutionMetadata? execution = null;
        if (HasArtifact(workflowRun.CurrentPhase))
        {
            var generation = await MaterializePhaseArtifactAsync(workspaceRoot, paths, workflowRun, currentArtifactPath: null, operationPrompt: null, cancellationToken);
            artifactPath = generation.ArtifactPath;
            usage = generation.Usage;
            durationMs = generation.DurationMs;
            execution = generation.Execution;
            await AppendTimelineEventAsync(
                paths.TimelineFilePath,
                "phase_completed",
                normalizedActor,
                workflowRun.CurrentPhase,
                $"Generated artifact for phase `{WorkflowPresentation.ToPhaseSlug(workflowRun.CurrentPhase)}`.",
                cancellationToken,
                artifactPath,
                usage,
                durationMs,
                generation.Execution);
        }
        else
        {
            await AppendTimelineEventAsync(
                paths.TimelineFilePath,
                "phase_started",
                normalizedActor,
                workflowRun.CurrentPhase,
                $"Transitioned to phase `{WorkflowPresentation.ToPhaseSlug(workflowRun.CurrentPhase)}`.",
                cancellationToken);
        }

        await fileStore.SaveAsync(workflowRun, paths.RootDirectory, cancellationToken);
        return new ContinuePhaseResult(workflowRun.UsId, workflowRun.CurrentPhase, workflowRun.Status, artifactPath, usage, execution);
    }

    public async Task<SubmitClarificationAnswersResult> SubmitClarificationAnswersAsync(
        string workspaceRoot,
        string usId,
        IReadOnlyList<string> answers,
        string actor = "user",
        CancellationToken cancellationToken = default)
    {
        var paths = UserStoryFilePaths.ResolveFromWorkspaceRoot(workspaceRoot, usId);
        var workflowRun = await fileStore.LoadAsync(paths.RootDirectory, cancellationToken);
        if (workflowRun.CurrentPhase != PhaseId.Clarification)
        {
            throw new WorkflowDomainException("Clarification answers can only be submitted while the workflow is in the clarification phase.");
        }

        var session = await ReadClarificationSessionAsync(paths, cancellationToken)
            ?? throw new WorkflowDomainException("No clarification questions are currently registered for this user story.");

        var updatedSession = UserStoryClarificationMarkdown.WithAnswers(session, answers);
        await PersistClarificationSessionAsync(paths, updatedSession, cancellationToken);

        workflowRun.RestoreState(PhaseId.Clarification, UserStoryStatus.Active);
        await fileStore.SaveAsync(workflowRun, paths.RootDirectory, cancellationToken);
        await AppendTimelineEventAsync(
            paths.TimelineFilePath,
            "clarification_answered",
            NormalizeActor(actor),
            workflowRun.CurrentPhase,
            $"Recorded {updatedSession.Items.Count(item => !string.IsNullOrWhiteSpace(item.Answer))} clarification answer(s) in `clarification.md`.",
            cancellationToken,
            paths.ClarificationFilePath);

        return new SubmitClarificationAnswersResult(
            workflowRun.UsId,
            WorkflowPresentation.ToPhaseSlug(workflowRun.CurrentPhase),
            WorkflowPresentation.ToStatusSlug(workflowRun.Status),
            updatedSession.Items.Count(item => !string.IsNullOrWhiteSpace(item.Answer)));
    }

    public async Task<OperateCurrentPhaseArtifactResult> OperateCurrentPhaseArtifactAsync(
        string workspaceRoot,
        string usId,
        string prompt,
        string actor = "user",
        CancellationToken cancellationToken = default)
    {
        ValidateRequired(prompt, nameof(prompt));
        var paths = UserStoryFilePaths.ResolveFromWorkspaceRoot(workspaceRoot, usId);
        var workflowRun = await fileStore.LoadAsync(paths.RootDirectory, cancellationToken);
        if (!HasArtifact(workflowRun.CurrentPhase))
        {
            throw new WorkflowDomainException($"Phase '{WorkflowPresentation.ToPhaseSlug(workflowRun.CurrentPhase)}' does not support direct artifact operations.");
        }

        var normalizedActor = NormalizeActor(actor);
        var sourceArtifactPath = paths.GetLatestExistingPhaseArtifactPath(workflowRun.CurrentPhase)
            ?? throw new WorkflowDomainException($"Phase '{WorkflowPresentation.ToPhaseSlug(workflowRun.CurrentPhase)}' does not yet have a current artifact to operate on.");
        var generation = await MaterializePhaseArtifactAsync(
            workspaceRoot,
            paths,
            workflowRun,
            sourceArtifactPath,
            prompt,
            cancellationToken);
        var operationLogPath = paths.GetPhaseOperationLogPath(workflowRun.CurrentPhase);
        await AppendArtifactOperationEntryAsync(
            operationLogPath,
            workflowRun.CurrentPhase,
            normalizedActor,
            sourceArtifactPath,
            prompt,
            generation.ArtifactPath,
            cancellationToken);
        await fileStore.SaveAsync(workflowRun, paths.RootDirectory, cancellationToken);
        await AppendTimelineEventAsync(
            paths.TimelineFilePath,
            "artifact_operated",
            normalizedActor,
            workflowRun.CurrentPhase,
            $"Operated current artifact `{Path.GetFileName(sourceArtifactPath)}` and produced `{Path.GetFileName(generation.ArtifactPath)}`.",
            cancellationToken,
            operationLogPath,
            generation.Usage,
            generation.DurationMs,
            generation.Execution);

        return new OperateCurrentPhaseArtifactResult(
            workflowRun.UsId,
            WorkflowPresentation.ToPhaseSlug(workflowRun.CurrentPhase),
            WorkflowPresentation.ToStatusSlug(workflowRun.Status),
            operationLogPath,
            sourceArtifactPath,
            generation.ArtifactPath,
            generation.Usage,
            generation.Execution);
    }

    private async Task<CaptureTransitionResult> ContinueFromCaptureOrClarificationAsync(
        string workspaceRoot,
        UserStoryFilePaths paths,
        WorkflowRun workflowRun,
        string actor,
        CancellationToken cancellationToken)
    {
        if (workflowRun.CurrentPhase == PhaseId.Capture)
        {
            workflowRun.GenerateNextPhase();
        }

        var clarificationGeneration = await MaterializePhaseArtifactAsync(workspaceRoot, paths, workflowRun, currentArtifactPath: null, operationPrompt: null, cancellationToken);
        var clarification = ParseClarificationArtifact(await File.ReadAllTextAsync(clarificationGeneration.ArtifactPath, cancellationToken));
        await UpdateClarificationLogAsync(paths, clarification, this.captureTolerance, cancellationToken);
        await AppendTimelineEventAsync(
            paths.TimelineFilePath,
            clarification.IsReady ? "clarification_passed" : "clarification_requested",
            actor,
            workflowRun.CurrentPhase,
            clarification.Summary,
            cancellationToken,
            clarificationGeneration.ArtifactPath,
            clarificationGeneration.Usage,
            clarificationGeneration.DurationMs,
            clarificationGeneration.Execution);

        if (!clarification.IsReady)
        {
            workflowRun.RestoreState(PhaseId.Clarification, UserStoryStatus.WaitingUser);
            return new CaptureTransitionResult(
                clarificationGeneration.ArtifactPath,
                clarificationGeneration.Usage,
                clarificationGeneration.DurationMs,
                clarificationGeneration.Execution);
        }

        workflowRun.GenerateNextPhase();
        var refinementGeneration = await MaterializePhaseArtifactAsync(workspaceRoot, paths, workflowRun, currentArtifactPath: null, operationPrompt: null, cancellationToken);
        await AppendTimelineEventAsync(
            paths.TimelineFilePath,
            "phase_completed",
            actor,
            workflowRun.CurrentPhase,
            $"Generated artifact for phase `{WorkflowPresentation.ToPhaseSlug(workflowRun.CurrentPhase)}` after clarification.",
            cancellationToken,
            refinementGeneration.ArtifactPath,
            refinementGeneration.Usage,
            refinementGeneration.DurationMs,
            refinementGeneration.Execution);

        return new CaptureTransitionResult(
            refinementGeneration.ArtifactPath,
            refinementGeneration.Usage,
            refinementGeneration.DurationMs,
            refinementGeneration.Execution);
    }

    private async Task<ArtifactGenerationResult> MaterializePhaseArtifactAsync(
        string workspaceRoot,
        UserStoryFilePaths paths,
        WorkflowRun workflowRun,
        string? currentArtifactPath,
        string? operationPrompt,
        CancellationToken cancellationToken)
    {
        Directory.CreateDirectory(paths.PhasesDirectoryPath);
        var artifactPath = NextAvailableArtifactPath(paths, workflowRun.CurrentPhase);
        var executionContext = new PhaseExecutionContext(
            workspaceRoot,
            workflowRun.UsId,
            workflowRun.CurrentPhase,
            paths.MainArtifactPath,
            BuildPreviousArtifactMap(paths, workflowRun.CurrentPhase),
            BuildContextFilePaths(paths),
            currentArtifactPath,
            operationPrompt);
        var stopwatch = Stopwatch.StartNew();
        var result = await phaseExecutionProvider.ExecuteAsync(executionContext, cancellationToken);
        stopwatch.Stop();

        if (workflowRun.CurrentPhase == PhaseId.Refinement)
        {
            var version = ExtractArtifactVersion(artifactPath);
            var document = RefinementSpecJson.ParseCanonicalJson(result.Content);
            var renderedMarkdown = RefinementSpecJson.RenderMarkdown(document, workflowRun.UsId, version);
            EnsureMaterializedRefinementIsUsable(renderedMarkdown);
            await File.WriteAllTextAsync(paths.GetPhaseArtifactJsonPath(PhaseId.Refinement, version), RefinementSpecJson.Serialize(document), cancellationToken);
            await File.WriteAllTextAsync(artifactPath, renderedMarkdown, cancellationToken);
        }
        else
        {
            await File.WriteAllTextAsync(artifactPath, result.Content, cancellationToken);
        }

        return new ArtifactGenerationResult(artifactPath, result.Usage, stopwatch.ElapsedMilliseconds, result.Execution);
    }

    private static IReadOnlyDictionary<PhaseId, string> BuildPreviousArtifactMap(UserStoryFilePaths paths, PhaseId currentPhase)
    {
        var result = new Dictionary<PhaseId, string>();
        foreach (var phaseId in new[] { PhaseId.Refinement, PhaseId.TechnicalDesign, PhaseId.Implementation, PhaseId.Review })
        {
            if (phaseId == currentPhase)
            {
                continue;
            }

            var candidate = paths.GetLatestExistingPhaseArtifactPath(phaseId);
            if (candidate is not null)
            {
                result[phaseId] = candidate;
            }
        }

        return result;
    }

    private static IReadOnlyCollection<string> BuildContextFilePaths(UserStoryFilePaths paths)
    {
        if (!Directory.Exists(paths.ContextDirectoryPath))
        {
            return [];
        }

        return Directory.GetFiles(paths.ContextDirectoryPath, "*", SearchOption.TopDirectoryOnly)
            .OrderBy(static path => path, StringComparer.Ordinal)
            .ToArray();
    }

    private static string NextAvailableArtifactPath(UserStoryFilePaths paths, PhaseId phaseId)
    {
        for (var version = 1; version < 100; version++)
        {
            var candidate = paths.GetPhaseArtifactPath(phaseId, version);
            if (!File.Exists(candidate))
            {
                return candidate;
            }
        }

        throw new WorkflowDomainException($"Too many versions generated for phase '{phaseId}'.");
    }

    private static bool HasArtifact(PhaseId phaseId) =>
        phaseId is PhaseId.Refinement or PhaseId.TechnicalDesign or PhaseId.Implementation or PhaseId.Review;

    private static async Task<string> ReadSourceTextFromUserStoryAsync(string userStoryPath, CancellationToken cancellationToken)
    {
        var userStory = await File.ReadAllTextAsync(userStoryPath, cancellationToken);
        var objective = MarkdownHelper.ReadSection(userStory, "## Objective", "## Objetivo");
        return objective == "..." ? userStory.Trim() : objective;
    }


    private static async Task ArchiveDerivedArtifactsAsync(
        UserStoryFilePaths paths,
        WorkflowRun workflowRun,
        DateTimeOffset restartTimestamp,
        CancellationToken cancellationToken)
    {
        var archiveDirectory = paths.GetRestartArchiveDirectoryPath(restartTimestamp);
        Directory.CreateDirectory(archiveDirectory);

        if (Directory.Exists(paths.PhasesDirectoryPath) &&
            Directory.EnumerateFileSystemEntries(paths.PhasesDirectoryPath).Any())
        {
            var archivedPhasesPath = Path.Combine(archiveDirectory, "phases");
            Directory.Move(paths.PhasesDirectoryPath, archivedPhasesPath);
        }

        if (workflowRun.Branch is not null)
        {
            workflowRun.Branch.MarkSuperseded();
            var archivedBranchPath = Path.Combine(archiveDirectory, "branch.yaml");
            await File.WriteAllTextAsync(
                archivedBranchPath,
                BranchYamlSerializer.Serialize(workflowRun.UsId, workflowRun.Branch),
                cancellationToken);
        }

        var archivedStatePath = Path.Combine(archiveDirectory, "state.yaml");
        await File.WriteAllTextAsync(
            archivedStatePath,
            StateYamlSerializer.Serialize(workflowRun),
            cancellationToken);

        Directory.CreateDirectory(paths.PhasesDirectoryPath);
    }

    private static Task<IReadOnlyCollection<string>> ResetDerivedArtifactsAsync(
        UserStoryFilePaths paths,
        WorkflowRun workflowRun,
        CancellationToken cancellationToken)
    {
        var deletedPaths = new List<string>();

        if (Directory.Exists(paths.PhasesDirectoryPath))
        {
            deletedPaths.Add(paths.PhasesDirectoryPath);
            Directory.Delete(paths.PhasesDirectoryPath, recursive: true);
        }

        if (File.Exists(paths.ClarificationFilePath))
        {
            deletedPaths.Add(paths.ClarificationFilePath);
            File.Delete(paths.ClarificationFilePath);
        }

        if (File.Exists(paths.RuntimeFilePath))
        {
            deletedPaths.Add(paths.RuntimeFilePath);
            File.Delete(paths.RuntimeFilePath);
        }

        if (workflowRun.Branch is not null && File.Exists(paths.BranchFilePath))
        {
            deletedPaths.Add(paths.BranchFilePath);
            File.Delete(paths.BranchFilePath);
        }

        Directory.CreateDirectory(paths.PhasesDirectoryPath);
        return Task.FromResult<IReadOnlyCollection<string>>(deletedPaths);
    }

    private static Task<IReadOnlyCollection<string>> RewindDerivedArtifactsAsync(
        UserStoryFilePaths paths,
        PhaseId currentPhase,
        PhaseId targetPhase,
        bool hasBranch,
        CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();

        var deletedPaths = new List<string>();
        if (Directory.Exists(paths.PhasesDirectoryPath))
        {
            foreach (var phaseId in EnumerateRewindDeletablePhases(currentPhase, targetPhase))
            {
                foreach (var candidate in EnumeratePhaseFiles(paths, phaseId))
                {
                    if (!File.Exists(candidate))
                    {
                        continue;
                    }

                    deletedPaths.Add(candidate);
                    File.Delete(candidate);
                }
            }
        }

        if (File.Exists(paths.RuntimeFilePath))
        {
            deletedPaths.Add(paths.RuntimeFilePath);
            File.Delete(paths.RuntimeFilePath);
        }

        if (targetPhase <= PhaseId.Refinement && hasBranch && File.Exists(paths.BranchFilePath))
        {
            deletedPaths.Add(paths.BranchFilePath);
            File.Delete(paths.BranchFilePath);
        }

        Directory.CreateDirectory(paths.PhasesDirectoryPath);
        return Task.FromResult<IReadOnlyCollection<string>>(deletedPaths);
    }

    private static async Task AppendTimelineEventAsync(
        string timelinePath,
        string eventCode,
        string actor,
        PhaseId phaseId,
        string summary,
        CancellationToken cancellationToken,
        string? artifactPath = null,
        TokenUsage? usage = null,
        long? durationMs = null,
        PhaseExecutionMetadata? execution = null)
    {
        var timestamp = DateTimeOffset.UtcNow.ToString("O");
        var builder = new StringBuilder()
            .AppendLine()
            .AppendLine($"### {timestamp} · `{eventCode}`")
            .AppendLine()
            .AppendLine($"- Actor: `{actor}`")
            .AppendLine($"- Phase: `{WorkflowPresentation.ToPhaseSlug(phaseId)}`")
            .AppendLine($"- Summary: {summary}");

        if (!string.IsNullOrWhiteSpace(artifactPath))
        {
            builder.AppendLine("- Artifacts:")
                .AppendLine($"  - `{artifactPath.Replace('\\', '/')}`");
        }

        if (usage is not null)
        {
            builder.AppendLine("- Tokens:")
                .AppendLine($"  - input: `{usage.InputTokens}`")
                .AppendLine($"  - output: `{usage.OutputTokens}`")
                .AppendLine($"  - total: `{usage.TotalTokens}`");
        }

        if (execution is not null)
        {
            builder.AppendLine("- Execution:")
                .AppendLine($"  - provider: `{execution.ProviderKind}`")
                .AppendLine($"  - model: `{execution.Model}`");

            if (!string.IsNullOrWhiteSpace(execution.ProfileName))
            {
                builder.AppendLine($"  - profile: `{execution.ProfileName}`");
            }

            if (!string.IsNullOrWhiteSpace(execution.BaseUrl))
            {
                builder.AppendLine($"  - base-url: `{execution.BaseUrl}`");
            }
        }

        if (durationMs is not null)
        {
            builder.AppendLine($"- Duration: `{durationMs}` ms");
        }

        await File.AppendAllTextAsync(timelinePath, builder.ToString(), cancellationToken);
    }

    private static void ValidateRewindTarget(WorkflowRun workflowRun, PhaseId targetPhase)
    {
        if (targetPhase == PhaseId.Capture)
        {
            throw new WorkflowDomainException("Rewind to 'capture' is not allowed. Use reset to capture instead.");
        }

        if (targetPhase == PhaseId.PrPreparation)
        {
            throw new WorkflowDomainException("Rewind to the final workflow phase is not allowed.");
        }

        if (targetPhase >= workflowRun.CurrentPhase)
        {
            throw new WorkflowDomainException(
                $"Rewind from '{workflowRun.CurrentPhase}' to '{targetPhase}' is not allowed.");
        }
    }

    private static IReadOnlyCollection<string> BuildRewindPreservedPaths(UserStoryFilePaths paths, PhaseId targetPhase)
    {
        var preservedPaths = new List<string>
        {
            paths.MainArtifactPath,
            paths.ContextDirectoryPath,
            paths.AttachmentsDirectoryPath,
            paths.StateFilePath,
            paths.TimelineFilePath,
            paths.PhasesDirectoryPath
        };

        if (targetPhase >= PhaseId.Clarification)
        {
            preservedPaths.Add(paths.ClarificationFilePath);
        }

        if (targetPhase > PhaseId.Refinement)
        {
            preservedPaths.Add(paths.BranchFilePath);
        }

        return preservedPaths;
    }

    private static IReadOnlyCollection<string> BuildNonDestructiveRewindPreservedPaths(UserStoryFilePaths paths)
    {
        return
        [
            paths.MainArtifactPath,
            paths.ClarificationFilePath,
            paths.ContextDirectoryPath,
            paths.AttachmentsDirectoryPath,
            paths.StateFilePath,
            paths.TimelineFilePath,
            paths.PhasesDirectoryPath,
            paths.BranchFilePath,
            paths.RuntimeFilePath
        ];
    }

    private static string BuildFileDeletionSummary(string prefix, IReadOnlyCollection<string> deletedPaths)
    {
        if (deletedPaths.Count == 0)
        {
            return $"{prefix} No files needed deletion.";
        }

        var deletedList = string.Join(", ", deletedPaths.Select(static path => $"`{path.Replace('\\', '/')}`"));
        return $"{prefix} Deleted: {deletedList}.";
    }

    private static IEnumerable<PhaseId> EnumerateRewindDeletablePhases(PhaseId currentPhase, PhaseId targetPhase)
    {
        foreach (var phaseId in new[]
                 {
                     PhaseId.Clarification,
                     PhaseId.Refinement,
                     PhaseId.TechnicalDesign,
                     PhaseId.Implementation,
                     PhaseId.Review
                 })
        {
            if (phaseId > targetPhase && phaseId <= currentPhase)
            {
                yield return phaseId;
            }
        }
    }

    private static IEnumerable<string> EnumeratePhaseFiles(UserStoryFilePaths paths, PhaseId phaseId)
    {
        if (phaseId == PhaseId.Clarification)
        {
            yield return paths.GetPhaseArtifactPath(PhaseId.Clarification);
            yield break;
        }

        if (phaseId is not (PhaseId.Refinement or PhaseId.TechnicalDesign or PhaseId.Implementation or PhaseId.Review))
        {
            yield break;
        }

        foreach (var stem in GetPhaseArtifactFileStems(phaseId))
        {
            var operationLogCandidate = Path.Combine(paths.PhasesDirectoryPath, $"{stem}.ops.md");
            yield return operationLogCandidate;

            for (var version = 1; version < 100; version++)
            {
                var versionSuffix = version <= 1 ? string.Empty : $".v{version:00}";
                yield return Path.Combine(paths.PhasesDirectoryPath, $"{stem}{versionSuffix}.md");
                yield return Path.Combine(paths.PhasesDirectoryPath, $"{stem}{versionSuffix}.json");
            }
        }
    }

    private static IReadOnlyList<string> GetPhaseArtifactFileStems(PhaseId phaseId) => phaseId switch
    {
        PhaseId.Refinement => ["01-spec", "01-refinement"],
        PhaseId.Clarification => ["00-clarification"],
        PhaseId.TechnicalDesign => ["02-technical-design"],
        PhaseId.Implementation => ["03-implementation"],
        PhaseId.Review => ["04-review"],
        _ => []
    };

    private static void RestoreTargetApprovalIfApplicable(
        WorkflowRun workflowRun,
        PhaseId targetPhase,
        bool destructive,
        bool targetPhaseWasApproved)
    {
        if (destructive || !targetPhaseWasApproved)
        {
            return;
        }

        workflowRun.RestoreApproval(targetPhase);
        if (workflowRun.Definition.RequiresApproval(targetPhase))
        {
            workflowRun.RestoreState(targetPhase, UserStoryStatus.Active);
        }
    }

    private static async Task AppendArtifactOperationEntryAsync(
        string operationLogPath,
        PhaseId phaseId,
        string actor,
        string sourceArtifactPath,
        string prompt,
        string generatedArtifactPath,
        CancellationToken cancellationToken)
    {
        var normalizedPrompt = prompt.Trim();
        if (string.IsNullOrWhiteSpace(normalizedPrompt))
        {
            throw new WorkflowDomainException("Artifact operation prompt cannot be empty.");
        }

        var timestamp = DateTimeOffset.UtcNow.ToString("O");
        if (!File.Exists(operationLogPath))
        {
            var header = string.Join(
                Environment.NewLine,
                new[]
                {
                    $"# Artifact Operation Log · {WorkflowPresentation.ToPhaseSlug(phaseId)}",
                    string.Empty,
                    "This file records direct model-assisted operations over the current artifact.",
                    string.Empty
                });
            await File.WriteAllTextAsync(operationLogPath, header, cancellationToken);
        }

        var builder = new StringBuilder()
            .AppendLine()
            .AppendLine($"## {timestamp} · `{actor}`")
            .AppendLine()
            .AppendLine($"- Source Artifact: `{sourceArtifactPath.Replace('\\', '/')}`")
            .AppendLine($"- Result Artifact: `{generatedArtifactPath.Replace('\\', '/')}`")
            .AppendLine("- Prompt:")
            .AppendLine("```text")
            .AppendLine(normalizedPrompt)
            .AppendLine("```");

        await File.AppendAllTextAsync(operationLogPath, builder.ToString(), cancellationToken);
    }

    private static async Task EnsureCurrentPhaseIsApprovableAsync(
        UserStoryFilePaths paths,
        PhaseId currentPhase,
        CancellationToken cancellationToken)
    {
        if (currentPhase != PhaseId.Refinement)
        {
            return;
        }

        var artifactPath = paths.GetLatestExistingPhaseArtifactPath(PhaseId.Refinement);
        if (artifactPath is null || !File.Exists(artifactPath))
        {
            throw new WorkflowDomainException("The spec baseline cannot be approved because `01-spec.md` does not exist.");
        }

        var markdown = await File.ReadAllTextAsync(artifactPath, cancellationToken);
        SpecBaselineSchemaValidator.EnsureValid(markdown);
    }

    private async Task<ContinuePhaseResult?> ValidateApprovedRefinementAsync(
        string workspaceRoot,
        UserStoryFilePaths paths,
        WorkflowRun workflowRun,
        string actor,
        CancellationToken cancellationToken)
    {
        if (!workflowRun.IsPhaseApproved(PhaseId.Refinement))
        {
            return null;
        }

        var sourceArtifactPath = paths.GetLatestExistingPhaseArtifactPath(PhaseId.Refinement)
            ?? throw new WorkflowDomainException("The approved refinement artifact does not exist.");
        var validationPrompt = BuildRefinementApprovalValidationPrompt();
        var generation = await MaterializePhaseArtifactAsync(
            workspaceRoot,
            paths,
            workflowRun,
            sourceArtifactPath,
            validationPrompt,
            cancellationToken);

        var generatedDocument = await LoadRefinementDocumentForArtifactAsync(paths, generation.ArtifactPath, cancellationToken);
        var unresolvedQuestions = RefinementSpecJson.GetUnresolvedQuestions(generatedDocument);

        if (unresolvedQuestions.Count == 0)
        {
            await AppendTimelineEventAsync(
                paths.TimelineFilePath,
                "refinement_validated",
                actor,
                workflowRun.CurrentPhase,
                "Validated the approved refinement baseline before advancing to technical design.",
                cancellationToken,
                generation.ArtifactPath,
                generation.Usage,
                generation.DurationMs,
                generation.Execution);
            return null;
        }

        workflowRun.ReopenCurrentPhaseApproval();
        await AppendTimelineEventAsync(
            paths.TimelineFilePath,
            "approval_questions_requested",
            actor,
            workflowRun.CurrentPhase,
            $"Refinement validation requested additional human approval input. Remaining questions: {string.Join(" | ", unresolvedQuestions)}.",
            cancellationToken,
            generation.ArtifactPath,
            generation.Usage,
            generation.DurationMs,
            generation.Execution);

        return new ContinuePhaseResult(
            workflowRun.UsId,
            workflowRun.CurrentPhase,
            workflowRun.Status,
            generation.ArtifactPath,
            generation.Usage,
            generation.Execution);
    }

    private sealed record ArtifactGenerationResult(string ArtifactPath, TokenUsage? Usage, long DurationMs, PhaseExecutionMetadata? Execution);
    private sealed record ClarificationAssessment(bool IsReady, string Reason, IReadOnlyCollection<string> Questions, string Summary);
    private sealed record CaptureTransitionResult(string ArtifactPath, TokenUsage? Usage, long DurationMs, PhaseExecutionMetadata? Execution);

    private static string BuildInitialTimeline(string usId, string title, string actor)
    {
        var timestamp = DateTimeOffset.UtcNow.ToString("O");
        return string.Join(
                   Environment.NewLine,
                   new[]
                   {
                       $"# Timeline · {usId} · {title}",
                       string.Empty,
                       "## Summary",
                       string.Empty,
                       "- Current status: `draft`",
                       "- Current phase: `capture`",
                       "- Active branch: `not created`",
                       $"- Last updated: `{timestamp}`",
                       string.Empty,
                       "## Events",
                       string.Empty,
                       $"### {timestamp} · `us_created`",
                       string.Empty,
                       $"- Actor: `{NormalizeActor(actor)}`",
                       "- Phase: `capture`",
                       "- Summary: The initial user story was created and `us.md`, `state.yaml`, and `timeline.md` were persisted."
                   }) +
               Environment.NewLine;
    }

    private static string NormalizeActor(string? actor) =>
        string.IsNullOrWhiteSpace(actor) ? "user" : actor.Trim();

    private static string BuildRefinementApprovalValidationPrompt() =>
        """
        Validate the approved refinement artifact against the recorded human approval answers.
        Preserve the section structure unless the artifact itself requires a structural correction.
        Review the answered decisions and determine whether the baseline is now strong enough to advance.

        Rules for the `## Human Approval Questions` section:
        - Keep only unresolved or newly discovered human approval questions.
        - For unresolved items use:
          - [ ] <question>
        - For resolved items use:
          - [x] <question>
            - Answer: <resolved answer>
        - If an answered question is sufficiently resolved, keep it marked as answered and do not ask it again.
        - If the answers reveal new approval gaps, rewrite the section with the new pending questions.
        """;

    private static string SummarizeQuestion(string question)
    {
        var trimmed = question.Trim();
        return trimmed.Length <= 120 ? trimmed : $"{trimmed[..117]}...";
    }

    private static int ExtractArtifactVersion(string artifactPath)
    {
        var fileName = Path.GetFileNameWithoutExtension(artifactPath);
        var markerIndex = fileName.LastIndexOf(".v", StringComparison.OrdinalIgnoreCase);
        if (markerIndex < 0)
        {
            return 1;
        }

        return int.TryParse(fileName[(markerIndex + 2)..], out var version) ? version : 1;
    }

    private static async Task<RefinementSpecDocument> LoadCurrentRefinementDocumentAsync(
        UserStoryFilePaths paths,
        CancellationToken cancellationToken)
    {
        var jsonPath = paths.GetLatestExistingPhaseArtifactJsonPath(PhaseId.Refinement);
        if (!string.IsNullOrWhiteSpace(jsonPath) && File.Exists(jsonPath))
        {
            return RefinementSpecJson.Parse(await File.ReadAllTextAsync(jsonPath, cancellationToken));
        }

        var markdownPath = paths.GetLatestExistingPhaseArtifactPath(PhaseId.Refinement)
            ?? throw new WorkflowDomainException("The refinement artifact does not exist yet.");
        return RefinementSpecMarkdownImporter.Import(await File.ReadAllTextAsync(markdownPath, cancellationToken));
    }

    private static async Task<RefinementSpecDocument> LoadRefinementDocumentForArtifactAsync(
        UserStoryFilePaths paths,
        string markdownPath,
        CancellationToken cancellationToken)
    {
        var version = ExtractArtifactVersion(markdownPath);
        var jsonPath = paths.GetPhaseArtifactJsonPath(PhaseId.Refinement, version);
        if (File.Exists(jsonPath))
        {
            return RefinementSpecJson.Parse(await File.ReadAllTextAsync(jsonPath, cancellationToken));
        }

        return RefinementSpecMarkdownImporter.Import(await File.ReadAllTextAsync(markdownPath, cancellationToken));
    }

    private static void EnsureMaterializedRefinementIsUsable(string markdown)
    {
        var validation = SpecBaselineSchemaValidator.Validate(markdown);
        if (validation.MissingSections.Count == 0 && validation.PlaceholderSections.Count == 0)
        {
            return;
        }

        var builder = new StringBuilder("The generated refinement artifact is unusable.");
        if (validation.MissingSections.Count > 0)
        {
            builder.Append(" Missing sections: ")
                .Append(string.Join(", ", validation.MissingSections))
                .Append('.');
        }

        if (validation.PlaceholderSections.Count > 0)
        {
            builder.Append(" Placeholder-only sections: ")
                .Append(string.Join(", ", validation.PlaceholderSections))
                .Append('.');
        }

        throw new WorkflowDomainException(builder.ToString());
    }

    private static string BuildUserStoryMarkdown(string usId, string title, string kind, string category, string sourceText)
    {
        return string.Join(
                   Environment.NewLine,
                   new[]
                   {
                       $"# {usId} · {title}",
                       string.Empty,
                       "## Metadata",
                       $"- Kind: `{kind}`",
                       $"- Category: `{category}`",
                       string.Empty,
                       "## Objective",
                       sourceText,
                       string.Empty,
                       "## Initial Scope",
                       "- Includes:",
                       "  - ...",
                       "- Excludes:",
                       "  - ..."
                   }) +
               Environment.NewLine;
    }

    internal static async Task<UserStoryMetadata> ReadUserStoryMetadataAsync(
        string userStoryPath,
        string usId,
        CancellationToken cancellationToken)
    {
        var userStory = await File.ReadAllTextAsync(userStoryPath, cancellationToken);
        var title = MarkdownHelper.ReadHeading(userStory, usId);
        var normalizedTitle = title.Replace($"{usId} · ", string.Empty, StringComparison.Ordinal)
            .Replace($"{usId} - ", string.Empty, StringComparison.Ordinal)
            .Trim();
        var kind = ReadUserStoryKind(userStory);
        var category = ReadUserStoryCategory(userStory);
        ValidateUserStoryKind(kind);
        return new UserStoryMetadata(normalizedTitle, kind, category);
    }

    private static string ComputeSourceHash(string sourceText)
    {
        var bytes = SHA256.HashData(Encoding.UTF8.GetBytes(sourceText));
        return $"sha256:{Convert.ToHexStringLower(bytes)}";
    }

    private static ClarificationAssessment ParseClarificationArtifact(string markdown)
    {
        var decision = MarkdownHelper.ReadSection(markdown, "## Decision").Trim();
        var reason = MarkdownHelper.ReadSection(markdown, "## Reason").Trim();
        var questionsSection = MarkdownHelper.ReadSection(markdown, "## Questions").Trim();
        var questions = DeduplicateClarificationQuestions(
            questionsSection
                .Split('\n', StringSplitOptions.RemoveEmptyEntries)
                .Select(static line => line.Trim())
                .Where(static line => line.Length > 0 && char.IsDigit(line[0]))
                .Select(static line =>
                {
                    var separator = line.IndexOf(". ", StringComparison.Ordinal);
                    return separator > 0 ? line[(separator + 2)..].Trim() : line;
                })
                .Where(static line => !string.Equals(line, "No clarification questions remain.", StringComparison.OrdinalIgnoreCase))
                .ToArray());
        var isReady = string.Equals(decision, "ready_for_refinement", StringComparison.OrdinalIgnoreCase);

        return new ClarificationAssessment(
            isReady,
            reason,
            questions,
            isReady
                ? "Clarification pre-flight passed. Advancing to refinement."
                : "Clarification questions were generated and recorded in `us.md`.");
    }

    private static IReadOnlyCollection<string> DeduplicateClarificationQuestions(IReadOnlyCollection<string> questions)
    {
        var deduplicated = new List<string>();
        var signatures = new List<HashSet<string>>();

        foreach (var question in questions)
        {
            var normalizedQuestion = NormalizeClarificationQuestion(question);
            if (string.IsNullOrWhiteSpace(normalizedQuestion))
            {
                continue;
            }

            var candidateSignature = BuildClarificationQuestionSignature(normalizedQuestion);
            var isDuplicate = false;

            for (var index = 0; index < deduplicated.Count; index++)
            {
                if (AreClarificationQuestionsEquivalent(
                    deduplicated[index],
                    signatures[index],
                    normalizedQuestion,
                    candidateSignature))
                {
                    isDuplicate = true;
                    break;
                }
            }

            if (!isDuplicate)
            {
                deduplicated.Add(normalizedQuestion);
                signatures.Add(candidateSignature);
            }
        }

        return deduplicated;
    }

    private static bool AreClarificationQuestionsEquivalent(
        string existingQuestion,
        HashSet<string> existingSignature,
        string candidateQuestion,
        HashSet<string> candidateSignature)
    {
        if (string.Equals(existingQuestion, candidateQuestion, StringComparison.OrdinalIgnoreCase))
        {
            return true;
        }

        if (existingSignature.Count == 0 || candidateSignature.Count == 0)
        {
            return false;
        }

        var overlap = existingSignature.Count(token => candidateSignature.Contains(token));
        if (overlap == 0)
        {
            return false;
        }

        var union = existingSignature.Count + candidateSignature.Count - overlap;
        var jaccard = union == 0 ? 0d : (double)overlap / union;
        var coverage = (double)overlap / Math.Min(existingSignature.Count, candidateSignature.Count);

        return overlap >= 4 && (jaccard >= 0.5d || coverage >= 0.75d);
    }

    private static string NormalizeClarificationQuestion(string question) =>
        Regex.Replace(question.Trim(), "\\s+", " ");

    private static HashSet<string> BuildClarificationQuestionSignature(string question)
    {
        var normalized = RemoveDiacritics(question).ToLowerInvariant();
        var rawTokens = Regex.Split(normalized, "[^a-z0-9]+");
        var tokens = new HashSet<string>(StringComparer.Ordinal);

        foreach (var rawToken in rawTokens)
        {
            var token = NormalizeClarificationQuestionToken(rawToken);
            if (token.Length < 3 || ClarificationQuestionStopWords.Contains(token))
            {
                continue;
            }

            tokens.Add(token);
        }

        return tokens;
    }

    private static string NormalizeClarificationQuestionToken(string token)
    {
        var normalized = token;

        if (normalized.EndsWith("ing", StringComparison.Ordinal) && normalized.Length > 5)
        {
            normalized = normalized[..^3];
        }
        else if (normalized.EndsWith("ed", StringComparison.Ordinal) && normalized.Length > 4)
        {
            normalized = normalized[..^2];
        }
        else if (normalized.EndsWith("es", StringComparison.Ordinal) && normalized.Length > 4)
        {
            normalized = normalized[..^2];
        }
        else if (normalized.EndsWith("s", StringComparison.Ordinal) && normalized.Length > 3)
        {
            normalized = normalized[..^1];
        }

        return normalized;
    }

    private static string RemoveDiacritics(string value)
    {
        var normalized = value.Normalize(NormalizationForm.FormD);
        var builder = new StringBuilder(normalized.Length);

        foreach (var character in normalized)
        {
            if (char.GetUnicodeCategory(character) == System.Globalization.UnicodeCategory.NonSpacingMark)
            {
                continue;
            }

            builder.Append(character);
        }

        return builder.ToString().Normalize(NormalizationForm.FormC);
    }

    private static async Task UpdateClarificationLogAsync(
        UserStoryFilePaths paths,
        ClarificationAssessment clarification,
        string captureTolerance,
        CancellationToken cancellationToken)
    {
        var existing = await ReadClarificationSessionAsync(paths, cancellationToken);
        var items = clarification.Questions
            .Select((question, index) => new ClarificationItem(
                index + 1,
                question,
                existing?.Items.FirstOrDefault(item => string.Equals(item.Question, question, StringComparison.Ordinal))?.Answer))
            .ToArray();
        var session = new ClarificationSession(
            clarification.IsReady ? "ready_for_refinement" : "needs_clarification",
            captureTolerance,
            clarification.Reason,
            items);
        await PersistClarificationSessionAsync(paths, session, cancellationToken);
    }

    private static async Task<ClarificationSession?> ReadClarificationSessionAsync(
        UserStoryFilePaths paths,
        CancellationToken cancellationToken)
    {
        if (File.Exists(paths.ClarificationFilePath))
        {
            var clarificationMarkdown = await File.ReadAllTextAsync(paths.ClarificationFilePath, cancellationToken);
            var session = UserStoryClarificationMarkdown.Parse(clarificationMarkdown);
            if (session is not null)
            {
                return session;
            }
        }

        if (!File.Exists(paths.MainArtifactPath))
        {
            return null;
        }

        var userStoryMarkdown = await File.ReadAllTextAsync(paths.MainArtifactPath, cancellationToken);
        return UserStoryClarificationMarkdown.Parse(userStoryMarkdown);
    }

    private static async Task PersistClarificationSessionAsync(
        UserStoryFilePaths paths,
        ClarificationSession session,
        CancellationToken cancellationToken)
    {
        Directory.CreateDirectory(paths.RootDirectory);
        await File.WriteAllTextAsync(paths.ClarificationFilePath, UserStoryClarificationMarkdown.Serialize(session), cancellationToken);

        if (File.Exists(paths.MainArtifactPath))
        {
            var userStoryMarkdown = await File.ReadAllTextAsync(paths.MainArtifactPath, cancellationToken);
            var cleaned = UserStoryClarificationMarkdown.Remove(userStoryMarkdown);
            await File.WriteAllTextAsync(paths.MainArtifactPath, cleaned, cancellationToken);
        }
    }

    private static void ValidateRequired(string value, string paramName)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            throw new ArgumentException($"{paramName} is required.", paramName);
        }
    }

    private static void ValidateUserStoryKind(string kind)
    {
        if (kind is not ("feature" or "bug" or "hotfix"))
        {
            throw new WorkflowDomainException($"Unsupported user story kind '{kind}'.");
        }
    }


    private static string ReadUserStoryKind(string markdown)
    {
        using var reader = new StringReader(markdown);
        string? line;
        while ((line = reader.ReadLine()) is not null)
        {
            var trimmed = line.Trim();
            if (!trimmed.StartsWith("- Kind:", StringComparison.OrdinalIgnoreCase))
            {
                continue;
            }

            var value = trimmed["- Kind:".Length..].Trim().Trim('`').ToLowerInvariant();
            return string.IsNullOrWhiteSpace(value) ? "feature" : value;
        }

        return "feature";
    }

    private static string ReadUserStoryCategory(string markdown)
    {
        using var reader = new StringReader(markdown);
        string? line;
        while ((line = reader.ReadLine()) is not null)
        {
            var trimmed = line.Trim();
            if (!trimmed.StartsWith("- Category:", StringComparison.OrdinalIgnoreCase))
            {
                continue;
            }

            var value = trimmed["- Category:".Length..].Trim().Trim('`').ToLowerInvariant();
            return string.IsNullOrWhiteSpace(value) ? "uncategorized" : value;
        }

        return "uncategorized";
    }

    private static string BuildWorkBranchName(string usId, string title, string kind)
    {
        var normalizedUsId = usId.ToLowerInvariant();
        var normalizedKind = kind.ToLowerInvariant();
        var slug = BuildShortSlug(title);
        slug = StripDuplicatePrefix(slug, normalizedKind);
        slug = StripDuplicatePrefix(slug, normalizedUsId);
        slug = StripDuplicatePrefix(slug, normalizedKind);

        if (string.IsNullOrWhiteSpace(slug))
        {
            slug = "work";
        }

        return $"{normalizedKind}/{normalizedUsId}-{slug}";
    }

    private static string StripDuplicatePrefix(string slug, string prefix)
    {
        if (string.IsNullOrWhiteSpace(slug) || string.IsNullOrWhiteSpace(prefix))
        {
            return slug;
        }

        var nextSlug = slug;
        while (string.Equals(nextSlug, prefix, StringComparison.Ordinal) ||
               nextSlug.StartsWith(prefix + "-", StringComparison.Ordinal))
        {
            nextSlug = string.Equals(nextSlug, prefix, StringComparison.Ordinal)
                ? string.Empty
                : nextSlug[(prefix.Length + 1)..];
        }

        return nextSlug;
    }

    private static string BuildShortSlug(string title)
    {
        var normalized = title.Normalize(NormalizationForm.FormD);
        var builder = new StringBuilder(normalized.Length);

        foreach (var character in normalized)
        {
            if (char.GetUnicodeCategory(character) == System.Globalization.UnicodeCategory.NonSpacingMark)
            {
                continue;
            }

            builder.Append(character);
        }

        var ascii = builder.ToString().Normalize(NormalizationForm.FormC).ToLowerInvariant();
        ascii = System.Text.RegularExpressions.Regex.Replace(ascii, @"[^a-z0-9]+", "-");
        ascii = System.Text.RegularExpressions.Regex.Replace(ascii, @"-+", "-").Trim('-');

        if (string.IsNullOrWhiteSpace(ascii))
        {
            return "work-item";
        }

        return ascii.Length <= 48 ? ascii : ascii[..48].Trim('-');
    }

    internal sealed record UserStoryMetadata(string Title, string Kind, string Category);
}
