using SpecForge.Domain.Workflow;

namespace SpecForge.Domain.Application;

internal static class WorkflowRewindPolicy
{
    public static void EnsureCanRewind(
        WorkflowRun workflowRun,
        PhaseId targetPhase,
        IReadOnlyCollection<TimelineEventDetails> timelineEvents)
    {
        if (IsLatestReopenLandingPhase(workflowRun, timelineEvents))
        {
            throw new WorkflowDomainException(
                "Rewind is not available from the recovery phase reached by the latest completed-workflow reopen.");
        }

        if (IsImplementationReviewNavigation(targetPhase) && HasMultipleImplementationReviewIterations(timelineEvents))
        {
            throw new WorkflowDomainException(
                "Rewind through technical design, implementation, or review is not available after multiple implementation/review iterations. Use regression instead.");
        }
    }

    private static bool IsLatestReopenLandingPhase(
        WorkflowRun workflowRun,
        IReadOnlyCollection<TimelineEventDetails> timelineEvents)
    {
        var latestReopen = timelineEvents
            .LastOrDefault(static timelineEvent => timelineEvent.Code == "workflow_reopened");
        if (latestReopen is null || string.IsNullOrWhiteSpace(latestReopen.Phase))
        {
            return false;
        }

        return latestReopen.Phase == WorkflowPresentation.ToPhaseSlug(workflowRun.CurrentPhase);
    }

    private static bool HasMultipleImplementationReviewIterations(
        IReadOnlyCollection<TimelineEventDetails> timelineEvents)
    {
        var implementationAttempts = CountArtifactProducingEvents(timelineEvents, PhaseId.Implementation);
        var reviewAttempts = CountArtifactProducingEvents(timelineEvents, PhaseId.Review);

        return implementationAttempts > 1 || reviewAttempts > 1;
    }

    private static int CountArtifactProducingEvents(
        IReadOnlyCollection<TimelineEventDetails> timelineEvents,
        PhaseId phaseId)
    {
        var phaseSlug = WorkflowPresentation.ToPhaseSlug(phaseId);

        return timelineEvents.Count(timelineEvent =>
            timelineEvent.Phase == phaseSlug &&
            timelineEvent.Artifacts.Any(static artifact => artifact.EndsWith(".md", StringComparison.OrdinalIgnoreCase)));
    }

    private static bool IsImplementationReviewNavigation(PhaseId targetPhase) =>
        targetPhase is PhaseId.TechnicalDesign or PhaseId.Implementation or PhaseId.Review;
}
