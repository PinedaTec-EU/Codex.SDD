using SpecForge.Domain.Application;
using SpecForge.Domain.Persistence;
using SpecForge.Domain.Workflow;

namespace SpecForge.OpenAICompatible;

internal sealed class RepositoryPromptCatalog
{
    public Task<PromptTemplateContent> ReadPromptAsync(
        string workspaceRoot,
        string promptPath,
        CancellationToken cancellationToken = default)
    {
        var paths = new PromptFilePaths(workspaceRoot);
        var templates = RepositoryPromptInitializer.BuildTemplateMap(paths)
            .ToDictionary(
                static item => Path.GetFullPath(item.Key),
                static item => item.Value,
                StringComparer.Ordinal);
        var absolutePath = Path.GetFullPath(promptPath);

        if (File.Exists(absolutePath))
        {
            return ReadOverrideAsync(absolutePath, templates, cancellationToken);
        }

        if (!templates.TryGetValue(absolutePath, out var embeddedContent))
        {
            throw new InvalidOperationException($"Prompt template '{promptPath}' is not a known SpecForge prompt template.");
        }

        return Task.FromResult(new PromptTemplateContent(
            absolutePath,
            embeddedContent,
            IsOverride: false,
            EmbeddedContent: embeddedContent));
    }

    private static async Task<PromptTemplateContent> ReadOverrideAsync(
        string absolutePath,
        IReadOnlyDictionary<string, string> templates,
        CancellationToken cancellationToken)
    {
        var content = await File.ReadAllTextAsync(absolutePath, cancellationToken);
        templates.TryGetValue(absolutePath, out var embeddedContent);
        return new PromptTemplateContent(
            absolutePath,
            content,
            IsOverride: true,
            EmbeddedContent: embeddedContent);
    }

    public string GetExecutePromptPath(string workspaceRoot, PhaseId phaseId)
    {
        var paths = new PromptFilePaths(workspaceRoot);

        return phaseId switch
        {
            PhaseId.Refinement => paths.RefinementExecutePromptPath,
            PhaseId.Spec => paths.SpecExecutePromptPath,
            PhaseId.TechnicalDesign => paths.TechnicalDesignExecutePromptPath,
            PhaseId.Implementation => paths.ImplementationExecutePromptPath,
            PhaseId.Review => paths.ReviewExecutePromptPath,
            PhaseId.ReleaseApproval => paths.ReleaseApprovalExecutePromptPath,
            PhaseId.PrPreparation => paths.PrPreparationExecutePromptPath,
            _ => throw new InvalidOperationException($"Phase '{phaseId}' does not have an execute prompt.")
        };
    }

    public string GetExecuteSystemPromptPath(string workspaceRoot, PhaseId phaseId)
    {
        var paths = new PromptFilePaths(workspaceRoot);

        return phaseId switch
        {
            PhaseId.Refinement => paths.RefinementExecuteSystemPromptPath,
            PhaseId.Spec => paths.SpecExecuteSystemPromptPath,
            PhaseId.TechnicalDesign => paths.TechnicalDesignExecuteSystemPromptPath,
            PhaseId.Implementation => paths.ImplementationExecuteSystemPromptPath,
            PhaseId.Review => paths.ReviewExecuteSystemPromptPath,
            PhaseId.ReleaseApproval => paths.ReleaseApprovalExecuteSystemPromptPath,
            PhaseId.PrPreparation => paths.PrPreparationExecuteSystemPromptPath,
            _ => throw new InvalidOperationException($"Phase '{phaseId}' does not have an execute system prompt.")
        };
    }

    public string GetApprovePromptPath(string workspaceRoot, PhaseId phaseId)
    {
        var paths = new PromptFilePaths(workspaceRoot);

        return phaseId switch
        {
            PhaseId.Spec => paths.SpecApprovePromptPath,
            PhaseId.ReleaseApproval => paths.ReleaseApprovalApprovePromptPath,
            _ => throw new InvalidOperationException($"Phase '{phaseId}' does not have an approve prompt.")
        };
    }

    public string GetApproveSystemPromptPath(string workspaceRoot, PhaseId phaseId)
    {
        var paths = new PromptFilePaths(workspaceRoot);

        return phaseId switch
        {
            PhaseId.Spec => paths.SpecApproveSystemPromptPath,
            PhaseId.ReleaseApproval => paths.ReleaseApprovalApproveSystemPromptPath,
            _ => throw new InvalidOperationException($"Phase '{phaseId}' does not have an approve system prompt.")
        };
    }

    public sealed record PromptTemplateContent(
        string Path,
        string Content,
        bool IsOverride,
        string? EmbeddedContent);
}
