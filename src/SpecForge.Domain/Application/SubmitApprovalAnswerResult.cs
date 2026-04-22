namespace SpecForge.Domain.Application;

public sealed record SubmitApprovalAnswerResult(
    string UsId,
    string CurrentPhase,
    string Status,
    string GeneratedArtifactPath);
