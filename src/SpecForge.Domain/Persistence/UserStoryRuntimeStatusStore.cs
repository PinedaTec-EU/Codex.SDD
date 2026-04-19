using System.Text;

namespace SpecForge.Domain.Persistence;

public sealed class UserStoryRuntimeStatusStore
{
    private static readonly TimeSpan StaleThreshold = TimeSpan.FromMinutes(5);
    private static readonly TimeSpan HeartbeatInterval = TimeSpan.FromSeconds(2);

    public async Task<UserStoryRuntimeStatusSnapshot> GetAsync(
        string rootDirectory,
        string usId,
        string currentPhase,
        CancellationToken cancellationToken = default)
    {
        var paths = new UserStoryFilePaths(rootDirectory);
        if (!File.Exists(paths.RuntimeFilePath))
        {
            return CreateIdle(usId, currentPhase, message: null);
        }

        var content = await File.ReadAllTextAsync(paths.RuntimeFilePath, cancellationToken);
        var document = RuntimeYamlSerializer.Deserialize(content);
        return ToSnapshot(document, currentPhase);
    }

    public async Task<RuntimeOperationHandle> StartOperationAsync(
        string rootDirectory,
        string usId,
        string currentPhase,
        string operation,
        CancellationToken cancellationToken = default)
    {
        var existing = await GetAsync(rootDirectory, usId, currentPhase, cancellationToken);
        if (existing.Status == RuntimeStatus.Running && !existing.IsStale)
        {
            throw new InvalidOperationException(
                $"User story '{usId}' is already running '{existing.ActiveOperation}' since {(existing.StartedAtUtc?.UtcDateTime.ToString("O") ?? "unknown time")}.");
        }

        var now = DateTimeOffset.UtcNow;
        var running = new RuntimeStatusDocument(
            usId,
            "running",
            currentPhase,
            "running",
            operation,
            now,
            now,
            existing.LastCompletedAtUtc,
            $"Running '{operation}'.");

        await WriteAsync(new UserStoryFilePaths(rootDirectory).RuntimeFilePath, running, cancellationToken);
        return new RuntimeOperationHandle(this, rootDirectory, usId, currentPhase, operation, now);
    }

    internal async Task TouchAsync(
        string rootDirectory,
        string usId,
        string currentPhase,
        string operation,
        DateTimeOffset startedAtUtc,
        CancellationToken cancellationToken)
    {
        var document = new RuntimeStatusDocument(
            usId,
            "running",
            currentPhase,
            "running",
            operation,
            startedAtUtc,
            DateTimeOffset.UtcNow,
            null,
            $"Running '{operation}'.");

        await WriteAsync(new UserStoryFilePaths(rootDirectory).RuntimeFilePath, document, cancellationToken);
    }

    internal Task CompleteAsync(
        string rootDirectory,
        string usId,
        string currentPhase,
        string operation,
        CancellationToken cancellationToken) =>
        WriteAsync(
            new UserStoryFilePaths(rootDirectory).RuntimeFilePath,
            new RuntimeStatusDocument(
                usId,
                "idle",
                currentPhase,
                "succeeded",
                null,
                null,
                DateTimeOffset.UtcNow,
                DateTimeOffset.UtcNow,
                $"Completed '{operation}'."),
            cancellationToken);

    internal Task FailAsync(
        string rootDirectory,
        string usId,
        string currentPhase,
        string operation,
        string message,
        CancellationToken cancellationToken) =>
        WriteAsync(
            new UserStoryFilePaths(rootDirectory).RuntimeFilePath,
            new RuntimeStatusDocument(
                usId,
                "failed",
                currentPhase,
                "failed",
                null,
                null,
                DateTimeOffset.UtcNow,
                DateTimeOffset.UtcNow,
                string.IsNullOrWhiteSpace(message) ? $"Failed '{operation}'." : message.Trim()),
            cancellationToken);

    private static async Task WriteAsync(string runtimeFilePath, RuntimeStatusDocument document, CancellationToken cancellationToken)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(runtimeFilePath)!);
        await File.WriteAllTextAsync(runtimeFilePath, RuntimeYamlSerializer.Serialize(document), Encoding.UTF8, cancellationToken);
    }

    private static UserStoryRuntimeStatusSnapshot ToSnapshot(RuntimeStatusDocument document, string fallbackPhase)
    {
        var currentPhase = string.IsNullOrWhiteSpace(document.CurrentPhase) ? fallbackPhase : document.CurrentPhase;
        var lastHeartbeatUtc = document.LastHeartbeatUtc;
        var isStale = document.Status == "running"
            && lastHeartbeatUtc is not null
            && DateTimeOffset.UtcNow - lastHeartbeatUtc.Value > StaleThreshold;

        return new UserStoryRuntimeStatusSnapshot(
            document.UsId,
            ParseStatus(document.Status),
            document.ActiveOperation,
            currentPhase,
            document.StartedAtUtc,
            lastHeartbeatUtc,
            document.LastOutcome,
            document.LastCompletedAtUtc,
            document.Message,
            isStale);
    }

    private static UserStoryRuntimeStatusSnapshot CreateIdle(string usId, string currentPhase, string? message) =>
        new(usId, RuntimeStatus.Idle, null, currentPhase, null, null, null, null, message, false);

    private static RuntimeStatus ParseStatus(string value) => value switch
    {
        "running" => RuntimeStatus.Running,
        "failed" => RuntimeStatus.Failed,
        _ => RuntimeStatus.Idle
    };

    public sealed class RuntimeOperationHandle : IAsyncDisposable
    {
        private readonly CancellationTokenSource heartbeatCancellation = new();
        private readonly Task heartbeatTask;
        private bool completed;

        internal RuntimeOperationHandle(
            UserStoryRuntimeStatusStore store,
            string rootDirectory,
            string usId,
            string currentPhase,
            string operation,
            DateTimeOffset startedAtUtc)
        {
            Store = store;
            RootDirectory = rootDirectory;
            UsId = usId;
            CurrentPhase = currentPhase;
            Operation = operation;
            StartedAtUtc = startedAtUtc;
            heartbeatTask = RunHeartbeatAsync(heartbeatCancellation.Token);
        }

        private UserStoryRuntimeStatusStore Store { get; }
        private string RootDirectory { get; }
        private string UsId { get; }
        private string CurrentPhase { get; set; }
        private string Operation { get; }
        private DateTimeOffset StartedAtUtc { get; }

        public void UpdatePhase(string currentPhase)
        {
            CurrentPhase = currentPhase;
        }

        public async Task CompleteAsync(string currentPhase, CancellationToken cancellationToken = default)
        {
            if (completed)
            {
                return;
            }

            completed = true;
            heartbeatCancellation.Cancel();
            await SuppressHeartbeatAsync();
            await Store.CompleteAsync(RootDirectory, UsId, currentPhase, Operation, cancellationToken);
        }

        public async Task FailAsync(string currentPhase, string message, CancellationToken cancellationToken = default)
        {
            if (completed)
            {
                return;
            }

            completed = true;
            heartbeatCancellation.Cancel();
            await SuppressHeartbeatAsync();
            await Store.FailAsync(RootDirectory, UsId, currentPhase, Operation, message, cancellationToken);
        }

        public async ValueTask DisposeAsync()
        {
            if (!completed)
            {
                heartbeatCancellation.Cancel();
                await SuppressHeartbeatAsync();
            }

            heartbeatCancellation.Dispose();
        }

        private async Task RunHeartbeatAsync(CancellationToken cancellationToken)
        {
            using var timer = new PeriodicTimer(HeartbeatInterval);
            try
            {
                while (await timer.WaitForNextTickAsync(cancellationToken))
                {
                    await Store.TouchAsync(RootDirectory, UsId, CurrentPhase, Operation, StartedAtUtc, cancellationToken);
                }
            }
            catch (OperationCanceledException)
            {
            }
        }

        private async Task SuppressHeartbeatAsync()
        {
            try
            {
                await heartbeatTask;
            }
            catch (OperationCanceledException)
            {
            }
        }
    }
}

public enum RuntimeStatus
{
    Idle,
    Running,
    Failed
}

public sealed record UserStoryRuntimeStatusSnapshot(
    string UsId,
    RuntimeStatus Status,
    string? ActiveOperation,
    string CurrentPhase,
    DateTimeOffset? StartedAtUtc,
    DateTimeOffset? LastHeartbeatUtc,
    string? LastOutcome,
    DateTimeOffset? LastCompletedAtUtc,
    string? Message,
    bool IsStale);
