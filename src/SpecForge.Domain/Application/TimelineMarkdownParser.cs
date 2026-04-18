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
        TokenUsage? usage = null;
        long? durationMs = null;
        var readingArtifacts = false;
        var readingTokens = false;

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
                artifacts.ToArray(),
                usage,
                durationMs));

            timestamp = null;
            code = null;
            actor = null;
            phase = null;
            summary = null;
            artifacts = [];
            usage = null;
            durationMs = null;
            readingArtifacts = false;
            readingTokens = false;
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
                readingTokens = false;
                continue;
            }

            if (trimmed.StartsWith("- Tokens:", StringComparison.Ordinal))
            {
                readingTokens = true;
                readingArtifacts = false;
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

            if (readingTokens)
            {
                var tokenLine = trimmed.Trim();
                if (tokenLine.StartsWith("- ", StringComparison.Ordinal))
                {
                    var tokenContent = tokenLine[2..].Trim();
                    if (IsTokenUsageLine(tokenContent))
                    {
                        usage = ParseTokenUsageLine(usage, tokenContent);
                        continue;
                    }

                    readingTokens = false;
                }

                if (!string.IsNullOrWhiteSpace(trimmed))
                {
                    readingTokens = false;
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
                continue;
            }

            if (trimmed.StartsWith("- Duración:", StringComparison.Ordinal) || trimmed.StartsWith("- Duration:", StringComparison.Ordinal))
            {
                durationMs = ParseDurationMs(trimmed);
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

    private static TokenUsage ParseTokenUsageLine(TokenUsage? current, string line)
    {
        var separatorIndex = line.IndexOf(':', StringComparison.Ordinal);
        if (separatorIndex < 0)
        {
            return current ?? new TokenUsage(0, 0, 0);
        }

        var key = line[..separatorIndex].Trim();
        var value = ExtractInlineCode(line[(separatorIndex + 1)..]) ?? line[(separatorIndex + 1)..].Trim();
        if (!int.TryParse(value, out var parsedValue))
        {
          return current ?? new TokenUsage(0, 0, 0);
        }

        var usage = current ?? new TokenUsage(0, 0, 0);
        return key switch
        {
            "input" => usage with { InputTokens = parsedValue },
            "output" => usage with { OutputTokens = parsedValue },
            "total" => usage with { TotalTokens = parsedValue },
            _ => usage
        };
    }

    private static bool IsTokenUsageLine(string line) =>
        line.StartsWith("input:", StringComparison.Ordinal) ||
        line.StartsWith("output:", StringComparison.Ordinal) ||
        line.StartsWith("total:", StringComparison.Ordinal);

    private static long? ParseDurationMs(string line)
    {
        var value = ExtractInlineCode(line) ?? line[(line.IndexOf(':', StringComparison.Ordinal) + 1)..].Trim();
        if (value.EndsWith("ms", StringComparison.OrdinalIgnoreCase))
        {
            value = value[..^2].Trim();
        }

        return long.TryParse(value, out var durationMs) ? durationMs : null;
    }

    [GeneratedRegex(@"^###\s+(?<timestamp>[^·]+?)\s+·\s+`(?<code>[^`]+)`$", RegexOptions.Compiled)]
    private static partial Regex EventHeader();

    [GeneratedRegex(@"`(?<value>[^`]+)`", RegexOptions.Compiled)]
    private static partial Regex InlineCode();
}
