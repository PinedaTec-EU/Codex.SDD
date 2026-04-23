using SpecForge.Domain.Persistence;
using SpecForge.Domain.Workflow;

namespace SpecForge.OpenAICompatible;

internal sealed class RepositoryPromptCatalog
{
    public void EnsureRepositoryIsInitialized(string workspaceRoot)
    {
        var paths = new PromptFilePaths(workspaceRoot);
        var requiredFiles = new[]
        {
            paths.ConfigFilePath,
            paths.PromptManifestPath,
            paths.SharedSystemPromptPath,
            paths.SharedStylePromptPath,
            paths.SharedOutputRulesPromptPath,
            paths.ClarificationExecuteSystemPromptPath,
            paths.ClarificationExecutePromptPath,
            paths.RefinementExecuteSystemPromptPath,
            paths.RefinementExecutePromptPath,
            paths.RefinementApproveSystemPromptPath,
            paths.RefinementApprovePromptPath,
            paths.TechnicalDesignExecuteSystemPromptPath,
            paths.TechnicalDesignExecutePromptPath,
            paths.ImplementationExecuteSystemPromptPath,
            paths.ImplementationExecutePromptPath,
            paths.ReviewExecuteSystemPromptPath,
            paths.ReviewExecutePromptPath,
            paths.ReleaseApprovalApproveSystemPromptPath,
            paths.AutoClarificationAnswersSystemPromptPath,
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
            PhaseId.Clarification => paths.ClarificationExecutePromptPath,
            PhaseId.Refinement => paths.RefinementExecutePromptPath,
            PhaseId.TechnicalDesign => paths.TechnicalDesignExecutePromptPath,
            PhaseId.Implementation => paths.ImplementationExecutePromptPath,
            PhaseId.Review => paths.ReviewExecutePromptPath,
            _ => throw new InvalidOperationException($"Phase '{phaseId}' does not have an execute prompt.")
        };
    }

    public string GetExecuteSystemPromptPath(string workspaceRoot, PhaseId phaseId)
    {
        var paths = new PromptFilePaths(workspaceRoot);

        return phaseId switch
        {
            PhaseId.Clarification => paths.ClarificationExecuteSystemPromptPath,
            PhaseId.Refinement => paths.RefinementExecuteSystemPromptPath,
            PhaseId.TechnicalDesign => paths.TechnicalDesignExecuteSystemPromptPath,
            PhaseId.Implementation => paths.ImplementationExecuteSystemPromptPath,
            PhaseId.Review => paths.ReviewExecuteSystemPromptPath,
            _ => throw new InvalidOperationException($"Phase '{phaseId}' does not have an execute system prompt.")
        };
    }

    public string GetApprovePromptPath(string workspaceRoot, PhaseId phaseId)
    {
        var paths = new PromptFilePaths(workspaceRoot);

        return phaseId switch
        {
            PhaseId.Refinement => paths.RefinementApprovePromptPath,
            PhaseId.ReleaseApproval => paths.ReleaseApprovalApprovePromptPath,
            _ => throw new InvalidOperationException($"Phase '{phaseId}' does not have an approve prompt.")
        };
    }

    public string GetApproveSystemPromptPath(string workspaceRoot, PhaseId phaseId)
    {
        var paths = new PromptFilePaths(workspaceRoot);

        return phaseId switch
        {
            PhaseId.Refinement => paths.RefinementApproveSystemPromptPath,
            PhaseId.ReleaseApproval => paths.ReleaseApprovalApproveSystemPromptPath,
            _ => throw new InvalidOperationException($"Phase '{phaseId}' does not have an approve system prompt.")
        };
    }
}
