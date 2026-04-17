namespace SpecForge.Domain.Application;

public interface IPhaseExecutionProvider
{
    Task<PhaseExecutionResult> ExecuteAsync(
        PhaseExecutionContext context,
        CancellationToken cancellationToken = default);
}
