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
            {
              "state": "pending_user_input",
              "decision": "needs_clarification",
              "reason": "The story does not identify who publishes the article or how bilingual content is selected.",
              "questions": [
                "Which role publishes the article?",
                "How is the language selected for the rendered article?"
              ]
            }
            """,
            """
            {
              "state": "ready",
              "decision": "ready_for_refinement",
              "reason": "The current user story and clarification answers are concrete enough to proceed to refinement.",
              "questions": []
            }
            """,
            """
            {
              "title": "Persist LinkedIn bilingual article rendering",
              "historyLog": [
                "`2026-04-22T12:09:02Z` · Initial refinement baseline generated."
              ],
              "state": "pending_approval",
              "basedOn": "clarification.md",
              "specSummary": "Persist LinkedIn article content in `articles.json` and render both Spanish and English variants.",
              "inputs": [
                "Marketing editors publish bilingual article content."
              ],
              "outputs": [
                "Landing page renders the article in the requested locale."
              ],
              "businessRules": [
                "Locale selects the Spanish or English article variant."
              ],
              "edgeCases": [
                "Missing locale falls back to the default supported language."
              ],
              "errorsAndFailureModes": [
                "Unknown article slug returns a not-found response."
              ],
              "constraints": [
                "Keep the first pass bounded to the current repository."
              ],
              "detectedAmbiguities": [
                "Analytics tracking remains out of scope unless explicitly approved."
              ],
              "redTeam": [
                "The request could overreach into content authoring workflows."
              ],
              "blueTeam": [
                "Keep scope bounded to persisted article rendering."
              ],
              "acceptanceCriteria": [
                "Articles can be loaded from `articles.json`.",
                "The page renders Spanish and English versions of the article content.",
                "The article can be selected by slug and locale."
              ],
              "humanApprovalQuestions": [
                {
                  "question": "Is the bilingual scope bounded enough for technical design?",
                  "status": "pending"
                }
              ]
            }
            """
        ]);

        var provider = new OpenAiCompatiblePhaseExecutionProvider(
            new HttpClient(),
            new OpenAiCompatibleProviderOptions(
                ClarificationTolerance: "inferential",
                ModelProfiles:
                [
                    new OpenAiCompatibleModelProfile(
                        Name: "default",
                        Provider: "openai-compatible",
                        BaseUrl: $"{modelStub.BaseUrl}/v1",
                        ApiKey: string.Empty,
                        Model: "stub-model")
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
        Assert.Contains(clarificationWorkflow.Events, timelineEvent =>
            timelineEvent.Code == "clarification_requested"
            && timelineEvent.Actor == "user"
            && timelineEvent.Execution is not null
            && timelineEvent.Execution.Model == "stub-model");

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
        Assert.EndsWith("01-spec.md", refinementResult.GeneratedArtifactPath, StringComparison.Ordinal);

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
        Assert.Equal(0.4d, OpenAiCompatibleRequestJson.ReadTemperature(modelStub.Requests[0].Body));
        Assert.Equal(0.4d, OpenAiCompatibleRequestJson.ReadTemperature(modelStub.Requests[1].Body));
        Assert.Equal(0.2d, OpenAiCompatibleRequestJson.ReadTemperature(modelStub.Requests[2].Body));
        Assert.Equal("json_schema", OpenAiCompatibleRequestJson.ReadResponseFormatType(modelStub.Requests[0].Body));
        Assert.Equal("clarification_artifact", OpenAiCompatibleRequestJson.ReadResponseSchemaName(modelStub.Requests[0].Body));
        Assert.Equal("refinement_artifact", OpenAiCompatibleRequestJson.ReadResponseSchemaName(modelStub.Requests[2].Body));
        Assert.Contains("Role: clarification analyst.", OpenAiCompatibleRequestJson.ReadUserPrompt(modelStub.Requests[0].Body));
        Assert.Contains("- Phase: `Clarification`", OpenAiCompatibleRequestJson.ReadUserPrompt(modelStub.Requests[0].Body));
        Assert.Contains("Active tolerance: `inferential`", OpenAiCompatibleRequestJson.ReadUserPrompt(modelStub.Requests[0].Body));
        Assert.Contains("Role: clarification analyst.", OpenAiCompatibleRequestJson.ReadUserPrompt(modelStub.Requests[1].Body));
        Assert.Contains("- Phase: `Clarification`", OpenAiCompatibleRequestJson.ReadUserPrompt(modelStub.Requests[1].Body));
        Assert.Contains("Role: refinement analyst.", OpenAiCompatibleRequestJson.ReadUserPrompt(modelStub.Requests[2].Body));
        Assert.Contains("- Phase: `Refinement`", OpenAiCompatibleRequestJson.ReadUserPrompt(modelStub.Requests[2].Body));
        Assert.Contains("## Clarification Log", OpenAiCompatibleRequestJson.ReadUserPrompt(modelStub.Requests[1].Body));
        Assert.Contains("El editor de marketing publica el articulo.", OpenAiCompatibleRequestJson.ReadUserPrompt(modelStub.Requests[1].Body));
    }

    [Fact]
    public async Task GenerateNextPhaseAsync_AutoClarificationAnswers_ContinuesToRefinementWithSelectedProfile()
    {
        await new RepositoryPromptInitializer().InitializeAsync(workspaceRoot);

        using var modelStub = new OpenAiCompatibleModelStubServer(
        [
            """
            {
              "state": "pending_user_input",
              "decision": "needs_clarification",
              "reason": "The story does not identify who publishes the article.",
              "questions": [
                "Which role publishes the article?"
              ]
            }
            """,
            """
            {
              "canResolve": true,
              "reason": "The story mentions the marketing editor in the available context.",
              "answers": [
                "Marketing editor"
              ]
            }
            """,
            """
            {
              "state": "ready",
              "decision": "ready_for_refinement",
              "reason": "The current user story and clarification answers are concrete enough to proceed to refinement.",
              "questions": []
            }
            """,
            """
            {
              "title": "Persist LinkedIn bilingual article rendering",
              "historyLog": [
                "`2026-04-22T12:09:02Z` · Initial refinement baseline generated."
              ],
              "state": "pending_approval",
              "basedOn": "clarification.md",
              "specSummary": "Persist LinkedIn article content in `articles.json` and render both Spanish and English variants.",
              "inputs": [
                "Marketing editors publish bilingual article content."
              ],
              "outputs": [
                "Landing page renders the article in the requested locale."
              ],
              "businessRules": [
                "Locale selects the Spanish or English article variant."
              ],
              "edgeCases": [
                "Missing locale falls back to the default supported language."
              ],
              "errorsAndFailureModes": [
                "Unknown article slug returns a not-found response."
              ],
              "constraints": [
                "Keep the first pass bounded to the current repository."
              ],
              "detectedAmbiguities": [
                "Analytics tracking remains out of scope unless explicitly approved."
              ],
              "redTeam": [
                "The request could overreach into content authoring workflows."
              ],
              "blueTeam": [
                "Keep scope bounded to persisted article rendering."
              ],
              "acceptanceCriteria": [
                "Articles can be loaded from `articles.json`.",
                "The page renders Spanish and English versions of the article content.",
                "The article can be selected by slug and locale."
              ],
              "humanApprovalQuestions": [
                {
                  "question": "Is the bilingual scope bounded enough for technical design?",
                  "status": "pending"
                }
              ]
            }
            """
        ]);

        var provider = new OpenAiCompatiblePhaseExecutionProvider(
            new HttpClient(),
            new OpenAiCompatibleProviderOptions(
                ClarificationTolerance: "balanced",
                AutoClarificationAnswersEnabled: true,
                AutoClarificationAnswersProfile: "resolver",
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

        Assert.Equal("refinement", result.CurrentPhase);
        Assert.Equal("waiting-user", result.Status);
        Assert.NotNull(result.GeneratedArtifactPath);

        var workflow = await applicationService.GetUserStoryWorkflowAsync(workspaceRoot, "US-0001");
        Assert.Equal("refinement", workflow.CurrentPhase);
        Assert.Contains(workflow.Events, eventItem => eventItem.Code == "clarification_auto_answered");
        Assert.Contains(workflow.Events, eventItem =>
            eventItem.Code == "clarification_auto_answered"
            && eventItem.Execution is not null
            && eventItem.Execution.ProfileName == "resolver"
            && eventItem.Execution.Model == "stub-resolver");

        Assert.Equal(4, modelStub.Requests.Count);
        Assert.Equal("clarification_artifact", OpenAiCompatibleRequestJson.ReadResponseSchemaName(modelStub.Requests[0].Body));
        Assert.Equal("auto_clarification_answers", OpenAiCompatibleRequestJson.ReadResponseSchemaName(modelStub.Requests[1].Body));
        Assert.Equal("clarification_artifact", OpenAiCompatibleRequestJson.ReadResponseSchemaName(modelStub.Requests[2].Body));
        Assert.Equal("refinement_artifact", OpenAiCompatibleRequestJson.ReadResponseSchemaName(modelStub.Requests[3].Body));
        Assert.Contains("\"model\":\"stub-resolver\"", modelStub.Requests[1].Body);
    }

    [Fact]
    public async Task GenerateNextPhaseAsync_FullWorkflow_InvokesModelForEveryModelBackedPhaseAndStopsAtReleaseApproval()
    {
        await new RepositoryPromptInitializer().InitializeAsync(workspaceRoot);

        using var modelStub = new OpenAiCompatibleModelStubServer(
        [
            """
            {
              "state": "pending_user_input",
              "decision": "needs_clarification",
              "reason": "The story does not identify who configures suite agent sampling or where limits are enforced.",
              "questions": [
                "Which role configures the sampling controls?"
              ]
            }
            """,
            """
            {
              "canResolve": true,
              "reason": "The story context points to the suite administrator as the owner of these settings.",
              "answers": [
                "The suite administrator configures the sampling controls."
              ]
            }
            """,
            """
            {
              "state": "ready",
              "decision": "ready_for_refinement",
              "reason": "The story and inferred clarification answer are concrete enough to proceed.",
              "questions": []
            }
            """,
            """
            {
              "title": "Control suite agent sampling",
              "historyLog": [
                "`2026-04-23T12:00:00Z` · Initial refinement baseline generated."
              ],
              "state": "pending_approval",
              "basedOn": "clarification.md",
              "specSummary": "Allow a suite administrator to configure bounded agent sampling defaults and validation rules.",
              "inputs": [
                "Suite administrator updates sampling settings."
              ],
              "outputs": [
                "Persisted sampling defaults become available to downstream execution flows."
              ],
              "businessRules": [
                "Sampling values must remain inside approved bounds."
              ],
              "edgeCases": [
                "Out-of-range values are rejected before persistence."
              ],
              "errorsAndFailureModes": [
                "Invalid settings never become the active configuration."
              ],
              "constraints": [
                "Keep the first pass inside the current repository."
              ],
              "detectedAmbiguities": [
                "Historical migration of legacy values remains out of scope."
              ],
              "redTeam": [
                "A lax validation rule could allow invalid runtime states."
              ],
              "blueTeam": [
                "Keep the scope bounded to validation, persistence, and runtime propagation."
              ],
              "acceptanceCriteria": [
                "Sampling settings can be updated through the supported API boundary.",
                "Persisted values are validated before saving.",
                "Runtime consumers receive the validated sampling defaults."
              ],
              "humanApprovalQuestions": [
                {
                  "question": "Is the implementation scope bounded enough for technical design?",
                  "status": "pending"
                }
              ]
            }
            """,
            """
            {
              "state": "generated",
              "basedOn": "01-spec.md",
              "technicalSummary": "Translate the approved sampling-control spec into repository changes.",
              "technicalObjective": "Enforce validated sampling settings through API, persistence, and runtime layers.",
              "affectedComponents": [
                "Sampling settings API",
                "Configuration persistence",
                "Runtime settings resolver"
              ],
              "architecture": [
                "Keep validation rules centralized so persistence and runtime share the same contract."
              ],
              "primaryFlow": [
                "Receive sampling settings update.",
                "Validate bounded values.",
                "Persist normalized settings.",
                "Expose the persisted values to runtime consumers."
              ],
              "constraintsAndGuardrails": [
                "Do not expand scope into unrelated orchestration behavior."
              ],
              "alternativesConsidered": [
                "Validate only at the UI layer."
              ],
              "technicalRisks": [
                "Divergent validation paths could allow inconsistent saved state."
              ],
              "expectedImpact": [
                "Sampling defaults become safely configurable."
              ],
              "implementationStrategy": [
                "Add request validation at the API boundary.",
                "Persist normalized settings in the existing configuration store.",
                "Update runtime settings resolution to read the persisted defaults."
              ],
              "validationStrategy": [
                "Cover valid and invalid values in domain and API tests."
              ],
              "openDecisions": []
            }
            """,
            """
            {
              "state": "generated",
              "basedOn": "02-technical-design.md",
              "implementedObjective": "Apply the planned sampling-control changes to the repository.",
              "plannedOrExecutedChanges": [
                "Update the API validation path for sampling settings.",
                "Persist normalized sampling values.",
                "Propagate persisted settings into runtime resolution."
              ],
              "plannedVerification": [
                "Run focused tests that cover valid and invalid sampling settings.",
                "Verify runtime consumers read the persisted values."
              ]
            }
            """,
            """
            {
              "result": "pass",
              "validationChecklist": [
                {
                  "status": "pass",
                  "item": "Cover valid and invalid values in domain and API tests.",
                  "evidence": "Implementation evidence is present and planned verification covers focused tests for valid and invalid sampling settings."
                }
              ],
              "findings": [
                "No material deviations were detected in the simulated workflow artifacts."
              ],
              "primaryReason": "All model-backed workflow phases produced the required evidence in order.",
              "recommendation": [
                "Advance to `release_approval`."
              ]
            }
            """
        ]);

        var provider = new OpenAiCompatiblePhaseExecutionProvider(
            new HttpClient(),
            new OpenAiCompatibleProviderOptions(
                ClarificationTolerance: "balanced",
                AutoClarificationAnswersEnabled: true,
                AutoClarificationAnswersProfile: "resolver",
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

        var refinementResult = await applicationService.GenerateNextPhaseAsync(workspaceRoot, "US-0001");
        Assert.Equal("refinement", refinementResult.CurrentPhase);
        Assert.Equal("waiting-user", refinementResult.Status);

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
            eventItem.Code == "clarification_auto_answered"
            && eventItem.Execution is not null
            && eventItem.Execution.ProfileName == "resolver");
        Assert.Contains(workflow.Events, eventItem => eventItem.Code == "phase_completed" && eventItem.Phase == "technical-design");
        Assert.Contains(workflow.Events, eventItem => eventItem.Code == "phase_completed" && eventItem.Phase == "implementation");
        Assert.Contains(workflow.Events, eventItem => eventItem.Code == "phase_completed" && eventItem.Phase == "review");

        Assert.Equal(7, modelStub.Requests.Count);
        Assert.Equal(
            [
                "clarification_artifact",
                "auto_clarification_answers",
                "clarification_artifact",
                "refinement_artifact",
                "technical_design_artifact",
                "implementation_artifact",
                "review_artifact"
            ],
            modelStub.Requests.Select(request => OpenAiCompatibleRequestJson.ReadResponseSchemaName(request.Body)).ToArray());
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
