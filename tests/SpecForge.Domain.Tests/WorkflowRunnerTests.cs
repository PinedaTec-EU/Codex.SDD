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
        var refinementContent = await File.ReadAllTextAsync(result.GeneratedArtifactPath!);
        Assert.Contains("Initial source text", refinementContent);
        Assert.Contains("## Red Team", refinementContent);
        Assert.Contains("## Blue Team", refinementContent);
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
        var technicalDesignContent = await File.ReadAllTextAsync(result.GeneratedArtifactPath!);
        Assert.Contains("## Componentes afectados", technicalDesignContent);
        Assert.Contains("SpecForge.Runner.Cli", technicalDesignContent);

        var loadedRun = await new UserStoryFileStore().LoadAsync(
            UserStoryFilePaths.FromWorkspaceRoot(workspaceRoot, "US-0001").RootDirectory);
        Assert.NotNull(loadedRun.Branch);
        Assert.Equal("main", loadedRun.Branch!.BaseBranch);
    }

    [Fact]
    public async Task RequestRegressionAsync_FromReviewToTechnicalDesign_PersistsStateAndTimeline()
    {
        var runner = new WorkflowRunner();
        await runner.CreateUserStoryAsync(workspaceRoot, "US-0001", "Test story", "Initial source text");
        await runner.ContinuePhaseAsync(workspaceRoot, "US-0001");
        await runner.ApproveCurrentPhaseAsync(workspaceRoot, "US-0001", "main");
        await runner.ContinuePhaseAsync(workspaceRoot, "US-0001");
        await runner.ApproveCurrentPhaseAsync(workspaceRoot, "US-0001");
        await runner.ContinuePhaseAsync(workspaceRoot, "US-0001");
        await runner.ContinuePhaseAsync(workspaceRoot, "US-0001");

        var result = await runner.RequestRegressionAsync(workspaceRoot, "US-0001", PhaseId.TechnicalDesign, "Review found a design gap");

        Assert.Equal("technical-design", result.CurrentPhase);
        Assert.Equal("waiting-user", result.Status);

        var loadedRun = await new UserStoryFileStore().LoadAsync(
            UserStoryFilePaths.FromWorkspaceRoot(workspaceRoot, "US-0001").RootDirectory);
        Assert.Equal(PhaseId.TechnicalDesign, loadedRun.CurrentPhase);
        Assert.False(loadedRun.IsPhaseApproved(PhaseId.TechnicalDesign));

        var timelinePath = UserStoryFilePaths.FromWorkspaceRoot(workspaceRoot, "US-0001").TimelineFilePath;
        var timeline = await File.ReadAllTextAsync(timelinePath);
        Assert.Contains("`phase_regressed`", timeline);
        Assert.Contains("Review found a design gap", timeline);
    }

    public void Dispose()
    {
        if (Directory.Exists(workspaceRoot))
        {
            Directory.Delete(workspaceRoot, recursive: true);
        }
    }
}
