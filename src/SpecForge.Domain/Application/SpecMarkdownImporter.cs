using SpecForge.Domain.Workflow;

namespace SpecForge.Domain.Application;

internal static class SpecMarkdownImporter
{
    public static SpecDocument Import(string markdown)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(markdown);
        return new SpecDocument(
            Title: MarkdownHelper.ReadHeading(markdown, "Spec"),
            HistoryLog: ReadBulletSection(markdown, "## History Log"),
            State: ParseStateLine(markdown, "State"),
            BasedOn: ParseStateLine(markdown, "Based on"),
            SpecSummary: MarkdownHelper.TryReadSection(markdown, "## Spec Summary")?.Trim() ?? string.Empty,
            Inputs: ReadBulletSection(markdown, "## Inputs"),
            Outputs: ReadBulletSection(markdown, "## Outputs"),
            BusinessRules: ReadBulletSection(markdown, "## Business Rules"),
            EdgeCases: ReadBulletSection(markdown, "## Edge Cases"),
            ErrorsAndFailureModes: ReadBulletSection(markdown, "## Errors and Failure Modes"),
            Constraints: ReadBulletSection(markdown, "## Constraints"),
            DetectedAmbiguities: ReadBulletSection(markdown, "## Detected Ambiguities"),
            RedTeam: ReadBulletSection(markdown, "## Red Team"),
            BlueTeam: ReadBulletSection(markdown, "## Blue Team"),
            AcceptanceCriteria: ReadBulletSection(markdown, "## Acceptance Criteria"),
            HumanApprovalQuestions: ReadApprovalQuestions(markdown));
    }

    private static IReadOnlyList<string> ReadBulletSection(string markdown, string heading)
    {
        var content = MarkdownHelper.TryReadSection(markdown, heading);
        if (string.IsNullOrWhiteSpace(content))
        {
            return [];
        }

        return content
            .Split('\n', StringSplitOptions.TrimEntries)
            .Where(static line => !string.IsNullOrWhiteSpace(line))
            .Select(static line => line.Trim())
            .Where(static line => !line.StartsWith("Answer:", StringComparison.OrdinalIgnoreCase)
                && !line.StartsWith("Answered By:", StringComparison.OrdinalIgnoreCase)
                && !line.StartsWith("Answered At:", StringComparison.OrdinalIgnoreCase))
            .Select(static line => line.TrimStart('-', '*').Trim())
            .ToArray();
    }

    private static string ParseStateLine(string markdown, string label)
    {
        var lines = (MarkdownHelper.TryReadSection(markdown, "## State") ?? string.Empty)
            .Split('\n', StringSplitOptions.TrimEntries);
        foreach (var line in lines)
        {
            var normalized = line.TrimStart('-', '*').Trim();
            if (!normalized.StartsWith(label + ":", StringComparison.OrdinalIgnoreCase))
            {
                continue;
            }

            var value = normalized[(label.Length + 1)..].Trim();
            return value.Trim('`').Trim();
        }

        return string.Empty;
    }

    private static IReadOnlyList<SpecApprovalQuestionDocument> ReadApprovalQuestions(string markdown)
    {
        var content = MarkdownHelper.TryReadSection(markdown, "## Human Approval Questions");
        if (string.IsNullOrWhiteSpace(content))
        {
            return [];
        }

        var items = new List<SpecApprovalQuestionDocument>();
        SpecApprovalQuestionDocument? pending = null;
        foreach (var rawLine in content.Split('\n'))
        {
            var trimmed = rawLine.Trim();
            var normalized = trimmed.TrimStart('-', '*').Trim();
            if (string.IsNullOrWhiteSpace(trimmed))
            {
                continue;
            }

            if (normalized.StartsWith("Answer:", StringComparison.OrdinalIgnoreCase) && pending is not null)
            {
                pending = pending with
                {
                    Answer = normalized["Answer:".Length..].Trim(),
                    Status = "resolved"
                };
                items[^1] = pending;
                continue;
            }

            if (normalized.StartsWith("Answered By:", StringComparison.OrdinalIgnoreCase) && pending is not null)
            {
                pending = pending with { AnsweredBy = normalized["Answered By:".Length..].Trim() };
                items[^1] = pending;
                continue;
            }

            if (normalized.StartsWith("Answered At:", StringComparison.OrdinalIgnoreCase) && pending is not null)
            {
                pending = pending with { AnsweredAtUtc = normalized["Answered At:".Length..].Trim() };
                items[^1] = pending;
                continue;
            }

            var parsed = ParseQuestionLine(trimmed);
            if (parsed is null)
            {
                continue;
            }

            pending = new SpecApprovalQuestionDocument(parsed.Value.Question, parsed.Value.Resolved ? "resolved" : "pending", null, null, null);
            items.Add(pending);
        }

        return items;
    }

    private static (string Question, bool Resolved)? ParseQuestionLine(string line)
    {
        var normalized = line.Trim().Replace("\t", " ");
        normalized = normalized.Replace("- [ ] ", string.Empty, StringComparison.Ordinal);
        if (normalized.StartsWith("- [x] ", StringComparison.OrdinalIgnoreCase))
        {
            return (normalized[6..].Trim(), true);
        }

        if (normalized.StartsWith("- ", StringComparison.Ordinal))
        {
            normalized = normalized[2..].Trim();
        }
        else
        {
            var dotIndex = normalized.IndexOf('.');
            if (dotIndex > 0 && int.TryParse(normalized[..dotIndex], out _))
            {
                normalized = normalized[(dotIndex + 1)..].Trim();
            }
        }

        if (string.IsNullOrWhiteSpace(normalized)
            || normalized.StartsWith("Answer:", StringComparison.OrdinalIgnoreCase)
            || normalized.StartsWith("Answered By:", StringComparison.OrdinalIgnoreCase)
            || normalized.StartsWith("Answered At:", StringComparison.OrdinalIgnoreCase))
        {
            return null;
        }

        return (normalized, false);
    }
}
