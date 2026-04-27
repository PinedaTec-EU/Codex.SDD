using SpecForge.Domain.Persistence;
using SpecForge.Domain.Workflow;

namespace SpecForge.Domain.Application;

public static class WorkflowIterationDetailsBuilder
{
    public static IReadOnlyCollection<PhaseIterationDetails> Build(
        UserStoryFilePaths paths,
        IReadOnlyCollection<TimelineEventDetails> events)
    {
        var iterations = new List<PhaseIterationDetails>();
        var attemptsByPhase = new Dictionary<string, int>(StringComparer.Ordinal);
        var latestArtifactsByPhase = new Dictionary<string, string>(StringComparer.Ordinal);
        var operationEntriesByResult = BuildOperationEntriesByResult(paths);

        foreach (var timelineEvent in events)
        {
            if (string.IsNullOrWhiteSpace(timelineEvent.Phase))
            {
                continue;
            }

            var outputArtifactPath = timelineEvent.Artifacts
                .LastOrDefault(candidate => candidate.EndsWith(".md", StringComparison.OrdinalIgnoreCase));
            if (string.IsNullOrWhiteSpace(outputArtifactPath))
            {
                continue;
            }

            var normalizedPhaseId = timelineEvent.Phase.Trim();
            attemptsByPhase.TryGetValue(normalizedPhaseId, out var currentAttempt);
            var attempt = currentAttempt + 1;
            attemptsByPhase[normalizedPhaseId] = attempt;

            var operationEntry = operationEntriesByResult.TryGetValue(outputArtifactPath.Replace('\\', '/'), out var matchedEntry)
                ? matchedEntry
                : null;
            var phaseId = WorkflowPresentation.ParsePhaseSlug(normalizedPhaseId);
            var implicitInputArtifactPath = ResolveImplicitInputArtifactPath(paths, phaseId, latestArtifactsByPhase, normalizedPhaseId, timelineEvent.Code);
            var inputArtifactPath = operationEntry?.SourceArtifactPath ?? implicitInputArtifactPath;
            var contextArtifactPaths = operationEntry?.ContextArtifactPaths
                ?? Array.Empty<string>();
            var operationLogPath = phaseId is PhaseId.Spec or PhaseId.TechnicalDesign or PhaseId.Implementation or PhaseId.Review or PhaseId.ReleaseApproval or PhaseId.PrPreparation
                ? paths.GetLatestExistingPhaseOperationLogPath(phaseId)
                : null;

            iterations.Add(new PhaseIterationDetails(
                BuildIterationKey(normalizedPhaseId, attempt, timelineEvent),
                attempt,
                normalizedPhaseId,
                timelineEvent.TimestampUtc,
                timelineEvent.Code,
                timelineEvent.Actor,
                timelineEvent.Summary,
                outputArtifactPath,
                inputArtifactPath,
                contextArtifactPaths,
                operationEntry is not null ? operationLogPath : null,
                operationEntry?.Prompt,
                timelineEvent.Usage,
                timelineEvent.DurationMs,
                timelineEvent.Execution));

            latestArtifactsByPhase[normalizedPhaseId] = outputArtifactPath;
        }

        return iterations;
    }

    private static string BuildIterationKey(string phaseId, int attempt, TimelineEventDetails timelineEvent) =>
        string.Create(
            System.Globalization.CultureInfo.InvariantCulture,
            $"{phaseId}:{attempt}:{timelineEvent.TimestampUtc}:{timelineEvent.Code}");

    private static Dictionary<string, ArtifactOperationLogEntry> BuildOperationEntriesByResult(UserStoryFilePaths paths)
    {
        var map = new Dictionary<string, ArtifactOperationLogEntry>(StringComparer.Ordinal);
        foreach (var phaseId in new[] { PhaseId.Spec, PhaseId.TechnicalDesign, PhaseId.Implementation, PhaseId.Review, PhaseId.ReleaseApproval, PhaseId.PrPreparation })
        {
            var operationLogPath = paths.GetLatestExistingPhaseOperationLogPath(phaseId);
            if (string.IsNullOrWhiteSpace(operationLogPath) || !File.Exists(operationLogPath))
            {
                continue;
            }

            var entries = ArtifactOperationLogParser.Parse(File.ReadAllText(operationLogPath));
            foreach (var entry in entries)
            {
                map[entry.ResultArtifactPath.Replace('\\', '/')] = entry;
            }
        }

        return map;
    }

    private static string? ResolveImplicitInputArtifactPath(
        UserStoryFilePaths paths,
        PhaseId phaseId,
        IReadOnlyDictionary<string, string> latestArtifactsByPhase,
        string normalizedPhaseId,
        string eventCode)
    {
        if (eventCode.Equals("artifact_operated", StringComparison.Ordinal))
        {
            return latestArtifactsByPhase.TryGetValue(normalizedPhaseId, out var samePhaseArtifact)
                ? samePhaseArtifact
                : null;
        }

        return phaseId switch
        {
            PhaseId.Refinement => File.Exists(paths.MainArtifactPath) ? paths.MainArtifactPath : null,
            PhaseId.Spec => FindLatestArtifact(latestArtifactsByPhase, PhaseId.Refinement) ?? (File.Exists(paths.MainArtifactPath) ? paths.MainArtifactPath : null),
            PhaseId.TechnicalDesign => FindLatestArtifact(latestArtifactsByPhase, PhaseId.Spec),
            PhaseId.Implementation => FindLatestArtifact(latestArtifactsByPhase, PhaseId.TechnicalDesign),
            PhaseId.Review => FindLatestArtifact(latestArtifactsByPhase, PhaseId.Implementation),
            PhaseId.ReleaseApproval => FindLatestArtifact(latestArtifactsByPhase, PhaseId.Review),
            PhaseId.PrPreparation => FindLatestArtifact(latestArtifactsByPhase, PhaseId.ReleaseApproval) ?? FindLatestArtifact(latestArtifactsByPhase, PhaseId.Review),
            _ => null
        };
    }

    private static string? FindLatestArtifact(IReadOnlyDictionary<string, string> latestArtifactsByPhase, PhaseId phaseId)
    {
        var phaseSlug = WorkflowPresentation.ToPhaseSlug(phaseId);
        return latestArtifactsByPhase.TryGetValue(phaseSlug, out var artifactPath)
            ? artifactPath
            : null;
    }
}
