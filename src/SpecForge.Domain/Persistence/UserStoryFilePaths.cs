namespace SpecForge.Domain.Persistence;

public sealed class UserStoryFilePaths
{
    public static string SpecsDirectoryName => ".specs";

    public static string UserStoriesDirectoryName => "us";

    public UserStoryFilePaths(string rootDirectory)
    {
        if (string.IsNullOrWhiteSpace(rootDirectory))
        {
            throw new ArgumentException("Root directory is required.", nameof(rootDirectory));
        }

        RootDirectory = rootDirectory;
        StateFilePath = Path.Combine(rootDirectory, "state.yaml");
        BranchFilePath = Path.Combine(rootDirectory, "branch.yaml");
    }

    public static UserStoryFilePaths FromWorkspaceRoot(string workspaceRoot, string usId)
    {
        if (string.IsNullOrWhiteSpace(workspaceRoot))
        {
            throw new ArgumentException("Workspace root is required.", nameof(workspaceRoot));
        }

        if (string.IsNullOrWhiteSpace(usId))
        {
            throw new ArgumentException("US id is required.", nameof(usId));
        }

        var userStoryDirectory = Path.Combine(
            workspaceRoot,
            SpecsDirectoryName,
            UserStoriesDirectoryName,
            $"us.{usId}");

        return new UserStoryFilePaths(userStoryDirectory);
    }

    public string RootDirectory { get; }

    public string StateFilePath { get; }

    public string BranchFilePath { get; }
}
