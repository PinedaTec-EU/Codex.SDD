using System.Diagnostics;
using System.Text;
using System.Security.Cryptography;
using System.Text.RegularExpressions;
using SpecForge.Domain.Persistence;
using SpecForge.Domain.Workflow;

namespace SpecForge.Domain.Application;

public sealed class WorkflowRunner
{
    private const string ReadyForSpecDecision = "ready_for_spec";
    private const string NoRefinementQuestionsRemain = "No refinement questions remain.";

    private static readonly HashSet<string> RefinementQuestionStopWords =
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
    private readonly IWorkBranchManager workBranchManager;
    private readonly IPullRequestPublisher pullRequestPublisher;
    private readonly IPullRequestInvalidator pullRequestInvalidator;
    private readonly string refinementTolerance;
    private readonly string? runtimeVersion;
    private readonly bool completedUsLockOnCompleted;

    public WorkflowRunner()
        : this(new UserStoryFileStore(), new DeterministicPhaseExecutionProvider(), new RepositoryCategoryCatalog(), new GitWorkBranchManager(), new GitHubPullRequestPublisher(), null, null)
    {
    }

    public WorkflowRunner(IPhaseExecutionProvider phaseExecutionProvider, string refinementTolerance = "balanced")
        : this(new UserStoryFileStore(), phaseExecutionProvider, new RepositoryCategoryCatalog(), new GitWorkBranchManager(), new GitHubPullRequestPublisher(), null, null, refinementTolerance)
    {
    }

    public WorkflowRunner(IPhaseExecutionProvider phaseExecutionProvider, string? runtimeVersion, string refinementTolerance)
        : this(new UserStoryFileStore(), phaseExecutionProvider, new RepositoryCategoryCatalog(), new GitWorkBranchManager(), new GitHubPullRequestPublisher(), null, runtimeVersion, refinementTolerance)
    {
    }

    public WorkflowRunner(IPhaseExecutionProvider phaseExecutionProvider, string? runtimeVersion, string refinementTolerance, bool completedUsLockOnCompleted)
        : this(new UserStoryFileStore(), phaseExecutionProvider, new RepositoryCategoryCatalog(), new GitWorkBranchManager(), new GitHubPullRequestPublisher(), null, runtimeVersion, refinementTolerance, completedUsLockOnCompleted)
    {
    }

    internal WorkflowRunner(
        UserStoryFileStore fileStore,
        IPhaseExecutionProvider phaseExecutionProvider,
        RepositoryCategoryCatalog? repositoryCategoryCatalog = null,
        IWorkBranchManager? workBranchManager = null,
        IPullRequestPublisher? pullRequestPublisher = null,
        IPullRequestInvalidator? pullRequestInvalidator = null,
        string? runtimeVersion = null,
        string refinementTolerance = "balanced",
        bool completedUsLockOnCompleted = true)
    {
        this.fileStore = fileStore ?? throw new ArgumentNullException(nameof(fileStore));
        this.phaseExecutionProvider = phaseExecutionProvider ?? throw new ArgumentNullException(nameof(phaseExecutionProvider));
        this.repositoryCategoryCatalog = repositoryCategoryCatalog ?? new RepositoryCategoryCatalog();
        this.workBranchManager = workBranchManager ?? new GitWorkBranchManager();
        this.pullRequestPublisher = pullRequestPublisher ?? new GitHubPullRequestPublisher();
        this.pullRequestInvalidator = pullRequestInvalidator
            ?? this.pullRequestPublisher as IPullRequestInvalidator
            ?? new NoOpPullRequestInvalidator();
        this.runtimeVersion = string.IsNullOrWhiteSpace(runtimeVersion) ? null : runtimeVersion.Trim();
        this.refinementTolerance = refinementTolerance is "strict" or "balanced" or "inferential" ? refinementTolerance : "balanced";
        this.completedUsLockOnCompleted = completedUsLockOnCompleted;
    }

    public PhaseExecutionReadiness GetPhaseExecutionReadiness(PhaseId phaseId) =>
        phaseExecutionProvider.GetPhaseExecutionReadiness(phaseId);

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

        var workflowRun = new WorkflowRun(usId, ComputeSourceHash(sourceText), WorkflowDefinition.CanonicalV1, runtimeVersion);

        await File.WriteAllTextAsync(paths.MainArtifactPath, BuildUserStoryMarkdown(usId, title, kind, category, sourceText), cancellationToken);
        await File.WriteAllTextAsync(paths.TimelineFilePath, BuildInitialTimeline(usId, title, actor, runtimeVersion), cancellationToken);
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
        await TrackRuntimeVersionChangeAsync(paths, workflowRun, NormalizeActor(actor), workflowRun.CurrentPhase, cancellationToken);
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

        WorkBranchCreationResult? branchCreation = null;
        if (branchWasMissing && workflowRun.Branch is not null && workflowRun.CurrentPhase == PhaseId.Spec)
        {
            SpecForgeDiagnostics.Log(
                $"[runner.approve_phase] usId={usId} validating base='{workflowRun.Branch.BaseBranch}' before creating work branch '{workflowRun.Branch.WorkBranchName}'.");
            branchCreation = await workBranchManager.CreateBranchAsync(
                workspaceRoot,
                workflowRun.Branch.BaseBranch,
                workflowRun.Branch.WorkBranchName,
                cancellationToken);
            SpecForgeDiagnostics.Log(
                $"[runner.approve_phase] usId={usId} branch result gitWorkspace={branchCreation.IsGitWorkspace} created={branchCreation.BranchCreated} currentBranch='{branchCreation.CurrentBranch ?? "(none)"}' upstream='{branchCreation.UpstreamBranch ?? "(none)"}'.");
        }

        await fileStore.SaveAsync(workflowRun, paths.RootDirectory, cancellationToken);
        await AppendTimelineEventAsync(
            paths.TimelineFilePath,
            "phase_approved",
            NormalizeActor(actor),
            workflowRun.CurrentPhase,
            $"Phase `{WorkflowPresentation.ToPhaseSlug(workflowRun.CurrentPhase)}` approved.",
            cancellationToken);

        if (branchWasMissing && workflowRun.Branch is not null && workflowRun.CurrentPhase == PhaseId.Spec)
        {
            if (branchCreation?.BranchCreated == true)
            {
                await AppendTimelineEventAsync(
                    paths.TimelineFilePath,
                    "branch_created",
                    "system",
                    workflowRun.CurrentPhase,
                    $"Created branch `{workflowRun.Branch.WorkBranchName}` from `{workflowRun.Branch.BaseBranch}`.",
                    cancellationToken);
            }
            else if (branchCreation?.IsGitWorkspace == false)
            {
                await AppendTimelineEventAsync(
                    paths.TimelineFilePath,
                    "branch_recorded",
                    "system",
                    workflowRun.CurrentPhase,
                    $"Recorded branch `{workflowRun.Branch.WorkBranchName}` from `{workflowRun.Branch.BaseBranch}` in workflow metadata because the workspace is not a Git repository.",
                    cancellationToken);
            }
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
        if (workflowRun.CurrentPhase != PhaseId.Spec)
        {
            throw new WorkflowDomainException("Approval answers can only be recorded while the workflow is in the spec phase.");
        }

        var currentArtifactPath = paths.GetLatestExistingPhaseArtifactPath(PhaseId.Spec)
            ?? throw new WorkflowDomainException("The spec artifact does not exist yet.");
        var answeredAtUtc = DateTimeOffset.UtcNow;
        var normalizedActor = NormalizeActor(actor);
        var currentDocument = await LoadCurrentSpecDocumentAsync(paths, cancellationToken);
        var updatedDocument = SpecJson.ApplyApprovalAnswer(
            currentDocument,
            question.Trim(),
            answer.Trim(),
            normalizedActor,
            answeredAtUtc);

        var generatedArtifactPath = NextAvailableArtifactPath(paths, PhaseId.Spec);
        var generatedVersion = ExtractArtifactVersion(generatedArtifactPath);
        var generatedArtifactJsonPath = paths.GetPhaseArtifactJsonPath(PhaseId.Spec, generatedVersion);
        await File.WriteAllTextAsync(generatedArtifactJsonPath, SpecJson.Serialize(updatedDocument), cancellationToken);
        await File.WriteAllTextAsync(generatedArtifactPath, SpecJson.RenderMarkdown(updatedDocument, workflowRun.UsId, generatedVersion), cancellationToken);

        if (workflowRun.IsPhaseApproved(PhaseId.Spec))
        {
            workflowRun.ReopenCurrentPhaseApproval();
            await fileStore.SaveAsync(workflowRun, paths.RootDirectory, cancellationToken);
        }

        await AppendTimelineEventAsync(
            paths.TimelineFilePath,
            "approval_answer_recorded",
            normalizedActor,
            workflowRun.CurrentPhase,
            $"Recorded human approval answer for spec question `{SummarizeQuestion(question)}`.",
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
        EnsureCompletedWorkflowIsUnlockedForDirectMutation(workflowRun, "Regression");
        await TrackRuntimeVersionChangeAsync(paths, workflowRun, NormalizeActor(actor), workflowRun.CurrentPhase, cancellationToken);
        var targetPhaseWasApproved = workflowRun.IsPhaseApproved(targetPhase);
        if (destructive)
        {
            await RewindDerivedArtifactsAsync(paths, workflowRun.CurrentPhase, targetPhase, workflowRun.Branch is not null, cancellationToken);
            if (targetPhase <= PhaseId.Spec && workflowRun.Branch is not null)
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

    public async Task<ContinuePhaseResult> ApproveReviewAnywayAsync(
        string workspaceRoot,
        string usId,
        string reason,
        string actor = "user",
        CancellationToken cancellationToken = default)
    {
        ValidateRequired(reason, nameof(reason));
        var paths = UserStoryFilePaths.ResolveFromWorkspaceRoot(workspaceRoot, usId);
        var workflowRun = await fileStore.LoadAsync(paths.RootDirectory, cancellationToken);
        if (workflowRun.CurrentPhase != PhaseId.Review)
        {
            throw new WorkflowDomainException("Approve anyway is only supported while the workflow is in the review phase.");
        }

        workflowRun.GenerateNextPhase();
        await fileStore.SaveAsync(workflowRun, paths.RootDirectory, cancellationToken);
        await AppendTimelineEventAsync(
            paths.TimelineFilePath,
            "review_force_approved",
            NormalizeActor(actor),
            workflowRun.CurrentPhase,
            $"User forced the workflow past review into `release-approval`. Reason: {reason.Trim()}.",
            cancellationToken);

        return new ContinuePhaseResult(
            workflowRun.UsId,
            workflowRun.CurrentPhase,
            workflowRun.Status,
            GeneratedArtifactPath: null,
            Usage: null,
            Execution: null);
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
        await TrackRuntimeVersionChangeAsync(paths, existingRun, NormalizeActor(actor), existingRun.CurrentPhase, cancellationToken);

        if (existingRun.CurrentPhase == PhaseId.Capture)
        {
            throw new WorkflowDomainException("Restart is not allowed before spec has started.");
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
        var regeneration = await ContinueFromCaptureOrRefinementAsync(workspaceRoot, paths, restartedRun, normalizedActor, cancellationToken);
        var generatedArtifactPath = regeneration.ArtifactPath;
        await fileStore.SaveAsync(restartedRun, paths.RootDirectory, cancellationToken);

        await AppendTimelineEventAsync(
            paths.TimelineFilePath,
            "source_hash_mismatch_detected",
            normalizedActor,
            restartedRun.CurrentPhase,
            $"Detected source change. Previous hash `{existingRun.SourceHash}` differs from current hash `{currentSourceHash}`.",
            cancellationToken);

        var summary = restartedRun.CurrentPhase == PhaseId.Spec
            ? "Restarted workflow from the updated source and regenerated spec."
            : "Restarted workflow from the updated source and requested refinement before spec.";
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
        await TrackRuntimeVersionChangeAsync(paths, existingRun, "system", existingRun.CurrentPhase, cancellationToken);
        var metadata = await ReadUserStoryMetadataAsync(paths.MainArtifactPath, usId, cancellationToken);
        var currentSourceText = await ReadSourceTextFromUserStoryAsync(paths.MainArtifactPath, cancellationToken);
        var currentSourceHash = ComputeSourceHash(currentSourceText);

        var deletedPaths = await ResetDerivedArtifactsAsync(paths, existingRun, cancellationToken);

        var cleanedUserStory = UserStoryRefinementMarkdown.Remove(
            await File.ReadAllTextAsync(paths.MainArtifactPath, cancellationToken));
        await File.WriteAllTextAsync(paths.MainArtifactPath, cleanedUserStory, cancellationToken);
        await File.WriteAllTextAsync(paths.TimelineFilePath, BuildInitialTimeline(usId, metadata.Title, "system", runtimeVersion), cancellationToken);

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
        EnsureCompletedWorkflowIsUnlockedForDirectMutation(workflowRun, "Rewind");
        await TrackRuntimeVersionChangeAsync(paths, workflowRun, NormalizeActor(actor), workflowRun.CurrentPhase, cancellationToken);
        ValidateRewindTarget(workflowRun, targetPhase);
        var timelineEvents = File.Exists(paths.TimelineFilePath)
            ? TimelineMarkdownParser.ParseEvents(await File.ReadAllTextAsync(paths.TimelineFilePath, cancellationToken))
            : Array.Empty<TimelineEventDetails>();
        WorkflowRewindPolicy.EnsureCanRewind(workflowRun, targetPhase, timelineEvents);
        var targetPhaseWasApproved = workflowRun.IsPhaseApproved(targetPhase);

        IReadOnlyCollection<string> deletedPaths = [];
        if (destructive)
        {
            deletedPaths = await RewindDerivedArtifactsAsync(paths, workflowRun.CurrentPhase, targetPhase, workflowRun.Branch is not null, cancellationToken);
        }

        workflowRun.RewindToPhase(targetPhase);
        RestoreTargetApprovalIfApplicable(workflowRun, targetPhase, destructive, targetPhaseWasApproved);

        var pullRequestInvalidationSummary = await InvalidatePublishedPullRequestIfNeededAsync(
            workspaceRoot,
            paths,
            workflowRun,
            targetPhase,
            NormalizeActor(actor),
            "workflow rewind",
            cancellationToken);

        if (destructive && targetPhase <= PhaseId.Spec && workflowRun.Branch is not null)
        {
            workflowRun.RemoveBranch();
        }

        await fileStore.SaveAsync(workflowRun, paths.RootDirectory, cancellationToken);

        await AppendTimelineEventAsync(
            paths.TimelineFilePath,
            "workflow_rewound",
            NormalizeActor(actor),
            workflowRun.CurrentPhase,
            AppendPullRequestInvalidationSummary(
                destructive
                ? BuildFileDeletionSummary(
                    $"Rewound the workflow to phase `{WorkflowPresentation.ToPhaseSlug(targetPhase)}`.",
                    deletedPaths)
                : $"Rewound the workflow to phase `{WorkflowPresentation.ToPhaseSlug(targetPhase)}` without deleting later artifacts.",
                pullRequestInvalidationSummary),
            cancellationToken);

        return new RewindWorkflowResult(
            workflowRun.UsId,
            WorkflowPresentation.ToStatusSlug(workflowRun.Status),
            WorkflowPresentation.ToPhaseSlug(workflowRun.CurrentPhase),
            deletedPaths,
            destructive ? BuildRewindPreservedPaths(paths, targetPhase) : BuildNonDestructiveRewindPreservedPaths(paths));
    }

    public async Task<RequestRegressionResult> ReopenCompletedWorkflowAsync(
        string workspaceRoot,
        string usId,
        PhaseId targetPhase,
        string reasonKind,
        string description,
        string actor = "user",
        CancellationToken cancellationToken = default)
    {
        ValidateRequired(reasonKind, nameof(reasonKind));
        ValidateRequired(description, nameof(description));
        var paths = UserStoryFilePaths.ResolveFromWorkspaceRoot(workspaceRoot, usId);
        var workflowRun = await fileStore.LoadAsync(paths.RootDirectory, cancellationToken);
        await TrackRuntimeVersionChangeAsync(paths, workflowRun, NormalizeActor(actor), workflowRun.CurrentPhase, cancellationToken);

        if (workflowRun.Status != UserStoryStatus.Completed)
        {
            throw new WorkflowDomainException("Only completed workflows can be reopened.");
        }

        ValidateRewindTarget(workflowRun, targetPhase);
        workflowRun.RewindToPhase(targetPhase);
        var pullRequestInvalidationSummary = await InvalidatePublishedPullRequestIfNeededAsync(
            workspaceRoot,
            paths,
            workflowRun,
            targetPhase,
            NormalizeActor(actor),
            "completed workflow reopen",
            cancellationToken);
        await fileStore.SaveAsync(workflowRun, paths.RootDirectory, cancellationToken);

        await AppendTimelineEventAsync(
            paths.TimelineFilePath,
            "workflow_reopened",
            NormalizeActor(actor),
            workflowRun.CurrentPhase,
            AppendPullRequestInvalidationSummary(
                $"Reopened completed workflow due to `{reasonKind.Trim()}` and returned it to phase `{WorkflowPresentation.ToPhaseSlug(targetPhase)}`. Details: {description.Trim()}.",
                pullRequestInvalidationSummary),
            cancellationToken);

        return new RequestRegressionResult(
            workflowRun.UsId,
            WorkflowPresentation.ToStatusSlug(workflowRun.Status),
            WorkflowPresentation.ToPhaseSlug(workflowRun.CurrentPhase));
    }

    public async Task<WorkflowLineageRepairResult> RepairUserStoryLineageAsync(
        string workspaceRoot,
        string usId,
        string actor = "user",
        CancellationToken cancellationToken = default)
    {
        var paths = UserStoryFilePaths.ResolveFromWorkspaceRoot(workspaceRoot, usId);
        var rawTimeline = File.Exists(paths.TimelineFilePath)
            ? await File.ReadAllTextAsync(paths.TimelineFilePath, cancellationToken)
            : string.Empty;
        var analysis = WorkflowLineageAnalyzer.Analyze(usId, paths, TimelineMarkdownParser.ParseEvents(rawTimeline));
        if (analysis.Status != "inconsistent" ||
            analysis.DeprecatedCandidatePaths.Count == 0 ||
            string.IsNullOrWhiteSpace(analysis.RecommendedTargetPhase))
        {
            var currentRun = await fileStore.LoadAsync(paths.RootDirectory, cancellationToken);
            return new WorkflowLineageRepairResult(
                currentRun.UsId,
                WorkflowPresentation.ToStatusSlug(currentRun.Status),
                WorkflowPresentation.ToPhaseSlug(currentRun.CurrentPhase),
                string.Empty,
                [],
                analysis);
        }

        var targetPhase = WorkflowPresentation.ParsePhaseSlug(analysis.RecommendedTargetPhase);
        var workflowRun = await fileStore.LoadAsync(paths.RootDirectory, cancellationToken);
        if (workflowRun.CurrentPhase != targetPhase)
        {
            if (targetPhase >= workflowRun.CurrentPhase)
            {
                workflowRun.RestoreState(targetPhase, workflowRun.Definition.RequiresApproval(targetPhase)
                    ? UserStoryStatus.WaitingUser
                    : UserStoryStatus.Active);
            }
            else
            {
                workflowRun.RewindToPhase(targetPhase);
            }
        }
        else if (workflowRun.Status == UserStoryStatus.Completed)
        {
            workflowRun.RestoreState(targetPhase, workflowRun.Definition.RequiresApproval(targetPhase)
                ? UserStoryStatus.WaitingUser
                : UserStoryStatus.Active);
        }

        var archiveDirectoryPath = Path.Combine(
            paths.RootDirectory,
            "deprecated",
            DateTimeOffset.UtcNow.UtcDateTime.ToString("yyyyMMdd'T'HHmmss'Z'") + "-lineage-repair");
        var archivedPaths = ArchiveLineageCandidates(paths, archiveDirectoryPath, analysis.DeprecatedCandidatePaths);
        var pullRequestInvalidationSummary = await InvalidatePublishedPullRequestIfNeededAsync(
            workspaceRoot,
            paths,
            workflowRun,
            targetPhase,
            NormalizeActor(actor),
            "lineage repair",
            cancellationToken);

        await fileStore.SaveAsync(workflowRun, paths.RootDirectory, cancellationToken);
        await AppendTimelineEventAsync(
            paths.TimelineFilePath,
            "workflow_repaired",
            NormalizeActor(actor),
            workflowRun.CurrentPhase,
            AppendPullRequestInvalidationSummary(
                $"Deprecated {archivedPaths.Count} inconsistent artifact(s) and returned workflow to phase `{WorkflowPresentation.ToPhaseSlug(workflowRun.CurrentPhase)}`.",
                pullRequestInvalidationSummary),
            cancellationToken,
            archivedPaths);

        var repairedTimeline = File.Exists(paths.TimelineFilePath)
            ? await File.ReadAllTextAsync(paths.TimelineFilePath, cancellationToken)
            : string.Empty;
        var repairedAnalysis = WorkflowLineageAnalyzer.Analyze(usId, paths, TimelineMarkdownParser.ParseEvents(repairedTimeline));
        return new WorkflowLineageRepairResult(
            workflowRun.UsId,
            WorkflowPresentation.ToStatusSlug(workflowRun.Status),
            WorkflowPresentation.ToPhaseSlug(workflowRun.CurrentPhase),
            archiveDirectoryPath,
            archivedPaths,
            repairedAnalysis);
    }

    public async Task<ContinuePhaseResult> ContinuePhaseAsync(
        string workspaceRoot,
        string usId,
        string actor = "user",
        CancellationToken cancellationToken = default)
    {
        await using var diagnostics = SpecForgeDiagnostics.StartProgressScope(
            $"[runner.continue_phase] usId={usId} actor={actor}",
            interval: TimeSpan.FromSeconds(20));
        var paths = UserStoryFilePaths.ResolveFromWorkspaceRoot(workspaceRoot, usId);
        var workflowRun = await fileStore.LoadAsync(paths.RootDirectory, cancellationToken);
        var normalizedActor = NormalizeActor(actor);
        await TrackRuntimeVersionChangeAsync(paths, workflowRun, normalizedActor, workflowRun.CurrentPhase, cancellationToken);
        SpecForgeDiagnostics.Log(
            $"[runner.continue_phase] usId={usId} loaded phase={WorkflowPresentation.ToPhaseSlug(workflowRun.CurrentPhase)} status={WorkflowPresentation.ToStatusSlug(workflowRun.Status)}");

        if (workflowRun.CurrentPhase is PhaseId.Capture or PhaseId.Refinement)
        {
            var refinementResult = await ContinueFromCaptureOrRefinementAsync(workspaceRoot, paths, workflowRun, normalizedActor, cancellationToken);
            await fileStore.SaveAsync(workflowRun, paths.RootDirectory, cancellationToken);
            diagnostics.MarkCompleted(
                $"phase={WorkflowPresentation.ToPhaseSlug(workflowRun.CurrentPhase)} status={WorkflowPresentation.ToStatusSlug(workflowRun.Status)}");
            return new ContinuePhaseResult(
                workflowRun.UsId,
                workflowRun.CurrentPhase,
                workflowRun.Status,
                refinementResult.ArtifactPath,
                refinementResult.Usage,
                refinementResult.Execution);
        }

        if (workflowRun.CurrentPhase == PhaseId.Review &&
            await ShouldReplayCurrentReviewAsync(paths, cancellationToken))
        {
            var reviewReadiness = phaseExecutionProvider.GetPhaseExecutionReadiness(PhaseId.Review);
            if (!reviewReadiness.CanExecute)
            {
                throw new WorkflowDomainException(
                    $"Phase '{WorkflowPresentation.ToPhaseSlug(PhaseId.Review)}' cannot run because '{reviewReadiness.BlockingReason ?? "phase_execution_not_ready"}'.");
            }

            var replayPending = IsReviewReplayPending(paths);
            SpecForgeDiagnostics.Log(
                replayPending
                    ? $"[runner.continue_phase] usId={usId} replaying current review phase after rewind."
                    : $"[runner.continue_phase] usId={usId} replaying current review phase after failed or incomplete review.");
            var reviewGeneration = await MaterializePhaseArtifactAsync(
                workspaceRoot,
                paths,
                workflowRun,
                currentArtifactPath: null,
                operationPrompt: null,
                includeReviewArtifactInContext: true,
                cancellationToken);
            await AppendTimelineEventAsync(
                paths.TimelineFilePath,
                "phase_completed",
                normalizedActor,
                workflowRun.CurrentPhase,
                replayPending
                    ? "Regenerated artifact for phase `review` after workflow rewind."
                    : "Regenerated artifact for phase `review` after a failed or incomplete review.",
                cancellationToken,
                reviewGeneration.ArtifactPath,
                reviewGeneration.Usage,
                reviewGeneration.DurationMs,
                reviewGeneration.Execution);
            await fileStore.SaveAsync(workflowRun, paths.RootDirectory, cancellationToken);
            diagnostics.MarkCompleted(
                $"phase={WorkflowPresentation.ToPhaseSlug(workflowRun.CurrentPhase)} status={WorkflowPresentation.ToStatusSlug(workflowRun.Status)} artifact={reviewGeneration.ArtifactPath}");

            return new ContinuePhaseResult(
                workflowRun.UsId,
                workflowRun.CurrentPhase,
                workflowRun.Status,
                reviewGeneration.ArtifactPath,
                reviewGeneration.Usage,
                reviewGeneration.Execution);
        }

        var pendingReopen = await TryReadPendingCompletedWorkflowReopenAsync(paths, workflowRun.CurrentPhase, cancellationToken);
        if (pendingReopen is not null && HasArtifact(workflowRun.CurrentPhase))
        {
            var sourceArtifactPath = paths.GetLatestExistingPhaseArtifactPath(workflowRun.CurrentPhase)
                ?? throw new WorkflowDomainException(
                    $"Phase '{WorkflowPresentation.ToPhaseSlug(workflowRun.CurrentPhase)}' does not yet have a current artifact to operate on after completed-workflow reopen.");
            var operationPrompt = BuildCompletedWorkflowReopenOperationPrompt(workflowRun.CurrentPhase, pendingReopen.Summary);
            SpecForgeDiagnostics.Log(
                $"[runner.continue_phase] usId={usId} materializing reopened phase {WorkflowPresentation.ToPhaseSlug(workflowRun.CurrentPhase)} from workflow_reopened event at {pendingReopen.TimestampUtc}.");
            var reopenGeneration = await MaterializePhaseArtifactAsync(
                workspaceRoot,
                paths,
                workflowRun,
                sourceArtifactPath,
                operationPrompt,
                includeReviewArtifactInContext: true,
                cancellationToken);
            var operationLogPath = paths.GetPhaseOperationLogPath(workflowRun.CurrentPhase);
            var contextArtifactPaths = ResolveOperationContextArtifactPaths(paths, workflowRun.CurrentPhase, includeReviewArtifactInContext: true);
            await AppendArtifactOperationEntryAsync(
                operationLogPath,
                workflowRun.CurrentPhase,
                normalizedActor,
                sourceArtifactPath,
                operationPrompt,
                reopenGeneration.ArtifactPath,
                contextArtifactPaths,
                cancellationToken);
            await AppendTimelineEventAsync(
                paths.TimelineFilePath,
                "artifact_operated",
                normalizedActor,
                workflowRun.CurrentPhase,
                $"Applied completed-workflow reopen note to phase `{WorkflowPresentation.ToPhaseSlug(workflowRun.CurrentPhase)}` and produced `{Path.GetFileName(reopenGeneration.ArtifactPath)}`.",
                cancellationToken,
                [operationLogPath, reopenGeneration.ArtifactPath],
                reopenGeneration.Usage,
                reopenGeneration.DurationMs,
                reopenGeneration.Execution);
            await fileStore.SaveAsync(workflowRun, paths.RootDirectory, cancellationToken);
            diagnostics.MarkCompleted(
                $"phase={WorkflowPresentation.ToPhaseSlug(workflowRun.CurrentPhase)} status={WorkflowPresentation.ToStatusSlug(workflowRun.Status)} artifact={reopenGeneration.ArtifactPath}");

            return new ContinuePhaseResult(
                workflowRun.UsId,
                workflowRun.CurrentPhase,
                workflowRun.Status,
                reopenGeneration.ArtifactPath,
                reopenGeneration.Usage,
                reopenGeneration.Execution);
        }

        if (workflowRun.CurrentPhase == PhaseId.PrPreparation)
        {
            var publicationArtifactPath = await PublishPullRequestAsync(workspaceRoot, paths, workflowRun, normalizedActor, cancellationToken);
            await fileStore.SaveAsync(workflowRun, paths.RootDirectory, cancellationToken);
            diagnostics.MarkCompleted(
                $"phase={WorkflowPresentation.ToPhaseSlug(workflowRun.CurrentPhase)} status={WorkflowPresentation.ToStatusSlug(workflowRun.Status)} artifact={publicationArtifactPath}");
            return new ContinuePhaseResult(
                workflowRun.UsId,
                workflowRun.CurrentPhase,
                workflowRun.Status,
                publicationArtifactPath,
                null,
                null);
        }

        EnsureNextPhaseExecutionIsReady(workflowRun);
        var sourcePhase = workflowRun.CurrentPhase;
        workflowRun.GenerateNextPhase();
        SpecForgeDiagnostics.Log(
            $"[runner.continue_phase] usId={usId} advanced phase {WorkflowPresentation.ToPhaseSlug(sourcePhase)} -> {WorkflowPresentation.ToPhaseSlug(workflowRun.CurrentPhase)}");
        await fileStore.SaveAsync(workflowRun, paths.RootDirectory, cancellationToken);
        SpecForgeDiagnostics.Log(
            $"[runner.continue_phase] usId={usId} persisted advanced phase {WorkflowPresentation.ToPhaseSlug(workflowRun.CurrentPhase)} before materialization.");

        string? artifactPath = null;
        TokenUsage? usage = null;
        long? durationMs = null;
        PhaseExecutionMetadata? execution = null;
        if (HasArtifact(workflowRun.CurrentPhase))
        {
            var generation = await MaterializePhaseArtifactAsync(workspaceRoot, paths, workflowRun, currentArtifactPath: null, operationPrompt: null, includeReviewArtifactInContext: true, cancellationToken);
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
        diagnostics.MarkCompleted(
            $"phase={WorkflowPresentation.ToPhaseSlug(workflowRun.CurrentPhase)} status={WorkflowPresentation.ToStatusSlug(workflowRun.Status)} artifact={(artifactPath ?? "(none)")}");
        return new ContinuePhaseResult(workflowRun.UsId, workflowRun.CurrentPhase, workflowRun.Status, artifactPath, usage, execution);
    }

    private async Task<string> PublishPullRequestAsync(
        string workspaceRoot,
        UserStoryFilePaths paths,
        WorkflowRun workflowRun,
        string actor,
        CancellationToken cancellationToken)
    {
        var artifactJsonPath = paths.GetLatestExistingPhaseArtifactJsonPath(PhaseId.PrPreparation)
            ?? throw new WorkflowDomainException("PR preparation requires a generated JSON artifact before publication.");
        if (!File.Exists(artifactJsonPath))
        {
            throw new WorkflowDomainException("PR preparation requires a generated JSON artifact before publication.");
        }

        var artifactPath = paths.GetLatestExistingPhaseArtifactPath(PhaseId.PrPreparation)
            ?? throw new WorkflowDomainException("PR preparation requires a generated markdown artifact before publication.");
        var document = PrPreparationArtifactJson.ParseCanonicalJson(await File.ReadAllTextAsync(artifactJsonPath, cancellationToken));
        EnsurePrPreparationArtifactIsPublishable(document);

        var branch = workflowRun.Branch
            ?? throw new WorkflowDomainException("PR preparation requires branch metadata before publication.");
        if (branch.PullRequest is { Number: > 0, Url: not null } existingPullRequest &&
            IsReusablePullRequest(existingPullRequest) &&
            !string.IsNullOrWhiteSpace(existingPullRequest.Url))
        {
            workflowRun.CompleteCurrentWorkflow();
            await AppendTimelineEventAsync(
                paths.TimelineFilePath,
                "pull_request_reused",
                actor,
                workflowRun.CurrentPhase,
                $"Reused existing pull request for `{branch.WorkBranchName}`: {existingPullRequest.Url}",
                cancellationToken,
                [artifactPath]);

            return artifactPath;
        }

        var publication = await pullRequestPublisher.PublishAsync(workspaceRoot, workflowRun.UsId, branch, document, cancellationToken);
        EnsurePullRequestPublicationSucceeded(publication);
        branch.RecordPublishedPullRequest(
            new PullRequestRecord(
                publication.IsDraft ? "draft" : "published",
                branch.BaseBranch,
                document.PrTitle,
                artifactPath,
                publication.IsDraft,
                publication.Number,
                publication.Url,
                publication.RemoteBranch,
                publication.CommitSha,
                DateTimeOffset.UtcNow));
        workflowRun.CompleteCurrentWorkflow();

        var summary = publication.Url is null
            ? $"Published pull request for `{branch.WorkBranchName}`."
            : $"Published pull request for `{branch.WorkBranchName}`: {publication.Url}";
        await AppendTimelineEventAsync(
            paths.TimelineFilePath,
            "pull_request_published",
            actor,
            workflowRun.CurrentPhase,
            summary,
            cancellationToken,
            [artifactPath]);

        return artifactPath;
    }

    private static void EnsurePullRequestPublicationSucceeded(PullRequestPublicationResult publication)
    {
        if (string.IsNullOrWhiteSpace(publication.RemoteBranch))
        {
            throw new WorkflowDomainException("PR publication did not report a remote branch.");
        }

        if (publication.Number is null || publication.Number <= 0)
        {
            throw new WorkflowDomainException("PR publication did not return a valid pull request number.");
        }

        if (string.IsNullOrWhiteSpace(publication.Url))
        {
            throw new WorkflowDomainException("PR publication did not return a pull request URL.");
        }
    }

    private static bool IsReusablePullRequest(PullRequestRecord pullRequest) =>
        pullRequest.Status is not "superseded" and not "close_pending";

    private async Task<string?> InvalidatePublishedPullRequestIfNeededAsync(
        string workspaceRoot,
        UserStoryFilePaths paths,
        WorkflowRun workflowRun,
        PhaseId targetPhase,
        string actor,
        string reasonKind,
        CancellationToken cancellationToken)
    {
        if (targetPhase >= PhaseId.PrPreparation ||
            workflowRun.Branch?.PullRequest is not { Number: > 0 } pullRequest ||
            !IsReusablePullRequest(pullRequest))
        {
            return null;
        }

        var reason = $"SpecForge closed this pull request because {reasonKind} returned `{workflowRun.UsId}` to `{WorkflowPresentation.ToPhaseSlug(targetPhase)}`, invalidating the published PR snapshot.";
        try
        {
            var invalidation = await pullRequestInvalidator.InvalidateAsync(
                workspaceRoot,
                workflowRun.UsId,
                workflowRun.Branch,
                pullRequest,
                reason,
                cancellationToken);
            workflowRun.Branch.MarkPullRequestSuperseded(invalidation.Closed);
            var summary = invalidation.Closed
                ? $"Closed superseded pull request #{pullRequest.Number.Value} after {reasonKind}."
                : $"Marked pull request #{pullRequest.Number.Value} as pending close after {reasonKind}: {invalidation.Message ?? "close did not complete"}.";
            await AppendTimelineEventAsync(
                paths.TimelineFilePath,
                invalidation.Closed ? "pull_request_closed" : "pull_request_close_pending",
                actor,
                workflowRun.CurrentPhase,
                summary,
                cancellationToken);
            return summary;
        }
        catch (Exception exception) when (exception is not OperationCanceledException)
        {
            workflowRun.Branch.MarkPullRequestSuperseded(closed: false);
            var summary = $"Could not close superseded pull request #{pullRequest.Number.Value} after {reasonKind}: {exception.Message}";
            await AppendTimelineEventAsync(
                paths.TimelineFilePath,
                "pull_request_close_pending",
                actor,
                workflowRun.CurrentPhase,
                summary,
                cancellationToken);
            return summary;
        }
    }

    private static string AppendPullRequestInvalidationSummary(string summary, string? pullRequestInvalidationSummary) =>
        string.IsNullOrWhiteSpace(pullRequestInvalidationSummary)
            ? summary
            : $"{summary} {pullRequestInvalidationSummary}";

    private void EnsureNextPhaseExecutionIsReady(WorkflowRun workflowRun)
    {
        if (!workflowRun.Definition.CanAdvanceFrom(workflowRun.CurrentPhase) ||
            workflowRun.CurrentPhase == PhaseId.PrPreparation)
        {
            return;
        }

        var nextPhase = workflowRun.Definition.GetNextPhase(workflowRun.CurrentPhase);
        if (!HasArtifact(nextPhase))
        {
            return;
        }

        var readiness = phaseExecutionProvider.GetPhaseExecutionReadiness(nextPhase);
        if (!readiness.CanExecute)
        {
            throw new WorkflowDomainException(
                $"Phase '{WorkflowPresentation.ToPhaseSlug(nextPhase)}' cannot run because '{readiness.BlockingReason ?? "phase_execution_not_ready"}'.");
        }
    }

    public async Task<SubmitRefinementAnswersResult> SubmitRefinementAnswersAsync(
        string workspaceRoot,
        string usId,
        IReadOnlyList<string> answers,
        string actor = "user",
        CancellationToken cancellationToken = default)
    {
        var paths = UserStoryFilePaths.ResolveFromWorkspaceRoot(workspaceRoot, usId);
        var workflowRun = await fileStore.LoadAsync(paths.RootDirectory, cancellationToken);
        await TrackRuntimeVersionChangeAsync(paths, workflowRun, NormalizeActor(actor), workflowRun.CurrentPhase, cancellationToken);
        if (workflowRun.CurrentPhase != PhaseId.Refinement)
        {
            throw new WorkflowDomainException("Refinement answers can only be submitted while the workflow is in the refinement phase.");
        }

        var session = await ReadRefinementSessionAsync(paths, cancellationToken)
            ?? throw new WorkflowDomainException("No refinement questions are currently registered for this user story.");

        var updatedSession = UserStoryRefinementMarkdown.WithAnswers(session, answers);
        await PersistRefinementSessionAsync(paths, updatedSession, cancellationToken);

        workflowRun.RestoreState(PhaseId.Refinement, UserStoryStatus.Active);
        await fileStore.SaveAsync(workflowRun, paths.RootDirectory, cancellationToken);
        await AppendTimelineEventAsync(
            paths.TimelineFilePath,
            "refinement_answered",
            NormalizeActor(actor),
            workflowRun.CurrentPhase,
            $"Recorded {updatedSession.Items.Count(item => !string.IsNullOrWhiteSpace(item.Answer))} refinement answer(s) in `refinement.md`.",
            cancellationToken,
            paths.RefinementFilePath);

        return new SubmitRefinementAnswersResult(
            workflowRun.UsId,
            WorkflowPresentation.ToPhaseSlug(workflowRun.CurrentPhase),
            WorkflowPresentation.ToStatusSlug(workflowRun.Status),
            updatedSession.Items.Count(item => !string.IsNullOrWhiteSpace(item.Answer)));
    }

    public async Task<OperateCurrentPhaseArtifactResult> OperateCurrentPhaseArtifactAsync(
        string workspaceRoot,
        string usId,
        string prompt,
        bool includeReviewArtifactInContext = true,
        string actor = "user",
        CancellationToken cancellationToken = default)
    {
        ValidateRequired(prompt, nameof(prompt));
        var paths = UserStoryFilePaths.ResolveFromWorkspaceRoot(workspaceRoot, usId);
        var workflowRun = await fileStore.LoadAsync(paths.RootDirectory, cancellationToken);
        EnsureCompletedWorkflowIsUnlockedForDirectMutation(workflowRun, "Artifact operation");
        await TrackRuntimeVersionChangeAsync(paths, workflowRun, NormalizeActor(actor), workflowRun.CurrentPhase, cancellationToken);
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
            includeReviewArtifactInContext,
            cancellationToken);
        var operationLogPath = paths.GetPhaseOperationLogPath(workflowRun.CurrentPhase);
        var contextArtifactPaths = ResolveOperationContextArtifactPaths(paths, workflowRun.CurrentPhase, includeReviewArtifactInContext);
        await AppendArtifactOperationEntryAsync(
            operationLogPath,
            workflowRun.CurrentPhase,
            normalizedActor,
            sourceArtifactPath,
            prompt,
            generation.ArtifactPath,
            contextArtifactPaths,
            cancellationToken);
        await fileStore.SaveAsync(workflowRun, paths.RootDirectory, cancellationToken);
        await AppendTimelineEventAsync(
            paths.TimelineFilePath,
            "artifact_operated",
            normalizedActor,
            workflowRun.CurrentPhase,
            $"Operated current artifact `{Path.GetFileName(sourceArtifactPath)}` and produced `{Path.GetFileName(generation.ArtifactPath)}`. Review artifact context {(includeReviewArtifactInContext ? "included when available" : "excluded by user decision")}.",
            cancellationToken,
            [operationLogPath, generation.ArtifactPath],
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

    private async Task<CaptureTransitionResult> ContinueFromCaptureOrRefinementAsync(
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

        var refinementGeneration = await MaterializePhaseArtifactAsync(workspaceRoot, paths, workflowRun, currentArtifactPath: null, operationPrompt: null, includeReviewArtifactInContext: true, cancellationToken);
        var refinement = ParseRefinementArtifact(await File.ReadAllTextAsync(refinementGeneration.ArtifactPath, cancellationToken));
        await UpdateRefinementLogAsync(paths, refinement, this.refinementTolerance, cancellationToken);
        await AppendTimelineEventAsync(
            paths.TimelineFilePath,
            refinement.IsReady ? "refinement_passed" : "refinement_requested",
            actor,
            workflowRun.CurrentPhase,
            refinement.Summary,
            cancellationToken,
            refinementGeneration.ArtifactPath,
            refinementGeneration.Usage,
            refinementGeneration.DurationMs,
            refinementGeneration.Execution);

        if (!refinement.IsReady)
        {
            var autoAnswerAttempt = await TryAutoAnswerRefinementAsync(
                workspaceRoot,
                paths,
                workflowRun,
                actor,
                cancellationToken);
            if (autoAnswerAttempt is not null)
            {
                return autoAnswerAttempt;
            }

            workflowRun.RestoreState(PhaseId.Refinement, UserStoryStatus.WaitingUser);
            return new CaptureTransitionResult(
                refinementGeneration.ArtifactPath,
                refinementGeneration.Usage,
                refinementGeneration.DurationMs,
                refinementGeneration.Execution);
        }

        workflowRun.GenerateNextPhase();
        var specGeneration = await MaterializePhaseArtifactAsync(workspaceRoot, paths, workflowRun, currentArtifactPath: null, operationPrompt: null, includeReviewArtifactInContext: true, cancellationToken);
        await AppendTimelineEventAsync(
            paths.TimelineFilePath,
            "phase_completed",
            actor,
            workflowRun.CurrentPhase,
            $"Generated artifact for phase `{WorkflowPresentation.ToPhaseSlug(workflowRun.CurrentPhase)}` after refinement.",
            cancellationToken,
            specGeneration.ArtifactPath,
            specGeneration.Usage,
            specGeneration.DurationMs,
            specGeneration.Execution);

        return new CaptureTransitionResult(
            specGeneration.ArtifactPath,
            specGeneration.Usage,
            specGeneration.DurationMs,
            specGeneration.Execution);
    }

    private async Task<CaptureTransitionResult?> TryAutoAnswerRefinementAsync(
        string workspaceRoot,
        UserStoryFilePaths paths,
        WorkflowRun workflowRun,
        string actor,
        CancellationToken cancellationToken)
    {
        var session = await ReadRefinementSessionAsync(paths, cancellationToken);
        if (session is null || session.Items.Count == 0)
        {
            return null;
        }

        var executionContext = new PhaseExecutionContext(
            workspaceRoot,
            workflowRun.UsId,
            PhaseId.Refinement,
            paths.MainArtifactPath,
            BuildPreviousArtifactMap(paths, PhaseId.Refinement, includeReviewArtifactInContext: true),
            BuildContextFilePaths(paths, PhaseId.Refinement),
            paths.RefinementFilePath,
            null);

        AutoRefinementAnswersResult? autoAnswers;
        try
        {
            autoAnswers = await phaseExecutionProvider.TryAutoAnswerRefinementAsync(
                executionContext,
                session,
                cancellationToken);
        }
        catch (Exception exception)
        {
            await AppendTimelineEventAsync(
                paths.TimelineFilePath,
                "refinement_auto_answer_failed",
                "system",
                PhaseId.Refinement,
                $"Automatic refinement answering failed and the workflow remains with the user. Reason: {exception.Message}",
                cancellationToken);
            return null;
        }

        if (autoAnswers is null)
        {
            return null;
        }

        var normalizedAnswers = session.Items
            .OrderBy(static item => item.Index)
            .Select((item, index) => index < autoAnswers.Answers.Count ? autoAnswers.Answers[index] : null)
            .ToArray();
        var resolvedAnswers = normalizedAnswers
            .Count(static answer => !string.IsNullOrWhiteSpace(answer));

        if (!autoAnswers.CanResolve || resolvedAnswers == 0)
        {
            await AppendTimelineEventAsync(
                paths.TimelineFilePath,
                "refinement_auto_answer_skipped",
                "system",
                PhaseId.Refinement,
                string.IsNullOrWhiteSpace(autoAnswers.Reason)
                    ? "Automatic refinement answering could not resolve any pending question."
                    : $"Automatic refinement answering left the phase with the user. Reason: {autoAnswers.Reason}",
                cancellationToken,
                paths.RefinementFilePath,
                autoAnswers.Usage,
                durationMs: null,
                autoAnswers.Execution);
            return null;
        }

        var autoAnsweredSession = UserStoryRefinementMarkdown.WithAnswers(session, normalizedAnswers);
        await PersistRefinementSessionAsync(paths, autoAnsweredSession, cancellationToken);
        await AppendTimelineEventAsync(
            paths.TimelineFilePath,
            "refinement_auto_answered",
            "system",
            PhaseId.Refinement,
            $"Automatic refinement answering recorded {resolvedAnswers} answer(s) before retrying spec readiness.",
            cancellationToken,
            paths.RefinementFilePath,
            autoAnswers.Usage,
            durationMs: null,
            autoAnswers.Execution);

        workflowRun.RestoreState(PhaseId.Refinement, UserStoryStatus.Active);
        var retryGeneration = await MaterializePhaseArtifactAsync(workspaceRoot, paths, workflowRun, currentArtifactPath: null, operationPrompt: null, includeReviewArtifactInContext: true, cancellationToken);
        var retryRefinement = ParseRefinementArtifact(await File.ReadAllTextAsync(retryGeneration.ArtifactPath, cancellationToken));
        await UpdateRefinementLogAsync(paths, retryRefinement, this.refinementTolerance, cancellationToken);
        await AppendTimelineEventAsync(
            paths.TimelineFilePath,
            retryRefinement.IsReady ? "refinement_passed" : "refinement_requested",
            actor,
            workflowRun.CurrentPhase,
            retryRefinement.IsReady
                ? $"{retryRefinement.Summary} Resolved through automatic refinement answers."
                : $"{retryRefinement.Summary} Automatic refinement answers were insufficient; user intervention is still required.",
            cancellationToken,
            retryGeneration.ArtifactPath,
            retryGeneration.Usage,
            retryGeneration.DurationMs,
            retryGeneration.Execution);

        if (!retryRefinement.IsReady)
        {
            workflowRun.RestoreState(PhaseId.Refinement, UserStoryStatus.WaitingUser);
            return new CaptureTransitionResult(
                retryGeneration.ArtifactPath,
                retryGeneration.Usage,
                retryGeneration.DurationMs,
                retryGeneration.Execution);
        }

        workflowRun.GenerateNextPhase();
        var specGeneration = await MaterializePhaseArtifactAsync(workspaceRoot, paths, workflowRun, currentArtifactPath: null, operationPrompt: null, includeReviewArtifactInContext: true, cancellationToken);
        await AppendTimelineEventAsync(
            paths.TimelineFilePath,
            "phase_completed",
            actor,
            workflowRun.CurrentPhase,
            $"Generated artifact for phase `{WorkflowPresentation.ToPhaseSlug(workflowRun.CurrentPhase)}` after automatic refinement answers.",
            cancellationToken,
            specGeneration.ArtifactPath,
            specGeneration.Usage,
            specGeneration.DurationMs,
            specGeneration.Execution);

        return new CaptureTransitionResult(
            specGeneration.ArtifactPath,
            specGeneration.Usage,
            specGeneration.DurationMs,
            specGeneration.Execution);
    }

    private async Task<ArtifactGenerationResult> MaterializePhaseArtifactAsync(
        string workspaceRoot,
        UserStoryFilePaths paths,
        WorkflowRun workflowRun,
        string? currentArtifactPath,
        string? operationPrompt,
        bool includeReviewArtifactInContext,
        CancellationToken cancellationToken)
    {
        await using var diagnostics = SpecForgeDiagnostics.StartProgressScope(
            $"[runner.materialize] usId={workflowRun.UsId} phase={WorkflowPresentation.ToPhaseSlug(workflowRun.CurrentPhase)}",
            interval: TimeSpan.FromSeconds(20));
        Directory.CreateDirectory(paths.PhasesDirectoryPath);
        var artifactPath = NextAvailableArtifactPath(paths, workflowRun.CurrentPhase);
        if (workflowRun.CurrentPhase == PhaseId.Review)
        {
            ImplementationPhaseEvidence.EnsureReviewCanConsume(workspaceRoot, paths);
        }

        var executionContext = new PhaseExecutionContext(
            workspaceRoot,
            workflowRun.UsId,
            workflowRun.CurrentPhase,
            paths.MainArtifactPath,
            BuildPreviousArtifactMap(paths, workflowRun.CurrentPhase, includeReviewArtifactInContext),
            BuildContextFilePaths(paths, workflowRun.CurrentPhase),
            currentArtifactPath,
            operationPrompt);
        EnsureExecutionInputFilesExist(executionContext);
        var executionId = BuildExecutionId(workflowRun.CurrentPhase);
        var executionStartedAtUtc = DateTimeOffset.UtcNow;
        var inputManifest = PhaseExecutionReceiptStore.BuildInputManifest(workspaceRoot, executionContext);
        var previousArtifactList = executionContext.PreviousArtifactPaths
            .OrderBy(static item => item.Key)
            .Select(static item => $"{WorkflowPresentation.ToPhaseSlug(item.Key)}='{item.Value}'")
            .ToArray();
        var contextFileList = executionContext.ContextFilePaths
            .OrderBy(static path => path, StringComparer.Ordinal)
            .Select(static path => $"'{path}'")
            .ToArray();
        SpecForgeDiagnostics.Log(
            $"[runner.materialize] usId={workflowRun.UsId} phase={WorkflowPresentation.ToPhaseSlug(workflowRun.CurrentPhase)} artifactPath='{artifactPath}' contextFiles={executionContext.ContextFilePaths.Count} previousArtifacts={executionContext.PreviousArtifactPaths.Count} currentArtifactPath='{currentArtifactPath ?? "(none)"}' operationPrompt={(string.IsNullOrWhiteSpace(operationPrompt) ? "no" : "yes")}");
        SpecForgeDiagnostics.Log(
            $"[runner.materialize.in] usId={workflowRun.UsId} phase={WorkflowPresentation.ToPhaseSlug(workflowRun.CurrentPhase)} executionId={executionId} inputManifestHash={inputManifest.ManifestSha256} userStory='{executionContext.UserStoryPath}' previousArtifacts=[{string.Join(", ", previousArtifactList)}] contextFiles=[{string.Join(", ", contextFileList)}] currentArtifact='{currentArtifactPath ?? "(none)"}'");
        var implementationEvidenceBaseline = workflowRun.CurrentPhase == PhaseId.Implementation
            ? await ImplementationPhaseEvidence.CaptureWorkspaceSnapshotAsync(workspaceRoot, paths.RootDirectory, cancellationToken)
            : null;
        var stopwatch = Stopwatch.StartNew();
        PhaseExecutionResult result;

        try
        {
            result = await phaseExecutionProvider.ExecuteAsync(executionContext, cancellationToken);
        }
        catch (Exception exception)
        {
            diagnostics.MarkFailed(exception);
            throw;
        }

        stopwatch.Stop();
        var executionMetadata = WithRuntimeVersion(result.Execution);
        SpecForgeDiagnostics.Log(
            $"[runner.materialize] usId={workflowRun.UsId} phase={WorkflowPresentation.ToPhaseSlug(workflowRun.CurrentPhase)} providerReturned executionKind={result.ExecutionKind} durationMs={stopwatch.ElapsedMilliseconds}");

        if (workflowRun.CurrentPhase == PhaseId.Spec)
        {
            EnsureMaterializedSpecIsUsable(result.Content);
            await File.WriteAllTextAsync(artifactPath, result.Content, cancellationToken);
        }
        else if (workflowRun.CurrentPhase == PhaseId.Implementation)
        {
            var version = ExtractArtifactVersion(artifactPath);
            var implementationEvidence = await ImplementationPhaseEvidence.CaptureAsync(
                workspaceRoot,
                paths,
                implementationEvidenceBaseline,
                cancellationToken);
            await ImplementationPhaseEvidence.PersistAsync(paths, implementationEvidence, cancellationToken);
            await WriteStructuredJsonIfAvailableAsync(
                paths.GetPhaseArtifactJsonPath(PhaseId.Implementation, version),
                result.StructuredJsonContent,
                cancellationToken);
            await File.WriteAllTextAsync(
                artifactPath,
                ImplementationPhaseEvidence.AppendSection(
                    result.Content,
                    paths.GetPhaseEvidenceMarkdownPath(PhaseId.Implementation),
                    paths.GetPhaseEvidenceJsonPath(PhaseId.Implementation),
                    implementationEvidence),
                cancellationToken);
        }
        else if (workflowRun.CurrentPhase == PhaseId.Review)
        {
            var version = ExtractArtifactVersion(artifactPath);
            var reviewArtifact = EnforceReviewValidationStrategyContract(result.Content, paths, workflowRun.UsId, version);
            await File.WriteAllTextAsync(paths.GetPhaseArtifactJsonPath(PhaseId.Review, version), reviewArtifact.Json, cancellationToken);
            await File.WriteAllTextAsync(artifactPath, reviewArtifact.Markdown, cancellationToken);
        }
        else if (workflowRun.CurrentPhase == PhaseId.TechnicalDesign)
        {
            var version = ExtractArtifactVersion(artifactPath);
            await WriteStructuredJsonIfAvailableAsync(
                paths.GetPhaseArtifactJsonPath(PhaseId.TechnicalDesign, version),
                result.StructuredJsonContent,
                cancellationToken);
            await File.WriteAllTextAsync(artifactPath, result.Content, cancellationToken);
        }
        else if (workflowRun.CurrentPhase is PhaseId.ReleaseApproval or PhaseId.PrPreparation)
        {
            var version = ExtractArtifactVersion(artifactPath);
            if (workflowRun.CurrentPhase == PhaseId.PrPreparation)
            {
                var canonicalJson = result.StructuredJsonContent ?? result.Content;
                var document = PrPreparationArtifactJson.ParseCanonicalJson(canonicalJson);
                EnsurePrPreparationArtifactIsPublishable(document);
                var renderedMarkdown = PrPreparationArtifactJson.RenderMarkdown(document, workflowRun.UsId, version);
                await File.WriteAllTextAsync(
                    paths.GetPhaseArtifactJsonPath(PhaseId.PrPreparation, version),
                    PrPreparationArtifactJson.Serialize(document),
                    cancellationToken);
                await File.WriteAllTextAsync(artifactPath, renderedMarkdown, cancellationToken);
                workflowRun.Branch?.RecordPreparedPullRequest(document.PrTitle, artifactPath);
            }
            else
            {
                await WriteStructuredJsonIfAvailableAsync(
                    paths.GetPhaseArtifactJsonPath(workflowRun.CurrentPhase, version),
                    result.StructuredJsonContent,
                    cancellationToken);
                await File.WriteAllTextAsync(artifactPath, result.Content, cancellationToken);
            }
        }
        else
        {
            await File.WriteAllTextAsync(artifactPath, result.Content, cancellationToken);
        }

        var generatedFiles = new List<string> { artifactPath };
        var generatedJsonPath = paths.GetLatestExistingPhaseArtifactJsonPath(workflowRun.CurrentPhase);
        if (!string.IsNullOrWhiteSpace(generatedJsonPath) && File.Exists(generatedJsonPath))
        {
            generatedFiles.Add(generatedJsonPath);
        }

        if (workflowRun.CurrentPhase == PhaseId.Implementation)
        {
            var evidenceMarkdownPath = paths.GetLatestExistingPhaseEvidenceMarkdownPath(PhaseId.Implementation);
            var evidenceJsonPath = paths.GetLatestExistingPhaseEvidenceJsonPath(PhaseId.Implementation);
            if (!string.IsNullOrWhiteSpace(evidenceMarkdownPath) && File.Exists(evidenceMarkdownPath))
            {
                generatedFiles.Add(evidenceMarkdownPath);
            }

            if (!string.IsNullOrWhiteSpace(evidenceJsonPath) && File.Exists(evidenceJsonPath))
            {
                generatedFiles.Add(evidenceJsonPath);
            }
        }

        SpecForgeDiagnostics.Log(
            $"[runner.materialize.out] usId={workflowRun.UsId} phase={WorkflowPresentation.ToPhaseSlug(workflowRun.CurrentPhase)} generatedFiles=[{string.Join(", ", generatedFiles.Select(static path => $"'{path}'"))}]");

        var receipt = new PhaseExecutionReceipt(
            executionId,
            workflowRun.UsId,
            WorkflowPresentation.ToPhaseSlug(workflowRun.CurrentPhase),
            executionStartedAtUtc.ToString("O"),
            DateTimeOffset.UtcNow.ToString("O"),
            inputManifest,
            new PhaseExecutionOutputManifest(
                PhaseExecutionReceiptStore.NormalizePath(artifactPath),
                PhaseExecutionReceiptStore.TryComputeFileSha256(artifactPath),
                generatedFiles
                    .Select(path => new PhaseExecutionArtifactInput(
                        PhaseExecutionReceiptStore.NormalizePath(path),
                        PhaseExecutionReceiptStore.TryComputeFileSha256(path)))
                    .ToArray()),
            result.Usage,
            executionMetadata);
        var receiptPath = await PhaseExecutionReceiptStore.PersistAsync(paths.ExecutionReceiptsDirectoryPath, receipt, cancellationToken);
        if (!File.Exists(artifactPath))
        {
            throw new WorkflowDomainException($"Phase '{WorkflowPresentation.ToPhaseSlug(workflowRun.CurrentPhase)}' did not produce expected artifact '{artifactPath}'.");
        }

        var returnedExecutionMetadata = executionMetadata is null
            ? null
            : executionMetadata with { ReceiptPath = receiptPath };
        SpecForgeDiagnostics.Log(
            $"[runner.materialize.receipt] usId={workflowRun.UsId} phase={WorkflowPresentation.ToPhaseSlug(workflowRun.CurrentPhase)} executionId={executionId} receipt='{receiptPath}' outputHash={receipt.OutputManifest.ResultArtifactSha256 ?? "(none)"}");
        diagnostics.MarkCompleted($"artifactPath='{artifactPath}' receiptPath='{receiptPath}'");
        return new ArtifactGenerationResult(artifactPath, result.Usage, stopwatch.ElapsedMilliseconds, returnedExecutionMetadata, receiptPath);
    }

    private static string BuildExecutionId(PhaseId phaseId) =>
        $"{DateTimeOffset.UtcNow.UtcDateTime:yyyyMMdd'T'HHmmssfff'Z'}-{WorkflowPresentation.ToPhaseSlug(phaseId)}";

    private static void EnsureExecutionInputFilesExist(PhaseExecutionContext context)
    {
        if (!File.Exists(context.UserStoryPath))
        {
            throw new WorkflowDomainException($"Phase '{WorkflowPresentation.ToPhaseSlug(context.PhaseId)}' cannot run because user story path '{context.UserStoryPath}' is missing.");
        }

        foreach (var previousArtifact in context.PreviousArtifactPaths)
        {
            if (!File.Exists(previousArtifact.Value))
            {
                throw new WorkflowDomainException($"Phase '{WorkflowPresentation.ToPhaseSlug(context.PhaseId)}' cannot run because previous artifact '{previousArtifact.Value}' is missing.");
            }
        }

        foreach (var contextFilePath in context.ContextFilePaths)
        {
            if (!File.Exists(contextFilePath))
            {
                throw new WorkflowDomainException($"Phase '{WorkflowPresentation.ToPhaseSlug(context.PhaseId)}' cannot run because context file '{contextFilePath}' is missing.");
            }
        }

        if (!string.IsNullOrWhiteSpace(context.CurrentArtifactPath) && !File.Exists(context.CurrentArtifactPath))
        {
            throw new WorkflowDomainException($"Phase '{WorkflowPresentation.ToPhaseSlug(context.PhaseId)}' cannot run because current artifact '{context.CurrentArtifactPath}' is missing.");
        }
    }

    private static async Task<TimelineEventDetails?> TryReadPendingCompletedWorkflowReopenAsync(
        UserStoryFilePaths paths,
        PhaseId currentPhase,
        CancellationToken cancellationToken)
    {
        if (!File.Exists(paths.TimelineFilePath))
        {
            return null;
        }

        var events = TimelineMarkdownParser
            .ParseEvents(await File.ReadAllTextAsync(paths.TimelineFilePath, cancellationToken))
            .ToArray();
        var currentPhaseSlug = WorkflowPresentation.ToPhaseSlug(currentPhase);
        var latestReopenIndex = Array.FindLastIndex(
            events,
            timelineEvent =>
                timelineEvent.Code == "workflow_reopened" &&
                string.Equals(timelineEvent.Phase, currentPhaseSlug, StringComparison.Ordinal));
        if (latestReopenIndex < 0)
        {
            return null;
        }

        var hasPhaseArtifactAfterReopen = events
            .Skip(latestReopenIndex + 1)
            .Any(timelineEvent =>
                string.Equals(timelineEvent.Phase, currentPhaseSlug, StringComparison.Ordinal) &&
                timelineEvent.Code is "phase_completed" or "artifact_operated" &&
                timelineEvent.Artifacts.Any(static artifact => artifact.EndsWith(".md", StringComparison.OrdinalIgnoreCase)));

        return hasPhaseArtifactAfterReopen ? null : events[latestReopenIndex];
    }

    private static string BuildCompletedWorkflowReopenOperationPrompt(PhaseId phaseId, string? reopenSummary)
    {
        var target = phaseId switch
        {
            PhaseId.Spec => "current spec artifact",
            PhaseId.TechnicalDesign => "current technical design artifact",
            PhaseId.Implementation => "current implementation artifact",
            _ => $"current {WorkflowPresentation.ToPhaseSlug(phaseId)} artifact"
        };
        var phaseGuidance = phaseId switch
        {
            PhaseId.Spec => "Update scope, constraints, acceptance criteria, and approval-facing details so the reopened issue is explicit and reviewable.",
            PhaseId.TechnicalDesign => "Update architecture, implementation plan, and validation strategy so the reopened technical issue is explicit and testable.",
            PhaseId.Implementation => "Update the implementation narrative and execution intent so the reopened defect or merge issue is explicit and actionable.",
            _ => "Update the artifact so the reopened issue is explicit and actionable."
        };
        var summary = string.IsNullOrWhiteSpace(reopenSummary)
            ? "The completed workflow was reopened for this phase."
            : reopenSummary.Trim();

        return string.Join(
            Environment.NewLine,
            [
                $"Apply this completed-workflow reopen note directly to the {target}.",
                $"Treat this as a corrective {WorkflowPresentation.ToPhaseSlug(phaseId)} pass over the approved artifact, not a restart.",
                phaseGuidance,
                string.Empty,
                "Reopen note:",
                summary
            ]);
    }

    private PhaseExecutionMetadata? WithRuntimeVersion(PhaseExecutionMetadata? execution) =>
        execution is null
            ? null
            : execution with { RuntimeVersion = execution.RuntimeVersion ?? runtimeVersion };

    private static async Task WriteStructuredJsonIfAvailableAsync(
        string artifactJsonPath,
        string? structuredJsonContent,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(structuredJsonContent))
        {
            return;
        }

        await File.WriteAllTextAsync(artifactJsonPath, structuredJsonContent, cancellationToken);
    }

    private static void EnsurePrPreparationArtifactIsPublishable(PrPreparationArtifactDocument document)
    {
        var errors = new List<string>();
        if (string.IsNullOrWhiteSpace(document.State) || document.State == "...")
        {
            errors.Add("state");
        }

        if (string.IsNullOrWhiteSpace(document.PrTitle) || document.PrTitle == "...")
        {
            errors.Add("prTitle");
        }

        if (string.IsNullOrWhiteSpace(document.PrSummary) || document.PrSummary == "...")
        {
            errors.Add("prSummary");
        }

        if (document.ChangeNarrative.Count == 0)
        {
            errors.Add("changeNarrative");
        }

        if (document.ValidationSummary.Count == 0)
        {
            errors.Add("validationSummary");
        }

        if (document.ReviewerChecklist.Count == 0)
        {
            errors.Add("reviewerChecklist");
        }

        if (document.PrBody.Count == 0 || document.PrBody.All(static line => string.IsNullOrWhiteSpace(line) || line.Trim() == "..."))
        {
            errors.Add("prBody");
        }

        if (errors.Count > 0)
        {
            throw new WorkflowDomainException(
                $"PR preparation artifact is incomplete. Missing or placeholder sections: {string.Join(", ", errors)}.");
        }
    }

    private sealed record ReviewMaterialization(string Markdown, string Json);

    private static ReviewMaterialization EnforceReviewValidationStrategyContract(
        string reviewMarkdown,
        UserStoryFilePaths paths,
        string usId,
        int version)
    {
        var validationStrategy = ReadTechnicalDesignValidationStrategy(paths);
        if (validationStrategy.Count == 0)
        {
            SpecForgeDiagnostics.Log(
                $"[runner.review_guard] usId={usId} forced review result to fail because technical design validation strategy is missing.");
            var missingStrategyDocument = new ReviewArtifactDocument(
                "fail",
                [new ReviewValidationChecklistItem(
                    "fail",
                    "Technical Design must define a non-empty Validation Strategy.",
                    "The current technical design artifact has no reviewable validation strategy items.")],
                ["Review cannot pass because there is no validation strategy to validate."],
                "Review requires a non-empty Technical Design validation strategy before it can pass.",
                ["Regenerate or operate the technical design phase with a concrete Validation Strategy."]);
            return new ReviewMaterialization(
                ReviewArtifactJson.RenderMarkdown(missingStrategyDocument, usId, version),
                ReviewArtifactJson.Serialize(missingStrategyDocument));
        }

        var reviewResult = WorkflowArtifactMarkdownReader.ParseReviewResult(reviewMarkdown);
        var reviewChecklist = WorkflowArtifactMarkdownReader.ParseReviewValidationChecklist(reviewMarkdown);
        var reviewChecklistByItem = reviewChecklist
            .GroupBy(static item => WorkflowArtifactMarkdownReader.NormalizeReviewChecklistKey(item.Item), StringComparer.Ordinal)
            .ToDictionary(static group => group.Key, static group => group.First(), StringComparer.Ordinal);
        var hasChecklist = reviewChecklistByItem.Count > 0;
        var enforcedChecklist = validationStrategy
            .Select(item =>
            {
                var key = WorkflowArtifactMarkdownReader.NormalizeReviewChecklistKey(item);
                if (reviewChecklistByItem.TryGetValue(key, out var reviewed))
                {
                    return reviewed with
                    {
                        Status = reviewed.Status.Equals("pass", StringComparison.OrdinalIgnoreCase) ? "pass" : "fail",
                        Item = item,
                        Evidence = string.IsNullOrWhiteSpace(reviewed.Evidence)
                            ? "No concrete review evidence was provided for this validation item."
                            : reviewed.Evidence
                    };
                }

                return new ReviewValidationChecklistItem(
                    "fail",
                    item,
                    hasChecklist
                        ? "The review artifact did not validate this Technical Design validation strategy item."
                        : "The review artifact did not include the required Validation Checklist.");
            })
            .ToArray();
        var enforcedResult = reviewResult == "pass" && enforcedChecklist.All(static item => item.Status == "pass")
            ? "pass"
            : "fail";
        var findings = WorkflowArtifactMarkdownReader.ReadMarkdownBulletSection(reviewMarkdown, "## Findings");
        var recommendations = WorkflowArtifactMarkdownReader.ReadMarkdownBulletSection(reviewMarkdown, "## Recommendation");
        var primaryReason = WorkflowArtifactMarkdownReader.ParseReviewPrimaryReason(reviewMarkdown);

        if (enforcedResult == "fail")
        {
            if (!hasChecklist)
            {
                findings = [..findings, "Review cannot pass because it did not include the required checklist derived from Technical Design validation strategy."];
            }

            var missingItems = enforcedChecklist
                .Where(static item => item.Status == "fail")
                .Select(static item => item.Item)
                .ToArray();
            if (missingItems.Length > 0)
            {
                findings = [..findings, $"Review failed {missingItems.Length} validation strategy item(s)."];
            }

            if (string.IsNullOrWhiteSpace(primaryReason) || reviewResult == "pass")
            {
                primaryReason = "Review failed because at least one Technical Design validation strategy item was not validated successfully.";
            }

            if (recommendations.Count == 0)
            {
                recommendations = ["Fix the failed validation strategy items and rerun the review phase."];
            }
        }

        if (findings.Count == 0)
        {
            findings = ["No blocking review findings beyond the validation checklist."];
        }

        if (recommendations.Count == 0)
        {
            recommendations = ["Proceed only while the checklist remains fully green."];
        }

        var document = new ReviewArtifactDocument(
                enforcedResult,
                enforcedChecklist,
                findings,
                string.IsNullOrWhiteSpace(primaryReason)
                    ? "Review passed because every Technical Design validation strategy item has concrete passing evidence."
                    : primaryReason,
                recommendations);
        return new ReviewMaterialization(
            ReviewArtifactJson.RenderMarkdown(document, usId, version),
            ReviewArtifactJson.Serialize(document));
    }

    private static IReadOnlyDictionary<PhaseId, string> BuildPreviousArtifactMap(
        UserStoryFilePaths paths,
        PhaseId currentPhase,
        bool includeReviewArtifactInContext)
    {
        var result = new Dictionary<PhaseId, string>();
        foreach (var phaseId in new[] { PhaseId.Spec, PhaseId.TechnicalDesign, PhaseId.Implementation, PhaseId.Review, PhaseId.ReleaseApproval })
        {
            if (phaseId == currentPhase)
            {
                continue;
            }

            if (!includeReviewArtifactInContext && currentPhase == PhaseId.Implementation && phaseId == PhaseId.Review)
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

    private static IReadOnlyCollection<string> BuildContextFilePaths(UserStoryFilePaths paths, PhaseId phaseId)
    {
        var contextFilePaths = new List<string>();
        if (Directory.Exists(paths.ContextDirectoryPath))
        {
            contextFilePaths.AddRange(
                Directory.GetFiles(paths.ContextDirectoryPath, "*", SearchOption.TopDirectoryOnly)
                    .OrderBy(static path => path, StringComparer.Ordinal));
        }

        if (phaseId == PhaseId.Review)
        {
            var implementationEvidencePath = paths.GetLatestExistingPhaseEvidenceMarkdownPath(PhaseId.Implementation);
            if (!string.IsNullOrWhiteSpace(implementationEvidencePath))
            {
                contextFilePaths.Add(implementationEvidencePath);
            }
        }

        if (phaseId is PhaseId.ReleaseApproval or PhaseId.PrPreparation)
        {
            if (File.Exists(paths.BranchFilePath))
            {
                contextFilePaths.Add(paths.BranchFilePath);
            }

            if (File.Exists(paths.TimelineFilePath))
            {
                contextFilePaths.Add(paths.TimelineFilePath);
            }
        }

        return contextFilePaths
            .Distinct(StringComparer.Ordinal)
            .ToArray();
    }

    internal static IReadOnlyList<string> ReadTechnicalDesignValidationStrategy(UserStoryFilePaths paths)
    {
        var technicalDesignJsonPath = paths.GetLatestExistingPhaseArtifactJsonPath(PhaseId.TechnicalDesign);
        if (!string.IsNullOrWhiteSpace(technicalDesignJsonPath) && File.Exists(technicalDesignJsonPath))
        {
            var technicalDesignJson = File.ReadAllText(technicalDesignJsonPath);
            return TechnicalDesignArtifactJson.ParseCanonicalJson(technicalDesignJson).ValidationStrategy;
        }

        var technicalDesignPath = paths.GetLatestExistingPhaseArtifactPath(PhaseId.TechnicalDesign);
        if (string.IsNullOrWhiteSpace(technicalDesignPath) || !File.Exists(technicalDesignPath))
        {
            return [];
        }

        var technicalDesignMarkdown = File.ReadAllText(technicalDesignPath);
        return WorkflowArtifactMarkdownReader.ReadMarkdownBulletSection(technicalDesignMarkdown, "## Validation Strategy");
    }

    internal static string? TryReadReviewResult(string reviewMarkdown)
    {
        var result = WorkflowArtifactMarkdownReader.ParseReviewResult(reviewMarkdown);
        return string.IsNullOrWhiteSpace(result) ? null : result;
    }

    internal static bool IsReviewReplayPending(UserStoryFilePaths paths)
    {
        if (!File.Exists(paths.TimelineFilePath))
        {
            return false;
        }

        var events = TimelineMarkdownParser.ParseEvents(File.ReadAllText(paths.TimelineFilePath));
        var latestReviewRewindIndex = -1;
        var latestReviewCompletionIndex = -1;
        var index = 0;
        foreach (var timelineEvent in events)
        {
            if (timelineEvent.Phase == WorkflowPresentation.ToPhaseSlug(PhaseId.Review) &&
                timelineEvent.Code == "workflow_rewound")
            {
                latestReviewRewindIndex = index;
            }

            if (timelineEvent.Phase == WorkflowPresentation.ToPhaseSlug(PhaseId.Review) &&
                timelineEvent.Code == "phase_completed")
            {
                latestReviewCompletionIndex = index;
            }

            index++;
        }

        return latestReviewRewindIndex > latestReviewCompletionIndex;
    }

    private static async Task<bool> ShouldReplayCurrentReviewAsync(
        UserStoryFilePaths paths,
        CancellationToken cancellationToken)
    {
        if (IsReviewReplayPending(paths))
        {
            return true;
        }

        var reviewPath = paths.GetLatestExistingPhaseArtifactPath(PhaseId.Review);
        if (string.IsNullOrWhiteSpace(reviewPath) || !File.Exists(reviewPath))
        {
            return true;
        }

        var reviewResult = TryReadReviewResult(await File.ReadAllTextAsync(reviewPath, cancellationToken));
        return reviewResult != "pass";
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
        phaseId is PhaseId.Spec or PhaseId.TechnicalDesign or PhaseId.Implementation or PhaseId.Review or PhaseId.ReleaseApproval or PhaseId.PrPreparation;

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

        if (File.Exists(paths.RefinementFilePath))
        {
            deletedPaths.Add(paths.RefinementFilePath);
            File.Delete(paths.RefinementFilePath);
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

        if (targetPhase <= PhaseId.Spec && hasBranch && File.Exists(paths.BranchFilePath))
        {
            deletedPaths.Add(paths.BranchFilePath);
            File.Delete(paths.BranchFilePath);
        }

        Directory.CreateDirectory(paths.PhasesDirectoryPath);
        return Task.FromResult<IReadOnlyCollection<string>>(deletedPaths);
    }

    private static IReadOnlyCollection<string> ArchiveLineageCandidates(
        UserStoryFilePaths paths,
        string archiveDirectoryPath,
        IReadOnlyCollection<string> candidatePaths)
    {
        var archivedPaths = new List<string>();
        foreach (var candidatePath in candidatePaths)
        {
            foreach (var sourcePath in EnumerateLineageCandidateFiles(candidatePath))
            {
                if (!File.Exists(sourcePath) || !IsUnderDirectory(paths.RootDirectory, sourcePath))
                {
                    continue;
                }

                var relativePath = Path.GetRelativePath(paths.RootDirectory, sourcePath);
                var destinationPath = Path.Combine(archiveDirectoryPath, relativePath);
                Directory.CreateDirectory(Path.GetDirectoryName(destinationPath) ?? archiveDirectoryPath);
                if (File.Exists(destinationPath))
                {
                    destinationPath = BuildUniqueArchivePath(destinationPath);
                }

                File.Move(sourcePath, destinationPath);
                archivedPaths.Add(destinationPath);
            }
        }

        return archivedPaths;
    }

    private static IEnumerable<string> EnumerateLineageCandidateFiles(string candidatePath)
    {
        yield return candidatePath;
        var jsonPath = Path.ChangeExtension(candidatePath, ".json");
        if (!string.Equals(jsonPath, candidatePath, StringComparison.Ordinal))
        {
            yield return jsonPath;
        }
    }

    private static string BuildUniqueArchivePath(string path)
    {
        var directory = Path.GetDirectoryName(path) ?? string.Empty;
        var fileName = Path.GetFileNameWithoutExtension(path);
        var extension = Path.GetExtension(path);
        for (var index = 2; index < 1000; index += 1)
        {
            var candidate = Path.Combine(directory, $"{fileName}.{index}{extension}");
            if (!File.Exists(candidate))
            {
                return candidate;
            }
        }

        return Path.Combine(directory, $"{fileName}.{Guid.NewGuid():N}{extension}");
    }

    private static bool IsUnderDirectory(string rootDirectory, string path)
    {
        var normalizedRoot = Path.GetFullPath(rootDirectory).TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar) + Path.DirectorySeparatorChar;
        var normalizedPath = Path.GetFullPath(path);
        return normalizedPath.StartsWith(normalizedRoot, StringComparison.Ordinal);
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
        await AppendTimelineEventAsync(
            timelinePath,
            eventCode,
            actor,
            phaseId,
            summary,
            cancellationToken,
            string.IsNullOrWhiteSpace(artifactPath) ? null : [artifactPath],
            usage,
            durationMs,
            execution);
    }

    private static async Task AppendTimelineEventAsync(
        string timelinePath,
        string eventCode,
        string actor,
        PhaseId phaseId,
        string summary,
        CancellationToken cancellationToken,
        IReadOnlyCollection<string>? artifactPaths,
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

        var normalizedArtifactPaths = artifactPaths?
            .Where(static path => !string.IsNullOrWhiteSpace(path))
            .Select(static path => path.Replace('\\', '/'))
            .Distinct(StringComparer.Ordinal)
            .ToArray();
        if (normalizedArtifactPaths is { Length: > 0 })
        {
            builder.AppendLine("- Artifacts:");
            foreach (var path in normalizedArtifactPaths)
            {
                builder.AppendLine($"  - `{path}`");
            }
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

            if (!string.IsNullOrWhiteSpace(execution.RuntimeVersion))
            {
                builder.AppendLine($"  - runtime-version: `{execution.RuntimeVersion}`");
            }

            if (execution.Warnings is { Count: > 0 })
            {
                foreach (var warning in execution.Warnings)
                {
                    builder.AppendLine($"  - warning: {warning}");
                }
            }

            if (!string.IsNullOrWhiteSpace(execution.InputSha256) ||
                !string.IsNullOrWhiteSpace(execution.OutputSha256) ||
                !string.IsNullOrWhiteSpace(execution.StructuredOutputSha256) ||
                !string.IsNullOrWhiteSpace(execution.ReceiptPath))
            {
                builder.AppendLine(
                    $"<!-- specforge-execution-hashes input-sha256=\"{execution.InputSha256 ?? string.Empty}\" output-sha256=\"{execution.OutputSha256 ?? string.Empty}\" structured-output-sha256=\"{execution.StructuredOutputSha256 ?? string.Empty}\" receipt=\"{(execution.ReceiptPath ?? string.Empty).Replace('\\', '/')}\" -->");
            }
        }

        if (durationMs is not null)
        {
            builder.AppendLine($"- Duration: `{durationMs}` ms");
        }

        await File.AppendAllTextAsync(timelinePath, builder.ToString(), cancellationToken);
    }

    private async Task TrackRuntimeVersionChangeAsync(
        UserStoryFilePaths paths,
        WorkflowRun workflowRun,
        string actor,
        PhaseId phaseId,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(runtimeVersion))
        {
            return;
        }

        var previousVersion = workflowRun.LastRuntimeVersion;
        workflowRun.UpdateRuntimeVersion(runtimeVersion);
        if (string.Equals(previousVersion, workflowRun.LastRuntimeVersion, StringComparison.Ordinal))
        {
            return;
        }

        await fileStore.SaveAsync(workflowRun, paths.RootDirectory, cancellationToken);
        var summary = string.IsNullOrWhiteSpace(previousVersion)
            ? $"Registered runtime version `{workflowRun.LastRuntimeVersion}` for this workflow."
            : $"Runtime version changed from `{previousVersion}` to `{workflowRun.LastRuntimeVersion}`.";
        await AppendTimelineEventAsync(
            paths.TimelineFilePath,
            "runtime_version_changed",
            actor,
            phaseId,
            summary,
            cancellationToken,
            artifactPaths: null,
            usage: null,
            durationMs: null,
            execution: new PhaseExecutionMetadata("specforge", "workflow", RuntimeVersion: workflowRun.LastRuntimeVersion));
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

    private void EnsureCompletedWorkflowIsUnlockedForDirectMutation(WorkflowRun workflowRun, string actionLabel)
    {
        if (!completedUsLockOnCompleted || workflowRun.Status != UserStoryStatus.Completed)
        {
            return;
        }

        throw new WorkflowDomainException($"{actionLabel} is not allowed because the completed workflow is locked by configuration.");
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

        if (targetPhase >= PhaseId.Refinement)
        {
            preservedPaths.Add(paths.RefinementFilePath);
        }

        if (targetPhase > PhaseId.Spec)
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
            paths.RefinementFilePath,
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
                     PhaseId.Refinement,
                     PhaseId.Spec,
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
        if (phaseId == PhaseId.Refinement)
        {
            yield return paths.GetPhaseArtifactPath(PhaseId.Refinement);
            yield break;
        }

        if (phaseId is not (PhaseId.Spec or PhaseId.TechnicalDesign or PhaseId.Implementation or PhaseId.Review or PhaseId.ReleaseApproval or PhaseId.PrPreparation))
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
        PhaseId.Spec => ["01-spec", "01-spec"],
        PhaseId.Refinement => ["00-refinement"],
        PhaseId.TechnicalDesign => ["02-technical-design"],
        PhaseId.Implementation => ["03-implementation"],
        PhaseId.Review => ["04-review"],
        PhaseId.ReleaseApproval => ["05-release-approval"],
        PhaseId.PrPreparation => ["06-pr-preparation"],
        _ => []
    };

    private static void RestoreTargetApprovalIfApplicable(
        WorkflowRun workflowRun,
        PhaseId targetPhase,
        bool destructive,
        bool targetPhaseWasApproved)
    {
        if (destructive || !targetPhaseWasApproved || targetPhase == PhaseId.ReleaseApproval)
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
        IReadOnlyCollection<string> contextArtifactPaths,
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
            .AppendLine($"- Result Artifact: `{generatedArtifactPath.Replace('\\', '/')}`");

        if (contextArtifactPaths.Count > 0)
        {
            builder.AppendLine("- Context Artifacts:");
            foreach (var contextArtifactPath in contextArtifactPaths)
            {
                builder.AppendLine($"  - `{contextArtifactPath.Replace('\\', '/')}`");
            }
        }

        builder.AppendLine("- Prompt:")
            .AppendLine("```text")
            .AppendLine(normalizedPrompt)
            .AppendLine("```");

        await File.AppendAllTextAsync(operationLogPath, builder.ToString(), cancellationToken);
    }

    private static IReadOnlyCollection<string> ResolveOperationContextArtifactPaths(
        UserStoryFilePaths paths,
        PhaseId phaseId,
        bool includeReviewArtifactInContext)
    {
        if (phaseId != PhaseId.Implementation || !includeReviewArtifactInContext)
        {
            return [];
        }

        var reviewArtifactPath = paths.GetLatestExistingPhaseArtifactPath(PhaseId.Review);
        return string.IsNullOrWhiteSpace(reviewArtifactPath)
            ? []
            : [reviewArtifactPath];
    }

    private static async Task EnsureCurrentPhaseIsApprovableAsync(
        UserStoryFilePaths paths,
        PhaseId currentPhase,
        CancellationToken cancellationToken)
    {
        if (currentPhase != PhaseId.Spec)
        {
            return;
        }

        var artifactPath = paths.GetLatestExistingPhaseArtifactPath(PhaseId.Spec);
        if (artifactPath is null || !File.Exists(artifactPath))
        {
            throw new WorkflowDomainException("The spec baseline cannot be approved because `01-spec.md` does not exist.");
        }

        var markdown = await File.ReadAllTextAsync(artifactPath, cancellationToken);
        SpecBaselineSchemaValidator.EnsureValid(markdown);

        var specDocument = await LoadCurrentSpecDocumentAsync(paths, cancellationToken);
        var unresolvedQuestions = SpecJson.GetUnresolvedQuestions(specDocument);
        if (unresolvedQuestions.Count > 0)
        {
            throw new WorkflowDomainException(
                $"The spec baseline cannot be approved because unresolved human approval questions remain: {string.Join(" | ", unresolvedQuestions)}.");
        }
    }

    private sealed record ArtifactGenerationResult(string ArtifactPath, TokenUsage? Usage, long DurationMs, PhaseExecutionMetadata? Execution, string? ReceiptPath = null);
    private sealed record RefinementAssessment(bool IsReady, string Reason, IReadOnlyCollection<string> Questions, string Summary);
    private sealed record CaptureTransitionResult(string ArtifactPath, TokenUsage? Usage, long DurationMs, PhaseExecutionMetadata? Execution);

    private static string BuildInitialTimeline(string usId, string title, string actor, string? runtimeVersion)
    {
        var timestamp = DateTimeOffset.UtcNow.ToString("O");
        var lines = new List<string>
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
        };

        if (!string.IsNullOrWhiteSpace(runtimeVersion))
        {
            lines.Add("- Execution:");
            lines.Add("  - provider: `specforge`");
            lines.Add("  - model: `workflow`");
            lines.Add($"  - runtime-version: `{runtimeVersion}`");
        }

        return string.Join(Environment.NewLine, lines) + Environment.NewLine;
    }

    private static string NormalizeActor(string? actor) =>
        string.IsNullOrWhiteSpace(actor) ? "user" : actor.Trim();

    private static string BuildSpecApprovalValidationPrompt() =>
        """
        Validate the approved spec artifact against the recorded human approval answers.
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

    private static async Task<SpecDocument> LoadCurrentSpecDocumentAsync(
        UserStoryFilePaths paths,
        CancellationToken cancellationToken)
    {
        var jsonPath = paths.GetLatestExistingPhaseArtifactJsonPath(PhaseId.Spec);
        if (!string.IsNullOrWhiteSpace(jsonPath) && File.Exists(jsonPath))
        {
            return SpecJson.Parse(await File.ReadAllTextAsync(jsonPath, cancellationToken));
        }

        var markdownPath = paths.GetLatestExistingPhaseArtifactPath(PhaseId.Spec)
            ?? throw new WorkflowDomainException("The spec artifact does not exist yet.");
        return SpecMarkdownImporter.Import(await File.ReadAllTextAsync(markdownPath, cancellationToken));
    }

    private static async Task<SpecDocument> LoadSpecDocumentForArtifactAsync(
        UserStoryFilePaths paths,
        string markdownPath,
        CancellationToken cancellationToken)
    {
        var version = ExtractArtifactVersion(markdownPath);
        var jsonPath = paths.GetPhaseArtifactJsonPath(PhaseId.Spec, version);
        if (File.Exists(jsonPath))
        {
            return SpecJson.Parse(await File.ReadAllTextAsync(jsonPath, cancellationToken));
        }

        return SpecMarkdownImporter.Import(await File.ReadAllTextAsync(markdownPath, cancellationToken));
    }

    private static void EnsureMaterializedSpecIsUsable(string markdown)
    {
        var validation = SpecBaselineSchemaValidator.Validate(markdown);
        if (validation.MissingSections.Count == 0 && validation.PlaceholderSections.Count == 0)
        {
            return;
        }

        var builder = new StringBuilder("The generated spec artifact is unusable.");
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

    private static RefinementAssessment ParseRefinementArtifact(string markdown)
    {
        var state = MarkdownHelper.ReadSection(markdown, "## State").Trim();
        var decision = MarkdownHelper.ReadSection(markdown, "## Decision").Trim();
        var reason = MarkdownHelper.ReadSection(markdown, "## Reason").Trim();
        var questionsSection = MarkdownHelper.ReadSection(markdown, "## Questions").Trim();
        var questions = DeduplicateRefinementQuestions(
            questionsSection
                .Split('\n', StringSplitOptions.RemoveEmptyEntries)
                .Select(static line => line.Trim())
                .Where(static line => line.Length > 0 && char.IsDigit(line[0]))
                .Select(static line =>
                {
                    var separator = line.IndexOf(". ", StringComparison.Ordinal);
                    return separator > 0 ? line[(separator + 2)..].Trim() : line;
                })
                .Where(static line => !string.Equals(line, NoRefinementQuestionsRemain, StringComparison.OrdinalIgnoreCase))
                .ToArray());
        var isReady = HasReadyForSpecSignal(state, decision, questionsSection, questions);

        return new RefinementAssessment(
            isReady,
            reason,
            questions,
            isReady
                ? "Refinement pre-flight passed. Advancing to spec."
                : "Refinement questions were generated and recorded in `us.md`.");
    }

    private static bool HasReadyForSpecSignal(
        string state,
        string decision,
        string questionsSection,
        IReadOnlyCollection<string> pendingQuestions)
    {
        if (ContainsReadyForSpecToken(decision) || ContainsReadyForSpecToken(state))
        {
            return true;
        }

        return pendingQuestions.Count == 0
               && questionsSection.Contains(
                   NoRefinementQuestionsRemain,
                   StringComparison.OrdinalIgnoreCase)
               && (decision.Contains("proceed", StringComparison.OrdinalIgnoreCase)
                   || decision.Contains("sufficient", StringComparison.OrdinalIgnoreCase)
                   || state.Contains("ready", StringComparison.OrdinalIgnoreCase));
    }

    private static bool ContainsReadyForSpecToken(string value) =>
        value.Contains(ReadyForSpecDecision, StringComparison.OrdinalIgnoreCase);

    private static IReadOnlyCollection<string> DeduplicateRefinementQuestions(IReadOnlyCollection<string> questions)
    {
        var deduplicated = new List<string>();
        var signatures = new List<HashSet<string>>();

        foreach (var question in questions)
        {
            var normalizedQuestion = NormalizeRefinementQuestion(question);
            if (string.IsNullOrWhiteSpace(normalizedQuestion))
            {
                continue;
            }

            var candidateSignature = BuildRefinementQuestionSignature(normalizedQuestion);
            var isDuplicate = false;

            for (var index = 0; index < deduplicated.Count; index++)
            {
                if (AreRefinementQuestionsEquivalent(
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

    private static bool AreRefinementQuestionsEquivalent(
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

    private static string NormalizeRefinementQuestion(string question) =>
        Regex.Replace(question.Trim(), "\\s+", " ");

    private static HashSet<string> BuildRefinementQuestionSignature(string question)
    {
        var normalized = RemoveDiacritics(question).ToLowerInvariant();
        var rawTokens = Regex.Split(normalized, "[^a-z0-9]+");
        var tokens = new HashSet<string>(StringComparer.Ordinal);

        foreach (var rawToken in rawTokens)
        {
            var token = NormalizeRefinementQuestionToken(rawToken);
            if (token.Length < 3 || RefinementQuestionStopWords.Contains(token))
            {
                continue;
            }

            tokens.Add(token);
        }

        return tokens;
    }

    private static string NormalizeRefinementQuestionToken(string token)
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

    private static async Task UpdateRefinementLogAsync(
        UserStoryFilePaths paths,
        RefinementAssessment refinement,
        string refinementTolerance,
        CancellationToken cancellationToken)
    {
        var existing = await ReadRefinementSessionAsync(paths, cancellationToken);
        var items = refinement.Questions
            .Select((question, index) => new RefinementItem(
                index + 1,
                question,
                existing?.Items.FirstOrDefault(item => string.Equals(item.Question, question, StringComparison.Ordinal))?.Answer))
            .ToArray();
        var session = new RefinementSession(
            refinement.IsReady ? "ready_for_spec" : "needs_refinement",
            refinementTolerance,
            refinement.Reason,
            items);
        await PersistRefinementSessionAsync(paths, session, cancellationToken);
    }

    private static async Task<RefinementSession?> ReadRefinementSessionAsync(
        UserStoryFilePaths paths,
        CancellationToken cancellationToken)
    {
        if (File.Exists(paths.RefinementFilePath))
        {
            var refinementMarkdown = await File.ReadAllTextAsync(paths.RefinementFilePath, cancellationToken);
            var session = UserStoryRefinementMarkdown.Parse(refinementMarkdown);
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
        return UserStoryRefinementMarkdown.Parse(userStoryMarkdown);
    }

    private static async Task PersistRefinementSessionAsync(
        UserStoryFilePaths paths,
        RefinementSession session,
        CancellationToken cancellationToken)
    {
        Directory.CreateDirectory(paths.RootDirectory);
        await File.WriteAllTextAsync(paths.RefinementFilePath, UserStoryRefinementMarkdown.Serialize(session), cancellationToken);

        if (File.Exists(paths.MainArtifactPath))
        {
            var userStoryMarkdown = await File.ReadAllTextAsync(paths.MainArtifactPath, cancellationToken);
            var cleaned = UserStoryRefinementMarkdown.Remove(userStoryMarkdown);
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
