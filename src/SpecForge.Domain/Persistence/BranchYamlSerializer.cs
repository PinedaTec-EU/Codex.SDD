using System.Globalization;
using SpecForge.Domain.Workflow;

namespace SpecForge.Domain.Persistence;

internal static class BranchYamlSerializer
{
    public static string Serialize(string usId, WorkBranch branch)
    {
        return string.Join(
                   Environment.NewLine,
                   new[]
                   {
                       $"usId: {usId}",
                       $"kind: {branch.Kind}",
                       $"category: {branch.Category}",
                       $"baseBranch: {branch.BaseBranch}",
                       $"workBranch: {branch.WorkBranchName}",
                       $"status: {branch.Status}",
                       $"createdAt: {branch.CreatedAtUtc:O}",
                       "createdFromPhase: refinement",
                       $"strategy: {branch.Strategy}",
                       $"titleSnapshot: {branch.TitleSnapshot ?? string.Empty}",
                       $"sourceUsPath: {branch.SourceUsPath ?? string.Empty}"
                   }) +
               Environment.NewLine;
    }

    public static WorkBranch Deserialize(string yaml)
    {
        var values = yaml
            .Replace("\r\n", "\n", StringComparison.Ordinal)
            .Split('\n', StringSplitOptions.RemoveEmptyEntries)
            .Select(static line => line.Split(':', 2, StringSplitOptions.TrimEntries))
            .Where(static parts => parts.Length == 2)
            .ToDictionary(static parts => parts[0], static parts => parts[1], StringComparer.Ordinal);

        var branch = new WorkBranch(
            GetRequired(values, "baseBranch"),
            GetRequired(values, "workBranch"),
            GetOptional(values, "kind") ?? InferKindFromWorkBranch(GetRequired(values, "workBranch")),
            GetOptional(values, "category") ?? "uncategorized",
            GetOptional(values, "titleSnapshot"),
            GetOptional(values, "sourceUsPath"),
            DateTimeOffset.Parse(GetRequired(values, "createdAt"), CultureInfo.InvariantCulture),
            GetOptional(values, "strategy") ?? WorkBranch.SingleBranchPerUserStoryStrategy);

        var status = GetRequired(values, "status");
        if (status == "superseded")
        {
            branch.MarkSuperseded();
        }

        return branch;
    }

    private static string? GetOptional(IReadOnlyDictionary<string, string> values, string key)
    {
        if (!values.TryGetValue(key, out var value) || string.IsNullOrWhiteSpace(value))
        {
            return null;
        }

        return value;
    }

    private static string InferKindFromWorkBranch(string workBranch)
    {
        var separatorIndex = workBranch.IndexOf('/');
        if (separatorIndex <= 0)
        {
            return "feature";
        }

        return workBranch[..separatorIndex];
    }

    private static string GetRequired(IReadOnlyDictionary<string, string> values, string key)
    {
        if (!values.TryGetValue(key, out var value) || string.IsNullOrWhiteSpace(value))
        {
            throw new InvalidDataException($"Required YAML key '{key}' was not found.");
        }

        return value;
    }
}
