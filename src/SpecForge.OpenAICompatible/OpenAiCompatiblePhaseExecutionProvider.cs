using System.Diagnostics;
using System.Net.Http.Headers;
using System.Security.Cryptography;
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
    private readonly IReadOnlyDictionary<string, INativeCliRunner> nativeCliRunners;

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
        IEnumerable<INativeCliRunner>? nativeCliRunners = null)
    {
        this.httpClient = httpClient ?? throw new ArgumentNullException(nameof(httpClient));
        this.options = options ?? throw new ArgumentNullException(nameof(options));
        this.promptCatalog = promptCatalog ?? throw new ArgumentNullException(nameof(promptCatalog));
        this.nativeCliRunners = (nativeCliRunners ?? CreateNativeCliRunners())
            .ToDictionary(static runner => runner.ProviderKind, StringComparer.Ordinal);

        if (options.ModelProfiles is not { Count: > 0 })
        {
            throw new ArgumentException("At least one model profile is required.", nameof(options));
        }

        ValidateModelProfiles(options.ModelProfiles);
        ValidateAgentProfiles(options.AgentProfiles, options.PhaseAgentAssignments, options.ModelProfiles);
        ValidateAutoRefinementAnswers(
            options.AgentProfiles?.Select(static profile => profile.Name).ToArray() ?? [],
            options);

        if (!IsSupportedTolerance(options.RefinementTolerance))
        {
            throw new ArgumentException(
                "RefinementTolerance must be one of: strict, balanced, inferential.",
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
        var requirements = PhaseExecutionPermissionCatalog.Describe(phaseId);
        if (!requirements.ModelExecutionRequired)
        {
            return new PhaseExecutionReadiness(
                phaseId,
                CanExecute: true,
                RequiredPermissions: requirements,
                ValidationMessage: "Phase does not require a model-backed execution precheck.");
        }

        var modelSelection = ResolveModelSelection(phaseId);
        var nativeCliRunner = ResolveNativeCliRunner(modelSelection.ProviderKind);
        var effectiveRepositoryAccess = NormalizeRepositoryAccess(modelSelection.RepositoryAccess);
        var assignedModelSecurity = new PhaseExecutionModelSecurity(
            modelSelection.ProviderKind,
            string.IsNullOrWhiteSpace(modelSelection.Model) ? "default" : modelSelection.Model,
            modelSelection.ProfileName,
            effectiveRepositoryAccess,
            NativeCliRequired: RequiresNativeCli(modelSelection),
            NativeCliAvailable: nativeCliRunner?.IsAvailable ?? false,
            AgentName: modelSelection.AgentName,
            AgentRole: modelSelection.AgentRole);
        if (RequiresNativeCli(modelSelection) &&
            (nativeCliRunner is null || !nativeCliRunner.IsAvailable))
        {
            return new PhaseExecutionReadiness(
                phaseId,
                CanExecute: false,
                ResolveNativeCliBlockingReason(modelSelection.ProviderKind),
                RequiredPermissions: requirements,
                AssignedModelSecurity: assignedModelSecurity,
                ValidationMessage: "Phase permission precheck failed because the assigned native model runner is not available.");
        }

        var canExecute = HasRequiredRepositoryAccess(effectiveRepositoryAccess, requirements.RepositoryAccess);

        return canExecute
            ? new PhaseExecutionReadiness(
                phaseId,
                CanExecute: true,
                RequiredPermissions: requirements,
                AssignedModelSecurity: assignedModelSecurity,
                ValidationMessage: "Phase permission precheck passed for the assigned model profile.")
            : new PhaseExecutionReadiness(
                phaseId,
                CanExecute: false,
                PhaseExecutionPermissionCatalog.ResolveRepositoryAccessBlockingReason(phaseId),
                RequiredPermissions: requirements,
                AssignedModelSecurity: assignedModelSecurity,
                ValidationMessage: $"Phase permission precheck failed because the assigned model only has repository access '{effectiveRepositoryAccess}' but phase '{phaseId}' requires '{requirements.RepositoryAccess}'.");
    }

    public async Task<AutoRefinementAnswersResult?> TryAutoAnswerRefinementAsync(
        PhaseExecutionContext context,
        RefinementSession session,
        CancellationToken cancellationToken = default)
    {
        if (!options.AutoRefinementAnswersEnabled || session.Items.Count == 0)
        {
            return null;
        }

        var modelSelection = ResolveAutoRefinementAnswersModelSelection();
        SpecForgeDiagnostics.Log(
            $"[provider.auto_refinement] usId={context.UsId} provider={modelSelection.ProviderKind} profile={modelSelection.ProfileName ?? "default"} model={modelSelection.Model} questions={session.Items.Count}");
        var prompt = await BuildAutoRefinementAnswersPromptAsync(context, session, cancellationToken);
        if (ShouldUseNativeCli(modelSelection))
        {
            var autoRefinementAnswersSchema = BuildAutoRefinementAnswersSchema().GetRawText();
            var nativePrompt = NativeCliPromptBuilder.BuildStandalonePrompt(
                modelSelection.ProviderKind,
                "SpecForge Native Refinement Auto Answers",
                prompt,
                autoRefinementAnswersSchema);
            var responseJson = await ExecuteStructuredNativeAsync(
                context.WorkspaceRoot,
                nativePrompt,
                modelSelection,
                autoRefinementAnswersSchema,
                sandboxMode: "read-only",
                cancellationToken);
            var document = ParseAutoRefinementAnswersDocument(responseJson);
            return new AutoRefinementAnswersResult(
                document.CanResolve,
                document.Answers,
                document.Reason,
                Execution: new PhaseExecutionMetadata(
                    ProviderKind: modelSelection.ProviderKind,
                    Model: string.IsNullOrWhiteSpace(modelSelection.Model) ? "default" : modelSelection.Model,
                    ProfileName: modelSelection.ProfileName,
                    AgentName: modelSelection.AgentName,
                    AgentRole: modelSelection.AgentRole,
                    Warnings: prompt.Warnings,
                    InputSha256: ComputeSha256(nativePrompt),
                    OutputSha256: ComputeSha256(responseJson),
                    StructuredOutputSha256: ComputeSha256(responseJson)));
        }

        var (content, usage, inputSha256, outputSha256) = await ExecuteStructuredHttpAsync(
            modelSelection,
            prompt.SystemPrompt,
            prompt.UserPrompt,
            temperature: ResolveToleranceTemperature(options.RefinementTolerance),
            new StructuredOutputResponseFormat(
                Type: "json_schema",
                JsonSchema: new StructuredOutputJsonSchema(
                    Name: "auto_refinement_answers",
                    Schema: BuildAutoRefinementAnswersSchema(),
                    Strict: true)),
            cancellationToken);
        var parsed = ParseAutoRefinementAnswersDocument(content);
        return new AutoRefinementAnswersResult(
            parsed.CanResolve,
            parsed.Answers,
            parsed.Reason,
            usage,
            new PhaseExecutionMetadata(
                ProviderKind: modelSelection.ProviderKind,
                Model: modelSelection.Model,
                ProfileName: modelSelection.ProfileName,
                AgentName: modelSelection.AgentName,
                AgentRole: modelSelection.AgentRole,
                BaseUrl: modelSelection.BaseUrl,
                Warnings: prompt.Warnings,
                InputSha256: inputSha256,
                OutputSha256: outputSha256,
                StructuredOutputSha256: outputSha256));
    }

    public async Task<PhaseExecutionResult> ExecuteAsync(
        PhaseExecutionContext context,
        CancellationToken cancellationToken = default)
    {
        var modelSelection = ResolveModelSelection(context.PhaseId);
        SpecForgeDiagnostics.Log(
            $"[provider.execute] usId={context.UsId} phase={context.PhaseId} provider={modelSelection.ProviderKind} profile={modelSelection.ProfileName ?? "default"} agent={modelSelection.AgentName ?? "(none)"} model={modelSelection.Model} baseUrl={(string.IsNullOrWhiteSpace(modelSelection.BaseUrl) ? "(none)" : modelSelection.BaseUrl)}");
        var prompt = await BuildEffectivePromptAsync(context, cancellationToken);
        SpecForgeDiagnostics.Log(
            $"[provider.execute] usId={context.UsId} phase={context.PhaseId} promptBuilt systemChars={prompt.SystemPrompt.Length} userChars={prompt.UserPrompt.Length} warnings={(prompt.Warnings?.Count ?? 0)}");
        if (ShouldUseNativeCli(modelSelection))
        {
            return await ExecuteViaNativeCliAsync(context, prompt, modelSelection, cancellationToken);
        }

        var contract = StructuredPhaseArtifactContracts.TryGet(context.PhaseId, out var phaseContract)
            ? phaseContract
            : throw new InvalidOperationException($"Phase '{context.PhaseId}' does not expose a structured output contract.");
        var responseFormat = contract.ResponseFormat == PhaseArtifactResponseFormat.Json
            ? new StructuredOutputResponseFormat(
                Type: "json_schema",
                JsonSchema: new StructuredOutputJsonSchema(
                    Name: contract.SchemaName,
                    Schema: contract.JsonSchema,
                    Strict: true))
            : null;
        var (content, usage, inputSha256, outputSha256) = await ExecuteStructuredHttpAsync(
            modelSelection,
            prompt.SystemPrompt,
            prompt.UserPrompt,
            ResolveTemperature(context.PhaseId),
            responseFormat,
            cancellationToken);

        if (string.IsNullOrWhiteSpace(content))
        {
            throw new InvalidOperationException("OpenAI-compatible provider returned an empty content payload.");
        }

        var canonicalJsonContent = contract.ResponseFormat == PhaseArtifactResponseFormat.Json
            ? NormalizePhaseJsonContent(context, content.Trim())
            : null;
        if (context.PhaseId == PhaseId.PrPreparation && !string.IsNullOrWhiteSpace(canonicalJsonContent))
        {
            var repaired = PrPreparationArtifactFactory.RepairIncomplete(
                context,
                PrPreparationArtifactJson.ParseCanonicalJson(canonicalJsonContent));
            canonicalJsonContent = PrPreparationArtifactJson.Serialize(repaired).Trim();
        }

        var normalizedContent = NormalizePhaseContent(context, canonicalJsonContent ?? content.Trim());
        return new PhaseExecutionResult(
            normalizedContent,
            ExecutionKind: "openai-compatible",
            usage,
            new PhaseExecutionMetadata(
                ProviderKind: modelSelection.ProviderKind,
                Model: modelSelection.Model,
                ProfileName: modelSelection.ProfileName,
                AgentName: modelSelection.AgentName,
                AgentRole: modelSelection.AgentRole,
                BaseUrl: modelSelection.BaseUrl,
                Warnings: prompt.Warnings,
                InputSha256: inputSha256,
                OutputSha256: outputSha256,
                StructuredOutputSha256: ComputeSha256(canonicalJsonContent)),
            canonicalJsonContent);
    }

    private static HttpRequestMessage BuildRequest(
        ResolvedModelSelection modelSelection,
        string requestBody,
        string endpoint)
    {
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

    private static string BuildRequestBody(
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

        var requestBody = new Dictionary<string, object?>
        {
            ["model"] = modelSelection.Model,
            ["messages"] = messages,
            ["temperature"] = temperature,
            ["reasoning_effort"] = modelSelection.ReasoningEffort
        };

        if (responseFormat is not null)
        {
            requestBody["response_format"] = responseFormat;
        }

        return JsonSerializer.Serialize(requestBody);
    }

    private async Task<(string Content, TokenUsage? Usage, string? InputSha256, string? OutputSha256)> ExecuteStructuredHttpAsync(
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
        var endpoint = $"{modelSelection.BaseUrl.TrimEnd('/')}/chat/completions";
        var requestBody = BuildRequestBody(modelSelection, systemPrompt, userPrompt, temperature, responseFormat);
        var request = BuildRequest(modelSelection, requestBody, endpoint);
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
        return (content ?? string.Empty, TryReadUsage(document.RootElement), ComputeSha256(requestBody), ComputeSha256(content));
    }

    private async Task<EffectivePrompt> BuildEffectivePromptAsync(
        PhaseExecutionContext context,
        CancellationToken cancellationToken)
    {
        var paths = new PromptFilePaths(context.WorkspaceRoot);
        var modelSelection = ResolveModelSelection(context.PhaseId);
        var phasePromptPath = promptCatalog.GetExecutePromptPath(context.WorkspaceRoot, context.PhaseId);
        var phaseSystemPromptPath = promptCatalog.GetExecuteSystemPromptPath(context.WorkspaceRoot, context.PhaseId);
        var sharedSystemPrompt = await promptCatalog.ReadPromptAsync(context.WorkspaceRoot, paths.SharedSystemPromptPath, cancellationToken);
        var phaseSystemPrompt = await promptCatalog.ReadPromptAsync(context.WorkspaceRoot, phaseSystemPromptPath, cancellationToken);
        var sharedStylePrompt = await promptCatalog.ReadPromptAsync(context.WorkspaceRoot, paths.SharedStylePromptPath, cancellationToken);
        var sharedOutputRulesPrompt = await promptCatalog.ReadPromptAsync(context.WorkspaceRoot, paths.SharedOutputRulesPromptPath, cancellationToken);
        var phasePrompt = await promptCatalog.ReadPromptAsync(context.WorkspaceRoot, phasePromptPath, cancellationToken);
        var userStory = await File.ReadAllTextAsync(context.UserStoryPath, cancellationToken);
        var warnings = BuildPromptWarnings(sharedSystemPrompt, phaseSystemPrompt);
        var refinementLogPath = Path.Combine(Path.GetDirectoryName(context.UserStoryPath)!, "refinement.md");
        var contract = StructuredPhaseArtifactContracts.TryGet(context.PhaseId, out var phaseContract)
            ? phaseContract
            : throw new InvalidOperationException($"Phase '{context.PhaseId}' does not expose a structured output contract.");
        var effectiveOutputRulesPrompt = contract.ResponseFormat == PhaseArtifactResponseFormat.Json
            ? sharedOutputRulesPrompt.Content.Trim()
            : BuildMarkdownOutputRulesPrompt();
        var systemPrompt = string.Join(
            $"{Environment.NewLine}{Environment.NewLine}",
            new[]
            {
                options.SystemPrompt,
                sharedSystemPrompt.Content.Trim(),
                phaseSystemPrompt.Content.Trim(),
                BuildAgentSystemPrompt(modelSelection),
                sharedStylePrompt.Content.Trim(),
                effectiveOutputRulesPrompt
            }.Where(static part => !string.IsNullOrWhiteSpace(part)));

        var builder = new StringBuilder()
            .AppendLine(phasePrompt.Content.Trim())
            .AppendLine()
            .AppendLine("## Runtime Context")
            .AppendLine();

        builder
            .AppendLine($"- Workspace root: `{context.WorkspaceRoot}`")
            .AppendLine($"- US ID: `{context.UsId}`")
            .AppendLine($"- Phase: `{context.PhaseId}`")
            .AppendLine($"- User story path: `{context.UserStoryPath}`")
            .AppendLine($"- Agent: `{modelSelection.AgentName ?? "default"}`")
            .AppendLine($"- Agent role: `{modelSelection.AgentRole ?? "default"}`")
            .AppendLine($"- Model profile: `{modelSelection.ProfileName ?? "default"}`")
            .AppendLine($"- Repository access: `{NormalizeRepositoryAccess(modelSelection.RepositoryAccess)}`")
            .AppendLine();

        builder
            .AppendLine("## User Story")
            .AppendLine()
            .AppendLine(userStory.Trim())
            .AppendLine();

        if (File.Exists(refinementLogPath))
        {
            var refinementLog = await File.ReadAllTextAsync(refinementLogPath, cancellationToken);
            if (!string.IsNullOrWhiteSpace(refinementLog))
            {
                builder
                    .AppendLine("## Refinement Log")
                    .AppendLine()
                    .AppendLine($"Path: `{refinementLogPath}`")
                    .AppendLine()
                    .AppendLine(refinementLog.Trim())
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
            .AppendLine("- Stay strictly inside the requested phase contract.");

        if (contract.ResponseFormat == PhaseArtifactResponseFormat.Json)
        {
            builder.AppendLine("- Return only structured JSON that conforms to the response schema.");
        }
        else
        {
            builder
                .AppendLine("- Return only the complete Markdown artifact for this phase.")
                .AppendLine("- Do not wrap the Markdown artifact in code fences.")
                .AppendLine("- Do not return JSON or prose outside the Markdown artifact.");
        }

        if (!string.IsNullOrWhiteSpace(context.OperationPrompt))
        {
            builder
                .AppendLine("- Treat the current phase artifact as the document under edit, not as a discarded draft.")
                .AppendLine("- Preserve valid content unless the requested operation requires a change.")
                .AppendLine(contract.ResponseFormat == PhaseArtifactResponseFormat.Json
                    ? "- Update the structured fields so the requested correction becomes explicit in the rendered artifact."
                    : "- Update the Markdown sections so the requested correction becomes explicit in the artifact.")
                .AppendLine("- Add a concise new history entry describing the operation when the phase artifact supports history.");
        }

        if (context.PhaseId == PhaseId.Refinement)
        {
            builder
                .AppendLine()
                .AppendLine("## Refinement Tolerance")
                .AppendLine()
                .AppendLine($"- Active tolerance: `{options.RefinementTolerance}`")
                .AppendLine($"- Guidance: {ResolveRefinementGuidance(options.RefinementTolerance)}")
                .AppendLine()
                .AppendLine("## Refinement Markdown Contract")
                .AppendLine()
                .AppendLine("Return the full `00-refinement.md` artifact as Markdown.")
                .AppendLine("Use the required headings exactly once: `## State`, `## Decision`, `## Reason`, and `## Questions`.")
                .AppendLine("Do not return JSON.")
                .AppendLine("If the story is ready for spec, write `ready_for_spec` in `## Decision` and include `1. No refinement questions remain.` in `## Questions`.")
                .AppendLine("If the story still needs refinement, write `needs_refinement` in `## Decision` and include the exact pending questions as a numbered list.");
        }

        if (context.PhaseId == PhaseId.Spec)
        {
            builder
                .AppendLine()
                .AppendLine("## Spec Markdown Contract")
                .AppendLine()
                .AppendLine("Return the full `01-spec.md` artifact as Markdown.")
                .AppendLine("Use the required headings exactly once.")
                .AppendLine("Do not return JSON.");
        }

        if (context.PhaseId == PhaseId.Review)
        {
            var requiredValidationChecklist = await ReadReviewValidationChecklistAsync(context, cancellationToken);
            if (requiredValidationChecklist.Count > 0)
            {
                builder
                    .AppendLine("## Required Review Validation Checklist")
                    .AppendLine()
                    .AppendLine("Every item below must be evaluated explicitly in `validationChecklist` with concrete evidence gathered during review.")
                    .AppendLine();

                foreach (var item in requiredValidationChecklist)
                {
                    builder.AppendLine($"- {item}");
                }

                builder.AppendLine();
            }

            builder
                .AppendLine()
                .AppendLine("## Review Tolerance")
                .AppendLine()
                .AppendLine($"- Active tolerance: `{options.ReviewTolerance}`")
                .AppendLine($"- Guidance: {ResolveReviewGuidance(options.ReviewTolerance)}")
                .AppendLine()
                .AppendLine("## Review Execution Expectations")
                .AppendLine()
                .AppendLine("- Inspect the repository files and implementation evidence directly, not only the artifact narrative.")
                .AppendLine("- Run the most relevant validation commands required to verify the Technical Design validation strategy when direct inspection alone is insufficient.")
                .AppendLine("- In each checklist evidence field, name the concrete files, commands, or artifacts you actually inspected.")
                .AppendLine()
                .AppendLine("Return only structured data that conforms to the response schema.");
        }

        if (context.PhaseId is PhaseId.TechnicalDesign or PhaseId.Implementation)
        {
            builder
                .AppendLine()
                .AppendLine("## Markdown Output")
                .AppendLine()
                .AppendLine("Return the complete phase artifact as Markdown.")
                .AppendLine("Use the required headings from the phase prompt exactly once.")
                .AppendLine("Do not return JSON.");
        }

        if (context.PhaseId == PhaseId.ReleaseApproval)
        {
            builder
                .AppendLine()
                .AppendLine("## Release Approval Markdown Contract")
                .AppendLine()
                .AppendLine("Return the full release approval artifact as Markdown.")
                .AppendLine("Use the required headings exactly once.")
                .AppendLine("Do not return JSON.");
        }

        if (context.PhaseId == PhaseId.PrPreparation)
        {
            builder
                .AppendLine()
                .AppendLine("## PR Preparation Contract")
                .AppendLine()
                .AppendLine("Return only structured data that conforms to the response schema.")
                .AppendLine("Every required field must be populated with repository-grounded content.")
                .AppendLine("Do not return placeholder-only values such as empty strings, empty arrays, `...`, `TODO`, or generic filler.")
                .AppendLine("Every list-valued field in this phase must be a JSON array of strings.")
                .AppendLine("Do not collapse array fields into one markdown string and do not return objects where the schema expects string arrays.")
                .AppendLine("`prTitle` must be a publishable draft PR title.")
                .AppendLine("`prSummary` must explain the delivered scope in 1-3 concrete sentences.")
                .AppendLine("`changeNarrative`, `validationSummary`, and `reviewerChecklist` must each contain at least one concrete item.")
                .AppendLine("`prBody` must be a JSON array of strings, one markdown line per array item.")
                .AppendLine("`prBody` must contain a complete reviewer-ready markdown body, not a template stub.")
                .AppendLine("If the available repository context is insufficient, say so explicitly inside the required fields while still filling the schema with concrete blocking detail.");
        }

        return new EffectivePrompt(systemPrompt, builder.ToString().Trim(), warnings);
    }

    private async Task<EffectivePrompt> BuildAutoRefinementAnswersPromptAsync(
        PhaseExecutionContext context,
        RefinementSession session,
        CancellationToken cancellationToken)
    {
        var paths = new PromptFilePaths(context.WorkspaceRoot);
        var modelSelection = ResolveAutoRefinementAnswersModelSelection();
        var sharedSystemPrompt = await promptCatalog.ReadPromptAsync(context.WorkspaceRoot, paths.SharedSystemPromptPath, cancellationToken);
        var refinementSystemPrompt = await promptCatalog.ReadPromptAsync(context.WorkspaceRoot, paths.RefinementExecuteSystemPromptPath, cancellationToken);
        var autoRefinementAnswersSystemPrompt = await promptCatalog.ReadPromptAsync(context.WorkspaceRoot, paths.AutoRefinementAnswersSystemPromptPath, cancellationToken);
        var sharedStylePrompt = await promptCatalog.ReadPromptAsync(context.WorkspaceRoot, paths.SharedStylePromptPath, cancellationToken);
        var sharedOutputRulesPrompt = await promptCatalog.ReadPromptAsync(context.WorkspaceRoot, paths.SharedOutputRulesPromptPath, cancellationToken);
        var phasePrompt = await promptCatalog.ReadPromptAsync(context.WorkspaceRoot, paths.RefinementExecutePromptPath, cancellationToken);
        var userStory = await File.ReadAllTextAsync(context.UserStoryPath, cancellationToken);
        var warnings = BuildPromptWarnings(sharedSystemPrompt, refinementSystemPrompt, autoRefinementAnswersSystemPrompt);
        var refinementLogPath = Path.Combine(Path.GetDirectoryName(context.UserStoryPath)!, "refinement.md");
        var refinementLog = File.Exists(refinementLogPath)
            ? await File.ReadAllTextAsync(refinementLogPath, cancellationToken)
            : string.Empty;
        var systemPrompt = string.Join(
            $"{Environment.NewLine}{Environment.NewLine}",
            new[]
            {
                options.SystemPrompt,
                sharedSystemPrompt.Content.Trim(),
                refinementSystemPrompt.Content.Trim(),
                autoRefinementAnswersSystemPrompt.Content.Trim(),
                BuildAgentSystemPrompt(modelSelection),
                sharedStylePrompt.Content.Trim(),
                sharedOutputRulesPrompt.Content.Trim()
            }.Where(static part => !string.IsNullOrWhiteSpace(part)));

        var builder = new StringBuilder()
            .AppendLine(phasePrompt.Content.Trim())
            .AppendLine()
            .AppendLine("## Auto Refinement Answer Task")
            .AppendLine()
            .AppendLine("You are helping SpecForge answer pending refinement questions before spec continues.")
            .AppendLine("Use only evidence from the user story, recorded refinement log, repository context files, and current workflow artifacts.")
            .AppendLine("Set `canResolve` to true only if every pending question can be answered credibly enough to retry refinement without user input.")
            .AppendLine("If any question still needs human confirmation, set `canResolve` to false and return `null` for the uncertain answers.")
            .AppendLine()
            .AppendLine("## Runtime Context")
            .AppendLine()
            .AppendLine($"- Workspace root: `{context.WorkspaceRoot}`")
            .AppendLine($"- US ID: `{context.UsId}`")
            .AppendLine($"- Phase: `Refinement`")
            .AppendLine($"- Auto-answer agent: `{modelSelection.AgentName ?? "default"}`")
            .AppendLine($"- Auto-answer profile: `{modelSelection.ProfileName ?? "default"}`")
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

        if (!string.IsNullOrWhiteSpace(refinementLog))
        {
            builder
                .AppendLine("## Refinement Log")
                .AppendLine()
                .AppendLine($"Path: `{refinementLogPath}`")
                .AppendLine()
                .AppendLine(refinementLog.Trim())
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

    private static string BuildMarkdownOutputRulesPrompt() =>
        """
        Return only the complete Markdown artifact for the requested phase.
        Do not wrap the response in code fences.
        Do not return JSON.
        Preserve the expected headings and semantic sections of the target artifact.
        If required context is missing or contradictory, state it explicitly inside the Markdown artifact instead of hiding the issue.
        """;

    private static string BuildAgentSystemPrompt(ResolvedModelSelection modelSelection)
    {
        if (string.IsNullOrWhiteSpace(modelSelection.AgentName))
        {
            return string.Empty;
        }

        return string.Join(
            Environment.NewLine,
            [
                "## Agent Profile",
                $"Name: {modelSelection.AgentName}",
                $"Role: {modelSelection.AgentRole ?? "unspecified"}",
                $"Repository access: {NormalizeRepositoryAccess(modelSelection.RepositoryAccess)}",
                $"Model profile: {modelSelection.ProfileName ?? "default"}",
                "Instructions:",
                string.IsNullOrWhiteSpace(modelSelection.AgentInstructions)
                    ? "Follow the phase contract exactly."
                    : modelSelection.AgentInstructions.Trim()
            ]);
    }

    private static IReadOnlyCollection<string>? BuildPromptWarnings(
        params RepositoryPromptCatalog.PromptTemplateContent[] prompts)
    {
        var warnings = new List<string>();
        foreach (var prompt in prompts.DistinctBy(static item => item.Path))
        {
            if (!prompt.IsOverride || prompt.EmbeddedContent is null)
            {
                continue;
            }

            var expectedHash = PromptSystemHashManifest.ComputeSha256(prompt.EmbeddedContent);
            var currentHash = PromptSystemHashManifest.ComputeSha256(prompt.Content);
            if (!string.Equals(expectedHash, currentHash, StringComparison.Ordinal))
            {
                warnings.Add(
                    $"Prompt override '{prompt.Path}' differs from the embedded SpecForge template. Expected hash `{expectedHash}`, current hash `{currentHash}`.");
            }
        }

        return warnings.Count == 0 ? null : warnings;
    }

    private static JsonElement BuildAutoRefinementAnswersSchema()
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

    private static AutoRefinementAnswersDocument ParseAutoRefinementAnswersDocument(string json)
    {
        using var document = JsonDocument.Parse(json);
        var root = document.RootElement;
        var answers = root.TryGetProperty("answers", out var answersElement) && answersElement.ValueKind == JsonValueKind.Array
            ? answersElement.EnumerateArray().Select(static item =>
                item.ValueKind == JsonValueKind.Null ? null : item.GetString()?.Trim()).ToArray()
            : [];
        return new AutoRefinementAnswersDocument(
            root.GetProperty("canResolve").GetBoolean(),
            root.GetProperty("reason").GetString()?.Trim() ?? string.Empty,
            answers);
    }

    private async Task<PhaseExecutionResult> ExecuteViaNativeCliAsync(
        PhaseExecutionContext context,
        EffectivePrompt prompt,
        ResolvedModelSelection modelSelection,
        CancellationToken cancellationToken)
    {
        SpecForgeDiagnostics.Log(
            $"[provider.native] usId={context.UsId} phase={context.PhaseId} provider={modelSelection.ProviderKind} profile={modelSelection.ProfileName ?? "default"} model={(string.IsNullOrWhiteSpace(modelSelection.Model) ? "(default)" : modelSelection.Model)}");
        if (!StructuredPhaseArtifactContracts.TryGet(context.PhaseId, out var contract))
        {
            throw new InvalidOperationException($"Phase '{context.PhaseId}' does not expose a structured output contract for native provider execution.");
        }

        var nativePrompt = NativeCliPromptBuilder.BuildPhasePrompt(
            context,
            prompt,
            modelSelection.ProviderKind,
            contract);
        var sandboxMode = context.PhaseId is PhaseId.Implementation or PhaseId.Review
            ? "workspace-write"
            : "read-only";
        var baselineWorkspaceChanges = context.PhaseId == PhaseId.Implementation
            ? await TryCaptureGitStatusSnapshotAsync(context.WorkspaceRoot, cancellationToken)
            : null;
        var response = await ExecuteStructuredNativeAsync(
            context.WorkspaceRoot,
            nativePrompt,
            modelSelection,
            contract.ResponseFormat == PhaseArtifactResponseFormat.Json ? contract.JsonSchema.GetRawText() : null,
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

        var canonicalJsonContent = contract.ResponseFormat == PhaseArtifactResponseFormat.Json
            ? NormalizePhaseJsonContent(context, response.Trim())
            : null;
        var normalizedContent = NormalizePhaseContent(context, canonicalJsonContent ?? response.Trim());

        return new PhaseExecutionResult(
            normalizedContent,
            ExecutionKind: modelSelection.ProviderKind,
            Usage: null,
            Execution: new PhaseExecutionMetadata(
                ProviderKind: modelSelection.ProviderKind,
                Model: string.IsNullOrWhiteSpace(modelSelection.Model) ? "default" : modelSelection.Model,
                ProfileName: modelSelection.ProfileName,
                AgentName: modelSelection.AgentName,
                AgentRole: modelSelection.AgentRole,
                Warnings: prompt.Warnings,
                InputSha256: ComputeSha256(nativePrompt),
                OutputSha256: ComputeSha256(response),
                StructuredOutputSha256: ComputeSha256(canonicalJsonContent)),
            canonicalJsonContent);
    }

    private static string? ComputeSha256(string? content)
    {
        if (string.IsNullOrWhiteSpace(content))
        {
            return null;
        }

        return Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(content))).ToLowerInvariant();
    }

    private async Task<string> ExecuteStructuredNativeAsync(
        string workspaceRoot,
        string prompt,
        ResolvedModelSelection modelSelection,
        string? outputSchemaJson,
        string sandboxMode,
        CancellationToken cancellationToken)
    {
        var nativeCliRunner = ResolveNativeCliRunner(modelSelection.ProviderKind);
        if (nativeCliRunner is null || !nativeCliRunner.IsAvailable)
        {
            throw new InvalidOperationException(
                $"{modelSelection.ProviderKind} CLI is not available for native provider execution.");
        }

        await using var diagnostics = SpecForgeDiagnostics.StartProgressScope(
            $"[provider.native.cli] provider={modelSelection.ProviderKind} profile={modelSelection.ProfileName ?? "default"} model={(string.IsNullOrWhiteSpace(modelSelection.Model) ? "(default)" : modelSelection.Model)} sandbox={sandboxMode}",
            interval: TimeSpan.FromSeconds(20));
        var checkResult = await nativeCliRunner.CheckAvailabilityAsync(cancellationToken);
        SpecForgeDiagnostics.Log(
            $"[provider.native.check] provider={modelSelection.ProviderKind} command=\"{checkResult.Command}\" exitCode={checkResult.ExitCode} stdout={FormatProcessOutputForLog(checkResult.StandardOutput)} stderr={FormatProcessOutputForLog(checkResult.StandardError)}");
        if (checkResult.ExitCode != 0)
        {
            throw new InvalidOperationException(
                $"{modelSelection.ProviderKind} CLI health check failed with exit code {checkResult.ExitCode}. stderr: {checkResult.StandardError.Trim()} stdout: {checkResult.StandardOutput.Trim()}");
        }

        var response = await nativeCliRunner.ExecuteAsync(
            new NativeCliInvocation(
                modelSelection.ProviderKind,
                workspaceRoot,
                prompt,
                string.IsNullOrWhiteSpace(modelSelection.Model) ? null : modelSelection.Model,
                modelSelection.ReasoningEffort,
                outputSchemaJson,
                sandboxMode),
            cancellationToken);
        diagnostics.MarkCompleted($"responseChars={response.Length}");
        return response;
    }

    private static async Task EnsureImplementationTouchedWorkspaceAsync(
        string workspaceRoot,
        string userStoryPath,
        IReadOnlyCollection<GitStatusSnapshotEntry>? baselineWorkspaceChanges,
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
            .Except(baselineWorkspaceChanges)
            .Where(change => !IsIgnoredWorkflowChange(change.StatusLine, relativeUserStoryRoot))
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

        if (gitStatusLine.Length <= 3)
        {
            return false;
        }

        var pathPortion = gitStatusLine[3..].Trim();
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

    private static async Task<IReadOnlyCollection<string>> ReadReviewValidationChecklistAsync(
        PhaseExecutionContext context,
        CancellationToken cancellationToken)
    {
        if (!context.PreviousArtifactPaths.TryGetValue(PhaseId.TechnicalDesign, out var technicalDesignPath) ||
            string.IsNullOrWhiteSpace(technicalDesignPath) ||
            !File.Exists(technicalDesignPath))
        {
            return Array.Empty<string>();
        }

        var technicalDesign = await File.ReadAllTextAsync(technicalDesignPath, cancellationToken);
        var validationSection = TryReadMarkdownSection(technicalDesign, "## Validation Strategy");
        if (string.IsNullOrWhiteSpace(validationSection))
        {
            return Array.Empty<string>();
        }

        return validationSection
            .Split(['\r', '\n'], StringSplitOptions.RemoveEmptyEntries)
            .Select(static line => line.Trim())
            .Where(static line => line.StartsWith("- ", StringComparison.Ordinal))
            .Select(static line => line[2..].Trim())
            .Where(static line => !string.IsNullOrWhiteSpace(line))
            .ToArray();
    }

    private static string? TryReadMarkdownSection(string markdown, string heading)
    {
        var lines = markdown.Replace("\r\n", "\n", StringComparison.Ordinal).Split('\n');
        for (var index = 0; index < lines.Length; index++)
        {
            if (!string.Equals(lines[index], heading, StringComparison.Ordinal))
            {
                continue;
            }

            var builder = new StringBuilder();
            for (var cursor = index + 1; cursor < lines.Length; cursor++)
            {
                if (lines[cursor].StartsWith("## ", StringComparison.Ordinal))
                {
                    break;
                }

                builder.AppendLine(lines[cursor]);
            }

            return builder.ToString().Trim();
        }

        return null;
    }

    private static async Task<IReadOnlyCollection<GitStatusSnapshotEntry>?> TryCaptureGitStatusSnapshotAsync(
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
            .Split(['\r', '\n'], StringSplitOptions.RemoveEmptyEntries)
            .Select(statusLine => BuildGitStatusSnapshotEntry(workspaceRoot, statusLine))
            .ToArray();
    }

    private static GitStatusSnapshotEntry BuildGitStatusSnapshotEntry(string workspaceRoot, string statusLine)
    {
        var fingerprints = ParseGitStatusCandidatePaths(statusLine)
            .Select(candidatePath => BuildPathFingerprint(workspaceRoot, candidatePath))
            .ToArray();

        return new GitStatusSnapshotEntry(statusLine, string.Join("|", fingerprints));
    }

    private static IEnumerable<string> ParseGitStatusCandidatePaths(string gitStatusLine)
    {
        if (string.IsNullOrWhiteSpace(gitStatusLine))
        {
            return [];
        }

        if (gitStatusLine.Length <= 3)
        {
            return [];
        }

        var pathPortion = gitStatusLine[3..].Trim();
        if (string.IsNullOrWhiteSpace(pathPortion))
        {
            return [];
        }

        return pathPortion
            .Split(" -> ", StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries)
            .Select(static path => path.Replace('\\', '/'));
    }

    private static string BuildPathFingerprint(string workspaceRoot, string relativePath)
    {
        var absolutePath = Path.Combine(
            workspaceRoot,
            relativePath.Replace('/', Path.DirectorySeparatorChar));

        if (Directory.Exists(absolutePath))
        {
            return $"{relativePath}:dir";
        }

        if (!File.Exists(absolutePath))
        {
            return $"{relativePath}:missing";
        }

        using var stream = File.OpenRead(absolutePath);
        var hash = Convert.ToHexString(SHA256.HashData(stream));
        return $"{relativePath}:{hash}";
    }

    private ResolvedModelSelection ResolveModelSelection(PhaseId phaseId)
    {
        var agent = ResolveAgentForPhase(phaseId);
        return ResolveModelSelectionForAgent(agent, phaseId);
    }

    private ResolvedModelSelection ResolveAutoRefinementAnswersModelSelection()
    {
        var agent = string.IsNullOrWhiteSpace(options.AutoRefinementAnswersProfile)
            ? ResolveAgentForPhase(PhaseId.Refinement)
            : ResolveAgentByName(options.AutoRefinementAnswersProfile.Trim(), PhaseId.Refinement);

        return ResolveModelSelectionForAgent(agent, PhaseId.Refinement);
    }

    private ResolvedModelSelection ResolveModelSelectionForAgent(
        OpenAiCompatibleAgentProfile agent,
        PhaseId phaseId)
    {
        var profileName = agent.ModelProfile;
        var profile = options.ModelProfiles!.FirstOrDefault(candidate =>
            string.Equals(candidate.Name, profileName, StringComparison.Ordinal));

        if (profile is null)
        {
            throw new InvalidOperationException($"Agent profile '{agent.Name}' references missing model profile '{profileName}' for phase '{phaseId}'.");
        }

        return new ResolvedModelSelection(
            NormalizeProviderKind(profile.Provider),
            profile.BaseUrl,
            profile.ApiKey,
            profile.Model,
            NormalizeReasoningEffort(agent.ReasoningEffort ?? profile.ReasoningEffort),
            profile.Name,
            agent.RepositoryAccess,
            agent.Name,
            agent.Role,
            agent.Instructions);
    }

    private INativeCliRunner? ResolveNativeCliRunner(string providerKind) =>
        nativeCliRunners.TryGetValue(providerKind, out var runner) ? runner : null;

    private static bool RequiresNativeCli(ResolvedModelSelection modelSelection) =>
        string.Equals(modelSelection.ProviderKind, CodexProviderKind, StringComparison.Ordinal) ||
        (IsNativeCliCapableProviderKind(modelSelection.ProviderKind) &&
         string.IsNullOrWhiteSpace(modelSelection.BaseUrl));

    private bool ShouldUseNativeCli(ResolvedModelSelection modelSelection)
    {
        var nativeCliRunner = ResolveNativeCliRunner(modelSelection.ProviderKind);
        return nativeCliRunner?.IsAvailable == true;
    }

    private static string ResolveNativeCliBlockingReason(string providerKind) =>
        providerKind switch
        {
            CodexProviderKind => PhaseExecutionBlockingReasons.CodexCliNotFound,
            ClaudeProviderKind => PhaseExecutionBlockingReasons.ClaudeCliNotFound,
            CopilotProviderKind => PhaseExecutionBlockingReasons.CopilotCliNotFound,
            _ => PhaseExecutionBlockingReasons.CodexCliNotFound
        };

    private OpenAiCompatibleAgentProfile ResolveAgentForPhase(PhaseId phaseId)
    {
        var agentName = ResolveAgentNameForPhase(phaseId);
        return ResolveAgentByName(agentName, phaseId);
    }

    private OpenAiCompatibleAgentProfile ResolveAgentByName(string agentName, PhaseId phaseId)
    {
        var agent = options.AgentProfiles!.FirstOrDefault(candidate =>
            string.Equals(candidate.Name, agentName, StringComparison.Ordinal));

        if (agent is null)
        {
            throw new InvalidOperationException($"Agent profile '{agentName}' was not found for phase '{phaseId}'.");
        }

        return agent;
    }

    private string ResolveAgentNameForPhase(PhaseId phaseId)
    {
        var assignments = options.PhaseAgentAssignments;
        var explicitName = phaseId switch
        {
            PhaseId.Capture => assignments?.CaptureAgent,
            PhaseId.Refinement => assignments?.RefinementAgent,
            PhaseId.Spec => assignments?.SpecAgent,
            PhaseId.TechnicalDesign => assignments?.TechnicalDesignAgent,
            PhaseId.Implementation => assignments?.ImplementationAgent,
            PhaseId.Review => assignments?.ReviewAgent,
            PhaseId.ReleaseApproval => assignments?.ReleaseApprovalAgent,
            PhaseId.PrPreparation => assignments?.PrPreparationAgent,
            _ => assignments?.DefaultAgent
        };

        if (!string.IsNullOrWhiteSpace(explicitName))
        {
            return explicitName;
        }

        var defaultAgentName = assignments?.DefaultAgent;
        if (!string.IsNullOrWhiteSpace(defaultAgentName))
        {
            return defaultAgentName;
        }

        if (options.AgentProfiles?.Count == 1)
        {
            return options.AgentProfiles[0].Name;
        }

        throw new InvalidOperationException("A default agent assignment is required when multiple agent profiles are configured.");
    }

    private double ResolveTemperature(PhaseId phaseId) =>
        phaseId switch
        {
            PhaseId.Refinement => ResolveToleranceTemperature(options.RefinementTolerance),
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

    private static string ResolveRefinementGuidance(string tolerance) =>
        NormalizeTolerance(tolerance) switch
        {
            StrictTolerance =>
                "Be conservative. Ask for refinement whenever actor, trigger, business behavior, inputs, outputs, rules, or acceptance intent are materially ambiguous.",
            InferentialTolerance =>
                "Be permissive. Prefer `ready_for_spec` when the core actor, outcome, and flow are understandable, and infer reasonable defaults unless a missing detail would likely invalidate spec.",
            _ =>
                "Use balanced judgment. Ask only for gaps that would block a credible spec, but do not invent business-critical facts."
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

    private static bool IsNativeCliCapableProviderKind(string providerKind) =>
        providerKind is CodexProviderKind or ClaudeProviderKind or CopilotProviderKind;

    private static bool IsSupportedRepositoryAccess(string? repositoryAccess) =>
        NormalizeRepositoryAccess(repositoryAccess) is RepositoryAccessNone or RepositoryAccessRead or RepositoryAccessReadWrite;

    private static bool IsSupportedReasoningEffort(string? reasoningEffort) =>
        string.IsNullOrWhiteSpace(reasoningEffort) || NormalizeReasoningEffort(reasoningEffort) is not null;

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

    private static string? NormalizeReasoningEffort(string? reasoningEffort)
    {
        var normalized = string.IsNullOrWhiteSpace(reasoningEffort)
            ? null
            : reasoningEffort.Trim().ToLowerInvariant();

        return normalized switch
        {
            "none" => "none",
            "minimal" => "minimal",
            "low" => "low",
            "medium" => "medium",
            "high" => "high",
            "xhigh" => "xhigh",
            _ => null
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
        IReadOnlyList<OpenAiCompatibleModelProfile> modelProfiles)
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

            if (!IsNativeCliCapableProviderKind(providerKind) &&
                string.IsNullOrWhiteSpace(profile.BaseUrl))
            {
                throw new ArgumentException($"BaseUrl is required for model profile '{profile.Name}'.", nameof(modelProfiles));
            }

            if (!IsNativeCliCapableProviderKind(providerKind) &&
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

            if (!IsSupportedReasoningEffort(profile.ReasoningEffort))
            {
                throw new ArgumentException(
                    $"ReasoningEffort must be one of: none, minimal, low, medium, high, xhigh for model profile '{profile.Name}'.",
                    nameof(modelProfiles));
            }

            if (!IsNativeCliCapableProviderKind(providerKind) &&
                RequiresApiKey(profile.BaseUrl) && string.IsNullOrWhiteSpace(profile.ApiKey))
            {
                throw new ArgumentException($"ApiKey is required for remote model profile '{profile.Name}'.", nameof(modelProfiles));
            }
        }
    }

    private static void ValidateAgentProfiles(
        IReadOnlyList<OpenAiCompatibleAgentProfile>? agentProfiles,
        OpenAiCompatiblePhaseAgentAssignments? assignments,
        IReadOnlyList<OpenAiCompatibleModelProfile> modelProfiles)
    {
        if (agentProfiles is not { Count: > 0 })
        {
            throw new ArgumentException("At least one agent profile is required when model-backed execution is configured.", nameof(agentProfiles));
        }

        var modelProfileNames = modelProfiles.Select(static profile => profile.Name).ToHashSet(StringComparer.Ordinal);
        var agentNames = new HashSet<string>(StringComparer.Ordinal);
        foreach (var agent in agentProfiles)
        {
            if (string.IsNullOrWhiteSpace(agent.Name))
            {
                throw new ArgumentException("Agent profile Name is required.", nameof(agentProfiles));
            }

            if (!agentNames.Add(agent.Name))
            {
                throw new ArgumentException($"Duplicate agent profile '{agent.Name}'.", nameof(agentProfiles));
            }

            if (string.IsNullOrWhiteSpace(agent.ModelProfile) || !modelProfileNames.Contains(agent.ModelProfile))
            {
                throw new ArgumentException($"Agent profile '{agent.Name}' references missing model profile '{agent.ModelProfile}'.", nameof(agentProfiles));
            }

            if (!IsSupportedRepositoryAccess(agent.RepositoryAccess))
            {
                throw new ArgumentException($"RepositoryAccess must be one of: {RepositoryAccessNone}, {RepositoryAccessRead}, {RepositoryAccessReadWrite} for agent profile '{agent.Name}'.", nameof(agentProfiles));
            }

            if (!IsSupportedReasoningEffort(agent.ReasoningEffort))
            {
                throw new ArgumentException($"ReasoningEffort must be one of: none, minimal, low, medium, high, xhigh for agent profile '{agent.Name}'.", nameof(agentProfiles));
            }
        }

        var defaultAgentName = assignments?.DefaultAgent;
        if (string.IsNullOrWhiteSpace(defaultAgentName) &&
            agentProfiles.Count > 1 &&
            !HasExplicitAgentsForAllModelDrivenPhases(assignments))
        {
            throw new ArgumentException(
                "DefaultAgent is required when multiple agent profiles are configured unless refinement, spec, technical design, implementation, and review each declare an explicit agent.",
                nameof(assignments));
        }

        foreach (var agentName in new[]
                 {
                     defaultAgentName,
                     assignments?.CaptureAgent,
                     assignments?.RefinementAgent,
                     assignments?.SpecAgent,
                     assignments?.TechnicalDesignAgent,
                     assignments?.ImplementationAgent,
                     assignments?.ReviewAgent,
                     assignments?.ReleaseApprovalAgent,
                     assignments?.PrPreparationAgent
                 })
        {
            if (!string.IsNullOrWhiteSpace(agentName) && !agentNames.Contains(agentName))
            {
                throw new ArgumentException($"Assigned agent profile '{agentName}' was not configured.", nameof(assignments));
            }
        }
    }

    private static void ValidateAutoRefinementAnswers(
        IReadOnlyCollection<string> names,
        OpenAiCompatibleProviderOptions options)
    {
        if (!options.AutoRefinementAnswersEnabled)
        {
            return;
        }

        if (string.IsNullOrWhiteSpace(options.AutoRefinementAnswersProfile))
        {
            throw new ArgumentException(
                "AutoRefinementAnswersProfile is required when AutoRefinementAnswersEnabled is true.",
                nameof(options));
        }

        if (!names.Contains(options.AutoRefinementAnswersProfile))
        {
            throw new ArgumentException(
                $"Auto refinement answers profile '{options.AutoRefinementAnswersProfile}' was not configured.",
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

    private static string? NormalizePhaseJsonContent(PhaseExecutionContext context, string content)
    {
        if (StructuredPhaseArtifactContracts.TryGet(context.PhaseId, out var contract))
        {
            return contract.NormalizeJsonContent(content);
        }

        return null;
    }

    private static bool HasExplicitAgentsForAllModelDrivenPhases(OpenAiCompatiblePhaseAgentAssignments? assignments) =>
        !string.IsNullOrWhiteSpace(assignments?.RefinementAgent)
        && !string.IsNullOrWhiteSpace(assignments?.SpecAgent)
        && !string.IsNullOrWhiteSpace(assignments?.TechnicalDesignAgent)
        && !string.IsNullOrWhiteSpace(assignments?.ImplementationAgent)
        && !string.IsNullOrWhiteSpace(assignments?.ReviewAgent);

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

    private static IEnumerable<INativeCliRunner> CreateNativeCliRunners()
    {
        yield return new SystemCodexCliRunner();
        yield return new SystemClaudeCliRunner();
        yield return new SystemCopilotCliRunner();
    }

    private static string FormatProcessOutputForLog(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return "\"\"";
        }

        var normalized = value.ReplaceLineEndings("\\n").Trim();
        if (normalized.Length > 320)
        {
            normalized = $"{normalized[..320]}...";
        }

        return $"\"{normalized.Replace("\"", "\\\"", StringComparison.Ordinal)}\"";
    }

    private sealed record GitStatusSnapshotEntry(string StatusLine, string Fingerprint);

    private sealed record AutoRefinementAnswersDocument(
        bool CanResolve,
        string Reason,
        IReadOnlyList<string?> Answers);

    private sealed record ResolvedModelSelection(
        string ProviderKind,
        string BaseUrl,
        string ApiKey,
        string Model,
        string? ReasoningEffort,
        string? ProfileName,
        string? RepositoryAccess,
        string? AgentName,
        string? AgentRole,
        string? AgentInstructions);

    internal sealed record NativeCliInvocation(
        string ProviderKind,
        string WorkspaceRoot,
        string Prompt,
        string? Model,
        string? ReasoningEffort,
        string? OutputSchemaJson,
        string SandboxMode);

    internal sealed record NativeCliCheckResult(
        string Command,
        int ExitCode,
        string StandardOutput,
        string StandardError);

    internal interface INativeCliRunner
    {
        string ProviderKind { get; }

        bool IsAvailable { get; }

        Task<NativeCliCheckResult> CheckAvailabilityAsync(CancellationToken cancellationToken);

        Task<string> ExecuteAsync(NativeCliInvocation invocation, CancellationToken cancellationToken);
    }

    internal abstract class NativeCliRunnerBase : INativeCliRunner
    {
        private readonly string? executablePath;

        protected NativeCliRunnerBase()
        {
            executablePath = ResolveExecutablePath();
        }

        public abstract string ProviderKind { get; }

        public bool IsAvailable => !string.IsNullOrWhiteSpace(executablePath);

        protected string ExecutablePath =>
            executablePath ?? throw new InvalidOperationException($"{ProviderKind} CLI executable could not be resolved.");

        protected abstract string ExecutablePathEnvVar { get; }

        protected abstract string[] CandidateExecutableNames { get; }

        protected virtual string? BundledExecutablePath => null;

        protected abstract IReadOnlyList<string> GetVersionArguments();

        public async Task<NativeCliCheckResult> CheckAvailabilityAsync(CancellationToken cancellationToken)
        {
            if (!IsAvailable)
            {
                throw new InvalidOperationException($"{ProviderKind} CLI executable could not be resolved.");
            }

            var result = await RunProcessAsync(GetVersionArguments(), workingDirectory: Environment.CurrentDirectory, cancellationToken: cancellationToken);
            return new NativeCliCheckResult(result.Command, result.ExitCode, result.StandardOutput, result.StandardError);
        }

        public abstract Task<string> ExecuteAsync(NativeCliInvocation invocation, CancellationToken cancellationToken);

        protected async Task<ProcessExecutionResult> RunProcessAsync(
            IReadOnlyList<string> arguments,
            string workingDirectory,
            CancellationToken cancellationToken,
            string? standardInput = null)
        {
            if (!IsAvailable)
            {
                throw new InvalidOperationException($"{ProviderKind} CLI executable could not be resolved.");
            }

            var startInfo = new ProcessStartInfo
            {
                FileName = ExecutablePath,
                WorkingDirectory = workingDirectory,
                RedirectStandardInput = standardInput is not null,
                RedirectStandardError = true,
                RedirectStandardOutput = true,
                UseShellExecute = false
            };

            foreach (var argument in arguments)
            {
                startInfo.ArgumentList.Add(argument);
            }

            var command = BuildSanitizedCommandForLog(ExecutablePath, arguments, standardInput);
            var stdout = new StringBuilder();
            var stderr = new StringBuilder();
            var outputLock = new object();
            var lastOutputAtUtc = DateTimeOffset.UtcNow;
            var stdoutChunksLogged = 0;
            var stderrChunksLogged = 0;
            var stdoutSuppressionLogged = false;
            var stderrSuppressionLogged = false;

            using var process = new Process { StartInfo = startInfo };
            process.Start();
            SpecForgeDiagnostics.Log(
                $"[provider.native.exec] provider={ProviderKind} command=\"{command}\" pid={process.Id} started.");
            using var cancellationRegistration = cancellationToken.Register(() =>
            {
                try
                {
                    if (!process.HasExited)
                    {
                        SpecForgeDiagnostics.Log(
                            $"[provider.native.exec] provider={ProviderKind} pid={process.Id} cancellation requested; killing process tree.");
                        process.Kill(entireProcessTree: true);
                    }
                }
                catch (InvalidOperationException)
                {
                }
                catch (Exception exception)
                {
                    SpecForgeDiagnostics.Log(
                        $"[provider.native.exec] provider={ProviderKind} pid={process.Id} failed to kill process tree after cancellation: {exception.Message}");
                }
            });

            var stdoutTask = ReadStreamAsync(process.StandardOutput, stdout, "stdout");
            var stderrTask = ReadStreamAsync(process.StandardError, stderr, "stderr");
            using var silenceCancellation = new CancellationTokenSource();
            var silenceTask = LogSilenceUntilExitAsync(silenceCancellation.Token);

            if (standardInput is not null)
            {
                await process.StandardInput.WriteAsync(standardInput);
                await process.StandardInput.FlushAsync();
                process.StandardInput.Close();
            }

            try
            {
                await process.WaitForExitAsync(cancellationToken);
            }
            catch (OperationCanceledException)
            {
                await silenceCancellation.CancelAsync();
                SpecForgeDiagnostics.Log(
                    $"[provider.native.exec] provider={ProviderKind} command=\"{command}\" pid={process.Id} canceled stdoutChars={stdout.Length} stderrChars={stderr.Length}.");
                throw;
            }

            await Task.WhenAll(stdoutTask, stderrTask);
            await silenceCancellation.CancelAsync();
            await silenceTask;

            SpecForgeDiagnostics.Log(
                $"[provider.native.exec] provider={ProviderKind} command=\"{command}\" pid={process.Id} exitCode={process.ExitCode} stdout={FormatProcessOutputForLog(stdout.ToString())} stderr={FormatProcessOutputForLog(stderr.ToString())}");

            return new ProcessExecutionResult(command, process.ExitCode, stdout.ToString(), stderr.ToString());

            async Task ReadStreamAsync(StreamReader reader, StringBuilder target, string streamName)
            {
                var buffer = new char[2048];
                try
                {
                    while (true)
                    {
                        var read = await reader.ReadAsync(buffer.AsMemory(), cancellationToken);
                        if (read == 0)
                        {
                            return;
                        }

                        var chunk = new string(buffer, 0, read);
                        var logChunk = false;
                        var logSuppression = false;
                        lock (outputLock)
                        {
                            target.Append(chunk);
                            lastOutputAtUtc = DateTimeOffset.UtcNow;
                            if (streamName == "stdout")
                            {
                                stdoutChunksLogged++;
                                logChunk = stdoutChunksLogged <= 12;
                                if (!logChunk && !stdoutSuppressionLogged)
                                {
                                    stdoutSuppressionLogged = true;
                                    logSuppression = true;
                                }
                            }
                            else
                            {
                                stderrChunksLogged++;
                                logChunk = stderrChunksLogged <= 12;
                                if (!logChunk && !stderrSuppressionLogged)
                                {
                                    stderrSuppressionLogged = true;
                                    logSuppression = true;
                                }
                            }
                        }

                        if (logChunk)
                        {
                            SpecForgeDiagnostics.Log(
                                $"[provider.native.exec.{streamName}] provider={ProviderKind} pid={process.Id} chunk={FormatProcessOutputForLog(chunk)}");
                        }
                        else if (logSuppression)
                        {
                            SpecForgeDiagnostics.Log(
                                $"[provider.native.exec.{streamName}] provider={ProviderKind} pid={process.Id} additional output suppressed until process completion.");
                        }
                    }
                }
                catch (OperationCanceledException)
                {
                }
            }

            async Task LogSilenceUntilExitAsync(CancellationToken silenceCancellationToken)
            {
                using var timer = new PeriodicTimer(TimeSpan.FromSeconds(30));
                try
                {
                    while (!process.HasExited && await timer.WaitForNextTickAsync(silenceCancellationToken))
                    {
                        if (process.HasExited)
                        {
                            return;
                        }

                        var silentFor = DateTimeOffset.UtcNow - lastOutputAtUtc;
                        if (silentFor >= TimeSpan.FromSeconds(30))
                        {
                            SpecForgeDiagnostics.Log(
                                $"[provider.native.exec] provider={ProviderKind} pid={process.Id} no stdout/stderr for {Math.Round(silentFor.TotalSeconds)}s.");
                        }
                    }
                }
                catch (OperationCanceledException)
                {
                }
            }
        }

        private string? ResolveExecutablePath()
        {
            var explicitPath = Environment.GetEnvironmentVariable(ExecutablePathEnvVar);
            if (!string.IsNullOrWhiteSpace(explicitPath) && File.Exists(explicitPath))
            {
                return explicitPath;
            }

            if (!string.IsNullOrWhiteSpace(BundledExecutablePath) && File.Exists(BundledExecutablePath))
            {
                return BundledExecutablePath;
            }

            var path = Environment.GetEnvironmentVariable("PATH");
            if (string.IsNullOrWhiteSpace(path))
            {
                return null;
            }

            foreach (var candidateDirectory in path.Split(Path.PathSeparator, StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
            {
                foreach (var executableName in CandidateExecutableNames)
                {
                    var candidatePath = Path.Combine(candidateDirectory, executableName);
                    if (File.Exists(candidatePath))
                    {
                        return candidatePath;
                    }
                }
            }

            return null;
        }
    }

    private static string BuildSanitizedCommandForLog(
        string executablePath,
        IReadOnlyList<string> arguments,
        string? standardInput)
    {
        var sanitizedArguments = new List<string>(arguments.Count + (standardInput is null ? 0 : 1));
        var promptArgumentCollapsed = false;

        for (var index = 0; index < arguments.Count; index++)
        {
            var argument = arguments[index];
            if (!promptArgumentCollapsed && LooksLikeEmbeddedPromptArgument(argument, index, arguments))
            {
                sanitizedArguments.Add($"<prompt:{argument.Length} chars>");
                promptArgumentCollapsed = true;
                continue;
            }

            sanitizedArguments.Add(argument);
        }

        if (standardInput is not null)
        {
            sanitizedArguments.Add($"<stdin:{standardInput.Length} chars>");
        }

        return $"{executablePath} {string.Join(' ', sanitizedArguments)}".TrimEnd();
    }

    private static bool LooksLikeEmbeddedPromptArgument(
        string argument,
        int index,
        IReadOnlyList<string> allArguments)
    {
        if (string.IsNullOrWhiteSpace(argument))
        {
            return false;
        }

        if (argument.Contains('\n') || argument.Contains('\r'))
        {
            return true;
        }

        var previous = index > 0 ? allArguments[index - 1] : null;
        if (string.Equals(previous, "--json-schema", StringComparison.Ordinal))
        {
            return false;
        }

        // Native CLI prompts are currently passed as the last positional argument.
        if (index == allArguments.Count - 1 && argument.Length > 512)
        {
            return true;
        }

        return false;
    }

    internal sealed class SystemCodexCliRunner : NativeCliRunnerBase
    {
        public override string ProviderKind => CodexProviderKind;

        protected override string ExecutablePathEnvVar => "SPECFORGE_CODEX_CLI_PATH";

        protected override string[] CandidateExecutableNames => ["codex"];

        protected override string? BundledExecutablePath => "/Applications/Codex.app/Contents/Resources/codex";

        protected override IReadOnlyList<string> GetVersionArguments() => ["--version"];

        public override async Task<string> ExecuteAsync(NativeCliInvocation invocation, CancellationToken cancellationToken)
        {
            var schemaPath = string.IsNullOrWhiteSpace(invocation.OutputSchemaJson)
                ? null
                : Path.Combine(Path.GetTempPath(), $"specforge-codex-schema-{Guid.NewGuid():N}.json");
            var outputPath = Path.Combine(Path.GetTempPath(), $"specforge-codex-output-{Guid.NewGuid():N}.txt");
            if (schemaPath is not null)
            {
                await File.WriteAllTextAsync(schemaPath, invocation.OutputSchemaJson!, cancellationToken);
            }

            try
            {
                var arguments = new List<string>
                {
                    "exec"
                };

                if (!string.IsNullOrWhiteSpace(invocation.Model))
                {
                    arguments.Add("-m");
                    arguments.Add(invocation.Model);
                }

                if (!string.IsNullOrWhiteSpace(invocation.ReasoningEffort))
                {
                    arguments.Add("-c");
                    arguments.Add($"model_reasoning_effort=\"{invocation.ReasoningEffort}\"");
                }

                arguments.Add("-C");
                arguments.Add(invocation.WorkspaceRoot);
                if (string.Equals(invocation.SandboxMode, "workspace-write", StringComparison.Ordinal))
                {
                    arguments.Add("--full-auto");
                }
                else
                {
                    arguments.Add("--sandbox");
                    arguments.Add(invocation.SandboxMode);
                }

                arguments.Add("--color");
                arguments.Add("never");
                if (schemaPath is not null)
                {
                    arguments.Add("--output-schema");
                    arguments.Add(schemaPath);
                }

                arguments.Add("-o");
                arguments.Add(outputPath);
                arguments.Add("-");

                var result = await RunProcessAsync(arguments, invocation.WorkspaceRoot, cancellationToken, invocation.Prompt);
                if (result.ExitCode != 0)
                {
                    throw new InvalidOperationException(
                        $"Codex CLI execution failed with exit code {result.ExitCode}. stderr: {result.StandardError.Trim()} stdout: {result.StandardOutput.Trim()}");
                }

                if (!File.Exists(outputPath))
                {
                    throw new InvalidOperationException("Codex CLI execution completed without writing the expected final response file.");
                }

                return await File.ReadAllTextAsync(outputPath, cancellationToken);
            }
            finally
            {
                if (schemaPath is not null)
                {
                    TryDelete(schemaPath);
                }

                TryDelete(outputPath);
            }
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

    internal sealed class SystemClaudeCliRunner : NativeCliRunnerBase
    {
        public override string ProviderKind => ClaudeProviderKind;

        protected override string ExecutablePathEnvVar => "SPECFORGE_CLAUDE_CLI_PATH";

        protected override string[] CandidateExecutableNames => ["claude"];

        protected override IReadOnlyList<string> GetVersionArguments() => ["--version"];

        public override async Task<string> ExecuteAsync(NativeCliInvocation invocation, CancellationToken cancellationToken)
        {
            var arguments = new List<string>
            {
                "-p"
            };

            if (!string.IsNullOrWhiteSpace(invocation.OutputSchemaJson))
            {
                arguments.Add("--output-format");
                arguments.Add("json");
                arguments.Add("--json-schema");
                arguments.Add(invocation.OutputSchemaJson);
            }

            arguments.AddRange([
                "--permission-mode",
                "bypassPermissions",
                "--add-dir",
                invocation.WorkspaceRoot
            ]);

            if (!string.IsNullOrWhiteSpace(invocation.Model))
            {
                arguments.Add("--model");
                arguments.Add(invocation.Model);
            }

            arguments.Add(invocation.Prompt);

            var result = await RunProcessAsync(arguments, invocation.WorkspaceRoot, cancellationToken);
            if (result.ExitCode != 0)
            {
                throw new InvalidOperationException(
                    $"Claude CLI execution failed with exit code {result.ExitCode}. stderr: {result.StandardError.Trim()} stdout: {result.StandardOutput.Trim()}");
            }

            return result.StandardOutput.Trim();
        }
    }

    internal sealed class SystemCopilotCliRunner : NativeCliRunnerBase
    {
        public override string ProviderKind => CopilotProviderKind;

        protected override string ExecutablePathEnvVar => "SPECFORGE_COPILOT_CLI_PATH";

        protected override string[] CandidateExecutableNames => ["gh"];

        protected override IReadOnlyList<string> GetVersionArguments() => ["copilot", "--", "--version"];

        public override async Task<string> ExecuteAsync(NativeCliInvocation invocation, CancellationToken cancellationToken)
        {
            var arguments = new List<string>
            {
                "copilot",
                "-p",
                invocation.Prompt
            };

            var result = await RunProcessAsync(arguments, invocation.WorkspaceRoot, cancellationToken);
            if (result.ExitCode != 0)
            {
                throw new InvalidOperationException(
                    $"Copilot CLI execution failed with exit code {result.ExitCode}. stderr: {result.StandardError.Trim()} stdout: {result.StandardOutput.Trim()}");
            }

            return result.StandardOutput.Trim();
        }
    }

    internal sealed record ProcessExecutionResult(
        string Command,
        int ExitCode,
        string StandardOutput,
        string StandardError);

    private sealed record StructuredOutputResponseFormat(
        [property: JsonPropertyName("type")] string Type,
        [property: JsonPropertyName("json_schema")] StructuredOutputJsonSchema JsonSchema);

    private sealed record StructuredOutputJsonSchema(
        [property: JsonPropertyName("name")] string Name,
        [property: JsonPropertyName("schema")] JsonElement Schema,
        [property: JsonPropertyName("strict")] bool Strict);
}
