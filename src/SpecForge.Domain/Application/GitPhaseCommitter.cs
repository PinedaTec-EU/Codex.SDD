using System.Diagnostics;
using SpecForge.Domain.Workflow;

namespace SpecForge.Domain.Application;

internal static class GitPhaseCommitter
{
    public static async Task<PhaseCommitResult> CommitAsync(
        string workspaceRoot,
        string usId,
        string phaseSlug,
        string outcome,
        IReadOnlyCollection<string> candidatePaths,
        CancellationToken cancellationToken)
    {
        if (!await IsGitWorkspaceAsync(workspaceRoot, cancellationToken))
        {
            return new PhaseCommitResult(false, false, null, null, []);
        }

        var normalizedPaths = candidatePaths
            .Where(static path => !string.IsNullOrWhiteSpace(path))
            .Select(path => Path.GetFullPath(path))
            .Where(File.Exists)
            .Where(path => IsUnderDirectory(workspaceRoot, path))
            .Select(path => Path.GetRelativePath(workspaceRoot, path).Replace('\\', '/'))
            .Distinct(StringComparer.Ordinal)
            .OrderBy(static path => path, StringComparer.Ordinal)
            .ToArray();

        if (normalizedPaths.Length == 0)
        {
            return new PhaseCommitResult(true, false, null, null, []);
        }

        await RunGitAsync(workspaceRoot, ["add", "--", .. normalizedPaths], cancellationToken);
        if (!await HasStagedChangesAsync(workspaceRoot, cancellationToken))
        {
            return new PhaseCommitResult(true, false, null, null, normalizedPaths);
        }

        var message = $"{usId} {phaseSlug}: done {outcome}";
        await RunGitAsync(workspaceRoot, ["commit", "-m", message], cancellationToken);
        var sha = (await RunGitAsync(workspaceRoot, ["rev-parse", "HEAD"], cancellationToken)).StdOut.Trim();
        return new PhaseCommitResult(true, true, sha, message, normalizedPaths);
    }

    private static async Task<bool> IsGitWorkspaceAsync(string workspaceRoot, CancellationToken cancellationToken)
    {
        try
        {
            await RunGitAsync(workspaceRoot, ["rev-parse", "--show-toplevel"], cancellationToken);
            return true;
        }
        catch
        {
            return false;
        }
    }

    private static async Task<bool> HasStagedChangesAsync(string workspaceRoot, CancellationToken cancellationToken)
    {
        var result = await RunGitAsync(workspaceRoot, ["diff", "--cached", "--quiet"], cancellationToken, allowExitCodes: [0, 1]);
        return result.ExitCode == 1;
    }

    private static bool IsUnderDirectory(string rootDirectory, string path)
    {
        var normalizedRoot = Path.GetFullPath(rootDirectory).TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar) + Path.DirectorySeparatorChar;
        var normalizedPath = Path.GetFullPath(path);
        return normalizedPath.StartsWith(normalizedRoot, StringComparison.Ordinal);
    }

    private static async Task<GitCommandResult> RunGitAsync(
        string workspaceRoot,
        IReadOnlyCollection<string> arguments,
        CancellationToken cancellationToken,
        IReadOnlyCollection<int>? allowExitCodes = null)
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
        var stdoutTask = process.StandardOutput.ReadToEndAsync(cancellationToken);
        var stderrTask = process.StandardError.ReadToEndAsync(cancellationToken);
        await process.WaitForExitAsync(cancellationToken);
        var stdout = await stdoutTask;
        var stderr = await stderrTask;
        if (process.ExitCode != 0 && allowExitCodes?.Contains(process.ExitCode) != true)
        {
            throw new WorkflowDomainException(
                $"Unable to create phase commit. git {string.Join(' ', arguments)} failed with exit code {process.ExitCode}. stderr: {stderr.Trim()} stdout: {stdout.Trim()}");
        }

        return new GitCommandResult(process.ExitCode, stdout, stderr);
    }

    private sealed record GitCommandResult(int ExitCode, string StdOut, string StdErr);
}
