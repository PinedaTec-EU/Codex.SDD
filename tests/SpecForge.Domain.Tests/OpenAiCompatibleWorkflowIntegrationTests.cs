using System.Collections.Concurrent;
using System.Net;
using System.Net.Http;
using System.Net.Sockets;
using System.Text;
using System.Text.Json;
using SpecForge.Domain.Application;
using SpecForge.Domain.Persistence;
using SpecForge.Domain.Workflow;
using SpecForge.OpenAICompatible;

namespace SpecForge.Domain.Tests;

public sealed class OpenAiCompatibleWorkflowIntegrationTests : IDisposable
{
    private readonly string workspaceRoot = Path.Combine(Path.GetTempPath(), Guid.NewGuid().ToString("N"));

    [Fact]
    public async Task GenerateNextPhaseAsync_TransitionsFromCaptureToRefinementThenSpec_ThroughHttpModelStub()
    {
        await new RepositoryPromptInitializer().InitializeAsync(workspaceRoot);

        using var modelStub = new OpenAiCompatibleModelStubServer(
        [
            """
            # Refinement · US-0001 · v01

            ## State
            - State: `pending_user_input`

            ## Decision
            needs_refinement

            ## Reason
            The story does not identify who publishes the article or how bilingual content is selected.

            ## Questions
            1. Which role publishes the article?
            2. How is the language selected for the rendered article?
            """,
            """
            # Refinement · US-0001 · v01

            ## State
            - State: `ready`

            ## Decision
            ready_for_spec

            ## Reason
            The current user story and refinement answers are concrete enough to proceed to spec.

            ## Questions
            1. No refinement questions remain.
            """,
            """
            # Spec · US-0001 · v01

            ## History Log
            - `2026-04-22T12:09:02Z` · Initial spec baseline generated.

            ## State
            - State: `pending_approval`
            - Based on: `refinement.md`

            ## Spec Summary
            Persist LinkedIn article content in `articles.json` and render both Spanish and English variants.

            ## Inputs
            - Marketing editors publish bilingual article content.

            ## Outputs
            - Landing page renders the article in the requested locale.

            ## Business Rules
            - Locale selects the Spanish or English article variant.

            ## Edge Cases
            - Missing locale falls back to the default supported language.

            ## Errors and Failure Modes
            - Unknown article slug returns a not-found response.

            ## Constraints
            - Keep the first pass bounded to the current repository.

            ## Detected Ambiguities
            - Analytics tracking remains out of scope unless explicitly approved.

            ## Red Team
            - The request could overreach into content authoring workflows.

            ## Blue Team
            - Keep scope bounded to persisted article rendering.

            ## Acceptance Criteria
            - Articles can be loaded from `articles.json`.
            - The page renders Spanish and English versions of the article content.
            - The article can be selected by slug and locale.

            ## Human Approval Questions
            - [ ] Is the bilingual scope bounded enough for technical design?
            """
        ]);

        var provider = new OpenAiCompatiblePhaseExecutionProvider(
            new HttpClient(),
            new OpenAiCompatibleProviderOptions(
                RefinementTolerance: "inferential",
                ModelProfiles:
                [
                    new OpenAiCompatibleModelProfile(
                        Name: "default",
                        Provider: "openai-compatible",
                        BaseUrl: $"{modelStub.BaseUrl}/v1",
                        ApiKey: string.Empty,
                        Model: "stub-model",
                        RepositoryAccess: "read-write")
                ],
                PhaseModelAssignments: new OpenAiCompatiblePhaseModelAssignments(
                    DefaultProfile: "default")));
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

        var refinementResult = await applicationService.GenerateNextPhaseAsync(workspaceRoot, "US-0001");
        Assert.Equal("refinement", refinementResult.CurrentPhase);
        Assert.Equal("waiting-user", refinementResult.Status);

        var refinementWorkflow = await applicationService.GetUserStoryWorkflowAsync(workspaceRoot, "US-0001");
        Assert.Equal("refinement", refinementWorkflow.CurrentPhase);
        Assert.Equal("waiting-user", refinementWorkflow.Status);
        Assert.NotNull(refinementWorkflow.Refinement);
        Assert.Equal("needs_refinement", refinementWorkflow.Refinement!.Status);
        Assert.Equal(2, refinementWorkflow.Refinement.Items.Count);
        Assert.Contains(refinementWorkflow.Phases, phase => phase.PhaseId == "refinement" && phase.IsCurrent && phase.State == "current");
        Assert.Contains(refinementWorkflow.Events, timelineEvent => timelineEvent.Code == "refinement_requested");
        Assert.Contains(refinementWorkflow.Events, timelineEvent =>
            timelineEvent.Code == "refinement_requested"
            && timelineEvent.Actor == "user"
            && timelineEvent.Execution is not null
            && timelineEvent.Execution.Model == "stub-model");

        await applicationService.SubmitRefinementAnswersAsync(
            workspaceRoot,
            "US-0001",
            [
                "El editor de marketing publica el articulo.",
                "La landing selecciona el idioma por locale (`es` o `en`) en la ruta."
            ]);

        var specResult = await applicationService.GenerateNextPhaseAsync(workspaceRoot, "US-0001");
        Assert.Equal("spec", specResult.CurrentPhase);
        Assert.Equal("waiting-user", specResult.Status);
        Assert.NotNull(specResult.GeneratedArtifactPath);
        Assert.EndsWith("01-spec.md", specResult.GeneratedArtifactPath, StringComparison.Ordinal);

        var specWorkflow = await applicationService.GetUserStoryWorkflowAsync(workspaceRoot, "US-0001");
        Assert.Equal("spec", specWorkflow.CurrentPhase);
        Assert.Equal("waiting-user", specWorkflow.Status);
        Assert.NotNull(specWorkflow.Refinement);
        Assert.Equal("ready_for_spec", specWorkflow.Refinement!.Status);
        Assert.Contains(specWorkflow.Phases, phase => phase.PhaseId == "refinement" && phase.State == "completed");
        Assert.Contains(specWorkflow.Phases, phase => phase.PhaseId == "spec" && phase.IsCurrent && phase.State == "current");
        Assert.Contains(specWorkflow.Events, timelineEvent => timelineEvent.Code == "refinement_passed");
        Assert.Contains(specWorkflow.Events, timelineEvent => timelineEvent.Code == "phase_completed" && timelineEvent.Phase == "spec");

        Assert.Equal(3, modelStub.Requests.Count);
        Assert.All(modelStub.Requests, request => Assert.Equal("/v1/chat/completions", request.Path));
        Assert.Equal(0.4d, OpenAiCompatibleRequestJson.ReadTemperature(modelStub.Requests[0].Body));
        Assert.Equal(0.4d, OpenAiCompatibleRequestJson.ReadTemperature(modelStub.Requests[1].Body));
        Assert.Equal(0.2d, OpenAiCompatibleRequestJson.ReadTemperature(modelStub.Requests[2].Body));
        Assert.False(OpenAiCompatibleRequestJson.HasResponseFormat(modelStub.Requests[0].Body));
        Assert.False(OpenAiCompatibleRequestJson.HasResponseFormat(modelStub.Requests[1].Body));
        Assert.False(OpenAiCompatibleRequestJson.HasResponseFormat(modelStub.Requests[2].Body));
        Assert.Contains("Role: refinement analyst.", OpenAiCompatibleRequestJson.ReadUserPrompt(modelStub.Requests[0].Body));
        Assert.Contains("- Phase: `Refinement`", OpenAiCompatibleRequestJson.ReadUserPrompt(modelStub.Requests[0].Body));
        Assert.Contains("Active tolerance: `inferential`", OpenAiCompatibleRequestJson.ReadUserPrompt(modelStub.Requests[0].Body));
        Assert.Contains("Role: refinement analyst.", OpenAiCompatibleRequestJson.ReadUserPrompt(modelStub.Requests[1].Body));
        Assert.Contains("- Phase: `Refinement`", OpenAiCompatibleRequestJson.ReadUserPrompt(modelStub.Requests[1].Body));
        Assert.Contains("Role: spec analyst.", OpenAiCompatibleRequestJson.ReadUserPrompt(modelStub.Requests[2].Body));
        Assert.Contains("- Phase: `Spec`", OpenAiCompatibleRequestJson.ReadUserPrompt(modelStub.Requests[2].Body));
        Assert.Contains("## Refinement Log", OpenAiCompatibleRequestJson.ReadUserPrompt(modelStub.Requests[1].Body));
        Assert.Contains("El editor de marketing publica el articulo.", OpenAiCompatibleRequestJson.ReadUserPrompt(modelStub.Requests[1].Body));
    }

    [Fact]
    public async Task GenerateNextPhaseAsync_AutoRefinementAnswers_ContinuesToSpecWithSelectedProfile()
    {
        await new RepositoryPromptInitializer().InitializeAsync(workspaceRoot);

        using var modelStub = new OpenAiCompatibleModelStubServer(
        [
            """
            # Refinement · US-0001 · v01

            ## State
            - State: `pending_user_input`

            ## Decision
            needs_refinement

            ## Reason
            The story does not identify who publishes the article.

            ## Questions
            1. Which role publishes the article?
            """,
            """
            ## Decision
            - Can resolve: `true`

            ## Reason
            The story mentions the marketing editor in the available context.

            ## Answers
            1. Marketing editor
            """,
            """
            # Refinement · US-0001 · v01

            ## State
            - State: `ready`

            ## Decision
            ready_for_spec

            ## Reason
            The current user story and refinement answers are concrete enough to proceed to spec.

            ## Questions
            1. No refinement questions remain.
            """,
            """
            # Spec · US-0001 · v01

            ## History Log
            - `2026-04-22T12:09:02Z` · Initial spec baseline generated.

            ## State
            - State: `pending_approval`
            - Based on: `refinement.md`

            ## Spec Summary
            Persist LinkedIn article content in `articles.json` and render both Spanish and English variants.

            ## Inputs
            - Marketing editors publish bilingual article content.

            ## Outputs
            - Landing page renders the article in the requested locale.

            ## Business Rules
            - Locale selects the Spanish or English article variant.

            ## Edge Cases
            - Missing locale falls back to the default supported language.

            ## Errors and Failure Modes
            - Unknown article slug returns a not-found response.

            ## Constraints
            - Keep the first pass bounded to the current repository.

            ## Detected Ambiguities
            - Analytics tracking remains out of scope unless explicitly approved.

            ## Red Team
            - The request could overreach into content authoring workflows.

            ## Blue Team
            - Keep scope bounded to persisted article rendering.

            ## Acceptance Criteria
            - Articles can be loaded from `articles.json`.
            - The page renders Spanish and English versions of the article content.
            - The article can be selected by slug and locale.

            ## Human Approval Questions
            - [ ] Is the bilingual scope bounded enough for technical design?
            """
        ]);

        var provider = new OpenAiCompatiblePhaseExecutionProvider(
            new HttpClient(),
            new OpenAiCompatibleProviderOptions(
                RefinementTolerance: "balanced",
                AutoRefinementAnswersEnabled: true,
                AutoRefinementAnswersProfile: "resolver",
                ModelProfiles:
                [
                    new OpenAiCompatibleModelProfile(
                        Name: "default",
                        Provider: "openai-compatible",
                        BaseUrl: $"{modelStub.BaseUrl}/v1",
                        ApiKey: string.Empty,
                        Model: "stub-default",
                        RepositoryAccess: "read-write"),
                    new OpenAiCompatibleModelProfile(
                        Name: "resolver",
                        Provider: "openai-compatible",
                        BaseUrl: $"{modelStub.BaseUrl}/v1",
                        ApiKey: string.Empty,
                        Model: "stub-resolver",
                        RepositoryAccess: "read")
                ],
                PhaseModelAssignments: new OpenAiCompatiblePhaseModelAssignments(
                    DefaultProfile: "default")));
        var applicationService = new SpecForgeApplicationService(
            new UserStoryFileStore(),
            new WorkflowRunner(provider),
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

        var result = await applicationService.GenerateNextPhaseAsync(workspaceRoot, "US-0001");

        Assert.Equal("spec", result.CurrentPhase);
        Assert.Equal("waiting-user", result.Status);
        Assert.NotNull(result.GeneratedArtifactPath);

        var workflow = await applicationService.GetUserStoryWorkflowAsync(workspaceRoot, "US-0001");
        Assert.Equal("spec", workflow.CurrentPhase);
        Assert.Contains(workflow.Events, eventItem => eventItem.Code == "refinement_auto_answered");
        Assert.Contains(workflow.Events, eventItem =>
            eventItem.Code == "refinement_auto_answered"
            && eventItem.Execution is not null
            && eventItem.Execution.ProfileName == "resolver"
            && eventItem.Execution.Model == "stub-resolver");

        Assert.Equal(4, modelStub.Requests.Count);
        Assert.False(OpenAiCompatibleRequestJson.HasResponseFormat(modelStub.Requests[0].Body));
        Assert.False(OpenAiCompatibleRequestJson.HasResponseFormat(modelStub.Requests[1].Body));
        Assert.False(OpenAiCompatibleRequestJson.HasResponseFormat(modelStub.Requests[2].Body));
        Assert.False(OpenAiCompatibleRequestJson.HasResponseFormat(modelStub.Requests[3].Body));
        Assert.Contains("\"model\":\"stub-resolver\"", modelStub.Requests[1].Body);
    }

    [Fact]
    public async Task GenerateNextPhaseAsync_FullWorkflow_InvokesModelForEveryModelBackedPhaseAndStopsAtReleaseApproval()
    {
        await new RepositoryPromptInitializer().InitializeAsync(workspaceRoot);

        using var modelStub = new OpenAiCompatibleModelStubServer(
        [
            """
            # Refinement · US-0001 · v01

            ## State
            - State: `pending_user_input`

            ## Decision
            needs_refinement

            ## Reason
            The story does not identify who configures suite agent sampling or where limits are enforced.

            ## Questions
            1. Which role configures the sampling controls?
            """,
            """
            ## Decision
            - Can resolve: `true`

            ## Reason
            The story context points to the suite administrator as the owner of these settings.

            ## Answers
            1. The suite administrator configures the sampling controls.
            """,
            """
            # Refinement · US-0001 · v01

            ## State
            - State: `ready`

            ## Decision
            ready_for_spec

            ## Reason
            The story and inferred refinement answer are concrete enough to proceed.

            ## Questions
            1. No refinement questions remain.
            """,
            """
            # Spec · US-0001 · v01

            ## History Log
            - `2026-04-23T12:00:00Z` · Initial spec baseline generated.

            ## State
            - State: `pending_approval`
            - Based on: `refinement.md`

            ## Spec Summary
            Allow a suite administrator to configure bounded agent sampling defaults and validation rules.

            ## Inputs
            - Suite administrator updates sampling settings.

            ## Outputs
            - Persisted sampling defaults become available to downstream execution flows.

            ## Business Rules
            - Sampling values must remain inside approved bounds.

            ## Edge Cases
            - Out-of-range values are rejected before persistence.

            ## Errors and Failure Modes
            - Invalid settings never become the active configuration.

            ## Constraints
            - Keep the first pass inside the current repository.

            ## Detected Ambiguities
            - Historical migration of legacy values remains out of scope.

            ## Red Team
            - A lax validation rule could allow invalid runtime states.

            ## Blue Team
            - Keep the scope bounded to validation, persistence, and runtime propagation.

            ## Acceptance Criteria
            - Sampling settings can be updated through the supported API boundary.
            - Persisted values are validated before saving.
            - Runtime consumers receive the validated sampling defaults.

            ## Human Approval Questions
            - [ ] Is the implementation scope bounded enough for technical design?
            """,
            """
            # Technical Design · US-0001 · v01

            ## State
            - State: `generated`
            - Based on: `01-spec.md`

            ## Technical Summary
            Translate the approved sampling-control spec into repository changes.

            ## Technical Objective
            Enforce validated sampling settings through API, persistence, and runtime layers.

            ## Affected Components
            - Sampling settings API
            - Configuration persistence
            - Runtime settings resolver

            ## Proposed Design
            ### Architecture
            - Keep validation rules centralized so persistence and runtime share the same contract.

            ### Primary Flow
            1. Receive sampling settings update.
            2. Validate bounded values.
            3. Persist normalized settings.
            4. Expose the persisted values to runtime consumers.

            ### Constraints and Guardrails
            - Do not expand scope into unrelated orchestration behavior.

            ## Alternatives Considered
            - Validate only at the UI layer.

            ## Technical Risks
            - Divergent validation paths could allow inconsistent saved state.

            ## Expected Impact
            - Sampling defaults become safely configurable.

            ## Implementation Strategy
            1. Add request validation at the API boundary.
            2. Persist normalized settings in the existing configuration store.
            3. Update runtime settings resolution to read the persisted defaults.

            ## Validation Strategy
            - Cover valid and invalid values in domain and API tests.

            ## Open Decisions
            - No open decisions.
            """,
            """
            # Implementation · US-0001 · v01

            ## State
            - State: `generated`
            - Based on: `02-technical-design.md`

            ## Implemented Objective
            Apply the planned sampling-control changes to the repository.

            ## Planned or Executed Changes
            - Update the API validation path for sampling settings.
            - Persist normalized sampling values.
            - Propagate persisted settings into runtime resolution.

            ## Planned Verification
            - Run focused tests that cover valid and invalid sampling settings.
            - Verify runtime consumers read the persisted values.
            """,
            """
            # Review · US-0001 · v01

            ## State
            - Result: `pass`

            ## Validation Checklist
            - ✅ Cover valid and invalid values in domain and API tests. Evidence: Implementation evidence is present and planned verification covers focused tests for valid and invalid sampling settings.

            ## Findings
            - No material deviations were detected in the simulated workflow artifacts.

            ## Verdict
            - Final result: `pass`
            - Primary reason: All model-backed workflow phases produced the required evidence in order.

            ## Recommendation
            - Advance to `release_approval`.
            """,
            """
            # Release Approval · US-0001 · v01

            ## State
            - State: `pending_approval`

            ## Based On
            - 04-review.md
            - 03-implementation.md
            - 02-technical-design.md
            - 01-spec.md

            ## Release Summary
            Sampling-control scope is ready for the final human checkpoint before PR preparation.

            ## Implemented Scope
            - Validation, persistence, and runtime propagation are covered by the workflow artifacts.

            ## Validation Evidence
            - Review passed with the expected validation checklist.

            ## Residual Risks
            - Human review should still confirm rollout expectations and residual operational concerns.

            ## Approval Checklist
            - [ ] Approved scope matches the intended PR handoff
            - [ ] Validation evidence is sufficient
            - [ ] Residual risks are understood

            ## Recommendation
            Approve if the final release checkpoint agrees with the review evidence.
            """
        ]);

        var provider = new OpenAiCompatiblePhaseExecutionProvider(
            new HttpClient(),
            new OpenAiCompatibleProviderOptions(
                RefinementTolerance: "balanced",
                AutoRefinementAnswersEnabled: true,
                AutoRefinementAnswersProfile: "resolver",
                ModelProfiles:
                [
                    new OpenAiCompatibleModelProfile(
                        Name: "default",
                        Provider: "openai-compatible",
                        BaseUrl: $"{modelStub.BaseUrl}/v1",
                        ApiKey: string.Empty,
                        Model: "stub-default",
                        RepositoryAccess: "read-write"),
                    new OpenAiCompatibleModelProfile(
                        Name: "resolver",
                        Provider: "openai-compatible",
                        BaseUrl: $"{modelStub.BaseUrl}/v1",
                        ApiKey: string.Empty,
                        Model: "stub-resolver",
                        RepositoryAccess: "read")
                ],
                PhaseModelAssignments: new OpenAiCompatiblePhaseModelAssignments(
                    DefaultProfile: "default")));
        var applicationService = new SpecForgeApplicationService(
            new UserStoryFileStore(),
            new WorkflowRunner(provider),
            new RepositoryPromptInitializer(),
            new RepositoryCategoryCatalog(),
            new UserStoryRuntimeStatusStore());

        await applicationService.CreateUserStoryAsync(
            workspaceRoot,
            "US-0001",
            "Suite agent sampling controls",
            "feature",
            "workflow",
            "Como administrador quiero configurar controles de sampling para los agentes de una suite y asegurar que solo se persistan valores validos.");

        var specResult = await applicationService.GenerateNextPhaseAsync(workspaceRoot, "US-0001");
        Assert.Equal("spec", specResult.CurrentPhase);
        Assert.Equal("waiting-user", specResult.Status);

        await ResolvePendingApprovalQuestionsAsync(applicationService, "US-0001");
        await applicationService.ApprovePhaseAsync(workspaceRoot, "US-0001", "main");

        var technicalDesignResult = await applicationService.GenerateNextPhaseAsync(workspaceRoot, "US-0001");
        Assert.Equal("technical-design", technicalDesignResult.CurrentPhase);
        Assert.Equal("active", technicalDesignResult.Status);

        var implementationResult = await applicationService.GenerateNextPhaseAsync(workspaceRoot, "US-0001");
        Assert.Equal("implementation", implementationResult.CurrentPhase);
        Assert.Equal("active", implementationResult.Status);

        var reviewResult = await applicationService.GenerateNextPhaseAsync(workspaceRoot, "US-0001");
        Assert.Equal("review", reviewResult.CurrentPhase);
        Assert.Equal("active", reviewResult.Status);

        var releaseApprovalResult = await applicationService.GenerateNextPhaseAsync(workspaceRoot, "US-0001");
        Assert.Equal("release-approval", releaseApprovalResult.CurrentPhase);
        Assert.Equal("waiting-user", releaseApprovalResult.Status);

        var workflow = await applicationService.GetUserStoryWorkflowAsync(workspaceRoot, "US-0001");
        Assert.Equal("release-approval", workflow.CurrentPhase);
        Assert.Equal("waiting-user", workflow.Status);
        Assert.Contains(workflow.Events, eventItem =>
            eventItem.Code == "refinement_auto_answered"
            && eventItem.Execution is not null
            && eventItem.Execution.ProfileName == "resolver");
        Assert.Contains(workflow.Events, eventItem => eventItem.Code == "phase_completed" && eventItem.Phase == "technical-design");
        Assert.Contains(workflow.Events, eventItem => eventItem.Code == "phase_completed" && eventItem.Phase == "implementation");
        Assert.Contains(workflow.Events, eventItem => eventItem.Code == "phase_completed" && eventItem.Phase == "review");
        var paths = UserStoryFilePaths.ResolveFromWorkspaceRoot(workspaceRoot, "US-0001");
        Assert.False(File.Exists(paths.GetPhaseArtifactJsonPath(PhaseId.TechnicalDesign)));
        Assert.False(File.Exists(paths.GetPhaseArtifactJsonPath(PhaseId.Implementation)));
        Assert.False(File.Exists(paths.GetPhaseArtifactJsonPath(PhaseId.Review)));
        var reviewMarkdown = await File.ReadAllTextAsync(paths.GetPhaseArtifactPath(PhaseId.Review));
        Assert.Contains("## Validation Checklist", reviewMarkdown);
        Assert.Contains("Cover valid and invalid values in domain and API tests.", reviewMarkdown);

        Assert.Equal(8, modelStub.Requests.Count);
        Assert.All(modelStub.Requests, request => Assert.False(OpenAiCompatibleRequestJson.HasResponseFormat(request.Body)));
        Assert.Equal("stub-resolver", OpenAiCompatibleRequestJson.ReadModel(modelStub.Requests[1].Body));
        Assert.All(
            modelStub.Requests.Where((_, index) => index != 1),
            request => Assert.Equal("stub-default", OpenAiCompatibleRequestJson.ReadModel(request.Body)));
    }

    public void Dispose()
    {
        if (Directory.Exists(workspaceRoot))
        {
            Directory.Delete(workspaceRoot, recursive: true);
        }
    }

    private async Task ResolvePendingApprovalQuestionsAsync(SpecForgeApplicationService applicationService, string usId)
    {
        var workflow = await applicationService.GetUserStoryWorkflowAsync(workspaceRoot, usId);
        foreach (var question in workflow.ApprovalQuestions.Where(static item => !item.IsResolved))
        {
            await applicationService.SubmitApprovalAnswerAsync(
                workspaceRoot,
                usId,
                question.Question,
                $"Resolved in integration test for: {question.Question}",
                "integration-test");
        }
    }

    private sealed class OpenAiCompatibleModelStubServer : IDisposable
    {
        private readonly TcpListener listener;
        private readonly CancellationTokenSource shutdown = new();
        private readonly Task serverLoop;
        private readonly ConcurrentQueue<string> queuedResponses;
        private readonly ConcurrentQueue<CapturedRequest> capturedRequests = new();

        public OpenAiCompatibleModelStubServer(IEnumerable<string> responses)
        {
            queuedResponses = new ConcurrentQueue<string>(responses);
            listener = new TcpListener(IPAddress.Loopback, 0);
            listener.Start();
            var port = ((IPEndPoint)listener.LocalEndpoint).Port;
            BaseUrl = $"http://127.0.0.1:{port}";
            serverLoop = Task.Run(() => RunAsync(shutdown.Token));
        }

        public string BaseUrl { get; }

        public IReadOnlyList<CapturedRequest> Requests => capturedRequests.ToArray();

        public void Dispose()
        {
            shutdown.Cancel();
            listener.Stop();

            try
            {
                serverLoop.GetAwaiter().GetResult();
            }
            catch (SocketException)
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
                TcpClient client;
                try
                {
                    client = await listener.AcceptTcpClientAsync(cancellationToken);
                }
                catch (SocketException) when (cancellationToken.IsCancellationRequested)
                {
                    return;
                }
                catch (ObjectDisposedException) when (cancellationToken.IsCancellationRequested)
                {
                    return;
                }

                _ = Task.Run(
                    async () =>
                    {
                        using var _ = client;
                        await HandleAsync(client, cancellationToken);
                    },
                    cancellationToken);
            }
        }

        private async Task HandleAsync(TcpClient client, CancellationToken cancellationToken)
        {
            await using var stream = client.GetStream();
            var request = await ReadRequestAsync(stream, cancellationToken);
            capturedRequests.Enqueue(request);

            if (!queuedResponses.TryDequeue(out var responseContent))
            {
                await WriteResponseAsync(
                    stream,
                    HttpStatusCode.InternalServerError,
                    "{\"error\":\"No stubbed response available.\"}",
                    cancellationToken);
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

            await WriteResponseAsync(stream, HttpStatusCode.OK, payload, cancellationToken);
        }

        private static async Task<CapturedRequest> ReadRequestAsync(NetworkStream stream, CancellationToken cancellationToken)
        {
            var buffer = new byte[4096];
            var requestBytes = new List<byte>();
            var headerEndIndex = -1;

            while (headerEndIndex < 0)
            {
                var read = await stream.ReadAsync(buffer, cancellationToken);
                if (read == 0)
                {
                    break;
                }

                requestBytes.AddRange(buffer.AsSpan(0, read).ToArray());
                headerEndIndex = FindHeaderEnd(requestBytes);
            }

            if (headerEndIndex < 0)
            {
                return new CapturedRequest(string.Empty, string.Empty);
            }

            var headerText = Encoding.ASCII.GetString(requestBytes.GetRange(0, headerEndIndex).ToArray());
            var contentLength = ReadContentLength(headerText);
            var bodyStartIndex = headerEndIndex + 4;

            while (requestBytes.Count - bodyStartIndex < contentLength)
            {
                var read = await stream.ReadAsync(buffer, cancellationToken);
                if (read == 0)
                {
                    break;
                }

                requestBytes.AddRange(buffer.AsSpan(0, read).ToArray());
            }

            var bodyBytes = requestBytes
                .Skip(bodyStartIndex)
                .Take(contentLength)
                .ToArray();

            return new CapturedRequest(ReadPath(headerText), Encoding.UTF8.GetString(bodyBytes));
        }

        private static int FindHeaderEnd(IReadOnlyList<byte> requestBytes)
        {
            for (var index = 0; index <= requestBytes.Count - 4; index++)
            {
                if (requestBytes[index] == '\r'
                    && requestBytes[index + 1] == '\n'
                    && requestBytes[index + 2] == '\r'
                    && requestBytes[index + 3] == '\n')
                {
                    return index;
                }
            }

            return -1;
        }

        private static int ReadContentLength(string headerText)
        {
            var headerLines = headerText.Split("\r\n", StringSplitOptions.RemoveEmptyEntries);
            var contentLengthLine = headerLines.FirstOrDefault(static line =>
                line.StartsWith("Content-Length:", StringComparison.OrdinalIgnoreCase));

            return contentLengthLine is not null
                && int.TryParse(contentLengthLine["Content-Length:".Length..].Trim(), out var contentLength)
                ? contentLength
                : 0;
        }

        private static string ReadPath(string headerText)
        {
            var requestLine = headerText.Split("\r\n", StringSplitOptions.RemoveEmptyEntries).FirstOrDefault();
            var parts = requestLine?.Split(' ', StringSplitOptions.RemoveEmptyEntries);
            return parts is { Length: >= 2 } ? parts[1] : string.Empty;
        }

        private static async Task WriteResponseAsync(
            NetworkStream stream,
            HttpStatusCode statusCode,
            string payload,
            CancellationToken cancellationToken)
        {
            var body = Encoding.UTF8.GetBytes(payload);
            var statusText = statusCode == HttpStatusCode.OK ? "OK" : "Internal Server Error";
            var headers = Encoding.ASCII.GetBytes(
                $"HTTP/1.1 {(int)statusCode} {statusText}\r\nContent-Type: application/json\r\nContent-Length: {body.Length}\r\nConnection: close\r\n\r\n");

            await stream.WriteAsync(headers, cancellationToken);
            await stream.WriteAsync(body, cancellationToken);
        }
    }

    private sealed record CapturedRequest(string Path, string Body);
}
