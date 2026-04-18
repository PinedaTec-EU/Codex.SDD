namespace SpecForge.Domain.Workflow;

public sealed class WorkflowDefinition
{
    private static readonly IReadOnlyDictionary<PhaseId, PhaseId> LinearTransitions =
        new Dictionary<PhaseId, PhaseId>
        {
            [PhaseId.Capture] = PhaseId.Clarification,
            [PhaseId.Clarification] = PhaseId.Refinement,
            [PhaseId.Refinement] = PhaseId.TechnicalDesign,
            [PhaseId.TechnicalDesign] = PhaseId.Implementation,
            [PhaseId.Implementation] = PhaseId.Review,
            [PhaseId.Review] = PhaseId.ReleaseApproval,
            [PhaseId.ReleaseApproval] = PhaseId.PrPreparation
        };

    private static readonly IReadOnlyDictionary<PhaseId, IReadOnlySet<PhaseId>> ValidRegressions =
        new Dictionary<PhaseId, IReadOnlySet<PhaseId>>
        {
            [PhaseId.Review] = new HashSet<PhaseId>
            {
                PhaseId.Refinement,
                PhaseId.TechnicalDesign,
                PhaseId.Implementation
            },
            [PhaseId.ReleaseApproval] = new HashSet<PhaseId>
            {
                PhaseId.Refinement,
                PhaseId.TechnicalDesign,
                PhaseId.Implementation
            }
        };

    private static readonly IReadOnlySet<PhaseId> ApprovalRequiredPhases =
        new HashSet<PhaseId>
        {
            PhaseId.Refinement,
            PhaseId.TechnicalDesign,
            PhaseId.ReleaseApproval
        };

    public static WorkflowDefinition CanonicalV1 { get; } = new("canonical-v1");

    public WorkflowDefinition(string workflowId)
    {
        if (string.IsNullOrWhiteSpace(workflowId))
        {
            throw new ArgumentException("Workflow id is required.", nameof(workflowId));
        }

        WorkflowId = workflowId;
    }

    public string WorkflowId { get; }

    public bool RequiresApproval(PhaseId phaseId) => ApprovalRequiredPhases.Contains(phaseId);

    public bool CanAdvanceFrom(PhaseId phaseId) =>
        phaseId == PhaseId.PrPreparation || LinearTransitions.ContainsKey(phaseId);

    public PhaseId GetNextPhase(PhaseId phaseId)
    {
        if (!LinearTransitions.TryGetValue(phaseId, out var next))
        {
            throw new WorkflowDomainException($"Phase '{phaseId}' cannot advance linearly.");
        }

        return next;
    }

    public bool CanRegress(PhaseId fromPhase, PhaseId targetPhase) =>
        ValidRegressions.TryGetValue(fromPhase, out var validTargets) && validTargets.Contains(targetPhase);
}
