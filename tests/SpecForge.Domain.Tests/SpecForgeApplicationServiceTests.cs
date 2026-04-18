using SpecForge.Domain.Application;
using SpecForge.Domain.Persistence;

namespace SpecForge.Domain.Tests;

public sealed class SpecForgeApplicationServiceTests : IDisposable
{
    private readonly string workspaceRoot = Path.Combine(Path.GetTempPath(), Guid.NewGuid().ToString("N"));

    [Fact]
    public async Task ListUserStoriesAsync_ReturnsSummariesFromSpecsDirectory()
    {
        var runner = new WorkflowRunner();
        var applicationService = new SpecForgeApplicationService();
        await runner.CreateUserStoryAsync(workspaceRoot, "US-0001", "Story one", "feature", "Initial source");

        var items = await applicationService.ListUserStoriesAsync(workspaceRoot);

        var summary = Assert.Single(items);
        Assert.Equal("US-0001", summary.UsId);
        Assert.Equal("capture", summary.CurrentPhase);
        Assert.Equal("active", summary.Status);
    }

    [Fact]
    public async Task GetUserStorySummaryAsync_ReturnsBranchNameWhenAvailable()
    {
        var runner = new WorkflowRunner();
        var applicationService = new SpecForgeApplicationService();
        await runner.CreateUserStoryAsync(workspaceRoot, "US-0001", "Story one", "feature", "Initial source");
        await runner.ContinuePhaseAsync(workspaceRoot, "US-0001");
        await runner.ApproveCurrentPhaseAsync(workspaceRoot, "US-0001", "main");

        var summary = await applicationService.GetUserStorySummaryAsync(workspaceRoot, "US-0001");

        Assert.Equal("feature/us-0001-story-one", summary.WorkBranch);
        Assert.Equal("active", summary.Status);
    }

    [Fact]
    public async Task RequestRegressionAsync_UsesPhaseSlugAndReturnsUpdatedState()
    {
        var runner = new WorkflowRunner();
        var applicationService = new SpecForgeApplicationService();
        await runner.CreateUserStoryAsync(workspaceRoot, "US-0001", "Story one", "feature", "Initial source");
        await runner.ContinuePhaseAsync(workspaceRoot, "US-0001");
        await runner.ApproveCurrentPhaseAsync(workspaceRoot, "US-0001", "main");
        await runner.ContinuePhaseAsync(workspaceRoot, "US-0001");
        await runner.ApproveCurrentPhaseAsync(workspaceRoot, "US-0001");
        await runner.ContinuePhaseAsync(workspaceRoot, "US-0001");
        await runner.ContinuePhaseAsync(workspaceRoot, "US-0001");

        var result = await applicationService.RequestRegressionAsync(
            workspaceRoot,
            "US-0001",
            "technical-design",
            "Review requested regression");

        Assert.Equal("US-0001", result.UsId);
        Assert.Equal("technical-design", result.CurrentPhase);
        Assert.Equal("waiting-user", result.Status);
    }

    [Fact]
    public async Task RestartUserStoryFromSourceAsync_ReturnsRegeneratedRefinementState()
    {
        var runner = new WorkflowRunner();
        var applicationService = new SpecForgeApplicationService();
        await runner.CreateUserStoryAsync(workspaceRoot, "US-0001", "Story one", "feature", "Initial source");
        await runner.ContinuePhaseAsync(workspaceRoot, "US-0001");

        var paths = UserStoryFilePaths.FromWorkspaceRoot(workspaceRoot, "US-0001");
        await File.WriteAllTextAsync(paths.MainArtifactPath, "# US-0001 · Story one\n\n## Objetivo\nUpdated source");

        var result = await applicationService.RestartUserStoryFromSourceAsync(
            workspaceRoot,
            "US-0001",
            "Source changed after refinement");

        Assert.Equal("US-0001", result.UsId);
        Assert.Equal("refinement", result.CurrentPhase);
        Assert.Equal("waiting-user", result.Status);
        Assert.NotNull(result.GeneratedArtifactPath);
    }

    public void Dispose()
    {
        if (Directory.Exists(workspaceRoot))
        {
            Directory.Delete(workspaceRoot, recursive: true);
        }
    }
}
