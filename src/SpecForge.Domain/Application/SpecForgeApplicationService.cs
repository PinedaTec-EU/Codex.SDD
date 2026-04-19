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
        CancellationToken cancellationToken = default)
    {
        repositoryCategoryCatalog.EnsureCategoryIsAllowed(workspaceRoot, category);
        var rootDirectory = await workflowRunner.CreateUserStoryAsync(workspaceRoot, usId, title, kind, category, sourceText, cancellationToken);
        return new CreateOrImportUserStoryResult(usId, rootDirectory, Path.Combine(rootDirectory, "us.md"));
    }

    public async Task<CreateOrImportUserStoryResult> ImportUserStoryAsync(
        string workspaceRoot,
        string usId,
        string sourcePath,
        string title,
        string kind,
        string category,
        CancellationToken cancellationToken = default)
    {
        var sourceText = await File.ReadAllTextAsync(sourcePath, cancellationToken);
        return await CreateUserStoryAsync(workspaceRoot, usId, title, kind, category, sourceText, cancellationToken);
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

        var directories = Directory.GetDirectories(specsRoot, "us.*", SearchOption.TopDirectoryOnly);
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
        var paths = UserStoryFilePaths.FromWorkspaceRoot(workspaceRoot, usId);
        return await GetUserStorySummaryFromDirectoryAsync(paths.RootDirectory, cancellationToken);
    }

    public async Task<UserStoryWorkflowDetails> GetUserStoryWorkflowAsync(
        string workspaceRoot,
        string usId,
        CancellationToken cancellationToken = default)
    {
        var paths = UserStoryFilePaths.FromWorkspaceRoot(workspaceRoot, usId);
        var workflowRun = await fileStore.LoadAsync(paths.RootDirectory, cancellationToken);
        var title = await ReadTitleAsync(paths.MainArtifactPath, cancellationToken);
        var metadata = await WorkflowRunner.ReadUserStoryMetadataAsync(paths.MainArtifactPath, workflowRun.UsId, cancellationToken);
        var rawTimeline = File.Exists(paths.TimelineFilePath)
            ? await File.ReadAllTextAsync(paths.TimelineFilePath, cancellationToken)
            : string.Empty;
        var userStoryMarkdown = await File.ReadAllTextAsync(paths.MainArtifactPath, cancellationToken);
        var clarification = UserStoryClarificationMarkdown.Parse(userStoryMarkdown);
        var currentPhase = await GetCurrentPhaseAsync(workspaceRoot, usId, cancellationToken);

        return new UserStoryWorkflowDetails(
            workflowRun.UsId,
            title,
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
                currentPhase.RequiresApproval,
                currentPhase.RequiresApproval,
                currentPhase.BlockingReason,
                workflowRun.CurrentPhase != Workflow.PhaseId.Capture,
                BuildRegressionTargets(workflowRun)),
            clarification is null
                ? null
                : new ClarificationSessionDetails(
                    clarification.Status,
                    clarification.Tolerance,
                    clarification.Reason,
                    clarification.Items.Select(item => new ClarificationQuestionAnswerDetails(item.Index, item.Question, item.Answer)).ToArray()),
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
        var paths = UserStoryFilePaths.FromWorkspaceRoot(workspaceRoot, usId);
        var workflowRun = await fileStore.LoadAsync(paths.RootDirectory, cancellationToken);
        if (workflowRun.CurrentPhase == Workflow.PhaseId.Clarification)
        {
            var userStoryMarkdown = await File.ReadAllTextAsync(paths.MainArtifactPath, cancellationToken);
            var clarification = UserStoryClarificationMarkdown.Parse(userStoryMarkdown);
            var canAdvanceClarification = UserStoryClarificationMarkdown.HasAllAnswers(clarification);
            return new CurrentPhaseSummary(
                workflowRun.UsId,
                WorkflowPresentation.ToPhaseSlug(workflowRun.CurrentPhase),
                WorkflowPresentation.ToStatusSlug(workflowRun.Status),
                canAdvanceClarification,
                false,
                canAdvanceClarification ? null : "clarification_pending_answers");
        }

        var requiresApproval = workflowRun.Definition.RequiresApproval(workflowRun.CurrentPhase);
        var canAdvance = !requiresApproval || workflowRun.IsPhaseApproved(workflowRun.CurrentPhase);
        var blockingReason = canAdvance
            ? null
            : $"{WorkflowPresentation.ToPhaseSlug(workflowRun.CurrentPhase)}_pending_user_approval";

        return new CurrentPhaseSummary(
            workflowRun.UsId,
            WorkflowPresentation.ToPhaseSlug(workflowRun.CurrentPhase),
            WorkflowPresentation.ToStatusSlug(workflowRun.Status),
            canAdvance,
            requiresApproval,
            blockingReason);
    }

    public async Task<ContinuePhaseResponse> GenerateNextPhaseAsync(
        string workspaceRoot,
        string usId,
        CancellationToken cancellationToken = default)
    {
        var currentPhase = await GetCurrentPhaseAsync(workspaceRoot, usId, cancellationToken);
        var paths = UserStoryFilePaths.FromWorkspaceRoot(workspaceRoot, usId);
        await using var operation = await runtimeStatusStore.StartOperationAsync(
            paths.RootDirectory,
            usId,
            currentPhase.CurrentPhase,
            "generate-next-phase",
            cancellationToken);

        try
        {
            var result = await workflowRunner.ContinuePhaseAsync(workspaceRoot, usId, cancellationToken);
            var resultPhase = WorkflowPresentation.ToPhaseSlug(result.CurrentPhase);
            operation.UpdatePhase(resultPhase);
            await operation.CompleteAsync(resultPhase, cancellationToken);
            return new ContinuePhaseResponse(
                result.UsId,
                resultPhase,
                WorkflowPresentation.ToStatusSlug(result.Status),
                result.GeneratedArtifactPath,
                result.Usage);
        }
        catch (Exception exception)
        {
            await operation.FailAsync(currentPhase.CurrentPhase, exception.Message, cancellationToken);
            throw;
        }
    }

    public async Task<UserStoryRuntimeStatus> GetUserStoryRuntimeStatusAsync(
        string workspaceRoot,
        string usId,
        CancellationToken cancellationToken = default)
    {
        var currentPhase = await GetCurrentPhaseAsync(workspaceRoot, usId, cancellationToken);
        var paths = UserStoryFilePaths.FromWorkspaceRoot(workspaceRoot, usId);
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
        CancellationToken cancellationToken = default)
    {
        await workflowRunner.ApproveCurrentPhaseAsync(workspaceRoot, usId, baseBranch, cancellationToken);
        var summary = await GetUserStorySummaryAsync(workspaceRoot, usId, cancellationToken);
        return new ApprovalResult(summary.UsId, summary.Status, summary.CurrentPhase, baseBranch, summary.WorkBranch);
    }

    public Task<RequestRegressionResult> RequestRegressionAsync(
        string workspaceRoot,
        string usId,
        string targetPhase,
        string? reason = null,
        CancellationToken cancellationToken = default)
    {
        var phaseId = WorkflowPresentation.ParsePhaseSlug(targetPhase);
        return workflowRunner.RequestRegressionAsync(workspaceRoot, usId, phaseId, reason, cancellationToken);
    }

    public Task<RestartUserStoryResult> RestartUserStoryFromSourceAsync(
        string workspaceRoot,
        string usId,
        string? reason = null,
        CancellationToken cancellationToken = default) =>
        workflowRunner.RestartUserStoryFromSourceAsync(workspaceRoot, usId, reason, cancellationToken);

    public Task<SubmitClarificationAnswersResult> SubmitClarificationAnswersAsync(
        string workspaceRoot,
        string usId,
        IReadOnlyList<string> answers,
        CancellationToken cancellationToken = default) =>
        workflowRunner.SubmitClarificationAnswersAsync(workspaceRoot, usId, answers, cancellationToken);

    public Task<UserStoryFilesResult> ListUserStoryFilesAsync(
        string workspaceRoot,
        string usId,
        CancellationToken cancellationToken = default)
    {
        var paths = UserStoryFilePaths.FromWorkspaceRoot(workspaceRoot, usId);
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
        var paths = UserStoryFilePaths.FromWorkspaceRoot(workspaceRoot, usId);
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
        var paths = UserStoryFilePaths.FromWorkspaceRoot(workspaceRoot, usId);
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
            .Select((phaseId, index) => new WorkflowPhaseDetails(
                WorkflowPresentation.ToPhaseSlug(phaseId),
                ToPhaseTitle(phaseId),
                index,
                workflowRun.Definition.RequiresApproval(phaseId),
                workflowRun.IsPhaseApproved(phaseId),
                workflowRun.CurrentPhase == phaseId,
                ResolvePhaseState(workflowRun, phaseId),
                TryGetLatestArtifactPath(paths, phaseId),
                TryGetExecutePromptPath(paths, phaseId),
                TryGetApprovePromptPath(paths, phaseId)))
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
        Workflow.PhaseId.Clarification => "Clarification",
        Workflow.PhaseId.Refinement => "Refinement",
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

        string? latestPath = null;
        for (var version = 1; version < 100; version++)
        {
            var candidate = paths.GetPhaseArtifactPath(phaseId, version);
            if (!File.Exists(candidate))
            {
                break;
            }

            latestPath = candidate;
        }

        return latestPath;
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
            Workflow.PhaseId.TechnicalDesign => promptPaths.TechnicalDesignApprovePromptPath,
            Workflow.PhaseId.ReleaseApproval => promptPaths.ReleaseApprovalApprovePromptPath,
            _ => null
        };

        return candidate is not null && File.Exists(candidate) ? candidate : null;
    }

    private static string FindWorkspaceRoot(UserStoryFilePaths paths)
    {
        var userStoriesRoot = Path.GetDirectoryName(paths.RootDirectory)
            ?? throw new InvalidOperationException("User story directory root is invalid.");
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

    private static string ToRuntimeStatusSlug(RuntimeStatus status) => status switch
    {
        RuntimeStatus.Idle => "idle",
        RuntimeStatus.Running => "running",
        RuntimeStatus.Failed => "failed",
        _ => throw new ArgumentOutOfRangeException(nameof(status), status, null)
    };
}
