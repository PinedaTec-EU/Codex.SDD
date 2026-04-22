using SpecForge.Domain.Application;
using SpecForge.OpenAICompatible;
using System.Text.Json;

namespace SpecForge.McpServer;

internal static class PhaseExecutionProviderFactory
{
    private const string ProviderKindEnvVar = "SPECFORGE_PHASE_PROVIDER";
    private const string BaseUrlEnvVar = "SPECFORGE_OPENAI_BASE_URL";
    private const string ApiKeyEnvVar = "SPECFORGE_OPENAI_API_KEY";
    private const string ModelEnvVar = "SPECFORGE_OPENAI_MODEL";
    private const string ModelProfilesJsonEnvVar = "SPECFORGE_OPENAI_MODEL_PROFILES_JSON";
    private const string PhaseModelAssignmentsJsonEnvVar = "SPECFORGE_OPENAI_PHASE_MODEL_ASSIGNMENTS_JSON";
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
        var modelProfiles = ReadModelProfilesFromEnvironment();
        var assignments = ReadPhaseModelAssignmentsFromEnvironment();
        var baseUrl = modelProfiles.Count > 0
            ? Environment.GetEnvironmentVariable(BaseUrlEnvVar)
            : GetRequiredEnvironmentVariable(BaseUrlEnvVar);
        var apiKey = modelProfiles.Count > 0
            ? Environment.GetEnvironmentVariable(ApiKeyEnvVar) ?? string.Empty
            : LocalEndpointHelper.IsLocal(baseUrl!)
                ? Environment.GetEnvironmentVariable(ApiKeyEnvVar) ?? string.Empty
                : GetRequiredEnvironmentVariable(ApiKeyEnvVar);
        var model = modelProfiles.Count > 0
            ? Environment.GetEnvironmentVariable(ModelEnvVar)
            : GetRequiredEnvironmentVariable(ModelEnvVar);
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
            ReviewTolerance: reviewTolerance,
            ModelProfiles: modelProfiles,
            PhaseModelAssignments: assignments);
        return new OpenAiCompatiblePhaseExecutionProvider(httpClient, options);
    }

    private static IReadOnlyList<OpenAiCompatibleModelProfile> ReadModelProfilesFromEnvironment()
    {
        var payload = Environment.GetEnvironmentVariable(ModelProfilesJsonEnvVar);
        if (string.IsNullOrWhiteSpace(payload))
        {
            return [];
        }

        return JsonSerializer.Deserialize<List<OpenAiCompatibleModelProfile>>(payload)
               ?? throw new InvalidOperationException(
                   $"Environment variable '{ModelProfilesJsonEnvVar}' could not be parsed as model profile JSON.");
    }

    private static OpenAiCompatiblePhaseModelAssignments? ReadPhaseModelAssignmentsFromEnvironment()
    {
        var payload = Environment.GetEnvironmentVariable(PhaseModelAssignmentsJsonEnvVar);
        if (string.IsNullOrWhiteSpace(payload))
        {
            return null;
        }

        return JsonSerializer.Deserialize<OpenAiCompatiblePhaseModelAssignments>(payload)
               ?? throw new InvalidOperationException(
                   $"Environment variable '{PhaseModelAssignmentsJsonEnvVar}' could not be parsed as phase assignment JSON.");
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
