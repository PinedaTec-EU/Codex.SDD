namespace SpecForge.Domain.Application;

public sealed record SubmitRefinementAnswersResult(
    string UsId,
    string CurrentPhase,
    string Status,
    int AnsweredQuestions);
