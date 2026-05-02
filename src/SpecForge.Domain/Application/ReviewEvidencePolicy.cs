using System.Text.RegularExpressions;

namespace SpecForge.Domain.Application;

internal enum ReviewEvidencePolicyMode
{
    Strict,
    Balanced,
    Release,
    Advisory
}

internal enum ReviewValidationEvidenceKind
{
    Automated,
    Static,
    Operational,
    Deferred
}

internal static class ReviewEvidencePolicy
{
    private const string AutomatedTag = "automated";
    private const string StaticTag = "static";
    private const string OperationalTag = "operational";
    private const string DeferredTag = "deferred";

    private static readonly Regex LeadingTagRegex = new(
        "^\\s*(\\[(automated|static|operational|deferred)(:[^\\]]+)?\\]\\s*)+",
        RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);

    internal static string Normalize(string? policy)
    {
        var normalized = policy?.Trim().ToLowerInvariant();

        return normalized is "strict" or "balanced" or "release" or "advisory"
            ? normalized
            : "balanced";
    }

    internal static ReviewEvidencePolicyMode Parse(string? policy) =>
        Normalize(policy) switch
        {
            "strict" => ReviewEvidencePolicyMode.Strict,
            "release" => ReviewEvidencePolicyMode.Release,
            "advisory" => ReviewEvidencePolicyMode.Advisory,
            _ => ReviewEvidencePolicyMode.Balanced
        };

    internal static ReviewValidationEvidenceKind Classify(string validationStrategyItem)
    {
        var normalized = validationStrategyItem.TrimStart();

        if (normalized.StartsWith("[static", StringComparison.OrdinalIgnoreCase))
        {
            return ReviewValidationEvidenceKind.Static;
        }

        if (normalized.StartsWith("[operational", StringComparison.OrdinalIgnoreCase))
        {
            return ReviewValidationEvidenceKind.Operational;
        }

        if (normalized.StartsWith("[deferred", StringComparison.OrdinalIgnoreCase))
        {
            return ReviewValidationEvidenceKind.Deferred;
        }

        return ReviewValidationEvidenceKind.Automated;
    }

    internal static bool IsBlocking(
        ReviewEvidencePolicyMode policy,
        ReviewValidationEvidenceKind evidenceKind)
    {
        return policy switch
        {
            ReviewEvidencePolicyMode.Strict => true,
            ReviewEvidencePolicyMode.Advisory => false,
            _ => evidenceKind is ReviewValidationEvidenceKind.Automated or ReviewValidationEvidenceKind.Static
        };
    }

    internal static string NormalizeChecklistKey(string value)
    {
        var withoutTags = LeadingTagRegex.Replace(value.Trim(), string.Empty);

        return Regex.Replace(withoutTags.ToLowerInvariant(), "\\s+", " ");
    }
}
