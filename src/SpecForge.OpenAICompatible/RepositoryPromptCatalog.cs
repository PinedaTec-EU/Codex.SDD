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
            paths.PhaseExecutionSystemPromptPath,
            paths.AutoClarificationAnswersSystemPromptPath,
            paths.ClarificationExecutePromptPath,
            paths.RefinementExecutePromptPath,
            paths.RefinementApprovePromptPath,
            paths.TechnicalDesignExecutePromptPath,
            paths.ImplementationExecutePromptPath,
            paths.ReviewExecutePromptPath,
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
}
