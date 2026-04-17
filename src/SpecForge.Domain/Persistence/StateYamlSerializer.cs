using SpecForge.Domain.Workflow;

namespace SpecForge.Domain.Persistence;

internal static class StateYamlSerializer
{
    public static string Serialize(WorkflowRun workflowRun)
    {
        var lines = new List<string>
        {
            $"usId: {workflowRun.UsId}",
            $"workflowId: {workflowRun.Definition.WorkflowId}",
            $"status: {ToKebabCase(workflowRun.Status)}",
            $"currentPhase: {ToKebabCase(workflowRun.CurrentPhase)}",
            $"sourceHash: {workflowRun.SourceHash}",
            "approvedPhases:"
        };

        foreach (var approvedPhase in workflowRun.ApprovedPhases)
        {
            lines.Add($"  - {ToKebabCase(approvedPhase)}");
        }

        if (workflowRun.ApprovedPhases.Count == 0)
        {
            lines.Add("  []");
        }

        return string.Join(Environment.NewLine, lines) + Environment.NewLine;
    }

    public static StateDocument Deserialize(string yaml)
    {
        var values = ParseTopLevelMappings(yaml);
        var approvedPhases = ParseSequence(yaml, "approvedPhases").Select(ParsePhaseId).ToArray();

        return new StateDocument(
            GetRequired(values, "usId"),
            GetRequired(values, "workflowId"),
            ParseUserStoryStatus(GetRequired(values, "status")),
            ParsePhaseId(GetRequired(values, "currentPhase")),
            GetRequired(values, "sourceHash"),
            approvedPhases);
    }

    private static Dictionary<string, string> ParseTopLevelMappings(string yaml)
    {
        var result = new Dictionary<string, string>(StringComparer.Ordinal);
        using var reader = new StringReader(yaml);

        string? line;
        while ((line = reader.ReadLine()) is not null)
        {
            if (string.IsNullOrWhiteSpace(line) || char.IsWhiteSpace(line[0]))
            {
                continue;
            }

            var separatorIndex = line.IndexOf(':');
            if (separatorIndex < 0)
            {
                continue;
            }

            var key = line[..separatorIndex].Trim();
            var value = line[(separatorIndex + 1)..].Trim();
            result[key] = value;
        }

        return result;
    }

    private static IReadOnlyList<string> ParseSequence(string yaml, string key)
    {
        var lines = yaml.Replace("\r\n", "\n", StringComparison.Ordinal).Split('\n');
        var result = new List<string>();
        var foundKey = false;

        foreach (var rawLine in lines)
        {
            var line = rawLine.TrimEnd();

            if (!foundKey)
            {
                if (line == $"{key}:")
                {
                    foundKey = true;
                }

                continue;
            }

            if (string.IsNullOrWhiteSpace(line))
            {
                continue;
            }

            if (!char.IsWhiteSpace(rawLine[0]))
            {
                break;
            }

            var trimmed = line.Trim();
            if (trimmed == "[]")
            {
                return [];
            }

            if (trimmed.StartsWith("- ", StringComparison.Ordinal))
            {
                result.Add(trimmed[2..].Trim());
            }
        }

        return result;
    }

    private static string GetRequired(IReadOnlyDictionary<string, string> values, string key)
    {
        if (!values.TryGetValue(key, out var value) || string.IsNullOrWhiteSpace(value))
        {
            throw new InvalidDataException($"Required YAML key '{key}' was not found.");
        }

        return value;
    }

    private static string ToKebabCase(PhaseId phaseId) => phaseId switch
    {
        PhaseId.Capture => "capture",
        PhaseId.Refinement => "refinement",
        PhaseId.TechnicalDesign => "technical-design",
        PhaseId.Implementation => "implementation",
        PhaseId.Review => "review",
        PhaseId.ReleaseApproval => "release-approval",
        PhaseId.PrPreparation => "pr-preparation",
        _ => throw new ArgumentOutOfRangeException(nameof(phaseId), phaseId, null)
    };

    private static string ToKebabCase(UserStoryStatus status) => status switch
    {
        UserStoryStatus.Draft => "draft",
        UserStoryStatus.Active => "active",
        UserStoryStatus.WaitingUser => "waiting-user",
        UserStoryStatus.Blocked => "blocked",
        UserStoryStatus.Completed => "completed",
        _ => throw new ArgumentOutOfRangeException(nameof(status), status, null)
    };

    private static PhaseId ParsePhaseId(string value) => value switch
    {
        "capture" => PhaseId.Capture,
        "refinement" => PhaseId.Refinement,
        "technical-design" => PhaseId.TechnicalDesign,
        "implementation" => PhaseId.Implementation,
        "review" => PhaseId.Review,
        "release-approval" => PhaseId.ReleaseApproval,
        "pr-preparation" => PhaseId.PrPreparation,
        _ => throw new InvalidDataException($"Unknown phase id '{value}'.")
    };

    private static UserStoryStatus ParseUserStoryStatus(string value) => value switch
    {
        "draft" => UserStoryStatus.Draft,
        "active" => UserStoryStatus.Active,
        "waiting-user" => UserStoryStatus.WaitingUser,
        "blocked" => UserStoryStatus.Blocked,
        "completed" => UserStoryStatus.Completed,
        _ => throw new InvalidDataException($"Unknown status '{value}'.")
    };
}

internal sealed record StateDocument(
    string UsId,
    string WorkflowId,
    UserStoryStatus Status,
    PhaseId CurrentPhase,
    string SourceHash,
    IReadOnlyCollection<PhaseId> ApprovedPhases);
