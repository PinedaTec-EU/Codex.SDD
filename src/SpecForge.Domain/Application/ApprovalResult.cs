namespace SpecForge.Domain.Application;

public sealed record ApprovalResult(
    string UsId,
    string Status,
    string CurrentPhase,
    string? BaseBranch,
    string? WorkBranch);
