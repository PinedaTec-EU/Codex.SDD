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
        var values = YamlMapParser.ParseTopLevelMappings(yaml);

        var branch = new WorkBranch(
            YamlMapParser.GetRequired(values, "baseBranch"),
            YamlMapParser.GetRequired(values, "workBranch"),
            YamlMapParser.GetOptional(values, "kind") ?? InferKindFromWorkBranch(YamlMapParser.GetRequired(values, "workBranch")),
            YamlMapParser.GetOptional(values, "category") ?? "uncategorized",
            YamlMapParser.GetOptional(values, "titleSnapshot"),
            YamlMapParser.GetOptional(values, "sourceUsPath"),
            DateTimeOffset.Parse(YamlMapParser.GetRequired(values, "createdAt"), CultureInfo.InvariantCulture),
            YamlMapParser.GetOptional(values, "strategy") ?? WorkBranch.SingleBranchPerUserStoryStrategy);

        var status = YamlMapParser.GetRequired(values, "status");
        if (status == "superseded")
        {
            branch.MarkSuperseded();
        }

        return branch;
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

}
