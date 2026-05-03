using System.Net;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using SpecForge.Domain.Workflow;

namespace SpecForge.Domain.Application;

public sealed record SpecDocument(
    string? Title,
    IReadOnlyList<string> HistoryLog,
    string State,
    string BasedOn,
    string SpecSummary,
    IReadOnlyList<string> Inputs,
    IReadOnlyList<string> Outputs,
    IReadOnlyList<string> BusinessRules,
    IReadOnlyList<string> EdgeCases,
    IReadOnlyList<string> ErrorsAndFailureModes,
    IReadOnlyList<string> Constraints,
    IReadOnlyList<string> DetectedAmbiguities,
    IReadOnlyList<string> RedTeam,
    IReadOnlyList<string> BlueTeam,
    IReadOnlyList<string> AcceptanceCriteria,
    IReadOnlyList<SpecApprovalQuestionDocument> HumanApprovalQuestions);

public sealed record SpecApprovalQuestionDocument(
    string Question,
    string Status,
    string? Answer,
    string? AnsweredBy,
    string? AnsweredAtUtc);

public static class SpecJson
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
        WriteIndented = true
    };

    public static SpecDocument Parse(string json)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(json);
        try
        {
            return ParseCanonicalJson(json);
        }
        catch (JsonException)
        {
            return SpecMarkdownImporter.Import(json);
        }
    }

    public static SpecDocument ParseCanonicalJson(string json)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(json);
        JsonDocument parsed;
        try
        {
            parsed = JsonDocument.Parse(json);
        }
        catch (JsonException exception)
        {
            throw new JsonException(exception.Message, exception);
        }

        using (parsed)
        {
            var normalizedJson = NormalizeCanonicalJson(parsed.RootElement);
            var document = JsonSerializer.Deserialize<SpecDocument>(normalizedJson, JsonOptions)
                ?? throw new WorkflowDomainException("The spec JSON artifact could not be deserialized.");
            return Normalize(document);
        }
    }

    public static string Serialize(SpecDocument document) =>
        JsonSerializer.Serialize(Normalize(document), JsonOptions) + Environment.NewLine;

    public static SpecDocument Normalize(SpecDocument document)
    {
        return new SpecDocument(
            NormalizeScalar(document.Title),
            NormalizeLines(document.HistoryLog),
            NormalizeScalar(document.State),
            NormalizeScalar(document.BasedOn),
            NormalizeScalar(document.SpecSummary),
            NormalizeLines(document.Inputs),
            NormalizeLines(document.Outputs),
            NormalizeLines(document.BusinessRules),
            NormalizeLines(document.EdgeCases),
            NormalizeLines(document.ErrorsAndFailureModes),
            NormalizeLines(document.Constraints),
            NormalizeLines(document.DetectedAmbiguities),
            NormalizeLines(document.RedTeam),
            NormalizeLines(document.BlueTeam),
            NormalizeLines(document.AcceptanceCriteria),
            NormalizeQuestions(document.HumanApprovalQuestions));
    }

    public static string RenderMarkdown(SpecDocument document, string usId, int version)
    {
        var normalized = Normalize(document);
        var lines = new List<string>
        {
            $"# Spec · {usId} · v{version:00}",
            string.Empty,
            "## History Log"
        };
        lines.AddRange(RenderBulletSection(normalized.HistoryLog, placeholder: "..."));
        lines.Add(string.Empty);
        lines.Add("## State");
        lines.AddRange(RenderBulletSection(
        [
            $"- State: `{normalized.State}`",
            $"- Based on: `{normalized.BasedOn}`"
        ]));
        lines.Add(string.Empty);
        lines.Add("## Spec Summary");
        lines.Add(normalized.SpecSummary);
        lines.Add(string.Empty);
        lines.Add("## Inputs");
        lines.AddRange(RenderBulletSection(normalized.Inputs));
        lines.Add(string.Empty);
        lines.Add("## Outputs");
        lines.AddRange(RenderBulletSection(normalized.Outputs));
        lines.Add(string.Empty);
        lines.Add("## Business Rules");
        lines.AddRange(RenderBulletSection(normalized.BusinessRules));
        lines.Add(string.Empty);
        lines.Add("## Edge Cases");
        lines.AddRange(RenderBulletSection(normalized.EdgeCases));
        lines.Add(string.Empty);
        lines.Add("## Errors and Failure Modes");
        lines.AddRange(RenderBulletSection(normalized.ErrorsAndFailureModes));
        lines.Add(string.Empty);
        lines.Add("## Constraints");
        lines.AddRange(RenderBulletSection(normalized.Constraints));
        lines.Add(string.Empty);
        lines.Add("## Detected Ambiguities");
        lines.AddRange(RenderBulletSection(normalized.DetectedAmbiguities));
        lines.Add(string.Empty);
        lines.Add("## Red Team");
        lines.AddRange(RenderBulletSection(normalized.RedTeam));
        lines.Add(string.Empty);
        lines.Add("## Blue Team");
        lines.AddRange(RenderBulletSection(normalized.BlueTeam));
        lines.Add(string.Empty);
        lines.Add("## Acceptance Criteria");
        lines.AddRange(RenderBulletSection(normalized.AcceptanceCriteria));
        lines.Add(string.Empty);
        lines.Add("## Human Approval Questions");
        lines.AddRange(RenderApprovalQuestions(normalized.HumanApprovalQuestions));
        return string.Join(Environment.NewLine, lines) + Environment.NewLine;
    }

    public static SpecDocument ApplyApprovalAnswer(
        SpecDocument document,
        string question,
        string answer,
        string actor,
        DateTimeOffset answeredAtUtc)
    {
        var normalized = Normalize(document);
        var items = normalized.HumanApprovalQuestions.ToList();
        var matchIndex = items.FindIndex(item => string.Equals(item.Question, question, StringComparison.Ordinal));
        if (matchIndex < 0)
        {
            throw new WorkflowDomainException($"Approval question not found in the current spec artifact: '{question}'.");
        }

        items[matchIndex] = new SpecApprovalQuestionDocument(
            items[matchIndex].Question,
            string.IsNullOrWhiteSpace(answer) ? "pending" : "resolved",
            NormalizeScalar(answer),
            NormalizeScalar(actor),
            answeredAtUtc.ToString("O"));

        var history = normalized.HistoryLog.ToList();
        history.Insert(0, $"`{answeredAtUtc:O}` · {actor.Trim()} recorded human approval answer for: {SummarizeQuestion(question)}");
        return normalized with
        {
            HistoryLog = history,
            HumanApprovalQuestions = items
        };
    }

    public static IReadOnlyCollection<string> GetUnresolvedQuestions(SpecDocument document) =>
        Normalize(document).HumanApprovalQuestions
            .Where(static item => !IsResolved(item))
            .Select(static item => item.Question)
            .ToArray();

    public static bool IsResolved(SpecApprovalQuestionDocument item) =>
        string.Equals(NormalizeStatus(item.Status, item.Answer), "resolved", StringComparison.Ordinal);

    private static IReadOnlyList<SpecApprovalQuestionDocument> NormalizeQuestions(IReadOnlyList<SpecApprovalQuestionDocument> items) =>
        (items ?? Array.Empty<SpecApprovalQuestionDocument>())
            .Where(static item => !string.IsNullOrWhiteSpace(item.Question))
            .Select(item => new SpecApprovalQuestionDocument(
                NormalizeScalar(item.Question),
                NormalizeStatus(item.Status, item.Answer),
                NormalizeScalar(item.Answer),
                NormalizeScalar(item.AnsweredBy),
                NormalizeScalar(item.AnsweredAtUtc)))
            .ToArray();

    private static string NormalizeStatus(string? status, string? answer)
    {
        if (!string.IsNullOrWhiteSpace(answer))
        {
            return "resolved";
        }

        if (!string.IsNullOrWhiteSpace(status))
        {
            var normalized = status.Trim().ToLowerInvariant();
            if (normalized is "resolved" or "pending")
            {
                return normalized;
            }
        }

        return string.IsNullOrWhiteSpace(answer) ? "pending" : "resolved";
    }

    private static IReadOnlyList<string> NormalizeLines(IReadOnlyList<string>? items) =>
        (items ?? Array.Empty<string>())
            .Select(NormalizeScalar)
            .Where(static item => !string.IsNullOrWhiteSpace(item))
            .ToArray();

    private static string NormalizeCanonicalJson(JsonElement root)
    {
        if (root.ValueKind != JsonValueKind.Object)
        {
            throw new WorkflowDomainException("The spec JSON artifact must be a JSON object.");
        }

        using var stream = new MemoryStream();
        using (var writer = new Utf8JsonWriter(stream))
        {
            writer.WriteStartObject();

            foreach (var property in root.EnumerateObject())
            {
                if (string.Equals(property.Name, "historyLog", StringComparison.Ordinal))
                {
                    writer.WritePropertyName(property.Name);
                    writer.WriteStartArray();

                    if (property.Value.ValueKind == JsonValueKind.Array)
                    {
                        foreach (var item in property.Value.EnumerateArray())
                        {
                            var normalizedItem = NormalizeHistoryLogItem(item);
                            if (!string.IsNullOrWhiteSpace(normalizedItem))
                            {
                                writer.WriteStringValue(normalizedItem);
                            }
                        }
                    }
                    else
                    {
                        var normalizedItem = NormalizeHistoryLogItem(property.Value);
                        if (!string.IsNullOrWhiteSpace(normalizedItem))
                        {
                            writer.WriteStringValue(normalizedItem);
                        }
                    }

                    writer.WriteEndArray();
                    continue;
                }

                property.WriteTo(writer);
            }

            writer.WriteEndObject();
        }

        return Encoding.UTF8.GetString(stream.ToArray());
    }

    private static string NormalizeHistoryLogItem(JsonElement item)
    {
        return item.ValueKind switch
        {
            JsonValueKind.String => NormalizeScalar(item.GetString()),
            JsonValueKind.Object => NormalizeHistoryLogObject(item),
            JsonValueKind.Number or JsonValueKind.True or JsonValueKind.False => item.ToString(),
            JsonValueKind.Array => JsonSerializer.Serialize(item),
            _ => string.Empty
        };
    }

    private static string NormalizeHistoryLogObject(JsonElement item)
    {
        var timestamp = ReadFirstString(item,
        [
            "timestamp",
            "timestampUtc",
            "at",
            "atUtc",
            "recordedAtUtc",
            "createdAtUtc",
            "answeredAtUtc",
            "dateUtc",
            "date"
        ]);
        var actor = ReadFirstString(item, ["actor", "user", "author", "answeredBy"]);
        var message = ReadFirstString(item,
        [
            "message",
            "entry",
            "text",
            "summary",
            "description",
            "detail",
            "details",
            "action",
            "note",
            "event"
        ]);

        var actorAndMessage = string.Join(" ",
            new[] { NormalizeScalar(actor), NormalizeScalar(message) }
                .Where(static part => !string.IsNullOrWhiteSpace(part)));

        if (!string.IsNullOrWhiteSpace(timestamp) && !string.IsNullOrWhiteSpace(actorAndMessage))
        {
            return $"`{timestamp.Trim()}` · {actorAndMessage}";
        }

        if (!string.IsNullOrWhiteSpace(actorAndMessage))
        {
            return actorAndMessage;
        }

        return JsonSerializer.Serialize(item);
    }

    private static string? ReadFirstString(JsonElement item, params string[] candidates)
    {
        foreach (var candidate in candidates)
        {
            if (!item.TryGetProperty(candidate, out var property))
            {
                continue;
            }

            if (property.ValueKind == JsonValueKind.String)
            {
                var value = NormalizeScalar(property.GetString());
                if (!string.IsNullOrWhiteSpace(value))
                {
                    return value;
                }
            }
            else if (property.ValueKind is JsonValueKind.Number or JsonValueKind.True or JsonValueKind.False)
            {
                var value = NormalizeScalar(property.ToString());
                if (!string.IsNullOrWhiteSpace(value))
                {
                    return value;
                }
            }
        }

        return null;
    }

    private static string NormalizeScalar(string? value) =>
        string.IsNullOrWhiteSpace(value) ? string.Empty : value.Trim();

    private static IReadOnlyList<string> RenderBulletSection(IReadOnlyList<string> items, string? placeholder = null)
    {
        if (items.Count == 0)
        {
            return [placeholder ?? "..."];
        }

        return items
            .Select(static item => item.StartsWith("-", StringComparison.Ordinal) ? item : $"- {item}")
            .ToArray();
    }

    private static IReadOnlyList<string> RenderApprovalQuestions(IReadOnlyList<SpecApprovalQuestionDocument> items)
    {
        if (items.Count == 0)
        {
            return ["- [ ] ..."];
        }

        var lines = new List<string>();
        foreach (var item in items)
        {
            var resolved = string.Equals(item.Status, "resolved", StringComparison.OrdinalIgnoreCase);
            lines.Add($"- [{(resolved ? "x" : " ")}] {item.Question}");
            if (!string.IsNullOrWhiteSpace(item.Answer))
            {
                lines.Add("  - Answer:");
                lines.Add("    <specforge-human-answer>");
                foreach (var line in item.Answer.Replace("\r\n", "\n").Split('\n'))
                {
                    lines.Add($"    {WebUtility.HtmlEncode(line)}");
                }

                lines.Add("    </specforge-human-answer>");
            }

            if (!string.IsNullOrWhiteSpace(item.AnsweredBy))
            {
                lines.Add($"  - Answered By: {item.AnsweredBy}");
            }

            if (!string.IsNullOrWhiteSpace(item.AnsweredAtUtc))
            {
                lines.Add($"  - Answered At: {item.AnsweredAtUtc}");
            }
        }

        return lines;
    }

    private static string SummarizeQuestion(string question)
    {
        var trimmed = question.Trim();
        return trimmed.Length <= 120 ? trimmed : $"{trimmed[..117]}...";
    }
}
