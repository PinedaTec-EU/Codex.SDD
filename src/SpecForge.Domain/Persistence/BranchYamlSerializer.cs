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
                       "createdFromPhase: spec",
                       $"strategy: {branch.Strategy}",
                       $"titleSnapshot: {branch.TitleSnapshot ?? string.Empty}",
                       $"sourceUsPath: {branch.SourceUsPath ?? string.Empty}",
                       $"pullRequestStatus: {branch.PullRequest?.Status ?? "not_requested"}",
                       $"pullRequestTargetBaseBranch: {branch.PullRequest?.TargetBaseBranch ?? branch.BaseBranch}",
                       $"pullRequestTitle: {branch.PullRequest?.Title ?? string.Empty}",
                       $"pullRequestArtifactPath: {branch.PullRequest?.ArtifactPath ?? string.Empty}",
                       $"pullRequestDraft: {FormatBoolean(branch.PullRequest?.IsDraft)}",
                       $"pullRequestNumber: {(branch.PullRequest?.Number is int number ? number.ToString(CultureInfo.InvariantCulture) : string.Empty)}",
                       $"pullRequestUrl: {branch.PullRequest?.Url ?? string.Empty}",
                       $"pullRequestRemoteBranch: {branch.PullRequest?.RemoteBranch ?? string.Empty}",
                       $"pullRequestHeadCommitSha: {branch.PullRequest?.HeadCommitSha ?? string.Empty}",
                       $"pullRequestPublishedAt: {branch.PullRequest?.PublishedAtUtc?.ToString("O", CultureInfo.InvariantCulture) ?? string.Empty}"
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

        var pullRequestStatus = YamlMapParser.GetOptional(values, "pullRequestStatus");
        if (!string.IsNullOrWhiteSpace(pullRequestStatus) && !string.Equals(pullRequestStatus, "not_requested", StringComparison.Ordinal))
        {
            branch.RecordPublishedPullRequest(
                new PullRequestRecord(
                    pullRequestStatus,
                    YamlMapParser.GetOptional(values, "pullRequestTargetBaseBranch") ?? branch.BaseBranch,
                    YamlMapParser.GetOptional(values, "pullRequestTitle") ?? string.Empty,
                    YamlMapParser.GetOptional(values, "pullRequestArtifactPath") ?? string.Empty,
                    ParseBoolean(YamlMapParser.GetOptional(values, "pullRequestDraft")),
                    ParseNullableInt32(YamlMapParser.GetOptional(values, "pullRequestNumber")),
                    YamlMapParser.GetOptional(values, "pullRequestUrl"),
                    YamlMapParser.GetOptional(values, "pullRequestRemoteBranch"),
                    YamlMapParser.GetOptional(values, "pullRequestHeadCommitSha"),
                    ParseNullableDateTimeOffset(YamlMapParser.GetOptional(values, "pullRequestPublishedAt"))));
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

    private static string FormatBoolean(bool? value) => value.HasValue ? (value.Value ? "true" : "false") : string.Empty;

    private static bool ParseBoolean(string? value) =>
        bool.TryParse(value, out var parsed) && parsed;

    private static int? ParseNullableInt32(string? value) =>
        int.TryParse(value, NumberStyles.Integer, CultureInfo.InvariantCulture, out var parsed) ? parsed : null;

    private static DateTimeOffset? ParseNullableDateTimeOffset(string? value) =>
        DateTimeOffset.TryParse(value, CultureInfo.InvariantCulture, DateTimeStyles.RoundtripKind, out var parsed)
            ? parsed
            : null;

}
