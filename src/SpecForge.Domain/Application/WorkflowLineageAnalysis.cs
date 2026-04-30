using SpecForge.Domain.Persistence;
using SpecForge.Domain.Workflow;

namespace SpecForge.Domain.Application;

public sealed record WorkflowLineageAnalysisResult(
    string UsId,
    string Status,
    IReadOnlyCollection<WorkflowLineageFinding> Findings,
    IReadOnlyCollection<string> DeprecatedCandidatePaths,
    string? RecommendedTargetPhase);

public sealed record WorkflowLineageFinding(
    string Severity,
    string Confidence,
    string Code,
    string Summary,
    string? PhaseId,
    string? EventTimestampUtc,
    IReadOnlyCollection<string> AffectedArtifacts);

public sealed record WorkflowLineageRepairResult(
    string UsId,
    string Status,
    string CurrentPhase,
    string ArchiveDirectoryPath,
    IReadOnlyCollection<string> ArchivedPaths,
    WorkflowLineageAnalysisResult Analysis);

internal static class WorkflowLineageAnalyzer
{
    public static WorkflowLineageAnalysisResult Analyze(
        string usId,
        UserStoryFilePaths paths,
        IReadOnlyCollection<TimelineEventDetails> events)
    {
        var findings = new List<WorkflowLineageFinding>();
        var deprecatedCandidates = new List<string>();

        var orderedEvents = events.ToArray();
        var latestRepairIndex = Array.FindLastIndex(orderedEvents, static timelineEvent => timelineEvent.Code == "workflow_repaired");
        for (var eventIndex = 0; eventIndex < orderedEvents.Length; eventIndex += 1)
        {
            if (eventIndex < latestRepairIndex)
            {
                continue;
            }

            var timelineEvent = orderedEvents[eventIndex];
            foreach (var artifact in timelineEvent.Artifacts)
            {
                if (!File.Exists(artifact))
                {
                    findings.Add(new WorkflowLineageFinding(
                        "warning",
                        "certain",
                        "timeline_artifact_missing",
                        $"Timeline event `{timelineEvent.Code}` references an artifact that no longer exists.",
                        timelineEvent.Phase,
                        timelineEvent.TimestampUtc,
                        [artifact]));
                }
            }
        }

        for (var index = 0; index < orderedEvents.Length; index += 1)
        {
            var timelineEvent = orderedEvents[index];
            if (timelineEvent.Code != "workflow_reopened" || string.IsNullOrWhiteSpace(timelineEvent.Phase))
            {
                continue;
            }

            var reopenedPhase = timelineEvent.Phase;
            var laterEvents = orderedEvents.Skip(index + 1).ToArray();
            if (laterEvents.Any(candidate =>
                    candidate.Code == "workflow_repaired" &&
                    string.Equals(candidate.Phase, reopenedPhase, StringComparison.Ordinal)))
            {
                continue;
            }

            var hasLandingArtifact = laterEvents.Any(candidate =>
                string.Equals(candidate.Phase, reopenedPhase, StringComparison.Ordinal) &&
                candidate.Code is "phase_completed" or "artifact_operated" &&
                candidate.Artifacts.Any(static artifact => artifact.EndsWith(".md", StringComparison.OrdinalIgnoreCase)));
            if (hasLandingArtifact)
            {
                continue;
            }

            var downstreamArtifacts = laterEvents
                .Where(candidate => IsDownstreamOf(candidate.Phase, reopenedPhase))
                .SelectMany(static candidate => candidate.Artifacts)
                .Where(static artifact => artifact.EndsWith(".md", StringComparison.OrdinalIgnoreCase))
                .Distinct(StringComparer.Ordinal)
                .ToArray();
            if (downstreamArtifacts.Length == 0)
            {
                findings.Add(new WorkflowLineageFinding(
                    "warning",
                    "high",
                    "completed_reopen_pending_landing_artifact",
                    $"Completed workflow was reopened to `{reopenedPhase}` but no new artifact has been generated for that landing phase yet.",
                    reopenedPhase,
                    timelineEvent.TimestampUtc,
                    []));
                continue;
            }

            deprecatedCandidates.AddRange(downstreamArtifacts);
            findings.Add(new WorkflowLineageFinding(
                "error",
                "certain",
                "completed_reopen_skipped_landing_phase",
                $"Completed workflow was reopened to `{reopenedPhase}`, but downstream artifacts were generated before a new `{reopenedPhase}` artifact.",
                reopenedPhase,
                timelineEvent.TimestampUtc,
                downstreamArtifacts));
        }

        var status = findings.Any(static finding => finding.Severity == "error")
            ? "inconsistent"
            : findings.Count > 0 ? "warning" : "clean";
        var recommendedTargetPhase = findings
            .FirstOrDefault(static finding => finding.Code == "completed_reopen_skipped_landing_phase")
            ?.PhaseId;

        return new WorkflowLineageAnalysisResult(
            usId,
            status,
            findings,
            deprecatedCandidates.Distinct(StringComparer.Ordinal).ToArray(),
            recommendedTargetPhase);
    }

    private static bool IsDownstreamOf(string? phase, string upstreamPhase)
    {
        if (string.IsNullOrWhiteSpace(phase))
        {
            return false;
        }

        try
        {
            return WorkflowPresentation.ParsePhaseSlug(phase) > WorkflowPresentation.ParsePhaseSlug(upstreamPhase);
        }
        catch
        {
            return false;
        }
    }
}
