using SpecForge.Domain.Application;
using SpecForge.Domain.Workflow;

namespace SpecForge.Domain.Tests;

public sealed class RepositoryCategoryCatalogTests : IDisposable
{
    private readonly string workspaceRoot = Path.Combine(Path.GetTempPath(), Guid.NewGuid().ToString("N"));

    [Fact]
    public void GetCategories_WithoutConfig_ReturnsDefaultCatalog()
    {
        var catalog = new RepositoryCategoryCatalog();

        var categories = catalog.GetCategories(workspaceRoot);

        Assert.Contains("workflow", categories);
        Assert.Contains("branching", categories);
    }

    [Fact]
    public async Task GetCategories_WithConfigYaml_ReturnsConfiguredCatalog()
    {
        Directory.CreateDirectory(Path.Combine(workspaceRoot, ".specs"));
        await File.WriteAllTextAsync(
            Path.Combine(workspaceRoot, ".specs", "config.yaml"),
            """
            initialized: true
            categories:
              - custom-area
              - workflow
            """);

        var catalog = new RepositoryCategoryCatalog();

        var categories = catalog.GetCategories(workspaceRoot);

        Assert.Equal(new[] { "custom-area", "workflow" }, categories);
    }

    [Fact]
    public async Task EnsureCategoryIsAllowed_WithUnknownCategory_Throws()
    {
        Directory.CreateDirectory(Path.Combine(workspaceRoot, ".specs"));
        await File.WriteAllTextAsync(
            Path.Combine(workspaceRoot, ".specs", "config.yaml"),
            """
            initialized: true
            categories:
              - workflow
            """);

        var catalog = new RepositoryCategoryCatalog();

        var error = Assert.Throws<WorkflowDomainException>(() => catalog.EnsureCategoryIsAllowed(workspaceRoot, "unknown-area"));

        Assert.Contains("not allowed", error.Message);
    }

    public void Dispose()
    {
        if (Directory.Exists(workspaceRoot))
        {
            Directory.Delete(workspaceRoot, recursive: true);
        }
    }
}
