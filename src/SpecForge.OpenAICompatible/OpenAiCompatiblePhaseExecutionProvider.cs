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

        if (options.ModelProfiles is not { Count: > 0 })
        {
            throw new ArgumentException("At least one model profile is required.", nameof(options));
        }

        ValidateModelProfiles(options.ModelProfiles, options.PhaseModelAssignments);

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
        var modelSelection = ResolveModelSelection(context.PhaseId);
        var request = BuildRequest(context.PhaseId, modelSelection, prompt.SystemPrompt, prompt.UserPrompt);
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
        return new PhaseExecutionResult(
            normalizedContent,
            ExecutionKind: "openai-compatible",
            usage,
            new PhaseExecutionMetadata(
                ProviderKind: modelSelection.ProviderKind,
                Model: modelSelection.Model,
                ProfileName: modelSelection.ProfileName,
                BaseUrl: modelSelection.BaseUrl));
    }

    private HttpRequestMessage BuildRequest(PhaseId phaseId, ResolvedModelSelection modelSelection, string systemPrompt, string userPrompt)
    {
        var endpoint = $"{modelSelection.BaseUrl.TrimEnd('/')}/chat/completions";
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
            model = modelSelection.Model,
            messages,
            temperature = ResolveTemperature(phaseId)
        });

        var request = new HttpRequestMessage(HttpMethod.Post, endpoint)
        {
            Content = new StringContent(requestBody, Encoding.UTF8, "application/json")
        };

        if (!string.IsNullOrWhiteSpace(modelSelection.ApiKey))
        {
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", modelSelection.ApiKey);
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

        if (!string.IsNullOrWhiteSpace(context.CurrentArtifactPath) && File.Exists(context.CurrentArtifactPath))
        {
            var currentArtifact = await File.ReadAllTextAsync(context.CurrentArtifactPath, cancellationToken);
            if (!string.IsNullOrWhiteSpace(currentArtifact))
            {
                builder
                    .AppendLine("## Current Phase Artifact")
                    .AppendLine()
                    .AppendLine($"Path: `{context.CurrentArtifactPath}`")
                    .AppendLine()
                    .AppendLine(currentArtifact.Trim())
                    .AppendLine();
            }
        }

        if (!string.IsNullOrWhiteSpace(context.OperationPrompt))
        {
            builder
                .AppendLine("## Requested Artifact Operation")
                .AppendLine()
                .AppendLine("Apply this instruction directly to the current phase artifact:")
                .AppendLine()
                .AppendLine("```text")
                .AppendLine(context.OperationPrompt.Trim())
                .AppendLine("```")
                .AppendLine();
        }

        builder
            .AppendLine("## Execution Rules")
            .AppendLine()
            .AppendLine("- Use the repository artifacts as the source of truth.")
            .AppendLine("- Stay strictly inside the requested phase contract.")
            .AppendLine(context.PhaseId == PhaseId.Refinement
                ? "- Return only the canonical JSON artifact for the current phase."
                : "- Return only the markdown artifact for the current phase.");

        if (!string.IsNullOrWhiteSpace(context.OperationPrompt))
        {
            builder
                .AppendLine("- Treat the current phase artifact as the document under edit, not as a discarded draft.")
                .AppendLine("- Preserve valid content unless the requested operation requires a change.")
                .AppendLine("- Update the artifact so the requested correction becomes explicit in the markdown.")
                .AppendLine("- Add a concise new entry at the top of the artifact history log describing the operation.");
        }

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

        if (context.PhaseId == PhaseId.Refinement)
        {
            builder
                .AppendLine()
                .AppendLine("## Refinement JSON Contract")
                .AppendLine()
                .AppendLine("Return a single JSON object with exactly these top-level fields:")
                .AppendLine("- `title`")
                .AppendLine("- `historyLog`")
                .AppendLine("- `state`")
                .AppendLine("- `basedOn`")
                .AppendLine("- `specSummary`")
                .AppendLine("- `inputs`")
                .AppendLine("- `outputs`")
                .AppendLine("- `businessRules`")
                .AppendLine("- `edgeCases`")
                .AppendLine("- `errorsAndFailureModes`")
                .AppendLine("- `constraints`")
                .AppendLine("- `detectedAmbiguities`")
                .AppendLine("- `redTeam`")
                .AppendLine("- `blueTeam`")
                .AppendLine("- `acceptanceCriteria`")
                .AppendLine("- `humanApprovalQuestions`")
                .AppendLine()
                .AppendLine("`humanApprovalQuestions` must be an array of objects with:")
                .AppendLine("- `question`")
                .AppendLine("- `status` (`pending` or `resolved`)")
                .AppendLine("- `answer`")
                .AppendLine("- `answeredBy`")
                .AppendLine("- `answeredAtUtc`")
                .AppendLine()
                .AppendLine("Do not wrap the JSON in markdown fences. Do not return prose outside the JSON object.");
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

    private ResolvedModelSelection ResolveModelSelection(PhaseId phaseId)
    {
        var profileName = ResolveProfileNameForPhase(phaseId);
        var profile = options.ModelProfiles!.FirstOrDefault(candidate =>
            string.Equals(candidate.Name, profileName, StringComparison.Ordinal));

        if (profile is null)
        {
            throw new InvalidOperationException($"Model profile '{profileName}' was not found for phase '{phaseId}'.");
        }

        return new ResolvedModelSelection(profile.Provider, profile.BaseUrl, profile.ApiKey, profile.Model, profile.Name);
    }

    private string ResolveProfileNameForPhase(PhaseId phaseId)
    {
        var assignments = options.PhaseModelAssignments;
        var explicitName = phaseId switch
        {
            PhaseId.Implementation => assignments?.ImplementationProfile,
            PhaseId.Review => assignments?.ReviewProfile,
            _ => assignments?.DefaultProfile
        };

        if (!string.IsNullOrWhiteSpace(explicitName))
        {
            return explicitName;
        }

        var defaultProfileName = assignments?.DefaultProfile;
        if (!string.IsNullOrWhiteSpace(defaultProfileName))
        {
            return defaultProfileName;
        }

        if (options.ModelProfiles?.Count == 1)
        {
            return options.ModelProfiles[0].Name;
        }

        throw new InvalidOperationException("A default model profile assignment is required when multiple model profiles are configured.");
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

    private static void ValidateModelProfiles(
        IReadOnlyList<OpenAiCompatibleModelProfile> modelProfiles,
        OpenAiCompatiblePhaseModelAssignments? assignments)
    {
        var names = new HashSet<string>(StringComparer.Ordinal);

        foreach (var profile in modelProfiles)
        {
            if (string.IsNullOrWhiteSpace(profile.Name))
            {
                throw new ArgumentException("Model profile Name is required.", nameof(modelProfiles));
            }

            if (string.IsNullOrWhiteSpace(profile.Provider))
            {
                throw new ArgumentException($"Provider is required for model profile '{profile.Name}'.", nameof(modelProfiles));
            }

            if (!string.Equals(profile.Provider, "openai-compatible", StringComparison.Ordinal))
            {
                throw new ArgumentException($"Unsupported provider '{profile.Provider}' for model profile '{profile.Name}'.", nameof(modelProfiles));
            }

            if (!names.Add(profile.Name))
            {
                throw new ArgumentException($"Duplicate model profile '{profile.Name}'.", nameof(modelProfiles));
            }

            if (string.IsNullOrWhiteSpace(profile.BaseUrl))
            {
                throw new ArgumentException($"BaseUrl is required for model profile '{profile.Name}'.", nameof(modelProfiles));
            }

            if (string.IsNullOrWhiteSpace(profile.Model))
            {
                throw new ArgumentException($"Model is required for model profile '{profile.Name}'.", nameof(modelProfiles));
            }

            if (RequiresApiKey(profile.BaseUrl) && string.IsNullOrWhiteSpace(profile.ApiKey))
            {
                throw new ArgumentException($"ApiKey is required for remote model profile '{profile.Name}'.", nameof(modelProfiles));
            }
        }

        var defaultProfileName = assignments?.DefaultProfile;
        if (string.IsNullOrWhiteSpace(defaultProfileName) && modelProfiles.Count > 1)
        {
            throw new ArgumentException("DefaultProfile is required when multiple model profiles are configured.", nameof(assignments));
        }

        foreach (var profileName in new[]
                 {
                     defaultProfileName,
                     assignments?.ImplementationProfile,
                     assignments?.ReviewProfile
                 })
        {
            if (!string.IsNullOrWhiteSpace(profileName) && !names.Contains(profileName))
            {
                throw new ArgumentException($"Assigned model profile '{profileName}' was not configured.", nameof(assignments));
            }
        }
    }

    private static string NormalizePhaseContent(PhaseExecutionContext context, string content)
    {
        if (context.PhaseId == PhaseId.Refinement)
        {
            return RefinementSpecJson.Serialize(RefinementSpecJson.ParseCanonicalJson(content));
        }

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

    private static bool RequiresApiKey(string baseUrl) => !LocalEndpointHelper.IsLocal(baseUrl);

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

    private sealed record ResolvedModelSelection(string ProviderKind, string BaseUrl, string ApiKey, string Model, string? ProfileName);
}
