using System.Diagnostics;

namespace SpecForge.Domain.Application;

public static class SpecForgeDiagnostics
{
    public static void Log(string message)
    {
        Console.Error.WriteLine($"[{DateTimeOffset.UtcNow:O}] {message}");
    }

    public static ProgressScope StartProgressScope(
        string operation,
        TimeSpan? interval = null)
    {
        return new ProgressScope(operation, interval ?? TimeSpan.FromSeconds(30));
    }

    public sealed class ProgressScope : IAsyncDisposable
    {
        private readonly string operation;
        private readonly TimeSpan interval;
        private readonly CancellationTokenSource cancellation = new();
        private readonly Stopwatch stopwatch = Stopwatch.StartNew();
        private readonly Task reporterTask;
        private bool completed;

        internal ProgressScope(string operation, TimeSpan interval)
        {
            this.operation = operation;
            this.interval = interval;
            Log($"{operation} started.");
            reporterTask = RunReporterAsync(cancellation.Token);
        }

        public void MarkCompleted(string? detail = null)
        {
            if (completed)
            {
                return;
            }

            completed = true;
            stopwatch.Stop();
            cancellation.Cancel();
            Log($"{operation} completed in {stopwatch.ElapsedMilliseconds} ms.{FormatDetail(detail)}");
        }

        public void MarkFailed(Exception exception)
        {
            if (completed)
            {
                return;
            }

            completed = true;
            stopwatch.Stop();
            cancellation.Cancel();
            Log($"{operation} failed after {stopwatch.ElapsedMilliseconds} ms. {exception.Message}");
        }

        public async ValueTask DisposeAsync()
        {
            cancellation.Cancel();

            try
            {
                await reporterTask;
            }
            catch (OperationCanceledException)
            {
            }
            finally
            {
                cancellation.Dispose();
            }
        }

        private async Task RunReporterAsync(CancellationToken cancellationToken)
        {
            using var timer = new PeriodicTimer(interval);
            while (await timer.WaitForNextTickAsync(cancellationToken))
            {
                Log($"{operation} still running after {stopwatch.ElapsedMilliseconds} ms.");
            }
        }

        private static string FormatDetail(string? detail) =>
            string.IsNullOrWhiteSpace(detail) ? string.Empty : $" {detail.Trim()}";
    }
}
