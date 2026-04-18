using SpecForge.Domain.Persistence;
using SpecForge.Domain.Workflow;
using System.Text.RegularExpressions;

namespace SpecForge.Domain.Application;

public sealed class RepositoryCategoryCatalog
{
    private static readonly IReadOnlyList<string> DefaultCategories =
    [
        "workflow",
        "ux",
        "prompts",
        "mcp",
        "providers",
        "branching",
        "review",
        "integrations",
        "infra"
    ];

    public IReadOnlyList<string> GetCategories(string workspaceRoot)
    {
        var paths = new PromptFilePaths(workspaceRoot);
        if (!File.Exists(paths.ConfigFilePath))
        {
            return DefaultCategories;
        }

        var categories = ParseCategories(File.ReadAllText(paths.ConfigFilePath));
        return categories.Count == 0 ? DefaultCategories : categories;
    }

    public void EnsureCategoryIsAllowed(string workspaceRoot, string category)
    {
        if (string.IsNullOrWhiteSpace(category))
        {
            throw new WorkflowDomainException("User story category is required.");
        }

        var normalized = category.Trim().ToLowerInvariant();
        if (!Regex.IsMatch(normalized, "^[a-z0-9-]+$"))
        {
            throw new WorkflowDomainException($"User story category '{category}' is invalid. Use lowercase slug format.");
        }

        var allowedCategories = GetCategories(workspaceRoot);
        if (!allowedCategories.Contains(normalized, StringComparer.Ordinal))
        {
            throw new WorkflowDomainException(
                $"User story category '{category}' is not allowed by .specs/config.yaml.");
        }
    }

    internal static IReadOnlyList<string> ParseCategories(string yaml)
    {
        var lines = yaml.Replace("\r\n", "\n", StringComparison.Ordinal).Split('\n');
        var categories = new List<string>();
        var insideSection = false;

        foreach (var rawLine in lines)
        {
            var line = rawLine.TrimEnd();

            if (!insideSection)
            {
                if (line == "categories:")
                {
                    insideSection = true;
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
            if (!trimmed.StartsWith("- ", StringComparison.Ordinal))
            {
                continue;
            }

            var category = trimmed[2..].Trim().ToLowerInvariant();
            if (!string.IsNullOrWhiteSpace(category))
            {
                categories.Add(category);
            }
        }

        return categories
            .Distinct(StringComparer.Ordinal)
            .OrderBy(static value => value, StringComparer.Ordinal)
            .ToArray();
    }
}
