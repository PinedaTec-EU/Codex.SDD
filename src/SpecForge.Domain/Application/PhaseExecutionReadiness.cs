using SpecForge.Domain.Workflow;

namespace SpecForge.Domain.Application;

public sealed record PhaseExecutionReadiness(
    PhaseId PhaseId,
    bool CanExecute,
    string? BlockingReason = null);

public static class PhaseExecutionBlockingReasons
{
    public const string ImplementationRequiresRepositoryWriteAccess = "implementation_requires_repository_write_access";
    public const string ReviewRequiresRepositoryReadAccess = "review_requires_repository_read_access";
    public const string CodexCliNotFound = "codex_cli_not_found";
}
