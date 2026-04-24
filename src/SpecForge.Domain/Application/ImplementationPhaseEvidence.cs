using System.Diagnostics;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using SpecForge.Domain.Persistence;
using SpecForge.Domain.Workflow;

namespace SpecForge.Domain.Application;

internal static class ImplementationPhaseEvidence
{
    private static readonly JsonSerializerOptions JsonSerializerOptions = new()
    {
        WriteIndented = true
    };

    public static void EnsureReviewCanConsume(string workspaceRoot, UserStoryFilePaths paths)
    {
        var gitDirectory = Path.Combine(workspaceRoot, ".git");
        if (!Directory.Exists(gitDirectory) && !File.Exists(gitDirectory))
        {
            return;
        }

        var evidencePath = paths.GetLatestExistingPhaseEvidenceJsonPath(PhaseId.Implementation);
        if (string.IsNullOrWhiteSpace(evidencePath) || !File.Exists(evidencePath))
        {
            throw new WorkflowDomainException(
                "Review requires implementation evidence, but no implementation evidence artifact was found for this user story.");
        }

        var payload = File.ReadAllText(evidencePath);
        var evidence = JsonSerializer.Deserialize<ImplementationPhaseEvidenceDocument>(payload, JsonSerializerOptions)
            ?? throw new WorkflowDomainException("Implementation evidence could not be deserialized for review.");

        if (evidence.TouchedFiles.Count == 0)
        {
            throw new WorkflowDomainException(
                "Review requires implementation evidence with at least one touched repository file. The previous implementation phase did not record a repository delta for this user story.");
        }
    }

    public static async Task<ImplementationPhaseEvidenceDocument> CaptureAsync(
        string workspaceRoot,
        UserStoryFilePaths paths,
        IReadOnlyCollection<WorkspaceSnapshotEntry>? baselineSnapshot,
        CancellationToken cancellationToken)
    {
        var currentSnapshot = await CaptureWorkspaceSnapshotAsync(workspaceRoot, paths.RootDirectory, cancellationToken);
        if (baselineSnapshot is null || currentSnapshot is null)
        {
            return new ImplementationPhaseEvidenceDocument(
                DateTimeOffset.UtcNow.ToString("O"),
                [
                    "Phase-scoped repository evidence could not be captured because the workspace is not an accessible git repository.",
                    "Review must treat missing repository evidence as a blocking condition."
                ],
                []);
        }

        var baselineByPath = FlattenSnapshotByPath(baselineSnapshot);
        var baselineFingerprints = baselineSnapshot
            .Select(static entry => $"{entry.StatusCode}|{entry.Fingerprint}")
            .ToHashSet(StringComparer.Ordinal);
        var touchedFiles = currentSnapshot
            .Where(entry => !baselineFingerprints.Contains($"{entry.StatusCode}|{entry.Fingerprint}"))
            .SelectMany(entry => entry.CandidatePaths.Select(path => BuildTouchedFileEvidence(path, entry, baselineByPath)))
            .GroupBy(static item => item.Path, StringComparer.Ordinal)
            .Select(static group => group.Last())
            .OrderBy(static item => item.Path, StringComparer.Ordinal)
            .ToArray();

        var summary = new List<string>
        {
            "Phase-scoped repository evidence was computed from git workspace snapshots captured immediately before and after implementation execution.",
            $"Meaningful touched repository files detected: `{touchedFiles.Length}`.",
            $"Workflow metadata under `{paths.RootDirectory.Replace('\\', '/')}` was excluded from the evidence set."
        };

        if (touchedFiles.Length == 0)
        {
            summary.Add("No repository files were touched by the implementation execution delta that could be attributed to this phase.");
        }

        return new ImplementationPhaseEvidenceDocument(
            DateTimeOffset.UtcNow.ToString("O"),
            summary,
            touchedFiles);
    }

    public static async Task PersistAsync(
        UserStoryFilePaths paths,
        ImplementationPhaseEvidenceDocument evidence,
        CancellationToken cancellationToken)
    {
        var jsonPath = paths.GetPhaseEvidenceJsonPath(PhaseId.Implementation);
        var markdownPath = paths.GetPhaseEvidenceMarkdownPath(PhaseId.Implementation);
        var payload = JsonSerializer.Serialize(evidence, JsonSerializerOptions);
        await File.WriteAllTextAsync(jsonPath, payload, cancellationToken);
        await File.WriteAllTextAsync(markdownPath, RenderMarkdown(evidence), cancellationToken);
    }

    public static string AppendSection(
        string implementationArtifact,
        string evidenceMarkdownPath,
        string evidenceJsonPath,
        ImplementationPhaseEvidenceDocument evidence)
    {
        var builder = new StringBuilder()
            .AppendLine(implementationArtifact.TrimEnd())
            .AppendLine()
            .AppendLine("## Captured Phase Evidence")
            .AppendLine($"- Evidence markdown: `{evidenceMarkdownPath.Replace('\\', '/')}`")
            .AppendLine($"- Evidence json: `{evidenceJsonPath.Replace('\\', '/')}`");

        foreach (var summaryLine in evidence.Summary)
        {
            builder.AppendLine(summaryLine.StartsWith("-", StringComparison.Ordinal)
                ? summaryLine
                : $"- {summaryLine}");
        }

        builder
            .AppendLine()
            .AppendLine("## Captured Touched Files");

        if (evidence.TouchedFiles.Count == 0)
        {
            builder.AppendLine("- No repository files were captured for this implementation delta.");
        }
        else
        {
            foreach (var touchedFile in evidence.TouchedFiles)
            {
                builder.AppendLine(
                    $"- `{touchedFile.Path}` | kind=`{touchedFile.ChangeKind}` | baseline=`{touchedFile.BaselineStatusCode ?? "none"}` | current=`{touchedFile.CurrentStatusCode}`");
            }
        }

        return builder.AppendLine().ToString();
    }

    public static async Task<IReadOnlyCollection<WorkspaceSnapshotEntry>?> CaptureWorkspaceSnapshotAsync(
        string workspaceRoot,
        string userStoryRoot,
        CancellationToken cancellationToken)
    {
        var gitDirectory = Path.Combine(workspaceRoot, ".git");
        if (!Directory.Exists(gitDirectory) && !File.Exists(gitDirectory))
        {
            return null;
        }

        var startInfo = new ProcessStartInfo
        {
            FileName = "git",
            WorkingDirectory = workspaceRoot,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false
        };
        startInfo.ArgumentList.Add("status");
        startInfo.ArgumentList.Add("--short");
        startInfo.ArgumentList.Add("--untracked-files=all");

        using var process = new Process { StartInfo = startInfo };
        process.Start();
        var stdoutTask = process.StandardOutput.ReadToEndAsync(cancellationToken);
        var stderrTask = process.StandardError.ReadToEndAsync(cancellationToken);
        await process.WaitForExitAsync(cancellationToken);
        var stdout = await stdoutTask;
        var stderr = await stderrTask;
        if (process.ExitCode != 0)
        {
            throw new InvalidOperationException(
                $"Unable to capture git status for implementation evidence. stderr: {stderr.Trim()} stdout: {stdout.Trim()}");
        }

        var relativeUserStoryRoot = Path.GetRelativePath(workspaceRoot, userStoryRoot)
            .Replace('\\', '/')
            .TrimEnd('/');

        return stdout
            .Split(['\r', '\n'], StringSplitOptions.RemoveEmptyEntries)
            .Select(statusLine => BuildWorkspaceSnapshotEntry(workspaceRoot, statusLine))
            .Where(entry => !IsIgnoredWorkflowChange(entry.PathDisplay, relativeUserStoryRoot))
            .ToArray();
    }

    private static string RenderMarkdown(ImplementationPhaseEvidenceDocument evidence)
    {
        var lines = new List<string>
        {
            "# Implementation Evidence",
            string.Empty,
            "## Summary"
        };
        lines.AddRange(evidence.Summary.Select(static line => line.StartsWith("-", StringComparison.Ordinal) ? line : $"- {line}"));
        lines.Add(string.Empty);
        lines.Add("## Touched Files");
        if (evidence.TouchedFiles.Count == 0)
        {
            lines.Add("- No repository files were captured for this implementation delta.");
        }
        else
        {
            lines.AddRange(evidence.TouchedFiles.Select(static item =>
                $"- `{item.Path}` | kind=`{item.ChangeKind}` | baseline=`{item.BaselineStatusCode ?? "none"}` | current=`{item.CurrentStatusCode}`"));
        }

        return string.Join(Environment.NewLine, lines) + Environment.NewLine;
    }

    private static IReadOnlyDictionary<string, WorkspaceSnapshotEntry> FlattenSnapshotByPath(
        IReadOnlyCollection<WorkspaceSnapshotEntry> snapshot) =>
        snapshot
            .SelectMany(entry => entry.CandidatePaths.Select(path => new KeyValuePair<string, WorkspaceSnapshotEntry>(path, entry)))
            .GroupBy(static item => item.Key, StringComparer.Ordinal)
            .ToDictionary(static group => group.Key, static group => group.Last().Value, StringComparer.Ordinal);

    private static ImplementationPhaseTouchedFile BuildTouchedFileEvidence(
        string path,
        WorkspaceSnapshotEntry currentEntry,
        IReadOnlyDictionary<string, WorkspaceSnapshotEntry> baselineByPath)
    {
        baselineByPath.TryGetValue(path, out var baselineEntry);
        var changeKind = baselineEntry is null
            ? "newly_touched"
            : string.Equals(baselineEntry.Fingerprint, currentEntry.Fingerprint, StringComparison.Ordinal)
                ? "status_changed"
                : "content_changed";

        return new ImplementationPhaseTouchedFile(
            path,
            changeKind,
            baselineEntry?.StatusCode,
            currentEntry.StatusCode,
            baselineEntry?.Fingerprint,
            currentEntry.Fingerprint);
    }

    private static WorkspaceSnapshotEntry BuildWorkspaceSnapshotEntry(string workspaceRoot, string statusLine)
    {
        var statusCode = statusLine.Length >= 2 ? statusLine[..2] : statusLine.Trim();
        var pathDisplay = statusLine.Length > 3 ? statusLine[3..].Trim() : string.Empty;
        var candidatePaths = ParseGitStatusCandidatePaths(statusLine).ToArray();
        var fingerprint = candidatePaths.Length == 0
            ? pathDisplay
            : string.Join("|", candidatePaths.Select(path => BuildPathFingerprint(workspaceRoot, path)));

        return new WorkspaceSnapshotEntry(statusCode, pathDisplay, candidatePaths, fingerprint);
    }

    private static IEnumerable<string> ParseGitStatusCandidatePaths(string gitStatusLine)
    {
        if (string.IsNullOrWhiteSpace(gitStatusLine) || gitStatusLine.Length <= 3)
        {
            return [];
        }

        return gitStatusLine[3..]
            .Trim()
            .Split(" -> ", StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries)
            .Select(static path => path.Replace('\\', '/'));
    }

    private static string BuildPathFingerprint(string workspaceRoot, string relativePath)
    {
        var absolutePath = Path.Combine(
            workspaceRoot,
            relativePath.Replace('/', Path.DirectorySeparatorChar));

        if (Directory.Exists(absolutePath))
        {
            return $"{relativePath}:dir";
        }

        if (!File.Exists(absolutePath))
        {
            return $"{relativePath}:missing";
        }

        using var stream = File.OpenRead(absolutePath);
        var hash = Convert.ToHexString(SHA256.HashData(stream));
        return $"{relativePath}:{hash}";
    }

    private static bool IsIgnoredWorkflowChange(string pathDisplay, string relativeUserStoryRoot)
    {
        if (string.IsNullOrWhiteSpace(pathDisplay))
        {
            return true;
        }

        var candidatePaths = pathDisplay
            .Split(" -> ", StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries)
            .Select(static path => path.Replace('\\', '/'));

        foreach (var candidatePath in candidatePaths)
        {
            if (!candidatePath.StartsWith(relativeUserStoryRoot, StringComparison.Ordinal))
            {
                return false;
            }
        }

        return true;
    }
}

internal sealed record WorkspaceSnapshotEntry(
    string StatusCode,
    string PathDisplay,
    IReadOnlyCollection<string> CandidatePaths,
    string Fingerprint);

internal sealed record ImplementationPhaseEvidenceDocument(
    string GeneratedAtUtc,
    IReadOnlyCollection<string> Summary,
    IReadOnlyCollection<ImplementationPhaseTouchedFile> TouchedFiles);

internal sealed record ImplementationPhaseTouchedFile(
    string Path,
    string ChangeKind,
    string? BaselineStatusCode,
    string CurrentStatusCode,
    string? BaselineFingerprint,
    string CurrentFingerprint);
