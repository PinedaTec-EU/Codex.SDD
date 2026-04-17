using System.Text;
using SpecForge.Domain.Workflow;

namespace SpecForge.Domain.Application;

internal sealed class DeterministicPhaseExecutionProvider : IPhaseExecutionProvider
{
    public async Task<PhaseExecutionResult> ExecuteAsync(
        PhaseExecutionContext context,
        CancellationToken cancellationToken = default)
    {
        var content = context.PhaseId switch
        {
            PhaseId.Refinement => await ComposeRefinementAsync(context, cancellationToken),
            PhaseId.TechnicalDesign => await ComposeTechnicalDesignAsync(context, cancellationToken),
            PhaseId.Implementation => await ComposeImplementationAsync(context, cancellationToken),
            PhaseId.Review => await ComposeReviewAsync(context, cancellationToken),
            _ => throw new WorkflowDomainException($"Phase '{context.PhaseId}' has no materialized artifact.")
        };

        return new PhaseExecutionResult(content, ExecutionKind: "deterministic");
    }

    private static async Task<string> ComposeRefinementAsync(
        PhaseExecutionContext context,
        CancellationToken cancellationToken)
    {
        var userStory = await File.ReadAllTextAsync(context.UserStoryPath, cancellationToken);
        var title = ReadHeading(userStory, fallback: context.UsId);
        var objective = ReadSection(userStory, "## Objetivo", "## Objective");
        var initialScope = ReadSection(userStory, "## Alcance inicial", "## Initial Scope");
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
                       "## Estado",
                       "- Estado: `pending_approval`",
                       "- Basado en: `us.md`",
                       string.Empty,
                       "## Resumen ejecutivo",
                       $"User story `{title}` has been normalized into a refinement-ready spec.",
                       string.Empty,
                       "## Objetivo refinado",
                       objective,
                       string.Empty,
                       "## Alcance refinado",
                       string.IsNullOrWhiteSpace(initialScope)
                           ? "- Include core workflow execution only.\n- Exclude advanced integrations until phase approval."
                           : initialScope,
                       string.Empty,
                       "## Ambigüedades detectadas",
                       $"- {ambiguity}",
                       "- Final approval criteria still depend on explicit human validation.",
                       string.Empty,
                       "## Red Team",
                       "### Riesgos",
                       $"- The current request may still hide implicit assumptions around `{title}`.",
                       "- Missing explicit exclusions could expand the implementation scope beyond the approved phase.",
                       string.Empty,
                       "### Objeciones",
                       "- The US does not yet prove that every acceptance condition is testable.",
                       "- Some operational details may still be conflated with future roadmap items.",
                       string.Empty,
                       "## Blue Team",
                       "### Ajustes recomendados",
                       "- Keep the approved scope constrained to the canonical workflow and visible persisted artifacts.",
                       "- Convert missing assumptions into explicit acceptance criteria before implementation continues.",
                       string.Empty,
                       "### Refinement consolidado",
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
        var executiveSummary = ReadSection(refinement, "## Resumen ejecutivo");
        var refinedObjective = ReadSection(refinement, "## Objetivo refinado");

        return string.Join(
                   Environment.NewLine,
                   new[]
                   {
                       $"# Technical Design · {context.UsId} · v01",
                       string.Empty,
                       "## Estado",
                       "- Estado: `pending_approval`",
                       "- Basado en: `01-refinement.md`",
                       string.Empty,
                       "## Resumen técnico",
                       executiveSummary,
                       string.Empty,
                       "## Objetivo técnico",
                       refinedObjective,
                       string.Empty,
                       "## Componentes afectados",
                       "- `SpecForge.Domain` for workflow rules and orchestration.",
                       "- `SpecForge.Runner.Cli` as local backend boundary.",
                       "- `src-vscode` for extension wiring and workspace UX.",
                       string.Empty,
                       "## Diseño propuesto",
                       "### Arquitectura",
                       "The extension delegates execution to a backend boundary, which routes to the application services and workflow runner.",
                       string.Empty,
                       "### Flujo principal",
                       "1. Load persisted user story state.",
                       "2. Validate the next allowed transition.",
                       "3. Generate or update the corresponding artifact.",
                       "4. Persist state, branch metadata, and timeline.",
                       string.Empty,
                       "## Estrategia de implementación",
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
        var objective = ReadSection(technicalDesign, "## Objetivo técnico");

        return string.Join(
                   Environment.NewLine,
                   new[]
                   {
                       $"# Implementation · {context.UsId} · v01",
                       string.Empty,
                       "## Estado",
                       "- Estado: `generated`",
                       "- Basado en: `02-technical-design.md`",
                       string.Empty,
                       "## Objetivo implementado",
                       objective,
                       string.Empty,
                       "## Cambios previstos o ejecutados",
                       "- Update workflow orchestration logic.",
                       "- Persist resulting state and derived artifacts.",
                       "- Expose the action through the selected backend boundary.",
                       string.Empty,
                       "## Verificación prevista",
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
                       "## Estado",
                       $"- Resultado: `{result}`",
                       string.Empty,
                       "## Verificaciones realizadas",
                       $"- [x] Refinement artifact present: `{refinementExists}`",
                       $"- [x] Technical design artifact present: `{technicalDesignExists}`",
                       $"- [x] Implementation artifact present: `{implementationExists}`",
                       string.Empty,
                       "## Veredicto",
                       $"- Resultado final: `{result}`",
                       $"- Motivo principal: the workflow artifacts required for review are {(result == "pass" ? "present" : "incomplete")}.",
                       string.Empty,
                       "## Recomendación",
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
