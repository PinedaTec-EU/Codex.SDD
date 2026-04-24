using System.Text.Json;

namespace SpecForge.Domain.Tests;

internal static class OpenAiCompatibleRequestJson
{
    public static double ReadTemperature(string requestBody)
    {
        using var document = JsonDocument.Parse(requestBody);

        return document.RootElement.GetProperty("temperature").GetDouble();
    }

    public static string ReadResponseFormatType(string requestBody)
    {
        using var document = JsonDocument.Parse(requestBody);

        return document.RootElement.GetProperty("response_format").GetProperty("type").GetString() ?? string.Empty;
    }

    public static string ReadResponseSchemaName(string requestBody)
    {
        using var document = JsonDocument.Parse(requestBody);

        return document.RootElement.GetProperty("response_format").GetProperty("json_schema").GetProperty("name").GetString() ?? string.Empty;
    }

    public static string ReadUserPrompt(string requestBody) =>
        ReadMessageContent(requestBody, "user");

    public static string ReadSystemPrompt(string requestBody) =>
        ReadMessageContent(requestBody, "system");

    public static string ReadModel(string requestBody)
    {
        using var document = JsonDocument.Parse(requestBody);

        return document.RootElement.GetProperty("model").GetString() ?? string.Empty;
    }

    private static string ReadMessageContent(string requestBody, string role)
    {
        using var document = JsonDocument.Parse(requestBody);

        return document.RootElement
            .GetProperty("messages")
            .EnumerateArray()
            .First(message => string.Equals(message.GetProperty("role").GetString(), role, StringComparison.Ordinal))
            .GetProperty("content")
            .GetString() ?? string.Empty;
    }
}
