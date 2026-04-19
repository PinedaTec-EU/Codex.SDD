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
            $"startedAtUtc: {Format(document.StartedAtUtc)}",
            $"lastHeartbeatUtc: {Format(document.LastHeartbeatUtc)}",
            $"lastCompletedAtUtc: {Format(document.LastCompletedAtUtc)}",
            $"message: {Escape(document.Message)}"
        };

        return string.Join(Environment.NewLine, lines) + Environment.NewLine;
    }

    public static RuntimeStatusDocument Deserialize(string yaml)
    {
        var values = ParseTopLevelMappings(yaml);
        return new RuntimeStatusDocument(
            GetRequired(values, "usId"),
            GetRequired(values, "status"),
            GetRequired(values, "currentPhase"),
            GetOptional(values, "lastOutcome"),
            GetOptional(values, "activeOperation"),
            ParseDateTimeOffset(GetOptional(values, "startedAtUtc")),
            ParseDateTimeOffset(GetOptional(values, "lastHeartbeatUtc")),
            ParseDateTimeOffset(GetOptional(values, "lastCompletedAtUtc")),
            GetOptional(values, "message"));
    }

    private static Dictionary<string, string> ParseTopLevelMappings(string yaml)
    {
        var result = new Dictionary<string, string>(StringComparer.Ordinal);
        using var reader = new StringReader(yaml);

        string? line;
        while ((line = reader.ReadLine()) is not null)
        {
            if (string.IsNullOrWhiteSpace(line) || char.IsWhiteSpace(line[0]))
            {
                continue;
            }

            var separatorIndex = line.IndexOf(':');
            if (separatorIndex < 0)
            {
                continue;
            }

            var key = line[..separatorIndex].Trim();
            var value = line[(separatorIndex + 1)..].Trim();
            result[key] = value;
        }

        return result;
    }

    private static string GetRequired(IReadOnlyDictionary<string, string> values, string key)
    {
        if (!values.TryGetValue(key, out var value) || string.IsNullOrWhiteSpace(value))
        {
            throw new InvalidDataException($"Required YAML key '{key}' was not found.");
        }

        return value;
    }

    private static string? GetOptional(IReadOnlyDictionary<string, string> values, string key)
    {
        if (!values.TryGetValue(key, out var value) || string.IsNullOrWhiteSpace(value) || value == "null")
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
    DateTimeOffset? StartedAtUtc,
    DateTimeOffset? LastHeartbeatUtc,
    DateTimeOffset? LastCompletedAtUtc,
    string? Message);
