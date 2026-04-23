using SpecForge.Domain.Workflow;

namespace SpecForge.Domain.Application;

public interface IPhaseExecutionProvider
{
    PhaseExecutionReadiness GetPhaseExecutionReadiness(PhaseId phaseId);

    Task<PhaseExecutionResult> ExecuteAsync(
        PhaseExecutionContext context,
        CancellationToken cancellationToken = default);

    Task<AutoClarificationAnswersResult?> TryAutoAnswerClarificationAsync(
        PhaseExecutionContext context,
        ClarificationSession session,
        CancellationToken cancellationToken = default);
}
