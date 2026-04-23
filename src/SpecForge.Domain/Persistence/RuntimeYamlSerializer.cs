namespace SpecForge.Domain.Persistence;

internal static class RuntimeYamlSerializer
{
    public static string Serialize(RuntimeStatusDocument document)
    {
        var lines = new List<string>
        {
            $"usId: {document.UsId}",
            $"status: {document.Status}",
            $"currentPhase: {document.CurrentPhase}",
            $"lastOutcome: {document.LastOutcome ?? "null"}",
            $"activeOperation: {document.ActiveOperation ?? "null"}",
            $"ownerProcessId: {document.OwnerProcessId?.ToString(System.Globalization.CultureInfo.InvariantCulture) ?? "null"}",
            $"startedAtUtc: {Format(document.StartedAtUtc)}",
            $"lastHeartbeatUtc: {Format(document.LastHeartbeatUtc)}",
            $"lastCompletedAtUtc: {Format(document.LastCompletedAtUtc)}",
            $"message: {Escape(document.Message)}"
        };

        return string.Join(Environment.NewLine, lines) + Environment.NewLine;
    }

    public static RuntimeStatusDocument Deserialize(string yaml)
    {
        var values = YamlMapParser.ParseTopLevelMappings(yaml);
        return new RuntimeStatusDocument(
            YamlMapParser.GetRequired(values, "usId"),
            YamlMapParser.GetRequired(values, "status"),
            YamlMapParser.GetRequired(values, "currentPhase"),
            GetOptional(values, "lastOutcome"),
            GetOptional(values, "activeOperation"),
            ParseInt32(GetOptional(values, "ownerProcessId")),
            ParseDateTimeOffset(GetOptional(values, "startedAtUtc")),
            ParseDateTimeOffset(GetOptional(values, "lastHeartbeatUtc")),
            ParseDateTimeOffset(GetOptional(values, "lastCompletedAtUtc")),
            GetOptional(values, "message"));
    }

    private static string? GetOptional(IReadOnlyDictionary<string, string> values, string key)
    {
        var value = YamlMapParser.GetOptional(values, key);
        if (value is null || value == "null")
        {
            return null;
        }

        return Unescape(value);
    }

    private static DateTimeOffset? ParseDateTimeOffset(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return null;
        }

        return DateTimeOffset.Parse(value, System.Globalization.CultureInfo.InvariantCulture);
    }

    private static int? ParseInt32(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return null;
        }

        return int.Parse(value, System.Globalization.CultureInfo.InvariantCulture);
    }

    private static string Format(DateTimeOffset? value) => value?.UtcDateTime.ToString("O") ?? "null";

    private static string Escape(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return "null";
        }

        return value.Replace("\r", "\\r", StringComparison.Ordinal)
            .Replace("\n", "\\n", StringComparison.Ordinal);
    }

    private static string Unescape(string value) =>
        value.Replace("\\r", "\r", StringComparison.Ordinal)
            .Replace("\\n", "\n", StringComparison.Ordinal);
}

internal sealed record RuntimeStatusDocument(
    string UsId,
    string Status,
    string CurrentPhase,
    string? LastOutcome,
    string? ActiveOperation,
    int? OwnerProcessId,
    DateTimeOffset? StartedAtUtc,
    DateTimeOffset? LastHeartbeatUtc,
    DateTimeOffset? LastCompletedAtUtc,
    string? Message);
