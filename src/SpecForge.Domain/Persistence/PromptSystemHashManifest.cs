using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace SpecForge.Domain.Persistence;

public static class PromptSystemHashManifest
{
    public static IReadOnlyCollection<string> EnumerateTrackedPromptPaths(PromptFilePaths paths) =>
    [
        paths.SharedSystemPromptPath,
        paths.RefinementExecuteSystemPromptPath,
        paths.SpecExecuteSystemPromptPath,
        paths.SpecApproveSystemPromptPath,
        paths.TechnicalDesignExecuteSystemPromptPath,
        paths.ImplementationExecuteSystemPromptPath,
        paths.ReviewExecuteSystemPromptPath,
        paths.ReleaseApprovalApproveSystemPromptPath,
        paths.AutoRefinementAnswersSystemPromptPath
    ];

    public static async Task WriteAsync(PromptFilePaths paths, CancellationToken cancellationToken)
    {
        var hashes = new Dictionary<string, string>(StringComparer.Ordinal);

        foreach (var promptPath in EnumerateTrackedPromptPaths(paths))
        {
            var promptContent = await File.ReadAllTextAsync(promptPath, cancellationToken);
            hashes[ToRelativePromptPath(paths.WorkspaceRoot, promptPath)] = ComputeSha256(promptContent);
        }

        var payload = JsonSerializer.Serialize(
            new PromptSystemHashManifestDocument(Version: 1, Hashes: hashes),
            new JsonSerializerOptions
            {
                WriteIndented = true
            });
        await File.WriteAllTextAsync(paths.PromptSystemHashesPath, payload, cancellationToken);
    }

    public static async Task<IReadOnlyDictionary<string, string>> ReadAsync(PromptFilePaths paths, CancellationToken cancellationToken)
    {
        var payload = await File.ReadAllTextAsync(paths.PromptSystemHashesPath, cancellationToken);
        var document = JsonSerializer.Deserialize<PromptSystemHashManifestDocument>(payload);
        return document?.Hashes ?? new Dictionary<string, string>(StringComparer.Ordinal);
    }

    public static string ToRelativePromptPath(string workspaceRoot, string promptPath) =>
        Path.GetRelativePath(workspaceRoot, promptPath).Replace('\\', '/');

    public static string ComputeSha256(string content)
    {
        var bytes = Encoding.UTF8.GetBytes(content);
        var hashBytes = SHA256.HashData(bytes);
        return Convert.ToHexString(hashBytes).ToLowerInvariant();
    }

    private sealed record PromptSystemHashManifestDocument(
        int Version,
        Dictionary<string, string> Hashes);
}
