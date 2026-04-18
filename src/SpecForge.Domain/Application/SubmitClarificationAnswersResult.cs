namespace SpecForge.Domain.Application;

public sealed record SubmitClarificationAnswersResult(
    string UsId,
    string CurrentPhase,
    string Status,
    int AnsweredQuestions);
