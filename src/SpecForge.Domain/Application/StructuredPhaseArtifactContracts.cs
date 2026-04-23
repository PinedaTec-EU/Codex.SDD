using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.Json.Serialization;
using SpecForge.Domain.Workflow;

namespace SpecForge.Domain.Application;

public sealed record StructuredPhaseArtifactContract(
    string SchemaName,
    JsonElement JsonSchema,
    Func<PhaseExecutionContext, string, string> NormalizeContent);

public static class StructuredPhaseArtifactContracts
{
    private static readonly IReadOnlyDictionary<PhaseId, StructuredPhaseArtifactContract> Contracts =
        new Dictionary<PhaseId, StructuredPhaseArtifactContract>
        {
            [PhaseId.Clarification] = new(
                SchemaName: "clarification_artifact",
                JsonSchema: BuildClarificationSchema(),
                NormalizeContent: static (context, content) => ClarificationArtifactJson.RenderMarkdown(
                    ClarificationArtifactJson.ParseCanonicalJson(content),
                    context.UsId,
                    version: 1)),
            [PhaseId.Refinement] = new(
                SchemaName: "refinement_artifact",
                JsonSchema: BuildRefinementSchema(),
                NormalizeContent: static (_, content) => RefinementSpecJson.Serialize(RefinementSpecJson.ParseCanonicalJson(content))),
            [PhaseId.TechnicalDesign] = new(
                SchemaName: "technical_design_artifact",
                JsonSchema: BuildTechnicalDesignSchema(),
                NormalizeContent: static (context, content) => TechnicalDesignArtifactJson.RenderMarkdown(
                    TechnicalDesignArtifactJson.ParseCanonicalJson(content),
                    context.UsId,
                    version: 1)),
            [PhaseId.Implementation] = new(
                SchemaName: "implementation_artifact",
                JsonSchema: BuildImplementationSchema(),
                NormalizeContent: static (context, content) => ImplementationArtifactJson.RenderMarkdown(
                    ImplementationArtifactJson.ParseCanonicalJson(content),
                    context.UsId,
                    version: 1)),
            [PhaseId.Review] = new(
                SchemaName: "review_artifact",
                JsonSchema: BuildReviewSchema(),
                NormalizeContent: static (context, content) => ReviewArtifactJson.RenderMarkdown(
                    ReviewArtifactJson.ParseCanonicalJson(content),
                    context.UsId,
                    version: 1))
        };

    public static bool TryGet(PhaseId phaseId, out StructuredPhaseArtifactContract contract) =>
        Contracts.TryGetValue(phaseId, out contract!);

    private static JsonElement BuildClarificationSchema() =>
        ToJsonElement(ObjectSchema(
            properties: new Dictionary<string, JsonNode?>
            {
                ["state"] = EnumStringSchema("pending_user_input", "ready"),
                ["decision"] = EnumStringSchema("needs_clarification", "ready_for_refinement"),
                ["reason"] = StringSchema(),
                ["questions"] = ArraySchema(StringSchema())
            },
            required: ["state", "decision", "reason", "questions"]));

    private static JsonElement BuildRefinementSchema() =>
        ToJsonElement(ObjectSchema(
            properties: new Dictionary<string, JsonNode?>
            {
                ["title"] = StringSchema(),
                ["historyLog"] = ArraySchema(StringSchema()),
                ["state"] = StringSchema(),
                ["basedOn"] = StringSchema(),
                ["specSummary"] = StringSchema(),
                ["inputs"] = ArraySchema(StringSchema()),
                ["outputs"] = ArraySchema(StringSchema()),
                ["businessRules"] = ArraySchema(StringSchema()),
                ["edgeCases"] = ArraySchema(StringSchema()),
                ["errorsAndFailureModes"] = ArraySchema(StringSchema()),
                ["constraints"] = ArraySchema(StringSchema()),
                ["detectedAmbiguities"] = ArraySchema(StringSchema()),
                ["redTeam"] = ArraySchema(StringSchema()),
                ["blueTeam"] = ArraySchema(StringSchema()),
                ["acceptanceCriteria"] = ArraySchema(StringSchema()),
                ["humanApprovalQuestions"] = ArraySchema(ObjectSchema(
                    properties: new Dictionary<string, JsonNode?>
                    {
                        ["question"] = StringSchema(),
                        ["status"] = EnumStringSchema("pending", "resolved"),
                        ["answer"] = NullableStringSchema(),
                        ["answeredBy"] = NullableStringSchema(),
                        ["answeredAtUtc"] = NullableStringSchema()
                    },
                    required: ["question", "status", "answer", "answeredBy", "answeredAtUtc"]))
            },
            required:
            [
                "title",
                "historyLog",
                "state",
                "basedOn",
                "specSummary",
                "inputs",
                "outputs",
                "businessRules",
                "edgeCases",
                "errorsAndFailureModes",
                "constraints",
                "detectedAmbiguities",
                "redTeam",
                "blueTeam",
                "acceptanceCriteria",
                "humanApprovalQuestions"
            ]));

    private static JsonElement BuildTechnicalDesignSchema() =>
        ToJsonElement(ObjectSchema(
            properties: new Dictionary<string, JsonNode?>
            {
                ["state"] = StringSchema(),
                ["basedOn"] = StringSchema(),
                ["technicalSummary"] = StringSchema(),
                ["technicalObjective"] = StringSchema(),
                ["affectedComponents"] = ArraySchema(StringSchema()),
                ["architecture"] = ArraySchema(StringSchema()),
                ["primaryFlow"] = ArraySchema(StringSchema()),
                ["constraintsAndGuardrails"] = ArraySchema(StringSchema()),
                ["alternativesConsidered"] = ArraySchema(StringSchema()),
                ["technicalRisks"] = ArraySchema(StringSchema()),
                ["expectedImpact"] = ArraySchema(StringSchema()),
                ["implementationStrategy"] = ArraySchema(StringSchema()),
                ["validationStrategy"] = ArraySchema(StringSchema()),
                ["openDecisions"] = ArraySchema(StringSchema())
            },
            required:
            [
                "state",
                "basedOn",
                "technicalSummary",
                "technicalObjective",
                "affectedComponents",
                "architecture",
                "primaryFlow",
                "constraintsAndGuardrails",
                "alternativesConsidered",
                "technicalRisks",
                "expectedImpact",
                "implementationStrategy",
                "validationStrategy",
                "openDecisions"
            ]));

    private static JsonElement BuildImplementationSchema() =>
        ToJsonElement(ObjectSchema(
            properties: new Dictionary<string, JsonNode?>
            {
                ["state"] = StringSchema(),
                ["basedOn"] = StringSchema(),
                ["implementedObjective"] = StringSchema(),
                ["plannedOrExecutedChanges"] = ArraySchema(StringSchema()),
                ["plannedVerification"] = ArraySchema(StringSchema())
            },
            required:
            [
                "state",
                "basedOn",
                "implementedObjective",
                "plannedOrExecutedChanges",
                "plannedVerification"
            ]));

    private static JsonElement BuildReviewSchema() =>
        ToJsonElement(ObjectSchema(
            properties: new Dictionary<string, JsonNode?>
            {
                ["result"] = EnumStringSchema("pass", "fail"),
                ["checksPerformed"] = ArraySchema(StringSchema()),
                ["findings"] = ArraySchema(StringSchema()),
                ["primaryReason"] = StringSchema(),
                ["recommendation"] = ArraySchema(StringSchema())
            },
            required: ["result", "checksPerformed", "findings", "primaryReason", "recommendation"]));

    private static JsonElement ToJsonElement(JsonObject schema)
    {
        using var document = JsonDocument.Parse(schema.ToJsonString());
        return document.RootElement.Clone();
    }

    private static JsonObject ObjectSchema(
        IReadOnlyDictionary<string, JsonNode?> properties,
        IReadOnlyCollection<string> required)
    {
        var schema = new JsonObject
        {
            ["type"] = "object",
            ["additionalProperties"] = false
        };
        var schemaProperties = new JsonObject();
        foreach (var property in properties)
        {
            schemaProperties[property.Key] = property.Value?.DeepClone();
        }

        schema["properties"] = schemaProperties;
        schema["required"] = new JsonArray(required.Select(static item => (JsonNode?)item).ToArray());
        return schema;
    }

    private static JsonObject StringSchema() =>
        new()
        {
            ["type"] = "string"
        };

    private static JsonObject NullableStringSchema() =>
        new()
        {
            ["type"] = new JsonArray("string", "null")
        };

    private static JsonObject EnumStringSchema(params string[] allowedValues) =>
        new()
        {
            ["type"] = "string",
            ["enum"] = new JsonArray(allowedValues.Select(static item => (JsonNode?)item).ToArray())
        };

    private static JsonObject ArraySchema(JsonNode itemSchema) =>
        new()
        {
            ["type"] = "array",
            ["items"] = itemSchema.DeepClone()
        };
}

public sealed record ClarificationArtifactDocument(
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
    IReadOnlyList<string> ChecksPerformed,
    IReadOnlyList<string> Findings,
    string PrimaryReason,
    IReadOnlyList<string> Recommendation);

public static class ClarificationArtifactJson
{
    public static ClarificationArtifactDocument ParseCanonicalJson(string json) =>
        StructuredPhaseArtifactJson.DeserializeAndNormalize<ClarificationArtifactDocument>(
            json,
            normalize: Normalize);

    public static string RenderMarkdown(ClarificationArtifactDocument document, string usId, int version)
    {
        var normalized = Normalize(document);
        var lines = new List<string>
        {
            $"# Clarification · {usId} · v{version:00}",
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
            ? ["1. No clarification questions remain."]
            : normalized.Questions.Select((question, index) => $"{index + 1}. {question}"));
        return string.Join(Environment.NewLine, lines) + Environment.NewLine;
    }

    private static ClarificationArtifactDocument Normalize(ClarificationArtifactDocument document) =>
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
            "## Checks Performed"
        };
        lines.AddRange(StructuredPhaseArtifactMarkdown.RenderChecklistSection(normalized.ChecksPerformed));
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
            ChecksPerformed: StructuredPhaseArtifactJson.NormalizeLines(document.ChecksPerformed),
            Findings: StructuredPhaseArtifactJson.NormalizeLines(document.Findings),
            PrimaryReason: StructuredPhaseArtifactJson.NormalizeScalar(document.PrimaryReason),
            Recommendation: StructuredPhaseArtifactJson.NormalizeLines(document.Recommendation));
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
}
