using SpecForge.Domain.Persistence;
using SpecForge.Domain.Workflow;

namespace SpecForge.Domain.Application;

public sealed class SpecForgeApplicationService
{
    private readonly UserStoryFileStore fileStore;
    private readonly WorkflowRunner workflowRunner;
    private readonly RepositoryPromptInitializer repositoryPromptInitializer;

    public SpecForgeApplicationService()
        : this(new UserStoryFileStore(), new WorkflowRunner(), new RepositoryPromptInitializer())
    {
    }

    public SpecForgeApplicationService(
        UserStoryFileStore fileStore,
        WorkflowRunner workflowRunner,
        RepositoryPromptInitializer? repositoryPromptInitializer = null)
    {
        this.fileStore = fileStore ?? throw new ArgumentNullException(nameof(fileStore));
        this.workflowRunner = workflowRunner ?? throw new ArgumentNullException(nameof(workflowRunner));
        this.repositoryPromptInitializer = repositoryPromptInitializer ?? new RepositoryPromptInitializer();
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
        string sourceText,
        CancellationToken cancellationToken = default)
    {
        var rootDirectory = await workflowRunner.CreateUserStoryAsync(workspaceRoot, usId, title, sourceText, cancellationToken);
        return new CreateOrImportUserStoryResult(usId, rootDirectory, Path.Combine(rootDirectory, "us.md"));
    }

    public async Task<CreateOrImportUserStoryResult> ImportUserStoryAsync(
        string workspaceRoot,
        string usId,
        string sourcePath,
        string title,
        CancellationToken cancellationToken = default)
    {
        var sourceText = await File.ReadAllTextAsync(sourcePath, cancellationToken);
        return await CreateUserStoryAsync(workspaceRoot, usId, title, sourceText, cancellationToken);
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

    private async Task<UserStorySummary> GetUserStorySummaryFromDirectoryAsync(
        string directory,
        CancellationToken cancellationToken)
    {
        var mainArtifactPath = Path.Combine(directory, "us.md");
        var statePath = Path.Combine(directory, "state.yaml");
        var workflowRun = await fileStore.LoadAsync(directory, cancellationToken);
        var title = await ReadTitleAsync(mainArtifactPath, cancellationToken);

        return new UserStorySummary(
            workflowRun.UsId,
            title,
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
}
