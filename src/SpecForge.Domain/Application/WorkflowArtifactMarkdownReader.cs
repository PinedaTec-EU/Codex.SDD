using System.Text.RegularExpressions;

namespace SpecForge.Domain.Application;

internal static class WorkflowArtifactMarkdownReader
{
    internal static string ParseReviewResult(string reviewMarkdown)
    {
        foreach (var line in reviewMarkdown.Replace("\r\n", "\n", StringComparison.Ordinal).Split('\n'))
        {
            var trimmed = line.Trim();

            if (!trimmed.StartsWith("- Result:", StringComparison.OrdinalIgnoreCase) &&
                !trimmed.StartsWith("- Final result:", StringComparison.OrdinalIgnoreCase) &&
                !trimmed.StartsWith("- State:", StringComparison.OrdinalIgnoreCase))
            {
                continue;
            }

            var normalized = trimmed.ToLowerInvariant().TrimEnd('.');

            if (normalized.Contains("`pass`", StringComparison.Ordinal) ||
                normalized.Contains("`passed`", StringComparison.Ordinal) ||
                normalized.EndsWith(" pass", StringComparison.Ordinal) ||
                normalized.EndsWith(": pass", StringComparison.Ordinal) ||
                normalized.EndsWith(" passed", StringComparison.Ordinal) ||
                normalized.EndsWith(": passed", StringComparison.Ordinal))
            {
                return "pass";
            }

            if (normalized.Contains("`fail`", StringComparison.Ordinal) ||
                normalized.Contains("`failed`", StringComparison.Ordinal) ||
                normalized.EndsWith(" fail", StringComparison.Ordinal) ||
                normalized.EndsWith(": fail", StringComparison.Ordinal) ||
                normalized.EndsWith(" failed", StringComparison.Ordinal) ||
                normalized.EndsWith(": failed", StringComparison.Ordinal))
            {
                return "fail";
            }
        }

        return string.Empty;
    }

    internal static string ParseReviewPrimaryReason(string reviewMarkdown)
    {
        foreach (var line in reviewMarkdown.Replace("\r\n", "\n", StringComparison.Ordinal).Split('\n'))
        {
            var trimmed = line.Trim();
            const string prefix = "- Primary reason:";

            if (trimmed.StartsWith(prefix, StringComparison.OrdinalIgnoreCase))
            {
                return trimmed[prefix.Length..].Trim();
            }
        }

        return string.Empty;
    }

    internal static IReadOnlyList<ReviewValidationChecklistItem> ParseReviewValidationChecklist(string reviewMarkdown)
    {
        return ReadMarkdownSectionBulletLines(reviewMarkdown, "## Validation Checklist")
            .Select(ParseReviewValidationChecklistItem)
            .Where(static item => item is not null)
            .Cast<ReviewValidationChecklistItem>()
            .ToArray();
    }

    internal static IReadOnlyList<string> ReadMarkdownBulletSection(string markdown, string heading)
    {
        return ReadMarkdownSectionBulletLines(markdown, heading)
            .Select(static line => Regex.Replace(line, "^-\\s*(\\[[ xX]\\]\\s*)?", string.Empty).Trim())
            .Where(static line => !string.IsNullOrWhiteSpace(line) && line != "...")
            .ToArray();
    }

    internal static string NormalizeReviewChecklistKey(string value) =>
        Regex.Replace(value.Trim().ToLowerInvariant(), "\\s+", " ");

    private static ReviewValidationChecklistItem? ParseReviewValidationChecklistItem(string line)
    {
        var trimmed = line.Trim();
        var status = trimmed.Contains("\u2705", StringComparison.Ordinal) ||
            trimmed.Contains("[x]", StringComparison.OrdinalIgnoreCase)
                ? "pass"
                : trimmed.Contains("\u26A0", StringComparison.Ordinal) ||
                  trimmed.Contains("[~]", StringComparison.OrdinalIgnoreCase)
                    ? "deferred"
                : trimmed.Contains("\u274C", StringComparison.Ordinal) ||
                  trimmed.Contains("[ ]", StringComparison.OrdinalIgnoreCase)
                    ? "fail"
                    : string.Empty;

        if (string.IsNullOrWhiteSpace(status))
        {
            return null;
        }

        var content = trimmed
            .Replace("\u2705", string.Empty, StringComparison.Ordinal)
            .Replace("\u26A0", string.Empty, StringComparison.Ordinal)
            .Replace("\u274C", string.Empty, StringComparison.Ordinal)
            .Replace("[x]", string.Empty, StringComparison.OrdinalIgnoreCase)
            .Replace("[~]", string.Empty, StringComparison.OrdinalIgnoreCase)
            .Replace("[ ]", string.Empty, StringComparison.OrdinalIgnoreCase)
            .Trim();
        var evidenceMarkerIndex = content.IndexOf("Evidence:", StringComparison.OrdinalIgnoreCase);
        var item = evidenceMarkerIndex >= 0 ? content[..evidenceMarkerIndex] : content;
        item = item.Trim(' ', '-', '\u2014', ':');
        var evidence = evidenceMarkerIndex >= 0
            ? content[(evidenceMarkerIndex + "Evidence:".Length)..].Trim()
            : string.Empty;

        return string.IsNullOrWhiteSpace(item)
            ? null
            : new ReviewValidationChecklistItem(status, item, evidence);
    }

    private static IReadOnlyList<string> ReadMarkdownSectionBulletLines(string markdown, string heading)
    {
        var section = MarkdownHelper.TryReadSection(markdown, heading);

        if (string.IsNullOrWhiteSpace(section))
        {
            return [];
        }

        return section
            .Replace("\r\n", "\n", StringComparison.Ordinal)
            .Split('\n')
            .Select(static line => line.Trim())
            .Where(static line => line.StartsWith("-", StringComparison.Ordinal))
            .ToArray();
    }
}
