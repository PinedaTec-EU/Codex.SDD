using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using SpecForge.Domain.Application;
using SpecForge.Domain.Persistence;
using SpecForge.McpServer;

var phaseExecutionProvider = PhaseExecutionProviderFactory.Create();
var workflowRunner = new WorkflowRunner(phaseExecutionProvider);
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
        response = await HandleAsync(payload, applicationService, serializerOptions);
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
    JsonSerializerOptions serializerOptions)
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
                    ["version"] = "0.0.1"
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

    object result = toolName switch
    {
        "create_us_from_chat" => await applicationService.CreateUserStoryAsync(
            workspaceRoot: GetRequired(arguments, "workspaceRoot"),
            usId: GetRequired(arguments, "usId"),
            title: GetRequired(arguments, "title"),
            kind: GetRequired(arguments, "kind"),
            category: GetRequired(arguments, "category"),
            sourceText: GetRequired(arguments, "sourceText")),
        "import_us_from_markdown" => await applicationService.ImportUserStoryAsync(
            workspaceRoot: GetRequired(arguments, "workspaceRoot"),
            usId: GetRequired(arguments, "usId"),
            sourcePath: GetRequired(arguments, "sourcePath"),
            title: GetRequired(arguments, "title"),
            kind: GetRequired(arguments, "kind"),
            category: GetRequired(arguments, "category")),
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
        "get_current_phase" => await applicationService.GetCurrentPhaseAsync(
            workspaceRoot: GetRequired(arguments, "workspaceRoot"),
            usId: GetRequired(arguments, "usId")),
        "generate_next_phase" => await applicationService.GenerateNextPhaseAsync(
            workspaceRoot: GetRequired(arguments, "workspaceRoot"),
            usId: GetRequired(arguments, "usId")),
        "approve_phase" => await applicationService.ApprovePhaseAsync(
            workspaceRoot: GetRequired(arguments, "workspaceRoot"),
            usId: GetRequired(arguments, "usId"),
            baseBranch: GetOptional(arguments, "baseBranch")),
        "request_regression" => await applicationService.RequestRegressionAsync(
            workspaceRoot: GetRequired(arguments, "workspaceRoot"),
            usId: GetRequired(arguments, "usId"),
            targetPhase: GetRequired(arguments, "targetPhase"),
            reason: GetOptional(arguments, "reason")),
        "restart_user_story_from_source" => await applicationService.RestartUserStoryFromSourceAsync(
            workspaceRoot: GetRequired(arguments, "workspaceRoot"),
            usId: GetRequired(arguments, "usId"),
            reason: GetOptional(arguments, "reason")),
        _ => throw new InvalidOperationException($"Tool '{toolName}' is not supported.")
    };

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

static JsonObject BuildToolsList()
{
    return new JsonObject
    {
        ["tools"] = new JsonArray
        {
            Tool("create_us_from_chat", "Create a user story from free text."),
            Tool("import_us_from_markdown", "Import a user story from a markdown file."),
            Tool("initialize_repo_prompts", "Export the repo prompt templates into .specs/prompts/."),
            Tool("list_user_stories", "List user stories persisted in the workspace."),
            Tool("get_user_story_summary", "Get the operational summary of a user story."),
            Tool("get_current_phase", "Get the current phase and advanceability of a user story."),
            Tool("generate_next_phase", "Advance to the next linear phase and generate its artifact."),
            Tool("approve_phase", "Approve the current phase and create the work branch if required."),
            Tool("request_regression", "Regress a user story to an earlier valid phase."),
            Tool("restart_user_story_from_source", "Restart a user story after the source has changed.")
        }
    };
}

static JsonObject Tool(string name, string description)
{
    return new JsonObject
    {
        ["name"] = name,
        ["description"] = description,
        ["inputSchema"] = new JsonObject
        {
            ["type"] = "object"
        }
    };
}

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

static bool GetOptionalBoolean(JsonObject arguments, string key)
{
    var value = arguments[key];
    return value is not null && value.GetValue<bool>();
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
    var headerBytes = new List<byte>();
    var buffer = new byte[1];
    while (true)
    {
        var bytesRead = await input.ReadAsync(buffer);
        if (bytesRead == 0)
        {
            return null;
        }

        headerBytes.Add(buffer[0]);
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
