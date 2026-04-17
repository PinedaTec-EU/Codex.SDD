using SpecForge.Domain.Application;

namespace SpecForge.Domain.Tests;

public sealed class SpecForgeApplicationServiceTests : IDisposable
{
    private readonly string workspaceRoot = Path.Combine(Path.GetTempPath(), Guid.NewGuid().ToString("N"));

    [Fact]
    public async Task ListUserStoriesAsync_ReturnsSummariesFromSpecsDirectory()
    {
        var runner = new WorkflowRunner();
        var applicationService = new SpecForgeApplicationService();
        await runner.CreateUserStoryAsync(workspaceRoot, "US-0001", "Story one", "Initial source");

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
        await runner.CreateUserStoryAsync(workspaceRoot, "US-0001", "Story one", "Initial source");
        await runner.ContinuePhaseAsync(workspaceRoot, "US-0001");
        await runner.ApproveCurrentPhaseAsync(workspaceRoot, "US-0001", "main");

        var summary = await applicationService.GetUserStorySummaryAsync(workspaceRoot, "US-0001");

        Assert.Equal("feature/us-0001", summary.WorkBranch);
        Assert.Equal("active", summary.Status);
    }

    public void Dispose()
    {
        if (Directory.Exists(workspaceRoot))
        {
            Directory.Delete(workspaceRoot, recursive: true);
        }
    }
}
