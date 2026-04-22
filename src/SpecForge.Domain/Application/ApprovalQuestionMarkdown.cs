using System.Text;
using SpecForge.Domain.Workflow;

namespace SpecForge.Domain.Application;

internal static class ApprovalQuestionMarkdown
{
    public static IReadOnlyList<ApprovalQuestionItem> ParseFromMarkdown(string markdown) =>
        ParseSectionContent(MarkdownHelper.TryReadSection(markdown, "## Human Approval Questions") ?? string.Empty);

    public static IReadOnlyList<ApprovalQuestionItem> ParseSectionContent(string content)
    {
        var items = new List<ApprovalQuestionItem>();
        ApprovalQuestionItem? pending = null;

        foreach (var rawLine in content.Split('\n'))
        {
            var line = rawLine.Trim();
            if (string.IsNullOrWhiteSpace(line))
            {
                continue;
            }

            if (TryParseAnswer(line, out var answer) && pending is not null)
            {
                pending = pending with { Answer = answer, Resolved = !string.IsNullOrWhiteSpace(answer) };
                items[^1] = pending;
                continue;
            }

            if (TryParseAnsweredBy(line, out var answeredBy) && pending is not null)
            {
                pending = pending with { AnsweredBy = answeredBy };
                items[^1] = pending;
                continue;
            }

            if (TryParseAnsweredAt(line, out var answeredAtUtc) && pending is not null)
            {
                pending = pending with { AnsweredAtUtc = answeredAtUtc };
                items[^1] = pending;
                continue;
            }

            if (!TryParseQuestion(line, out var question))
            {
                continue;
            }

            pending = new ApprovalQuestionItem(items.Count + 1, question, null, false, null, null);
            items.Add(pending);
        }

        return items;
    }

    public static string ApplyAnswer(string markdown, string question, string answer, string actor, DateTimeOffset answeredAtUtc)
    {
        var items = ParseFromMarkdown(markdown).ToList();
        var matchIndex = items.FindIndex(item => string.Equals(item.Question, question, StringComparison.Ordinal));
        if (matchIndex < 0)
        {
            throw new WorkflowDomainException($"Approval question not found in the current refinement artifact: '{question}'.");
        }

        items[matchIndex] = items[matchIndex] with
        {
            Answer = answer.Trim(),
            Resolved = !string.IsNullOrWhiteSpace(answer),
            AnsweredBy = actor.Trim(),
            AnsweredAtUtc = answeredAtUtc.ToString("O")
        };

        return MarkdownHelper.ReplaceSection(markdown, "## Human Approval Questions", Render(items));
    }

    public static IReadOnlyCollection<string> GetUnresolvedQuestions(string content) =>
        ParseSectionContent(content)
            .Where(item => !item.Resolved)
            .Select(item => item.Question)
            .ToArray();

    public static string Render(IReadOnlyCollection<ApprovalQuestionItem> items)
    {
        if (items.Count == 0)
        {
            return "- [ ] No human approval questions remain.";
        }

        var builder = new StringBuilder();
        foreach (var item in items.OrderBy(item => item.Index))
        {
            builder.AppendLine($"- [{(item.Resolved ? "x" : " ")}] {item.Question}");
            if (!string.IsNullOrWhiteSpace(item.Answer))
            {
                builder.AppendLine($"  - Answer: {item.Answer.Trim()}");
                if (!string.IsNullOrWhiteSpace(item.AnsweredBy))
                {
                    builder.AppendLine($"  - Answered By: {item.AnsweredBy.Trim()}");
                }

                if (!string.IsNullOrWhiteSpace(item.AnsweredAtUtc))
                {
                    builder.AppendLine($"  - Answered At: {item.AnsweredAtUtc.Trim()}");
                }
            }
        }

        return builder.ToString().TrimEnd();
    }

    private static bool TryParseQuestion(string line, out string question)
    {
        question = string.Empty;
        var normalized = line.TrimStart('-', '*').Trim();
        if (normalized.StartsWith("[x]", StringComparison.OrdinalIgnoreCase) || normalized.StartsWith("[ ]", StringComparison.OrdinalIgnoreCase))
        {
            normalized = normalized[3..].Trim();
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
            return false;
        }

        question = normalized;
        return true;
    }

    private static bool TryParseAnswer(string line, out string answer)
    {
        answer = string.Empty;
        var normalized = line.TrimStart('-', '*').Trim();
        if (!normalized.StartsWith("Answer:", StringComparison.OrdinalIgnoreCase))
        {
            return false;
        }

        answer = normalized["Answer:".Length..].Trim();
        return true;
    }

    private static bool TryParseAnsweredBy(string line, out string answeredBy)
    {
        answeredBy = string.Empty;
        var normalized = line.TrimStart('-', '*').Trim();
        if (!normalized.StartsWith("Answered By:", StringComparison.OrdinalIgnoreCase))
        {
            return false;
        }

        answeredBy = normalized["Answered By:".Length..].Trim();
        return true;
    }

    private static bool TryParseAnsweredAt(string line, out string answeredAtUtc)
    {
        answeredAtUtc = string.Empty;
        var normalized = line.TrimStart('-', '*').Trim();
        if (!normalized.StartsWith("Answered At:", StringComparison.OrdinalIgnoreCase))
        {
            return false;
        }

        answeredAtUtc = normalized["Answered At:".Length..].Trim();
        return true;
    }
}

internal sealed record ApprovalQuestionItem(
    int Index,
    string Question,
    string? Answer,
    bool Resolved,
    string? AnsweredBy,
    string? AnsweredAtUtc);
