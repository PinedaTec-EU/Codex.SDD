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
        Assert.Equal(paths.PromptSystemHashesPath, result.PromptSystemHashesPath);
        Assert.Contains(paths.RefinementExecutePromptPath, result.CreatedFiles);
        Assert.True(File.Exists(paths.ConfigFilePath));
        Assert.True(File.Exists(paths.PromptManifestPath));
        Assert.True(File.Exists(paths.PromptSystemHashesPath));
        Assert.True(File.Exists(paths.SharedSystemPromptPath));
        Assert.True(File.Exists(paths.ClarificationExecuteSystemPromptPath));
        Assert.True(File.Exists(paths.RefinementExecuteSystemPromptPath));
        Assert.True(File.Exists(paths.RefinementApproveSystemPromptPath));
        Assert.True(File.Exists(paths.TechnicalDesignExecuteSystemPromptPath));
        Assert.True(File.Exists(paths.ImplementationExecuteSystemPromptPath));
        Assert.True(File.Exists(paths.ReviewExecuteSystemPromptPath));
        Assert.True(File.Exists(paths.ReleaseApprovalApproveSystemPromptPath));
        Assert.True(File.Exists(paths.AutoClarificationAnswersSystemPromptPath));
        Assert.True(File.Exists(paths.ReviewExecutePromptPath));
        var configContent = await File.ReadAllTextAsync(paths.ConfigFilePath);
        var manifestContent = await File.ReadAllTextAsync(paths.PromptManifestPath);
        var sharedSystemPrompt = await File.ReadAllTextAsync(paths.SharedSystemPromptPath);
        var sharedOutputRulesPrompt = await File.ReadAllTextAsync(paths.SharedOutputRulesPromptPath);
        var implementationSystemPrompt = await File.ReadAllTextAsync(paths.ImplementationExecuteSystemPromptPath);
        var implementationPrompt = await File.ReadAllTextAsync(paths.ImplementationExecutePromptPath);
        var reviewSystemPrompt = await File.ReadAllTextAsync(paths.ReviewExecuteSystemPromptPath);
        var reviewPrompt = await File.ReadAllTextAsync(paths.ReviewExecutePromptPath);
        Assert.Contains("categories:", configContent);
        Assert.Contains("- workflow", configContent);
        Assert.Contains("clarification.execute.system.md", manifestContent);
        Assert.Contains("release-approval.approve.system.md", manifestContent);
        Assert.Contains("internalCalls:", manifestContent);
        Assert.Contains("Return structured JSON", sharedSystemPrompt);
        Assert.Contains("Return only JSON", sharedOutputRulesPrompt);
        Assert.DoesNotContain("Return only the markdown", sharedOutputRulesPrompt);
        Assert.Contains("implementation evidence", implementationSystemPrompt);
        Assert.Contains("repository evidence, touched files, and validations", implementationPrompt);
        Assert.Contains("implementation evidence is missing, empty", reviewSystemPrompt);
        Assert.Contains("if implementation evidence shows zero touched files, the review must fail", reviewPrompt);
        var hashContent = await File.ReadAllTextAsync(paths.PromptSystemHashesPath);
        Assert.Contains("clarification.execute.system.md", hashContent);
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
