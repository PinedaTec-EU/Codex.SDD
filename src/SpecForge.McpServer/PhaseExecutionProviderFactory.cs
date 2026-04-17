using SpecForge.Domain.Application;
using SpecForge.OpenAICompatible;

namespace SpecForge.McpServer;

internal static class PhaseExecutionProviderFactory
{
    private const string ProviderKindEnvVar = "SPECFORGE_PHASE_PROVIDER";
    private const string BaseUrlEnvVar = "SPECFORGE_OPENAI_BASE_URL";
    private const string ApiKeyEnvVar = "SPECFORGE_OPENAI_API_KEY";
    private const string ModelEnvVar = "SPECFORGE_OPENAI_MODEL";
    private const string SystemPromptEnvVar = "SPECFORGE_OPENAI_SYSTEM_PROMPT";
    private const string DeterministicKind = "deterministic";
    private const string OpenAiCompatibleKind = "openai-compatible";

    public static IPhaseExecutionProvider Create()
    {
        var providerKind = Environment.GetEnvironmentVariable(ProviderKindEnvVar) ?? DeterministicKind;

        return providerKind switch
        {
            DeterministicKind => new DeterministicPhaseExecutionProvider(),
            OpenAiCompatibleKind => CreateOpenAiCompatibleProvider(),
            _ => throw new InvalidOperationException(
                $"Unsupported phase provider '{providerKind}'. Valid values: '{DeterministicKind}', '{OpenAiCompatibleKind}'.")
        };
    }

    private static IPhaseExecutionProvider CreateOpenAiCompatibleProvider()
    {
        var baseUrl = GetRequiredEnvironmentVariable(BaseUrlEnvVar);
        var apiKey = GetRequiredEnvironmentVariable(ApiKeyEnvVar);
        var model = GetRequiredEnvironmentVariable(ModelEnvVar);
        var systemPrompt = Environment.GetEnvironmentVariable(SystemPromptEnvVar) ??
                           "You generate markdown artifacts for SpecForge workflow phases. Return only markdown.";
        var httpClient = new HttpClient();
        var options = new OpenAiCompatibleProviderOptions(
            BaseUrl: baseUrl,
            ApiKey: apiKey,
            Model: model,
            SystemPrompt: systemPrompt);
        return new OpenAiCompatiblePhaseExecutionProvider(httpClient, options);
    }

    private static string GetRequiredEnvironmentVariable(string variableName)
    {
        var value = Environment.GetEnvironmentVariable(variableName);
        if (string.IsNullOrWhiteSpace(value))
        {
            throw new InvalidOperationException(
                $"Environment variable '{variableName}' is required when '{ProviderKindEnvVar}=openai-compatible'.");
        }

        return value;
    }
}
