namespace SpecForge.OpenAICompatible;

public sealed record OpenAiCompatibleProviderOptions(
    string BaseUrl,
    string ApiKey,
    string Model,
    string? SystemPrompt = null);
