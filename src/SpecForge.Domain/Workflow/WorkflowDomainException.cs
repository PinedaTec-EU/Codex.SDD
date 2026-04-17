namespace SpecForge.Domain.Workflow;

public sealed class WorkflowDomainException : Exception
{
    public WorkflowDomainException(string message)
        : base(message)
    {
    }
}
