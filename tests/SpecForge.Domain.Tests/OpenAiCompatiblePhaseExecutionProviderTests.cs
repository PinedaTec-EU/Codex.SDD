using System.Net;
using System.Net.Http;
using System.Text;
using SpecForge.Domain.Application;
using SpecForge.Domain.Workflow;
using SpecForge.OpenAICompatible;

namespace SpecForge.Domain.Tests;

public sealed class OpenAiCompatiblePhaseExecutionProviderTests
{
    [Fact]
    public async Task ExecuteAsync_SendsOpenAiCompatibleRequestAndParsesMarkdown()
    {
        var handler = new CapturingFakeHttpMessageHandler();
        var httpClient = new HttpClient(handler);
        var provider = new OpenAiCompatiblePhaseExecutionProvider(
            httpClient,
            new OpenAiCompatibleProviderOptions(
                BaseUrl: "http://localhost:11434/v1",
                ApiKey: "ollama-local",
                Model: "llama3.1"));
        var context = new PhaseExecutionContext(
            UsId: "US-0001",
            PhaseId: PhaseId.Refinement,
            UserStoryPath: ".specs/us/us.US-0001/us.md",
            PreviousArtifactPaths: new Dictionary<PhaseId, string>());

        var result = await provider.ExecuteAsync(context);

        Assert.Equal("openai-compatible", result.ExecutionKind);
        Assert.Equal("# generated markdown", result.Content);
        Assert.NotNull(handler.LastRequest);
        Assert.Equal(HttpMethod.Post, handler.LastRequest!.Method);
        Assert.Equal("http://localhost:11434/v1/chat/completions", handler.LastRequest.RequestUri!.ToString());
        Assert.Equal("Bearer", handler.LastRequest.Headers.Authorization?.Scheme);
        Assert.Equal("ollama-local", handler.LastRequest.Headers.Authorization?.Parameter);
        Assert.Contains("\"model\":\"llama3.1\"", handler.LastBody);
    }

    private sealed class CapturingFakeHttpMessageHandler : HttpMessageHandler
    {
        public HttpRequestMessage? LastRequest { get; private set; }

        public string LastBody { get; private set; } = string.Empty;

        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            LastRequest = request;
            LastBody = await request.Content!.ReadAsStringAsync(cancellationToken);

            var payload = """
                {
                  "choices": [
                    {
                      "message": {
                        "content": "# generated markdown"
                      }
                    }
                  ]
                }
                """;

            return new HttpResponseMessage(HttpStatusCode.OK)
            {
                Content = new StringContent(payload, Encoding.UTF8, "application/json")
            };
        }
    }
}
