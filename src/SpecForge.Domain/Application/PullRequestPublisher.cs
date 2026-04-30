using System.Diagnostics;
using System.Globalization;
using System.Text.Json;
using SpecForge.Domain.Workflow;

namespace SpecForge.Domain.Application;

internal interface IPullRequestPublisher
{
    Task<PullRequestPublicationResult> PublishAsync(
        string workspaceRoot,
        string usId,
        WorkBranch branch,
        PrPreparationArtifactDocument artifact,
        CancellationToken cancellationToken = default);
}

internal interface IPullRequestInvalidator
{
    Task<PullRequestInvalidationResult> InvalidateAsync(
        string workspaceRoot,
        string usId,
        WorkBranch branch,
        PullRequestRecord pullRequest,
        string reason,
        CancellationToken cancellationToken = default);
}

internal sealed record PullRequestPublicationResult(
    bool CommitCreated,
    string? CommitSha,
    string RemoteBranch,
    bool IsDraft,
    int? Number,
    string? Url);

internal sealed record PullRequestInvalidationResult(
    bool Closed,
    string? Message);

internal sealed class NoOpPullRequestInvalidator : IPullRequestInvalidator
{
    public Task<PullRequestInvalidationResult> InvalidateAsync(
        string workspaceRoot,
        string usId,
        WorkBranch branch,
        PullRequestRecord pullRequest,
        string reason,
        CancellationToken cancellationToken = default) =>
        Task.FromResult(new PullRequestInvalidationResult(false, "Pull request invalidator is not configured."));
}

internal sealed class GitHubPullRequestPublisher : IPullRequestPublisher, IPullRequestInvalidator
{
    public async Task<PullRequestPublicationResult> PublishAsync(
        string workspaceRoot,
        string usId,
        WorkBranch branch,
        PrPreparationArtifactDocument artifact,
        CancellationToken cancellationToken = default)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(workspaceRoot);
        ArgumentNullException.ThrowIfNull(branch);
        ArgumentNullException.ThrowIfNull(artifact);

        await EnsureCliAvailableAsync("git", workspaceRoot, cancellationToken);
        await EnsureCliAvailableAsync("gh", workspaceRoot, cancellationToken);
        await EnsureOnWorkBranchAsync(workspaceRoot, branch.WorkBranchName, cancellationToken);

        var hasChanges = await HasWorkingTreeChangesAsync(workspaceRoot, cancellationToken);
        var commitCreated = false;
        if (hasChanges)
        {
            await RunCliAsync("git", workspaceRoot, ["add", "--all"], cancellationToken);
            var commitMessage = BuildCommitMessage(usId, artifact.PrTitle);
            await RunCliAsync("git", workspaceRoot, ["commit", "-m", commitMessage], cancellationToken);
            commitCreated = true;
        }

        var headCommitSha = await ReadHeadCommitShaAsync(workspaceRoot, cancellationToken);
        await RunCliAsync("git", workspaceRoot, ["push", "--set-upstream", "origin", branch.WorkBranchName], cancellationToken);

        var prBodyPath = Path.Combine(Path.GetTempPath(), $"specforge-pr-body-{Guid.NewGuid():N}.md");
        try
        {
            await File.WriteAllTextAsync(prBodyPath, string.Join(Environment.NewLine, artifact.PrBody) + Environment.NewLine, cancellationToken);
            var existingPr = await TryGetExistingOpenPullRequestAsync(workspaceRoot, branch.WorkBranchName, cancellationToken);
            if (existingPr is not null)
            {
                await RunCliAsync(
                    "gh",
                    workspaceRoot,
                    ["pr", "edit", existingPr.Number.ToString(CultureInfo.InvariantCulture), "--title", artifact.PrTitle, "--body-file", prBodyPath],
                    cancellationToken);

                return new PullRequestPublicationResult(
                    commitCreated,
                    headCommitSha,
                    branch.WorkBranchName,
                    existingPr.IsDraft,
                    existingPr.Number,
                    existingPr.Url);
            }

            var createResult = await RunCliAsync(
                "gh",
                workspaceRoot,
                ["pr", "create", "--draft", "--base", branch.BaseBranch, "--head", branch.WorkBranchName, "--title", artifact.PrTitle, "--body-file", prBodyPath],
                cancellationToken);
            var createdUrl = createResult.StdOut
                .Split(['\r', '\n'], StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
                .LastOrDefault();
            var createdPr = await TryGetExistingOpenPullRequestAsync(workspaceRoot, branch.WorkBranchName, cancellationToken);

            return new PullRequestPublicationResult(
                commitCreated,
                headCommitSha,
                branch.WorkBranchName,
                IsDraft: true,
                createdPr?.Number,
                createdPr?.Url ?? createdUrl);
        }
        finally
        {
            TryDelete(prBodyPath);
        }
    }

    public async Task<PullRequestInvalidationResult> InvalidateAsync(
        string workspaceRoot,
        string usId,
        WorkBranch branch,
        PullRequestRecord pullRequest,
        string reason,
        CancellationToken cancellationToken = default)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(workspaceRoot);
        ArgumentNullException.ThrowIfNull(branch);
        ArgumentNullException.ThrowIfNull(pullRequest);

        if (pullRequest.Number is null or <= 0)
        {
            return new PullRequestInvalidationResult(false, "Pull request number is not available.");
        }

        await EnsureCliAvailableAsync("gh", workspaceRoot, cancellationToken);
        var comment = string.IsNullOrWhiteSpace(reason)
            ? $"Superseded by SpecForge workflow rollback for {usId}."
            : reason.Trim();
        await RunCliAsync(
            "gh",
            workspaceRoot,
            ["pr", "close", pullRequest.Number.Value.ToString(CultureInfo.InvariantCulture), "--comment", comment],
            cancellationToken);
        return new PullRequestInvalidationResult(true, $"Closed pull request #{pullRequest.Number.Value}.");
    }

    private static async Task EnsureCliAvailableAsync(
        string command,
        string workspaceRoot,
        CancellationToken cancellationToken)
    {
        try
        {
            await RunCliAsync(command, workspaceRoot, ["--version"], cancellationToken);
        }
        catch (WorkflowDomainException exception)
        {
            throw new WorkflowDomainException($"Required CLI '{command}' is not available. {exception.Message}");
        }
    }

    private static async Task EnsureOnWorkBranchAsync(
        string workspaceRoot,
        string workBranchName,
        CancellationToken cancellationToken)
    {
        var currentBranch = (await RunCliAsync("git", workspaceRoot, ["branch", "--show-current"], cancellationToken)).StdOut.Trim();
        if (!string.Equals(currentBranch, workBranchName, StringComparison.Ordinal))
        {
            await RunCliAsync("git", workspaceRoot, ["switch", workBranchName], cancellationToken);
        }
    }

    private static async Task<bool> HasWorkingTreeChangesAsync(
        string workspaceRoot,
        CancellationToken cancellationToken)
    {
        var status = await RunCliAsync("git", workspaceRoot, ["status", "--short"], cancellationToken);
        return !string.IsNullOrWhiteSpace(status.StdOut);
    }

    private static async Task<string?> ReadHeadCommitShaAsync(
        string workspaceRoot,
        CancellationToken cancellationToken)
    {
        var result = await RunCliAsync("git", workspaceRoot, ["rev-parse", "HEAD"], cancellationToken);
        var trimmed = result.StdOut.Trim();
        return string.IsNullOrWhiteSpace(trimmed) ? null : trimmed;
    }

    private static async Task<ExistingPullRequest?> TryGetExistingOpenPullRequestAsync(
        string workspaceRoot,
        string workBranchName,
        CancellationToken cancellationToken)
    {
        var result = await RunCliAsync(
            "gh",
            workspaceRoot,
            ["pr", "list", "--head", workBranchName, "--state", "open", "--json", "number,url,isDraft"],
            cancellationToken);
        if (string.IsNullOrWhiteSpace(result.StdOut))
        {
            return null;
        }

        using var document = JsonDocument.Parse(result.StdOut);
        var first = document.RootElement.EnumerateArray().FirstOrDefault();
        if (first.ValueKind == JsonValueKind.Undefined)
        {
            return null;
        }

        return new ExistingPullRequest(
            first.GetProperty("number").GetInt32(),
            first.GetProperty("url").GetString(),
            first.TryGetProperty("isDraft", out var isDraft) && isDraft.GetBoolean());
    }

    private static string BuildCommitMessage(string usId, string prTitle)
    {
        var trimmedTitle = prTitle.Trim();
        return string.IsNullOrWhiteSpace(trimmedTitle)
            ? $"done({usId.ToLowerInvariant()}): prepare pull request"
            : $"done({usId.ToLowerInvariant()}): {trimmedTitle}";
    }

    private static async Task<CliCommandResult> RunCliAsync(
        string fileName,
        string workspaceRoot,
        IReadOnlyList<string> arguments,
        CancellationToken cancellationToken)
    {
        var startInfo = new ProcessStartInfo
        {
            FileName = fileName,
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

        if (process.ExitCode != 0)
        {
            throw new WorkflowDomainException(
                $"Command failed: {fileName} {string.Join(' ', arguments)}. stderr: {stderr.Trim()} stdout: {stdout.Trim()}");
        }

        return new CliCommandResult(stdout, stderr);
    }

    private static void TryDelete(string path)
    {
        if (File.Exists(path))
        {
            File.Delete(path);
        }
    }

    private sealed record ExistingPullRequest(int Number, string? Url, bool IsDraft);

    private sealed record CliCommandResult(string StdOut, string StdErr);
}
