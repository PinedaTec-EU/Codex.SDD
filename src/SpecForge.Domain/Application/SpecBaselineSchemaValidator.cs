using System.Text;

namespace SpecForge.Domain.Application;

internal static class SpecBaselineSchemaValidator
{
    private static readonly string[] RequiredSections =
    [
        "## History Log",
        "## State",
        "## Spec Summary",
        "## Inputs",
        "## Outputs",
        "## Business Rules",
        "## Edge Cases",
        "## Errors and Failure Modes",
        "## Constraints",
        "## Detected Ambiguities",
        "## Red Team",
        "## Blue Team",
        "## Acceptance Criteria",
        "## Human Approval Questions"
    ];

    public static SpecBaselineValidationResult Validate(string markdown)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(markdown);

        var missingSections = new List<string>();
        var placeholderSections = new List<string>();
        var unresolvedApprovalQuestions = new List<string>();

        foreach (var heading in RequiredSections)
        {
            var content = MarkdownHelper.TryReadSection(markdown, heading);
            if (content is null)
            {
                missingSections.Add(heading[3..]);
                continue;
            }

            if (LooksPlaceholder(content))
            {
                placeholderSections.Add(heading[3..]);
            }

            if (heading == "## Human Approval Questions")
            {
                unresolvedApprovalQuestions.AddRange(ApprovalQuestionMarkdown.GetUnresolvedQuestions(content));
            }
        }

        return new SpecBaselineValidationResult(
            missingSections.Count == 0 && placeholderSections.Count == 0 && unresolvedApprovalQuestions.Count == 0,
            missingSections,
            placeholderSections,
            unresolvedApprovalQuestions);
    }

    public static void EnsureValid(string markdown)
    {
        var validation = Validate(markdown);
        if (validation.IsValid)
        {
            return;
        }

        var builder = new StringBuilder("The approved spec does not satisfy the required schema.");
        if (validation.MissingSections.Count > 0)
        {
            builder.Append(" Missing sections: ")
                .Append(string.Join(", ", validation.MissingSections))
                .Append('.');
        }

        if (validation.PlaceholderSections.Count > 0)
        {
            builder.Append(" Placeholder-only sections: ")
                .Append(string.Join(", ", validation.PlaceholderSections))
                .Append('.');
        }

        if (validation.UnresolvedApprovalQuestions.Count > 0)
        {
            builder.Append(" Unresolved human approval questions: ")
                .Append(string.Join(" | ", validation.UnresolvedApprovalQuestions))
                .Append('.');
        }

        throw new Workflow.WorkflowDomainException(builder.ToString());
    }

    private static bool LooksPlaceholder(string content)
    {
        if (string.IsNullOrWhiteSpace(content))
        {
            return true;
        }

        var normalizedLines = content
            .Split('\n', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Where(static line => !string.IsNullOrWhiteSpace(line))
            .ToArray();

        if (normalizedLines.Length == 0)
        {
            return true;
        }

        return normalizedLines.All(static line =>
        {
            var candidate = line
                .Trim()
                .TrimStart('-', '*')
                .Trim();

            return candidate is "..." or "[ ] ..." or "[ ]" or "TBD" or "TODO";
        });
    }
}

internal sealed record SpecBaselineValidationResult(
    bool IsValid,
    IReadOnlyCollection<string> MissingSections,
    IReadOnlyCollection<string> PlaceholderSections,
    IReadOnlyCollection<string> UnresolvedApprovalQuestions);
