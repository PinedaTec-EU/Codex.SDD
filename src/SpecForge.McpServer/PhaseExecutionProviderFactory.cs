using SpecForge.Domain.Application;
using SpecForge.OpenAICompatible;

namespace SpecForge.McpServer;

internal static class PhaseExecutionProviderFactory
{
    private const string ProviderKindEnvVar = "SPECFORGE_PHASE_PROVIDER";
    private const string BaseUrlEnvVar = "SPECFORGE_OPENAI_BASE_URL";
    private const string ApiKeyEnvVar = "SPECFORGE_OPENAI_API_KEY";
    private const string ModelEnvVar = "SPECFORGE_OPENAI_MODEL";
    private const string ClarificationToleranceEnvVar = "SPECFORGE_CAPTURE_TOLERANCE";
    private const string ReviewToleranceEnvVar = "SPECFORGE_REVIEW_TOLERANCE";
    private const string SystemPromptEnvVar = "SPECFORGE_OPENAI_SYSTEM_PROMPT";
    private const string TimeoutSecondsEnvVar = "SPECFORGE_OPENAI_TIMEOUT_SECONDS";
    private static readonly TimeSpan DefaultOpenAiTimeout = TimeSpan.FromMinutes(10);
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
        var apiKey = LocalEndpointHelper.IsLocal(baseUrl)
            ? Environment.GetEnvironmentVariable(ApiKeyEnvVar) ?? string.Empty
            : GetRequiredEnvironmentVariable(ApiKeyEnvVar);
        var model = GetRequiredEnvironmentVariable(ModelEnvVar);
        var clarificationTolerance = Environment.GetEnvironmentVariable(ClarificationToleranceEnvVar) ?? "balanced";
        var reviewTolerance = Environment.GetEnvironmentVariable(ReviewToleranceEnvVar) ?? "balanced";
        var systemPrompt = Environment.GetEnvironmentVariable(SystemPromptEnvVar) ??
                           "You generate markdown artifacts for SpecForge workflow phases. Return only markdown.";
        var httpClient = new HttpClient
        {
            Timeout = ReadOpenAiTimeout()
        };
        var options = new OpenAiCompatibleProviderOptions(
            BaseUrl: baseUrl,
            ApiKey: apiKey,
            Model: model,
            SystemPrompt: systemPrompt,
            ClarificationTolerance: clarificationTolerance,
            ReviewTolerance: reviewTolerance);
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

    private static TimeSpan ReadOpenAiTimeout()
    {
        var configured = Environment.GetEnvironmentVariable(TimeoutSecondsEnvVar);
        if (string.IsNullOrWhiteSpace(configured))
        {
            return DefaultOpenAiTimeout;
        }

        if (int.TryParse(configured, out var seconds) && seconds > 0)
        {
            return TimeSpan.FromSeconds(seconds);
        }

        throw new InvalidOperationException(
            $"Environment variable '{TimeoutSecondsEnvVar}' must be a positive integer number of seconds.");
    }
}
