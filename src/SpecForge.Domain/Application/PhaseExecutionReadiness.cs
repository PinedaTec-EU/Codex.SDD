using SpecForge.Domain.Workflow;

namespace SpecForge.Domain.Application;

public sealed record PhaseExecutionReadiness(
    PhaseId PhaseId,
    bool CanExecute,
    string? BlockingReason = null,
    PhaseExecutionRequirements? RequiredPermissions = null,
    PhaseExecutionModelSecurity? AssignedModelSecurity = null,
    string? ValidationMessage = null);

public sealed record PhaseExecutionRequirements(
    bool ModelExecutionRequired,
    string RepositoryAccess,
    bool WorkspaceWriteAccess);

public sealed record PhaseExecutionModelSecurity(
    string ProviderKind,
    string Model,
    string? ProfileName,
    string RepositoryAccess,
    bool NativeCliRequired,
    bool NativeCliAvailable);

public static class PhaseExecutionBlockingReasons
{
    public const string ClarificationRequiresRepositoryReadAccess = "clarification_requires_repository_read_access";
    public const string RefinementRequiresRepositoryReadAccess = "refinement_requires_repository_read_access";
    public const string TechnicalDesignRequiresRepositoryReadAccess = "technical_design_requires_repository_read_access";
    public const string ImplementationRequiresRepositoryWriteAccess = "implementation_requires_repository_write_access";
    public const string ReviewRequiresRepositoryWriteAccess = "review_requires_repository_write_access";
    public const string CodexCliNotFound = "codex_cli_not_found";
    public const string ClaudeCliNotFound = "claude_cli_not_found";
    public const string CopilotCliNotFound = "copilot_cli_not_found";
}

public static class PhaseExecutionPermissionCatalog
{
    public static PhaseExecutionRequirements Describe(PhaseId phaseId) =>
        phaseId switch
        {
            PhaseId.Clarification => new(ModelExecutionRequired: true, RepositoryAccess: "read", WorkspaceWriteAccess: false),
            PhaseId.Refinement => new(ModelExecutionRequired: true, RepositoryAccess: "read", WorkspaceWriteAccess: false),
            PhaseId.TechnicalDesign => new(ModelExecutionRequired: true, RepositoryAccess: "read", WorkspaceWriteAccess: false),
            PhaseId.Implementation => new(ModelExecutionRequired: true, RepositoryAccess: "read-write", WorkspaceWriteAccess: true),
            PhaseId.Review => new(ModelExecutionRequired: true, RepositoryAccess: "read-write", WorkspaceWriteAccess: true),
            _ => new(ModelExecutionRequired: false, RepositoryAccess: "none", WorkspaceWriteAccess: false)
        };

    public static string ResolveRepositoryAccessBlockingReason(PhaseId phaseId) =>
        phaseId switch
        {
            PhaseId.Clarification => PhaseExecutionBlockingReasons.ClarificationRequiresRepositoryReadAccess,
            PhaseId.Refinement => PhaseExecutionBlockingReasons.RefinementRequiresRepositoryReadAccess,
            PhaseId.TechnicalDesign => PhaseExecutionBlockingReasons.TechnicalDesignRequiresRepositoryReadAccess,
            PhaseId.Implementation => PhaseExecutionBlockingReasons.ImplementationRequiresRepositoryWriteAccess,
            PhaseId.Review => PhaseExecutionBlockingReasons.ReviewRequiresRepositoryWriteAccess,
            _ => "phase_execution_not_ready"
        };
}
