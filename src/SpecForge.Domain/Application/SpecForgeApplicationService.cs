using SpecForge.Domain.Persistence;
using SpecForge.Domain.Workflow;

namespace SpecForge.Domain.Application;

public sealed class SpecForgeApplicationService
{
    private readonly UserStoryFileStore fileStore;
    private readonly WorkflowRunner workflowRunner;
    private readonly RepositoryPromptInitializer repositoryPromptInitializer;
    private readonly RepositoryCategoryCatalog repositoryCategoryCatalog;
    private readonly UserStoryRuntimeStatusStore runtimeStatusStore;

    public SpecForgeApplicationService()
        : this(new UserStoryFileStore(), new WorkflowRunner(), new RepositoryPromptInitializer(), new RepositoryCategoryCatalog(), new UserStoryRuntimeStatusStore())
    {
    }

    public SpecForgeApplicationService(
        UserStoryFileStore fileStore,
        WorkflowRunner workflowRunner,
        RepositoryPromptInitializer? repositoryPromptInitializer = null,
        RepositoryCategoryCatalog? repositoryCategoryCatalog = null,
        UserStoryRuntimeStatusStore? runtimeStatusStore = null)
    {
        this.fileStore = fileStore ?? throw new ArgumentNullException(nameof(fileStore));
        this.workflowRunner = workflowRunner ?? throw new ArgumentNullException(nameof(workflowRunner));
        this.repositoryPromptInitializer = repositoryPromptInitializer ?? new RepositoryPromptInitializer();
        this.repositoryCategoryCatalog = repositoryCategoryCatalog ?? new RepositoryCategoryCatalog();
        this.runtimeStatusStore = runtimeStatusStore ?? new UserStoryRuntimeStatusStore();
    }

    public Task<InitializeRepoPromptsResult> InitializeRepoPromptsAsync(
        string workspaceRoot,
        bool overwrite = false,
        CancellationToken cancellationToken = default) =>
        repositoryPromptInitializer.InitializeAsync(workspaceRoot, overwrite, cancellationToken);

    public async Task<CreateOrImportUserStoryResult> CreateUserStoryAsync(
        string workspaceRoot,
        string usId,
        string title,
        string kind,
        string category,
        string sourceText,
        string actor = "user",
        CancellationToken cancellationToken = default)
    {
        repositoryCategoryCatalog.EnsureCategoryIsAllowed(workspaceRoot, category);
        var rootDirectory = await workflowRunner.CreateUserStoryAsync(workspaceRoot, usId, title, kind, category, sourceText, actor, cancellationToken);
        return new CreateOrImportUserStoryResult(usId, rootDirectory, Path.Combine(rootDirectory, "us.md"));
    }

    public async Task<CreateOrImportUserStoryResult> ImportUserStoryAsync(
        string workspaceRoot,
        string usId,
        string sourcePath,
        string title,
        string kind,
        string category,
        string actor = "user",
        CancellationToken cancellationToken = default)
    {
        var sourceText = await File.ReadAllTextAsync(sourcePath, cancellationToken);
        return await CreateUserStoryAsync(workspaceRoot, usId, title, kind, category, sourceText, actor, cancellationToken);
    }

    public async Task<IReadOnlyCollection<UserStorySummary>> ListUserStoriesAsync(
        string workspaceRoot,
        CancellationToken cancellationToken = default)
    {
        var specsRoot = Path.Combine(
            workspaceRoot,
            UserStoryFilePaths.SpecsDirectoryName,
            UserStoryFilePaths.UserStoriesDirectoryName);

        if (!Directory.Exists(specsRoot))
        {
            return [];
        }

        var directories = Directory.GetDirectories(specsRoot, "*", SearchOption.TopDirectoryOnly)
            .SelectMany(categoryDirectory => Directory.GetDirectories(categoryDirectory, "US-*", SearchOption.TopDirectoryOnly))
            .ToArray();
        var summaries = new List<UserStorySummary>(directories.Length);

        foreach (var directory in directories.OrderBy(static directory => directory, StringComparer.Ordinal))
        {
            summaries.Add(await GetUserStorySummaryFromDirectoryAsync(directory, cancellationToken));
        }

        return summaries;
    }

    public async Task<UserStorySummary> GetUserStorySummaryAsync(
        string workspaceRoot,
        string usId,
        CancellationToken cancellationToken = default)
    {
        var paths = UserStoryFilePaths.ResolveFromWorkspaceRoot(workspaceRoot, usId);
        return await GetUserStorySummaryFromDirectoryAsync(paths.RootDirectory, cancellationToken);
    }

    public async Task<UserStoryWorkflowDetails> GetUserStoryWorkflowAsync(
        string workspaceRoot,
        string usId,
        CancellationToken cancellationToken = default)
    {
        var paths = UserStoryFilePaths.ResolveFromWorkspaceRoot(workspaceRoot, usId);
        var workflowRun = await fileStore.LoadAsync(paths.RootDirectory, cancellationToken);
        var title = await ReadTitleAsync(paths.MainArtifactPath, cancellationToken);
        var metadata = await WorkflowRunner.ReadUserStoryMetadataAsync(paths.MainArtifactPath, workflowRun.UsId, cancellationToken);
        var rawTimeline = File.Exists(paths.TimelineFilePath)
            ? await File.ReadAllTextAsync(paths.TimelineFilePath, cancellationToken)
            : string.Empty;
        var clarification = await ReadClarificationSessionAsync(paths, cancellationToken);
        var approvalQuestions = await ReadApprovalQuestionsAsync(paths, cancellationToken);
        var currentPhase = await GetCurrentPhaseAsync(workspaceRoot, usId, cancellationToken);

        return new UserStoryWorkflowDetails(
            workflowRun.UsId,
            title,
            metadata.Kind,
            metadata.Category,
            WorkflowPresentation.ToStatusSlug(workflowRun.Status),
            WorkflowPresentation.ToPhaseSlug(workflowRun.CurrentPhase),
            paths.RootDirectory,
            workflowRun.Branch?.WorkBranchName,
            paths.MainArtifactPath,
            paths.TimelineFilePath,
            rawTimeline,
            BuildPhaseDetails(workflowRun, paths),
            new CurrentPhaseControls(
                currentPhase.CanAdvance,
                currentPhase.CanApprove,
                currentPhase.RequiresApproval,
                currentPhase.BlockingReason,
                workflowRun.CurrentPhase != Workflow.PhaseId.Capture,
                BuildRegressionTargets(workflowRun),
                BuildRewindTargets(workflowRun)),
            clarification is null
                ? null
                : new ClarificationSessionDetails(
                    clarification.Status,
                    clarification.Tolerance,
                    clarification.Reason,
                    clarification.Items.Select(item => new ClarificationQuestionAnswerDetails(item.Index, item.Question, item.Answer)).ToArray()),
            approvalQuestions,
            TimelineMarkdownParser.ParseEvents(rawTimeline),
            paths.ContextDirectoryPath,
            BuildFileDetails(paths.ContextDirectoryPath),
            paths.AttachmentsDirectoryPath,
            BuildFileDetails(paths.AttachmentsDirectoryPath));
    }

    private async Task<UserStorySummary> GetUserStorySummaryFromDirectoryAsync(
        string directory,
        CancellationToken cancellationToken)
    {
        var mainArtifactPath = Path.Combine(directory, "us.md");
        var workflowRun = await fileStore.LoadAsync(directory, cancellationToken);
        var title = await ReadTitleAsync(mainArtifactPath, cancellationToken);
        var metadata = await WorkflowRunner.ReadUserStoryMetadataAsync(mainArtifactPath, workflowRun.UsId, cancellationToken);

        return new UserStorySummary(
            workflowRun.UsId,
            title,
            metadata.Category,
            directory,
            mainArtifactPath,
            WorkflowPresentation.ToPhaseSlug(workflowRun.CurrentPhase),
            WorkflowPresentation.ToStatusSlug(workflowRun.Status),
            workflowRun.Branch?.WorkBranchName);
    }

    public async Task<CurrentPhaseSummary> GetCurrentPhaseAsync(
        string workspaceRoot,
        string usId,
        CancellationToken cancellationToken = default)
    {
        var paths = UserStoryFilePaths.ResolveFromWorkspaceRoot(workspaceRoot, usId);
        var workflowRun = await fileStore.LoadAsync(paths.RootDirectory, cancellationToken);
        var runtime = await runtimeStatusStore.GetAsync(
            paths.RootDirectory,
            usId,
            WorkflowPresentation.ToPhaseSlug(workflowRun.CurrentPhase),
            cancellationToken);

        if (runtime.Status == RuntimeStatus.Running && !runtime.IsStale)
        {
            return new CurrentPhaseSummary(
                workflowRun.UsId,
                WorkflowPresentation.ToPhaseSlug(workflowRun.CurrentPhase),
                WorkflowPresentation.ToStatusSlug(workflowRun.Status),
                false,
                false,
                workflowRun.Definition.RequiresApproval(workflowRun.CurrentPhase),
                "phase_execution_in_progress");
        }

        if (workflowRun.CurrentPhase == Workflow.PhaseId.Clarification)
        {
            var clarification = await ReadClarificationSessionAsync(paths, cancellationToken);
            var canAdvanceClarification = UserStoryClarificationMarkdown.HasAllAnswers(clarification);
            return new CurrentPhaseSummary(
                workflowRun.UsId,
                WorkflowPresentation.ToPhaseSlug(workflowRun.CurrentPhase),
                WorkflowPresentation.ToStatusSlug(workflowRun.Status),
                canAdvanceClarification,
                false,
                false,
                canAdvanceClarification ? null : "clarification_pending_answers");
        }

        var requiresApproval = workflowRun.Definition.RequiresApproval(workflowRun.CurrentPhase);
        var canAdvance = !requiresApproval || workflowRun.IsPhaseApproved(workflowRun.CurrentPhase);
        var canApprove = requiresApproval && !canAdvance;
        if (canApprove && workflowRun.CurrentPhase == Workflow.PhaseId.Refinement)
        {
            var refinementPath = paths.GetLatestExistingPhaseArtifactPath(Workflow.PhaseId.Refinement);
            if (string.IsNullOrWhiteSpace(refinementPath) || !File.Exists(refinementPath))
            {
                canApprove = false;
            }
            else
            {
                var refinementMarkdown = await File.ReadAllTextAsync(refinementPath, cancellationToken);
                canApprove = SpecBaselineSchemaValidator.Validate(refinementMarkdown).IsValid;
                if (canApprove)
                {
                    var refinementDocument = await LoadCurrentRefinementDocumentAsync(paths, cancellationToken);
                    canApprove = RefinementSpecJson.GetUnresolvedQuestions(refinementDocument).Count == 0;
                }
            }
        }

        string? blockingReason = null;
        if (!canAdvance)
        {
            blockingReason = $"{WorkflowPresentation.ToPhaseSlug(workflowRun.CurrentPhase)}_pending_user_approval";
        }
        else
        {
            var readiness = ResolveNextPhaseExecutionReadiness(workflowRun);
            if (!readiness.CanExecute)
            {
                canAdvance = false;
                blockingReason = readiness.BlockingReason;
            }
        }

        return new CurrentPhaseSummary(
            workflowRun.UsId,
            WorkflowPresentation.ToPhaseSlug(workflowRun.CurrentPhase),
            WorkflowPresentation.ToStatusSlug(workflowRun.Status),
            canAdvance,
            canApprove,
            requiresApproval,
            blockingReason);
    }

    public async Task<ContinuePhaseResponse> GenerateNextPhaseAsync(
        string workspaceRoot,
        string usId,
        string actor = "user",
        CancellationToken cancellationToken = default)
    {
        var currentPhase = await GetCurrentPhaseAsync(workspaceRoot, usId, cancellationToken);
        if (!currentPhase.CanAdvance)
        {
            throw new WorkflowDomainException(
                $"Workflow cannot continue from phase '{currentPhase.CurrentPhase}' because '{currentPhase.BlockingReason ?? "phase_cannot_advance"}'.");
        }

        var paths = UserStoryFilePaths.ResolveFromWorkspaceRoot(workspaceRoot, usId);
        await using var operation = await runtimeStatusStore.StartOperationAsync(
            paths.RootDirectory,
            usId,
            currentPhase.CurrentPhase,
            "generate-next-phase",
            cancellationToken);

        try
        {
            var result = await workflowRunner.ContinuePhaseAsync(workspaceRoot, usId, actor, cancellationToken);
            var resultPhase = WorkflowPresentation.ToPhaseSlug(result.CurrentPhase);
            operation.UpdatePhase(resultPhase);
            await operation.CompleteAsync(resultPhase, cancellationToken);
            return new ContinuePhaseResponse(
                result.UsId,
                resultPhase,
                WorkflowPresentation.ToStatusSlug(result.Status),
                result.GeneratedArtifactPath,
                result.Usage,
                result.Execution);
        }
        catch (Exception exception)
        {
            await operation.FailAsync(currentPhase.CurrentPhase, exception.Message, cancellationToken);
            throw;
        }
    }

    private PhaseExecutionReadiness ResolveNextPhaseExecutionReadiness(WorkflowRun workflowRun)
    {
        if (!workflowRun.Definition.CanAdvanceFrom(workflowRun.CurrentPhase) ||
            workflowRun.CurrentPhase == Workflow.PhaseId.PrPreparation)
        {
            return new PhaseExecutionReadiness(workflowRun.CurrentPhase, CanExecute: true);
        }

        var nextPhase = workflowRun.Definition.GetNextPhase(workflowRun.CurrentPhase);
        return workflowRunner.GetPhaseExecutionReadiness(nextPhase);
    }

    public async Task<UserStoryRuntimeStatus> GetUserStoryRuntimeStatusAsync(
        string workspaceRoot,
        string usId,
        CancellationToken cancellationToken = default)
    {
        var currentPhase = await GetCurrentPhaseAsync(workspaceRoot, usId, cancellationToken);
        var paths = UserStoryFilePaths.ResolveFromWorkspaceRoot(workspaceRoot, usId);
        var runtime = await runtimeStatusStore.GetAsync(paths.RootDirectory, usId, currentPhase.CurrentPhase, cancellationToken);
        return new UserStoryRuntimeStatus(
            runtime.UsId,
            ToRuntimeStatusSlug(runtime.Status),
            runtime.ActiveOperation,
            runtime.CurrentPhase,
            runtime.StartedAtUtc?.UtcDateTime.ToString("O"),
            runtime.LastHeartbeatUtc?.UtcDateTime.ToString("O"),
            runtime.LastOutcome,
            runtime.LastCompletedAtUtc?.UtcDateTime.ToString("O"),
            runtime.Message,
            runtime.IsStale);
    }

    public async Task<ApprovalResult> ApprovePhaseAsync(
        string workspaceRoot,
        string usId,
        string? baseBranch,
        string? workBranch = null,
        string actor = "user",
        CancellationToken cancellationToken = default)
    {
        await workflowRunner.ApproveCurrentPhaseAsync(workspaceRoot, usId, baseBranch, workBranch, actor, cancellationToken);
        var summary = await GetUserStorySummaryAsync(workspaceRoot, usId, cancellationToken);
        return new ApprovalResult(summary.UsId, summary.Status, summary.CurrentPhase, baseBranch, summary.WorkBranch);
    }

    public Task<RequestRegressionResult> RequestRegressionAsync(
        string workspaceRoot,
        string usId,
        string targetPhase,
        string? reason = null,
        bool destructive = false,
        string actor = "user",
        CancellationToken cancellationToken = default)
    {
        var phaseId = WorkflowPresentation.ParsePhaseSlug(targetPhase);
        return workflowRunner.RequestRegressionAsync(workspaceRoot, usId, phaseId, reason, destructive, actor, cancellationToken);
    }

    public Task<RestartUserStoryResult> RestartUserStoryFromSourceAsync(
        string workspaceRoot,
        string usId,
        string? reason = null,
        string actor = "user",
        CancellationToken cancellationToken = default) =>
        workflowRunner.RestartUserStoryFromSourceAsync(workspaceRoot, usId, reason, actor, cancellationToken);

    public Task<RewindWorkflowResult> RewindWorkflowAsync(
        string workspaceRoot,
        string usId,
        string targetPhase,
        bool destructive = false,
        string actor = "user",
        CancellationToken cancellationToken = default)
    {
        var phaseId = WorkflowPresentation.ParsePhaseSlug(targetPhase);
        return workflowRunner.RewindWorkflowAsync(workspaceRoot, usId, phaseId, destructive, actor, cancellationToken);
    }

    public Task<ResetUserStoryResult> ResetUserStoryToCaptureAsync(
        string workspaceRoot,
        string usId,
        CancellationToken cancellationToken = default) =>
        workflowRunner.ResetUserStoryToCaptureAsync(workspaceRoot, usId, cancellationToken);

    public Task<SubmitClarificationAnswersResult> SubmitClarificationAnswersAsync(
        string workspaceRoot,
        string usId,
        IReadOnlyList<string> answers,
        string actor = "user",
        CancellationToken cancellationToken = default) =>
        workflowRunner.SubmitClarificationAnswersAsync(workspaceRoot, usId, answers, actor, cancellationToken);

    public Task<SubmitApprovalAnswerResult> SubmitApprovalAnswerAsync(
        string workspaceRoot,
        string usId,
        string question,
        string answer,
        string actor = "user",
        CancellationToken cancellationToken = default) =>
        workflowRunner.SubmitApprovalAnswerAsync(workspaceRoot, usId, question, answer, actor, cancellationToken);

    public Task<OperateCurrentPhaseArtifactResult> OperateCurrentPhaseArtifactAsync(
        string workspaceRoot,
        string usId,
        string prompt,
        string actor = "user",
        CancellationToken cancellationToken = default) =>
        workflowRunner.OperateCurrentPhaseArtifactAsync(workspaceRoot, usId, prompt, actor, cancellationToken);

    public Task<UserStoryFilesResult> ListUserStoryFilesAsync(
        string workspaceRoot,
        string usId,
        CancellationToken cancellationToken = default)
    {
        var paths = UserStoryFilePaths.ResolveFromWorkspaceRoot(workspaceRoot, usId);
        return Task.FromResult(new UserStoryFilesResult(
            usId,
            BuildFileDetails(paths.ContextDirectoryPath),
            BuildFileDetails(paths.AttachmentsDirectoryPath)));
    }

    public async Task<UserStoryFilesResult> AddUserStoryFilesAsync(
        string workspaceRoot,
        string usId,
        IReadOnlyCollection<string> sourcePaths,
        string kind,
        CancellationToken cancellationToken = default)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(workspaceRoot);
        ArgumentException.ThrowIfNullOrWhiteSpace(usId);
        var normalizedKind = NormalizeUserStoryFileKind(kind);
        var paths = UserStoryFilePaths.ResolveFromWorkspaceRoot(workspaceRoot, usId);
        var targetDirectoryPath = GetDirectoryPathForFileKind(paths, normalizedKind);
        Directory.CreateDirectory(targetDirectoryPath);

        foreach (var sourcePath in sourcePaths)
        {
            cancellationToken.ThrowIfCancellationRequested();
            var resolvedSourcePath = ResolveWorkspaceOrAbsolutePath(workspaceRoot, sourcePath);
            if (!File.Exists(resolvedSourcePath))
            {
                throw new FileNotFoundException($"The provided file path does not exist: {resolvedSourcePath}.", resolvedSourcePath);
            }

            var targetPath = GetNextAvailableFilePath(targetDirectoryPath, Path.GetFileName(resolvedSourcePath));
            await using var sourceStream = File.OpenRead(resolvedSourcePath);
            await using var targetStream = File.Create(targetPath);
            await sourceStream.CopyToAsync(targetStream, cancellationToken);
        }

        return await ListUserStoryFilesAsync(workspaceRoot, usId, cancellationToken);
    }

    public async Task<UserStoryFilesResult> SetUserStoryFileKindAsync(
        string workspaceRoot,
        string usId,
        string filePath,
        string kind,
        CancellationToken cancellationToken = default)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(workspaceRoot);
        ArgumentException.ThrowIfNullOrWhiteSpace(usId);
        ArgumentException.ThrowIfNullOrWhiteSpace(filePath);
        var normalizedKind = NormalizeUserStoryFileKind(kind);
        var paths = UserStoryFilePaths.ResolveFromWorkspaceRoot(workspaceRoot, usId);
        var resolvedFilePath = ResolveWorkspaceOrAbsolutePath(workspaceRoot, filePath);
        var normalizedFilePath = Path.GetFullPath(resolvedFilePath);
        var normalizedContextDirectory = Path.GetFullPath(paths.ContextDirectoryPath);
        var normalizedAttachmentsDirectory = Path.GetFullPath(paths.AttachmentsDirectoryPath);

        if (!File.Exists(normalizedFilePath))
        {
            throw new FileNotFoundException($"The provided file path does not exist: {normalizedFilePath}.", normalizedFilePath);
        }

        var currentDirectory = Path.GetDirectoryName(normalizedFilePath)
            ?? throw new InvalidOperationException("The file path does not have a parent directory.");
        var isContextFile = string.Equals(currentDirectory, normalizedContextDirectory, StringComparison.Ordinal);
        var isAttachmentFile = string.Equals(currentDirectory, normalizedAttachmentsDirectory, StringComparison.Ordinal);
        if (!isContextFile && !isAttachmentFile)
        {
            throw new InvalidOperationException("The file must already belong to the current user story.");
        }

        var targetDirectoryPath = GetDirectoryPathForFileKind(paths, normalizedKind);
        Directory.CreateDirectory(targetDirectoryPath);
        if (string.Equals(Path.GetFullPath(targetDirectoryPath), currentDirectory, StringComparison.Ordinal))
        {
            return await ListUserStoryFilesAsync(workspaceRoot, usId, cancellationToken);
        }

        var targetPath = GetNextAvailableFilePath(targetDirectoryPath, Path.GetFileName(normalizedFilePath));
        File.Move(normalizedFilePath, targetPath);
        return await ListUserStoryFilesAsync(workspaceRoot, usId, cancellationToken);
    }

    private static async Task<string> ReadTitleAsync(string filePath, CancellationToken cancellationToken)
    {
        var lines = await File.ReadAllLinesAsync(filePath, cancellationToken);
        var titleLine = lines.FirstOrDefault(static line => line.StartsWith("# ", StringComparison.Ordinal));
        return titleLine?.Replace("# ", string.Empty, StringComparison.Ordinal).Trim()
            ?? Path.GetFileName(Path.GetDirectoryName(filePath) ?? filePath);
    }

    private static IReadOnlyCollection<WorkflowPhaseDetails> BuildPhaseDetails(
        Workflow.WorkflowRun workflowRun,
        UserStoryFilePaths paths)
    {
        var phases = new[]
        {
            Workflow.PhaseId.Capture,
            Workflow.PhaseId.Clarification,
            Workflow.PhaseId.Refinement,
            Workflow.PhaseId.TechnicalDesign,
            Workflow.PhaseId.Implementation,
            Workflow.PhaseId.Review,
            Workflow.PhaseId.ReleaseApproval,
            Workflow.PhaseId.PrPreparation
        };

        return phases
            .Select((phaseId, index) =>
            {
                var requiresApproval = workflowRun.Definition.RequiresApproval(phaseId);
                return new WorkflowPhaseDetails(
                    WorkflowPresentation.ToPhaseSlug(phaseId),
                    ToPhaseTitle(phaseId),
                    index,
                    requiresApproval,
                    WorkflowPresentation.ExpectsHumanIntervention(phaseId, requiresApproval),
                    workflowRun.IsPhaseApproved(phaseId),
                    workflowRun.CurrentPhase == phaseId,
                    ResolvePhaseState(workflowRun, phaseId),
                    TryGetLatestArtifactPath(paths, phaseId),
                    TryGetLatestOperationLogPath(paths, phaseId),
                    TryGetExecutePromptPath(paths, phaseId),
                    TryGetApprovePromptPath(paths, phaseId),
                    TryGetExecuteSystemPromptPath(paths, phaseId),
                    TryGetApproveSystemPromptPath(paths, phaseId));
            })
            .ToArray();
    }

    private static IReadOnlyCollection<UserStoryFileDetails> BuildFileDetails(string directoryPath)
    {
        if (!Directory.Exists(directoryPath))
        {
            return [];
        }

        return Directory.GetFiles(directoryPath, "*", SearchOption.TopDirectoryOnly)
            .OrderBy(static path => path, StringComparer.Ordinal)
            .Select(static path => new UserStoryFileDetails(Path.GetFileName(path), path))
            .ToArray();
    }

    private static string NormalizeUserStoryFileKind(string kind) => kind.Trim().ToLowerInvariant() switch
    {
        "context" => "context",
        "attachment" => "attachment",
        "us-info" => "attachment",
        "user-story" => "attachment",
        "user-story-info" => "attachment",
        _ => throw new InvalidOperationException($"Unsupported file kind '{kind}'. Expected 'context' or 'attachment'.")
    };

    private static string GetDirectoryPathForFileKind(UserStoryFilePaths paths, string kind) => kind switch
    {
        "context" => paths.ContextDirectoryPath,
        "attachment" => paths.AttachmentsDirectoryPath,
        _ => throw new InvalidOperationException($"Unsupported file kind '{kind}'.")
    };

    private static string ResolveWorkspaceOrAbsolutePath(string workspaceRoot, string filePath) =>
        Path.GetFullPath(Path.IsPathRooted(filePath) ? filePath : Path.Combine(workspaceRoot, filePath));

    private static string GetNextAvailableFilePath(string directoryPath, string fileName)
    {
        var extension = Path.GetExtension(fileName);
        var baseName = extension.Length > 0 ? fileName[..^extension.Length] : fileName;

        for (var attempt = 0; attempt < 100; attempt += 1)
        {
            var suffix = attempt == 0 ? string.Empty : $".{attempt + 1:00}";
            var candidate = Path.Combine(directoryPath, $"{baseName}{suffix}{extension}");
            if (!File.Exists(candidate))
            {
                return candidate;
            }
        }

        throw new InvalidOperationException($"Unable to persist '{fileName}' after 100 attempts.");
    }

    private static string ResolvePhaseState(Workflow.WorkflowRun workflowRun, Workflow.PhaseId phaseId)
    {
        if (workflowRun.CurrentPhase == phaseId)
        {
            return "current";
        }

        return phaseId < workflowRun.CurrentPhase ? "completed" : "pending";
    }

    private static string ToPhaseTitle(Workflow.PhaseId phaseId) => phaseId switch
    {
        Workflow.PhaseId.Capture => "Capture",
        Workflow.PhaseId.Clarification => "Refinement",
        Workflow.PhaseId.Refinement => "Spec",
        Workflow.PhaseId.TechnicalDesign => "Technical Design",
        Workflow.PhaseId.Implementation => "Implementation",
        Workflow.PhaseId.Review => "Review",
        Workflow.PhaseId.ReleaseApproval => "Release Approval",
        Workflow.PhaseId.PrPreparation => "PR Preparation",
        _ => throw new ArgumentOutOfRangeException(nameof(phaseId), phaseId, null)
    };

    private static string? TryGetLatestArtifactPath(UserStoryFilePaths paths, Workflow.PhaseId phaseId)
    {
        if (phaseId is Workflow.PhaseId.Capture or Workflow.PhaseId.ReleaseApproval or Workflow.PhaseId.PrPreparation)
        {
            return null;
        }

        return paths.GetLatestExistingPhaseArtifactPath(phaseId);
    }

    private static string? TryGetLatestOperationLogPath(UserStoryFilePaths paths, Workflow.PhaseId phaseId)
    {
        if (phaseId is Workflow.PhaseId.Capture or Workflow.PhaseId.Clarification or Workflow.PhaseId.ReleaseApproval or Workflow.PhaseId.PrPreparation)
        {
            return null;
        }

        return paths.GetLatestExistingPhaseOperationLogPath(phaseId);
    }

    private static string? TryGetExecutePromptPath(UserStoryFilePaths paths, Workflow.PhaseId phaseId)
    {
        var promptPaths = new PromptFilePaths(FindWorkspaceRoot(paths));
        var candidate = phaseId switch
        {
            Workflow.PhaseId.Clarification => promptPaths.ClarificationExecutePromptPath,
            Workflow.PhaseId.Refinement => promptPaths.RefinementExecutePromptPath,
            Workflow.PhaseId.TechnicalDesign => promptPaths.TechnicalDesignExecutePromptPath,
            Workflow.PhaseId.Implementation => promptPaths.ImplementationExecutePromptPath,
            Workflow.PhaseId.Review => promptPaths.ReviewExecutePromptPath,
            _ => null
        };

        return candidate is not null && File.Exists(candidate) ? candidate : null;
    }

    private static string? TryGetApprovePromptPath(UserStoryFilePaths paths, Workflow.PhaseId phaseId)
    {
        var promptPaths = new PromptFilePaths(FindWorkspaceRoot(paths));
        var candidate = phaseId switch
        {
            Workflow.PhaseId.Refinement => promptPaths.RefinementApprovePromptPath,
            Workflow.PhaseId.ReleaseApproval => promptPaths.ReleaseApprovalApprovePromptPath,
            _ => null
        };

        return candidate is not null && File.Exists(candidate) ? candidate : null;
    }

    private static string? TryGetExecuteSystemPromptPath(UserStoryFilePaths paths, Workflow.PhaseId phaseId)
    {
        var promptPaths = new PromptFilePaths(FindWorkspaceRoot(paths));
        var candidate = phaseId switch
        {
            Workflow.PhaseId.Clarification => promptPaths.ClarificationExecuteSystemPromptPath,
            Workflow.PhaseId.Refinement => promptPaths.RefinementExecuteSystemPromptPath,
            Workflow.PhaseId.TechnicalDesign => promptPaths.TechnicalDesignExecuteSystemPromptPath,
            Workflow.PhaseId.Implementation => promptPaths.ImplementationExecuteSystemPromptPath,
            Workflow.PhaseId.Review => promptPaths.ReviewExecuteSystemPromptPath,
            _ => null
        };

        return candidate is not null && File.Exists(candidate) ? candidate : null;
    }

    private static string? TryGetApproveSystemPromptPath(UserStoryFilePaths paths, Workflow.PhaseId phaseId)
    {
        var promptPaths = new PromptFilePaths(FindWorkspaceRoot(paths));
        var candidate = phaseId switch
        {
            Workflow.PhaseId.Refinement => promptPaths.RefinementApproveSystemPromptPath,
            Workflow.PhaseId.ReleaseApproval => promptPaths.ReleaseApprovalApproveSystemPromptPath,
            _ => null
        };

        return candidate is not null && File.Exists(candidate) ? candidate : null;
    }

    private static string FindWorkspaceRoot(UserStoryFilePaths paths)
    {
        var categoryRoot = Path.GetDirectoryName(paths.RootDirectory)
            ?? throw new InvalidOperationException("User story directory root is invalid.");
        var userStoriesRoot = Path.GetDirectoryName(categoryRoot)
            ?? throw new InvalidOperationException("User stories root is invalid.");
        var specsRoot = Path.GetDirectoryName(userStoriesRoot)
            ?? throw new InvalidOperationException("Specs root is invalid.");
        return Path.GetDirectoryName(specsRoot)
            ?? throw new InvalidOperationException("Workspace root is invalid.");
    }

    private static IReadOnlyCollection<string> BuildRegressionTargets(Workflow.WorkflowRun workflowRun)
    {
        var candidates = new[]
        {
            Workflow.PhaseId.Refinement,
            Workflow.PhaseId.TechnicalDesign,
            Workflow.PhaseId.Implementation
        };

        return candidates
            .Where(target => workflowRun.Definition.CanRegress(workflowRun.CurrentPhase, target))
            .Select(WorkflowPresentation.ToPhaseSlug)
            .ToArray();
    }

    private static IReadOnlyCollection<string> BuildRewindTargets(Workflow.WorkflowRun workflowRun)
    {
        var candidates = new[]
        {
            Workflow.PhaseId.Clarification,
            Workflow.PhaseId.Refinement,
            Workflow.PhaseId.TechnicalDesign,
            Workflow.PhaseId.Implementation,
            Workflow.PhaseId.Review,
            Workflow.PhaseId.ReleaseApproval
        };

        return candidates
            .Where(target => target < workflowRun.CurrentPhase)
            .Select(WorkflowPresentation.ToPhaseSlug)
            .ToArray();
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

    private static async Task<RefinementSpecDocument> LoadCurrentRefinementDocumentAsync(
        UserStoryFilePaths paths,
        CancellationToken cancellationToken)
    {
        var jsonPath = paths.GetLatestExistingPhaseArtifactJsonPath(Workflow.PhaseId.Refinement);
        if (!string.IsNullOrWhiteSpace(jsonPath) && File.Exists(jsonPath))
        {
            return RefinementSpecJson.Parse(await File.ReadAllTextAsync(jsonPath, cancellationToken));
        }

        var markdownPath = paths.GetLatestExistingPhaseArtifactPath(Workflow.PhaseId.Refinement)
            ?? throw new WorkflowDomainException("The refinement artifact does not exist yet.");
        return RefinementSpecMarkdownImporter.Import(await File.ReadAllTextAsync(markdownPath, cancellationToken));
    }

    private static async Task<IReadOnlyCollection<ApprovalQuestionDetails>> ReadApprovalQuestionsAsync(
        UserStoryFilePaths paths,
        CancellationToken cancellationToken)
    {
        var refinementPath = paths.GetLatestExistingPhaseArtifactPath(Workflow.PhaseId.Refinement);
        if (string.IsNullOrWhiteSpace(refinementPath))
        {
            return [];
        }

        var refinementDocument = await LoadCurrentRefinementDocumentAsync(paths, cancellationToken);
        return refinementDocument.HumanApprovalQuestions
            .Select((item, index) => new ApprovalQuestionDetails(
                index + 1,
                item.Question,
                item.Status,
                RefinementSpecJson.IsResolved(item),
                item.Answer,
                item.AnsweredBy,
                item.AnsweredAtUtc))
            .ToArray();
    }

    private static string ToRuntimeStatusSlug(RuntimeStatus status) => status switch
    {
        RuntimeStatus.Idle => "idle",
        RuntimeStatus.Running => "running",
        RuntimeStatus.Failed => "failed",
        _ => throw new ArgumentOutOfRangeException(nameof(status), status, null)
    };
}
