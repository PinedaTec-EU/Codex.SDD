using SpecForge.Domain.Persistence;

namespace SpecForge.Domain.Application;

public sealed class RepositoryPromptInitializer
{
    public async Task<InitializeRepoPromptsResult> InitializeAsync(
        string workspaceRoot,
        bool overwrite = false,
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(workspaceRoot))
        {
            throw new ArgumentException("Workspace root is required.", nameof(workspaceRoot));
        }

        var paths = new PromptFilePaths(workspaceRoot);
        Directory.CreateDirectory(paths.SpecsDirectoryPath);
        Directory.CreateDirectory(paths.PromptsDirectoryPath);
        Directory.CreateDirectory(paths.SharedPromptsDirectoryPath);
        Directory.CreateDirectory(paths.PhasePromptsDirectoryPath);

        var createdFiles = new List<string>();
        var skippedFiles = new List<string>();
        var files = new Dictionary<string, string>(StringComparer.Ordinal)
        {
            [paths.ConfigFilePath] = BuildConfigYaml(),
            [paths.PromptManifestPath] = BuildPromptManifestYaml(),
            [paths.SharedSystemPromptPath] = BuildSharedSystemPrompt(),
            [paths.SharedStylePromptPath] = BuildSharedStylePrompt(),
            [paths.SharedOutputRulesPromptPath] = BuildSharedOutputRulesPrompt(),
            [paths.RefinementExecutePromptPath] = BuildRefinementExecutePrompt(),
            [paths.RefinementApprovePromptPath] = BuildRefinementApprovePrompt(),
            [paths.TechnicalDesignExecutePromptPath] = BuildTechnicalDesignExecutePrompt(),
            [paths.TechnicalDesignApprovePromptPath] = BuildTechnicalDesignApprovePrompt(),
            [paths.ImplementationExecutePromptPath] = BuildImplementationExecutePrompt(),
            [paths.ReviewExecutePromptPath] = BuildReviewExecutePrompt(),
            [paths.ReleaseApprovalApprovePromptPath] = BuildReleaseApprovalApprovePrompt()
        };

        foreach (var file in files)
        {
            if (File.Exists(file.Key) && !overwrite)
            {
                skippedFiles.Add(file.Key);
                continue;
            }

            await File.WriteAllTextAsync(file.Key, file.Value, cancellationToken);
            createdFiles.Add(file.Key);
        }

        return new InitializeRepoPromptsResult(
            workspaceRoot,
            paths.ConfigFilePath,
            paths.PromptManifestPath,
            createdFiles,
            skippedFiles);
    }

    private static string BuildConfigYaml() =>
        """
        initialized: true
        promptMode: required
        promptManifest: .specs/prompts/prompts.yaml
        """;

    private static string BuildPromptManifestYaml() =>
        """
        version: 1
        shared:
          system: .specs/prompts/shared/system.md
          style: .specs/prompts/shared/style.md
          outputRules: .specs/prompts/shared/output-rules.md
        phases:
          refinement:
            execute: .specs/prompts/phases/refinement.execute.md
            approve: .specs/prompts/phases/refinement.approve.md
          technical_design:
            execute: .specs/prompts/phases/technical-design.execute.md
            approve: .specs/prompts/phases/technical-design.approve.md
          implementation:
            execute: .specs/prompts/phases/implementation.execute.md
          review:
            execute: .specs/prompts/phases/review.execute.md
          release_approval:
            approve: .specs/prompts/phases/release-approval.approve.md
        """;

    private static string BuildSharedSystemPrompt() =>
        """
        You are SpecForge's phase execution engine for this repository.

        Act strictly within the requested phase contract.
        Prefer concrete, auditable markdown over generic prose.
        Do not invent missing repository facts.
        """;

    private static string BuildSharedStylePrompt() =>
        """
        Write in Spanish unless the repository artifacts are already in another language.
        Keep the output concise, technical, and structured with markdown headings.
        Avoid filler, motivational language, and broad product marketing phrasing.
        """;

    private static string BuildSharedOutputRulesPrompt() =>
        """
        Return only the markdown artifact content for the requested phase.
        Do not wrap the response in code fences.
        Preserve the expected section names of the target artifact.
        If required context is missing or contradictory, state it explicitly inside the artifact instead of hiding the issue.
        """;

    private static string BuildRefinementExecutePrompt() =>
        """
        Role: refinement analyst.

        Goal:
        - transform `us.md` into a sharper `01-refinement.md`
        - include red-team criticism
        - include blue-team corrections
        - leave a concrete, reviewable refinement

        Required sections:
        - History Log
        - Estado
        - Resumen ejecutivo
        - Objetivo refinado
        - Alcance refinado
        - Reglas funcionales
        - Restricciones
        - Ambigüedades detectadas
        - Red Team
        - Blue Team
        - Criterios de aceptación refinados
        - Preguntas para aprobación humana
        """;

    private static string BuildRefinementApprovePrompt() =>
        """
        Role: approval assistant for refinement.

        Goal:
        - evaluate whether the refinement is ready for technical design
        - identify blocking ambiguities, hidden scope, or acceptance gaps
        - recommend approve or hold, but never mutate the user decision
        """;

    private static string BuildTechnicalDesignExecutePrompt() =>
        """
        Role: technical designer.

        Goal:
        - derive a practical technical design from the approved refinement
        - keep the design implementable inside this repository

        Required sections:
        - Estado
        - Resumen técnico
        - Objetivo técnico
        - Componentes afectados
        - Diseño propuesto
        - Alternativas consideradas
        - Riesgos técnicos
        - Impacto esperado
        - Estrategia de implementación
        - Estrategia de validación
        - Decisiones abiertas
        - Aprobación requerida
        """;

    private static string BuildTechnicalDesignApprovePrompt() =>
        """
        Role: approval assistant for technical design.

        Goal:
        - verify that the design is implementable, bounded, and aligned with the refinement
        - surface missing risks, missing validation, or architectural overreach
        - recommend approve or hold without pretending to be the human approver
        """;

    private static string BuildImplementationExecutePrompt() =>
        """
        Role: implementation planner.

        Goal:
        - describe the intended implementation delta for this phase
        - stay aligned with the approved technical design
        - keep the output grounded in repository components and validation steps
        """;

    private static string BuildReviewExecutePrompt() =>
        """
        Role: critical reviewer.

        Goal:
        - compare user story, refinement, technical design, and implementation outputs
        - identify deviations, risks, and missing validation
        - emit findings with clear severity and a pass or fail recommendation

        Behave as reviewer, not as author.
        """;

    private static string BuildReleaseApprovalApprovePrompt() =>
        """
        Role: release approval assistant.

        Goal:
        - summarize readiness, residual risks, and what the user is being asked to approve
        - help the final human checkpoint before PR preparation
        """;
}
