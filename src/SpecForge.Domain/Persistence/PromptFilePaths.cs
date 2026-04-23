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
        SystemPromptsDirectoryPath = Path.Combine(PromptsDirectoryPath, "system");
        PhasePromptsDirectoryPath = Path.Combine(PromptsDirectoryPath, "phases");
        SharedSystemPromptPath = Path.Combine(SharedPromptsDirectoryPath, "system.md");
        SharedStylePromptPath = Path.Combine(SharedPromptsDirectoryPath, "style.md");
        SharedOutputRulesPromptPath = Path.Combine(SharedPromptsDirectoryPath, "output-rules.md");
        PhaseExecutionSystemPromptPath = Path.Combine(SystemPromptsDirectoryPath, "phase-execution.md");
        AutoClarificationAnswersSystemPromptPath = Path.Combine(SystemPromptsDirectoryPath, "auto-clarification-answers.md");
        ClarificationExecutePromptPath = Path.Combine(PhasePromptsDirectoryPath, "clarification.execute.md");
        RefinementExecutePromptPath = Path.Combine(PhasePromptsDirectoryPath, "refinement.execute.md");
        RefinementApprovePromptPath = Path.Combine(PhasePromptsDirectoryPath, "refinement.approve.md");
        TechnicalDesignExecutePromptPath = Path.Combine(PhasePromptsDirectoryPath, "technical-design.execute.md");
        ImplementationExecutePromptPath = Path.Combine(PhasePromptsDirectoryPath, "implementation.execute.md");
        ReviewExecutePromptPath = Path.Combine(PhasePromptsDirectoryPath, "review.execute.md");
        ReleaseApprovalApprovePromptPath = Path.Combine(PhasePromptsDirectoryPath, "release-approval.approve.md");
    }

    public string WorkspaceRoot { get; }

    public string SpecsDirectoryPath { get; }

    public string ConfigFilePath { get; }

    public string PromptsDirectoryPath { get; }

    public string PromptManifestPath { get; }

    public string SharedPromptsDirectoryPath { get; }

    public string SystemPromptsDirectoryPath { get; }

    public string PhasePromptsDirectoryPath { get; }

    public string SharedSystemPromptPath { get; }

    public string SharedStylePromptPath { get; }

    public string SharedOutputRulesPromptPath { get; }

    public string PhaseExecutionSystemPromptPath { get; }

    public string AutoClarificationAnswersSystemPromptPath { get; }

    public string ClarificationExecutePromptPath { get; }

    public string RefinementExecutePromptPath { get; }

    public string RefinementApprovePromptPath { get; }

    public string TechnicalDesignExecutePromptPath { get; }

    public string ImplementationExecutePromptPath { get; }

    public string ReviewExecutePromptPath { get; }

    public string ReleaseApprovalApprovePromptPath { get; }
}
