using System.Collections.Concurrent;
using System.Net;
using System.Net.Http;
using System.Net.Sockets;
using System.Text;
using System.Text.Json;
using SpecForge.Domain.Application;
using SpecForge.Domain.Persistence;
using SpecForge.OpenAICompatible;

namespace SpecForge.Domain.Tests;

public sealed class OpenAiCompatibleWorkflowIntegrationTests : IDisposable
{
    private readonly string workspaceRoot = Path.Combine(Path.GetTempPath(), Guid.NewGuid().ToString("N"));

    [Fact]
    public async Task GenerateNextPhaseAsync_TransitionsFromCaptureToClarificationThenRefinement_ThroughHttpModelStub()
    {
        await new RepositoryPromptInitializer().InitializeAsync(workspaceRoot);

        using var modelStub = new OpenAiCompatibleModelStubServer(
        [
            """
            needs_clarification

            # Clarification · US-0001 · v01

            ## State
            - State: `pending_user_input`

            ## Decision
            needs_clarification

            ## Reason
            The story does not identify who publishes the article or how bilingual content is selected.

            ## Questions
            1. Which role publishes the article?
            2. How is the language selected for the rendered article?
            """,
            "ok",
            """
            # Refinement · US-0001 · v01

            ## Goal
            Persist LinkedIn article content in `articles.json` and render both Spanish and English variants.

            ## Acceptance Criteria
            - Articles can be loaded from `articles.json`.
            - The page renders Spanish and English versions of the article content.
            - The article can be selected by slug and locale.
            """
        ]);

        var provider = new OpenAiCompatiblePhaseExecutionProvider(
            new HttpClient(),
            new OpenAiCompatibleProviderOptions(
                BaseUrl: $"{modelStub.BaseUrl}/v1",
                ApiKey: string.Empty,
                Model: "stub-model",
                ClarificationTolerance: "inferential"));
        var workflowRunner = new WorkflowRunner(provider);
        var applicationService = new SpecForgeApplicationService(
            new UserStoryFileStore(),
            workflowRunner,
            new RepositoryPromptInitializer(),
            new RepositoryCategoryCatalog(),
            new UserStoryRuntimeStatusStore());

        await applicationService.CreateUserStoryAsync(
            workspaceRoot,
            "US-0001",
            "Incorporar articulo bilingue",
            "feature",
            "workflow",
            "Como editor quiero publicar un articulo bilingue en LinkedIn para mostrarlo en la landing.");

        var clarificationResult = await applicationService.GenerateNextPhaseAsync(workspaceRoot, "US-0001");
        Assert.Equal("clarification", clarificationResult.CurrentPhase);
        Assert.Equal("waiting-user", clarificationResult.Status);

        var clarificationWorkflow = await applicationService.GetUserStoryWorkflowAsync(workspaceRoot, "US-0001");
        Assert.Equal("clarification", clarificationWorkflow.CurrentPhase);
        Assert.Equal("waiting-user", clarificationWorkflow.Status);
        Assert.NotNull(clarificationWorkflow.Clarification);
        Assert.Equal("needs_clarification", clarificationWorkflow.Clarification!.Status);
        Assert.Equal(2, clarificationWorkflow.Clarification.Items.Count);
        Assert.Contains(clarificationWorkflow.Phases, phase => phase.PhaseId == "clarification" && phase.IsCurrent && phase.State == "current");
        Assert.Contains(clarificationWorkflow.Events, timelineEvent => timelineEvent.Code == "clarification_requested");

        await applicationService.SubmitClarificationAnswersAsync(
            workspaceRoot,
            "US-0001",
            [
                "El editor de marketing publica el articulo.",
                "La landing selecciona el idioma por locale (`es` o `en`) en la ruta."
            ]);

        var refinementResult = await applicationService.GenerateNextPhaseAsync(workspaceRoot, "US-0001");
        Assert.Equal("refinement", refinementResult.CurrentPhase);
        Assert.Equal("waiting-user", refinementResult.Status);
        Assert.NotNull(refinementResult.GeneratedArtifactPath);
        Assert.EndsWith("01-refinement.md", refinementResult.GeneratedArtifactPath, StringComparison.Ordinal);

        var refinementWorkflow = await applicationService.GetUserStoryWorkflowAsync(workspaceRoot, "US-0001");
        Assert.Equal("refinement", refinementWorkflow.CurrentPhase);
        Assert.Equal("waiting-user", refinementWorkflow.Status);
        Assert.NotNull(refinementWorkflow.Clarification);
        Assert.Equal("ready_for_refinement", refinementWorkflow.Clarification!.Status);
        Assert.Contains(refinementWorkflow.Phases, phase => phase.PhaseId == "clarification" && phase.State == "completed");
        Assert.Contains(refinementWorkflow.Phases, phase => phase.PhaseId == "refinement" && phase.IsCurrent && phase.State == "current");
        Assert.Contains(refinementWorkflow.Events, timelineEvent => timelineEvent.Code == "clarification_passed");
        Assert.Contains(refinementWorkflow.Events, timelineEvent => timelineEvent.Code == "phase_completed" && timelineEvent.Phase == "refinement");

        Assert.Equal(3, modelStub.Requests.Count);
        Assert.All(modelStub.Requests, request => Assert.Equal("/v1/chat/completions", request.Path));
        Assert.Equal(0.4d, ExtractTemperature(modelStub.Requests[0].Body));
        Assert.Equal(0.4d, ExtractTemperature(modelStub.Requests[1].Body));
        Assert.Equal(0.2d, ExtractTemperature(modelStub.Requests[2].Body));
        Assert.Contains("Role: clarification analyst.", ExtractUserPrompt(modelStub.Requests[0].Body));
        Assert.Contains("- Phase: `Clarification`", ExtractUserPrompt(modelStub.Requests[0].Body));
        Assert.Contains("Active tolerance: `inferential`", ExtractUserPrompt(modelStub.Requests[0].Body));
        Assert.Contains("Role: clarification analyst.", ExtractUserPrompt(modelStub.Requests[1].Body));
        Assert.Contains("- Phase: `Clarification`", ExtractUserPrompt(modelStub.Requests[1].Body));
        Assert.Contains("Role: refinement analyst.", ExtractUserPrompt(modelStub.Requests[2].Body));
        Assert.Contains("- Phase: `Refinement`", ExtractUserPrompt(modelStub.Requests[2].Body));
        Assert.Contains("## Clarification Log", ExtractUserPrompt(modelStub.Requests[1].Body));
        Assert.Contains("El editor de marketing publica el articulo.", ExtractUserPrompt(modelStub.Requests[1].Body));
    }

    public void Dispose()
    {
        if (Directory.Exists(workspaceRoot))
        {
            Directory.Delete(workspaceRoot, recursive: true);
        }
    }

    private static string ExtractUserPrompt(string requestBody)
    {
        using var document = JsonDocument.Parse(requestBody);
        var messages = document.RootElement.GetProperty("messages");
        return messages
            .EnumerateArray()
            .First(message => string.Equals(message.GetProperty("role").GetString(), "user", StringComparison.Ordinal))
            .GetProperty("content")
            .GetString() ?? string.Empty;
    }

    private static double ExtractTemperature(string requestBody)
    {
        using var document = JsonDocument.Parse(requestBody);
        return document.RootElement.GetProperty("temperature").GetDouble();
    }

    private sealed class OpenAiCompatibleModelStubServer : IDisposable
    {
        private readonly HttpListener listener;
        private readonly CancellationTokenSource shutdown = new();
        private readonly Task serverLoop;
        private readonly ConcurrentQueue<string> queuedResponses;
        private readonly ConcurrentQueue<CapturedRequest> capturedRequests = new();

        public OpenAiCompatibleModelStubServer(IEnumerable<string> responses)
        {
            queuedResponses = new ConcurrentQueue<string>(responses);
            var port = GetAvailablePort();
            BaseUrl = $"http://127.0.0.1:{port}";
            listener = new HttpListener();
            listener.Prefixes.Add($"{BaseUrl}/");
            listener.Start();
            serverLoop = Task.Run(() => RunAsync(shutdown.Token));
        }

        public string BaseUrl { get; }

        public IReadOnlyList<CapturedRequest> Requests => capturedRequests.ToArray();

        public void Dispose()
        {
            shutdown.Cancel();
            if (listener.IsListening)
            {
                listener.Stop();
            }

            listener.Close();

            try
            {
                serverLoop.GetAwaiter().GetResult();
            }
            catch (HttpListenerException)
            {
                // Listener shutdown races are expected during disposal.
            }
            catch (OperationCanceledException)
            {
                // Expected during disposal.
            }
        }

        private async Task RunAsync(CancellationToken cancellationToken)
        {
            while (!cancellationToken.IsCancellationRequested)
            {
                HttpListenerContext? context = null;
                try
                {
                    context = await listener.GetContextAsync();
                }
                catch (HttpListenerException) when (cancellationToken.IsCancellationRequested || !listener.IsListening)
                {
                    return;
                }
                catch (ObjectDisposedException) when (cancellationToken.IsCancellationRequested)
                {
                    return;
                }

                await HandleAsync(context, cancellationToken);
            }
        }

        private async Task HandleAsync(HttpListenerContext context, CancellationToken cancellationToken)
        {
            using var reader = new StreamReader(
                context.Request.InputStream,
                context.Request.ContentEncoding ?? Encoding.UTF8,
                detectEncodingFromByteOrderMarks: true,
                leaveOpen: false);
            var body = await reader.ReadToEndAsync(cancellationToken);
            capturedRequests.Enqueue(new CapturedRequest(context.Request.RawUrl ?? string.Empty, body));

            if (!queuedResponses.TryDequeue(out var responseContent))
            {
                context.Response.StatusCode = (int)HttpStatusCode.InternalServerError;
                await WriteResponseAsync(context.Response, "{\"error\":\"No stubbed response available.\"}", cancellationToken);
                return;
            }

            var payload = JsonSerializer.Serialize(new
            {
                usage = new
                {
                    prompt_tokens = 111,
                    completion_tokens = 222,
                    total_tokens = 333
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

            context.Response.StatusCode = (int)HttpStatusCode.OK;
            context.Response.ContentType = "application/json";
            await WriteResponseAsync(context.Response, payload, cancellationToken);
        }

        private static async Task WriteResponseAsync(HttpListenerResponse response, string payload, CancellationToken cancellationToken)
        {
            var bytes = Encoding.UTF8.GetBytes(payload);
            response.ContentLength64 = bytes.Length;
            await response.OutputStream.WriteAsync(bytes, cancellationToken);
            response.OutputStream.Close();
        }

        private static int GetAvailablePort()
        {
            using var listener = new TcpListener(IPAddress.Loopback, 0);
            listener.Start();
            return ((IPEndPoint)listener.LocalEndpoint).Port;
        }
    }

    private sealed record CapturedRequest(string Path, string Body);
}
