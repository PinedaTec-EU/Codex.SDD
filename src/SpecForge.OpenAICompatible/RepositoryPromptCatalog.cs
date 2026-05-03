using SpecForge.Domain.Persistence;
using SpecForge.Domain.Workflow;
using SpecForge.Domain.Application;

namespace SpecForge.OpenAICompatible;

internal sealed class RepositoryPromptCatalog
{
    private readonly RepositoryPromptInitializer promptInitializer;

    public RepositoryPromptCatalog()
        : this(new RepositoryPromptInitializer())
    {
    }

    internal RepositoryPromptCatalog(RepositoryPromptInitializer promptInitializer)
    {
        this.promptInitializer = promptInitializer ?? throw new ArgumentNullException(nameof(promptInitializer));
    }

    public async Task EnsureRepositoryIsInitializedAsync(
        string workspaceRoot,
        CancellationToken cancellationToken = default)
    {
        var paths = new PromptFilePaths(workspaceRoot);
        if (!Directory.Exists(paths.PromptsDirectoryPath) || !File.Exists(paths.PromptManifestPath))
        {
            await promptInitializer.InitializeAsync(workspaceRoot, overwrite: false, cancellationToken);
        }
        else if (!File.Exists(paths.AgentInstructionsPath))
        {
            await promptInitializer.EnsureAgentInstructionsAsync(workspaceRoot, overwrite: false, cancellationToken);
        }

        var requiredFiles = new[]
        {
            paths.AgentInstructionsPath,
            paths.ConfigFilePath,
            paths.PromptManifestPath,
            paths.PromptSystemHashesPath,
            paths.SharedSystemPromptPath,
            paths.SharedStylePromptPath,
            paths.SharedOutputRulesPromptPath,
            paths.RefinementExecuteSystemPromptPath,
            paths.RefinementExecutePromptPath,
            paths.SpecExecuteSystemPromptPath,
            paths.SpecExecutePromptPath,
            paths.SpecApproveSystemPromptPath,
            paths.SpecApprovePromptPath,
            paths.TechnicalDesignExecuteSystemPromptPath,
            paths.TechnicalDesignExecutePromptPath,
            paths.ImplementationExecuteSystemPromptPath,
            paths.ImplementationExecutePromptPath,
            paths.ReviewExecuteSystemPromptPath,
            paths.ReviewExecutePromptPath,
            paths.ReleaseApprovalExecuteSystemPromptPath,
            paths.ReleaseApprovalExecutePromptPath,
            paths.ReleaseApprovalApproveSystemPromptPath,
            paths.PrPreparationExecuteSystemPromptPath,
            paths.PrPreparationExecutePromptPath,
            paths.AutoRefinementAnswersSystemPromptPath,
            paths.ReleaseApprovalApprovePromptPath
        };

        foreach (var requiredFile in requiredFiles)
        {
            if (!File.Exists(requiredFile))
            {
                throw new InvalidOperationException(
                    $"Missing required prompt template '{requiredFile}'. Run initialize_repo_prompts or restore the prompt file.");
            }
        }
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
}
