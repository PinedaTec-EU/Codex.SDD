using SpecForge.Domain.Persistence;
using SpecForge.Domain.Workflow;

namespace SpecForge.Domain.Application;

public sealed class SpecForgeApplicationService
{
    private readonly UserStoryFileStore fileStore;

    public SpecForgeApplicationService()
        : this(new UserStoryFileStore())
    {
    }

    public SpecForgeApplicationService(UserStoryFileStore fileStore)
    {
        this.fileStore = fileStore ?? throw new ArgumentNullException(nameof(fileStore));
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

    private static async Task<string> ReadTitleAsync(string filePath, CancellationToken cancellationToken)
    {
        var lines = await File.ReadAllLinesAsync(filePath, cancellationToken);
        var titleLine = lines.FirstOrDefault(static line => line.StartsWith("# ", StringComparison.Ordinal));
        return titleLine?.Replace("# ", string.Empty, StringComparison.Ordinal).Trim()
            ?? Path.GetFileName(Path.GetDirectoryName(filePath) ?? filePath);
    }
}
