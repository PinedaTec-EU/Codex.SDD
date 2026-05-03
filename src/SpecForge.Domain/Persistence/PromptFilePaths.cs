namespace SpecForge.Domain.Persistence;

public sealed class PromptFilePaths
{
    public PromptFilePaths(string workspaceRoot)
    {
        if (string.IsNullOrWhiteSpace(workspaceRoot))
        {
            throw new ArgumentException("Workspace root is required.", nameof(workspaceRoot));
        }

        WorkspaceRoot = workspaceRoot;
        SpecsDirectoryPath = Path.Combine(workspaceRoot, UserStoryFilePaths.SpecsDirectoryName);
        AgentInstructionsPath = Path.Combine(SpecsDirectoryPath, "AGENTS.md");
        ConfigFilePath = Path.Combine(SpecsDirectoryPath, "config.yaml");
        PromptsDirectoryPath = Path.Combine(SpecsDirectoryPath, "prompts");
        PromptManifestPath = Path.Combine(PromptsDirectoryPath, "prompts.yaml");
        PromptSystemHashesPath = Path.Combine(PromptsDirectoryPath, "system-prompt-hashes.json");
        SharedPromptsDirectoryPath = Path.Combine(PromptsDirectoryPath, "shared");
        PhasePromptsDirectoryPath = Path.Combine(PromptsDirectoryPath, "phases");
        SharedSystemPromptPath = Path.Combine(SharedPromptsDirectoryPath, "system.md");
        SharedStylePromptPath = Path.Combine(SharedPromptsDirectoryPath, "style.md");
        SharedOutputRulesPromptPath = Path.Combine(SharedPromptsDirectoryPath, "output-rules.md");
        RefinementExecuteSystemPromptPath = Path.Combine(PhasePromptsDirectoryPath, "refinement.execute.system.md");
        RefinementExecutePromptPath = Path.Combine(PhasePromptsDirectoryPath, "refinement.execute.md");
        SpecExecuteSystemPromptPath = Path.Combine(PhasePromptsDirectoryPath, "spec.execute.system.md");
        SpecExecutePromptPath = Path.Combine(PhasePromptsDirectoryPath, "spec.execute.md");
        SpecApproveSystemPromptPath = Path.Combine(PhasePromptsDirectoryPath, "spec.approve.system.md");
        SpecApprovePromptPath = Path.Combine(PhasePromptsDirectoryPath, "spec.approve.md");
        TechnicalDesignExecuteSystemPromptPath = Path.Combine(PhasePromptsDirectoryPath, "technical-design.execute.system.md");
        TechnicalDesignExecutePromptPath = Path.Combine(PhasePromptsDirectoryPath, "technical-design.execute.md");
        ImplementationExecuteSystemPromptPath = Path.Combine(PhasePromptsDirectoryPath, "implementation.execute.system.md");
        ImplementationExecutePromptPath = Path.Combine(PhasePromptsDirectoryPath, "implementation.execute.md");
        ReviewExecuteSystemPromptPath = Path.Combine(PhasePromptsDirectoryPath, "review.execute.system.md");
        ReviewExecutePromptPath = Path.Combine(PhasePromptsDirectoryPath, "review.execute.md");
        ReleaseApprovalExecuteSystemPromptPath = Path.Combine(PhasePromptsDirectoryPath, "release-approval.execute.system.md");
        ReleaseApprovalExecutePromptPath = Path.Combine(PhasePromptsDirectoryPath, "release-approval.execute.md");
        ReleaseApprovalApproveSystemPromptPath = Path.Combine(PhasePromptsDirectoryPath, "release-approval.approve.system.md");
        ReleaseApprovalApprovePromptPath = Path.Combine(PhasePromptsDirectoryPath, "release-approval.approve.md");
        PrPreparationExecuteSystemPromptPath = Path.Combine(PhasePromptsDirectoryPath, "pr-preparation.execute.system.md");
        PrPreparationExecutePromptPath = Path.Combine(PhasePromptsDirectoryPath, "pr-preparation.execute.md");
        AutoRefinementAnswersSystemPromptPath = Path.Combine(PhasePromptsDirectoryPath, "refinement.auto-answer.system.md");
    }

    public string WorkspaceRoot { get; }

    public string SpecsDirectoryPath { get; }

    public string AgentInstructionsPath { get; }

    public string ConfigFilePath { get; }

    public string PromptsDirectoryPath { get; }

    public string PromptManifestPath { get; }

    public string PromptSystemHashesPath { get; }

    public string SharedPromptsDirectoryPath { get; }

    public string PhasePromptsDirectoryPath { get; }

    public string SharedSystemPromptPath { get; }

    public string SharedStylePromptPath { get; }

    public string SharedOutputRulesPromptPath { get; }

    public string RefinementExecuteSystemPromptPath { get; }

    public string RefinementExecutePromptPath { get; }

    public string SpecExecuteSystemPromptPath { get; }

    public string SpecExecutePromptPath { get; }

    public string SpecApproveSystemPromptPath { get; }

    public string SpecApprovePromptPath { get; }

    public string TechnicalDesignExecuteSystemPromptPath { get; }

    public string TechnicalDesignExecutePromptPath { get; }

    public string ImplementationExecuteSystemPromptPath { get; }

    public string ImplementationExecutePromptPath { get; }

    public string ReviewExecuteSystemPromptPath { get; }

    public string ReviewExecutePromptPath { get; }

    public string ReleaseApprovalExecuteSystemPromptPath { get; }

    public string ReleaseApprovalExecutePromptPath { get; }

    public string ReleaseApprovalApproveSystemPromptPath { get; }

    public string ReleaseApprovalApprovePromptPath { get; }

    public string PrPreparationExecuteSystemPromptPath { get; }

    public string PrPreparationExecutePromptPath { get; }

    public string AutoRefinementAnswersSystemPromptPath { get; }
}
