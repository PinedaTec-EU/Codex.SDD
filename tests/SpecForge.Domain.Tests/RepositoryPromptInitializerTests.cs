using SpecForge.Domain.Application;
using SpecForge.Domain.Persistence;

namespace SpecForge.Domain.Tests;

public sealed class RepositoryPromptInitializerTests : IDisposable
{
    private readonly string workspaceRoot = Path.Combine(Path.GetTempPath(), Guid.NewGuid().ToString("N"));

    [Fact]
    public async Task InitializeAsync_CreatesConfigManifestAndPhasePrompts()
    {
        var initializer = new RepositoryPromptInitializer();

        var result = await initializer.InitializeAsync(workspaceRoot);
        var paths = new PromptFilePaths(workspaceRoot);

        Assert.Equal(paths.ConfigFilePath, result.ConfigPath);
        Assert.Equal(paths.PromptManifestPath, result.PromptManifestPath);
        Assert.Contains(paths.RefinementExecutePromptPath, result.CreatedFiles);
        Assert.True(File.Exists(paths.ConfigFilePath));
        Assert.True(File.Exists(paths.PromptManifestPath));
        Assert.True(File.Exists(paths.SharedSystemPromptPath));
        Assert.True(File.Exists(paths.ReviewExecutePromptPath));
    }

    [Fact]
    public async Task InitializeAsync_WithoutOverwrite_SkipsExistingPromptFiles()
    {
        var initializer = new RepositoryPromptInitializer();

        await initializer.InitializeAsync(workspaceRoot);
        var secondRun = await initializer.InitializeAsync(workspaceRoot, overwrite: false);

        Assert.NotEmpty(secondRun.SkippedFiles);
        Assert.Empty(secondRun.CreatedFiles);
    }

    public void Dispose()
    {
        if (Directory.Exists(workspaceRoot))
        {
            Directory.Delete(workspaceRoot, recursive: true);
        }
    }
}
