using System.Text.Json;
using SpecForge.Domain.Application;

var runner = new WorkflowRunner();
var applicationService = new SpecForgeApplicationService();

if (args.Length == 0)
{
    return ExitWithError("A command is required.");
}

try
{
    var command = args[0];

    switch (command)
    {
        case "create-us":
            await HandleCreateUserStoryAsync(runner, args);
            return 0;
        case "import-us":
            await HandleImportUserStoryAsync(runner, args);
            return 0;
        case "continue-phase":
            await HandleContinuePhaseAsync(runner, args);
            return 0;
        case "list-user-stories":
            await HandleListUserStoriesAsync(applicationService, args);
            return 0;
        case "get-user-story-summary":
            await HandleGetUserStorySummaryAsync(applicationService, args);
            return 0;
        case "approve-phase":
            await HandleApprovePhaseAsync(runner, applicationService, args);
            return 0;
        default:
            return ExitWithError($"Unknown command '{command}'.");
    }
}
catch (Exception exception)
{
    return ExitWithError(exception.Message);
}

static async Task HandleCreateUserStoryAsync(WorkflowRunner runner, IReadOnlyList<string> args)
{
    EnsureArgumentCount(args, expectedCount: 6);

    var workspaceRoot = args[1];
    var usId = args[2];
    var title = args[3];
    var kind = args[4];
    var sourceText = args[5];
    var rootDirectory = await runner.CreateUserStoryAsync(workspaceRoot, usId, title, kind, sourceText);

    WriteJson(new
    {
        usId,
        rootDirectory,
        mainArtifactPath = Path.Combine(rootDirectory, "us.md")
    });
}

static async Task HandleImportUserStoryAsync(WorkflowRunner runner, IReadOnlyList<string> args)
{
    EnsureArgumentCount(args, expectedCount: 6);

    var workspaceRoot = args[1];
    var usId = args[2];
    var sourcePath = args[3];
    var title = args[4];
    var kind = args[5];
    var sourceText = await File.ReadAllTextAsync(sourcePath);
    var rootDirectory = await runner.CreateUserStoryAsync(workspaceRoot, usId, title, kind, sourceText);

    WriteJson(new
    {
        usId,
        rootDirectory,
        mainArtifactPath = Path.Combine(rootDirectory, "us.md")
    });
}

static async Task HandleContinuePhaseAsync(WorkflowRunner runner, IReadOnlyList<string> args)
{
    EnsureArgumentCount(args, expectedCount: 3);

    var workspaceRoot = args[1];
    var usId = args[2];
    var result = await runner.ContinuePhaseAsync(workspaceRoot, usId);

    WriteJson(new
    {
        result.UsId,
        currentPhase = WorkflowPresentation.ToPhaseSlug(result.CurrentPhase),
        status = WorkflowPresentation.ToStatusSlug(result.Status),
        result.GeneratedArtifactPath
    });
}

static async Task HandleListUserStoriesAsync(SpecForgeApplicationService applicationService, IReadOnlyList<string> args)
{
    EnsureArgumentCount(args, expectedCount: 2);

    var workspaceRoot = args[1];
    var items = await applicationService.ListUserStoriesAsync(workspaceRoot);
    WriteJson(new { items });
}

static async Task HandleGetUserStorySummaryAsync(SpecForgeApplicationService applicationService, IReadOnlyList<string> args)
{
    EnsureArgumentCount(args, expectedCount: 3);

    var workspaceRoot = args[1];
    var usId = args[2];
    var summary = await applicationService.GetUserStorySummaryAsync(workspaceRoot, usId);
    WriteJson(summary);
}

static async Task HandleApprovePhaseAsync(
    WorkflowRunner runner,
    SpecForgeApplicationService applicationService,
    IReadOnlyList<string> args)
{
    EnsureArgumentCount(args, expectedCount: 4);

    var workspaceRoot = args[1];
    var usId = args[2];
    var baseBranch = args[3];
    var normalizedBaseBranch = string.Equals(baseBranch, "-", StringComparison.Ordinal) ? null : baseBranch;
    await runner.ApproveCurrentPhaseAsync(workspaceRoot, usId, normalizedBaseBranch);
    var summary = await applicationService.GetUserStorySummaryAsync(workspaceRoot, usId);
    WriteJson(summary);
}

static void EnsureArgumentCount(IReadOnlyList<string> args, int expectedCount)
{
    if (args.Count != expectedCount)
    {
        throw new InvalidOperationException($"Expected {expectedCount - 1} argument(s) for command '{args[0]}'.");
    }
}

static void WriteJson<T>(T payload)
{
    Console.WriteLine(JsonSerializer.Serialize(payload));
}

static int ExitWithError(string message)
{
    Console.Error.WriteLine(message);
    return 1;
}
