using SpecForge.Domain.Persistence;
using SpecForge.Domain.Application;
using SpecForge.Domain.Workflow;

namespace SpecForge.OpenAICompatible;

internal sealed class RepositoryPromptCatalog
{
    public async Task<PromptTemplateContent> ReadPromptAsync(
        string workspaceRoot,
        string promptPath,
        CancellationToken cancellationToken)
    {
        var paths = new PromptFilePaths(workspaceRoot);
        var templates = RepositoryPromptInitializer.BuildTemplateMap(paths);
        var normalizedPath = Path.GetFullPath(promptPath);

        if (File.Exists(normalizedPath))
        {
            return new PromptTemplateContent(
                normalizedPath,
                await File.ReadAllTextAsync(normalizedPath, cancellationToken),
                IsOverride: true,
                EmbeddedContent: templates.TryGetValue(normalizedPath, out var embedded) ? embedded : null);
        }

        if (!templates.TryGetValue(normalizedPath, out var content))
        {
            throw new InvalidOperationException($"Prompt template '{promptPath}' is not a known SpecForge prompt template.");
        }

        return new PromptTemplateContent(normalizedPath, content, IsOverride: false, EmbeddedContent: content);
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

    internal sealed record PromptTemplateContent(
        string Path,
        string Content,
        bool IsOverride,
        string? EmbeddedContent);
}
