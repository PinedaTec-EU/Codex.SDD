using SpecForge.Domain.Persistence;

namespace SpecForge.Domain.Tests;

public sealed class UserStoryFilePathsTests
{
    [Fact]
    public void FromWorkspaceRoot_BuildsSpecsPathAtWorkspaceRoot()
    {
        var paths = UserStoryFilePaths.FromWorkspaceRoot("/repo", "US-0001");

        Assert.Equal("/repo/.specs/us/us.US-0001", paths.RootDirectory);
        Assert.Equal("/repo/.specs/us/us.US-0001/state.yaml", paths.StateFilePath);
        Assert.Equal("/repo/.specs/us/us.US-0001/branch.yaml", paths.BranchFilePath);
    }
}
