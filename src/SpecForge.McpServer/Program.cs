using System.Reflection;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using SpecForge.Domain.Application;
using SpecForge.Domain.Persistence;
using SpecForge.McpServer;

var serverVersion = typeof(Program).Assembly
    .GetCustomAttribute<AssemblyInformationalVersionAttribute>()
    ?.InformationalVersion ?? "0.0.1";

var captureTolerance = Environment.GetEnvironmentVariable("SPECFORGE_CAPTURE_TOLERANCE")?.Trim().ToLowerInvariant();
captureTolerance = captureTolerance is "strict" or "balanced" or "inferential" ? captureTolerance : "balanced";

var phaseExecutionProvider = PhaseExecutionProviderFactory.Create();
var workflowRunner = new WorkflowRunner(phaseExecutionProvider, captureTolerance);
var applicationService = new SpecForgeApplicationService(new UserStoryFileStore(), workflowRunner);
var serializerOptions = new JsonSerializerOptions(JsonSerializerDefaults.Web);
var stdin = Console.OpenStandardInput();
var stdout = Console.OpenStandardOutput();

while (true)
{
    var payload = await ReadMessageAsync(stdin);
    if (payload is null)
    {
        break;
    }

    JsonNode? response;

    try
    {
        response = await HandleAsync(payload, applicationService, serializerOptions, serverVersion);
    }
    catch (Exception exception)
    {
        response = BuildErrorResponse(payload["id"], code: -32000, exception.Message);
    }

    if (response is not null)
    {
        await WriteMessageAsync(stdout, response.ToJsonString(serializerOptions));
    }
}

static async Task<JsonNode?> HandleAsync(
    JsonNode payload,
    SpecForgeApplicationService applicationService,
    JsonSerializerOptions serializerOptions,
    string serverVersion)
{
    var method = payload["method"]?.GetValue<string>();
    if (string.IsNullOrWhiteSpace(method))
    {
        return BuildErrorResponse(payload["id"], code: -32600, "Invalid request.");
    }

    return method switch
    {
        "initialize" => BuildSuccessResponse(
            payload["id"],
            new JsonObject
            {
                ["protocolVersion"] = "2024-11-05",
                ["serverInfo"] = new JsonObject
                {
                    ["name"] = "SpecForge MCP Server",
                    ["version"] = serverVersion
                },
                ["capabilities"] = new JsonObject
                {
                    ["tools"] = new JsonObject()
                }
            }),
        "notifications/initialized" => null,
        "tools/list" => BuildSuccessResponse(payload["id"], BuildToolsList()),
        "tools/call" => await HandleToolCallAsync(payload, applicationService, serializerOptions),
        _ => BuildErrorResponse(payload["id"], code: -32601, $"Method '{method}' was not found.")
    };
}

static async Task<JsonNode> HandleToolCallAsync(
    JsonNode payload,
    SpecForgeApplicationService applicationService,
    JsonSerializerOptions serializerOptions)
{
    var parameters = payload["params"]?.AsObject() ?? throw new InvalidOperationException("Missing tool call parameters.");
    var toolName = parameters["name"]?.GetValue<string>() ?? throw new InvalidOperationException("Missing tool name.");
    var arguments = parameters["arguments"]?.AsObject() ?? new JsonObject();
    var toolRequestId = payload["id"]?.ToJsonString() ?? "null";
    await using var diagnostics = SpecForgeDiagnostics.StartProgressScope(
        $"[mcp.tool] {toolName} requestId={toolRequestId}",
        interval: TimeSpan.FromSeconds(15));

    try
    {
        object result = toolName switch
        {
            "create_us_from_chat" => await applicationService.CreateUserStoryAsync(
                workspaceRoot: GetRequired(arguments, "workspaceRoot"),
                usId: GetRequired(arguments, "usId"),
                title: GetRequired(arguments, "title"),
                kind: GetRequired(arguments, "kind"),
                category: GetRequired(arguments, "category"),
                sourceText: GetRequired(arguments, "sourceText"),
                actor: GetOptional(arguments, "actor") ?? "user"),
            "import_us_from_markdown" => await applicationService.ImportUserStoryAsync(
                workspaceRoot: GetRequired(arguments, "workspaceRoot"),
                usId: GetRequired(arguments, "usId"),
                sourcePath: GetRequired(arguments, "sourcePath"),
                title: GetRequired(arguments, "title"),
                kind: GetRequired(arguments, "kind"),
                category: GetRequired(arguments, "category"),
                actor: GetOptional(arguments, "actor") ?? "user"),
            "initialize_repo_prompts" => await applicationService.InitializeRepoPromptsAsync(
                workspaceRoot: GetRequired(arguments, "workspaceRoot"),
                overwrite: GetOptionalBoolean(arguments, "overwrite")),
            "list_user_stories" => new
            {
                items = await applicationService.ListUserStoriesAsync(
                    workspaceRoot: GetRequired(arguments, "workspaceRoot"))
            },
            "get_user_story_summary" => await applicationService.GetUserStorySummaryAsync(
                workspaceRoot: GetRequired(arguments, "workspaceRoot"),
                usId: GetRequired(arguments, "usId")),
            "get_user_story_workflow" => await applicationService.GetUserStoryWorkflowAsync(
                workspaceRoot: GetRequired(arguments, "workspaceRoot"),
                usId: GetRequired(arguments, "usId")),
            "get_current_phase" => await applicationService.GetCurrentPhaseAsync(
                workspaceRoot: GetRequired(arguments, "workspaceRoot"),
                usId: GetRequired(arguments, "usId")),
            "get_user_story_runtime_status" => await applicationService.GetUserStoryRuntimeStatusAsync(
                workspaceRoot: GetRequired(arguments, "workspaceRoot"),
                usId: GetRequired(arguments, "usId")),
            "generate_next_phase" => await applicationService.GenerateNextPhaseAsync(
                workspaceRoot: GetRequired(arguments, "workspaceRoot"),
                usId: GetRequired(arguments, "usId"),
                actor: GetOptional(arguments, "actor") ?? "user"),
            "approve_review_anyway" => await applicationService.ApproveReviewAnywayAsync(
                workspaceRoot: GetRequired(arguments, "workspaceRoot"),
                usId: GetRequired(arguments, "usId"),
                reason: GetRequired(arguments, "reason"),
                actor: GetOptional(arguments, "actor") ?? "user"),
            "approve_phase" => await applicationService.ApprovePhaseAsync(
                workspaceRoot: GetRequired(arguments, "workspaceRoot"),
                usId: GetRequired(arguments, "usId"),
                baseBranch: GetOptional(arguments, "baseBranch"),
                workBranch: GetOptional(arguments, "workBranch"),
                actor: GetOptional(arguments, "actor") ?? "user"),
            "request_regression" => await applicationService.RequestRegressionAsync(
                workspaceRoot: GetRequired(arguments, "workspaceRoot"),
                usId: GetRequired(arguments, "usId"),
                targetPhase: GetRequired(arguments, "targetPhase"),
                reason: GetOptional(arguments, "reason"),
                destructive: GetOptionalBoolean(arguments, "destructive"),
                actor: GetOptional(arguments, "actor") ?? "user"),
            "restart_user_story_from_source" => await applicationService.RestartUserStoryFromSourceAsync(
                workspaceRoot: GetRequired(arguments, "workspaceRoot"),
                usId: GetRequired(arguments, "usId"),
                reason: GetOptional(arguments, "reason"),
                actor: GetOptional(arguments, "actor") ?? "user"),
            "rewind_workflow" => await applicationService.RewindWorkflowAsync(
                workspaceRoot: GetRequired(arguments, "workspaceRoot"),
                usId: GetRequired(arguments, "usId"),
                targetPhase: GetRequired(arguments, "targetPhase"),
                destructive: GetOptionalBoolean(arguments, "destructive"),
                actor: GetOptional(arguments, "actor") ?? "user"),
            "reset_user_story_to_capture" => await applicationService.ResetUserStoryToCaptureAsync(
                workspaceRoot: GetRequired(arguments, "workspaceRoot"),
                usId: GetRequired(arguments, "usId")),
            "submit_clarification_answers" => await applicationService.SubmitClarificationAnswersAsync(
                workspaceRoot: GetRequired(arguments, "workspaceRoot"),
                usId: GetRequired(arguments, "usId"),
                answers: GetStringArray(arguments, "answers"),
                actor: GetOptional(arguments, "actor") ?? "user"),
            "submit_approval_answer" => await applicationService.SubmitApprovalAnswerAsync(
                workspaceRoot: GetRequired(arguments, "workspaceRoot"),
                usId: GetRequired(arguments, "usId"),
                question: GetRequired(arguments, "question"),
                answer: GetRequired(arguments, "answer"),
                actor: GetOptional(arguments, "actor") ?? "user"),
            "operate_current_phase_artifact" => await applicationService.OperateCurrentPhaseArtifactAsync(
                workspaceRoot: GetRequired(arguments, "workspaceRoot"),
                usId: GetRequired(arguments, "usId"),
                prompt: GetRequired(arguments, "prompt"),
                includeReviewArtifactInContext: GetOptionalBoolean(arguments, "includeReviewArtifactInContext", defaultValue: true),
                actor: GetOptional(arguments, "actor") ?? "user"),
            "list_user_story_files" => await applicationService.ListUserStoryFilesAsync(
                workspaceRoot: GetRequired(arguments, "workspaceRoot"),
                usId: GetRequired(arguments, "usId")),
            "add_user_story_files" => await applicationService.AddUserStoryFilesAsync(
                workspaceRoot: GetRequired(arguments, "workspaceRoot"),
                usId: GetRequired(arguments, "usId"),
                sourcePaths: GetStringArray(arguments, "sourcePaths"),
                kind: GetRequired(arguments, "kind")),
            "set_user_story_file_kind" => await applicationService.SetUserStoryFileKindAsync(
                workspaceRoot: GetRequired(arguments, "workspaceRoot"),
                usId: GetRequired(arguments, "usId"),
                filePath: GetRequired(arguments, "filePath"),
                kind: GetRequired(arguments, "kind")),
            _ => throw new InvalidOperationException($"Tool '{toolName}' is not supported.")
        };

        diagnostics.MarkCompleted();

        var resultJson = JsonSerializer.Serialize(result, serializerOptions);
        return BuildSuccessResponse(
            payload["id"],
            new JsonObject
            {
                ["content"] = new JsonArray
                {
                    new JsonObject
                    {
                        ["type"] = "text",
                        ["text"] = resultJson
                    }
                }
            });
    }
    catch (Exception exception)
    {
        diagnostics.MarkFailed(exception);
        throw;
    }
}

static JsonObject BuildToolsList()
{
    return new JsonObject
    {
        ["tools"] = new JsonArray
        {
            Tool("create_us_from_chat", "Create a user story from free text.",
                Schema(
                    required: ["workspaceRoot", "usId", "title", "kind", "category", "sourceText"],
                    Props(
                        ("workspaceRoot", Prop("string", "Absolute path to the workspace root (folder containing .specs/).")),
                        ("usId",          Prop("string", "User story identifier, e.g. US-001.")),
                        ("title",         Prop("string", "Short descriptive title for the user story.")),
                        ("kind",          Prop("string", "User story kind: feature, bug, task, spike, or chore.")),
                        ("category",      Prop("string", "Category that groups the user story, e.g. core, ux, api.")),
                        ("sourceText",    Prop("string", "Free-text description of the user story intent.")),
                        ("actor",         Prop("string", "Actor performing the action. Defaults to 'user'."))))),

            Tool("import_us_from_markdown", "Import a user story from an existing markdown file.",
                Schema(
                    required: ["workspaceRoot", "usId", "sourcePath", "title", "kind", "category"],
                    Props(
                        ("workspaceRoot", Prop("string", "Absolute path to the workspace root.")),
                        ("usId",          Prop("string", "User story identifier, e.g. US-001.")),
                        ("sourcePath",    Prop("string", "Absolute path to the source markdown file to import.")),
                        ("title",         Prop("string", "Short descriptive title for the user story.")),
                        ("kind",          Prop("string", "User story kind: feature, bug, task, spike, or chore.")),
                        ("category",      Prop("string", "Category that groups the user story.")),
                        ("actor",         Prop("string", "Actor performing the action. Defaults to 'user'."))))),

            Tool("initialize_repo_prompts", "Export the repo prompt templates into .specs/prompts/.",
                Schema(
                    required: ["workspaceRoot"],
                    Props(
                        ("workspaceRoot", Prop("string", "Absolute path to the workspace root.")),
                        ("overwrite",     Prop("boolean", "If true, overwrite existing prompt files. Defaults to false."))))),

            Tool("list_user_stories", "List all user stories persisted in the workspace.",
                Schema(
                    required: ["workspaceRoot"],
                    Props(
                        ("workspaceRoot", Prop("string", "Absolute path to the workspace root."))))),

            Tool("get_user_story_summary", "Get the operational summary of a user story.",
                Schema(
                    required: ["workspaceRoot", "usId"],
                    Props(
                        ("workspaceRoot", Prop("string", "Absolute path to the workspace root.")),
                        ("usId",          Prop("string", "User story identifier."))))),

            Tool("get_user_story_workflow", "Get workflow phases, controls, clarification session, and audit trail for a user story.",
                Schema(
                    required: ["workspaceRoot", "usId"],
                    Props(
                        ("workspaceRoot", Prop("string", "Absolute path to the workspace root.")),
                        ("usId",          Prop("string", "User story identifier."))))),

            Tool("get_current_phase", "Get the current phase and whether it can advance for a user story.",
                Schema(
                    required: ["workspaceRoot", "usId"],
                    Props(
                        ("workspaceRoot", Prop("string", "Absolute path to the workspace root.")),
                        ("usId",          Prop("string", "User story identifier."))))),

            Tool("get_user_story_runtime_status", "Get the persisted runtime status, including whether a phase generation is still running.",
                Schema(
                    required: ["workspaceRoot", "usId"],
                    Props(
                        ("workspaceRoot", Prop("string", "Absolute path to the workspace root.")),
                        ("usId",          Prop("string", "User story identifier."))))),

            Tool("generate_next_phase", "Advance to the next linear phase and generate its artifact via the configured AI provider.",
                Schema(
                    required: ["workspaceRoot", "usId"],
                    Props(
                        ("workspaceRoot", Prop("string", "Absolute path to the workspace root.")),
                        ("usId",          Prop("string", "User story identifier.")),
                        ("actor",         Prop("string", "Actor requesting the phase execution. Defaults to 'user'."))))),

            Tool("approve_phase", "Approve the current phase. Creates the work branch when reaching the branch-creation phase.",
                Schema(
                    required: ["workspaceRoot", "usId"],
                    Props(
                        ("workspaceRoot", Prop("string", "Absolute path to the workspace root.")),
                        ("usId",          Prop("string", "User story identifier.")),
                        ("baseBranch",    Prop("string", "Base branch name for the work branch. Optional.")),
                        ("workBranch",    Prop("string", "Override for the work branch name. Optional.")),
                        ("actor",         Prop("string", "Actor performing the approval. Defaults to 'user'."))))),

            Tool("approve_review_anyway", "Force the workflow to leave review and enter release approval by explicit human decision.",
                Schema(
                    required: ["workspaceRoot", "usId", "reason"],
                    Props(
                        ("workspaceRoot", Prop("string", "Absolute path to the workspace root.")),
                        ("usId",          Prop("string", "User story identifier.")),
                        ("reason",        Prop("string", "Audit reason for overriding the review gate.")),
                        ("actor",         Prop("string", "Actor performing the override. Defaults to 'user'."))))),

            Tool("request_regression", "Regress a user story to an earlier valid phase.",
                Schema(
                    required: ["workspaceRoot", "usId", "targetPhase"],
                    Props(
                        ("workspaceRoot", Prop("string", "Absolute path to the workspace root.")),
                        ("usId",          Prop("string", "User story identifier.")),
                        ("targetPhase",   Prop("string", "Phase slug to regress to, e.g. clarification, refinement, technical-design.")),
                        ("reason",        Prop("string", "Optional reason for the regression.")),
                        ("destructive",   Prop("boolean", "Whether to delete later derived artifacts while regressing. Defaults to false.")),
                        ("actor",         Prop("string", "Actor requesting the regression. Defaults to 'user'."))))),

            Tool("restart_user_story_from_source", "Restart the workflow after the source user story file has been modified.",
                Schema(
                    required: ["workspaceRoot", "usId"],
                    Props(
                        ("workspaceRoot", Prop("string", "Absolute path to the workspace root.")),
                        ("usId",          Prop("string", "User story identifier.")),
                        ("reason",        Prop("string", "Optional reason for the restart.")),
                        ("actor",         Prop("string", "Actor requesting the restart. Defaults to 'user'."))))),

            Tool("rewind_workflow", "Rewind a workflow to an earlier executed phase. Destructive cleanup is optional and disabled by default.",
                Schema(
                    required: ["workspaceRoot", "usId", "targetPhase"],
                    Props(
                        ("workspaceRoot", Prop("string", "Absolute path to the workspace root.")),
                        ("usId",          Prop("string", "User story identifier.")),
                        ("targetPhase",   Prop("string", "Phase slug to rewind to, e.g. clarification, refinement, technical-design.")),
                        ("destructive",   Prop("boolean", "Whether to delete later derived artifacts while rewinding. Defaults to false.")),
                        ("actor",         Prop("string", "Actor requesting the rewind. Defaults to 'user'."))))),

            Tool("reset_user_story_to_capture", "Reset a user story to the capture phase and delete all generated derived artifacts.",
                Schema(
                    required: ["workspaceRoot", "usId"],
                    Props(
                        ("workspaceRoot", Prop("string", "Absolute path to the workspace root.")),
                        ("usId",          Prop("string", "User story identifier."))))),

            Tool("submit_clarification_answers", "Store clarification answers so the clarification phase can re-run with the new context.",
                Schema(
                    required: ["workspaceRoot", "usId", "answers"],
                    Props(
                        ("workspaceRoot", Prop("string", "Absolute path to the workspace root.")),
                        ("usId",          Prop("string", "User story identifier.")),
                        ("answers",       ArrayProp("string", "Ordered list of answers matching the clarification questions.")),
                        ("actor",         Prop("string", "Actor submitting the answers. Defaults to 'user'."))))),

            Tool("submit_approval_answer", "Persist a human approval answer into the current refinement artifact without invoking the model.",
                Schema(
                    required: ["workspaceRoot", "usId", "question", "answer"],
                    Props(
                        ("workspaceRoot", Prop("string", "Absolute path to the workspace root.")),
                        ("usId",          Prop("string", "User story identifier.")),
                        ("question",      Prop("string", "Approval question being answered.")),
                        ("answer",        Prop("string", "Human answer to persist into the refinement artifact.")),
                        ("actor",         Prop("string", "Actor submitting the answer. Defaults to 'user'."))))),

            Tool("operate_current_phase_artifact", "Apply a model-assisted operation over the current phase artifact and persist the trace.",
                Schema(
                    required: ["workspaceRoot", "usId", "prompt"],
                    Props(
                        ("workspaceRoot", Prop("string", "Absolute path to the workspace root.")),
                        ("usId",          Prop("string", "User story identifier.")),
                        ("prompt",        Prop("string", "Instruction describing what to change or verify in the current artifact.")),
                        ("includeReviewArtifactInContext", Prop("boolean", "Whether implementation operations may include the generated review artifact as previous context. Defaults to true.")),
                        ("actor",         Prop("string", "Actor requesting the operation. Defaults to 'user'."))))),

            Tool("list_user_story_files", "List context files and user-story info files for a user story.",
                Schema(
                    required: ["workspaceRoot", "usId"],
                    Props(
                        ("workspaceRoot", Prop("string", "Absolute path to the workspace root.")),
                        ("usId",          Prop("string", "User story identifier."))))),

            Tool("add_user_story_files", "Copy external files into a user story as context or user-story info.",
                Schema(
                    required: ["workspaceRoot", "usId", "sourcePaths", "kind"],
                    Props(
                        ("workspaceRoot", Prop("string", "Absolute path to the workspace root.")),
                        ("usId",          Prop("string", "User story identifier.")),
                        ("sourcePaths",   ArrayProp("string", "Absolute paths of the files to copy into the user story.")),
                        ("kind",          Prop("string", "File kind: 'context' or 'attachment'."))))),

            Tool("set_user_story_file_kind", "Move an existing user-story file between context and user-story info.",
                Schema(
                    required: ["workspaceRoot", "usId", "filePath", "kind"],
                    Props(
                        ("workspaceRoot", Prop("string", "Absolute path to the workspace root.")),
                        ("usId",          Prop("string", "User story identifier.")),
                        ("filePath",      Prop("string", "Absolute path of the file to reclassify.")),
                        ("kind",          Prop("string", "Target file kind: 'context' or 'attachment'.")))))
        }
    };
}

static JsonObject Tool(string name, string description, JsonObject inputSchema)
{
    return new JsonObject
    {
        ["name"] = name,
        ["description"] = description,
        ["inputSchema"] = inputSchema
    };
}

static JsonObject Schema(string[] required, JsonObject properties)
{
    var req = new JsonArray();
    foreach (var r in required)
    {
        req.Add((JsonNode)r);
    }

    return new JsonObject
    {
        ["type"] = "object",
        ["properties"] = properties,
        ["required"] = req
    };
}

static JsonObject Props(params (string name, JsonObject schema)[] entries)
{
    var obj = new JsonObject();
    foreach (var (name, schema) in entries)
    {
        obj[name] = schema;
    }

    return obj;
}

static JsonObject Prop(string type, string description) =>
    new JsonObject { ["type"] = type, ["description"] = description };

static JsonObject ArrayProp(string itemType, string description) =>
    new JsonObject
    {
        ["type"] = "array",
        ["items"] = new JsonObject { ["type"] = itemType },
        ["description"] = description
    };

static string GetRequired(JsonObject arguments, string key)
{
    var value = arguments[key]?.GetValue<string>();
    if (string.IsNullOrWhiteSpace(value))
    {
        throw new InvalidOperationException($"Missing required argument '{key}'.");
    }

    return value;
}

static string? GetOptional(JsonObject arguments, string key)
{
    var value = arguments[key]?.GetValue<string>();
    return string.IsNullOrWhiteSpace(value) ? null : value;
}

static bool GetOptionalBoolean(JsonObject arguments, string key, bool defaultValue = false)
{
    var value = arguments[key];
    return value is not null ? value.GetValue<bool>() : defaultValue;
}

static string[] GetStringArray(JsonObject arguments, string key)
{
    if (arguments[key] is not JsonArray array)
    {
        return [];
    }

    return array
        .Select(static item => item?.GetValue<string>()?.Trim())
        .Where(static item => !string.IsNullOrWhiteSpace(item))
        .Cast<string>()
        .ToArray();
}

static JsonObject BuildSuccessResponse(JsonNode? id, JsonNode result)
{
    return new JsonObject
    {
        ["jsonrpc"] = "2.0",
        ["id"] = id?.DeepClone(),
        ["result"] = result
    };
}

static JsonObject BuildErrorResponse(JsonNode? id, int code, string message)
{
    return new JsonObject
    {
        ["jsonrpc"] = "2.0",
        ["id"] = id?.DeepClone(),
        ["error"] = new JsonObject
        {
            ["code"] = code,
            ["message"] = message
        }
    };
}

static async Task<JsonNode?> ReadMessageAsync(Stream input)
{
    const int maxHeaderSize = 8192;
    var headerBytes = new List<byte>(256);
    var buffer = new byte[1];
    while (true)
    {
        var bytesRead = await input.ReadAsync(buffer);
        if (bytesRead == 0)
        {
            return null;
        }

        headerBytes.Add(buffer[0]);

        if (headerBytes.Count > maxHeaderSize)
        {
            throw new InvalidOperationException($"MCP message header exceeds maximum allowed size of {maxHeaderSize} bytes.");
        }

        var headerString = Encoding.UTF8.GetString(headerBytes.ToArray());
        if (headerString.EndsWith("\r\n\r\n", StringComparison.Ordinal))
        {
            var contentLengthLine = headerString
                .Split("\r\n", StringSplitOptions.RemoveEmptyEntries)
                .First(line => line.StartsWith("Content-Length:", StringComparison.OrdinalIgnoreCase));
            var contentLength = int.Parse(contentLengthLine.Split(':', 2)[1].Trim());
            var contentBytes = new byte[contentLength];
            var totalRead = 0;
            while (totalRead < contentLength)
            {
                totalRead += await input.ReadAsync(contentBytes.AsMemory(totalRead, contentLength - totalRead));
            }

            return JsonNode.Parse(contentBytes) ?? throw new InvalidOperationException("Invalid JSON payload.");
        }
    }
}

static async Task WriteMessageAsync(Stream output, string json)
{
    var contentBytes = Encoding.UTF8.GetBytes(json);
    var headerBytes = Encoding.ASCII.GetBytes($"Content-Length: {contentBytes.Length}\r\n\r\n");
    await output.WriteAsync(headerBytes);
    await output.WriteAsync(contentBytes);
    await output.FlushAsync();
}
