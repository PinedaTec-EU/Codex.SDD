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
    public async Task ExecuteAsync_SendsOpenAiCompatibleRequestAndParsesMarkdown()
    {
        await PrepareInitializedWorkspaceAsync();
        var handler = new CapturingFakeHttpMessageHandler();
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
            UserStoryPath: Path.Combine(workspaceRoot, ".specs", "us", "us.US-0001", "us.md"),
            PreviousArtifactPaths: new Dictionary<PhaseId, string>(),
            ContextFilePaths: []);

        var result = await provider.ExecuteAsync(context);

        Assert.Equal("openai-compatible", result.ExecutionKind);
        Assert.Equal("# generated markdown", result.Content);
        Assert.NotNull(result.Usage);
        Assert.Equal(120, result.Usage!.InputTokens);
        Assert.Equal(48, result.Usage.OutputTokens);
        Assert.Equal(168, result.Usage.TotalTokens);
        Assert.NotNull(handler.LastRequest);
        Assert.Equal(HttpMethod.Post, handler.LastRequest!.Method);
        Assert.Equal("http://localhost:11434/v1/chat/completions", handler.LastRequest.RequestUri!.ToString());
        Assert.Equal("Bearer", handler.LastRequest.Headers.Authorization?.Scheme);
        Assert.Equal("ollama-local", handler.LastRequest.Headers.Authorization?.Parameter);
        Assert.Contains("\"model\":\"llama3.1\"", handler.LastBody);
        Assert.Contains("Role: refinement analyst.", handler.LastBody);
        Assert.Contains("Initial text", handler.LastBody);
    }

    [Fact]
    public async Task ExecuteAsync_IncludesContextFileContentsInRuntimeContext()
    {
        await PrepareInitializedWorkspaceAsync();
        var attachmentDirectory = Path.Combine(workspaceRoot, ".specs", "us", "us.US-0001", "context");
        Directory.CreateDirectory(attachmentDirectory);
        var attachmentPath = Path.Combine(attachmentDirectory, "notes.md");
        await File.WriteAllTextAsync(attachmentPath, "# Notes\nUseful attachment");
        var handler = new CapturingFakeHttpMessageHandler();
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
            UserStoryPath: Path.Combine(workspaceRoot, ".specs", "us", "us.US-0001", "us.md"),
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
        var handler = new CapturingFakeHttpMessageHandler();
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
            UserStoryPath: Path.Combine(workspaceRoot, ".specs", "us", "us.US-0001", "us.md"),
            PreviousArtifactPaths: new Dictionary<PhaseId, string>(),
            ContextFilePaths: []);

        var result = await provider.ExecuteAsync(context);

        Assert.Equal("openai-compatible", result.ExecutionKind);
        Assert.Null(handler.LastRequest!.Headers.Authorization);
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
            UserStoryPath: Path.Combine(workspaceRoot, ".specs", "us", "us.US-0001", "us.md"),
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
            UserStoryPath: Path.Combine(workspaceRoot, ".specs", "us", "us.US-0001", "us.md"),
            PreviousArtifactPaths: new Dictionary<PhaseId, string>(),
            ContextFilePaths: []);

        var result = await provider.ExecuteAsync(context);

        Assert.DoesNotContain("needs_clarification\n\n# Clarification", result.Content);
        Assert.StartsWith("# Clarification · US-0001 · v01", result.Content);
        Assert.Contains("## Questions", result.Content);
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
        Directory.CreateDirectory(Path.Combine(workspaceRoot, ".specs", "us", "us.US-0001"));
        await File.WriteAllTextAsync(
            Path.Combine(workspaceRoot, ".specs", "us", "us.US-0001", "us.md"),
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
            UserStoryPath: Path.Combine(workspaceRoot, ".specs", "us", "us.US-0001", "us.md"),
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

        var paths = UserStoryFilePaths.FromWorkspaceRoot(workspaceRoot, "US-0001");
        Directory.CreateDirectory(paths.RootDirectory);
        await File.WriteAllTextAsync(paths.MainArtifactPath, "# US-0001\n\n## Objective\nInitial text");
    }

    private sealed class CapturingFakeHttpMessageHandler : HttpMessageHandler
    {
        private readonly string responseContent;

        public CapturingFakeHttpMessageHandler(string responseContent = "# generated markdown")
        {
            this.responseContent = responseContent;
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
}
