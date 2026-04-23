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
            CreateOptions(
                model: "llama3.1",
                apiKey: "ollama-local"));
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
        Assert.Equal("default", result.Execution.ProfileName);
        Assert.NotNull(handler.LastRequest);
        Assert.Equal(HttpMethod.Post, handler.LastRequest!.Method);
        Assert.Equal("http://localhost:11434/v1/chat/completions", handler.LastRequest.RequestUri!.ToString());
        Assert.Equal("Bearer", handler.LastRequest.Headers.Authorization?.Scheme);
        Assert.Equal("ollama-local", handler.LastRequest.Headers.Authorization?.Parameter);
        Assert.Contains("\"model\":\"llama3.1\"", handler.LastBody);
        Assert.Equal(0.2d, ReadTemperature(handler.LastBody));
        Assert.Equal("json_schema", ReadResponseFormatType(handler.LastBody));
        Assert.Equal("refinement_artifact", ReadResponseSchemaName(handler.LastBody));
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
        var handler = new CapturingFakeHttpMessageHandler(BuildReadyClarificationJson());
        var provider = new OpenAiCompatiblePhaseExecutionProvider(
            new HttpClient(handler),
            CreateOptions(
                model: "llama3.1",
                clarificationTolerance: clarificationTolerance));
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
        var handler = new CapturingFakeHttpMessageHandler(BuildMinimalReviewJson());
        var provider = new OpenAiCompatiblePhaseExecutionProvider(
            new HttpClient(handler),
            CreateOptions(
                model: "llama3.1",
                reviewTolerance: reviewTolerance));
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
            CreateOptions(
                model: "llama3.1",
                apiKey: "ollama-local"));
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
            CreateOptions(model: "llama3.1"));
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
        var implementationHandler = new CapturingFakeHttpMessageHandler(BuildMinimalImplementationJson());
        var implementationProvider = new OpenAiCompatiblePhaseExecutionProvider(
            new HttpClient(implementationHandler),
            new OpenAiCompatibleProviderOptions(
                ModelProfiles:
                [
                    new OpenAiCompatibleModelProfile(
                        Name: "light",
                        Provider: "openai-compatible",
                        BaseUrl: "http://localhost:11434/v1",
                        ApiKey: string.Empty,
                        Model: "llama-light",
                        RepositoryAccess: "read"),
                    new OpenAiCompatibleModelProfile(
                        Name: "top",
                        Provider: "openai-compatible",
                        BaseUrl: "http://localhost:22434/v1",
                        ApiKey: string.Empty,
                        Model: "llama-top",
                        RepositoryAccess: "read-write")
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

        await implementationProvider.ExecuteAsync(implementationContext);

        Assert.Equal("http://localhost:22434/v1/chat/completions", implementationHandler.LastRequest!.RequestUri!.ToString());
        Assert.Contains("\"model\":\"llama-top\"", implementationHandler.LastBody);
        Assert.Equal("implementation_artifact", ReadResponseSchemaName(implementationHandler.LastBody));

        var reviewHandler = new CapturingFakeHttpMessageHandler(BuildMinimalReviewJson());
        var reviewProvider = new OpenAiCompatiblePhaseExecutionProvider(
            new HttpClient(reviewHandler),
            new OpenAiCompatibleProviderOptions(
                ModelProfiles:
                [
                    new OpenAiCompatibleModelProfile(
                        Name: "light",
                        Provider: "openai-compatible",
                        BaseUrl: "http://localhost:11434/v1",
                        ApiKey: string.Empty,
                        Model: "llama-light"),
                    new OpenAiCompatibleModelProfile(
                        Name: "top",
                        Provider: "openai-compatible",
                        BaseUrl: "http://localhost:22434/v1",
                        ApiKey: string.Empty,
                        Model: "llama-top")
                ],
                PhaseModelAssignments: new OpenAiCompatiblePhaseModelAssignments(
                    DefaultProfile: "light",
                    ImplementationProfile: "top",
                    ReviewProfile: "light")));
        var reviewContext = implementationContext with
        {
            PhaseId = PhaseId.Review
        };

        var reviewResult = await reviewProvider.ExecuteAsync(reviewContext);

        Assert.Equal("http://localhost:11434/v1/chat/completions", reviewHandler.LastRequest!.RequestUri!.ToString());
        Assert.Contains("\"model\":\"llama-light\"", reviewHandler.LastBody);
        Assert.Equal("review_artifact", ReadResponseSchemaName(reviewHandler.LastBody));
        Assert.NotNull(reviewResult.Execution);
        Assert.Equal("light", reviewResult.Execution!.ProfileName);
        Assert.Equal("llama-light", reviewResult.Execution.Model);
    }

    [Fact]
    public void GetPhaseExecutionReadiness_BlocksImplementationWithoutRepositoryWriteAccess()
    {
        var provider = new OpenAiCompatiblePhaseExecutionProvider(
            new HttpClient(new CapturingFakeHttpMessageHandler()),
            CreateOptions(model: "llama3.1", repositoryAccess: "read"));

        var readiness = provider.GetPhaseExecutionReadiness(PhaseId.Implementation);

        Assert.False(readiness.CanExecute);
        Assert.Equal(PhaseExecutionBlockingReasons.ImplementationRequiresRepositoryWriteAccess, readiness.BlockingReason);
    }

    [Fact]
    public void GetPhaseExecutionReadiness_BlocksReviewWithoutRepositoryReadAccess()
    {
        var provider = new OpenAiCompatiblePhaseExecutionProvider(
            new HttpClient(new CapturingFakeHttpMessageHandler()),
            CreateOptions(model: "llama3.1", repositoryAccess: "none"));

        var readiness = provider.GetPhaseExecutionReadiness(PhaseId.Review);

        Assert.False(readiness.CanExecute);
        Assert.Equal(PhaseExecutionBlockingReasons.ReviewRequiresRepositoryReadAccess, readiness.BlockingReason);
    }

    [Fact]
    public void GetPhaseExecutionReadiness_CodexProfileWithoutCli_BlocksExecution()
    {
        var provider = new OpenAiCompatiblePhaseExecutionProvider(
            new HttpClient(new CapturingFakeHttpMessageHandler()),
            CreateOptions(model: string.Empty, providerKind: "codex", baseUrl: string.Empty, apiKey: string.Empty),
            new RepositoryPromptCatalog(),
            new FakeCodexCliRunner(isAvailable: false));

        var readiness = provider.GetPhaseExecutionReadiness(PhaseId.Implementation);

        Assert.False(readiness.CanExecute);
        Assert.Equal(PhaseExecutionBlockingReasons.CodexCliNotFound, readiness.BlockingReason);
    }

    [Fact]
    public async Task ExecuteAsync_EmptyProfileProvider_DefaultsToOpenAiCompatible()
    {
        await PrepareInitializedWorkspaceAsync();
        var handler = new CapturingFakeHttpMessageHandler(BuildMinimalRefinementJson());
        var provider = new OpenAiCompatiblePhaseExecutionProvider(
            new HttpClient(handler),
            new OpenAiCompatibleProviderOptions(
                ModelProfiles:
                [
                    new OpenAiCompatibleModelProfile(
                        Name: "light",
                        Provider: string.Empty,
                        BaseUrl: "http://localhost:11434/v1",
                        ApiKey: string.Empty,
                        Model: "llama-light")
                ],
                PhaseModelAssignments: new OpenAiCompatiblePhaseModelAssignments(
                    DefaultProfile: "light")));
        var context = new PhaseExecutionContext(
            WorkspaceRoot: workspaceRoot,
            UsId: "US-0001",
            PhaseId: PhaseId.Refinement,
            UserStoryPath: Path.Combine(workspaceRoot, ".specs", "us", "workflow", "US-0001", "us.md"),
            PreviousArtifactPaths: new Dictionary<PhaseId, string>(),
            ContextFilePaths: []);

        var result = await provider.ExecuteAsync(context);

        Assert.NotNull(result.Execution);
        Assert.Equal("openai-compatible", result.Execution!.ProviderKind);
    }

    [Theory]
    [InlineData("copilot")]
    [InlineData("claude")]
    public async Task ExecuteAsync_SupportedBridgeProvider_PreservesConfiguredProviderKind(string providerKind)
    {
        await PrepareInitializedWorkspaceAsync();
        var handler = new CapturingFakeHttpMessageHandler(BuildMinimalRefinementJson());
        var provider = new OpenAiCompatiblePhaseExecutionProvider(
            new HttpClient(handler),
            new OpenAiCompatibleProviderOptions(
                ModelProfiles:
                [
                    new OpenAiCompatibleModelProfile(
                        Name: "bridge",
                        Provider: providerKind,
                        BaseUrl: "https://api.example.test/v1",
                        ApiKey: "secret",
                        Model: "model-1",
                        RepositoryAccess: "read-write")
                ],
                PhaseModelAssignments: new OpenAiCompatiblePhaseModelAssignments(
                    DefaultProfile: "bridge")));
        var context = new PhaseExecutionContext(
            WorkspaceRoot: workspaceRoot,
            UsId: "US-0001",
            PhaseId: PhaseId.Refinement,
            UserStoryPath: Path.Combine(workspaceRoot, ".specs", "us", "workflow", "US-0001", "us.md"),
            PreviousArtifactPaths: new Dictionary<PhaseId, string>(),
            ContextFilePaths: []);

        var result = await provider.ExecuteAsync(context);

        Assert.NotNull(result.Execution);
        Assert.Equal(providerKind, result.Execution!.ProviderKind);
    }

    [Fact]
    public async Task ExecuteAsync_CodexProvider_UsesNativeCodexRunnerForImplementation()
    {
        await PrepareInitializedWorkspaceAsync();
        var fakeRunner = new FakeCodexCliRunner(isAvailable: true, responseJson: BuildMinimalImplementationJson());
        var provider = new OpenAiCompatiblePhaseExecutionProvider(
            new HttpClient(new ThrowingHttpMessageHandler()),
            CreateOptions(
                model: string.Empty,
                providerKind: "codex",
                baseUrl: string.Empty,
                apiKey: string.Empty,
                repositoryAccess: "read-write"),
            new RepositoryPromptCatalog(),
            fakeRunner);
        var context = new PhaseExecutionContext(
            WorkspaceRoot: workspaceRoot,
            UsId: "US-0001",
            PhaseId: PhaseId.Implementation,
            UserStoryPath: Path.Combine(workspaceRoot, ".specs", "us", "workflow", "US-0001", "us.md"),
            PreviousArtifactPaths: new Dictionary<PhaseId, string>(),
            ContextFilePaths: []);

        var result = await provider.ExecuteAsync(context);

        Assert.Equal("codex", result.ExecutionKind);
        Assert.NotNull(result.Execution);
        Assert.Equal("codex", result.Execution!.ProviderKind);
        Assert.Equal("default", result.Execution.Model);
        Assert.NotNull(fakeRunner.LastInvocation);
        Assert.Equal("workspace-write", fakeRunner.LastInvocation!.SandboxMode);
        Assert.Contains("SpecForge Native Codex Execution", fakeRunner.LastInvocation.Prompt);
        Assert.Contains("Make the required repository changes", fakeRunner.LastInvocation.Prompt);
        Assert.Contains("# Implementation · US-0001 · v01", result.Content);
    }

    [Fact]
    public void Constructor_CodexProfileWithoutEndpointConfiguration_DoesNotThrow()
    {
        var provider = new OpenAiCompatiblePhaseExecutionProvider(
            new HttpClient(new CapturingFakeHttpMessageHandler()),
            CreateOptions(
                model: string.Empty,
                providerKind: "codex",
                baseUrl: string.Empty,
                apiKey: string.Empty));

        Assert.NotNull(provider);
    }

    [Fact]
    public async Task ExecuteAsync_ClarificationOk_NormalizesToCanonicalReadyArtifact()
    {
        await PrepareInitializedWorkspaceAsync();
        var handler = new CapturingFakeHttpMessageHandler(BuildReadyClarificationJson());
        var provider = new OpenAiCompatiblePhaseExecutionProvider(
            new HttpClient(handler),
            CreateOptions(model: "llama3.1"));
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
    public async Task ExecuteAsync_ClarificationNeedsClarification_RendersMarkdownArtifactFromStructuredResponse()
    {
        await PrepareInitializedWorkspaceAsync();
        var handler = new CapturingFakeHttpMessageHandler(
            """
            {
              "state": "pending_user_input",
              "decision": "needs_clarification",
              "reason": "Missing actor and acceptance details.",
              "questions": [
                "Who performs the action?"
              ]
            }
            """
        );
        var provider = new OpenAiCompatiblePhaseExecutionProvider(
            new HttpClient(handler),
            CreateOptions(model: "llama3.1"));
        var context = new PhaseExecutionContext(
            WorkspaceRoot: workspaceRoot,
            UsId: "US-0001",
            PhaseId: PhaseId.Clarification,
            UserStoryPath: Path.Combine(workspaceRoot, ".specs", "us", "workflow", "US-0001", "us.md"),
            PreviousArtifactPaths: new Dictionary<PhaseId, string>(),
            ContextFilePaths: []);

        var result = await provider.ExecuteAsync(context);

        Assert.StartsWith("# Clarification · US-0001 · v01", result.Content);
        Assert.Contains("needs_clarification", result.Content);
        Assert.Contains("## Questions", result.Content);
    }

    [Fact]
    public async Task ExecuteAsync_RefinementMarkdownPayload_ThrowsInsteadOfBackfillingPlaceholderSpec()
    {
        await PrepareInitializedWorkspaceAsync();
        var handler = new CapturingFakeHttpMessageHandler("# generated markdown");
        var provider = new OpenAiCompatiblePhaseExecutionProvider(
            new HttpClient(handler),
            CreateOptions(model: "llama3.1"));
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
            CreateOptions(
                baseUrl: "https://api.example.test/v1",
                model: "gpt-test")));

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
            CreateOptions(
                model: "llama3.1",
                apiKey: "ollama-local"));
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

    private static string ReadResponseFormatType(string requestBody)
    {
        using var document = JsonDocument.Parse(requestBody);
        return document.RootElement.GetProperty("response_format").GetProperty("type").GetString() ?? string.Empty;
    }

    private static string ReadResponseSchemaName(string requestBody)
    {
        using var document = JsonDocument.Parse(requestBody);
        return document.RootElement.GetProperty("response_format").GetProperty("json_schema").GetProperty("name").GetString() ?? string.Empty;
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

    private static OpenAiCompatibleProviderOptions CreateOptions(
        string model,
        string profileName = "default",
        string baseUrl = "http://localhost:11434/v1",
        string apiKey = "",
        string clarificationTolerance = "balanced",
        string reviewTolerance = "balanced",
        string repositoryAccess = "read-write",
        string providerKind = "openai-compatible")
    {
        return new OpenAiCompatibleProviderOptions(
            ClarificationTolerance: clarificationTolerance,
            ReviewTolerance: reviewTolerance,
            ModelProfiles:
            [
                new OpenAiCompatibleModelProfile(
                    Name: profileName,
                    Provider: providerKind,
                    BaseUrl: baseUrl,
                    ApiKey: apiKey,
                    Model: model,
                    RepositoryAccess: repositoryAccess)
            ],
            PhaseModelAssignments: new OpenAiCompatiblePhaseModelAssignments(
                DefaultProfile: profileName));
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

    private sealed class ThrowingHttpMessageHandler : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken) =>
            throw new InvalidOperationException("HTTP transport should not be used for native Codex execution.");
    }

    private sealed class FakeCodexCliRunner : OpenAiCompatiblePhaseExecutionProvider.ICodexCliRunner
    {
        private readonly string responseJson;

        public FakeCodexCliRunner(bool isAvailable, string responseJson = "{}")
        {
            IsAvailable = isAvailable;
            this.responseJson = responseJson;
        }

        public bool IsAvailable { get; }

        public OpenAiCompatiblePhaseExecutionProvider.CodexCliInvocation? LastInvocation { get; private set; }

        public Task<string> ExecuteAsync(OpenAiCompatiblePhaseExecutionProvider.CodexCliInvocation invocation, CancellationToken cancellationToken)
        {
            LastInvocation = invocation;
            return Task.FromResult(responseJson);
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

    private static string BuildReadyClarificationJson() =>
        """
        {
          "state": "ready",
          "decision": "ready_for_refinement",
          "reason": "The user story is concrete enough to proceed to refinement.",
          "questions": []
        }
        """;

    private static string BuildMinimalReviewJson() =>
        """
        {
          "result": "pass",
          "checksPerformed": [
            "Spec artifact present: true",
            "Technical design artifact present: true",
            "Implementation artifact present: true"
          ],
          "findings": [
            "No material deviations were detected in the current artifact set."
          ],
          "primaryReason": "All required workflow artifacts are present and coherent.",
          "recommendation": [
            "Advance to `release_approval`."
          ]
        }
        """;

    private static string BuildMinimalImplementationJson() =>
        """
        {
          "state": "generated",
          "basedOn": "02-technical-design.md",
          "implementedObjective": "Persist the implementation plan derived from the technical design.",
          "plannedOrExecutedChanges": [
            "Update workflow orchestration logic.",
            "Persist resulting state and derived artifacts.",
            "Expose the action through the selected backend boundary."
          ],
          "plannedVerification": [
            "Domain tests must cover the transition and persistence path.",
            "Extension feedback must reflect the generated artifact and new phase."
          ]
        }
        """;
}
