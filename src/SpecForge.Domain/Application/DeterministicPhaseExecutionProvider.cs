using System.Text;
using SpecForge.Domain.Workflow;

namespace SpecForge.Domain.Application;

public sealed class DeterministicPhaseExecutionProvider : IPhaseExecutionProvider
{
    public async Task<PhaseExecutionResult> ExecuteAsync(
        PhaseExecutionContext context,
        CancellationToken cancellationToken = default)
    {
        var content = context.PhaseId switch
        {
            PhaseId.Clarification => await ComposeClarificationAsync(context, cancellationToken),
            PhaseId.Refinement => await ComposeRefinementAsync(context, cancellationToken),
            PhaseId.TechnicalDesign => await ComposeTechnicalDesignAsync(context, cancellationToken),
            PhaseId.Implementation => await ComposeImplementationAsync(context, cancellationToken),
            PhaseId.Review => await ComposeReviewAsync(context, cancellationToken),
            _ => throw new WorkflowDomainException($"Phase '{context.PhaseId}' has no materialized artifact.")
        };

        return new PhaseExecutionResult(content, ExecutionKind: "deterministic");
    }

    private static async Task<string> ComposeClarificationAsync(
        PhaseExecutionContext context,
        CancellationToken cancellationToken)
    {
        var userStory = await File.ReadAllTextAsync(context.UserStoryPath, cancellationToken);
        var objective = ReadSection(userStory, "## Objective", "## Objetivo");
        var clarification = UserStoryClarificationMarkdown.Parse(userStory);
        var hasAnswers = clarification is not null && clarification.Items.Any(item => !string.IsNullOrWhiteSpace(item.Answer));
        var looksPlaceholder = objective.Contains("sample", StringComparison.OrdinalIgnoreCase)
            || objective.Contains("...", StringComparison.Ordinal)
            || objective.Contains("todo", StringComparison.OrdinalIgnoreCase)
            || objective.Contains("tbd", StringComparison.OrdinalIgnoreCase);
        var isReady = !looksPlaceholder || hasAnswers;

        var questions = isReady
            ? []
            : new[]
            {
                "Which actor or role executes this functionality?",
                "What concrete inputs come in, and what observable result must come out?",
                "What business rule or acceptance criterion must be satisfied for this user story to be valid?"
            };

        return string.Join(
                   Environment.NewLine,
                   new[]
                   {
                       $"# Clarification · {context.UsId} · v01",
                       string.Empty,
                       "## State",
                       $"- State: `{(isReady ? "ready" : "pending_user_input")}`",
                       string.Empty,
                       "## Decision",
                       isReady ? "ready_for_refinement" : "needs_clarification",
                       string.Empty,
                       "## Reason",
                       isReady
                           ? "The current user story plus recorded clarification answers are concrete enough to proceed to refinement."
                           : "The current user story still reads like a placeholder and needs minimum business detail before refinement can be useful.",
                       string.Empty,
                       "## Questions",
                       questions.Length == 0 ? "1. No clarification questions remain." : string.Join(Environment.NewLine, questions.Select((question, index) => $"{index + 1}. {question}"))
                   }) +
               Environment.NewLine;
    }

    private static async Task<string> ComposeRefinementAsync(
        PhaseExecutionContext context,
        CancellationToken cancellationToken)
    {
        var userStory = await File.ReadAllTextAsync(context.UserStoryPath, cancellationToken);
        var title = ReadHeading(userStory, fallback: context.UsId);
        var objective = ReadSection(userStory, "## Objective", "## Objetivo");
        var initialScope = ReadSection(userStory, "## Initial Scope", "## Alcance inicial");
        var ambiguity = string.IsNullOrWhiteSpace(initialScope)
            ? "The initial scope does not yet distinguish clearly between in-scope and out-of-scope behavior."
            : "The scope is present, but edge cases and exclusions still need approval before design starts.";

        return string.Join(
                   Environment.NewLine,
                   new[]
                   {
                       $"# Refinement · {context.UsId} · v01",
                       string.Empty,
                       "## History Log",
                       $"- `{DateTimeOffset.UtcNow:O}` · Initial refinement generated from `us.md`.",
                       string.Empty,
                       "## State",
                       "- State: `pending_approval`",
                       "- Based on: `us.md`",
                       string.Empty,
                       "## Executive Summary",
                       $"User story `{title}` has been normalized into a refinement-ready spec.",
                       string.Empty,
                       "## Refined Objective",
                       objective,
                       string.Empty,
                       "## Refined Scope",
                       string.IsNullOrWhiteSpace(initialScope)
                           ? "- Include core workflow execution only.\n- Exclude advanced integrations until phase approval."
                           : initialScope,
                       string.Empty,
                       "## Detected Ambiguities",
                       $"- {ambiguity}",
                       "- Final approval criteria still depend on explicit human validation.",
                       string.Empty,
                       "## Red Team",
                       "### Risks",
                       $"- The current request may still hide implicit assumptions around `{title}`.",
                       "- Missing explicit exclusions could expand the implementation scope beyond the approved phase.",
                       string.Empty,
                       "### Objections",
                       "- The US does not yet prove that every acceptance condition is testable.",
                       "- Some operational details may still be conflated with future roadmap items.",
                       string.Empty,
                       "## Blue Team",
                       "### Recommended Adjustments",
                       "- Keep the approved scope constrained to the canonical workflow and visible persisted artifacts.",
                       "- Convert missing assumptions into explicit acceptance criteria before implementation continues.",
                       string.Empty,
                       "### Consolidated Refinement",
                       "The refinement is now structured for technical design with explicit risks, bounded scope, and approval checkpoints."
                   }) +
               Environment.NewLine;
    }

    private static async Task<string> ComposeTechnicalDesignAsync(
        PhaseExecutionContext context,
        CancellationToken cancellationToken)
    {
        var refinement = await File.ReadAllTextAsync(
            GetRequiredPath(context, PhaseId.Refinement),
            cancellationToken);
        var executiveSummary = ReadSection(refinement, "## Executive Summary", "## Resumen ejecutivo");
        var refinedObjective = ReadSection(refinement, "## Refined Objective", "## Objetivo refinado");

        return string.Join(
                   Environment.NewLine,
                   new[]
                   {
                       $"# Technical Design · {context.UsId} · v01",
                       string.Empty,
                       "## State",
                       "- State: `pending_approval`",
                       "- Based on: `01-refinement.md`",
                       string.Empty,
                       "## Technical Summary",
                       executiveSummary,
                       string.Empty,
                       "## Technical Objective",
                       refinedObjective,
                       string.Empty,
                       "## Affected Components",
                       "- `SpecForge.Domain` for workflow rules and orchestration.",
                       "- `SpecForge.Runner.Cli` as local backend boundary.",
                       "- `src-vscode` for extension wiring and workspace UX.",
                       string.Empty,
                       "## Proposed Design",
                       "### Architecture",
                       "The extension delegates execution to a backend boundary, which routes to the application services and workflow runner.",
                       string.Empty,
                       "### Primary Flow",
                       "1. Load persisted user story state.",
                       "2. Validate the next allowed transition.",
                       "3. Generate or update the corresponding artifact.",
                       "4. Persist state, branch metadata, and timeline.",
                       string.Empty,
                       "## Implementation Strategy",
                       "1. Keep all workflow invariants in the domain core.",
                       "2. Use application services as the stable backend surface.",
                       "3. Let the extension consume the backend through explicit commands."
                   }) +
               Environment.NewLine;
    }

    private static async Task<string> ComposeImplementationAsync(
        PhaseExecutionContext context,
        CancellationToken cancellationToken)
    {
        var technicalDesign = await File.ReadAllTextAsync(
            GetRequiredPath(context, PhaseId.TechnicalDesign),
            cancellationToken);
        var objective = ReadSection(technicalDesign, "## Technical Objective", "## Objetivo técnico");

        return string.Join(
                   Environment.NewLine,
                   new[]
                   {
                       $"# Implementation · {context.UsId} · v01",
                       string.Empty,
                       "## State",
                       "- State: `generated`",
                       "- Based on: `02-technical-design.md`",
                       string.Empty,
                       "## Implemented Objective",
                       objective,
                       string.Empty,
                       "## Planned or Executed Changes",
                       "- Update workflow orchestration logic.",
                       "- Persist resulting state and derived artifacts.",
                       "- Expose the action through the selected backend boundary.",
                       string.Empty,
                       "## Planned Verification",
                       "- Domain tests must cover the transition and persistence path.",
                       "- Extension feedback must reflect the generated artifact and new phase."
                   }) +
               Environment.NewLine;
    }

    private static async Task<string> ComposeReviewAsync(
        PhaseExecutionContext context,
        CancellationToken cancellationToken)
    {
        var refinementExists = context.PreviousArtifactPaths.ContainsKey(PhaseId.Refinement);
        var technicalDesignExists = context.PreviousArtifactPaths.ContainsKey(PhaseId.TechnicalDesign);
        var implementationExists = context.PreviousArtifactPaths.ContainsKey(PhaseId.Implementation);
        var result = refinementExists && technicalDesignExists && implementationExists ? "pass" : "fail";
        var recommendation = result == "pass"
            ? "Advance to `release_approval`."
            : "Regress to the missing or inconsistent phase before continuing.";

        await Task.CompletedTask;

        return string.Join(
                   Environment.NewLine,
                   new[]
                   {
                       $"# Review · {context.UsId} · v01",
                       string.Empty,
                       "## State",
                       $"- Result: `{result}`",
                       string.Empty,
                       "## Checks Performed",
                       $"- [x] Refinement artifact present: `{refinementExists}`",
                       $"- [x] Technical design artifact present: `{technicalDesignExists}`",
                       $"- [x] Implementation artifact present: `{implementationExists}`",
                       string.Empty,
                       "## Verdict",
                       $"- Final result: `{result}`",
                       $"- Primary reason: the workflow artifacts required for review are {(result == "pass" ? "present" : "incomplete")}.",
                       string.Empty,
                       "## Recommendation",
                       $"- {recommendation}"
                   }) +
               Environment.NewLine;
    }

    private static string ReadHeading(string markdown, string fallback)
    {
        using var reader = new StringReader(markdown);
        string? line;
        while ((line = reader.ReadLine()) is not null)
        {
            if (line.StartsWith("# ", StringComparison.Ordinal))
            {
                return line[2..].Trim();
            }
        }

        return fallback;
    }

    private static string ReadSection(string markdown, params string[] headings)
    {
        var lines = markdown.Replace("\r\n", "\n", StringComparison.Ordinal).Split('\n');
        for (var index = 0; index < lines.Length; index++)
        {
            if (!headings.Contains(lines[index], StringComparer.Ordinal))
            {
                continue;
            }

            var builder = new StringBuilder();
            for (var cursor = index + 1; cursor < lines.Length; cursor++)
            {
                if (lines[cursor].StartsWith("## ", StringComparison.Ordinal))
                {
                    break;
                }

                builder.AppendLine(lines[cursor]);
            }

            var content = builder.ToString().Trim();
            if (!string.IsNullOrWhiteSpace(content))
            {
                return content;
            }
        }

        return "...";
    }

    private static string GetRequiredPath(PhaseExecutionContext context, PhaseId phaseId)
    {
        if (!context.PreviousArtifactPaths.TryGetValue(phaseId, out var path))
        {
            throw new WorkflowDomainException($"Previous artifact for phase '{phaseId}' was not found.");
        }

        return path;
    }
}
