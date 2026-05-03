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
    private const string AgentProfilesJsonEnvVar = "SPECFORGE_OPENAI_AGENT_PROFILES_JSON";
    private const string PhaseAgentAssignmentsJsonEnvVar = "SPECFORGE_OPENAI_PHASE_AGENT_ASSIGNMENTS_JSON";
    private const string RefinementToleranceEnvVar = "SPECFORGE_REFINEMENT_TOLERANCE";
    private const string LegacyRefinementToleranceEnvVar = "SPECFORGE_CAPTURE_TOLERANCE";
    private const string ReviewToleranceEnvVar = "SPECFORGE_REVIEW_TOLERANCE";
    private const string ReviewEvidencePolicyEnvVar = "SPECFORGE_REVIEW_EVIDENCE_POLICY";
    private const string AutoRefinementAnswersEnabledEnvVar = "SPECFORGE_AUTO_REFINEMENT_ANSWERS_ENABLED";
    private const string LegacyAutoRefinementAnswersEnabledEnvVar = "SPECFORGE_AUTO_CLARIFICATION_ANSWERS_ENABLED";
    private const string AutoRefinementAnswersProfileEnvVar = "SPECFORGE_AUTO_REFINEMENT_ANSWERS_PROFILE";
    private const string LegacyAutoRefinementAnswersProfileEnvVar = "SPECFORGE_AUTO_CLARIFICATION_ANSWERS_PROFILE";
    private const string ReviewLearningEnabledEnvVar = "SPECFORGE_REVIEW_LEARNING_ENABLED";
    private const string ReviewLearningSkillPathEnvVar = "SPECFORGE_REVIEW_LEARNING_SKILL_PATH";
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
        var agentProfiles = ReadAgentProfilesFromEnvironment();
        var assignments = ReadPhaseAgentAssignmentsFromEnvironment();
        var refinementTolerance = Environment.GetEnvironmentVariable(RefinementToleranceEnvVar)
            ?? Environment.GetEnvironmentVariable(LegacyRefinementToleranceEnvVar)
            ?? "balanced";
        var reviewTolerance = Environment.GetEnvironmentVariable(ReviewToleranceEnvVar) ?? "balanced";
        var reviewEvidencePolicy = Environment.GetEnvironmentVariable(ReviewEvidencePolicyEnvVar) ?? "balanced";
        var autoRefinementAnswersEnabled = string.Equals(
            Environment.GetEnvironmentVariable(AutoRefinementAnswersEnabledEnvVar)
                ?? Environment.GetEnvironmentVariable(LegacyAutoRefinementAnswersEnabledEnvVar),
            "true",
            StringComparison.OrdinalIgnoreCase);
        var autoRefinementAnswersProfile = Environment.GetEnvironmentVariable(AutoRefinementAnswersProfileEnvVar)
            ?? Environment.GetEnvironmentVariable(LegacyAutoRefinementAnswersProfileEnvVar);
        var reviewLearningEnabled = !string.Equals(
            Environment.GetEnvironmentVariable(ReviewLearningEnabledEnvVar),
            "false",
            StringComparison.OrdinalIgnoreCase);
        var reviewLearningSkillPath = Environment.GetEnvironmentVariable(ReviewLearningSkillPathEnvVar);
        var systemPrompt = Environment.GetEnvironmentVariable(SystemPromptEnvVar) ??
                           "You generate SpecForge workflow artifacts. Follow the phase-specific Markdown output contract exactly and do not return JSON.";
        var httpClient = new HttpClient
        {
            Timeout = ReadOpenAiTimeout()
        };
        var options = new OpenAiCompatibleProviderOptions(
            SystemPrompt: systemPrompt,
            RefinementTolerance: refinementTolerance,
            ReviewTolerance: reviewTolerance,
            ReviewEvidencePolicy: reviewEvidencePolicy,
            AutoRefinementAnswersEnabled: autoRefinementAnswersEnabled,
            AutoRefinementAnswersProfile: string.IsNullOrWhiteSpace(autoRefinementAnswersProfile) ? null : autoRefinementAnswersProfile.Trim(),
            ReviewLearningEnabled: reviewLearningEnabled,
            ReviewLearningSkillPath: string.IsNullOrWhiteSpace(reviewLearningSkillPath)
                ? ".codex/skills/sdd-phase-agents/SKILL.md"
                : reviewLearningSkillPath.Trim(),
            ModelProfiles: modelProfiles,
            AgentProfiles: agentProfiles,
            PhaseAgentAssignments: assignments);
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

    private static IReadOnlyList<OpenAiCompatibleAgentProfile> ReadAgentProfilesFromEnvironment()
    {
        var payload = Environment.GetEnvironmentVariable(AgentProfilesJsonEnvVar);
        if (string.IsNullOrWhiteSpace(payload))
        {
            return [];
        }

        return JsonSerializer.Deserialize<List<OpenAiCompatibleAgentProfile>>(payload, JsonOptions)
               ?? throw new InvalidOperationException(
                   $"Environment variable '{AgentProfilesJsonEnvVar}' could not be parsed as agent profile JSON.");
    }

    private static OpenAiCompatiblePhaseAgentAssignments? ReadPhaseAgentAssignmentsFromEnvironment()
    {
        var payload = Environment.GetEnvironmentVariable(PhaseAgentAssignmentsJsonEnvVar);
        if (string.IsNullOrWhiteSpace(payload))
        {
            return null;
        }

        return JsonSerializer.Deserialize<OpenAiCompatiblePhaseAgentAssignments>(payload, JsonOptions)
               ?? throw new InvalidOperationException(
                   $"Environment variable '{PhaseAgentAssignmentsJsonEnvVar}' could not be parsed as phase agent assignment JSON.");
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
