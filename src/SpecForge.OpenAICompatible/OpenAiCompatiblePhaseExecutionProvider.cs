using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using SpecForge.Domain.Application;
using SpecForge.Domain.Persistence;
using SpecForge.Domain.Workflow;

namespace SpecForge.OpenAICompatible;

public sealed class OpenAiCompatiblePhaseExecutionProvider : IPhaseExecutionProvider
{
    private const string StrictTolerance = "strict";
    private const string BalancedTolerance = "balanced";
    private const string InferentialTolerance = "inferential";
    private readonly HttpClient httpClient;
    private readonly OpenAiCompatibleProviderOptions options;
    private readonly RepositoryPromptCatalog promptCatalog;

    public OpenAiCompatiblePhaseExecutionProvider(
        HttpClient httpClient,
        OpenAiCompatibleProviderOptions options)
        : this(httpClient, options, new RepositoryPromptCatalog())
    {
    }

    internal OpenAiCompatiblePhaseExecutionProvider(
        HttpClient httpClient,
        OpenAiCompatibleProviderOptions options,
        RepositoryPromptCatalog promptCatalog)
    {
        this.httpClient = httpClient ?? throw new ArgumentNullException(nameof(httpClient));
        this.options = options ?? throw new ArgumentNullException(nameof(options));
        this.promptCatalog = promptCatalog ?? throw new ArgumentNullException(nameof(promptCatalog));

        if (string.IsNullOrWhiteSpace(options.BaseUrl))
        {
            throw new ArgumentException("BaseUrl is required.", nameof(options));
        }

        if (RequiresApiKey(options.BaseUrl) && string.IsNullOrWhiteSpace(options.ApiKey))
        {
            throw new ArgumentException("ApiKey is required.", nameof(options));
        }

        if (string.IsNullOrWhiteSpace(options.Model))
        {
            throw new ArgumentException("Model is required.", nameof(options));
        }

        if (!IsSupportedTolerance(options.ClarificationTolerance))
        {
            throw new ArgumentException(
                "ClarificationTolerance must be one of: strict, balanced, inferential.",
                nameof(options));
        }

        if (!IsSupportedTolerance(options.ReviewTolerance))
        {
            throw new ArgumentException(
                "ReviewTolerance must be one of: strict, balanced, inferential.",
                nameof(options));
        }
    }

    public async Task<PhaseExecutionResult> ExecuteAsync(
        PhaseExecutionContext context,
        CancellationToken cancellationToken = default)
    {
        promptCatalog.EnsureRepositoryIsInitialized(context.WorkspaceRoot);

        var prompt = await BuildEffectivePromptAsync(context, cancellationToken);
        var request = BuildRequest(context, prompt.SystemPrompt, prompt.UserPrompt);
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
        var usage = TryReadUsage(document.RootElement);

        if (string.IsNullOrWhiteSpace(content))
        {
            throw new InvalidOperationException("OpenAI-compatible provider returned an empty content payload.");
        }

        var normalizedContent = NormalizePhaseContent(context, content.Trim());
        return new PhaseExecutionResult(normalizedContent, ExecutionKind: "openai-compatible", usage);
    }

    private HttpRequestMessage BuildRequest(PhaseExecutionContext context, string systemPrompt, string userPrompt)
    {
        var endpoint = $"{options.BaseUrl.TrimEnd('/')}/chat/completions";
        var messages = new List<object>();

        if (!string.IsNullOrWhiteSpace(systemPrompt))
        {
            messages.Add(new
            {
                role = "system",
                content = systemPrompt
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
            temperature = ResolveTemperature(context.PhaseId)
        });

        var request = new HttpRequestMessage(HttpMethod.Post, endpoint)
        {
            Content = new StringContent(requestBody, Encoding.UTF8, "application/json")
        };

        if (!string.IsNullOrWhiteSpace(options.ApiKey))
        {
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", options.ApiKey);
        }

        return request;
    }

    private async Task<EffectivePrompt> BuildEffectivePromptAsync(
        PhaseExecutionContext context,
        CancellationToken cancellationToken)
    {
        var paths = new PromptFilePaths(context.WorkspaceRoot);
        var phasePromptPath = promptCatalog.GetExecutePromptPath(context.WorkspaceRoot, context.PhaseId);
        var sharedSystemPrompt = await File.ReadAllTextAsync(paths.SharedSystemPromptPath, cancellationToken);
        var sharedStylePrompt = await File.ReadAllTextAsync(paths.SharedStylePromptPath, cancellationToken);
        var sharedOutputRulesPrompt = await File.ReadAllTextAsync(paths.SharedOutputRulesPromptPath, cancellationToken);
        var phasePrompt = await File.ReadAllTextAsync(phasePromptPath, cancellationToken);
        var userStory = await File.ReadAllTextAsync(context.UserStoryPath, cancellationToken);
        var clarificationLogPath = Path.Combine(Path.GetDirectoryName(context.UserStoryPath)!, "clarification.md");
        var systemPrompt = string.Join(
            $"{Environment.NewLine}{Environment.NewLine}",
            new[]
            {
                options.SystemPrompt,
                sharedSystemPrompt.Trim(),
                sharedStylePrompt.Trim(),
                sharedOutputRulesPrompt.Trim()
            }.Where(static part => !string.IsNullOrWhiteSpace(part)));

        var builder = new StringBuilder()
            .AppendLine(phasePrompt.Trim())
            .AppendLine()
            .AppendLine("## Runtime Context")
            .AppendLine();

        builder
            .AppendLine($"- Workspace root: `{context.WorkspaceRoot}`")
            .AppendLine($"- US ID: `{context.UsId}`")
            .AppendLine($"- Phase: `{context.PhaseId}`")
            .AppendLine($"- User story path: `{context.UserStoryPath}`")
            .AppendLine();

        builder
            .AppendLine("## User Story")
            .AppendLine()
            .AppendLine(userStory.Trim())
            .AppendLine();

        if (File.Exists(clarificationLogPath))
        {
            var clarificationLog = await File.ReadAllTextAsync(clarificationLogPath, cancellationToken);
            if (!string.IsNullOrWhiteSpace(clarificationLog))
            {
                builder
                    .AppendLine("## Clarification Log")
                    .AppendLine()
                    .AppendLine($"Path: `{clarificationLogPath}`")
                    .AppendLine()
                    .AppendLine(clarificationLog.Trim())
                    .AppendLine();
            }
        }

        if (context.PreviousArtifactPaths.Count > 0)
        {
            builder.AppendLine("## Previous Artifacts");
            builder.AppendLine();

            foreach (var previousArtifact in context.PreviousArtifactPaths.OrderBy(static item => item.Key))
            {
                var artifactContent = await File.ReadAllTextAsync(previousArtifact.Value, cancellationToken);
                builder
                    .AppendLine($"### {previousArtifact.Key}")
                    .AppendLine()
                    .AppendLine($"Path: `{previousArtifact.Value}`")
                    .AppendLine()
                    .AppendLine(artifactContent.Trim())
                    .AppendLine();
            }
        }

        if (context.ContextFilePaths.Count > 0)
        {
            builder.AppendLine("## Context Files");
            builder.AppendLine();

            foreach (var attachmentPath in context.ContextFilePaths.OrderBy(static path => path, StringComparer.Ordinal))
            {
                var attachmentContent = await File.ReadAllTextAsync(attachmentPath, cancellationToken);
                builder
                    .AppendLine($"### {Path.GetFileName(attachmentPath)}")
                    .AppendLine()
                    .AppendLine($"Path: `{attachmentPath}`")
                    .AppendLine()
                    .AppendLine(attachmentContent.Trim())
                    .AppendLine();
            }
        }

        if (!string.IsNullOrWhiteSpace(context.HumanInputPath) && File.Exists(context.HumanInputPath))
        {
            var humanInput = await File.ReadAllTextAsync(context.HumanInputPath, cancellationToken);
            if (!string.IsNullOrWhiteSpace(humanInput))
            {
                builder
                    .AppendLine("## Human Phase Input")
                    .AppendLine()
                    .AppendLine($"Path: `{context.HumanInputPath}`")
                    .AppendLine()
                    .AppendLine(humanInput.Trim())
                    .AppendLine();
            }
        }

        builder
            .AppendLine("## Execution Rules")
            .AppendLine()
            .AppendLine("- Use the repository artifacts as the source of truth.")
            .AppendLine("- Stay strictly inside the requested phase contract.")
            .AppendLine("- Return only the markdown artifact for the current phase.");

        if (context.PhaseId == PhaseId.Clarification)
        {
            builder
                .AppendLine()
                .AppendLine("## Clarification Tolerance")
                .AppendLine()
                .AppendLine($"- Active tolerance: `{options.ClarificationTolerance}`")
                .AppendLine($"- Guidance: {ResolveClarificationGuidance(options.ClarificationTolerance)}")
                .AppendLine()
                .AppendLine("## Internal Clarification Contract")
                .AppendLine()
                .AppendLine("The first non-empty line of your response is machine-validated and must be exactly one of:")
                .AppendLine("- `ok`")
                .AppendLine("- `needs_clarification`")
                .AppendLine()
                .AppendLine("If the story is ready for refinement, return exactly `ok` and nothing else.")
                .AppendLine("If the story still needs clarification, the first line must be `needs_clarification`, followed by a blank line and then the complete markdown artifact.")
                .AppendLine("Do not replace these tokens with synonyms, labels, prose, or code fences.");
        }

        if (context.PhaseId == PhaseId.Review)
        {
            builder
                .AppendLine()
                .AppendLine("## Review Tolerance")
                .AppendLine()
                .AppendLine($"- Active tolerance: `{options.ReviewTolerance}`")
                .AppendLine($"- Guidance: {ResolveReviewGuidance(options.ReviewTolerance)}");
        }

        return new EffectivePrompt(systemPrompt, builder.ToString().Trim());
    }

    private double ResolveTemperature(PhaseId phaseId) =>
        phaseId switch
        {
            PhaseId.Clarification => ResolveToleranceTemperature(options.ClarificationTolerance),
            PhaseId.Review => ResolveToleranceTemperature(options.ReviewTolerance),
            _ => 0.2d
        };

    private static double ResolveToleranceTemperature(string tolerance) =>
        NormalizeTolerance(tolerance) switch
        {
            StrictTolerance => 0.0d,
            BalancedTolerance => 0.2d,
            InferentialTolerance => 0.4d,
            _ => 0.2d
        };

    private static string ResolveClarificationGuidance(string tolerance) =>
        NormalizeTolerance(tolerance) switch
        {
            StrictTolerance =>
                "Be conservative. Ask for clarification whenever actor, trigger, business behavior, inputs, outputs, rules, or acceptance intent are materially ambiguous.",
            InferentialTolerance =>
                "Be permissive. Prefer `ready_for_refinement` when the core actor, outcome, and flow are understandable, and infer reasonable defaults unless a missing detail would likely invalidate refinement.",
            _ =>
                "Use balanced judgment. Ask only for gaps that would block a credible refinement, but do not invent business-critical facts."
        };

    private static string ResolveReviewGuidance(string tolerance) =>
        NormalizeTolerance(tolerance) switch
        {
            StrictTolerance =>
                "Be demanding. Surface weaker evidence, thinner validation, and smaller deviations as findings whenever they could undermine confidence in release readiness.",
            InferentialTolerance =>
                "Be pragmatic. Focus on material deviations, missing validation, or operational risks, and avoid blocking on minor imperfections that do not change the release decision.",
            _ =>
                "Use balanced judgment. Prioritize meaningful risks and missing evidence without inflating cosmetic or low-impact issues."
        };

    private static bool IsSupportedTolerance(string tolerance) =>
        NormalizeTolerance(tolerance) is StrictTolerance or BalancedTolerance or InferentialTolerance;

    private static string NormalizeTolerance(string tolerance) =>
        string.IsNullOrWhiteSpace(tolerance)
            ? BalancedTolerance
            : tolerance.Trim().ToLowerInvariant();

    private static string NormalizePhaseContent(PhaseExecutionContext context, string content)
    {
        if (context.PhaseId != PhaseId.Clarification)
        {
            return content;
        }

        var firstLine = GetFirstNonEmptyLine(content);
        if (string.Equals(firstLine, "ok", StringComparison.OrdinalIgnoreCase))
        {
            return BuildReadyForRefinementArtifact(context);
        }

        if (string.Equals(firstLine, "needs_clarification", StringComparison.OrdinalIgnoreCase))
        {
            var markdownBody = RemoveLeadingDecisionLine(content);
            if (string.IsNullOrWhiteSpace(markdownBody))
            {
                throw new InvalidOperationException(
                    "Clarification response declared 'needs_clarification' but did not include a markdown artifact body.");
            }

            return markdownBody;
        }

        if (content.Contains("## Decision", StringComparison.Ordinal))
        {
            return content;
        }

        throw new InvalidOperationException(
            "Clarification response did not start with 'ok' or 'needs_clarification', and no fallback markdown decision section was found.");
    }

    private static string BuildReadyForRefinementArtifact(PhaseExecutionContext context) =>
        string.Join(
            Environment.NewLine,
            new[]
            {
                $"# Clarification · {context.UsId} · v01",
                string.Empty,
                "## State",
                "- State: `ready`",
                string.Empty,
                "## Decision",
                "ready_for_refinement",
                string.Empty,
                "## Reason",
                "The current user story is concrete enough to proceed to refinement.",
                string.Empty,
                "## Questions",
                "1. No clarification questions remain."
            }) + Environment.NewLine;

    private static string GetFirstNonEmptyLine(string content) =>
        content
            .Split(['\r', '\n'], StringSplitOptions.RemoveEmptyEntries)
            .Select(static line => line.Trim())
            .FirstOrDefault(static line => line.Length > 0)
        ?? string.Empty;

    private static string RemoveLeadingDecisionLine(string content)
    {
        using var reader = new StringReader(content);
        var builder = new StringBuilder();
        var skippedDecisionLine = false;
        string? line;

        while ((line = reader.ReadLine()) is not null)
        {
            if (!skippedDecisionLine)
            {
                if (string.IsNullOrWhiteSpace(line))
                {
                    continue;
                }

                skippedDecisionLine = true;
                continue;
            }

            builder.AppendLine(line);
        }

        return builder.ToString().Trim();
    }

    private static bool RequiresApiKey(string baseUrl)
    {
        if (!Uri.TryCreate(baseUrl, UriKind.Absolute, out var parsed))
        {
            return true;
        }

        return !parsed.Host.Equals("localhost", StringComparison.OrdinalIgnoreCase)
               && !parsed.Host.Equals("127.0.0.1", StringComparison.OrdinalIgnoreCase)
               && !parsed.Host.Equals("0.0.0.0", StringComparison.OrdinalIgnoreCase)
               && !parsed.Host.Equals("::1", StringComparison.OrdinalIgnoreCase);
    }

    private static TokenUsage? TryReadUsage(JsonElement root)
    {
        if (!root.TryGetProperty("usage", out var usageElement) || usageElement.ValueKind != JsonValueKind.Object)
        {
            return null;
        }

        var inputTokens = TryGetInt32(usageElement, "prompt_tokens")
            ?? TryGetInt32(usageElement, "input_tokens");
        var outputTokens = TryGetInt32(usageElement, "completion_tokens")
            ?? TryGetInt32(usageElement, "output_tokens");
        var totalTokens = TryGetInt32(usageElement, "total_tokens");

        if (inputTokens is null && outputTokens is null && totalTokens is null)
        {
            return null;
        }

        var normalizedInputTokens = inputTokens ?? 0;
        var normalizedOutputTokens = outputTokens ?? 0;
        var normalizedTotalTokens = totalTokens ?? normalizedInputTokens + normalizedOutputTokens;

        return new TokenUsage(normalizedInputTokens, normalizedOutputTokens, normalizedTotalTokens);
    }

    private static int? TryGetInt32(JsonElement element, string propertyName)
    {
        if (!element.TryGetProperty(propertyName, out var property))
        {
            return null;
        }

        return property.ValueKind switch
        {
            JsonValueKind.Number when property.TryGetInt32(out var value) => value,
            JsonValueKind.String when int.TryParse(property.GetString(), out var value) => value,
            _ => null
        };
    }

    private sealed record EffectivePrompt(string SystemPrompt, string UserPrompt);
}
