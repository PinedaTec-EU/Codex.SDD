using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using SpecForge.Domain.Application;

namespace SpecForge.OpenAICompatible;

public sealed class OpenAiCompatiblePhaseExecutionProvider : IPhaseExecutionProvider
{
    private readonly HttpClient httpClient;
    private readonly OpenAiCompatibleProviderOptions options;

    public OpenAiCompatiblePhaseExecutionProvider(
        HttpClient httpClient,
        OpenAiCompatibleProviderOptions options)
    {
        this.httpClient = httpClient ?? throw new ArgumentNullException(nameof(httpClient));
        this.options = options ?? throw new ArgumentNullException(nameof(options));

        if (string.IsNullOrWhiteSpace(options.BaseUrl))
        {
            throw new ArgumentException("BaseUrl is required.", nameof(options));
        }

        if (string.IsNullOrWhiteSpace(options.ApiKey))
        {
            throw new ArgumentException("ApiKey is required.", nameof(options));
        }

        if (string.IsNullOrWhiteSpace(options.Model))
        {
            throw new ArgumentException("Model is required.", nameof(options));
        }
    }

    public async Task<PhaseExecutionResult> ExecuteAsync(
        PhaseExecutionContext context,
        CancellationToken cancellationToken = default)
    {
        var request = BuildRequest(context);
        using var response = await httpClient.SendAsync(request, cancellationToken);
        var payload = await response.Content.ReadAsStringAsync(cancellationToken);

        if (!response.IsSuccessStatusCode)
        {
            throw new InvalidOperationException(
                $"OpenAI-compatible provider call failed with status {(int)response.StatusCode}: {payload}");
        }

        using var document = JsonDocument.Parse(payload);
        var content = document.RootElement
            .GetProperty("choices")[0]
            .GetProperty("message")
            .GetProperty("content")
            .GetString();

        if (string.IsNullOrWhiteSpace(content))
        {
            throw new InvalidOperationException("OpenAI-compatible provider returned an empty content payload.");
        }

        return new PhaseExecutionResult(content.Trim(), ExecutionKind: "openai-compatible");
    }

    private HttpRequestMessage BuildRequest(PhaseExecutionContext context)
    {
        var endpoint = $"{options.BaseUrl.TrimEnd('/')}/chat/completions";
        var userPrompt = BuildUserPrompt(context);
        var messages = new List<object>();

        if (!string.IsNullOrWhiteSpace(options.SystemPrompt))
        {
            messages.Add(new
            {
                role = "system",
                content = options.SystemPrompt
            });
        }

        messages.Add(new
        {
            role = "user",
            content = userPrompt
        });

        var requestBody = JsonSerializer.Serialize(new
        {
            model = options.Model,
            messages,
            temperature = 0.2
        });

        var request = new HttpRequestMessage(HttpMethod.Post, endpoint)
        {
            Content = new StringContent(requestBody, Encoding.UTF8, "application/json")
        };

        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", options.ApiKey);
        return request;
    }

    private static string BuildUserPrompt(PhaseExecutionContext context)
    {
        var builder = new StringBuilder()
            .AppendLine("Generate the markdown artifact for the requested SpecForge phase.")
            .AppendLine("Return only markdown.")
            .AppendLine()
            .AppendLine($"US ID: {context.UsId}")
            .AppendLine($"Phase: {context.PhaseId}")
            .AppendLine($"User story path: {context.UserStoryPath}")
            .AppendLine();

        if (context.PreviousArtifactPaths.Count > 0)
        {
            builder.AppendLine("Previous artifacts:");

            foreach (var previousArtifact in context.PreviousArtifactPaths.OrderBy(static item => item.Key))
            {
                builder
                    .AppendLine($"- {previousArtifact.Key}: {previousArtifact.Value}");
            }

            builder.AppendLine();
        }

        builder.AppendLine("Use the available workspace artifacts as the source of truth and keep the result aligned with the current phase contract.");
        return builder.ToString();
    }
}
