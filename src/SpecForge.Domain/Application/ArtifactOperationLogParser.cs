using System.Text;
using System.Text.RegularExpressions;

namespace SpecForge.Domain.Application;

public static partial class ArtifactOperationLogParser
{
    private static readonly Regex EntryHeaderRegex = EntryHeader();
    private static readonly Regex InlineCodeRegex = InlineCode();

    public static IReadOnlyCollection<ArtifactOperationLogEntry> Parse(string markdown)
    {
        if (string.IsNullOrWhiteSpace(markdown))
        {
            return [];
        }

        var lines = markdown.Replace("\r\n", "\n", StringComparison.Ordinal).Split('\n');
        var entries = new List<ArtifactOperationLogEntry>();

        string? timestampUtc = null;
        string? actor = null;
        string? sourceArtifactPath = null;
        string? resultArtifactPath = null;
        List<string> contextArtifactPaths = [];
        var readingContextArtifacts = false;
        var readingPrompt = false;
        var promptBuilder = new StringBuilder();

        void Flush()
        {
            if (timestampUtc is null || resultArtifactPath is null)
            {
                return;
            }

            entries.Add(new ArtifactOperationLogEntry(
                timestampUtc,
                actor,
                sourceArtifactPath,
                resultArtifactPath,
                contextArtifactPaths.ToArray(),
                promptBuilder.ToString().Trim()));

            timestampUtc = null;
            actor = null;
            sourceArtifactPath = null;
            resultArtifactPath = null;
            contextArtifactPaths = [];
            readingContextArtifacts = false;
            readingPrompt = false;
            promptBuilder.Clear();
        }

        foreach (var rawLine in lines)
        {
            var trimmed = rawLine.TrimEnd();
            var headerMatch = EntryHeaderRegex.Match(trimmed);
            if (headerMatch.Success)
            {
                Flush();
                timestampUtc = headerMatch.Groups["timestamp"].Value.Trim();
                actor = headerMatch.Groups["actor"].Value;
                continue;
            }

            if (timestampUtc is null)
            {
                continue;
            }

            if (trimmed.StartsWith("- Source Artifact:", StringComparison.Ordinal))
            {
                sourceArtifactPath = ExtractInlineCode(trimmed);
                readingContextArtifacts = false;
                readingPrompt = false;
                continue;
            }

            if (trimmed.StartsWith("- Result Artifact:", StringComparison.Ordinal))
            {
                resultArtifactPath = ExtractInlineCode(trimmed);
                readingContextArtifacts = false;
                readingPrompt = false;
                continue;
            }

            if (trimmed.StartsWith("- Context Artifacts:", StringComparison.Ordinal))
            {
                readingContextArtifacts = true;
                readingPrompt = false;
                continue;
            }

            if (trimmed.StartsWith("- Prompt:", StringComparison.Ordinal))
            {
                readingContextArtifacts = false;
                readingPrompt = false;
                continue;
            }

            if (readingContextArtifacts)
            {
                var contextLine = trimmed.Trim();
                if (contextLine.StartsWith("- ", StringComparison.Ordinal))
                {
                    var contextPath = ExtractInlineCode(contextLine) ?? contextLine[2..].Trim();
                    if (!string.IsNullOrWhiteSpace(contextPath))
                    {
                        contextArtifactPaths.Add(contextPath);
                    }

                    continue;
                }

                if (!string.IsNullOrWhiteSpace(trimmed))
                {
                    readingContextArtifacts = false;
                }
            }

            if (trimmed == "```text")
            {
                readingPrompt = true;
                continue;
            }

            if (trimmed == "```" && readingPrompt)
            {
                readingPrompt = false;
                continue;
            }

            if (readingPrompt)
            {
                promptBuilder.AppendLine(rawLine);
            }
        }

        Flush();
        return entries;
    }

    private static string? ExtractInlineCode(string line)
    {
        var match = InlineCodeRegex.Match(line);
        return match.Success ? match.Groups["value"].Value.Replace('\\', '/') : null;
    }

    [GeneratedRegex("^##\\s+(?<timestamp>[^·]+)·\\s+`(?<actor>[^`]+)`$", RegexOptions.Compiled)]
    private static partial Regex EntryHeader();

    [GeneratedRegex("`(?<value>[^`]+)`", RegexOptions.Compiled)]
    private static partial Regex InlineCode();
}

public sealed record ArtifactOperationLogEntry(
    string TimestampUtc,
    string? Actor,
    string? SourceArtifactPath,
    string ResultArtifactPath,
    IReadOnlyCollection<string> ContextArtifactPaths,
    string? Prompt);
