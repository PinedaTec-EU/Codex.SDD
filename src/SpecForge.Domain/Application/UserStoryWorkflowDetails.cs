namespace SpecForge.Domain.Application;

public sealed record UserStoryWorkflowDetails(
    string UsId,
    string Title,
    string Kind,
    string Category,
    string Status,
    string CurrentPhase,
    string DirectoryPath,
    string? WorkBranch,
    string MainArtifactPath,
    string TimelinePath,
    string RawTimeline,
    IReadOnlyCollection<WorkflowPhaseDetails> Phases,
    CurrentPhaseControls Controls,
    ClarificationSessionDetails? Clarification,
    IReadOnlyCollection<TimelineEventDetails> Events,
    string ContextFilesDirectoryPath,
    IReadOnlyCollection<UserStoryFileDetails> ContextFiles,
    string AttachmentsDirectoryPath,
    IReadOnlyCollection<UserStoryFileDetails> Attachments);

public sealed record WorkflowPhaseDetails(
    string PhaseId,
    string Title,
    int Order,
    bool RequiresApproval,
    bool IsApproved,
    bool IsCurrent,
    string State,
    string? ArtifactPath,
    string? OperationLogPath,
    string? ExecutePromptPath,
    string? ApprovePromptPath);

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
    IReadOnlyCollection<string> Artifacts,
    TokenUsage? Usage,
    long? DurationMs);

public sealed record ClarificationSessionDetails(
    string Status,
    string Tolerance,
    string? Reason,
    IReadOnlyCollection<ClarificationQuestionAnswerDetails> Items);

public sealed record ClarificationQuestionAnswerDetails(
    int Index,
    string Question,
    string? Answer);

public sealed record UserStoryFileDetails(
    string Name,
    string Path);

public sealed record UserStoryFilesResult(
    string UsId,
    IReadOnlyCollection<UserStoryFileDetails> ContextFiles,
    IReadOnlyCollection<UserStoryFileDetails> Attachments);
