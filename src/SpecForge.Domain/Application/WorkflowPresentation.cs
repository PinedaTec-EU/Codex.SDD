using SpecForge.Domain.Workflow;

namespace SpecForge.Domain.Application;

public static class WorkflowPresentation
{
    public static string ToPhaseSlug(PhaseId phaseId) => phaseId switch
    {
        PhaseId.Capture => "capture",
        PhaseId.Refinement => "refinement",
        PhaseId.Spec => "spec",
        PhaseId.TechnicalDesign => "technical-design",
        PhaseId.Implementation => "implementation",
        PhaseId.Review => "review",
        PhaseId.ReleaseApproval => "release-approval",
        PhaseId.PrPreparation => "pr-preparation",
        _ => throw new ArgumentOutOfRangeException(nameof(phaseId), phaseId, null)
    };

    public static string ToStatusSlug(UserStoryStatus status) => status switch
    {
        UserStoryStatus.Draft => "draft",
        UserStoryStatus.Active => "active",
        UserStoryStatus.WaitingUser => "waiting-user",
        UserStoryStatus.Blocked => "blocked",
        UserStoryStatus.Completed => "completed",
        _ => throw new ArgumentOutOfRangeException(nameof(status), status, null)
    };

    public static PhaseId ParsePhaseSlug(string phaseSlug) => phaseSlug switch
    {
        "capture" => PhaseId.Capture,
        "clarification" => PhaseId.Refinement,
        "refinement" => PhaseId.Refinement,
        "spec" => PhaseId.Spec,
        "technical-design" => PhaseId.TechnicalDesign,
        "implementation" => PhaseId.Implementation,
        "review" => PhaseId.Review,
        "release-approval" => PhaseId.ReleaseApproval,
        "pr-preparation" => PhaseId.PrPreparation,
        _ => throw new ArgumentOutOfRangeException(nameof(phaseSlug), phaseSlug, "Unknown phase slug.")
    };

    public static bool ExpectsHumanIntervention(PhaseId phaseId, bool requiresApproval) =>
        phaseId == PhaseId.Refinement || requiresApproval;
}
