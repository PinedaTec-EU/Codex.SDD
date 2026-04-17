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
                       $"baseBranch: {branch.BaseBranch}",
                       $"workBranch: {branch.WorkBranchName}",
                       $"status: {branch.Status}",
                       $"createdAt: {branch.CreatedAtUtc:O}"
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
            DateTimeOffset.Parse(GetRequired(values, "createdAt")));

        var status = GetRequired(values, "status");
        if (status == "superseded")
        {
            branch.MarkSuperseded();
        }

        return branch;
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
