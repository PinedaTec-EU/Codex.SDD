using SpecForge.Domain.Persistence;
using SpecForge.Domain.Workflow;

namespace SpecForge.Domain.Tests;

public sealed class UserStoryFileStoreTests : IDisposable
{
    private readonly string tempDirectory = Path.Combine(Path.GetTempPath(), Guid.NewGuid().ToString("N"));

    [Fact]
    public async Task SaveAsync_WritesStateAndBranchYaml()
    {
        Directory.CreateDirectory(tempDirectory);
        var store = new UserStoryFileStore();
        var run = CreateApprovedRefinementRun();

        await store.SaveAsync(run, tempDirectory);

        var statePath = Path.Combine(tempDirectory, "state.yaml");
        var branchPath = Path.Combine(tempDirectory, "branch.yaml");

        Assert.True(File.Exists(statePath));
        Assert.True(File.Exists(branchPath));

        var stateContent = await File.ReadAllTextAsync(statePath);
        var branchContent = await File.ReadAllTextAsync(branchPath);

        Assert.Contains("usId: US-0001", stateContent);
        Assert.Contains("currentPhase: refinement", stateContent);
        Assert.Contains("approvedPhases:", stateContent);
        Assert.Contains("baseBranch: main", branchContent);
        Assert.Contains("workBranch: feature/us-0001", branchContent);
    }

    [Fact]
    public async Task LoadAsync_RestoresWorkflowRunState()
    {
        Directory.CreateDirectory(tempDirectory);
        var store = new UserStoryFileStore();
        var savedRun = CreateApprovedRefinementRun();
        savedRun.GenerateNextPhase();

        await store.SaveAsync(savedRun, tempDirectory);

        var loadedRun = await store.LoadAsync(tempDirectory);

        Assert.Equal(savedRun.UsId, loadedRun.UsId);
        Assert.Equal(savedRun.SourceHash, loadedRun.SourceHash);
        Assert.Equal(savedRun.CurrentPhase, loadedRun.CurrentPhase);
        Assert.Equal(savedRun.Status, loadedRun.Status);
        Assert.True(loadedRun.IsPhaseApproved(PhaseId.Refinement));
        Assert.NotNull(loadedRun.Branch);
        Assert.Equal("main", loadedRun.Branch!.BaseBranch);
    }

    [Fact]
    public async Task SaveAsync_WithoutBranch_RemovesExistingBranchYaml()
    {
        Directory.CreateDirectory(tempDirectory);
        var store = new UserStoryFileStore();
        var withBranch = CreateApprovedRefinementRun();
        await store.SaveAsync(withBranch, tempDirectory);

        var withoutBranch = new WorkflowRun("US-0001", "sha256:def", WorkflowDefinition.CanonicalV1);
        await store.SaveAsync(withoutBranch, tempDirectory);

        Assert.False(File.Exists(Path.Combine(tempDirectory, "branch.yaml")));
    }

    public void Dispose()
    {
        if (Directory.Exists(tempDirectory))
        {
            Directory.Delete(tempDirectory, recursive: true);
        }
    }

    private static WorkflowRun CreateApprovedRefinementRun()
    {
        var run = new WorkflowRun("US-0001", "sha256:abc", WorkflowDefinition.CanonicalV1);
        run.GenerateNextPhase();
        run.ApproveCurrentPhase("main", new DateTimeOffset(2026, 4, 18, 10, 0, 0, TimeSpan.Zero));
        return run;
    }
}
