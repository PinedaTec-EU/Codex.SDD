using System.Net;
using System.Net.Http;
using System.Diagnostics;
using System.Security.Cryptography;
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
    public async Task ExecuteAsync_SendsOpenAiCompatibleRequestAndReturnsSpecMarkdown()
    {
        await PrepareInitializedWorkspaceAsync();
        var handler = new CapturingFakeHttpMessageHandler(BuildMinimalSpecMarkdown());
        var httpClient = new HttpClient(handler);
        var provider = new OpenAiCompatiblePhaseExecutionProvider(
            httpClient,
            CreateOptions(
                model: "llama3.1",
                apiKey: "ollama-local"));
        var context = new PhaseExecutionContext(
            WorkspaceRoot: workspaceRoot,
            UsId: "US-0001",
            PhaseId: PhaseId.Spec,
            UserStoryPath: Path.Combine(workspaceRoot, ".specs", "us", "workflow", "US-0001", "us.md"),
            PreviousArtifactPaths: new Dictionary<PhaseId, string>(),
            ContextFilePaths: []);

        var result = await provider.ExecuteAsync(context);

        Assert.Equal("openai-compatible", result.ExecutionKind);
        Assert.Contains("# Spec · US-0001 · v01", result.Content);
        Assert.Contains("## Spec Summary", result.Content);
        Assert.NotNull(result.Usage);
        Assert.Equal(120, result.Usage!.InputTokens);
        Assert.Equal(48, result.Usage.OutputTokens);
        Assert.Equal(168, result.Usage.TotalTokens);
        Assert.NotNull(result.Execution);
        Assert.Equal("openai-compatible", result.Execution!.ProviderKind);
        Assert.Equal("llama3.1", result.Execution.Model);
        Assert.Equal("default", result.Execution.ProfileName);
        Assert.Equal(ComputeSha256(handler.LastBody), result.Execution.InputSha256);
        Assert.Equal(ComputeSha256(BuildMinimalSpecMarkdown()), result.Execution.OutputSha256);
        Assert.Null(result.Execution.StructuredOutputSha256);
        Assert.NotNull(handler.LastRequest);
        Assert.Equal(HttpMethod.Post, handler.LastRequest!.Method);
        Assert.Equal("http://localhost:11434/v1/chat/completions", handler.LastRequest.RequestUri!.ToString());
        Assert.Equal("Bearer", handler.LastRequest.Headers.Authorization?.Scheme);
        Assert.Equal("ollama-local", handler.LastRequest.Headers.Authorization?.Parameter);
        Assert.Contains("\"model\":\"llama3.1\"", handler.LastBody);
        Assert.Contains("\"stream\":true", handler.LastBody);
        Assert.Equal(0.2d, OpenAiCompatibleRequestJson.ReadTemperature(handler.LastBody));
        Assert.False(OpenAiCompatibleRequestJson.HasResponseFormat(handler.LastBody));
        Assert.Contains("Role: spec analyst.", handler.LastBody);
        Assert.Contains("Initial text", handler.LastBody);
        Assert.Contains("This is the system prompt for the spec execute template.", OpenAiCompatibleRequestJson.ReadSystemPrompt(handler.LastBody));
    }

    [Fact]
    public async Task ExecuteAsync_ReadsStreamingOpenAiCompatibleDeltas()
    {
        await PrepareInitializedWorkspaceAsync();
        var handler = new StreamingFakeHttpMessageHandler([
            "# Spec · US-0001 · v01\n",
            "\n## Spec Summary\nGenerated from streaming deltas."
        ]);
        var provider = new OpenAiCompatiblePhaseExecutionProvider(
            new HttpClient(handler),
            CreateOptions(
                model: "llama3.1",
                apiKey: "ollama-local"));
        var context = new PhaseExecutionContext(
            WorkspaceRoot: workspaceRoot,
            UsId: "US-0001",
            PhaseId: PhaseId.Spec,
            UserStoryPath: Path.Combine(workspaceRoot, ".specs", "us", "workflow", "US-0001", "us.md"),
            PreviousArtifactPaths: new Dictionary<PhaseId, string>(),
            ContextFilePaths: []);

        var result = await provider.ExecuteAsync(context);

        Assert.Contains("# Spec · US-0001 · v01", result.Content);
        Assert.Contains("Generated from streaming deltas.", result.Content);
        Assert.Contains("\"stream\":true", handler.LastBody);
    }

    [Fact]
    public async Task ExecuteAsync_LogsBufferedStreamingPreviewDeltas()
    {
        await PrepareInitializedWorkspaceAsync();
        using var stderr = new StringWriter();
        var originalStderr = Console.Error;
        Console.SetError(stderr);

        try
        {
            var handler = new StreamingFakeHttpMessageHandler([
                "#",
                " buffered ",
                new string('x', 80)
            ]);
            var provider = new OpenAiCompatiblePhaseExecutionProvider(
                new HttpClient(handler),
                CreateOptions(
                    model: "llama3.1",
                    apiKey: "ollama-local"));
            var context = new PhaseExecutionContext(
                WorkspaceRoot: workspaceRoot,
                UsId: "US-0001",
                PhaseId: PhaseId.Spec,
                UserStoryPath: Path.Combine(workspaceRoot, ".specs", "us", "workflow", "US-0001", "us.md"),
                PreviousArtifactPaths: new Dictionary<PhaseId, string>(),
                ContextFilePaths: []);

            await provider.ExecuteAsync(context);
        }
        finally
        {
            Console.SetError(originalStderr);
        }

        var diagnostics = stderr.ToString();
        Assert.Contains("mode=delta chunk=\"#\"", diagnostics);
        Assert.Contains($"mode=delta chunk=\" buffered {new string('x', 80)}\"", diagnostics);
    }

    [Fact]
    public async Task ExecuteAsync_SendsReasoningEffortForHttpProfiles()
    {
        await PrepareInitializedWorkspaceAsync();
        var handler = new CapturingFakeHttpMessageHandler(BuildMinimalSpecMarkdown());
        var provider = new OpenAiCompatiblePhaseExecutionProvider(
            new HttpClient(handler),
            CreateOptions(
                model: "gpt-5.4",
                baseUrl: "https://api.openai.com/v1",
                apiKey: "secret",
                reasoningEffort: "high"));
        var context = new PhaseExecutionContext(
            WorkspaceRoot: workspaceRoot,
            UsId: "US-0001",
            PhaseId: PhaseId.Spec,
            UserStoryPath: Path.Combine(workspaceRoot, ".specs", "us", "workflow", "US-0001", "us.md"),
            PreviousArtifactPaths: new Dictionary<PhaseId, string>(),
            ContextFilePaths: []);

        await provider.ExecuteAsync(context);

        Assert.Contains("\"reasoning_effort\":\"high\"", handler.LastBody);
    }

    [Fact]
    public async Task ExecuteAsync_PrPreparation_UsesMarkdownPayloadFromHttpProvider()
    {
        await PrepareInitializedWorkspaceAsync();
        var handler = new CapturingFakeHttpMessageHandler(
            """
            # PR Preparation · US-0001 · v01

            ## State
            - State: `ready_to_publish`

            ## Based On
            - 04-review.md

            ## PR Title
            US-0001 workflow handoff

            ## PR Summary
            Prepares the reviewed workflow scope for draft PR publication.

            ## Branch Summary
            - Branch metadata is available for publication.

            ## Participants
            - Codex — phases: pr-preparation

            ## Change Narrative
            - Summarizes the approved implementation and review artifacts.

            ## Validation Summary
            - Review evidence was inspected before PR handoff.

            ## Reviewer Checklist
            - [ ] Confirm review evidence still matches the branch delta.

            ## Risks and Follow Ups
            - No unresolved publication blockers were identified.

            ## PR Body
            ## Summary
            - Prepared reviewed scope for PR publication.

            ## Validation
            - Review artifact inspected.
            """);
        var provider = new OpenAiCompatiblePhaseExecutionProvider(
            new HttpClient(handler),
            CreateOptions(model: "llama3.1"));
        var reviewArtifactPath = Path.Combine(workspaceRoot, ".specs", "us", "workflow", "US-0001", "phases", "04-review.md");
        Directory.CreateDirectory(Path.GetDirectoryName(reviewArtifactPath)!);
        await File.WriteAllTextAsync(reviewArtifactPath, "# Review");
        var releaseApprovalPath = Path.Combine(workspaceRoot, ".specs", "us", "workflow", "US-0001", "phases", "05-release-approval.md");
        await File.WriteAllTextAsync(releaseApprovalPath, "# Release Approval");
        var timelinePath = Path.Combine(workspaceRoot, ".specs", "us", "workflow", "US-0001", "timeline.md");
        await File.WriteAllTextAsync(
            timelinePath,
            """
            - 2026-04-22T12:00:00Z | alice | spec | Generated the approved spec artifact.
            - 2026-04-22T12:10:00Z | bob | implementation | Implemented the approved workflow changes.
            """);
        var context = new PhaseExecutionContext(
            WorkspaceRoot: workspaceRoot,
            UsId: "US-0001",
            PhaseId: PhaseId.PrPreparation,
            UserStoryPath: Path.Combine(workspaceRoot, ".specs", "us", "workflow", "US-0001", "us.md"),
            PreviousArtifactPaths: new Dictionary<PhaseId, string>
            {
                [PhaseId.Review] = reviewArtifactPath,
                [PhaseId.ReleaseApproval] = releaseApprovalPath
            },
            ContextFilePaths: [timelinePath]);

        var result = await provider.ExecuteAsync(context);
        var artifact = PrPreparationArtifactJson.ParseMarkdown(result.Content);

        Assert.Equal("ready_to_publish", artifact.State);
        Assert.NotEmpty(artifact.BasedOn);
        Assert.NotEmpty(artifact.ChangeNarrative);
        Assert.NotEmpty(artifact.ValidationSummary);
        Assert.NotEmpty(artifact.ReviewerChecklist);
        Assert.NotEmpty(artifact.PrBody);
        Assert.Contains("US-0001", artifact.PrTitle);
        Assert.Contains("ready_to_publish", result.Content, StringComparison.OrdinalIgnoreCase);
        Assert.False(OpenAiCompatibleRequestJson.HasResponseFormat(handler.LastBody));
    }

    [Theory]
    [InlineData("strict", 0.0d, "Be conservative. Ask for refinement whenever actor, trigger, business behavior, inputs, outputs, rules, or acceptance intent are materially ambiguous.")]
    [InlineData("balanced", 0.2d, "Use balanced judgment. Ask only for gaps that would block a credible spec, but do not invent business-critical facts.")]
    [InlineData("inferential", 0.4d, "Be permissive. Prefer `ready_for_spec` when the core actor, outcome, and flow are understandable, and infer reasonable defaults unless a missing detail would likely invalidate spec.")]
    public async Task ExecuteAsync_RefinementTolerance_ChangesTemperatureAndPrompt(
        string refinementTolerance,
        double expectedTemperature,
        string expectedGuidance)
    {
        await PrepareInitializedWorkspaceAsync();
        var handler = new CapturingFakeHttpMessageHandler(BuildReadyRefinementMarkdown());
        var provider = new OpenAiCompatiblePhaseExecutionProvider(
            new HttpClient(handler),
            CreateOptions(
                model: "llama3.1",
                refinementTolerance: refinementTolerance));
        var context = new PhaseExecutionContext(
            WorkspaceRoot: workspaceRoot,
            UsId: "US-0001",
            PhaseId: PhaseId.Refinement,
            UserStoryPath: Path.Combine(workspaceRoot, ".specs", "us", "workflow", "US-0001", "us.md"),
            PreviousArtifactPaths: new Dictionary<PhaseId, string>(),
            ContextFilePaths: []);

        await provider.ExecuteAsync(context);

        Assert.Equal(expectedTemperature, OpenAiCompatibleRequestJson.ReadTemperature(handler.LastBody));
        var userPrompt = OpenAiCompatibleRequestJson.ReadUserPrompt(handler.LastBody);
        Assert.Contains($"Active tolerance: `{refinementTolerance}`", userPrompt);
        Assert.Contains(expectedGuidance, userPrompt);
    }

    [Fact]
    public async Task TryAutoAnswerRefinementAsync_UsesConfiguredProfileAndStructuredPrompt()
    {
        await PrepareInitializedWorkspaceAsync();
        var handler = new CapturingFakeHttpMessageHandler(BuildAutoRefinementAnswersMarkdown());
        var provider = new OpenAiCompatiblePhaseExecutionProvider(
            new HttpClient(handler),
            new OpenAiCompatibleProviderOptions(
                RefinementTolerance: "inferential",
                AutoRefinementAnswersEnabled: true,
                AutoRefinementAnswersProfile: "resolver",
                ModelProfiles:
                [
                    new OpenAiCompatibleModelProfile(
                        Name: "default",
                        Provider: "openai-compatible",
                        BaseUrl: "http://localhost:11434/v1",
                        ApiKey: string.Empty,
                        Model: "llama-light",
                        RepositoryAccess: "read"),
                    new OpenAiCompatibleModelProfile(
                        Name: "resolver",
                        Provider: "openai-compatible",
                        BaseUrl: "http://localhost:22434/v1",
                        ApiKey: string.Empty,
                        Model: "llama-resolver",
                        RepositoryAccess: "read")
                ],
                PhaseModelAssignments: new OpenAiCompatiblePhaseModelAssignments(
                    DefaultProfile: "default",
                    RefinementProfile: "default")));
        var context = new PhaseExecutionContext(
            WorkspaceRoot: workspaceRoot,
            UsId: "US-0001",
            PhaseId: PhaseId.Refinement,
            UserStoryPath: Path.Combine(workspaceRoot, ".specs", "us", "workflow", "US-0001", "us.md"),
            PreviousArtifactPaths: new Dictionary<PhaseId, string>(),
            ContextFilePaths: []);

        var result = await provider.TryAutoAnswerRefinementAsync(
            context,
            new RefinementSession(
                "needs_refinement",
                "inferential",
                "Missing business details.",
                [new RefinementItem(1, "Which role publishes the article?", null)]));

        Assert.NotNull(result);
        Assert.Equal("The available context is enough to answer the pending refinement.", result!.Reason);
        Assert.Equal("Marketing editor", result.Answers[0]);
        Assert.NotNull(result.Execution);
        Assert.Equal("resolver", result.Execution!.ProfileName);
        Assert.Equal("llama-resolver", result.Execution.Model);
        Assert.Equal("http://localhost:22434/v1/chat/completions", handler.LastRequest!.RequestUri!.ToString());
        Assert.False(OpenAiCompatibleRequestJson.HasResponseFormat(handler.LastBody));
        Assert.Contains("\"model\":\"llama-resolver\"", handler.LastBody);
        Assert.Contains("This is the system prompt for the refinement execute template.", OpenAiCompatibleRequestJson.ReadSystemPrompt(handler.LastBody));
        Assert.Contains("This is the system prompt for the internal auto refinement answer task.", OpenAiCompatibleRequestJson.ReadSystemPrompt(handler.LastBody));
        Assert.Contains("## Auto Refinement Answer Task", OpenAiCompatibleRequestJson.ReadUserPrompt(handler.LastBody));
        Assert.Contains("Which role publishes the article?", OpenAiCompatibleRequestJson.ReadUserPrompt(handler.LastBody));
    }

    [Fact]
    public async Task ExecuteAsync_WhenSystemPromptHashDiffers_ReturnsExecutionWarningAndUsesModifiedPrompt()
    {
        await PrepareInitializedWorkspaceAsync();
        var paths = new PromptFilePaths(workspaceRoot);
        await File.WriteAllTextAsync(
            paths.SpecExecuteSystemPromptPath,
            """
            This spec system prompt was modified outside the engine.
            """
        );
        var handler = new CapturingFakeHttpMessageHandler(BuildMinimalSpecMarkdown());
        var provider = new OpenAiCompatiblePhaseExecutionProvider(
            new HttpClient(handler),
            CreateOptions(
                model: "llama3.1",
                apiKey: "ollama-local"));
        var context = new PhaseExecutionContext(
            WorkspaceRoot: workspaceRoot,
            UsId: "US-0001",
            PhaseId: PhaseId.Spec,
            UserStoryPath: Path.Combine(workspaceRoot, ".specs", "us", "workflow", "US-0001", "us.md"),
            PreviousArtifactPaths: new Dictionary<PhaseId, string>(),
            ContextFilePaths: []);

        var result = await provider.ExecuteAsync(context);

        Assert.NotNull(result.Execution);
        Assert.NotNull(result.Execution!.Warnings);
        Assert.Contains(result.Execution.Warnings!, warning => warning.Contains("spec.execute.system.md", StringComparison.Ordinal));
        Assert.Contains("modified outside the engine", result.Execution.Warnings!.First());
        Assert.Contains("This spec system prompt was modified outside the engine.", OpenAiCompatibleRequestJson.ReadSystemPrompt(handler.LastBody));
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
        var handler = new CapturingFakeHttpMessageHandler(BuildMinimalReviewMarkdown());
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

        Assert.Equal(expectedTemperature, OpenAiCompatibleRequestJson.ReadTemperature(handler.LastBody));
        var userPrompt = OpenAiCompatibleRequestJson.ReadUserPrompt(handler.LastBody);
        Assert.Contains($"Active tolerance: `{reviewTolerance}`", userPrompt);
        Assert.Contains(expectedGuidance, userPrompt);
    }

    [Theory]
    [InlineData(true, "Persist only generalized lessons")]
    [InlineData(false, "do not modify skills, shared rules, or phase prompts")]
    public async Task ExecuteAsync_ImplementationRetry_IncludesReviewLearningPolicy(
        bool reviewLearningEnabled,
        string expectedPolicy)
    {
        await PrepareInitializedWorkspaceAsync();
        var paths = UserStoryFilePaths.FromWorkspaceRoot(workspaceRoot, "workflow", "US-0001");
        var reviewArtifactPath = paths.GetPhaseArtifactPath(PhaseId.Review);
        Directory.CreateDirectory(Path.GetDirectoryName(reviewArtifactPath)!);
        await File.WriteAllTextAsync(
            reviewArtifactPath,
            """
            # Review · US-0001 · v01

            ## Verdict
            - Result: `fail`
            - Primary reason: Implementation missed an edge case.
            """);

        var handler = new CapturingFakeHttpMessageHandler(BuildMinimalImplementationMarkdown());
        var provider = new OpenAiCompatiblePhaseExecutionProvider(
            new HttpClient(handler),
            CreateOptions(
                model: "llama3.1",
                reviewLearningEnabled: reviewLearningEnabled));
        var context = new PhaseExecutionContext(
            WorkspaceRoot: workspaceRoot,
            UsId: "US-0001",
            PhaseId: PhaseId.Implementation,
            UserStoryPath: paths.MainArtifactPath,
            PreviousArtifactPaths: new Dictionary<PhaseId, string>
            {
                [PhaseId.Review] = reviewArtifactPath
            },
            ContextFilePaths: []);

        await provider.ExecuteAsync(context);

        var userPrompt = OpenAiCompatibleRequestJson.ReadUserPrompt(handler.LastBody);
        Assert.Contains($"Review learning enabled: `{reviewLearningEnabled.ToString().ToLowerInvariant()}`", userPrompt);
        Assert.Contains(expectedPolicy, userPrompt);
        if (reviewLearningEnabled)
        {
            Assert.Contains("`.codex/skills/sdd-phase-agents/SKILL.md`", userPrompt);
        }
    }

    [Fact]
    public async Task ExecuteAsync_IncludesContextFileContentsInRuntimeContext()
    {
        await PrepareInitializedWorkspaceAsync();
        var attachmentDirectory = Path.Combine(workspaceRoot, ".specs", "us", "workflow", "US-0001", "context");
        Directory.CreateDirectory(attachmentDirectory);
        var attachmentPath = Path.Combine(attachmentDirectory, "notes.md");
        await File.WriteAllTextAsync(attachmentPath, "# Notes\nUseful attachment");
        var handler = new CapturingFakeHttpMessageHandler(BuildMinimalSpecMarkdown());
        var provider = new OpenAiCompatiblePhaseExecutionProvider(
            new HttpClient(handler),
            CreateOptions(
                model: "llama3.1",
                apiKey: "ollama-local"));
        var context = new PhaseExecutionContext(
            WorkspaceRoot: workspaceRoot,
            UsId: "US-0001",
            PhaseId: PhaseId.Spec,
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
        var handler = new CapturingFakeHttpMessageHandler(BuildMinimalSpecMarkdown());
        var provider = new OpenAiCompatiblePhaseExecutionProvider(
            new HttpClient(handler),
            CreateOptions(model: "llama3.1"));
        var context = new PhaseExecutionContext(
            WorkspaceRoot: workspaceRoot,
            UsId: "US-0001",
            PhaseId: PhaseId.Spec,
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
        var implementationHandler = new PhaseAwareFakeHttpMessageHandler(
            ("TechnicalDesign", BuildMinimalTechnicalDesignMarkdown()),
            ("Implementation", BuildMinimalImplementationMarkdown()));
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
                    TechnicalDesignProfile: "top",
                    ImplementationProfile: "top",
                    ReviewProfile: "light")));

        var technicalDesignContext = new PhaseExecutionContext(
            WorkspaceRoot: workspaceRoot,
            UsId: "US-0001",
            PhaseId: PhaseId.TechnicalDesign,
            UserStoryPath: Path.Combine(workspaceRoot, ".specs", "us", "workflow", "US-0001", "us.md"),
            PreviousArtifactPaths: new Dictionary<PhaseId, string>(),
            ContextFilePaths: []);

        await implementationProvider.ExecuteAsync(technicalDesignContext);

        Assert.Equal("http://localhost:22434/v1/chat/completions", implementationHandler.LastRequest!.RequestUri!.ToString());
        Assert.Contains("\"model\":\"llama-top\"", implementationHandler.LastBody);
        Assert.False(OpenAiCompatibleRequestJson.HasResponseFormat(implementationHandler.LastBody));

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
        Assert.False(OpenAiCompatibleRequestJson.HasResponseFormat(implementationHandler.LastBody));

        var reviewHandler = new CapturingFakeHttpMessageHandler(BuildMinimalReviewMarkdown());
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
        Assert.False(OpenAiCompatibleRequestJson.HasResponseFormat(reviewHandler.LastBody));
        Assert.NotNull(reviewResult.Execution);
        Assert.Equal("light", reviewResult.Execution!.ProfileName);
        Assert.Equal("llama-light", reviewResult.Execution.Model);
    }

    [Fact]
    public async Task ExecuteAsync_ReviewPrompt_IncludesImplementationEvidenceContext()
    {
        await PrepareInitializedWorkspaceAsync();
        var paths = UserStoryFilePaths.FromWorkspaceRoot(workspaceRoot, "workflow", "US-0001");
        Directory.CreateDirectory(paths.PhasesDirectoryPath);
        await File.WriteAllTextAsync(paths.GetPhaseArtifactPath(PhaseId.Spec), "# Spec · US-0001 · v01");
        await File.WriteAllTextAsync(
            paths.GetPhaseArtifactPath(PhaseId.TechnicalDesign),
            """
            # Technical Design · US-0001 · v01

            ## Validation Strategy
            - Run focused controller tests for sampling settings.
            - Verify runtime client sampling options are mapped correctly.
            """);
        await File.WriteAllTextAsync(paths.GetPhaseArtifactPath(PhaseId.Implementation), "# Implementation · US-0001 · v01");
        await File.WriteAllTextAsync(
            paths.GetPhaseEvidenceMarkdownPath(PhaseId.Implementation),
            """
            # Implementation Evidence

            ## Summary
            - Meaningful touched repository files detected: `1`.

            ## Touched Files
            - `src/Feature.cs` | kind=`content_changed`
            """);

        var handler = new CapturingFakeHttpMessageHandler(BuildMinimalReviewMarkdown());
        var provider = new OpenAiCompatiblePhaseExecutionProvider(
            new HttpClient(handler),
            CreateOptions(model: "gpt-4.1-mini"));
        var context = new PhaseExecutionContext(
            WorkspaceRoot: workspaceRoot,
            UsId: "US-0001",
            PhaseId: PhaseId.Review,
            UserStoryPath: paths.MainArtifactPath,
            PreviousArtifactPaths: new Dictionary<PhaseId, string>
            {
                [PhaseId.Spec] = paths.GetPhaseArtifactPath(PhaseId.Spec),
                [PhaseId.TechnicalDesign] = paths.GetPhaseArtifactPath(PhaseId.TechnicalDesign),
                [PhaseId.Implementation] = paths.GetPhaseArtifactPath(PhaseId.Implementation)
            },
            ContextFilePaths: [paths.GetPhaseEvidenceMarkdownPath(PhaseId.Implementation)]);

        await provider.ExecuteAsync(context);

        var userPrompt = OpenAiCompatibleRequestJson.ReadUserPrompt(handler.LastBody);
        Assert.Contains("## Context Files", userPrompt);
        Assert.Contains("03-implementation.evidence.md", userPrompt);
        Assert.Contains("Meaningful touched repository files detected: `1`.", userPrompt);
        Assert.Contains("src/Feature.cs", userPrompt);
        Assert.Contains("## Required Review Validation Checklist", userPrompt);
        Assert.Contains("Run focused controller tests for sampling settings.", userPrompt);
        Assert.Contains("Verify runtime client sampling options are mapped correctly.", userPrompt);
        Assert.Contains("## Review Execution Expectations", userPrompt);
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
        Assert.Equal("read-write", readiness.RequiredPermissions!.RepositoryAccess);
        Assert.Equal("read", readiness.AssignedModelSecurity!.RepositoryAccess);
    }

    [Fact]
    public void GetPhaseExecutionReadiness_BlocksReviewWithoutRepositoryWriteAccess()
    {
        var provider = new OpenAiCompatiblePhaseExecutionProvider(
            new HttpClient(new CapturingFakeHttpMessageHandler()),
            CreateOptions(model: "llama3.1", repositoryAccess: "read"));

        var readiness = provider.GetPhaseExecutionReadiness(PhaseId.Review);

        Assert.False(readiness.CanExecute);
        Assert.Equal(PhaseExecutionBlockingReasons.ReviewRequiresRepositoryWriteAccess, readiness.BlockingReason);
        Assert.Equal("read-write", readiness.RequiredPermissions!.RepositoryAccess);
        Assert.Equal("read", readiness.AssignedModelSecurity!.RepositoryAccess);
    }

    [Fact]
    public void GetPhaseExecutionReadiness_ReportsPhaseSpecificReadRequirements()
    {
        var provider = new OpenAiCompatiblePhaseExecutionProvider(
            new HttpClient(new CapturingFakeHttpMessageHandler()),
            CreateOptions(model: "llama3.1", repositoryAccess: "none"));

        var readiness = provider.GetPhaseExecutionReadiness(PhaseId.TechnicalDesign);

        Assert.False(readiness.CanExecute);
        Assert.Equal(PhaseExecutionBlockingReasons.TechnicalDesignRequiresRepositoryReadAccess, readiness.BlockingReason);
        Assert.Equal("read", readiness.RequiredPermissions!.RepositoryAccess);
        Assert.Equal("none", readiness.AssignedModelSecurity!.RepositoryAccess);
    }

    [Fact]
    public void GetPhaseExecutionReadiness_CodexProfileWithoutCli_BlocksExecution()
    {
        var provider = new OpenAiCompatiblePhaseExecutionProvider(
            new HttpClient(new CapturingFakeHttpMessageHandler()),
            CreateOptions(model: string.Empty, providerKind: "codex", baseUrl: string.Empty, apiKey: string.Empty),
            new RepositoryPromptCatalog(),
            [new FakeNativeCliRunner("codex", isAvailable: false)]);

        var readiness = provider.GetPhaseExecutionReadiness(PhaseId.Implementation);

        Assert.False(readiness.CanExecute);
        Assert.Equal(PhaseExecutionBlockingReasons.CodexCliNotFound, readiness.BlockingReason);
    }

    [Theory]
    [InlineData("claude", PhaseExecutionBlockingReasons.ClaudeCliNotFound)]
    [InlineData("copilot", PhaseExecutionBlockingReasons.CopilotCliNotFound)]
    public void GetPhaseExecutionReadiness_NativeProviderWithoutCliOrEndpoint_BlocksExecution(
        string providerKind,
        string expectedBlockingReason)
    {
        var provider = new OpenAiCompatiblePhaseExecutionProvider(
            new HttpClient(new CapturingFakeHttpMessageHandler()),
            CreateOptions(model: string.Empty, providerKind: providerKind, baseUrl: string.Empty, apiKey: string.Empty),
            new RepositoryPromptCatalog(),
            [new FakeNativeCliRunner(providerKind, isAvailable: false)]);

        var readiness = provider.GetPhaseExecutionReadiness(PhaseId.Spec);

        Assert.False(readiness.CanExecute);
        Assert.Equal(expectedBlockingReason, readiness.BlockingReason);
    }

    [Fact]
    public async Task ExecuteAsync_EmptyProfileProvider_DefaultsToOpenAiCompatible()
    {
        await PrepareInitializedWorkspaceAsync();
        var handler = new CapturingFakeHttpMessageHandler(BuildMinimalSpecMarkdown());
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
            PhaseId: PhaseId.Spec,
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
        var handler = new CapturingFakeHttpMessageHandler(BuildMinimalSpecMarkdown());
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
                    DefaultProfile: "bridge")),
            new RepositoryPromptCatalog(),
            [new FakeNativeCliRunner(providerKind, isAvailable: false)]);
        var context = new PhaseExecutionContext(
            WorkspaceRoot: workspaceRoot,
            UsId: "US-0001",
            PhaseId: PhaseId.Spec,
            UserStoryPath: Path.Combine(workspaceRoot, ".specs", "us", "workflow", "US-0001", "us.md"),
            PreviousArtifactPaths: new Dictionary<PhaseId, string>(),
            ContextFilePaths: []);

        var result = await provider.ExecuteAsync(context);

        Assert.NotNull(result.Execution);
        Assert.Equal(providerKind, result.Execution!.ProviderKind);
    }

    [Theory]
    [InlineData("claude", "SpecForge Native Claude Execution")]
    [InlineData("copilot", "SpecForge Native Copilot Execution")]
    public async Task ExecuteAsync_NativeProvider_UsesNativeCliRunner(
        string providerKind,
        string expectedPromptMarker)
    {
        await PrepareInitializedWorkspaceAsync();
        var fakeRunner = new FakeNativeCliRunner(providerKind, isAvailable: true, responseJson: BuildMinimalSpecMarkdown());
        var provider = new OpenAiCompatiblePhaseExecutionProvider(
            new HttpClient(new ThrowingHttpMessageHandler()),
            CreateOptions(model: "native-model", providerKind: providerKind, baseUrl: string.Empty, apiKey: string.Empty),
            new RepositoryPromptCatalog(),
            [fakeRunner]);
        var context = new PhaseExecutionContext(
            WorkspaceRoot: workspaceRoot,
            UsId: "US-0001",
            PhaseId: PhaseId.Spec,
            UserStoryPath: Path.Combine(workspaceRoot, ".specs", "us", "workflow", "US-0001", "us.md"),
            PreviousArtifactPaths: new Dictionary<PhaseId, string>(),
            ContextFilePaths: []);

        var result = await provider.ExecuteAsync(context);

        Assert.Equal(providerKind, result.ExecutionKind);
        Assert.NotNull(result.Execution);
        Assert.Equal(providerKind, result.Execution!.ProviderKind);
        Assert.NotNull(fakeRunner.LastInvocation);
        Assert.Equal("read-only", fakeRunner.LastInvocation!.SandboxMode);
        Assert.Contains(expectedPromptMarker, fakeRunner.LastInvocation.Prompt);
        Assert.Contains("## Response Markdown Contract", fakeRunner.LastInvocation.Prompt);
    }

    [Fact]
    public async Task ExecuteAsync_CodexProvider_UsesNativeCodexRunnerForImplementation()
    {
        await PrepareInitializedWorkspaceAsync();
        await InitializeGitWorkspaceAsync();
        var fakeRunner = new FakeNativeCliRunner(
            "codex",
            isAvailable: true,
            responseJson: BuildMinimalImplementationMarkdown(),
            onExecute: invocation =>
            {
                File.WriteAllText(Path.Combine(invocation.WorkspaceRoot, "README.md"), "# changed by codex");
            });
        var provider = new OpenAiCompatiblePhaseExecutionProvider(
            new HttpClient(new ThrowingHttpMessageHandler()),
            CreateOptions(
                model: string.Empty,
                providerKind: "codex",
                baseUrl: string.Empty,
                apiKey: string.Empty,
                repositoryAccess: "read-write"),
            new RepositoryPromptCatalog(),
            [fakeRunner]);
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
    public async Task ExecuteAsync_CodexProvider_PassesReasoningEffortToNativeRunner()
    {
        await PrepareInitializedWorkspaceAsync();
        var fakeRunner = new FakeNativeCliRunner(
            "codex",
            isAvailable: true,
            responseJson: BuildMinimalSpecMarkdown());
        var provider = new OpenAiCompatiblePhaseExecutionProvider(
            new HttpClient(new ThrowingHttpMessageHandler()),
            CreateOptions(
                model: "gpt-5.3-codex",
                providerKind: "codex",
                baseUrl: string.Empty,
                apiKey: string.Empty,
                reasoningEffort: "high"),
            new RepositoryPromptCatalog(),
            [fakeRunner]);
        var context = new PhaseExecutionContext(
            WorkspaceRoot: workspaceRoot,
            UsId: "US-0001",
            PhaseId: PhaseId.Spec,
            UserStoryPath: Path.Combine(workspaceRoot, ".specs", "us", "workflow", "US-0001", "us.md"),
            PreviousArtifactPaths: new Dictionary<PhaseId, string>(),
            ContextFilePaths: []);

        await provider.ExecuteAsync(context);

        Assert.Equal("high", fakeRunner.LastInvocation?.ReasoningEffort);
    }

    [Fact]
    public async Task ExecuteAsync_CodexProvider_UsesWorkspaceWriteSandboxForReview()
    {
        await PrepareInitializedWorkspaceAsync();
        var fakeRunner = new FakeNativeCliRunner(
            "codex",
            isAvailable: true,
            responseJson: BuildMinimalReviewMarkdown());
        var provider = new OpenAiCompatiblePhaseExecutionProvider(
            new HttpClient(new ThrowingHttpMessageHandler()),
            CreateOptions(
                model: string.Empty,
                providerKind: "codex",
                baseUrl: string.Empty,
                apiKey: string.Empty,
                repositoryAccess: "read"),
            new RepositoryPromptCatalog(),
            [fakeRunner]);
        var technicalDesignPath = Path.Combine(workspaceRoot, ".specs", "us", "workflow", "US-0001", "phases", "02-technical-design.md");
        Directory.CreateDirectory(Path.GetDirectoryName(technicalDesignPath)!);
        await File.WriteAllTextAsync(
            technicalDesignPath,
            """
            # Technical Design · US-0001 · v01

            ## Validation Strategy
            - Run focused review validations.
            """);
        var context = new PhaseExecutionContext(
            WorkspaceRoot: workspaceRoot,
            UsId: "US-0001",
            PhaseId: PhaseId.Review,
            UserStoryPath: Path.Combine(workspaceRoot, ".specs", "us", "workflow", "US-0001", "us.md"),
            PreviousArtifactPaths: new Dictionary<PhaseId, string>
            {
                [PhaseId.TechnicalDesign] = technicalDesignPath
            },
            ContextFilePaths: []);

        var result = await provider.ExecuteAsync(context);

        Assert.Equal("codex", result.ExecutionKind);
        Assert.NotNull(fakeRunner.LastInvocation);
        Assert.Equal("workspace-write", fakeRunner.LastInvocation!.SandboxMode);
        Assert.Contains("SpecForge Native Codex Execution", fakeRunner.LastInvocation.Prompt);
        Assert.Contains("Run the most relevant validation commands needed to verify the Technical Design validation strategy", fakeRunner.LastInvocation.Prompt);
        Assert.Contains("## Required Review Validation Checklist", fakeRunner.LastInvocation.Prompt);
        Assert.Contains("Run focused review validations.", fakeRunner.LastInvocation.Prompt);
    }

    [Fact]
    public async Task ExecuteAsync_CodexProviderImplementationWithoutWorkspaceChanges_Throws()
    {
        await PrepareInitializedWorkspaceAsync();
        await InitializeGitWorkspaceAsync();
        var fakeRunner = new FakeNativeCliRunner("codex", isAvailable: true, responseJson: BuildMinimalImplementationMarkdown());
        var provider = new OpenAiCompatiblePhaseExecutionProvider(
            new HttpClient(new ThrowingHttpMessageHandler()),
            CreateOptions(
                model: string.Empty,
                providerKind: "codex",
                baseUrl: string.Empty,
                apiKey: string.Empty,
                repositoryAccess: "read-write"),
            new RepositoryPromptCatalog(),
            [fakeRunner]);
        var context = new PhaseExecutionContext(
            WorkspaceRoot: workspaceRoot,
            UsId: "US-0001",
            PhaseId: PhaseId.Implementation,
            UserStoryPath: Path.Combine(workspaceRoot, ".specs", "us", "workflow", "US-0001", "us.md"),
            PreviousArtifactPaths: new Dictionary<PhaseId, string>(),
            ContextFilePaths: []);

        var error = await Assert.ThrowsAsync<InvalidOperationException>(() => provider.ExecuteAsync(context));

        Assert.Contains("without modifying workspace files outside the user story workflow metadata", error.Message);
    }

    [Fact]
    public async Task ExecuteAsync_CodexProviderImplementationDetectsChangesInsideAlreadyDirtyFiles()
    {
        await PrepareInitializedWorkspaceAsync();
        await InitializeGitWorkspaceAsync();
        var dirtyFilePath = Path.Combine(workspaceRoot, "src", "ExistingService.cs");
        Directory.CreateDirectory(Path.GetDirectoryName(dirtyFilePath)!);
        await File.WriteAllTextAsync(dirtyFilePath, "namespace TravelAgent;\npublic static class ExistingService { }\n");
        await RunGitAsync("add", "src/ExistingService.cs");
        await RunGitAsync("commit", "-m", "seed dirty file");
        await File.WriteAllTextAsync(dirtyFilePath, "namespace TravelAgent;\npublic static class ExistingService { public const int Before = 1; }\n");

        var fakeRunner = new FakeNativeCliRunner(
            "codex",
            isAvailable: true,
            responseJson: BuildMinimalImplementationMarkdown(),
            onExecute: _ =>
            {
                File.AppendAllText(dirtyFilePath, "public const int After = 2;\n");
            });
        var provider = new OpenAiCompatiblePhaseExecutionProvider(
            new HttpClient(new ThrowingHttpMessageHandler()),
            CreateOptions(
                model: string.Empty,
                providerKind: "codex",
                baseUrl: string.Empty,
                apiKey: string.Empty,
                repositoryAccess: "read-write"),
            new RepositoryPromptCatalog(),
            [fakeRunner]);
        var context = new PhaseExecutionContext(
            WorkspaceRoot: workspaceRoot,
            UsId: "US-0001",
            PhaseId: PhaseId.Implementation,
            UserStoryPath: Path.Combine(workspaceRoot, ".specs", "us", "workflow", "US-0001", "us.md"),
            PreviousArtifactPaths: new Dictionary<PhaseId, string>(),
            ContextFilePaths: []);

        var result = await provider.ExecuteAsync(context);

        Assert.Equal("codex", result.ExecutionKind);
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

    [Theory]
    [InlineData("claude")]
    [InlineData("copilot")]
    public void Constructor_NativeProviderWithoutEndpointConfiguration_DoesNotThrow(string providerKind)
    {
        var provider = new OpenAiCompatiblePhaseExecutionProvider(
            new HttpClient(new CapturingFakeHttpMessageHandler()),
            CreateOptions(
                model: string.Empty,
                providerKind: providerKind,
                baseUrl: string.Empty,
                apiKey: string.Empty));

        Assert.NotNull(provider);
    }

    [Fact]
    public void Constructor_MultipleProfilesWithoutDefault_ButExplicitModelDrivenAssignments_DoesNotThrow()
    {
        var provider = new OpenAiCompatiblePhaseExecutionProvider(
            new HttpClient(new CapturingFakeHttpMessageHandler()),
            new OpenAiCompatibleProviderOptions(
                ModelProfiles:
                [
                    new OpenAiCompatibleModelProfile(
                        Name: "planner",
                        Provider: "openai-compatible",
                        BaseUrl: "https://api.example.test/v1",
                        ApiKey: "secret",
                        Model: "gpt-5.4",
                        RepositoryAccess: "read"),
                    new OpenAiCompatibleModelProfile(
                        Name: "implementer",
                        Provider: "codex",
                        BaseUrl: string.Empty,
                        ApiKey: string.Empty,
                        Model: string.Empty,
                        RepositoryAccess: "read-write")
                ],
                PhaseModelAssignments: new OpenAiCompatiblePhaseModelAssignments(
                    RefinementProfile: "planner",
                    SpecProfile: "planner",
                    TechnicalDesignProfile: "planner",
                    ImplementationProfile: "implementer",
                    ReviewProfile: "planner")));

        Assert.NotNull(provider);
    }

    [Fact]
    public async Task ExecuteAsync_RefinementOk_NormalizesToCanonicalReadyArtifact()
    {
        await PrepareInitializedWorkspaceAsync();
        var handler = new CapturingFakeHttpMessageHandler(BuildReadyRefinementMarkdown());
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

        Assert.Contains("## Decision", result.Content);
        Assert.Contains("ready_for_spec", result.Content);
        Assert.Contains("No refinement questions remain.", result.Content);
        Assert.False(OpenAiCompatibleRequestJson.HasResponseFormat(handler.LastBody));
    }

    [Fact]
    public async Task ExecuteAsync_RefinementNeedsRefinement_ReturnsMarkdownArtifactWithoutJsonParsing()
    {
        await PrepareInitializedWorkspaceAsync();
        var handler = new CapturingFakeHttpMessageHandler(
            """
            # Refinement · US-0001 · v01

            ## State
            - State: `pending_user_input`

            ## Decision
            needs_refinement

            ## Reason
            Missing actor and acceptance details.

            ## Questions
            1. Who performs the action?
            """
        );
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

        Assert.StartsWith("# Refinement · US-0001 · v01", result.Content);
        Assert.Contains("needs_refinement", result.Content);
        Assert.Contains("## Questions", result.Content);
        Assert.False(OpenAiCompatibleRequestJson.HasResponseFormat(handler.LastBody));
    }

    [Fact]
    public async Task ExecuteAsync_SpecMarkdownPayload_ReturnsMarkdownWithoutJsonParsing()
    {
        await PrepareInitializedWorkspaceAsync();
        var handler = new CapturingFakeHttpMessageHandler("# generated markdown");
        var provider = new OpenAiCompatiblePhaseExecutionProvider(
            new HttpClient(handler),
            CreateOptions(model: "llama3.1"));
        var context = new PhaseExecutionContext(
            WorkspaceRoot: workspaceRoot,
            UsId: "US-0001",
            PhaseId: PhaseId.Spec,
            UserStoryPath: Path.Combine(workspaceRoot, ".specs", "us", "workflow", "US-0001", "us.md"),
            PreviousArtifactPaths: new Dictionary<PhaseId, string>(),
            ContextFilePaths: []);

        var result = await provider.ExecuteAsync(context);

        Assert.Equal("# generated markdown" + Environment.NewLine, result.Content);
        Assert.False(OpenAiCompatibleRequestJson.HasResponseFormat(handler.LastBody));
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
    public async Task ExecuteAsync_WithoutInitializedPromptSet_InitializesPromptsAndAgentInstructions()
    {
        Directory.CreateDirectory(Path.Combine(workspaceRoot, ".specs", "us", "workflow", "US-0001"));
        await File.WriteAllTextAsync(
            Path.Combine(workspaceRoot, ".specs", "us", "workflow", "US-0001", "us.md"),
            "# US-0001");
        var paths = new PromptFilePaths(workspaceRoot);
        var handler = new CapturingFakeHttpMessageHandler(BuildMinimalSpecMarkdown());
        var provider = new OpenAiCompatiblePhaseExecutionProvider(
            new HttpClient(handler),
            CreateOptions(
                model: "llama3.1",
                apiKey: "ollama-local"));
        var context = new PhaseExecutionContext(
            WorkspaceRoot: workspaceRoot,
            UsId: "US-0001",
            PhaseId: PhaseId.Spec,
            UserStoryPath: Path.Combine(workspaceRoot, ".specs", "us", "workflow", "US-0001", "us.md"),
            PreviousArtifactPaths: new Dictionary<PhaseId, string>(),
            ContextFilePaths: []);

        var result = await provider.ExecuteAsync(context);

        Assert.Contains("# Spec · US-0001 · v01", result.Content);
        Assert.True(File.Exists(paths.PromptManifestPath));
        Assert.True(File.Exists(paths.AgentInstructionsPath));
        Assert.Contains("SpecForge MCP", await File.ReadAllTextAsync(paths.AgentInstructionsPath));
        Assert.NotNull(handler.LastRequest);
    }

    [Fact]
    public async Task ExecuteAsync_WithExistingPromptsAndMissingAgentInstructions_CreatesAgentInstructionsOnly()
    {
        await PrepareInitializedWorkspaceAsync();
        var paths = new PromptFilePaths(workspaceRoot);
        File.Delete(paths.AgentInstructionsPath);
        var originalSpecPrompt = await File.ReadAllTextAsync(paths.SpecExecutePromptPath);
        var handler = new CapturingFakeHttpMessageHandler(BuildMinimalSpecMarkdown());
        var provider = new OpenAiCompatiblePhaseExecutionProvider(
            new HttpClient(handler),
            CreateOptions(
                model: "llama3.1",
                apiKey: "ollama-local"));
        var context = new PhaseExecutionContext(
            WorkspaceRoot: workspaceRoot,
            UsId: "US-0001",
            PhaseId: PhaseId.Spec,
            UserStoryPath: Path.Combine(workspaceRoot, ".specs", "us", "workflow", "US-0001", "us.md"),
            PreviousArtifactPaths: new Dictionary<PhaseId, string>(),
            ContextFilePaths: []);

        await provider.ExecuteAsync(context);

        Assert.True(File.Exists(paths.AgentInstructionsPath));
        Assert.Equal(originalSpecPrompt, await File.ReadAllTextAsync(paths.SpecExecutePromptPath));
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

    private async Task InitializeGitWorkspaceAsync()
    {
        await RunGitAsync("init");
    }

    private async Task RunGitAsync(params string[] arguments)
    {
        var startInfo = new ProcessStartInfo
        {
            FileName = "git",
            WorkingDirectory = workspaceRoot,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false
        };

        foreach (var argument in arguments)
        {
            startInfo.ArgumentList.Add(argument);
        }

        using var process = new Process { StartInfo = startInfo };
        process.Start();
        var stdoutTask = process.StandardOutput.ReadToEndAsync();
        var stderrTask = process.StandardError.ReadToEndAsync();
        await process.WaitForExitAsync();
        var stdout = await stdoutTask;
        var stderr = await stderrTask;

        if (process.ExitCode != 0)
        {
            throw new InvalidOperationException(
                $"git {string.Join(' ', arguments)} failed with exit code {process.ExitCode}. stderr: {stderr.Trim()} stdout: {stdout.Trim()}");
        }
    }

    private static OpenAiCompatibleProviderOptions CreateOptions(
        string model,
        string profileName = "default",
        string baseUrl = "http://localhost:11434/v1",
        string apiKey = "",
        string refinementTolerance = "balanced",
        string reviewTolerance = "balanced",
        string? reasoningEffort = null,
        string repositoryAccess = "read-write",
        string providerKind = "openai-compatible",
        bool autoRefinementAnswersEnabled = false,
        string? autoRefinementAnswersProfile = null,
        bool reviewLearningEnabled = true,
        string reviewLearningSkillPath = ".codex/skills/sdd-phase-agents/SKILL.md")
    {
        return new OpenAiCompatibleProviderOptions(
            RefinementTolerance: refinementTolerance,
            ReviewTolerance: reviewTolerance,
            AutoRefinementAnswersEnabled: autoRefinementAnswersEnabled,
            AutoRefinementAnswersProfile: autoRefinementAnswersProfile,
            ReviewLearningEnabled: reviewLearningEnabled,
            ReviewLearningSkillPath: reviewLearningSkillPath,
            ModelProfiles:
            [
                new OpenAiCompatibleModelProfile(
                    Name: profileName,
                    Provider: providerKind,
                    BaseUrl: baseUrl,
                    ApiKey: apiKey,
                    Model: model,
                    ReasoningEffort: reasoningEffort,
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
            this.responseContent = string.IsNullOrWhiteSpace(responseContent) ? BuildMinimalSpecMarkdown() : responseContent;
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

    private sealed class StreamingFakeHttpMessageHandler : HttpMessageHandler
    {
        private readonly IReadOnlyList<string> chunks;

        public StreamingFakeHttpMessageHandler(IReadOnlyList<string> chunks)
        {
            this.chunks = chunks;
        }

        public string LastBody { get; private set; } = string.Empty;

        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            LastBody = await request.Content!.ReadAsStringAsync(cancellationToken);
            var builder = new StringBuilder();
            foreach (var chunk in chunks)
            {
                builder
                    .Append("data: ")
                    .Append(JsonSerializer.Serialize(new
                    {
                        choices = new[]
                        {
                            new
                            {
                                delta = new
                                {
                                    content = chunk
                                }
                            }
                        }
                    }))
                    .AppendLine()
                    .AppendLine();
            }

            builder.AppendLine("data: [DONE]");

            return new HttpResponseMessage(HttpStatusCode.OK)
            {
                Content = new StringContent(builder.ToString(), Encoding.UTF8, "text/event-stream")
            };
        }
    }

    private sealed class ThrowingHttpMessageHandler : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken) =>
            throw new InvalidOperationException("HTTP transport should not be used for native Codex execution.");
    }

    private sealed class PhaseAwareFakeHttpMessageHandler(params (string SchemaName, string ResponseJson)[] responses)
        : HttpMessageHandler
    {
        private readonly Dictionary<string, string> responsesBySchema = responses.ToDictionary(item => item.SchemaName, item => item.ResponseJson, StringComparer.Ordinal);

        public HttpRequestMessage? LastRequest { get; private set; }

        public string LastBody { get; private set; } = string.Empty;

        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            LastRequest = request;
            LastBody = await request.Content!.ReadAsStringAsync(cancellationToken);

            var userPrompt = OpenAiCompatibleRequestJson.ReadUserPrompt(LastBody);
            var responseKey = responsesBySchema.Keys.FirstOrDefault(key => userPrompt.Contains($"- Phase: `{key}`", StringComparison.Ordinal))
                ?? string.Empty;

            var responseContent = responsesBySchema.TryGetValue(responseKey, out var response)
                ? response
                : responsesBySchema.Values.Last();

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

    private sealed class FakeNativeCliRunner : OpenAiCompatiblePhaseExecutionProvider.INativeCliRunner
    {
        private readonly string responseJson;
        private readonly Action<OpenAiCompatiblePhaseExecutionProvider.NativeCliInvocation>? onExecute;

        public FakeNativeCliRunner(
            string providerKind,
            bool isAvailable,
            string responseJson = "{}",
            Action<OpenAiCompatiblePhaseExecutionProvider.NativeCliInvocation>? onExecute = null,
            int checkExitCode = 0,
            string checkStdout = "cli 1.0.0",
            string checkStderr = "")
        {
            ProviderKind = providerKind;
            IsAvailable = isAvailable;
            this.responseJson = responseJson;
            this.onExecute = onExecute;
            CheckResult = new OpenAiCompatiblePhaseExecutionProvider.NativeCliCheckResult(
                $"{providerKind} --version",
                checkExitCode,
                checkStdout,
                checkStderr);
        }

        public string ProviderKind { get; }

        public bool IsAvailable { get; }

        public OpenAiCompatiblePhaseExecutionProvider.NativeCliCheckResult CheckResult { get; }

        public OpenAiCompatiblePhaseExecutionProvider.NativeCliInvocation? LastInvocation { get; private set; }

        public Task<OpenAiCompatiblePhaseExecutionProvider.NativeCliCheckResult> CheckAvailabilityAsync(CancellationToken cancellationToken) =>
            Task.FromResult(CheckResult);

        public Task<string> ExecuteAsync(OpenAiCompatiblePhaseExecutionProvider.NativeCliInvocation invocation, CancellationToken cancellationToken)
        {
            LastInvocation = invocation;
            onExecute?.Invoke(invocation);
            return Task.FromResult(responseJson);
        }
    }

    private static string BuildMinimalSpecJson() =>
        """
        {
          "title": "Generated spec",
          "historyLog": ["`2026-04-22T13:25:00Z` · Initial spec baseline generated."],
          "state": "pending_approval",
          "basedOn": "us.md",
          "specSummary": "A valid spec baseline.",
          "inputs": ["A concrete source objective."],
          "outputs": ["A concrete spec artifact."],
          "businessRules": ["The workflow must preserve the approved scope."],
          "edgeCases": ["Missing context should be surfaced explicitly."],
          "errorsAndFailureModes": ["Invalid repository state should stop spec."],
          "constraints": ["Stay within the current repository."],
          "detectedAmbiguities": ["Non-functional targets remain explicit only when provided."],
          "redTeam": ["Implicit assumptions may still exist if the source is weak."],
          "blueTeam": ["Keep the spec executable and bounded."],
          "acceptanceCriteria": ["The spec is concrete enough for technical design."],
          "humanApprovalQuestions": [
            { "question": "Is the scope bounded enough for design?", "status": "pending" }
          ]
        }
        """;

    private static string BuildMinimalSpecMarkdown() =>
        """
        # Spec · US-0001 · v01

        ## History Log
        - `2026-04-22T13:25:00Z` · Initial spec baseline generated.

        ## State
        - State: `pending_approval`
        - Based on: `us.md`

        ## Spec Summary
        A valid spec baseline.

        ## Inputs
        - A concrete source objective.

        ## Outputs
        - A concrete spec artifact.

        ## Business Rules
        - The workflow must preserve the approved scope.

        ## Edge Cases
        - Missing context should be surfaced explicitly.

        ## Errors and Failure Modes
        - Invalid repository state should stop spec.

        ## Constraints
        - Stay within the current repository.

        ## Detected Ambiguities
        - Non-functional targets remain explicit only when provided.

        ## Red Team
        - Implicit assumptions may still exist if the source is weak.

        ## Blue Team
        - Keep the spec executable and bounded.

        ## Acceptance Criteria
        - The spec is concrete enough for technical design.

        ## Human Approval Questions
        - [ ] Is the scope bounded enough for design?
        """;

    private static string ComputeSha256(string content) =>
        Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(content))).ToLowerInvariant();

    private static string BuildReadyRefinementMarkdown() =>
        """
        # Refinement · US-0001 · v01

        ## State
        - State: `ready`

        ## Decision
        ready_for_spec

        ## Reason
        The user story is concrete enough to proceed to spec.

        ## Questions
        1. No refinement questions remain.
        """;

    private static string BuildAutoRefinementAnswersMarkdown() =>
        """
        ## Decision
        - Can resolve: `true`

        ## Reason
        The available context is enough to answer the pending refinement.

        ## Answers
        1. Marketing editor
        """;

    private static string BuildMinimalReviewMarkdown() =>
        """
        # Review · US-0001 · v01

        ## State
        - Result: `pass`

        ## Validation Checklist
        - ✅ Review must compare implementation back to the approved spec before final release approval. Evidence: Spec, technical design, implementation artifact, and implementation evidence are present.

        ## Findings
        - No material deviations were detected in the current artifact set.

        ## Verdict
        - Final result: `pass`
        - Primary reason: All required workflow artifacts are present and coherent.

        ## Recommendation
        - Advance to `release_approval`.
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

    private static string BuildMinimalImplementationMarkdown() =>
        """
        # Implementation · US-0001 · v01

        ## State
        - State: `generated`
        - Based on: `02-technical-design.md`

        ## Implemented Objective
        Persist the implementation plan derived from the technical design.

        ## Planned or Executed Changes
        - Update workflow orchestration logic.
        - Persist resulting state and derived artifacts.
        - Expose the action through the selected backend boundary.

        ## Planned Verification
        - Domain tests must cover the transition and persistence path.
        - Extension feedback must reflect the generated artifact and new phase.
        """;

    private static string BuildMinimalTechnicalDesignJson() =>
        """
        {
          "state": "generated",
          "basedOn": "01-spec.md",
          "technicalSummary": "A valid technical design baseline.",
          "technicalObjective": "Translate the approved spec into an executable design.",
          "affectedComponents": [
            "Workflow runner",
            "Sidebar extension"
          ],
          "architecture": [
            "Keep the current workflow boundaries intact."
          ],
          "primaryFlow": [
            "Resolve configured phase profile.",
            "Generate design artifact.",
            "Persist result."
          ],
          "constraintsAndGuardrails": [
            "Do not skip repository capability checks."
          ],
          "alternativesConsidered": [
            "Keep phase routing hardcoded in settings only."
          ],
          "technicalRisks": [
            "Configuration drift between UI and backend."
          ],
          "expectedImpact": [
            "Developers can route technical design explicitly."
          ],
          "implementationStrategy": [
            "Persist routing in shared settings.",
            "Read those settings in the provider."
          ],
          "validationStrategy": [
            "Cover assignment resolution in tests."
          ],
          "openDecisions": []
        }
        """;

    private static string BuildMinimalTechnicalDesignMarkdown() =>
        """
        # Technical Design · US-0001 · v01

        ## State
        - State: `generated`
        - Based on: `01-spec.md`

        ## Technical Summary
        A valid technical design baseline.

        ## Technical Objective
        Translate the approved spec into an executable design.

        ## Affected Components
        - Workflow runner
        - Sidebar extension

        ## Proposed Design
        ### Architecture
        - Keep the current workflow boundaries intact.

        ### Primary Flow
        1. Resolve configured phase profile.
        2. Generate design artifact.
        3. Persist result.

        ### Constraints and Guardrails
        - Do not skip repository capability checks.

        ## Alternatives Considered
        - Keep phase routing hardcoded in settings only.

        ## Technical Risks
        - Configuration drift between UI and backend.

        ## Expected Impact
        - Developers can route technical design explicitly.

        ## Implementation Strategy
        1. Persist routing in shared settings.
        2. Read those settings in the provider.

        ## Validation Strategy
        - Cover assignment resolution in tests.

        ## Open Decisions
        - No open decisions.
        """;
}
