namespace SpecForge.Domain.Application;

public sealed record UserStoryWorkflowDetails(
    string UsId,
    string Title,
    string Category,
    string Status,
    string CurrentPhase,
    string? WorkBranch,
    string MainArtifactPath,
    string TimelinePath,
    string RawTimeline,
    IReadOnlyCollection<WorkflowPhaseDetails> Phases,
    CurrentPhaseControls Controls,
    IReadOnlyCollection<TimelineEventDetails> Events);

public sealed record WorkflowPhaseDetails(
    string PhaseId,
    string Title,
    int Order,
    bool RequiresApproval,
    bool IsApproved,
    bool IsCurrent,
    string State,
    string? ArtifactPath);

public sealed record CurrentPhaseControls(
    bool CanContinue,
    bool CanApprove,
    bool RequiresApproval,
    string? BlockingReason,
    bool CanRestartFromSource,
    IReadOnlyCollection<string> RegressionTargets);

public sealed record TimelineEventDetails(
    string TimestampUtc,
    string Code,
    string? Actor,
    string? Phase,
    string? Summary,
    IReadOnlyCollection<string> Artifacts);
