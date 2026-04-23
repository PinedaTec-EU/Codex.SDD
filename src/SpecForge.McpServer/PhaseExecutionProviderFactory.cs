using SpecForge.Domain.Application;
using SpecForge.OpenAICompatible;
using System.Text.Json;

namespace SpecForge.McpServer;

internal static class PhaseExecutionProviderFactory
{
    private const string ModelProfilesJsonEnvVar = "SPECFORGE_OPENAI_MODEL_PROFILES_JSON";
    private const string PhaseModelAssignmentsJsonEnvVar = "SPECFORGE_OPENAI_PHASE_MODEL_ASSIGNMENTS_JSON";
    private const string ClarificationToleranceEnvVar = "SPECFORGE_CAPTURE_TOLERANCE";
    private const string ReviewToleranceEnvVar = "SPECFORGE_REVIEW_TOLERANCE";
    private const string SystemPromptEnvVar = "SPECFORGE_OPENAI_SYSTEM_PROMPT";
    private const string TimeoutSecondsEnvVar = "SPECFORGE_OPENAI_TIMEOUT_SECONDS";
    private static readonly TimeSpan DefaultOpenAiTimeout = TimeSpan.FromMinutes(10);
    private const string OpenAiCompatibleKind = "openai-compatible";

    public static IPhaseExecutionProvider Create()
    {
        var modelProfiles = ReadModelProfilesFromEnvironment();
        if (modelProfiles.Count == 0)
        {
            return new DeterministicPhaseExecutionProvider();
        }

        var providerKinds = modelProfiles
            .Select(static profile => profile.Provider)
            .Where(static provider => !string.IsNullOrWhiteSpace(provider))
            .Distinct(StringComparer.Ordinal)
            .ToArray();

        if (providerKinds.Length != 1)
        {
            throw new InvalidOperationException("All configured model profiles must use the same provider kind.");
        }

        return providerKinds[0] switch
        {
            OpenAiCompatibleKind => CreateOpenAiCompatibleProvider(modelProfiles),
            _ => throw new InvalidOperationException(
                $"Unsupported model profile provider '{providerKinds[0]}'. Valid values: '{OpenAiCompatibleKind}'.")
        };
    }

    private static IPhaseExecutionProvider CreateOpenAiCompatibleProvider(IReadOnlyList<OpenAiCompatibleModelProfile> modelProfiles)
    {
        var assignments = ReadPhaseModelAssignmentsFromEnvironment();
        var clarificationTolerance = Environment.GetEnvironmentVariable(ClarificationToleranceEnvVar) ?? "balanced";
        var reviewTolerance = Environment.GetEnvironmentVariable(ReviewToleranceEnvVar) ?? "balanced";
        var systemPrompt = Environment.GetEnvironmentVariable(SystemPromptEnvVar) ??
                           "You generate markdown artifacts for SpecForge workflow phases. Return only markdown.";
        var httpClient = new HttpClient
        {
            Timeout = ReadOpenAiTimeout()
        };
        var options = new OpenAiCompatibleProviderOptions(
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
