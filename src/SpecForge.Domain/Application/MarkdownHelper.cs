using System.Text;
using SpecForge.Domain.Workflow;

namespace SpecForge.Domain.Application;

internal static class MarkdownHelper
{
    public static string ReadSection(string markdown, params string[] headings)
    {
        var lines = markdown.Replace("\r\n", "\n", StringComparison.Ordinal).Split('\n');
        for (var index = 0; index < lines.Length; index++)
        {
            if (!headings.Contains(lines[index], StringComparer.Ordinal))
            {
                continue;
            }

            var builder = new StringBuilder();
            for (var cursor = index + 1; cursor < lines.Length; cursor++)
            {
                if (lines[cursor].StartsWith("## ", StringComparison.Ordinal))
                {
                    break;
                }

                builder.AppendLine(lines[cursor]);
            }

            var content = builder.ToString().Trim();
            if (!string.IsNullOrWhiteSpace(content))
            {
                return content;
            }
        }

        return "...";
    }

    public static string? TryReadSection(string markdown, string heading)
    {
        var lines = markdown.Replace("\r\n", "\n", StringComparison.Ordinal).Split('\n');
        for (var index = 0; index < lines.Length; index++)
        {
            if (!string.Equals(lines[index], heading, StringComparison.Ordinal))
            {
                continue;
            }

            var builder = new StringBuilder();
            for (var cursor = index + 1; cursor < lines.Length; cursor++)
            {
                if (lines[cursor].StartsWith("## ", StringComparison.Ordinal))
                {
                    break;
                }

                builder.AppendLine(lines[cursor]);
            }

            return builder.ToString().Trim();
        }

        return null;
    }

    public static string ReplaceSection(string markdown, string heading, string replacementContent)
    {
        var normalized = markdown.Replace("\r\n", "\n", StringComparison.Ordinal);
        var lines = normalized.Split('\n');
        for (var index = 0; index < lines.Length; index++)
        {
            if (!string.Equals(lines[index], heading, StringComparison.Ordinal))
            {
                continue;
            }

            var endIndex = lines.Length;
            for (var cursor = index + 1; cursor < lines.Length; cursor++)
            {
                if (lines[cursor].StartsWith("## ", StringComparison.Ordinal))
                {
                    endIndex = cursor;
                    break;
                }
            }

            var prefix = string.Join('\n', lines.Take(index + 1));
            var suffix = endIndex < lines.Length
                ? string.Join('\n', lines.Skip(endIndex))
                : string.Empty;

            var builder = new StringBuilder();
            builder.Append(prefix)
                .Append('\n')
                .Append(replacementContent.Trim());

            if (!string.IsNullOrWhiteSpace(suffix))
            {
                builder.Append('\n')
                    .Append(suffix.TrimStart('\n'));
            }

            return builder.ToString().TrimEnd() + Environment.NewLine;
        }

        throw new WorkflowDomainException($"Section '{heading}' was not found in the current markdown artifact.");
    }

    public static string ReadHeading(string markdown, string fallback)
    {
        using var reader = new StringReader(markdown);
        string? line;
        while ((line = reader.ReadLine()) is not null)
        {
            if (line.StartsWith("# ", StringComparison.Ordinal))
            {
                return line[2..].Trim();
            }
        }

        return fallback;
    }
}
