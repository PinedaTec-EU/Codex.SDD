using SpecForge.Domain.Application;
using SpecForge.OpenAICompatible;
using System.Text.Json;

namespace SpecForge.McpServer;

internal static class PhaseExecutionProviderFactory
{
    private static readonly IReadOnlySet<string> BridgeableProviderKinds = new HashSet<string>(StringComparer.Ordinal)
    {
        "openai-compatible",
        "codex",
        "copilot",
        "claude"
    };

    private const string ModelProfilesJsonEnvVar = "SPECFORGE_OPENAI_MODEL_PROFILES_JSON";
    private const string PhaseModelAssignmentsJsonEnvVar = "SPECFORGE_OPENAI_PHASE_MODEL_ASSIGNMENTS_JSON";
    private const string ClarificationToleranceEnvVar = "SPECFORGE_CAPTURE_TOLERANCE";
    private const string ReviewToleranceEnvVar = "SPECFORGE_REVIEW_TOLERANCE";
    private const string SystemPromptEnvVar = "SPECFORGE_OPENAI_SYSTEM_PROMPT";
    private const string TimeoutSecondsEnvVar = "SPECFORGE_OPENAI_TIMEOUT_SECONDS";
    private static readonly TimeSpan DefaultOpenAiTimeout = TimeSpan.FromMinutes(10);
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web)
    {
        PropertyNameCaseInsensitive = true
    };
    private const string OpenAiCompatibleKind = "openai-compatible";

    public static IPhaseExecutionProvider Create()
    {
        var modelProfiles = ReadModelProfilesFromEnvironment();
        if (modelProfiles.Count == 0)
        {
            return new DeterministicPhaseExecutionProvider();
        }

        var providerKinds = modelProfiles
            .Select(static profile => NormalizeProviderKind(profile.Provider))
            .Distinct(StringComparer.Ordinal)
            .ToArray();

        if (providerKinds.All(static providerKind => BridgeableProviderKinds.Contains(providerKind)))
        {
            return CreateOpenAiCompatibleProvider(modelProfiles);
        }

        throw new InvalidOperationException(
            $"Unsupported model profile provider set '{string.Join(", ", providerKinds)}'. Valid values: '{OpenAiCompatibleKind}', 'codex', 'copilot', 'claude'.");
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

        var deserialized = JsonSerializer.Deserialize<List<OpenAiCompatibleModelProfile>>(payload, JsonOptions)
               ?? throw new InvalidOperationException(
                   $"Environment variable '{ModelProfilesJsonEnvVar}' could not be parsed as model profile JSON.");
        return deserialized
            .Select(static profile => profile with { Provider = NormalizeProviderKind(profile.Provider) })
            .ToList();
    }

    private static OpenAiCompatiblePhaseModelAssignments? ReadPhaseModelAssignmentsFromEnvironment()
    {
        var payload = Environment.GetEnvironmentVariable(PhaseModelAssignmentsJsonEnvVar);
        if (string.IsNullOrWhiteSpace(payload))
        {
            return null;
        }

        return JsonSerializer.Deserialize<OpenAiCompatiblePhaseModelAssignments>(payload, JsonOptions)
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

    private static string NormalizeProviderKind(string? providerKind) =>
        string.IsNullOrWhiteSpace(providerKind)
            ? OpenAiCompatibleKind
            : providerKind.Trim().ToLowerInvariant();
}
