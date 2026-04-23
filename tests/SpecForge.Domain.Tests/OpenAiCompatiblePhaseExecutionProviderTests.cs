using System.Net;
using System.Net.Http;
using System.Text;
using System.Text.Json;
using SpecForge.Domain.Application;
using SpecForge.Domain.Persistence;
using SpecForge.Domain.Workflow;
using SpecForge.OpenAICompatible;

namespace SpecForge.Domain.Tests;

public sealed class OpenAiCompatiblePhaseExecutionProviderTests : IDisposable
{
    private readonly string workspaceRoot = Path.Combine(Path.GetTempPath(), Guid.NewGuid().ToString("N"));

    [Fact]
    public async Task ExecuteAsync_SendsOpenAiCompatibleRequestAndParsesRefinementJson()
    {
        await PrepareInitializedWorkspaceAsync();
        var handler = new CapturingFakeHttpMessageHandler(BuildMinimalRefinementJson());
        var httpClient = new HttpClient(handler);
        var provider = new OpenAiCompatiblePhaseExecutionProvider(
            httpClient,
            new OpenAiCompatibleProviderOptions(
                BaseUrl: "http://localhost:11434/v1",
                ApiKey: "ollama-local",
                Model: "llama3.1"));
        var context = new PhaseExecutionContext(
            WorkspaceRoot: workspaceRoot,
            UsId: "US-0001",
            PhaseId: PhaseId.Refinement,
            UserStoryPath: Path.Combine(workspaceRoot, ".specs", "us", "workflow", "US-0001", "us.md"),
            PreviousArtifactPaths: new Dictionary<PhaseId, string>(),
            ContextFilePaths: []);

        var result = await provider.ExecuteAsync(context);

        Assert.Equal("openai-compatible", result.ExecutionKind);
        Assert.Contains("\"title\": \"Generated refinement\"", result.Content);
        Assert.NotNull(result.Usage);
        Assert.Equal(120, result.Usage!.InputTokens);
        Assert.Equal(48, result.Usage.OutputTokens);
        Assert.Equal(168, result.Usage.TotalTokens);
        Assert.NotNull(result.Execution);
        Assert.Equal("openai-compatible", result.Execution!.ProviderKind);
        Assert.Equal("llama3.1", result.Execution.Model);
        Assert.Null(result.Execution.ProfileName);
        Assert.NotNull(handler.LastRequest);
        Assert.Equal(HttpMethod.Post, handler.LastRequest!.Method);
        Assert.Equal("http://localhost:11434/v1/chat/completions", handler.LastRequest.RequestUri!.ToString());
        Assert.Equal("Bearer", handler.LastRequest.Headers.Authorization?.Scheme);
        Assert.Equal("ollama-local", handler.LastRequest.Headers.Authorization?.Parameter);
        Assert.Contains("\"model\":\"llama3.1\"", handler.LastBody);
        Assert.Equal(0.2d, ReadTemperature(handler.LastBody));
        Assert.Contains("Role: refinement analyst.", handler.LastBody);
        Assert.Contains("Initial text", handler.LastBody);
    }

    [Theory]
    [InlineData("strict", 0.0d, "Be conservative. Ask for clarification whenever actor, trigger, business behavior, inputs, outputs, rules, or acceptance intent are materially ambiguous.")]
    [InlineData("balanced", 0.2d, "Use balanced judgment. Ask only for gaps that would block a credible refinement, but do not invent business-critical facts.")]
    [InlineData("inferential", 0.4d, "Be permissive. Prefer `ready_for_refinement` when the core actor, outcome, and flow are understandable, and infer reasonable defaults unless a missing detail would likely invalidate refinement.")]
    public async Task ExecuteAsync_ClarificationTolerance_ChangesTemperatureAndPrompt(
        string clarificationTolerance,
        double expectedTemperature,
        string expectedGuidance)
    {
        await PrepareInitializedWorkspaceAsync();
        var handler = new CapturingFakeHttpMessageHandler("ok");
        var provider = new OpenAiCompatiblePhaseExecutionProvider(
            new HttpClient(handler),
            new OpenAiCompatibleProviderOptions(
                BaseUrl: "http://localhost:11434/v1",
                ApiKey: string.Empty,
                Model: "llama3.1",
                ClarificationTolerance: clarificationTolerance));
        var context = new PhaseExecutionContext(
            WorkspaceRoot: workspaceRoot,
            UsId: "US-0001",
            PhaseId: PhaseId.Clarification,
            UserStoryPath: Path.Combine(workspaceRoot, ".specs", "us", "workflow", "US-0001", "us.md"),
            PreviousArtifactPaths: new Dictionary<PhaseId, string>(),
            ContextFilePaths: []);

        await provider.ExecuteAsync(context);

        Assert.Equal(expectedTemperature, ReadTemperature(handler.LastBody));
        var userPrompt = ReadUserPrompt(handler.LastBody);
        Assert.Contains($"Active tolerance: `{clarificationTolerance}`", userPrompt);
        Assert.Contains(expectedGuidance, userPrompt);
    }

    [Theory]
    [InlineData("strict", 0.0d, "Be demanding. Surface weaker evidence, thinner validation, and smaller deviations as findings whenever they could undermine confidence in release readiness.")]
    [InlineData("balanced", 0.2d, "Use balanced judgment. Prioritize meaningful risks and missing evidence without inflating cosmetic or low-impact issues.")]
    [InlineData("inferential", 0.4d, "Be pragmatic. Focus on material deviations, missing validation, or operational risks, and avoid blocking on minor imperfections that do not change the release decision.")]
    public async Task ExecuteAsync_ReviewTolerance_ChangesTemperatureAndPrompt(
        string reviewTolerance,
        double expectedTemperature,
        string expectedGuidance)
    {
        await PrepareInitializedWorkspaceAsync();
        var handler = new CapturingFakeHttpMessageHandler("# review markdown");
        var provider = new OpenAiCompatiblePhaseExecutionProvider(
            new HttpClient(handler),
            new OpenAiCompatibleProviderOptions(
                BaseUrl: "http://localhost:11434/v1",
                ApiKey: string.Empty,
                Model: "llama3.1",
                ReviewTolerance: reviewTolerance));
        var context = new PhaseExecutionContext(
            WorkspaceRoot: workspaceRoot,
            UsId: "US-0001",
            PhaseId: PhaseId.Review,
            UserStoryPath: Path.Combine(workspaceRoot, ".specs", "us", "workflow", "US-0001", "us.md"),
            PreviousArtifactPaths: new Dictionary<PhaseId, string>(),
            ContextFilePaths: []);

        await provider.ExecuteAsync(context);

        Assert.Equal(expectedTemperature, ReadTemperature(handler.LastBody));
        var userPrompt = ReadUserPrompt(handler.LastBody);
        Assert.Contains($"Active tolerance: `{reviewTolerance}`", userPrompt);
        Assert.Contains(expectedGuidance, userPrompt);
    }

    [Fact]
    public async Task ExecuteAsync_IncludesContextFileContentsInRuntimeContext()
    {
        await PrepareInitializedWorkspaceAsync();
        var attachmentDirectory = Path.Combine(workspaceRoot, ".specs", "us", "workflow", "US-0001", "context");
        Directory.CreateDirectory(attachmentDirectory);
        var attachmentPath = Path.Combine(attachmentDirectory, "notes.md");
        await File.WriteAllTextAsync(attachmentPath, "# Notes\nUseful attachment");
        var handler = new CapturingFakeHttpMessageHandler(BuildMinimalRefinementJson());
        var provider = new OpenAiCompatiblePhaseExecutionProvider(
            new HttpClient(handler),
            new OpenAiCompatibleProviderOptions(
                BaseUrl: "http://localhost:11434/v1",
                ApiKey: "ollama-local",
                Model: "llama3.1"));
        var context = new PhaseExecutionContext(
            WorkspaceRoot: workspaceRoot,
            UsId: "US-0001",
            PhaseId: PhaseId.Refinement,
            UserStoryPath: Path.Combine(workspaceRoot, ".specs", "us", "workflow", "US-0001", "us.md"),
            PreviousArtifactPaths: new Dictionary<PhaseId, string>(),
            ContextFilePaths: [attachmentPath]);

        await provider.ExecuteAsync(context);

        Assert.Contains("## Context Files", handler.LastBody);
        Assert.Contains("notes.md", handler.LastBody);
        Assert.Contains("Useful attachment", handler.LastBody);
    }

    [Fact]
    public async Task ExecuteAsync_LocalEndpointWithoutApiKey_OmitsAuthorizationHeader()
    {
        await PrepareInitializedWorkspaceAsync();
        var handler = new CapturingFakeHttpMessageHandler(BuildMinimalRefinementJson());
        var provider = new OpenAiCompatiblePhaseExecutionProvider(
            new HttpClient(handler),
            new OpenAiCompatibleProviderOptions(
                BaseUrl: "http://localhost:11434/v1",
                ApiKey: string.Empty,
                Model: "llama3.1"));
        var context = new PhaseExecutionContext(
            WorkspaceRoot: workspaceRoot,
            UsId: "US-0001",
            PhaseId: PhaseId.Refinement,
            UserStoryPath: Path.Combine(workspaceRoot, ".specs", "us", "workflow", "US-0001", "us.md"),
            PreviousArtifactPaths: new Dictionary<PhaseId, string>(),
            ContextFilePaths: []);

        var result = await provider.ExecuteAsync(context);

        Assert.Equal("openai-compatible", result.ExecutionKind);
        Assert.Null(handler.LastRequest!.Headers.Authorization);
    }

    [Fact]
    public async Task ExecuteAsync_UsesAssignedModelProfilePerPhase()
    {
        await PrepareInitializedWorkspaceAsync();
        var handler = new CapturingFakeHttpMessageHandler("# review markdown");
        var provider = new OpenAiCompatiblePhaseExecutionProvider(
            new HttpClient(handler),
            new OpenAiCompatibleProviderOptions(
                BaseUrl: null,
                ApiKey: null,
                Model: null,
                ModelProfiles:
                [
                    new OpenAiCompatibleModelProfile(
                        Name: "light",
                        BaseUrl: "http://localhost:11434/v1",
                        ApiKey: string.Empty,
                        Model: "llama-light"),
                    new OpenAiCompatibleModelProfile(
                        Name: "top",
                        BaseUrl: "http://localhost:22434/v1",
                        ApiKey: string.Empty,
                        Model: "llama-top")
                ],
                PhaseModelAssignments: new OpenAiCompatiblePhaseModelAssignments(
                    DefaultProfile: "light",
                    ImplementationProfile: "top",
                    ReviewProfile: "light")));

        var implementationContext = new PhaseExecutionContext(
            WorkspaceRoot: workspaceRoot,
            UsId: "US-0001",
            PhaseId: PhaseId.Implementation,
            UserStoryPath: Path.Combine(workspaceRoot, ".specs", "us", "workflow", "US-0001", "us.md"),
            PreviousArtifactPaths: new Dictionary<PhaseId, string>(),
            ContextFilePaths: []);

        await provider.ExecuteAsync(implementationContext);

        Assert.Equal("http://localhost:22434/v1/chat/completions", handler.LastRequest!.RequestUri!.ToString());
        Assert.Contains("\"model\":\"llama-top\"", handler.LastBody);

        var reviewContext = implementationContext with
        {
            PhaseId = PhaseId.Review
        };

        var reviewResult = await provider.ExecuteAsync(reviewContext);

        Assert.Equal("http://localhost:11434/v1/chat/completions", handler.LastRequest!.RequestUri!.ToString());
        Assert.Contains("\"model\":\"llama-light\"", handler.LastBody);
        Assert.NotNull(reviewResult.Execution);
        Assert.Equal("light", reviewResult.Execution!.ProfileName);
        Assert.Equal("llama-light", reviewResult.Execution.Model);
    }

    [Fact]
    public async Task ExecuteAsync_ClarificationOk_NormalizesToCanonicalReadyArtifact()
    {
        await PrepareInitializedWorkspaceAsync();
        var handler = new CapturingFakeHttpMessageHandler("ok");
        var provider = new OpenAiCompatiblePhaseExecutionProvider(
            new HttpClient(handler),
            new OpenAiCompatibleProviderOptions(
                BaseUrl: "http://localhost:11434/v1",
                ApiKey: string.Empty,
                Model: "llama3.1"));
        var context = new PhaseExecutionContext(
            WorkspaceRoot: workspaceRoot,
            UsId: "US-0001",
            PhaseId: PhaseId.Clarification,
            UserStoryPath: Path.Combine(workspaceRoot, ".specs", "us", "workflow", "US-0001", "us.md"),
            PreviousArtifactPaths: new Dictionary<PhaseId, string>(),
            ContextFilePaths: []);

        var result = await provider.ExecuteAsync(context);

        Assert.Contains("## Decision", result.Content);
        Assert.Contains("ready_for_refinement", result.Content);
        Assert.Contains("No clarification questions remain.", result.Content);
    }

    [Fact]
    public async Task ExecuteAsync_ClarificationNeedsClarification_StripsMachineHeaderAndKeepsMarkdownBody()
    {
        await PrepareInitializedWorkspaceAsync();
        var handler = new CapturingFakeHttpMessageHandler(
            """
            needs_clarification

            # Clarification · US-0001 · v01

            ## State
            - State: `pending_user_input`

            ## Decision
            needs_clarification

            ## Reason
            Missing actor and acceptance details.

            ## Questions
            1. Who performs the action?
            """
        );
        var provider = new OpenAiCompatiblePhaseExecutionProvider(
            new HttpClient(handler),
            new OpenAiCompatibleProviderOptions(
                BaseUrl: "http://localhost:11434/v1",
                ApiKey: string.Empty,
                Model: "llama3.1"));
        var context = new PhaseExecutionContext(
            WorkspaceRoot: workspaceRoot,
            UsId: "US-0001",
            PhaseId: PhaseId.Clarification,
            UserStoryPath: Path.Combine(workspaceRoot, ".specs", "us", "workflow", "US-0001", "us.md"),
            PreviousArtifactPaths: new Dictionary<PhaseId, string>(),
            ContextFilePaths: []);

        var result = await provider.ExecuteAsync(context);

        Assert.DoesNotContain("needs_clarification\n\n# Clarification", result.Content);
        Assert.StartsWith("# Clarification · US-0001 · v01", result.Content);
        Assert.Contains("## Questions", result.Content);
    }

    [Fact]
    public async Task ExecuteAsync_RefinementMarkdownPayload_ThrowsInsteadOfBackfillingPlaceholderSpec()
    {
        await PrepareInitializedWorkspaceAsync();
        var handler = new CapturingFakeHttpMessageHandler("# generated markdown");
        var provider = new OpenAiCompatiblePhaseExecutionProvider(
            new HttpClient(handler),
            new OpenAiCompatibleProviderOptions(
                BaseUrl: "http://localhost:11434/v1",
                ApiKey: string.Empty,
                Model: "llama3.1"));
        var context = new PhaseExecutionContext(
            WorkspaceRoot: workspaceRoot,
            UsId: "US-0001",
            PhaseId: PhaseId.Refinement,
            UserStoryPath: Path.Combine(workspaceRoot, ".specs", "us", "workflow", "US-0001", "us.md"),
            PreviousArtifactPaths: new Dictionary<PhaseId, string>(),
            ContextFilePaths: []);

        await Assert.ThrowsAsync<JsonException>(() => provider.ExecuteAsync(context));
    }

    [Fact]
    public void Constructor_RemoteEndpointWithoutApiKey_Throws()
    {
        var httpClient = new HttpClient(new CapturingFakeHttpMessageHandler());

        var error = Assert.Throws<ArgumentException>(() => new OpenAiCompatiblePhaseExecutionProvider(
            httpClient,
            new OpenAiCompatibleProviderOptions(
                BaseUrl: "https://api.example.test/v1",
                ApiKey: string.Empty,
                Model: "gpt-test")));

        Assert.Contains("ApiKey is required", error.Message);
    }

    [Fact]
    public async Task ExecuteAsync_WithoutInitializedPromptSet_ThrowsClearError()
    {
        Directory.CreateDirectory(Path.Combine(workspaceRoot, ".specs", "us", "workflow", "US-0001"));
        await File.WriteAllTextAsync(
            Path.Combine(workspaceRoot, ".specs", "us", "workflow", "US-0001", "us.md"),
            "# US-0001");
        var provider = new OpenAiCompatiblePhaseExecutionProvider(
            new HttpClient(new CapturingFakeHttpMessageHandler()),
            new OpenAiCompatibleProviderOptions(
                BaseUrl: "http://localhost:11434/v1",
                ApiKey: "ollama-local",
                Model: "llama3.1"));
        var context = new PhaseExecutionContext(
            WorkspaceRoot: workspaceRoot,
            UsId: "US-0001",
            PhaseId: PhaseId.Refinement,
            UserStoryPath: Path.Combine(workspaceRoot, ".specs", "us", "workflow", "US-0001", "us.md"),
            PreviousArtifactPaths: new Dictionary<PhaseId, string>(),
            ContextFilePaths: []);

        var error = await Assert.ThrowsAsync<InvalidOperationException>(() => provider.ExecuteAsync(context));

        Assert.Contains("Missing required prompt template", error.Message);
    }

    public void Dispose()
    {
        if (Directory.Exists(workspaceRoot))
        {
            Directory.Delete(workspaceRoot, recursive: true);
        }
    }

    private async Task PrepareInitializedWorkspaceAsync()
    {
        var initializer = new RepositoryPromptInitializer();
        await initializer.InitializeAsync(workspaceRoot);

        var paths = UserStoryFilePaths.FromWorkspaceRoot(workspaceRoot, "workflow", "US-0001");
        Directory.CreateDirectory(paths.RootDirectory);
        await File.WriteAllTextAsync(paths.MainArtifactPath, "# US-0001\n\n## Objective\nInitial text");
    }

    private static double ReadTemperature(string requestBody)
    {
        using var document = JsonDocument.Parse(requestBody);
        return document.RootElement.GetProperty("temperature").GetDouble();
    }

    private static string ReadUserPrompt(string requestBody)
    {
        using var document = JsonDocument.Parse(requestBody);
        return document.RootElement
            .GetProperty("messages")
            .EnumerateArray()
            .First(message => string.Equals(message.GetProperty("role").GetString(), "user", StringComparison.Ordinal))
            .GetProperty("content")
            .GetString() ?? string.Empty;
    }

    private sealed class CapturingFakeHttpMessageHandler : HttpMessageHandler
    {
        private readonly string responseContent;

        public CapturingFakeHttpMessageHandler(string responseContent = "")
        {
            this.responseContent = string.IsNullOrWhiteSpace(responseContent) ? BuildMinimalRefinementJson() : responseContent;
        }

        public HttpRequestMessage? LastRequest { get; private set; }

        public string LastBody { get; private set; } = string.Empty;

        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            LastRequest = request;
            LastBody = await request.Content!.ReadAsStringAsync(cancellationToken);

            var payload = JsonSerializer.Serialize(new
            {
                usage = new
                {
                    prompt_tokens = 120,
                    completion_tokens = 48,
                    total_tokens = 168
                },
                choices = new[]
                {
                    new
                    {
                        message = new
                        {
                            content = responseContent
                        }
                    }
                }
            });

            return new HttpResponseMessage(HttpStatusCode.OK)
            {
                Content = new StringContent(payload, Encoding.UTF8, "application/json")
            };
        }
    }

    private static string BuildMinimalRefinementJson() =>
        """
        {
          "title": "Generated refinement",
          "historyLog": ["`2026-04-22T13:25:00Z` · Initial refinement baseline generated."],
          "state": "pending_approval",
          "basedOn": "us.md",
          "specSummary": "A valid refinement baseline.",
          "inputs": ["A concrete source objective."],
          "outputs": ["A concrete refinement artifact."],
          "businessRules": ["The workflow must preserve the approved scope."],
          "edgeCases": ["Missing context should be surfaced explicitly."],
          "errorsAndFailureModes": ["Invalid repository state should stop refinement."],
          "constraints": ["Stay within the current repository."],
          "detectedAmbiguities": ["Non-functional targets remain explicit only when provided."],
          "redTeam": ["Implicit assumptions may still exist if the source is weak."],
          "blueTeam": ["Keep the refinement executable and bounded."],
          "acceptanceCriteria": ["The spec is concrete enough for technical design."],
          "humanApprovalQuestions": [
            { "question": "Is the scope bounded enough for design?", "status": "pending" }
          ]
        }
        """;
}
