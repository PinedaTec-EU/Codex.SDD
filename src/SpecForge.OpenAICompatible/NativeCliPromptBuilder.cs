using System.Text;
using SpecForge.Domain.Application;
using SpecForge.Domain.Workflow;

namespace SpecForge.OpenAICompatible;

internal static class NativeCliPromptBuilder
{
    public static string BuildPhasePrompt(
        PhaseExecutionContext context,
        EffectivePrompt prompt,
        string providerKind,
        StructuredPhaseArtifactContract contract)
    {
        var providerLabel = ResolveProviderLabel(providerKind);
        var builder = new StringBuilder()
            .AppendLine($"# SpecForge Native {providerLabel} Execution")
            .AppendLine()
            .AppendLine($"You are {providerLabel} executing a SpecForge workflow phase inside the live repository.")
            .AppendLine("Use the workspace root as the repository root.")
            .AppendLine("Do not create commits or branches.")
            .AppendLine("Return only Markdown matching the phase artifact headings in your final response.")
            .AppendLine();

        if (!string.IsNullOrWhiteSpace(prompt.SystemPrompt))
        {
            builder
                .AppendLine("## System Instructions")
                .AppendLine()
                .AppendLine(prompt.SystemPrompt.Trim())
                .AppendLine();
        }

        if (context.PhaseId == PhaseId.Implementation)
        {
            builder
                .AppendLine("## Native Implementation Rules")
                .AppendLine()
                .AppendLine("- Make the required repository changes in this workspace before you finish.")
                .AppendLine("- Run the most relevant validation commands you can justify from the repo.")
                .AppendLine("- Base the JSON response on the changes and validation you actually performed.")
                .AppendLine();
        }
        else if (context.PhaseId == PhaseId.Review)
        {
            builder
                .AppendLine("## Native Review Rules")
                .AppendLine()
                .AppendLine("- Inspect the repository state and artifacts directly.")
                .AppendLine("- Run the most relevant validation commands needed to verify the Technical Design validation strategy, even when they generate ephemeral build or test outputs.")
                .AppendLine("- Do not modify files during review.")
                .AppendLine("- Base findings only on evidence you actually inspected.")
                .AppendLine();
        }

        builder
            .AppendLine("## Phase Instructions")
            .AppendLine()
            .AppendLine(prompt.UserPrompt.Trim());

        builder
            .AppendLine()
            .AppendLine("## Response Markdown Contract")
            .AppendLine()
            .AppendLine("Return the final answer as the complete Markdown artifact for this phase.")
            .AppendLine("Do not wrap the artifact in markdown fences and do not add prose outside the artifact.");

        return builder.ToString().Trim();
    }

    public static string BuildStandaloneMarkdownPrompt(
        string providerKind,
        string title,
        EffectivePrompt prompt)
    {
        var providerLabel = ResolveProviderLabel(providerKind);
        var builder = new StringBuilder()
            .AppendLine($"# {title}")
            .AppendLine()
            .AppendLine($"You are {providerLabel} assisting the SpecForge workflow inside the live repository.")
            .AppendLine("Return only Markdown matching the requested sections in your final response.")
            .AppendLine("Do not return JSON.")
            .AppendLine();

        if (!string.IsNullOrWhiteSpace(prompt.SystemPrompt))
        {
            builder
                .AppendLine("## System Instructions")
                .AppendLine()
                .AppendLine(prompt.SystemPrompt.Trim())
                .AppendLine();
        }

        builder
            .AppendLine("## Task")
            .AppendLine()
            .AppendLine(prompt.UserPrompt.Trim());

        return builder.ToString().Trim();
    }

    private static string ResolveProviderLabel(string providerKind) =>
        providerKind switch
        {
            "codex" => "Codex",
            "claude" => "Claude",
            "copilot" => "Copilot",
            _ => providerKind
        };
}

internal sealed record EffectivePrompt(
    string SystemPrompt,
    string UserPrompt,
    IReadOnlyCollection<string>? Warnings = null);
