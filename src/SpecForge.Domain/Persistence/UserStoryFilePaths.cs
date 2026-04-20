using SpecForge.Domain.Workflow;

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
        MainArtifactPath = Path.Combine(rootDirectory, "us.md");
        ClarificationFilePath = Path.Combine(rootDirectory, "clarification.md");
        StateFilePath = Path.Combine(rootDirectory, "state.yaml");
        RuntimeFilePath = Path.Combine(rootDirectory, "runtime.yaml");
        TimelineFilePath = Path.Combine(rootDirectory, "timeline.md");
        PhasesDirectoryPath = Path.Combine(rootDirectory, "phases");
        BranchFilePath = Path.Combine(rootDirectory, "branch.yaml");
        RestartsDirectoryPath = Path.Combine(rootDirectory, "restarts");
        ContextDirectoryPath = Path.Combine(rootDirectory, "context");
        AttachmentsDirectoryPath = Path.Combine(rootDirectory, "attachments");
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

    public string MainArtifactPath { get; }

    public string ClarificationFilePath { get; }

    public string StateFilePath { get; }

    public string RuntimeFilePath { get; }

    public string TimelineFilePath { get; }

    public string PhasesDirectoryPath { get; }

    public string BranchFilePath { get; }

    public string RestartsDirectoryPath { get; }

    public string ContextDirectoryPath { get; }

    public string AttachmentsDirectoryPath { get; }

    public string GetPhaseArtifactPath(PhaseId phaseId, int version = 1)
    {
        var fileName = GetPhaseArtifactFileStem(phaseId);
        var versionSuffix = version <= 1 ? string.Empty : $".v{version:00}";
        return Path.Combine(PhasesDirectoryPath, $"{fileName}{versionSuffix}.md");
    }

    public string? GetLatestExistingPhaseArtifactPath(PhaseId phaseId)
    {
        foreach (var fileStem in GetPhaseArtifactFileStems(phaseId))
        {
            string? latestPath = null;
            for (var version = 1; version < 100; version++)
            {
                var versionSuffix = version <= 1 ? string.Empty : $".v{version:00}";
                var candidate = Path.Combine(PhasesDirectoryPath, $"{fileStem}{versionSuffix}.md");
                if (!File.Exists(candidate))
                {
                    break;
                }

                latestPath = candidate;
            }

            if (latestPath is not null)
            {
                return latestPath;
            }
        }

        return null;
    }

    public string GetRestartArchiveDirectoryPath(DateTimeOffset timestampUtc)
    {
        var directoryName = timestampUtc.UtcDateTime.ToString("yyyyMMdd'T'HHmmss'Z'");
        return Path.Combine(RestartsDirectoryPath, directoryName);
    }

    private static string GetPhaseArtifactFileStem(PhaseId phaseId) => phaseId switch
    {
        PhaseId.Clarification => "00-clarification",
        PhaseId.Refinement => "01-spec",
        PhaseId.TechnicalDesign => "02-technical-design",
        PhaseId.Implementation => "03-implementation",
        PhaseId.Review => "04-review",
        _ => throw new ArgumentOutOfRangeException(nameof(phaseId), phaseId, "No artifact path is defined for this phase.")
    };

    private static IReadOnlyList<string> GetPhaseArtifactFileStems(PhaseId phaseId) => phaseId switch
    {
        PhaseId.Refinement => ["01-spec", "01-refinement"],
        _ => [GetPhaseArtifactFileStem(phaseId)]
    };
}
