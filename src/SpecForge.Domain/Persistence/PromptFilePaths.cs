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
        ConfigFilePath = Path.Combine(SpecsDirectoryPath, "config.yaml");
        PromptsDirectoryPath = Path.Combine(SpecsDirectoryPath, "prompts");
        PromptManifestPath = Path.Combine(PromptsDirectoryPath, "prompts.yaml");
        SharedPromptsDirectoryPath = Path.Combine(PromptsDirectoryPath, "shared");
        PhasePromptsDirectoryPath = Path.Combine(PromptsDirectoryPath, "phases");
        SharedSystemPromptPath = Path.Combine(SharedPromptsDirectoryPath, "system.md");
        SharedStylePromptPath = Path.Combine(SharedPromptsDirectoryPath, "style.md");
        SharedOutputRulesPromptPath = Path.Combine(SharedPromptsDirectoryPath, "output-rules.md");
        ClarificationExecuteSystemPromptPath = Path.Combine(PhasePromptsDirectoryPath, "clarification.execute.system.md");
        ClarificationExecutePromptPath = Path.Combine(PhasePromptsDirectoryPath, "clarification.execute.md");
        RefinementExecuteSystemPromptPath = Path.Combine(PhasePromptsDirectoryPath, "refinement.execute.system.md");
        RefinementExecutePromptPath = Path.Combine(PhasePromptsDirectoryPath, "refinement.execute.md");
        RefinementApproveSystemPromptPath = Path.Combine(PhasePromptsDirectoryPath, "refinement.approve.system.md");
        RefinementApprovePromptPath = Path.Combine(PhasePromptsDirectoryPath, "refinement.approve.md");
        TechnicalDesignExecuteSystemPromptPath = Path.Combine(PhasePromptsDirectoryPath, "technical-design.execute.system.md");
        TechnicalDesignExecutePromptPath = Path.Combine(PhasePromptsDirectoryPath, "technical-design.execute.md");
        ImplementationExecuteSystemPromptPath = Path.Combine(PhasePromptsDirectoryPath, "implementation.execute.system.md");
        ImplementationExecutePromptPath = Path.Combine(PhasePromptsDirectoryPath, "implementation.execute.md");
        ReviewExecuteSystemPromptPath = Path.Combine(PhasePromptsDirectoryPath, "review.execute.system.md");
        ReviewExecutePromptPath = Path.Combine(PhasePromptsDirectoryPath, "review.execute.md");
        ReleaseApprovalApproveSystemPromptPath = Path.Combine(PhasePromptsDirectoryPath, "release-approval.approve.system.md");
        ReleaseApprovalApprovePromptPath = Path.Combine(PhasePromptsDirectoryPath, "release-approval.approve.md");
        AutoClarificationAnswersSystemPromptPath = Path.Combine(PhasePromptsDirectoryPath, "clarification.auto-answer.system.md");
    }

    public string WorkspaceRoot { get; }

    public string SpecsDirectoryPath { get; }

    public string ConfigFilePath { get; }

    public string PromptsDirectoryPath { get; }

    public string PromptManifestPath { get; }

    public string SharedPromptsDirectoryPath { get; }

    public string PhasePromptsDirectoryPath { get; }

    public string SharedSystemPromptPath { get; }

    public string SharedStylePromptPath { get; }

    public string SharedOutputRulesPromptPath { get; }

    public string ClarificationExecuteSystemPromptPath { get; }

    public string ClarificationExecutePromptPath { get; }

    public string RefinementExecuteSystemPromptPath { get; }

    public string RefinementExecutePromptPath { get; }

    public string RefinementApproveSystemPromptPath { get; }

    public string RefinementApprovePromptPath { get; }

    public string TechnicalDesignExecuteSystemPromptPath { get; }

    public string TechnicalDesignExecutePromptPath { get; }

    public string ImplementationExecuteSystemPromptPath { get; }

    public string ImplementationExecutePromptPath { get; }

    public string ReviewExecuteSystemPromptPath { get; }

    public string ReviewExecutePromptPath { get; }

    public string ReleaseApprovalApproveSystemPromptPath { get; }

    public string ReleaseApprovalApprovePromptPath { get; }

    public string AutoClarificationAnswersSystemPromptPath { get; }
}
