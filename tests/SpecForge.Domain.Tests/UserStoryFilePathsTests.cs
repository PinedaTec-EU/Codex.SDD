using SpecForge.Domain.Persistence;

namespace SpecForge.Domain.Tests;

public sealed class UserStoryFilePathsTests
{
    [Fact]
    public void FromWorkspaceRoot_BuildsSpecsPathAtWorkspaceRoot()
    {
        var paths = UserStoryFilePaths.FromWorkspaceRoot("/repo", "workflow", "US-0001");

        Assert.Equal("/repo/.specs/us/workflow/US-0001", paths.RootDirectory);
        Assert.Equal("/repo/.specs/us/workflow/US-0001/state.yaml", paths.StateFilePath);
        Assert.Equal("/repo/.specs/us/workflow/US-0001/branch.yaml", paths.BranchFilePath);
        Assert.Equal("/repo/.specs/us/workflow/US-0001/restarts", paths.RestartsDirectoryPath);
    }

    [Fact]
    public void GetRestartArchiveDirectoryPath_UsesTimestampedArchiveDirectory()
    {
        var paths = UserStoryFilePaths.FromWorkspaceRoot("/repo", "workflow", "US-0001");

        var archiveDirectory = paths.GetRestartArchiveDirectoryPath(new DateTimeOffset(2026, 4, 18, 10, 30, 0, TimeSpan.Zero));

        Assert.Equal("/repo/.specs/us/workflow/US-0001/restarts/20260418T103000Z", archiveDirectory);
    }

    [Fact]
    public void GetPhaseArtifactPath_ForSpec_UsesSpecArtifactName()
    {
        var paths = UserStoryFilePaths.FromWorkspaceRoot("/repo", "workflow", "US-0001");

        var artifactPath = paths.GetPhaseArtifactPath(SpecForge.Domain.Workflow.PhaseId.Spec);

        Assert.Equal("/repo/.specs/us/workflow/US-0001/phases/01-spec.md", artifactPath);
    }
}
