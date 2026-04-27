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
        var run = CreateApprovedSpecRun(runtimeVersion: "0.1.3.224");

        await store.SaveAsync(run, tempDirectory);

        var statePath = Path.Combine(tempDirectory, "state.yaml");
        var branchPath = Path.Combine(tempDirectory, "branch.yaml");

        Assert.True(File.Exists(statePath));
        Assert.True(File.Exists(branchPath));

        var stateContent = await File.ReadAllTextAsync(statePath);
        var branchContent = await File.ReadAllTextAsync(branchPath);

        Assert.Contains("usId: US-0001", stateContent);
        Assert.Contains("currentPhase: spec", stateContent);
        Assert.Contains("createdWithRuntimeVersion: 0.1.3.224", stateContent);
        Assert.Contains("lastRuntimeVersion: 0.1.3.224", stateContent);
        Assert.Contains("approvedPhases:", stateContent);
        Assert.Contains("kind: feature", branchContent);
        Assert.Contains("category: workflow", branchContent);
        Assert.Contains("baseBranch: main", branchContent);
        Assert.Contains("workBranch: feature/us-0001-test-story", branchContent);
        Assert.Contains("strategy: single-branch-per-user-story", branchContent);
    }

    [Fact]
    public async Task LoadAsync_RestoresWorkflowRunState()
    {
        Directory.CreateDirectory(tempDirectory);
        var store = new UserStoryFileStore();
        var savedRun = CreateApprovedSpecRun(runtimeVersion: "0.1.3.224");
        savedRun.Branch!.RecordPublishedPullRequest(
            new PullRequestRecord(
                Status: "draft",
                TargetBaseBranch: "main",
                Title: "US-0001: prepare draft PR",
                ArtifactPath: ".specs/us/workflow/US-0001/phases/06-pr-preparation.md",
                IsDraft: true,
                Number: 42,
                Url: "https://github.com/acme/repo/pull/42",
                RemoteBranch: "feature/us-0001-test-story",
                HeadCommitSha: "abc123",
                PublishedAtUtc: new DateTimeOffset(2026, 4, 26, 18, 0, 0, TimeSpan.Zero)));
        savedRun.GenerateNextPhase();

        await store.SaveAsync(savedRun, tempDirectory);

        var loadedRun = await store.LoadAsync(tempDirectory);

        Assert.Equal(savedRun.UsId, loadedRun.UsId);
        Assert.Equal(savedRun.SourceHash, loadedRun.SourceHash);
        Assert.Equal(savedRun.CurrentPhase, loadedRun.CurrentPhase);
        Assert.Equal(savedRun.Status, loadedRun.Status);
        Assert.Equal("0.1.3.224", loadedRun.CreatedWithRuntimeVersion);
        Assert.Equal("0.1.3.224", loadedRun.LastRuntimeVersion);
        Assert.True(loadedRun.IsPhaseApproved(PhaseId.Spec));
        Assert.NotNull(loadedRun.Branch);
        Assert.Equal("main", loadedRun.Branch!.BaseBranch);
        Assert.Equal("feature", loadedRun.Branch.Kind);
        Assert.Equal("workflow", loadedRun.Branch.Category);
        Assert.NotNull(loadedRun.Branch.PullRequest);
        Assert.Equal("draft", loadedRun.Branch.PullRequest!.Status);
        Assert.Equal(42, loadedRun.Branch.PullRequest.Number);
        Assert.Equal("https://github.com/acme/repo/pull/42", loadedRun.Branch.PullRequest.Url);
    }

    [Fact]
    public async Task SaveAsync_WithoutBranch_RemovesExistingBranchYaml()
    {
        Directory.CreateDirectory(tempDirectory);
        var store = new UserStoryFileStore();
        var withBranch = CreateApprovedSpecRun();
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

    private static WorkflowRun CreateApprovedSpecRun(string? runtimeVersion = null)
    {
        var run = new WorkflowRun("US-0001", "sha256:abc", WorkflowDefinition.CanonicalV1, runtimeVersion);
        run.GenerateNextPhase();
        run.GenerateNextPhase();
        run.ApproveCurrentPhase(
            "main",
            "feature/us-0001-test-story",
            "feature",
            "workflow",
            "Test story",
            ".specs/us/workflow/US-0001/us.md",
            new DateTimeOffset(2026, 4, 18, 10, 0, 0, TimeSpan.Zero));
        return run;
    }
}
