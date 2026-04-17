using SpecForge.Domain.Application;
using SpecForge.Domain.Persistence;
using SpecForge.Domain.Workflow;

namespace SpecForge.Domain.Tests;

public sealed class WorkflowRunnerTests : IDisposable
{
    private readonly string workspaceRoot = Path.Combine(Path.GetTempPath(), Guid.NewGuid().ToString("N"));

    [Fact]
    public async Task CreateUserStoryAsync_CreatesSpecsStructureAndSeedFiles()
    {
        var runner = new WorkflowRunner();

        var rootDirectory = await runner.CreateUserStoryAsync(workspaceRoot, "US-0001", "Test story", "Initial source text");

        Assert.Equal(Path.Combine(workspaceRoot, ".specs", "us", "us.US-0001"), rootDirectory);
        Assert.True(File.Exists(Path.Combine(rootDirectory, "us.md")));
        Assert.True(File.Exists(Path.Combine(rootDirectory, "state.yaml")));
        Assert.True(File.Exists(Path.Combine(rootDirectory, "timeline.md")));
    }

    [Fact]
    public async Task ContinuePhaseAsync_FromCapture_GeneratesRefinementArtifact()
    {
        var runner = new WorkflowRunner();
        await runner.CreateUserStoryAsync(workspaceRoot, "US-0001", "Test story", "Initial source text");

        var result = await runner.ContinuePhaseAsync(workspaceRoot, "US-0001");

        Assert.Equal(PhaseId.Refinement, result.CurrentPhase);
        Assert.Equal(UserStoryStatus.WaitingUser, result.Status);
        Assert.NotNull(result.GeneratedArtifactPath);
        Assert.True(File.Exists(result.GeneratedArtifactPath!));
    }

    [Fact]
    public async Task ApproveCurrentPhaseAsync_ThenContinuePhaseAsync_GeneratesTechnicalDesign()
    {
        var runner = new WorkflowRunner();
        await runner.CreateUserStoryAsync(workspaceRoot, "US-0001", "Test story", "Initial source text");
        await runner.ContinuePhaseAsync(workspaceRoot, "US-0001");

        await runner.ApproveCurrentPhaseAsync(workspaceRoot, "US-0001", "main");
        var result = await runner.ContinuePhaseAsync(workspaceRoot, "US-0001");

        Assert.Equal(PhaseId.TechnicalDesign, result.CurrentPhase);
        Assert.Equal(UserStoryStatus.WaitingUser, result.Status);

        var loadedRun = await new UserStoryFileStore().LoadAsync(
            UserStoryFilePaths.FromWorkspaceRoot(workspaceRoot, "US-0001").RootDirectory);
        Assert.NotNull(loadedRun.Branch);
        Assert.Equal("main", loadedRun.Branch!.BaseBranch);
    }

    public void Dispose()
    {
        if (Directory.Exists(workspaceRoot))
        {
            Directory.Delete(workspaceRoot, recursive: true);
        }
    }
}
