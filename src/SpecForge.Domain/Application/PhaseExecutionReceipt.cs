using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using SpecForge.Domain.Workflow;

namespace SpecForge.Domain.Application;

public sealed record PhaseExecutionReceipt(
    string ExecutionId,
    string UsId,
    string PhaseId,
    string StartedAtUtc,
    string CompletedAtUtc,
    PhaseExecutionInputManifest InputManifest,
    PhaseExecutionOutputManifest OutputManifest,
    TokenUsage? Usage,
    PhaseExecutionMetadata? Execution);

public sealed record PhaseExecutionInputManifest(
    string ManifestSha256,
    string WorkspaceRoot,
    string UserStoryPath,
    string? UserStorySha256,
    IReadOnlyCollection<PhaseExecutionArtifactInput> PreviousArtifacts,
    IReadOnlyCollection<PhaseExecutionArtifactInput> ContextFiles,
    PhaseExecutionArtifactInput? CurrentArtifact,
    string? OperationPromptSha256);

public sealed record PhaseExecutionOutputManifest(
    string ResultArtifactPath,
    string? ResultArtifactSha256,
    IReadOnlyCollection<PhaseExecutionArtifactInput> GeneratedFiles);

public sealed record PhaseExecutionArtifactInput(
    string Path,
    string? Sha256,
    string? PhaseId = null);

public static class PhaseExecutionReceiptStore
{
    private static readonly JsonSerializerOptions SerializerOptions = new(JsonSerializerDefaults.Web)
    {
        WriteIndented = true
    };

    public static PhaseExecutionInputManifest BuildInputManifest(
        string workspaceRoot,
        PhaseExecutionContext context)
    {
        var previousArtifacts = context.PreviousArtifactPaths
            .OrderBy(static item => item.Key)
            .Select(static item => new PhaseExecutionArtifactInput(
                NormalizePath(item.Value),
                TryComputeFileSha256(item.Value),
                WorkflowPresentation.ToPhaseSlug(item.Key)))
            .ToArray();
        var contextFiles = context.ContextFilePaths
            .OrderBy(static path => path, StringComparer.Ordinal)
            .Select(static path => new PhaseExecutionArtifactInput(NormalizePath(path), TryComputeFileSha256(path)))
            .ToArray();
        var currentArtifact = string.IsNullOrWhiteSpace(context.CurrentArtifactPath)
            ? null
            : new PhaseExecutionArtifactInput(
                NormalizePath(context.CurrentArtifactPath),
                TryComputeFileSha256(context.CurrentArtifactPath),
                WorkflowPresentation.ToPhaseSlug(context.PhaseId));
        var manifestWithoutHash = new PhaseExecutionInputManifest(
            ManifestSha256: string.Empty,
            WorkspaceRoot: NormalizePath(workspaceRoot),
            UserStoryPath: NormalizePath(context.UserStoryPath),
            UserStorySha256: TryComputeFileSha256(context.UserStoryPath),
            PreviousArtifacts: previousArtifacts,
            ContextFiles: contextFiles,
            CurrentArtifact: currentArtifact,
            OperationPromptSha256: ComputeSha256(context.OperationPrompt));

        return manifestWithoutHash with
        {
            ManifestSha256 = ComputeSha256(JsonSerializer.Serialize(manifestWithoutHash, SerializerOptions)) ?? string.Empty
        };
    }

    public static async Task<string> PersistAsync(
        string receiptsDirectoryPath,
        PhaseExecutionReceipt receipt,
        CancellationToken cancellationToken)
    {
        Directory.CreateDirectory(receiptsDirectoryPath);
        var receiptPath = Path.Combine(receiptsDirectoryPath, $"{receipt.ExecutionId}.json");
        await File.WriteAllTextAsync(receiptPath, JsonSerializer.Serialize(receipt, SerializerOptions), cancellationToken);
        return receiptPath;
    }

    public static string? ComputeSha256(string? content)
    {
        if (string.IsNullOrWhiteSpace(content))
        {
            return null;
        }

        return Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(content))).ToLowerInvariant();
    }

    public static string? TryComputeFileSha256(string? path)
    {
        if (string.IsNullOrWhiteSpace(path) || !File.Exists(path))
        {
            return null;
        }

        using var stream = File.OpenRead(path);
        return Convert.ToHexString(SHA256.HashData(stream)).ToLowerInvariant();
    }

    public static string NormalizePath(string path) => path.Replace('\\', '/');
}
