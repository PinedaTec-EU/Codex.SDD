using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using SpecForge.Domain.Workflow;

namespace SpecForge.Domain.Application;

public static class PhaseMarkdownArtifactContracts
{
    private static readonly ISet<PhaseId> SupportedPhases = new HashSet<PhaseId>
    {
        PhaseId.Refinement,
        PhaseId.Spec,
        PhaseId.TechnicalDesign,
        PhaseId.Implementation,
        PhaseId.Review,
        PhaseId.ReleaseApproval,
        PhaseId.PrPreparation
    };

    public static bool Supports(PhaseId phaseId) => SupportedPhases.Contains(phaseId);

    public static string NormalizeContent(string content) => content.TrimEnd() + Environment.NewLine;
}

public sealed record RefinementArtifactDocument(
    string State,
    string Decision,
    string Reason,
    IReadOnlyList<string> Questions);

public sealed record TechnicalDesignArtifactDocument(
    string State,
    string BasedOn,
    string TechnicalSummary,
    string TechnicalObjective,
    IReadOnlyList<string> AffectedComponents,
    IReadOnlyList<string> Architecture,
    IReadOnlyList<string> PrimaryFlow,
    IReadOnlyList<string> ConstraintsAndGuardrails,
    IReadOnlyList<string> AlternativesConsidered,
    IReadOnlyList<string> TechnicalRisks,
    IReadOnlyList<string> ExpectedImpact,
    IReadOnlyList<string> ImplementationStrategy,
    IReadOnlyList<string> ValidationStrategy,
    IReadOnlyList<string> OpenDecisions);

public sealed record ImplementationArtifactDocument(
    string State,
    string BasedOn,
    string ImplementedObjective,
    IReadOnlyList<string> PlannedOrExecutedChanges,
    IReadOnlyList<string> PlannedVerification);

public sealed record ReviewArtifactDocument(
    string Result,
    IReadOnlyList<ReviewValidationChecklistItem> ValidationChecklist,
    IReadOnlyList<string> Findings,
    string PrimaryReason,
    IReadOnlyList<string> Recommendation);

public sealed record ReleaseApprovalArtifactDocument(
    string State,
    IReadOnlyList<string> BasedOn,
    string ReleaseSummary,
    IReadOnlyList<string> ImplementedScope,
    IReadOnlyList<string> ValidationEvidence,
    IReadOnlyList<string> ResidualRisks,
    IReadOnlyList<string> ApprovalChecklist,
    string Recommendation);

public sealed record PrPreparationArtifactDocument(
    string State,
    IReadOnlyList<string> BasedOn,
    string PrTitle,
    string PrSummary,
    IReadOnlyList<string> BranchSummary,
    IReadOnlyList<PrPreparationParticipant> Participants,
    IReadOnlyList<string> ChangeNarrative,
    IReadOnlyList<string> ValidationSummary,
    IReadOnlyList<string> ReviewerChecklist,
    IReadOnlyList<string> RisksAndFollowUps,
    IReadOnlyList<string> PrBody);

public sealed record PrPreparationParticipant(
    string Actor,
    IReadOnlyList<string> Phases);

public sealed record ReviewValidationChecklistItem(
    string Status,
    string Item,
    string Evidence);

public static class RefinementArtifactJson
{
    public static RefinementArtifactDocument ParseCanonicalJson(string json) =>
        StructuredPhaseArtifactJson.DeserializeAndNormalize<RefinementArtifactDocument>(
            json,
            normalize: Normalize);

    public static string Serialize(RefinementArtifactDocument document) =>
        StructuredPhaseArtifactJson.Serialize(Normalize(document));

    public static string RenderMarkdown(RefinementArtifactDocument document, string usId, int version)
    {
        var normalized = Normalize(document);
        var lines = new List<string>
        {
            $"# Refinement · {usId} · v{version:00}",
            string.Empty,
            "## State",
            $"- State: `{normalized.State}`",
            string.Empty,
            "## Decision",
            normalized.Decision,
            string.Empty,
            "## Reason",
            normalized.Reason,
            string.Empty,
            "## Questions"
        };
        lines.AddRange(normalized.Questions.Count == 0
            ? ["1. No refinement questions remain."]
            : normalized.Questions.Select((question, index) => $"{index + 1}. {question}"));
        return string.Join(Environment.NewLine, lines) + Environment.NewLine;
    }

    private static RefinementArtifactDocument Normalize(RefinementArtifactDocument document) =>
        new(
            State: StructuredPhaseArtifactJson.NormalizeScalar(document.State),
            Decision: StructuredPhaseArtifactJson.NormalizeScalar(document.Decision),
            Reason: StructuredPhaseArtifactJson.NormalizeScalar(document.Reason),
            Questions: StructuredPhaseArtifactJson.NormalizeLines(document.Questions));
}

public static class TechnicalDesignArtifactJson
{
    public static TechnicalDesignArtifactDocument ParseCanonicalJson(string json) =>
        StructuredPhaseArtifactJson.DeserializeAndNormalize<TechnicalDesignArtifactDocument>(
            json,
            normalize: Normalize);

    public static string Serialize(TechnicalDesignArtifactDocument document) =>
        StructuredPhaseArtifactJson.Serialize(Normalize(document));

    public static string RenderMarkdown(TechnicalDesignArtifactDocument document, string usId, int version)
    {
        var normalized = Normalize(document);
        var lines = new List<string>
        {
            $"# Technical Design · {usId} · v{version:00}",
            string.Empty,
            "## State",
            $"- State: `{normalized.State}`",
            $"- Based on: `{normalized.BasedOn}`",
            string.Empty,
            "## Technical Summary",
            normalized.TechnicalSummary,
            string.Empty,
            "## Technical Objective",
            normalized.TechnicalObjective,
            string.Empty,
            "## Affected Components"
        };
        lines.AddRange(StructuredPhaseArtifactMarkdown.RenderBulletSection(normalized.AffectedComponents));
        lines.Add(string.Empty);
        lines.Add("## Proposed Design");
        lines.Add("### Architecture");
        lines.AddRange(StructuredPhaseArtifactMarkdown.RenderBulletSection(normalized.Architecture));
        lines.Add(string.Empty);
        lines.Add("### Primary Flow");
        lines.AddRange(StructuredPhaseArtifactMarkdown.RenderNumberedSection(normalized.PrimaryFlow));
        lines.Add(string.Empty);
        lines.Add("### Constraints and Guardrails");
        lines.AddRange(StructuredPhaseArtifactMarkdown.RenderBulletSection(normalized.ConstraintsAndGuardrails));
        lines.Add(string.Empty);
        lines.Add("## Alternatives Considered");
        lines.AddRange(StructuredPhaseArtifactMarkdown.RenderBulletSection(normalized.AlternativesConsidered));
        lines.Add(string.Empty);
        lines.Add("## Technical Risks");
        lines.AddRange(StructuredPhaseArtifactMarkdown.RenderBulletSection(normalized.TechnicalRisks));
        lines.Add(string.Empty);
        lines.Add("## Expected Impact");
        lines.AddRange(StructuredPhaseArtifactMarkdown.RenderBulletSection(normalized.ExpectedImpact));
        lines.Add(string.Empty);
        lines.Add("## Implementation Strategy");
        lines.AddRange(StructuredPhaseArtifactMarkdown.RenderNumberedSection(normalized.ImplementationStrategy));
        lines.Add(string.Empty);
        lines.Add("## Validation Strategy");
        lines.AddRange(StructuredPhaseArtifactMarkdown.RenderBulletSection(normalized.ValidationStrategy));
        lines.Add(string.Empty);
        lines.Add("## Open Decisions");
        lines.AddRange(StructuredPhaseArtifactMarkdown.RenderBulletSection(normalized.OpenDecisions));
        return string.Join(Environment.NewLine, lines) + Environment.NewLine;
    }

    private static TechnicalDesignArtifactDocument Normalize(TechnicalDesignArtifactDocument document) =>
        new(
            State: StructuredPhaseArtifactJson.NormalizeScalar(document.State),
            BasedOn: StructuredPhaseArtifactJson.NormalizeScalar(document.BasedOn),
            TechnicalSummary: StructuredPhaseArtifactJson.NormalizeScalar(document.TechnicalSummary),
            TechnicalObjective: StructuredPhaseArtifactJson.NormalizeScalar(document.TechnicalObjective),
            AffectedComponents: StructuredPhaseArtifactJson.NormalizeLines(document.AffectedComponents),
            Architecture: StructuredPhaseArtifactJson.NormalizeLines(document.Architecture),
            PrimaryFlow: StructuredPhaseArtifactJson.NormalizeLines(document.PrimaryFlow),
            ConstraintsAndGuardrails: StructuredPhaseArtifactJson.NormalizeLines(document.ConstraintsAndGuardrails),
            AlternativesConsidered: StructuredPhaseArtifactJson.NormalizeLines(document.AlternativesConsidered),
            TechnicalRisks: StructuredPhaseArtifactJson.NormalizeLines(document.TechnicalRisks),
            ExpectedImpact: StructuredPhaseArtifactJson.NormalizeLines(document.ExpectedImpact),
            ImplementationStrategy: StructuredPhaseArtifactJson.NormalizeLines(document.ImplementationStrategy),
            ValidationStrategy: StructuredPhaseArtifactJson.NormalizeLines(document.ValidationStrategy),
            OpenDecisions: StructuredPhaseArtifactJson.NormalizeLines(document.OpenDecisions));
}

public static class ImplementationArtifactJson
{
    public static ImplementationArtifactDocument ParseCanonicalJson(string json) =>
        StructuredPhaseArtifactJson.DeserializeAndNormalize<ImplementationArtifactDocument>(
            json,
            normalize: Normalize);

    public static string Serialize(ImplementationArtifactDocument document) =>
        StructuredPhaseArtifactJson.Serialize(Normalize(document));

    public static string RenderMarkdown(ImplementationArtifactDocument document, string usId, int version)
    {
        var normalized = Normalize(document);
        var lines = new List<string>
        {
            $"# Implementation · {usId} · v{version:00}",
            string.Empty,
            "## State",
            $"- State: `{normalized.State}`",
            $"- Based on: `{normalized.BasedOn}`",
            string.Empty,
            "## Implemented Objective",
            normalized.ImplementedObjective,
            string.Empty,
            "## Planned or Executed Changes"
        };
        lines.AddRange(StructuredPhaseArtifactMarkdown.RenderBulletSection(normalized.PlannedOrExecutedChanges));
        lines.Add(string.Empty);
        lines.Add("## Planned Verification");
        lines.AddRange(StructuredPhaseArtifactMarkdown.RenderBulletSection(normalized.PlannedVerification));
        return string.Join(Environment.NewLine, lines) + Environment.NewLine;
    }

    private static ImplementationArtifactDocument Normalize(ImplementationArtifactDocument document) =>
        new(
            State: StructuredPhaseArtifactJson.NormalizeScalar(document.State),
            BasedOn: StructuredPhaseArtifactJson.NormalizeScalar(document.BasedOn),
            ImplementedObjective: StructuredPhaseArtifactJson.NormalizeScalar(document.ImplementedObjective),
            PlannedOrExecutedChanges: StructuredPhaseArtifactJson.NormalizeLines(document.PlannedOrExecutedChanges),
            PlannedVerification: StructuredPhaseArtifactJson.NormalizeLines(document.PlannedVerification));
}

public static class ReviewArtifactJson
{
    public static ReviewArtifactDocument ParseCanonicalJson(string json) =>
        StructuredPhaseArtifactJson.DeserializeAndNormalize<ReviewArtifactDocument>(
            json,
            normalize: Normalize);

    public static string Serialize(ReviewArtifactDocument document) =>
        StructuredPhaseArtifactJson.Serialize(Normalize(document));

    public static string RenderMarkdown(ReviewArtifactDocument document, string usId, int version)
    {
        var normalized = Normalize(document);
        var lines = new List<string>
        {
            $"# Review · {usId} · v{version:00}",
            string.Empty,
            "## State",
            $"- Result: `{normalized.Result}`",
            string.Empty,
            "## Validation Checklist"
        };
        lines.AddRange(StructuredPhaseArtifactMarkdown.RenderValidationChecklistSection(normalized.ValidationChecklist));
        lines.Add(string.Empty);
        lines.Add("## Findings");
        lines.AddRange(StructuredPhaseArtifactMarkdown.RenderBulletSection(normalized.Findings));
        lines.Add(string.Empty);
        lines.Add("## Verdict");
        lines.Add($"- Final result: `{normalized.Result}`");
        lines.Add($"- Primary reason: {normalized.PrimaryReason}");
        lines.Add(string.Empty);
        lines.Add("## Recommendation");
        lines.AddRange(StructuredPhaseArtifactMarkdown.RenderBulletSection(normalized.Recommendation));
        return string.Join(Environment.NewLine, lines) + Environment.NewLine;
    }

    private static ReviewArtifactDocument Normalize(ReviewArtifactDocument document) =>
        new(
            Result: StructuredPhaseArtifactJson.NormalizeScalar(document.Result),
            ValidationChecklist: NormalizeChecklist(document.ValidationChecklist),
            Findings: StructuredPhaseArtifactJson.NormalizeLines(document.Findings),
            PrimaryReason: StructuredPhaseArtifactJson.NormalizeScalar(document.PrimaryReason),
            Recommendation: StructuredPhaseArtifactJson.NormalizeLines(document.Recommendation));

    private static IReadOnlyList<ReviewValidationChecklistItem> NormalizeChecklist(
        IReadOnlyList<ReviewValidationChecklistItem>? items) =>
        (items ?? Array.Empty<ReviewValidationChecklistItem>())
            .Select(static item => new ReviewValidationChecklistItem(
                Status: NormalizeChecklistStatus(item.Status),
                Item: StructuredPhaseArtifactJson.NormalizeScalar(item.Item),
                Evidence: StructuredPhaseArtifactJson.NormalizeScalar(item.Evidence)))
            .Where(static item => !string.IsNullOrWhiteSpace(item.Item))
            .ToArray();

    private static string NormalizeChecklistStatus(string status)
    {
        var normalized = StructuredPhaseArtifactJson.NormalizeScalar(status);

        return normalized.ToLowerInvariant() switch
        {
            "pass" => "pass",
            "deferred" => "deferred",
            _ => "fail"
        };
    }
}

public static class ReleaseApprovalArtifactJson
{
    public static ReleaseApprovalArtifactDocument ParseCanonicalJson(string json) =>
        StructuredPhaseArtifactJson.DeserializeAndNormalize<ReleaseApprovalArtifactDocument>(
            json,
            normalize: Normalize);

    public static string Serialize(ReleaseApprovalArtifactDocument document) =>
        StructuredPhaseArtifactJson.Serialize(Normalize(document));

    public static string RenderMarkdown(ReleaseApprovalArtifactDocument document, string usId, int version)
    {
        var normalized = Normalize(document);
        var lines = new List<string>
        {
            $"# Release Approval · {usId} · v{version:00}",
            string.Empty,
            "## State",
            $"- State: `{normalized.State}`",
            string.Empty,
            "## Based On"
        };
        lines.AddRange(StructuredPhaseArtifactMarkdown.RenderBulletSection(normalized.BasedOn));
        lines.Add(string.Empty);
        lines.Add("## Release Summary");
        lines.Add(normalized.ReleaseSummary);
        lines.Add(string.Empty);
        lines.Add("## Implemented Scope");
        lines.AddRange(StructuredPhaseArtifactMarkdown.RenderBulletSection(normalized.ImplementedScope));
        lines.Add(string.Empty);
        lines.Add("## Validation Evidence");
        lines.AddRange(StructuredPhaseArtifactMarkdown.RenderBulletSection(normalized.ValidationEvidence));
        lines.Add(string.Empty);
        lines.Add("## Residual Risks");
        lines.AddRange(StructuredPhaseArtifactMarkdown.RenderBulletSection(normalized.ResidualRisks));
        lines.Add(string.Empty);
        lines.Add("## Approval Checklist");
        lines.AddRange(StructuredPhaseArtifactMarkdown.RenderChecklistSection(normalized.ApprovalChecklist));
        lines.Add(string.Empty);
        lines.Add("## Recommendation");
        lines.Add(normalized.Recommendation);
        return string.Join(Environment.NewLine, lines) + Environment.NewLine;
    }

    private static ReleaseApprovalArtifactDocument Normalize(ReleaseApprovalArtifactDocument document) =>
        new(
            State: StructuredPhaseArtifactJson.NormalizeScalar(document.State),
            BasedOn: StructuredPhaseArtifactJson.NormalizeLines(document.BasedOn),
            ReleaseSummary: StructuredPhaseArtifactJson.NormalizeScalar(document.ReleaseSummary),
            ImplementedScope: StructuredPhaseArtifactJson.NormalizeLines(document.ImplementedScope),
            ValidationEvidence: StructuredPhaseArtifactJson.NormalizeLines(document.ValidationEvidence),
            ResidualRisks: StructuredPhaseArtifactJson.NormalizeLines(document.ResidualRisks),
            ApprovalChecklist: StructuredPhaseArtifactJson.NormalizeLines(document.ApprovalChecklist),
            Recommendation: StructuredPhaseArtifactJson.NormalizeScalar(document.Recommendation));
}

public static class PrPreparationArtifactJson
{
    public static PrPreparationArtifactDocument ParseCanonicalJson(string json) =>
        StructuredPhaseArtifactJson.DeserializeAndNormalize<PrPreparationArtifactDocument>(
            json,
            normalize: Normalize);

    public static string Serialize(PrPreparationArtifactDocument document) =>
        StructuredPhaseArtifactJson.Serialize(Normalize(document));

    public static string RenderMarkdown(PrPreparationArtifactDocument document, string usId, int version)
    {
        var normalized = Normalize(document);
        var lines = new List<string>
        {
            $"# PR Preparation · {usId} · v{version:00}",
            string.Empty,
            "## State",
            $"- State: `{normalized.State}`",
            string.Empty,
            "## Based On"
        };
        lines.AddRange(StructuredPhaseArtifactMarkdown.RenderBulletSection(normalized.BasedOn));
        lines.Add(string.Empty);
        lines.Add("## PR Title");
        lines.Add(normalized.PrTitle);
        lines.Add(string.Empty);
        lines.Add("## PR Summary");
        lines.Add(normalized.PrSummary);
        lines.Add(string.Empty);
        lines.Add("## Branch Summary");
        lines.AddRange(StructuredPhaseArtifactMarkdown.RenderBulletSection(normalized.BranchSummary));
        lines.Add(string.Empty);
        lines.Add("## Participants");
        lines.AddRange(normalized.Participants.Count == 0
            ? ["- user — phases: capture"]
            : normalized.Participants.Select(static participant =>
                $"- {participant.Actor} — phases: {string.Join(", ", participant.Phases)}"));
        lines.Add(string.Empty);
        lines.Add("## Change Narrative");
        lines.AddRange(StructuredPhaseArtifactMarkdown.RenderBulletSection(normalized.ChangeNarrative));
        lines.Add(string.Empty);
        lines.Add("## Validation Summary");
        lines.AddRange(StructuredPhaseArtifactMarkdown.RenderBulletSection(normalized.ValidationSummary));
        lines.Add(string.Empty);
        lines.Add("## Reviewer Checklist");
        lines.AddRange(StructuredPhaseArtifactMarkdown.RenderChecklistSection(normalized.ReviewerChecklist));
        lines.Add(string.Empty);
        lines.Add("## Risks and Follow Ups");
        lines.AddRange(StructuredPhaseArtifactMarkdown.RenderBulletSection(normalized.RisksAndFollowUps));
        lines.Add(string.Empty);
        lines.Add("## PR Body");
        lines.AddRange(normalized.PrBody.Count == 0 ? ["..."] : normalized.PrBody);
        return string.Join(Environment.NewLine, lines) + Environment.NewLine;
    }

    public static PrPreparationArtifactDocument ParseMarkdown(string markdown) =>
        Normalize(new PrPreparationArtifactDocument(
            State: ReadState(markdown),
            BasedOn: WorkflowArtifactMarkdownReader.ReadMarkdownBulletSection(markdown, "## Based On"),
            PrTitle: ReadScalarSection(markdown, "## PR Title"),
            PrSummary: ReadScalarSection(markdown, "## PR Summary"),
            BranchSummary: WorkflowArtifactMarkdownReader.ReadMarkdownBulletSection(markdown, "## Branch Summary"),
            Participants: ParseParticipants(WorkflowArtifactMarkdownReader.ReadMarkdownBulletSection(markdown, "## Participants")),
            ChangeNarrative: WorkflowArtifactMarkdownReader.ReadMarkdownBulletSection(markdown, "## Change Narrative"),
            ValidationSummary: WorkflowArtifactMarkdownReader.ReadMarkdownBulletSection(markdown, "## Validation Summary"),
            ReviewerChecklist: WorkflowArtifactMarkdownReader.ReadMarkdownBulletSection(markdown, "## Reviewer Checklist"),
            RisksAndFollowUps: WorkflowArtifactMarkdownReader.ReadMarkdownBulletSection(markdown, "## Risks and Follow Ups"),
            PrBody: ReadPrBody(markdown)));

    private static PrPreparationArtifactDocument Normalize(PrPreparationArtifactDocument document) =>
        new(
            State: StructuredPhaseArtifactJson.NormalizeScalar(document.State),
            BasedOn: StructuredPhaseArtifactJson.NormalizeLines(document.BasedOn),
            PrTitle: StructuredPhaseArtifactJson.NormalizeScalar(document.PrTitle),
            PrSummary: StructuredPhaseArtifactJson.NormalizeScalar(document.PrSummary),
            BranchSummary: StructuredPhaseArtifactJson.NormalizeLines(document.BranchSummary),
            Participants: NormalizeParticipants(document.Participants),
            ChangeNarrative: StructuredPhaseArtifactJson.NormalizeLines(document.ChangeNarrative),
            ValidationSummary: StructuredPhaseArtifactJson.NormalizeLines(document.ValidationSummary),
            ReviewerChecklist: StructuredPhaseArtifactJson.NormalizeLines(document.ReviewerChecklist),
            RisksAndFollowUps: StructuredPhaseArtifactJson.NormalizeLines(document.RisksAndFollowUps),
            PrBody: StructuredPhaseArtifactJson.NormalizeLines(document.PrBody));

    private static IReadOnlyList<PrPreparationParticipant> NormalizeParticipants(
        IReadOnlyList<PrPreparationParticipant>? participants) =>
        (participants ?? Array.Empty<PrPreparationParticipant>())
            .Select(static participant => new PrPreparationParticipant(
                StructuredPhaseArtifactJson.NormalizeScalar(participant.Actor),
                StructuredPhaseArtifactJson.NormalizeLines(participant.Phases)))
            .Where(static participant => !string.IsNullOrWhiteSpace(participant.Actor))
            .ToArray();

    private static string ReadState(string markdown)
    {
        var stateSection = MarkdownHelper.TryReadSection(markdown, "## State") ?? string.Empty;
        foreach (var line in stateSection.Replace("\r\n", "\n", StringComparison.Ordinal).Split('\n'))
        {
            var trimmed = line.Trim();
            const string prefix = "- State:";
            if (!trimmed.StartsWith(prefix, StringComparison.OrdinalIgnoreCase))
            {
                continue;
            }

            return trimmed[prefix.Length..].Trim().Trim('`');
        }

        return ReadScalarSection(markdown, "## State");
    }

    private static string ReadScalarSection(string markdown, string heading)
    {
        var section = MarkdownHelper.TryReadSection(markdown, heading) ?? string.Empty;
        return section
            .Replace("\r\n", "\n", StringComparison.Ordinal)
            .Split('\n')
            .Select(static line => line.Trim())
            .FirstOrDefault(static line => !string.IsNullOrWhiteSpace(line) && line != "...")
            ?? string.Empty;
    }

    private static IReadOnlyList<PrPreparationParticipant> ParseParticipants(IReadOnlyList<string> lines) =>
        lines
            .Select(static line =>
            {
                var separatorIndex = line.IndexOf("phases:", StringComparison.OrdinalIgnoreCase);
                if (separatorIndex < 0)
                {
                    return new PrPreparationParticipant(line.Trim(), []);
                }

                var actor = line[..separatorIndex].Trim(' ', '-', '\u2014', ':');
                var phases = line[(separatorIndex + "phases:".Length)..]
                    .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
                return new PrPreparationParticipant(actor, phases);
            })
            .ToArray();

    private static IReadOnlyList<string> ReadPrBody(string markdown)
    {
        var lines = markdown.Replace("\r\n", "\n", StringComparison.Ordinal).Split('\n');
        var headingIndex = Array.FindIndex(lines, static line => string.Equals(line, "## PR Body", StringComparison.Ordinal));
        if (headingIndex < 0)
        {
            return [];
        }

        return lines
            .Skip(headingIndex + 1)
            .Select(static line => line.TrimEnd())
            .Where(static line => !string.IsNullOrWhiteSpace(line) && line.Trim() != "...")
            .ToArray();
    }
}

internal static class StructuredPhaseArtifactJson
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
        WriteIndented = true
    };

    public static TDocument DeserializeAndNormalize<TDocument>(string json, Func<TDocument, TDocument> normalize)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(json);
        var document = JsonSerializer.Deserialize<TDocument>(json, JsonOptions)
            ?? throw new WorkflowDomainException("The structured phase artifact could not be deserialized.");
        return normalize(document);
    }

    public static string Serialize<TDocument>(TDocument document) =>
        JsonSerializer.Serialize(document, JsonOptions) + Environment.NewLine;

    public static IReadOnlyList<string> NormalizeLines(IReadOnlyList<string>? items) =>
        (items ?? Array.Empty<string>())
            .Select(NormalizeScalar)
            .Where(static item => !string.IsNullOrWhiteSpace(item))
            .ToArray();

    public static string NormalizeScalar(string? value) =>
        string.IsNullOrWhiteSpace(value) ? string.Empty : value.Trim();
}

internal static class StructuredPhaseArtifactMarkdown
{
    public static IReadOnlyList<string> RenderBulletSection(IReadOnlyList<string> items, string placeholder = "...")
    {
        if (items.Count == 0)
        {
            return [$"- {placeholder}"];
        }

        return items
            .Select(static item => item.StartsWith("-", StringComparison.Ordinal) ? item : $"- {item}")
            .ToArray();
    }

    public static IReadOnlyList<string> RenderNumberedSection(IReadOnlyList<string> items, string placeholder = "...")
    {
        if (items.Count == 0)
        {
            return ["1. ..."];
        }

        return items
            .Select((item, index) => $"{index + 1}. {item}")
            .ToArray();
    }

    public static IReadOnlyList<string> RenderChecklistSection(IReadOnlyList<string> items, string placeholder = "...")
    {
        if (items.Count == 0)
        {
            return ["- [ ] ..."];
        }

        return items
            .Select(static item => item.StartsWith("- [", StringComparison.Ordinal) ? item : $"- [x] {item}")
            .ToArray();
    }

    public static IReadOnlyList<string> RenderValidationChecklistSection(IReadOnlyList<ReviewValidationChecklistItem> items)
    {
        if (items.Count == 0)
        {
            return ["- \u274C No validation strategy item was reviewed. Evidence: missing review checklist."];
        }

        return items
            .Select(static item =>
            {
                var marker = item.Status.ToLowerInvariant() switch
                {
                    "pass" => "\u2705",
                    "deferred" => "\u26A0\uFE0F",
                    _ => "\u274C"
                };
                var evidence = string.IsNullOrWhiteSpace(item.Evidence) ? "no evidence provided" : item.Evidence;
                return $"- {marker} {item.Item} \u2014 Evidence: {evidence}";
            })
            .ToArray();
    }
}
