using System.Text.RegularExpressions;

namespace SpecForge.Domain.Application;

public static partial class TimelineMarkdownParser
{
    private static readonly Regex EventHeaderRegex = EventHeader();
    private static readonly Regex InlineCodeRegex = InlineCode();

    public static IReadOnlyCollection<TimelineEventDetails> ParseEvents(string markdown)
    {
        if (string.IsNullOrWhiteSpace(markdown))
        {
            return [];
        }

        var lines = markdown.Replace("\r\n", "\n", StringComparison.Ordinal).Split('\n');
        var events = new List<TimelineEventDetails>();

        string? timestamp = null;
        string? code = null;
        string? actor = null;
        string? phase = null;
        string? summary = null;
        var artifacts = new List<string>();
        var readingArtifacts = false;

        void FlushCurrent()
        {
            if (timestamp is null || code is null)
            {
                return;
            }

            events.Add(new TimelineEventDetails(
                timestamp,
                code,
                actor,
                phase,
                summary,
                artifacts.ToArray()));

            timestamp = null;
            code = null;
            actor = null;
            phase = null;
            summary = null;
            artifacts = [];
            readingArtifacts = false;
        }

        foreach (var rawLine in lines)
        {
            var trimmed = rawLine.TrimEnd();
            var headerMatch = EventHeaderRegex.Match(trimmed);
            if (headerMatch.Success)
            {
                FlushCurrent();
                timestamp = headerMatch.Groups["timestamp"].Value;
                code = headerMatch.Groups["code"].Value;
                continue;
            }

            if (timestamp is null)
            {
                continue;
            }

            if (trimmed.StartsWith("- Artefactos:", StringComparison.Ordinal))
            {
                readingArtifacts = true;
                continue;
            }

            if (readingArtifacts)
            {
                var artifactLine = trimmed.Trim();
                if (artifactLine.StartsWith("- ", StringComparison.Ordinal))
                {
                    artifacts.Add(artifactLine[2..].Trim());
                    continue;
                }

                if (!string.IsNullOrWhiteSpace(trimmed))
                {
                    readingArtifacts = false;
                }
            }

            if (trimmed.StartsWith("- Actor:", StringComparison.Ordinal))
            {
                actor = ExtractInlineCode(trimmed);
                continue;
            }

            if (trimmed.StartsWith("- Fase:", StringComparison.Ordinal))
            {
                phase = ExtractInlineCode(trimmed);
                continue;
            }

            if (trimmed.StartsWith("- Resumen:", StringComparison.Ordinal))
            {
                summary = trimmed["- Resumen:".Length..].Trim();
            }
        }

        FlushCurrent();
        return events;
    }

    private static string? ExtractInlineCode(string line)
    {
        var match = InlineCodeRegex.Match(line);
        return match.Success ? match.Groups["value"].Value : null;
    }

    [GeneratedRegex(@"^###\s+(?<timestamp>[^·]+?)\s+·\s+`(?<code>[^`]+)`$", RegexOptions.Compiled)]
    private static partial Regex EventHeader();

    [GeneratedRegex(@"`(?<value>[^`]+)`", RegexOptions.Compiled)]
    private static partial Regex InlineCode();
}
