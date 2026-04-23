using System.Diagnostics;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using SpecForge.Domain.Application;
using SpecForge.Domain.Persistence;
using SpecForge.Domain.Workflow;

namespace SpecForge.OpenAICompatible;

public sealed class OpenAiCompatiblePhaseExecutionProvider : IPhaseExecutionProvider
{
    private const string OpenAiCompatibleProviderKind = "openai-compatible";
    private const string CodexProviderKind = "codex";
    private const string CopilotProviderKind = "copilot";
    private const string ClaudeProviderKind = "claude";
    private const string RepositoryAccessNone = "none";
    private const string RepositoryAccessRead = "read";
    private const string RepositoryAccessReadWrite = "read-write";
    private const string StrictTolerance = "strict";
    private const string BalancedTolerance = "balanced";
    private const string InferentialTolerance = "inferential";
    private readonly HttpClient httpClient;
    private readonly OpenAiCompatibleProviderOptions options;
    private readonly RepositoryPromptCatalog promptCatalog;
    private readonly ICodexCliRunner codexCliRunner;

    public OpenAiCompatiblePhaseExecutionProvider(
        HttpClient httpClient,
        OpenAiCompatibleProviderOptions options)
        : this(httpClient, options, new RepositoryPromptCatalog())
    {
    }

    internal OpenAiCompatiblePhaseExecutionProvider(
        HttpClient httpClient,
        OpenAiCompatibleProviderOptions options,
        RepositoryPromptCatalog promptCatalog,
        ICodexCliRunner? codexCliRunner = null)
    {
        this.httpClient = httpClient ?? throw new ArgumentNullException(nameof(httpClient));
        this.options = options ?? throw new ArgumentNullException(nameof(options));
        this.promptCatalog = promptCatalog ?? throw new ArgumentNullException(nameof(promptCatalog));
        this.codexCliRunner = codexCliRunner ?? new SystemCodexCliRunner();

        if (options.ModelProfiles is not { Count: > 0 })
        {
            throw new ArgumentException("At least one model profile is required.", nameof(options));
        }

        ValidateModelProfiles(options.ModelProfiles, options.PhaseModelAssignments);
        ValidateAutoClarificationAnswers(
            options.ModelProfiles.Select(static profile => profile.Name).ToArray(),
            options);

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

    public PhaseExecutionReadiness GetPhaseExecutionReadiness(PhaseId phaseId)
    {
        var modelSelection = ResolveModelSelection(phaseId);
        if (string.Equals(modelSelection.ProviderKind, CodexProviderKind, StringComparison.Ordinal) &&
            !codexCliRunner.IsAvailable)
        {
            return new PhaseExecutionReadiness(phaseId, CanExecute: false, PhaseExecutionBlockingReasons.CodexCliNotFound);
        }

        var requiredRepositoryAccess = phaseId switch
        {
            PhaseId.Implementation => RepositoryAccessReadWrite,
            PhaseId.Review => RepositoryAccessRead,
            _ => null
        };

        if (requiredRepositoryAccess is null)
        {
            return new PhaseExecutionReadiness(phaseId, CanExecute: true);
        }

        var effectiveRepositoryAccess = NormalizeRepositoryAccess(modelSelection.RepositoryAccess);
        var canExecute = HasRequiredRepositoryAccess(effectiveRepositoryAccess, requiredRepositoryAccess);

        return canExecute
            ? new PhaseExecutionReadiness(phaseId, CanExecute: true)
            : new PhaseExecutionReadiness(
                phaseId,
                CanExecute: false,
                phaseId == PhaseId.Implementation
                    ? PhaseExecutionBlockingReasons.ImplementationRequiresRepositoryWriteAccess
                    : PhaseExecutionBlockingReasons.ReviewRequiresRepositoryReadAccess);
    }

    public async Task<AutoClarificationAnswersResult?> TryAutoAnswerClarificationAsync(
        PhaseExecutionContext context,
        ClarificationSession session,
        CancellationToken cancellationToken = default)
    {
        if (!options.AutoClarificationAnswersEnabled || session.Items.Count == 0)
        {
            return null;
        }

        var modelSelection = ResolveAutoClarificationAnswersModelSelection();
        SpecForgeDiagnostics.Log(
            $"[provider.auto_clarification] usId={context.UsId} provider={modelSelection.ProviderKind} profile={modelSelection.ProfileName ?? "default"} model={modelSelection.Model} questions={session.Items.Count}");
        var prompt = await BuildAutoClarificationAnswersPromptAsync(context, session, cancellationToken);
        if (string.Equals(modelSelection.ProviderKind, CodexProviderKind, StringComparison.Ordinal))
        {
            var responseJson = await ExecuteStructuredCodexAsync(
                context.WorkspaceRoot,
                BuildStandaloneCodexPrompt("SpecForge Native Clarification Auto Answers", prompt),
                modelSelection,
                BuildAutoClarificationAnswersSchema().GetRawText(),
                sandboxMode: "read-only",
                cancellationToken);
            var document = ParseAutoClarificationAnswersDocument(responseJson);
            return new AutoClarificationAnswersResult(
                document.CanResolve,
                document.Answers,
                document.Reason,
                Execution: new PhaseExecutionMetadata(
                    ProviderKind: CodexProviderKind,
                    Model: string.IsNullOrWhiteSpace(modelSelection.Model) ? "default" : modelSelection.Model,
                    ProfileName: modelSelection.ProfileName,
                    Warnings: prompt.Warnings));
        }

        var (content, usage) = await ExecuteStructuredHttpAsync(
            modelSelection,
            prompt.SystemPrompt,
            prompt.UserPrompt,
            temperature: ResolveToleranceTemperature(options.ClarificationTolerance),
            new StructuredOutputResponseFormat(
                Type: "json_schema",
                JsonSchema: new StructuredOutputJsonSchema(
                    Name: "auto_clarification_answers",
                    Schema: BuildAutoClarificationAnswersSchema(),
                    Strict: true)),
            cancellationToken);
        var parsed = ParseAutoClarificationAnswersDocument(content);
        return new AutoClarificationAnswersResult(
            parsed.CanResolve,
            parsed.Answers,
            parsed.Reason,
            usage,
            new PhaseExecutionMetadata(
                ProviderKind: modelSelection.ProviderKind,
                Model: modelSelection.Model,
                ProfileName: modelSelection.ProfileName,
                BaseUrl: modelSelection.BaseUrl,
                Warnings: prompt.Warnings));
    }

    public async Task<PhaseExecutionResult> ExecuteAsync(
        PhaseExecutionContext context,
        CancellationToken cancellationToken = default)
    {
        promptCatalog.EnsureRepositoryIsInitialized(context.WorkspaceRoot);

        var modelSelection = ResolveModelSelection(context.PhaseId);
        SpecForgeDiagnostics.Log(
            $"[provider.execute] usId={context.UsId} phase={context.PhaseId} provider={modelSelection.ProviderKind} profile={modelSelection.ProfileName ?? "default"} model={modelSelection.Model} baseUrl={(string.IsNullOrWhiteSpace(modelSelection.BaseUrl) ? "(none)" : modelSelection.BaseUrl)}");
        var prompt = await BuildEffectivePromptAsync(context, cancellationToken);
        SpecForgeDiagnostics.Log(
            $"[provider.execute] usId={context.UsId} phase={context.PhaseId} promptBuilt systemChars={prompt.SystemPrompt.Length} userChars={prompt.UserPrompt.Length} warnings={(prompt.Warnings?.Count ?? 0)}");
        if (string.Equals(modelSelection.ProviderKind, CodexProviderKind, StringComparison.Ordinal))
        {
            return await ExecuteViaCodexCliAsync(context, prompt, modelSelection, cancellationToken);
        }

        var contract = StructuredPhaseArtifactContracts.TryGet(context.PhaseId, out var phaseContract)
            ? phaseContract
            : throw new InvalidOperationException($"Phase '{context.PhaseId}' does not expose a structured output contract.");
        var (content, usage) = await ExecuteStructuredHttpAsync(
            modelSelection,
            prompt.SystemPrompt,
            prompt.UserPrompt,
            ResolveTemperature(context.PhaseId),
            new StructuredOutputResponseFormat(
                Type: "json_schema",
                JsonSchema: new StructuredOutputJsonSchema(
                    Name: contract.SchemaName,
                    Schema: contract.JsonSchema,
                    Strict: true)),
            cancellationToken);

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
                BaseUrl: modelSelection.BaseUrl,
                Warnings: prompt.Warnings));
    }

    private HttpRequestMessage BuildRequest(
        ResolvedModelSelection modelSelection,
        string systemPrompt,
        string userPrompt,
        double temperature,
        StructuredOutputResponseFormat? responseFormat)
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
            temperature,
            response_format = responseFormat
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

    private async Task<(string Content, TokenUsage? Usage)> ExecuteStructuredHttpAsync(
        ResolvedModelSelection modelSelection,
        string systemPrompt,
        string userPrompt,
        double temperature,
        StructuredOutputResponseFormat? responseFormat,
        CancellationToken cancellationToken)
    {
        await using var diagnostics = SpecForgeDiagnostics.StartProgressScope(
            $"[provider.http] provider={modelSelection.ProviderKind} profile={modelSelection.ProfileName ?? "default"} model={modelSelection.Model}",
            interval: TimeSpan.FromSeconds(20));
        SpecForgeDiagnostics.Log(
            $"[provider.http] sending model={modelSelection.Model} endpoint={modelSelection.BaseUrl.TrimEnd('/')}/chat/completions temperature={temperature:0.###} responseFormat={responseFormat?.Type ?? "(none)"}");
        var request = BuildRequest(modelSelection, systemPrompt, userPrompt, temperature, responseFormat);
        using var response = await httpClient.SendAsync(request, cancellationToken);
        SpecForgeDiagnostics.Log(
            $"[provider.http] response received status={(int)response.StatusCode} model={modelSelection.Model}");
        var payload = await response.Content.ReadAsStringAsync(cancellationToken);

        if (!response.IsSuccessStatusCode)
        {
            diagnostics.MarkFailed(new InvalidOperationException(
                $"OpenAI-compatible provider call failed with status {(int)response.StatusCode}: {payload}"));
            throw new InvalidOperationException(
                $"OpenAI-compatible provider call failed with status {(int)response.StatusCode}: {payload}");
        }

        using var document = JsonDocument.Parse(payload);
        var content = document.RootElement
            .GetProperty("choices")[0]
            .GetProperty("message")
            .GetProperty("content")
            .GetString();
        diagnostics.MarkCompleted($"payloadChars={payload.Length} contentChars={(content ?? string.Empty).Length}");
        return (content ?? string.Empty, TryReadUsage(document.RootElement));
    }

    private async Task<EffectivePrompt> BuildEffectivePromptAsync(
        PhaseExecutionContext context,
        CancellationToken cancellationToken)
    {
        var paths = new PromptFilePaths(context.WorkspaceRoot);
        var phasePromptPath = promptCatalog.GetExecutePromptPath(context.WorkspaceRoot, context.PhaseId);
        var phaseSystemPromptPath = promptCatalog.GetExecuteSystemPromptPath(context.WorkspaceRoot, context.PhaseId);
        var sharedSystemPrompt = await File.ReadAllTextAsync(paths.SharedSystemPromptPath, cancellationToken);
        var phaseSystemPrompt = await File.ReadAllTextAsync(phaseSystemPromptPath, cancellationToken);
        var sharedStylePrompt = await File.ReadAllTextAsync(paths.SharedStylePromptPath, cancellationToken);
        var sharedOutputRulesPrompt = await File.ReadAllTextAsync(paths.SharedOutputRulesPromptPath, cancellationToken);
        var phasePrompt = await File.ReadAllTextAsync(phasePromptPath, cancellationToken);
        var userStory = await File.ReadAllTextAsync(context.UserStoryPath, cancellationToken);
        var warnings = await BuildPromptWarningsAsync(
            context.WorkspaceRoot,
            cancellationToken,
            paths.SharedSystemPromptPath,
            phaseSystemPromptPath);
        var clarificationLogPath = Path.Combine(Path.GetDirectoryName(context.UserStoryPath)!, "clarification.md");
        var systemPrompt = string.Join(
            $"{Environment.NewLine}{Environment.NewLine}",
            new[]
            {
                options.SystemPrompt,
                sharedSystemPrompt.Trim(),
                phaseSystemPrompt.Trim(),
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
            .AppendLine($"- Repository access: `{NormalizeRepositoryAccess(options.ModelProfiles!.First(candidate => string.Equals(candidate.Name, ResolveProfileNameForPhase(context.PhaseId), StringComparison.Ordinal)).RepositoryAccess)}`")
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
                .AppendLine("Return only structured data that conforms to the response schema.")
                .AppendLine("If the story is ready for refinement, set `decision` to `ready_for_refinement` and return an empty `questions` array.")
                .AppendLine("If the story still needs clarification, set `decision` to `needs_clarification` and include the exact pending questions.");
        }

        if (context.PhaseId == PhaseId.Refinement)
        {
            builder
                .AppendLine()
                .AppendLine("## Refinement JSON Contract")
                .AppendLine()
                .AppendLine("Return only structured data that conforms to the response schema.")
                .AppendLine("`historyLog` must be an array of concise audit strings.")
                .AppendLine()
                .AppendLine("Do not wrap the JSON in markdown fences. Do not return prose outside the structured payload.");
        }

        if (context.PhaseId == PhaseId.Review)
        {
            builder
                .AppendLine()
                .AppendLine("## Review Tolerance")
                .AppendLine()
                .AppendLine($"- Active tolerance: `{options.ReviewTolerance}`")
                .AppendLine($"- Guidance: {ResolveReviewGuidance(options.ReviewTolerance)}")
                .AppendLine()
                .AppendLine("Return only structured data that conforms to the response schema.");
        }

        if (context.PhaseId is PhaseId.TechnicalDesign or PhaseId.Implementation)
        {
            builder
                .AppendLine()
                .AppendLine("## Structured Output")
                .AppendLine()
                .AppendLine("Return only structured data that conforms to the response schema.");
        }

        return new EffectivePrompt(systemPrompt, builder.ToString().Trim(), warnings);
    }

    private async Task<EffectivePrompt> BuildAutoClarificationAnswersPromptAsync(
        PhaseExecutionContext context,
        ClarificationSession session,
        CancellationToken cancellationToken)
    {
        var paths = new PromptFilePaths(context.WorkspaceRoot);
        var sharedSystemPrompt = await File.ReadAllTextAsync(paths.SharedSystemPromptPath, cancellationToken);
        var clarificationSystemPrompt = await File.ReadAllTextAsync(paths.ClarificationExecuteSystemPromptPath, cancellationToken);
        var autoClarificationAnswersSystemPrompt = await File.ReadAllTextAsync(paths.AutoClarificationAnswersSystemPromptPath, cancellationToken);
        var sharedStylePrompt = await File.ReadAllTextAsync(paths.SharedStylePromptPath, cancellationToken);
        var sharedOutputRulesPrompt = await File.ReadAllTextAsync(paths.SharedOutputRulesPromptPath, cancellationToken);
        var phasePrompt = await File.ReadAllTextAsync(paths.ClarificationExecutePromptPath, cancellationToken);
        var userStory = await File.ReadAllTextAsync(context.UserStoryPath, cancellationToken);
        var warnings = await BuildPromptWarningsAsync(
            context.WorkspaceRoot,
            cancellationToken,
            paths.SharedSystemPromptPath,
            paths.ClarificationExecuteSystemPromptPath,
            paths.AutoClarificationAnswersSystemPromptPath);
        var clarificationLogPath = Path.Combine(Path.GetDirectoryName(context.UserStoryPath)!, "clarification.md");
        var clarificationLog = File.Exists(clarificationLogPath)
            ? await File.ReadAllTextAsync(clarificationLogPath, cancellationToken)
            : string.Empty;
        var systemPrompt = string.Join(
            $"{Environment.NewLine}{Environment.NewLine}",
            new[]
            {
                options.SystemPrompt,
                sharedSystemPrompt.Trim(),
                clarificationSystemPrompt.Trim(),
                autoClarificationAnswersSystemPrompt.Trim(),
                sharedStylePrompt.Trim(),
                sharedOutputRulesPrompt.Trim()
            }.Where(static part => !string.IsNullOrWhiteSpace(part)));

        var builder = new StringBuilder()
            .AppendLine(phasePrompt.Trim())
            .AppendLine()
            .AppendLine("## Auto Clarification Answer Task")
            .AppendLine()
            .AppendLine("You are helping SpecForge answer pending clarification questions before refinement/spec continues.")
            .AppendLine("Use only evidence from the user story, recorded clarification log, repository context files, and current workflow artifacts.")
            .AppendLine("Set `canResolve` to true only if every pending question can be answered credibly enough to retry clarification without user input.")
            .AppendLine("If any question still needs human confirmation, set `canResolve` to false and return `null` for the uncertain answers.")
            .AppendLine()
            .AppendLine("## Runtime Context")
            .AppendLine()
            .AppendLine($"- Workspace root: `{context.WorkspaceRoot}`")
            .AppendLine($"- US ID: `{context.UsId}`")
            .AppendLine($"- Phase: `Clarification`")
            .AppendLine($"- Auto-answer profile: `{ResolveAutoClarificationAnswersModelSelection().ProfileName ?? "default"}`")
            .AppendLine()
            .AppendLine("## Pending Questions")
            .AppendLine();

        foreach (var item in session.Items.OrderBy(static item => item.Index))
        {
            builder.AppendLine($"{item.Index}. {item.Question}");
        }

        builder
            .AppendLine()
            .AppendLine("## User Story")
            .AppendLine()
            .AppendLine(userStory.Trim())
            .AppendLine();

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

        builder
            .AppendLine("## Output Rules")
            .AppendLine()
            .AppendLine("- Return only structured data that conforms to the response schema.")
            .AppendLine("- Keep the answers in the same order as the pending questions.")
            .AppendLine("- Do not invent facts that are not grounded in the provided context.");

        return new EffectivePrompt(systemPrompt, builder.ToString().Trim(), warnings);
    }

    private static async Task<IReadOnlyCollection<string>?> BuildPromptWarningsAsync(
        string workspaceRoot,
        CancellationToken cancellationToken,
        params string[] promptPaths)
    {
        var paths = new PromptFilePaths(workspaceRoot);
        IReadOnlyDictionary<string, string> expectedHashes;

        try
        {
            expectedHashes = await PromptSystemHashManifest.ReadAsync(paths, cancellationToken);
        }
        catch (Exception exception)
        {
            return
            [
                $"System prompt hash manifest '{PromptSystemHashManifest.ToRelativePromptPath(workspaceRoot, paths.PromptSystemHashesPath)}' could not be read. Reason: {exception.Message}"
            ];
        }

        var warnings = new List<string>();
        foreach (var promptPath in promptPaths.Distinct(StringComparer.Ordinal))
        {
            var relativePath = PromptSystemHashManifest.ToRelativePromptPath(workspaceRoot, promptPath);
            if (!expectedHashes.TryGetValue(relativePath, out var expectedHash))
            {
                warnings.Add($"System prompt '{relativePath}' is missing from the engine hash manifest.");
                continue;
            }

            var currentContent = await File.ReadAllTextAsync(promptPath, cancellationToken);
            var currentHash = PromptSystemHashManifest.ComputeSha256(currentContent);
            if (!string.Equals(expectedHash, currentHash, StringComparison.Ordinal))
            {
                warnings.Add(
                    $"System prompt '{relativePath}' was modified outside the engine. Expected hash `{expectedHash}`, current hash `{currentHash}`.");
            }
        }

        return warnings.Count == 0 ? null : warnings;
    }

    private static JsonElement BuildAutoClarificationAnswersSchema()
    {
        using var document = JsonDocument.Parse(
            """
            {
              "type": "object",
              "additionalProperties": false,
              "properties": {
                "canResolve": { "type": "boolean" },
                "reason": { "type": "string" },
                "answers": {
                  "type": "array",
                  "items": { "type": ["string", "null"] }
                }
              },
              "required": ["canResolve", "reason", "answers"]
            }
            """);
        return document.RootElement.Clone();
    }

    private static AutoClarificationAnswersDocument ParseAutoClarificationAnswersDocument(string json)
    {
        using var document = JsonDocument.Parse(json);
        var root = document.RootElement;
        var answers = root.TryGetProperty("answers", out var answersElement) && answersElement.ValueKind == JsonValueKind.Array
            ? answersElement.EnumerateArray().Select(static item =>
                item.ValueKind == JsonValueKind.Null ? null : item.GetString()?.Trim()).ToArray()
            : [];
        return new AutoClarificationAnswersDocument(
            root.GetProperty("canResolve").GetBoolean(),
            root.GetProperty("reason").GetString()?.Trim() ?? string.Empty,
            answers);
    }

    private async Task<PhaseExecutionResult> ExecuteViaCodexCliAsync(
        PhaseExecutionContext context,
        EffectivePrompt prompt,
        ResolvedModelSelection modelSelection,
        CancellationToken cancellationToken)
    {
        SpecForgeDiagnostics.Log(
            $"[provider.codex] usId={context.UsId} phase={context.PhaseId} profile={modelSelection.ProfileName ?? "default"} model={(string.IsNullOrWhiteSpace(modelSelection.Model) ? "(default)" : modelSelection.Model)}");
        if (!StructuredPhaseArtifactContracts.TryGet(context.PhaseId, out var contract))
        {
            throw new InvalidOperationException($"Phase '{context.PhaseId}' does not expose a structured output contract for Codex execution.");
        }
        var sandboxMode = context.PhaseId == PhaseId.Implementation
            ? "workspace-write"
            : "read-only";
        var baselineWorkspaceChanges = context.PhaseId == PhaseId.Implementation
            ? await TryCaptureGitStatusSnapshotAsync(context.WorkspaceRoot, cancellationToken)
            : null;
        var responseJson = await ExecuteStructuredCodexAsync(
            context.WorkspaceRoot,
            BuildCodexPrompt(context, prompt),
            modelSelection,
            contract.JsonSchema.GetRawText(),
            sandboxMode,
            cancellationToken);
        if (context.PhaseId == PhaseId.Implementation)
        {
            await EnsureImplementationTouchedWorkspaceAsync(
                context.WorkspaceRoot,
                context.UserStoryPath,
                baselineWorkspaceChanges,
                cancellationToken);
        }

        var normalizedContent = NormalizePhaseContent(context, responseJson.Trim());

        return new PhaseExecutionResult(
            normalizedContent,
            ExecutionKind: CodexProviderKind,
            Usage: null,
            Execution: new PhaseExecutionMetadata(
                ProviderKind: CodexProviderKind,
                Model: string.IsNullOrWhiteSpace(modelSelection.Model) ? "default" : modelSelection.Model,
                ProfileName: modelSelection.ProfileName,
                Warnings: prompt.Warnings));
    }

    private async Task<string> ExecuteStructuredCodexAsync(
        string workspaceRoot,
        string prompt,
        ResolvedModelSelection modelSelection,
        string outputSchemaJson,
        string sandboxMode,
        CancellationToken cancellationToken)
    {
        if (!codexCliRunner.IsAvailable)
        {
            throw new InvalidOperationException("Codex CLI is not available for native provider execution.");
        }

        await using var diagnostics = SpecForgeDiagnostics.StartProgressScope(
            $"[provider.codex.cli] profile={modelSelection.ProfileName ?? "default"} model={(string.IsNullOrWhiteSpace(modelSelection.Model) ? "(default)" : modelSelection.Model)} sandbox={sandboxMode}",
            interval: TimeSpan.FromSeconds(20));
        var response = await codexCliRunner.ExecuteAsync(
            new CodexCliInvocation(
                workspaceRoot,
                prompt,
                string.IsNullOrWhiteSpace(modelSelection.Model) ? null : modelSelection.Model,
                outputSchemaJson,
                sandboxMode),
            cancellationToken);
        diagnostics.MarkCompleted($"responseChars={response.Length}");
        return response;
    }

    private static string BuildCodexPrompt(PhaseExecutionContext context, EffectivePrompt prompt)
    {
        var builder = new StringBuilder()
            .AppendLine("# SpecForge Native Codex Execution")
            .AppendLine()
            .AppendLine("You are Codex executing a SpecForge workflow phase inside the live repository.")
            .AppendLine("Use the workspace root as the repository root.")
            .AppendLine("Do not create commits or branches.")
            .AppendLine("Return only JSON matching the provided schema in your final response.")
            .AppendLine();

        if (!string.IsNullOrWhiteSpace(prompt.SystemPrompt))
        {
            builder
                .AppendLine("## System Instructions")
                .AppendLine()
                .AppendLine(prompt.SystemPrompt.Trim())
                .AppendLine();
        }

        if (context.PhaseId == PhaseId.Implementation)
        {
            builder
                .AppendLine("## Native Implementation Rules")
                .AppendLine()
                .AppendLine("- Make the required repository changes in this workspace before you finish.")
                .AppendLine("- Run the most relevant validation commands you can justify from the repo.")
                .AppendLine("- Base the JSON response on the changes and validation you actually performed.")
                .AppendLine();
        }
        else if (context.PhaseId == PhaseId.Review)
        {
            builder
                .AppendLine("## Native Review Rules")
                .AppendLine()
                .AppendLine("- Inspect the repository state and artifacts directly.")
                .AppendLine("- Do not modify files during review.")
                .AppendLine("- Base findings only on evidence you actually inspected.")
                .AppendLine();
        }

        builder
            .AppendLine("## Phase Instructions")
            .AppendLine()
            .AppendLine(prompt.UserPrompt.Trim());

        return builder.ToString().Trim();
    }

    private static string BuildStandaloneCodexPrompt(string title, EffectivePrompt prompt)
    {
        var builder = new StringBuilder()
            .AppendLine($"# {title}")
            .AppendLine()
            .AppendLine("You are Codex assisting the SpecForge workflow inside the live repository.")
            .AppendLine("Return only JSON matching the provided schema in your final response.")
            .AppendLine();

        if (!string.IsNullOrWhiteSpace(prompt.SystemPrompt))
        {
            builder
                .AppendLine("## System Instructions")
                .AppendLine()
                .AppendLine(prompt.SystemPrompt.Trim())
                .AppendLine();
        }

        builder
            .AppendLine("## Task")
            .AppendLine()
            .AppendLine(prompt.UserPrompt.Trim());

        return builder.ToString().Trim();
    }

    private static async Task EnsureImplementationTouchedWorkspaceAsync(
        string workspaceRoot,
        string userStoryPath,
        IReadOnlyCollection<string>? baselineWorkspaceChanges,
        CancellationToken cancellationToken)
    {
        if (baselineWorkspaceChanges is null)
        {
            return;
        }

        var currentWorkspaceChanges = await TryCaptureGitStatusSnapshotAsync(workspaceRoot, cancellationToken);
        if (currentWorkspaceChanges is null)
        {
            return;
        }

        var userStoryRoot = Path.GetDirectoryName(userStoryPath);
        if (string.IsNullOrWhiteSpace(userStoryRoot))
        {
            return;
        }

        var relativeUserStoryRoot = Path.GetRelativePath(workspaceRoot, userStoryRoot)
            .Replace('\\', '/')
            .TrimEnd('/');

        var meaningfulChanges = currentWorkspaceChanges
            .Except(baselineWorkspaceChanges, StringComparer.Ordinal)
            .Where(change => !IsIgnoredWorkflowChange(change, relativeUserStoryRoot))
            .ToArray();

        if (meaningfulChanges.Length > 0)
        {
            return;
        }

        throw new InvalidOperationException(
            "Codex implementation finished without modifying workspace files outside the user story workflow metadata. " +
            "Do not advance the workflow when implementation produced only planning artifacts.");
    }

    private static bool IsIgnoredWorkflowChange(string gitStatusLine, string relativeUserStoryRoot)
    {
        if (string.IsNullOrWhiteSpace(gitStatusLine))
        {
            return true;
        }

        var normalized = gitStatusLine.Trim();
        if (normalized.Length <= 3)
        {
            return false;
        }

        var pathPortion = normalized[3..].Trim();
        if (string.IsNullOrWhiteSpace(pathPortion))
        {
            return false;
        }

        var candidatePaths = pathPortion
            .Split(" -> ", StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries)
            .Select(static path => path.Replace('\\', '/'));

        foreach (var candidatePath in candidatePaths)
        {
            if (!candidatePath.StartsWith(relativeUserStoryRoot, StringComparison.Ordinal))
            {
                return false;
            }
        }

        return true;
    }

    private static async Task<IReadOnlyCollection<string>?> TryCaptureGitStatusSnapshotAsync(
        string workspaceRoot,
        CancellationToken cancellationToken)
    {
        var gitDirectory = Path.Combine(workspaceRoot, ".git");
        if (!Directory.Exists(gitDirectory) && !File.Exists(gitDirectory))
        {
            return null;
        }

        var startInfo = new ProcessStartInfo
        {
            FileName = "git",
            WorkingDirectory = workspaceRoot,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false
        };
        startInfo.ArgumentList.Add("status");
        startInfo.ArgumentList.Add("--short");
        startInfo.ArgumentList.Add("--untracked-files=all");

        using var process = new Process { StartInfo = startInfo };
        process.Start();
        var stdoutTask = process.StandardOutput.ReadToEndAsync(cancellationToken);
        var stderrTask = process.StandardError.ReadToEndAsync(cancellationToken);
        await process.WaitForExitAsync(cancellationToken);
        var stdout = await stdoutTask;
        var stderr = await stderrTask;

        if (process.ExitCode != 0)
        {
            throw new InvalidOperationException(
                $"Unable to capture git status before or after Codex implementation execution. stderr: {stderr.Trim()} stdout: {stdout.Trim()}");
        }

        return stdout
            .Split(['\r', '\n'], StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .ToArray();
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

        return new ResolvedModelSelection(
            NormalizeProviderKind(profile.Provider),
            profile.BaseUrl,
            profile.ApiKey,
            profile.Model,
            profile.Name,
            profile.RepositoryAccess);
    }

    private ResolvedModelSelection ResolveAutoClarificationAnswersModelSelection()
    {
        var profileName = string.IsNullOrWhiteSpace(options.AutoClarificationAnswersProfile)
            ? ResolveProfileNameForPhase(PhaseId.Clarification)
            : options.AutoClarificationAnswersProfile.Trim();
        var profile = options.ModelProfiles!.FirstOrDefault(candidate =>
            string.Equals(candidate.Name, profileName, StringComparison.Ordinal));

        if (profile is null)
        {
            throw new InvalidOperationException(
                $"Model profile '{profileName}' was not found for auto clarification answers.");
        }

        return new ResolvedModelSelection(
            NormalizeProviderKind(profile.Provider),
            profile.BaseUrl,
            profile.ApiKey,
            profile.Model,
            profile.Name,
            profile.RepositoryAccess);
    }

    private string ResolveProfileNameForPhase(PhaseId phaseId)
    {
        var assignments = options.PhaseModelAssignments;
        var explicitName = phaseId switch
        {
            PhaseId.Capture => assignments?.CaptureProfile,
            PhaseId.Clarification => assignments?.ClarificationProfile,
            PhaseId.Refinement => assignments?.RefinementProfile,
            PhaseId.TechnicalDesign => assignments?.TechnicalDesignProfile,
            PhaseId.Implementation => assignments?.ImplementationProfile,
            PhaseId.Review => assignments?.ReviewProfile,
            PhaseId.ReleaseApproval => assignments?.ReleaseApprovalProfile,
            PhaseId.PrPreparation => assignments?.PrPreparationProfile,
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

    private static string NormalizeProviderKind(string? providerKind) =>
        string.IsNullOrWhiteSpace(providerKind)
            ? OpenAiCompatibleProviderKind
            : providerKind.Trim().ToLowerInvariant();

    private static bool IsSupportedProviderKind(string providerKind) =>
        providerKind is OpenAiCompatibleProviderKind or CodexProviderKind or CopilotProviderKind or ClaudeProviderKind;

    private static bool IsSupportedRepositoryAccess(string? repositoryAccess) =>
        NormalizeRepositoryAccess(repositoryAccess) is RepositoryAccessNone or RepositoryAccessRead or RepositoryAccessReadWrite;

    private static string NormalizeRepositoryAccess(string? repositoryAccess)
    {
        var normalized = string.IsNullOrWhiteSpace(repositoryAccess)
            ? RepositoryAccessNone
            : repositoryAccess.Trim().ToLowerInvariant();

        return normalized switch
        {
            "write" => RepositoryAccessReadWrite,
            "readwrite" => RepositoryAccessReadWrite,
            RepositoryAccessReadWrite => RepositoryAccessReadWrite,
            RepositoryAccessRead => RepositoryAccessRead,
            _ => RepositoryAccessNone
        };
    }

    private static bool HasRequiredRepositoryAccess(string actual, string required) =>
        (actual, required) switch
        {
            (_, RepositoryAccessNone) => true,
            (RepositoryAccessReadWrite, RepositoryAccessReadWrite) => true,
            (RepositoryAccessReadWrite, RepositoryAccessRead) => true,
            (RepositoryAccessRead, RepositoryAccessRead) => true,
            _ => false
        };

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

            var providerKind = NormalizeProviderKind(profile.Provider);
            if (!IsSupportedProviderKind(providerKind))
            {
                throw new ArgumentException(
                    $"Unsupported provider '{profile.Provider}' for model profile '{profile.Name}'. Supported values: '{OpenAiCompatibleProviderKind}', '{CodexProviderKind}', '{CopilotProviderKind}', '{ClaudeProviderKind}'.",
                    nameof(modelProfiles));
            }

            if (!names.Add(profile.Name))
            {
                throw new ArgumentException($"Duplicate model profile '{profile.Name}'.", nameof(modelProfiles));
            }

            if (!string.Equals(providerKind, CodexProviderKind, StringComparison.Ordinal) &&
                string.IsNullOrWhiteSpace(profile.BaseUrl))
            {
                throw new ArgumentException($"BaseUrl is required for model profile '{profile.Name}'.", nameof(modelProfiles));
            }

            if (!string.Equals(providerKind, CodexProviderKind, StringComparison.Ordinal) &&
                string.IsNullOrWhiteSpace(profile.Model))
            {
                throw new ArgumentException($"Model is required for model profile '{profile.Name}'.", nameof(modelProfiles));
            }

            if (!IsSupportedRepositoryAccess(profile.RepositoryAccess))
            {
                throw new ArgumentException(
                    $"RepositoryAccess must be one of: {RepositoryAccessNone}, {RepositoryAccessRead}, {RepositoryAccessReadWrite} for model profile '{profile.Name}'.",
                    nameof(modelProfiles));
            }

            if (!string.Equals(providerKind, CodexProviderKind, StringComparison.Ordinal) &&
                RequiresApiKey(profile.BaseUrl) && string.IsNullOrWhiteSpace(profile.ApiKey))
            {
                throw new ArgumentException($"ApiKey is required for remote model profile '{profile.Name}'.", nameof(modelProfiles));
            }
        }

        var defaultProfileName = assignments?.DefaultProfile;
        if (string.IsNullOrWhiteSpace(defaultProfileName) &&
            modelProfiles.Count > 1 &&
            !HasExplicitProfilesForAllModelDrivenPhases(assignments))
        {
            throw new ArgumentException(
                "DefaultProfile is required when multiple model profiles are configured unless clarification, refinement, technical design, implementation, and review each declare an explicit profile.",
                nameof(assignments));
        }

        foreach (var profileName in new[]
                 {
                     defaultProfileName,
                     assignments?.CaptureProfile,
                     assignments?.ClarificationProfile,
                     assignments?.RefinementProfile,
                     assignments?.TechnicalDesignProfile,
                     assignments?.ImplementationProfile,
                     assignments?.ReviewProfile,
                     assignments?.ReleaseApprovalProfile,
                     assignments?.PrPreparationProfile
                 })
        {
            if (!string.IsNullOrWhiteSpace(profileName) && !names.Contains(profileName))
            {
                throw new ArgumentException($"Assigned model profile '{profileName}' was not configured.", nameof(assignments));
            }
        }
    }

    private static void ValidateAutoClarificationAnswers(
        IReadOnlyCollection<string> names,
        OpenAiCompatibleProviderOptions options)
    {
        if (!options.AutoClarificationAnswersEnabled)
        {
            return;
        }

        if (string.IsNullOrWhiteSpace(options.AutoClarificationAnswersProfile))
        {
            throw new ArgumentException(
                "AutoClarificationAnswersProfile is required when AutoClarificationAnswersEnabled is true.",
                nameof(options));
        }

        if (!names.Contains(options.AutoClarificationAnswersProfile))
        {
            throw new ArgumentException(
                $"Auto clarification answers profile '{options.AutoClarificationAnswersProfile}' was not configured.",
                nameof(options));
        }
    }

    private static string NormalizePhaseContent(PhaseExecutionContext context, string content)
    {
        if (StructuredPhaseArtifactContracts.TryGet(context.PhaseId, out var contract))
        {
            return contract.NormalizeContent(context, content);
        }

        return content;
    }

    private static bool HasExplicitProfilesForAllModelDrivenPhases(OpenAiCompatiblePhaseModelAssignments? assignments) =>
        !string.IsNullOrWhiteSpace(assignments?.ClarificationProfile)
        && !string.IsNullOrWhiteSpace(assignments?.RefinementProfile)
        && !string.IsNullOrWhiteSpace(assignments?.TechnicalDesignProfile)
        && !string.IsNullOrWhiteSpace(assignments?.ImplementationProfile)
        && !string.IsNullOrWhiteSpace(assignments?.ReviewProfile);

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

    private sealed record EffectivePrompt(string SystemPrompt, string UserPrompt, IReadOnlyCollection<string>? Warnings = null);

    private sealed record AutoClarificationAnswersDocument(
        bool CanResolve,
        string Reason,
        IReadOnlyList<string?> Answers);

    private sealed record ResolvedModelSelection(
        string ProviderKind,
        string BaseUrl,
        string ApiKey,
        string Model,
        string? ProfileName,
        string? RepositoryAccess);

    internal sealed record CodexCliInvocation(
        string WorkspaceRoot,
        string Prompt,
        string? Model,
        string OutputSchemaJson,
        string SandboxMode);

    internal interface ICodexCliRunner
    {
        bool IsAvailable { get; }

        Task<string> ExecuteAsync(CodexCliInvocation invocation, CancellationToken cancellationToken);
    }

    internal sealed class SystemCodexCliRunner : ICodexCliRunner
    {
        private const string CodexCliPathEnvVar = "SPECFORGE_CODEX_CLI_PATH";
        private readonly string? executablePath = ResolveExecutablePath();

        public bool IsAvailable => !string.IsNullOrWhiteSpace(executablePath);

        public async Task<string> ExecuteAsync(CodexCliInvocation invocation, CancellationToken cancellationToken)
        {
            if (!IsAvailable)
            {
                throw new InvalidOperationException("Codex CLI executable could not be resolved.");
            }

            var schemaPath = Path.Combine(Path.GetTempPath(), $"specforge-codex-schema-{Guid.NewGuid():N}.json");
            var outputPath = Path.Combine(Path.GetTempPath(), $"specforge-codex-output-{Guid.NewGuid():N}.json");
            await File.WriteAllTextAsync(schemaPath, invocation.OutputSchemaJson, cancellationToken);

            try
            {
                var startInfo = new ProcessStartInfo
                {
                    FileName = executablePath!,
                    WorkingDirectory = invocation.WorkspaceRoot,
                    RedirectStandardInput = true,
                    RedirectStandardError = true,
                    RedirectStandardOutput = true,
                    UseShellExecute = false
                };

                startInfo.ArgumentList.Add("exec");
                if (!string.IsNullOrWhiteSpace(invocation.Model))
                {
                    startInfo.ArgumentList.Add("-m");
                    startInfo.ArgumentList.Add(invocation.Model);
                }

                startInfo.ArgumentList.Add("-C");
                startInfo.ArgumentList.Add(invocation.WorkspaceRoot);
                if (string.Equals(invocation.SandboxMode, "workspace-write", StringComparison.Ordinal))
                {
                    startInfo.ArgumentList.Add("--full-auto");
                }
                else
                {
                    startInfo.ArgumentList.Add("--sandbox");
                    startInfo.ArgumentList.Add(invocation.SandboxMode);
                }
                startInfo.ArgumentList.Add("--color");
                startInfo.ArgumentList.Add("never");
                startInfo.ArgumentList.Add("--output-schema");
                startInfo.ArgumentList.Add(schemaPath);
                startInfo.ArgumentList.Add("-o");
                startInfo.ArgumentList.Add(outputPath);
                startInfo.ArgumentList.Add("-");

                using var process = new Process { StartInfo = startInfo };
                process.Start();
                await process.StandardInput.WriteAsync(invocation.Prompt);
                await process.StandardInput.FlushAsync();
                process.StandardInput.Close();

                var stdoutTask = process.StandardOutput.ReadToEndAsync(cancellationToken);
                var stderrTask = process.StandardError.ReadToEndAsync(cancellationToken);
                await process.WaitForExitAsync(cancellationToken);
                var stdout = await stdoutTask;
                var stderr = await stderrTask;

                if (process.ExitCode != 0)
                {
                    throw new InvalidOperationException(
                        $"Codex CLI execution failed with exit code {process.ExitCode}. stderr: {stderr.Trim()} stdout: {stdout.Trim()}");
                }

                if (!File.Exists(outputPath))
                {
                    throw new InvalidOperationException("Codex CLI execution completed without writing the expected final response file.");
                }

                return await File.ReadAllTextAsync(outputPath, cancellationToken);
            }
            finally
            {
                TryDelete(schemaPath);
                TryDelete(outputPath);
            }
        }

        private static string? ResolveExecutablePath()
        {
            var explicitPath = Environment.GetEnvironmentVariable(CodexCliPathEnvVar);
            if (!string.IsNullOrWhiteSpace(explicitPath) && File.Exists(explicitPath))
            {
                return explicitPath;
            }

            const string appBundlePath = "/Applications/Codex.app/Contents/Resources/codex";
            if (File.Exists(appBundlePath))
            {
                return appBundlePath;
            }

            var path = Environment.GetEnvironmentVariable("PATH");
            if (string.IsNullOrWhiteSpace(path))
            {
                return null;
            }

            foreach (var candidateDirectory in path.Split(Path.PathSeparator, StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
            {
                var candidatePath = Path.Combine(candidateDirectory, "codex");
                if (File.Exists(candidatePath))
                {
                    return candidatePath;
                }
            }

            return null;
        }

        private static void TryDelete(string path)
        {
            try
            {
                if (File.Exists(path))
                {
                    File.Delete(path);
                }
            }
            catch
            {
                // Best-effort cleanup only.
            }
        }
    }

    private sealed record StructuredOutputResponseFormat(
        [property: JsonPropertyName("type")] string Type,
        [property: JsonPropertyName("json_schema")] StructuredOutputJsonSchema JsonSchema);

    private sealed record StructuredOutputJsonSchema(
        [property: JsonPropertyName("name")] string Name,
        [property: JsonPropertyName("schema")] JsonElement Schema,
        [property: JsonPropertyName("strict")] bool Strict);
}
