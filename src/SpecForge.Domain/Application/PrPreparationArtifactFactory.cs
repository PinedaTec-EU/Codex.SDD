using SpecForge.Domain.Workflow;

namespace SpecForge.Domain.Application;

public static class PrPreparationArtifactFactory
{
    public static PrPreparationArtifactDocument Compose(PhaseExecutionContext context)
    {
        var reviewArtifactPath = GetRequiredPath(context, PhaseId.Review);
        var reviewArtifactName = Path.GetFileName(reviewArtifactPath);
        var branchSummary = context.PreviousArtifactPaths.TryGetValue(PhaseId.ReleaseApproval, out var releaseApprovalPath)
            ? $"Approved release artifact: {Path.GetFileName(releaseApprovalPath)}"
            : "Approved release artifact is available through the workflow context.";
        var participants = BuildParticipantsFromTimeline(context);

        return new PrPreparationArtifactDocument(
            State: "ready_to_publish",
            BasedOn: ["release-approval", reviewArtifactName, "03-implementation.md", "02-technical-design.md", "01-spec.md"],
            PrTitle: $"{context.UsId}: deliver approved workflow scope",
            PrSummary: "This PR packages the approved workflow scope into a draft pull request ready for reviewer validation.",
            BranchSummary:
            [
                "Use the recorded workflow branch metadata as the source of truth for branch naming and target branch.",
                branchSummary
            ],
            Participants: participants,
            ChangeNarrative:
            [
                "Summarizes the scope approved in the workflow artifacts for asynchronous review.",
                "References implementation and review outputs directly so the PR body stays repository-grounded."
            ],
            ValidationSummary:
            [
                $"Validated through review artifact `{reviewArtifactName}`.",
                "Any remaining manual checks must stay explicit in the PR body before publication."
            ],
            ReviewerChecklist:
            [
                "Review scope against spec and technical design",
                "Verify claimed validation evidence",
                "Confirm residual risks and follow ups are acceptable"
            ],
            RisksAndFollowUps:
            [
                "Document any residual risk that survived release approval.",
                "List concrete follow ups instead of vague future work."
            ],
            PrBody:
            [
                "## Summary",
                "- Deliver the approved workflow scope recorded for this user story.",
                "- Keep the description aligned with the approved spec, technical design, implementation, and review artifacts.",
                "",
                "## Participants",
                participants.Count == 0
                    ? "- user — capture"
                    : string.Join(Environment.NewLine, participants.Select(static participant => $"- {participant.Actor}: {string.Join(", ", participant.Phases)}")),
                "",
                "## Validation",
                $"- Review artifact: `{reviewArtifactName}`",
                "- Validation evidence is tracked in the workflow artifacts and should be checked against the changed files before merge.",
                "",
                "## Risks",
                "- Capture remaining risks from release approval."
            ]);
    }

    public static PrPreparationArtifactDocument RepairIncomplete(
        PhaseExecutionContext context,
        PrPreparationArtifactDocument candidate)
    {
        var fallback = Compose(context);

        return new PrPreparationArtifactDocument(
            State: ChooseScalar(candidate.State, fallback.State),
            BasedOn: ChooseLines(candidate.BasedOn, fallback.BasedOn),
            PrTitle: ChooseScalar(candidate.PrTitle, fallback.PrTitle),
            PrSummary: ChooseScalar(candidate.PrSummary, fallback.PrSummary),
            BranchSummary: ChooseLines(candidate.BranchSummary, fallback.BranchSummary),
            Participants: ChooseParticipants(candidate.Participants, fallback.Participants),
            ChangeNarrative: ChooseLines(candidate.ChangeNarrative, fallback.ChangeNarrative),
            ValidationSummary: ChooseLines(candidate.ValidationSummary, fallback.ValidationSummary),
            ReviewerChecklist: ChooseLines(candidate.ReviewerChecklist, fallback.ReviewerChecklist),
            RisksAndFollowUps: ChooseLines(candidate.RisksAndFollowUps, fallback.RisksAndFollowUps),
            PrBody: ChoosePrBody(candidate.PrBody, fallback.PrBody));
    }

    private static string GetRequiredPath(PhaseExecutionContext context, PhaseId phaseId)
    {
        if (!context.PreviousArtifactPaths.TryGetValue(phaseId, out var path))
        {
            throw new WorkflowDomainException($"Previous artifact for phase '{phaseId}' was not found.");
        }

        return path;
    }

    private static IReadOnlyList<PrPreparationParticipant> BuildParticipantsFromTimeline(PhaseExecutionContext context)
    {
        var timelinePath = context.ContextFilePaths
            .FirstOrDefault(static path => Path.GetFileName(path).Equals("timeline.md", StringComparison.OrdinalIgnoreCase));
        if (string.IsNullOrWhiteSpace(timelinePath) || !File.Exists(timelinePath))
        {
            return [];
        }

        var events = TimelineMarkdownParser.ParseEvents(File.ReadAllText(timelinePath));
        return events
            .Where(static item => !string.IsNullOrWhiteSpace(item.Actor) && !string.IsNullOrWhiteSpace(item.Phase))
            .GroupBy(static item => item.Actor!.Trim(), StringComparer.OrdinalIgnoreCase)
            .Select(group => new PrPreparationParticipant(
                group.Key,
                group.Select(static item => item.Phase!.Trim())
                    .Distinct(StringComparer.Ordinal)
                    .OrderBy(static phase => phase, StringComparer.Ordinal)
                    .ToArray()))
            .OrderBy(static participant => participant.Actor, StringComparer.OrdinalIgnoreCase)
            .ToArray();
    }

    private static string ChooseScalar(string candidate, string fallback) =>
        IsPlaceholder(candidate) ? fallback : candidate.Trim();

    private static IReadOnlyList<string> ChooseLines(IReadOnlyList<string> candidate, IReadOnlyList<string> fallback)
    {
        var filtered = (candidate ?? Array.Empty<string>())
            .Where(static item => !IsPlaceholder(item))
            .Select(static item => item.Trim())
            .ToArray();

        return filtered.Length == 0 ? fallback : filtered;
    }

    private static IReadOnlyList<PrPreparationParticipant> ChooseParticipants(
        IReadOnlyList<PrPreparationParticipant> candidate,
        IReadOnlyList<PrPreparationParticipant> fallback)
    {
        var filtered = (candidate ?? Array.Empty<PrPreparationParticipant>())
            .Where(static participant => !IsPlaceholder(participant.Actor))
            .Select(static participant => new PrPreparationParticipant(
                participant.Actor.Trim(),
                ChooseLines(participant.Phases, Array.Empty<string>())))
            .Where(static participant => participant.Phases.Count > 0)
            .ToArray();

        return filtered.Length == 0 ? fallback : filtered;
    }

    private static IReadOnlyList<string> ChoosePrBody(IReadOnlyList<string> candidate, IReadOnlyList<string> fallback)
    {
        var filtered = (candidate ?? Array.Empty<string>())
            .Where(static item => !string.IsNullOrWhiteSpace(item) && !string.Equals(item.Trim(), "...", StringComparison.Ordinal))
            .Select(static item => item.TrimEnd())
            .ToArray();

        return filtered.Length == 0 ? fallback : filtered;
    }

    private static bool IsPlaceholder(string? value) =>
        string.IsNullOrWhiteSpace(value) ||
        string.Equals(value.Trim(), "...", StringComparison.Ordinal) ||
        string.Equals(value.Trim(), "TODO", StringComparison.OrdinalIgnoreCase);
}
