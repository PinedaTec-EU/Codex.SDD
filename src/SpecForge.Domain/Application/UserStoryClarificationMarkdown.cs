using System.Text;

namespace SpecForge.Domain.Application;

public static class UserStoryClarificationMarkdown
{
    private const string ClarificationSectionHeading = "## Clarification Log";
    private const string StatusPrefix = "- Status:";
    private const string TolerancePrefix = "- Tolerance:";
    private const string ReasonPrefix = "- Reason:";
    private const string QuestionsHeading = "### Questions";
    private const string AnswersHeading = "### Answers";

    public static ClarificationSession? Parse(string userStoryMarkdown)
    {
        if (string.IsNullOrWhiteSpace(userStoryMarkdown))
        {
            return null;
        }

        var lines = userStoryMarkdown.Replace("\r\n", "\n", StringComparison.Ordinal).Split('\n');
        var startIndex = Array.FindIndex(lines, line => line == ClarificationSectionHeading);
        if (startIndex < 0)
        {
            return null;
        }

        string? status = null;
        string? tolerance = null;
        string? reason = null;
        var questions = new List<string>();
        var answers = new List<string>();
        var mode = string.Empty;

        for (var index = startIndex + 1; index < lines.Length; index++)
        {
            var line = lines[index];
            if (index > startIndex + 1 && line.StartsWith("## ", StringComparison.Ordinal))
            {
                break;
            }

            var trimmed = line.Trim();
            if (trimmed.Length == 0)
            {
                continue;
            }

            if (trimmed.StartsWith(StatusPrefix, StringComparison.Ordinal))
            {
                status = ExtractInlineCode(trimmed[StatusPrefix.Length..].Trim()) ?? trimmed[StatusPrefix.Length..].Trim();
                continue;
            }

            if (trimmed.StartsWith(TolerancePrefix, StringComparison.Ordinal))
            {
                tolerance = ExtractInlineCode(trimmed[TolerancePrefix.Length..].Trim()) ?? trimmed[TolerancePrefix.Length..].Trim();
                continue;
            }

            if (trimmed.StartsWith(ReasonPrefix, StringComparison.Ordinal))
            {
                reason = trimmed[ReasonPrefix.Length..].Trim();
                continue;
            }

            if (trimmed == QuestionsHeading)
            {
                mode = "questions";
                continue;
            }

            if (trimmed == AnswersHeading)
            {
                mode = "answers";
                continue;
            }

            if (trimmed.Length > 2 && char.IsDigit(trimmed[0]))
            {
                var separator = trimmed.IndexOf(". ", StringComparison.Ordinal);
                if (separator > 0)
                {
                    var value = trimmed[(separator + 2)..].Trim();
                    if (mode == "questions")
                    {
                        questions.Add(value);
                    }
                    else if (mode == "answers")
                    {
                        answers.Add(value);
                    }
                }
            }
        }

        if (status is null)
        {
            return null;
        }

        var items = questions
            .Select((question, index) => new ClarificationItem(
                index + 1,
                question,
                index < answers.Count ? NormalizeAnswer(answers[index]) : null))
            .ToArray();

        return new ClarificationSession(status, tolerance ?? "balanced", reason, items);
    }

    public static string Upsert(string userStoryMarkdown, ClarificationSession session)
    {
        var content = string.IsNullOrWhiteSpace(userStoryMarkdown)
            ? string.Empty
            : userStoryMarkdown.Replace("\r\n", "\n", StringComparison.Ordinal).TrimEnd();
        var section = BuildSection(session);
        var startIndex = content.IndexOf(ClarificationSectionHeading, StringComparison.Ordinal);
        if (startIndex < 0)
        {
            return string.IsNullOrWhiteSpace(content)
                ? section
                : $"{content}{Environment.NewLine}{Environment.NewLine}{section}{Environment.NewLine}";
        }

        var nextHeadingIndex = content.IndexOf("\n## ", startIndex + ClarificationSectionHeading.Length, StringComparison.Ordinal);
        var prefix = content[..startIndex].TrimEnd();
        var suffix = nextHeadingIndex >= 0 ? content[nextHeadingIndex..].TrimStart('\n') : string.Empty;

        var builder = new StringBuilder();
        if (!string.IsNullOrWhiteSpace(prefix))
        {
            builder.AppendLine(prefix);
            builder.AppendLine();
        }

        builder.Append(section.TrimEnd());
        if (!string.IsNullOrWhiteSpace(suffix))
        {
            builder.AppendLine();
            builder.AppendLine();
            builder.Append(suffix);
        }

        builder.AppendLine();
        return builder.ToString();
    }

    public static string Serialize(ClarificationSession session) => BuildSection(session).TrimEnd() + Environment.NewLine;

    public static string Remove(string userStoryMarkdown)
    {
        if (string.IsNullOrWhiteSpace(userStoryMarkdown))
        {
            return string.Empty;
        }

        var content = userStoryMarkdown.Replace("\r\n", "\n", StringComparison.Ordinal).TrimEnd();
        var startIndex = content.IndexOf(ClarificationSectionHeading, StringComparison.Ordinal);
        if (startIndex < 0)
        {
            return content + Environment.NewLine;
        }

        var nextHeadingIndex = content.IndexOf("\n## ", startIndex + ClarificationSectionHeading.Length, StringComparison.Ordinal);
        var prefix = content[..startIndex].TrimEnd();
        var suffix = nextHeadingIndex >= 0 ? content[nextHeadingIndex..].TrimStart('\n') : string.Empty;

        if (string.IsNullOrWhiteSpace(prefix) && string.IsNullOrWhiteSpace(suffix))
        {
            return string.Empty;
        }

        var builder = new StringBuilder();
        if (!string.IsNullOrWhiteSpace(prefix))
        {
            builder.Append(prefix.TrimEnd());
        }

        if (!string.IsNullOrWhiteSpace(suffix))
        {
            if (builder.Length > 0)
            {
                builder.AppendLine();
                builder.AppendLine();
            }

            builder.Append(suffix.TrimStart());
        }

        return builder.Length == 0 ? string.Empty : builder.ToString().TrimEnd() + Environment.NewLine;
    }

    public static ClarificationSession WithAnswers(ClarificationSession session, IReadOnlyList<string?> answers)
    {
        var items = session.Items
            .Select(item => item with
            {
                Answer = item.Index - 1 < answers.Count ? NormalizeAnswer(answers[item.Index - 1]) : null
            })
            .ToArray();
        return session with { Items = items };
    }

    public static bool HasAllAnswers(ClarificationSession? session) =>
        session is not null
        && session.Items.Count > 0
        && session.Items.All(item => !string.IsNullOrWhiteSpace(item.Answer));

    private static string BuildSection(ClarificationSession session)
    {
        var builder = new StringBuilder()
            .AppendLine(ClarificationSectionHeading)
            .AppendLine()
            .AppendLine($"{StatusPrefix} `{session.Status}`")
            .AppendLine($"{TolerancePrefix} `{session.Tolerance}`");

        if (!string.IsNullOrWhiteSpace(session.Reason))
        {
            builder.AppendLine($"{ReasonPrefix} {session.Reason}");
        }

        builder.AppendLine()
            .AppendLine(QuestionsHeading);

        foreach (var item in session.Items)
        {
            builder.AppendLine($"{item.Index}. {item.Question}");
        }

        builder.AppendLine()
            .AppendLine(AnswersHeading);

        foreach (var item in session.Items)
        {
            builder.AppendLine($"{item.Index}. {item.Answer ?? "..."}");
        }

        return builder.ToString();
    }

    private static string? ExtractInlineCode(string line)
    {
        var start = line.IndexOf('`');
        if (start < 0)
        {
            return null;
        }

        var end = line.IndexOf('`', start + 1);
        return end > start ? line[(start + 1)..end] : null;
    }

    private static string? NormalizeAnswer(string? value)
    {
        var trimmed = value?.Trim();
        return string.IsNullOrWhiteSpace(trimmed) || trimmed == "..." ? null : trimmed;
    }
}

public sealed record ClarificationSession(
    string Status,
    string Tolerance,
    string? Reason,
    IReadOnlyCollection<ClarificationItem> Items);

public sealed record ClarificationItem(
    int Index,
    string Question,
    string? Answer);
