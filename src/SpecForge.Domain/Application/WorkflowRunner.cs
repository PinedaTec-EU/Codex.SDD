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
        "must", "have", "there", "will", "then", "than", "user", "users", "field", "should", "exactly", "only",
        "use", "used", "using", "see", "show", "shown", "visible", "label", "allow", "allowed", "require", "required",
        "que", "del", "las", "los", "para", "por", "con", "una", "uno", "unos", "unas", "como", "debe", "deben",
        "deberia", "tambien", "sobre", "desde", "esta", "este", "estos", "estas", "hay", "cual", "cuales", "campo",
        "usuario", "de", "la", "el", "un", "es", "en", "si", "sin", "sea", "solo"
    ];

    private readonly UserStoryFileStore fileStore;
    private readonly IPhaseExecutionProvider phaseExecutionProvider;
    private readonly RepositoryCategoryCatalog repositoryCategoryCatalog;

    public WorkflowRunner()
        : this(new UserStoryFileStore(), new DeterministicPhaseExecutionProvider(), new RepositoryCategoryCatalog())
    {
    }

    public WorkflowRunner(IPhaseExecutionProvider phaseExecutionProvider)
        : this(new UserStoryFileStore(), phaseExecutionProvider, new RepositoryCategoryCatalog())
    {
    }

    internal WorkflowRunner(
        UserStoryFileStore fileStore,
        IPhaseExecutionProvider phaseExecutionProvider,
        RepositoryCategoryCatalog? repositoryCategoryCatalog = null)
    {
        this.fileStore = fileStore ?? throw new ArgumentNullException(nameof(fileStore));
        this.phaseExecutionProvider = phaseExecutionProvider ?? throw new ArgumentNullException(nameof(phaseExecutionProvider));
        this.repositoryCategoryCatalog = repositoryCategoryCatalog ?? new RepositoryCategoryCatalog();
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
        string actor = "user",
        CancellationToken cancellationToken = default)
    {
        var paths = UserStoryFilePaths.ResolveFromWorkspaceRoot(workspaceRoot, usId);
        var workflowRun = await fileStore.LoadAsync(paths.RootDirectory, cancellationToken);
        await EnsureCurrentPhaseIsApprovableAsync(paths, workflowRun.CurrentPhase, cancellationToken);
        var metadata = await ReadUserStoryMetadataAsync(paths.MainArtifactPath, usId, cancellationToken);
        var workBranchName = BuildWorkBranchName(usId, metadata.Title, metadata.Kind);
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

        if (workflowRun.Branch is not null && workflowRun.CurrentPhase == PhaseId.Refinement)
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

    public async Task<RequestRegressionResult> RequestRegressionAsync(
        string workspaceRoot,
        string usId,
        PhaseId targetPhase,
        string? reason = null,
        string actor = "user",
        CancellationToken cancellationToken = default)
    {
        var paths = UserStoryFilePaths.ResolveFromWorkspaceRoot(workspaceRoot, usId);
        var workflowRun = await fileStore.LoadAsync(paths.RootDirectory, cancellationToken);
        workflowRun.RequestRegression(targetPhase);
        await fileStore.SaveAsync(workflowRun, paths.RootDirectory, cancellationToken);

        var summary = $"Workflow regressed to phase `{WorkflowPresentation.ToPhaseSlug(targetPhase)}`.";
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
        var regeneration = await ContinueFromCaptureOrClarificationAsync(workspaceRoot, paths, restartedRun, cancellationToken);
        var generatedArtifactPath = regeneration.ArtifactPath;
        await fileStore.SaveAsync(restartedRun, paths.RootDirectory, cancellationToken);

        await AppendTimelineEventAsync(
            paths.TimelineFilePath,
            "source_hash_mismatch_detected",
            "system",
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

    public async Task<ContinuePhaseResult> ContinuePhaseAsync(
        string workspaceRoot,
        string usId,
        CancellationToken cancellationToken = default)
    {
        var paths = UserStoryFilePaths.ResolveFromWorkspaceRoot(workspaceRoot, usId);
        var workflowRun = await fileStore.LoadAsync(paths.RootDirectory, cancellationToken);

        if (workflowRun.CurrentPhase is PhaseId.Capture or PhaseId.Clarification)
        {
            var clarificationResult = await ContinueFromCaptureOrClarificationAsync(workspaceRoot, paths, workflowRun, cancellationToken);
            await fileStore.SaveAsync(workflowRun, paths.RootDirectory, cancellationToken);
            return new ContinuePhaseResult(workflowRun.UsId, workflowRun.CurrentPhase, workflowRun.Status, clarificationResult.ArtifactPath, clarificationResult.Usage);
        }

        workflowRun.GenerateNextPhase();

        string? artifactPath = null;
        TokenUsage? usage = null;
        long? durationMs = null;
        if (HasArtifact(workflowRun.CurrentPhase))
        {
            var generation = await MaterializePhaseArtifactAsync(workspaceRoot, paths, workflowRun, currentArtifactPath: null, operationPrompt: null, cancellationToken);
            artifactPath = generation.ArtifactPath;
            usage = generation.Usage;
            durationMs = generation.DurationMs;
            await AppendTimelineEventAsync(
                paths.TimelineFilePath,
                "phase_completed",
                "system",
                workflowRun.CurrentPhase,
                $"Generated artifact for phase `{WorkflowPresentation.ToPhaseSlug(workflowRun.CurrentPhase)}`.",
                cancellationToken,
                artifactPath,
                usage,
                durationMs);
        }
        else
        {
            await AppendTimelineEventAsync(
                paths.TimelineFilePath,
                "phase_started",
                "system",
                workflowRun.CurrentPhase,
                $"Transitioned to phase `{WorkflowPresentation.ToPhaseSlug(workflowRun.CurrentPhase)}`.",
                cancellationToken);
        }

        await fileStore.SaveAsync(workflowRun, paths.RootDirectory, cancellationToken);
        return new ContinuePhaseResult(workflowRun.UsId, workflowRun.CurrentPhase, workflowRun.Status, artifactPath, usage);
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
            generation.DurationMs);

        return new OperateCurrentPhaseArtifactResult(
            workflowRun.UsId,
            WorkflowPresentation.ToPhaseSlug(workflowRun.CurrentPhase),
            WorkflowPresentation.ToStatusSlug(workflowRun.Status),
            operationLogPath,
            sourceArtifactPath,
            generation.ArtifactPath,
            generation.Usage);
    }

    private async Task<CaptureTransitionResult> ContinueFromCaptureOrClarificationAsync(
        string workspaceRoot,
        UserStoryFilePaths paths,
        WorkflowRun workflowRun,
        CancellationToken cancellationToken)
    {
        if (workflowRun.CurrentPhase == PhaseId.Capture)
        {
            workflowRun.GenerateNextPhase();
        }

        var clarificationGeneration = await MaterializePhaseArtifactAsync(workspaceRoot, paths, workflowRun, currentArtifactPath: null, operationPrompt: null, cancellationToken);
        var clarification = ParseClarificationArtifact(await File.ReadAllTextAsync(clarificationGeneration.ArtifactPath, cancellationToken));
        await UpdateClarificationLogAsync(paths, clarification, cancellationToken);
        await AppendTimelineEventAsync(
            paths.TimelineFilePath,
            clarification.IsReady ? "clarification_passed" : "clarification_requested",
            "system",
            workflowRun.CurrentPhase,
            clarification.Summary,
            cancellationToken,
            clarificationGeneration.ArtifactPath,
            clarificationGeneration.Usage,
            clarificationGeneration.DurationMs);

        if (!clarification.IsReady)
        {
            workflowRun.RestoreState(PhaseId.Clarification, UserStoryStatus.WaitingUser);
            return new CaptureTransitionResult(clarificationGeneration.ArtifactPath, clarificationGeneration.Usage, clarificationGeneration.DurationMs);
        }

        workflowRun.GenerateNextPhase();
        var refinementGeneration = await MaterializePhaseArtifactAsync(workspaceRoot, paths, workflowRun, currentArtifactPath: null, operationPrompt: null, cancellationToken);
        await AppendTimelineEventAsync(
            paths.TimelineFilePath,
            "phase_completed",
            "system",
            workflowRun.CurrentPhase,
            $"Generated artifact for phase `{WorkflowPresentation.ToPhaseSlug(workflowRun.CurrentPhase)}` after clarification.",
            cancellationToken,
            refinementGeneration.ArtifactPath,
            refinementGeneration.Usage,
            refinementGeneration.DurationMs);

        return new CaptureTransitionResult(refinementGeneration.ArtifactPath, refinementGeneration.Usage, refinementGeneration.DurationMs);
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

        await File.WriteAllTextAsync(artifactPath, result.Content, cancellationToken);
        return new ArtifactGenerationResult(artifactPath, result.Usage, stopwatch.ElapsedMilliseconds);
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
        var objective = ReadMarkdownSection(userStory, "## Objective", "## Objetivo");
        return objective == "..." ? userStory.Trim() : objective;
    }

    private static string ReadMarkdownSection(string markdown, params string[] headings)
    {
        var lines = markdown.Replace("\r\n", "\n", StringComparison.Ordinal).Split('\n');
        for (var index = 0; index < lines.Length; index++)
        {
            if (!headings.Contains(lines[index], StringComparer.Ordinal))
            {
                continue;
            }

            var builder = new StringBuilder();
            for (var cursor = index + 1; cursor < lines.Length; cursor++)
            {
                if (lines[cursor].StartsWith("## ", StringComparison.Ordinal))
                {
                    break;
                }

                builder.AppendLine(lines[cursor]);
            }

            var content = builder.ToString().Trim();
            if (!string.IsNullOrWhiteSpace(content))
            {
                return content;
            }
        }

        return "...";
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

    private static async Task<IReadOnlyCollection<string>> ResetDerivedArtifactsAsync(
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

        await Task.CompletedTask;
        Directory.CreateDirectory(paths.PhasesDirectoryPath);
        return deletedPaths;
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
        long? durationMs = null)
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

        if (durationMs is not null)
        {
            builder.AppendLine($"- Duration: `{durationMs}` ms");
        }

        await File.AppendAllTextAsync(timelinePath, builder.ToString(), cancellationToken);
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

    private sealed record ArtifactGenerationResult(string ArtifactPath, TokenUsage? Usage, long DurationMs);
    private sealed record ClarificationAssessment(bool IsReady, string Reason, IReadOnlyCollection<string> Questions, string Summary);
    private sealed record CaptureTransitionResult(string ArtifactPath, TokenUsage? Usage, long DurationMs);

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
        var title = ReadHeading(userStory, usId);
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
        var decision = ReadMarkdownSection(markdown, "## Decision").Trim();
        var reason = ReadMarkdownSection(markdown, "## Reason").Trim();
        var questionsSection = ReadMarkdownSection(markdown, "## Questions").Trim();
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
            ReadCaptureTolerance(),
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

    private static string ReadCaptureTolerance()
    {
        var configured = Environment.GetEnvironmentVariable("SPECFORGE_CAPTURE_TOLERANCE")?.Trim().ToLowerInvariant();
        return configured is "strict" or "balanced" or "inferential" ? configured : "balanced";
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

    private static string ReadHeading(string markdown, string fallback)
    {
        using var reader = new StringReader(markdown);
        string? line;
        while ((line = reader.ReadLine()) is not null)
        {
            if (line.StartsWith("# ", StringComparison.Ordinal))
            {
                return line[2..].Trim();
            }
        }

        return fallback;
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
        var slug = BuildShortSlug(title);
        return $"{kind}/{usId.ToLowerInvariant()}-{slug}";
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
