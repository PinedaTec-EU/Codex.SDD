using System.Text.Json;
using SpecForge.Domain.Application;
using SpecForge.Domain.Persistence;
using SpecForge.OpenAICompatible;

var runner = new WorkflowRunner(CreatePhaseExecutionProvider());
var applicationService = new SpecForgeApplicationService(new UserStoryFileStore(), runner);

if (args.Length == 0)
{
    return ExitWithError("A command is required.");
}

try
{
    var command = args[0];

    switch (command)
    {
        case "create-us":
            await HandleCreateUserStoryAsync(runner, args);
            return 0;
        case "import-us":
            await HandleImportUserStoryAsync(runner, args);
            return 0;
        case "continue-phase":
            await HandleContinuePhaseAsync(runner, args);
            return 0;
        case "list-user-stories":
            await HandleListUserStoriesAsync(applicationService, args);
            return 0;
        case "get-user-story-summary":
            await HandleGetUserStorySummaryAsync(applicationService, args);
            return 0;
        case "approve-phase":
            await HandleApprovePhaseAsync(runner, applicationService, args);
            return 0;
        default:
            return ExitWithError($"Unknown command '{command}'.");
    }
}
catch (Exception exception)
{
    return ExitWithError(exception.Message);
}

static async Task HandleCreateUserStoryAsync(WorkflowRunner runner, IReadOnlyList<string> args)
{
    EnsureArgumentCount(args, expectedCount: 7);

    var workspaceRoot = args[1];
    var usId = args[2];
    var title = args[3];
    var kind = args[4];
    var category = args[5];
    var sourceText = args[6];
    var rootDirectory = await runner.CreateUserStoryAsync(workspaceRoot, usId, title, kind, category, sourceText);

    WriteJson(new
    {
        usId,
        rootDirectory,
        mainArtifactPath = Path.Combine(rootDirectory, "us.md")
    });
}

static async Task HandleImportUserStoryAsync(WorkflowRunner runner, IReadOnlyList<string> args)
{
    EnsureArgumentCount(args, expectedCount: 7);

    var workspaceRoot = args[1];
    var usId = args[2];
    var sourcePath = args[3];
    var title = args[4];
    var kind = args[5];
    var category = args[6];
    var sourceText = await File.ReadAllTextAsync(sourcePath);
    var rootDirectory = await runner.CreateUserStoryAsync(workspaceRoot, usId, title, kind, category, sourceText);

    WriteJson(new
    {
        usId,
        rootDirectory,
        mainArtifactPath = Path.Combine(rootDirectory, "us.md")
    });
}

static async Task HandleContinuePhaseAsync(WorkflowRunner runner, IReadOnlyList<string> args)
{
    EnsureArgumentCount(args, expectedCount: 3);

    var workspaceRoot = args[1];
    var usId = args[2];
    var result = await runner.ContinuePhaseAsync(workspaceRoot, usId);

    WriteJson(new
    {
        result.UsId,
        currentPhase = WorkflowPresentation.ToPhaseSlug(result.CurrentPhase),
        status = WorkflowPresentation.ToStatusSlug(result.Status),
        result.GeneratedArtifactPath
    });
}

static async Task HandleListUserStoriesAsync(SpecForgeApplicationService applicationService, IReadOnlyList<string> args)
{
    EnsureArgumentCount(args, expectedCount: 2);

    var workspaceRoot = args[1];
    var items = await applicationService.ListUserStoriesAsync(workspaceRoot);
    WriteJson(new { items });
}

static async Task HandleGetUserStorySummaryAsync(SpecForgeApplicationService applicationService, IReadOnlyList<string> args)
{
    EnsureArgumentCount(args, expectedCount: 3);

    var workspaceRoot = args[1];
    var usId = args[2];
    var summary = await applicationService.GetUserStorySummaryAsync(workspaceRoot, usId);
    WriteJson(summary);
}

static async Task HandleApprovePhaseAsync(
    WorkflowRunner runner,
    SpecForgeApplicationService applicationService,
    IReadOnlyList<string> args)
{
    EnsureArgumentCount(args, expectedCount: 5);

    var workspaceRoot = args[1];
    var usId = args[2];
    var baseBranch = args[3];
    var workBranch = args[4];
    var normalizedBaseBranch = string.Equals(baseBranch, "-", StringComparison.Ordinal) ? null : baseBranch;
    var normalizedWorkBranch = string.Equals(workBranch, "-", StringComparison.Ordinal) ? null : workBranch;
    await runner.ApproveCurrentPhaseAsync(workspaceRoot, usId, normalizedBaseBranch, normalizedWorkBranch);
    var summary = await applicationService.GetUserStorySummaryAsync(workspaceRoot, usId);
    WriteJson(summary);
}

static void EnsureArgumentCount(IReadOnlyList<string> args, int expectedCount)
{
    if (args.Count != expectedCount)
    {
        throw new InvalidOperationException($"Expected {expectedCount - 1} argument(s) for command '{args[0]}'.");
    }
}

static void WriteJson<T>(T payload)
{
    Console.WriteLine(JsonSerializer.Serialize(payload));
}

static int ExitWithError(string message)
{
    Console.Error.WriteLine(message);
    return 1;
}

static IPhaseExecutionProvider CreatePhaseExecutionProvider()
{
    const string modelProfilesEnvVar = "SPECFORGE_OPENAI_MODEL_PROFILES_JSON";
    const string agentProfilesEnvVar = "SPECFORGE_OPENAI_AGENT_PROFILES_JSON";
    const string phaseAgentsEnvVar = "SPECFORGE_OPENAI_PHASE_AGENT_ASSIGNMENTS_JSON";
    const string refinementToleranceEnvVar = "SPECFORGE_REFINEMENT_TOLERANCE";
    const string legacyRefinementToleranceEnvVar = "SPECFORGE_CAPTURE_TOLERANCE";
    const string reviewToleranceEnvVar = "SPECFORGE_REVIEW_TOLERANCE";
    const string reviewEvidencePolicyEnvVar = "SPECFORGE_REVIEW_EVIDENCE_POLICY";
    const string autoRefinementAnswersEnabledEnvVar = "SPECFORGE_AUTO_REFINEMENT_ANSWERS_ENABLED";
    const string legacyAutoRefinementAnswersEnabledEnvVar = "SPECFORGE_AUTO_CLARIFICATION_ANSWERS_ENABLED";
    const string autoRefinementAnswersProfileEnvVar = "SPECFORGE_AUTO_REFINEMENT_ANSWERS_PROFILE";
    const string legacyAutoRefinementAnswersProfileEnvVar = "SPECFORGE_AUTO_CLARIFICATION_ANSWERS_PROFILE";
    const string reviewLearningEnabledEnvVar = "SPECFORGE_REVIEW_LEARNING_ENABLED";
    const string reviewLearningSkillPathEnvVar = "SPECFORGE_REVIEW_LEARNING_SKILL_PATH";
    const string systemPromptEnvVar = "SPECFORGE_OPENAI_SYSTEM_PROMPT";
    const string timeoutSecondsEnvVar = "SPECFORGE_OPENAI_TIMEOUT_SECONDS";

    var payload = Environment.GetEnvironmentVariable(modelProfilesEnvVar);
    if (string.IsNullOrWhiteSpace(payload))
    {
        return new DeterministicPhaseExecutionProvider();
    }

    var jsonOptions = new JsonSerializerOptions(JsonSerializerDefaults.Web)
    {
        PropertyNameCaseInsensitive = true
    };
    var modelProfiles = JsonSerializer.Deserialize<List<OpenAiCompatibleModelProfile>>(payload, jsonOptions)
        ?? throw new InvalidOperationException($"{modelProfilesEnvVar} could not be parsed.");
    var agentProfiles = JsonSerializer.Deserialize<List<OpenAiCompatibleAgentProfile>>(
            Environment.GetEnvironmentVariable(agentProfilesEnvVar) ?? "[]",
            jsonOptions)
        ?? [];
    var phaseAgents = JsonSerializer.Deserialize<OpenAiCompatiblePhaseAgentAssignments>(
        Environment.GetEnvironmentVariable(phaseAgentsEnvVar) ?? "{}",
        jsonOptions);
    var autoRefinementAnswersProfile = Environment.GetEnvironmentVariable(autoRefinementAnswersProfileEnvVar)
        ?? Environment.GetEnvironmentVariable(legacyAutoRefinementAnswersProfileEnvVar);
    var reviewLearningSkillPath = Environment.GetEnvironmentVariable(reviewLearningSkillPathEnvVar);

    return new OpenAiCompatiblePhaseExecutionProvider(
        new HttpClient { Timeout = ReadOpenAiTimeout(timeoutSecondsEnvVar) },
        new OpenAiCompatibleProviderOptions(
            SystemPrompt: Environment.GetEnvironmentVariable(systemPromptEnvVar)
                ?? "You generate SpecForge workflow artifacts. Follow the phase-specific Markdown output contract exactly and do not return JSON.",
            RefinementTolerance: Environment.GetEnvironmentVariable(refinementToleranceEnvVar)
                ?? Environment.GetEnvironmentVariable(legacyRefinementToleranceEnvVar)
                ?? "balanced",
            ReviewTolerance: Environment.GetEnvironmentVariable(reviewToleranceEnvVar) ?? "balanced",
            ReviewEvidencePolicy: Environment.GetEnvironmentVariable(reviewEvidencePolicyEnvVar) ?? "balanced",
            AutoRefinementAnswersEnabled: string.Equals(
                Environment.GetEnvironmentVariable(autoRefinementAnswersEnabledEnvVar)
                    ?? Environment.GetEnvironmentVariable(legacyAutoRefinementAnswersEnabledEnvVar),
                "true",
                StringComparison.OrdinalIgnoreCase),
            AutoRefinementAnswersProfile: string.IsNullOrWhiteSpace(autoRefinementAnswersProfile)
                ? null
                : autoRefinementAnswersProfile.Trim(),
            ReviewLearningEnabled: !string.Equals(
                Environment.GetEnvironmentVariable(reviewLearningEnabledEnvVar),
                "false",
                StringComparison.OrdinalIgnoreCase),
            ReviewLearningSkillPath: string.IsNullOrWhiteSpace(reviewLearningSkillPath)
                ? ".codex/skills/sdd-phase-agents/SKILL.md"
                : reviewLearningSkillPath.Trim(),
            ModelProfiles: modelProfiles,
            AgentProfiles: agentProfiles,
            PhaseAgentAssignments: phaseAgents));
}

static TimeSpan ReadOpenAiTimeout(string timeoutSecondsEnvVar)
{
    var configured = Environment.GetEnvironmentVariable(timeoutSecondsEnvVar);
    if (string.IsNullOrWhiteSpace(configured))
    {
        return TimeSpan.FromMinutes(10);
    }

    if (int.TryParse(configured, out var seconds) && seconds > 0)
    {
        return TimeSpan.FromSeconds(seconds);
    }

    throw new InvalidOperationException(
        $"Environment variable '{timeoutSecondsEnvVar}' must be a positive integer number of seconds.");
}
