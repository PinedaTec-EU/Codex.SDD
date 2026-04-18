using SpecForge.Domain.Persistence;
using SpecForge.Domain.Workflow;

namespace SpecForge.Domain.Application;

public sealed class SpecForgeApplicationService
{
    private readonly UserStoryFileStore fileStore;
    private readonly WorkflowRunner workflowRunner;
    private readonly RepositoryPromptInitializer repositoryPromptInitializer;
    private readonly RepositoryCategoryCatalog repositoryCategoryCatalog;

    public SpecForgeApplicationService()
        : this(new UserStoryFileStore(), new WorkflowRunner(), new RepositoryPromptInitializer(), new RepositoryCategoryCatalog())
    {
    }

    public SpecForgeApplicationService(
        UserStoryFileStore fileStore,
        WorkflowRunner workflowRunner,
        RepositoryPromptInitializer? repositoryPromptInitializer = null,
        RepositoryCategoryCatalog? repositoryCategoryCatalog = null)
    {
        this.fileStore = fileStore ?? throw new ArgumentNullException(nameof(fileStore));
        this.workflowRunner = workflowRunner ?? throw new ArgumentNullException(nameof(workflowRunner));
        this.repositoryPromptInitializer = repositoryPromptInitializer ?? new RepositoryPromptInitializer();
        this.repositoryCategoryCatalog = repositoryCategoryCatalog ?? new RepositoryCategoryCatalog();
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
        var currentPhase = await GetCurrentPhaseAsync(workspaceRoot, usId, cancellationToken);

        return new UserStoryWorkflowDetails(
            workflowRun.UsId,
            title,
            metadata.Category,
            WorkflowPresentation.ToStatusSlug(workflowRun.Status),
            WorkflowPresentation.ToPhaseSlug(workflowRun.CurrentPhase),
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
            TimelineMarkdownParser.ParseEvents(rawTimeline));
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
        var result = await workflowRunner.ContinuePhaseAsync(workspaceRoot, usId, cancellationToken);
        return new ContinuePhaseResponse(
            result.UsId,
            WorkflowPresentation.ToPhaseSlug(result.CurrentPhase),
            WorkflowPresentation.ToStatusSlug(result.Status),
            result.GeneratedArtifactPath);
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
                TryGetLatestArtifactPath(paths, phaseId)))
            .ToArray();
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
}
