using System.Security.Cryptography;
using System.Text;
using SpecForge.Domain.Persistence;
using SpecForge.Domain.Workflow;

namespace SpecForge.Domain.Application;

public sealed class WorkflowRunner
{
    private readonly UserStoryFileStore fileStore;

    public WorkflowRunner()
        : this(new UserStoryFileStore())
    {
    }

    public WorkflowRunner(UserStoryFileStore fileStore)
    {
        this.fileStore = fileStore ?? throw new ArgumentNullException(nameof(fileStore));
    }

    public async Task<string> CreateUserStoryAsync(
        string workspaceRoot,
        string usId,
        string title,
        string sourceText,
        CancellationToken cancellationToken = default)
    {
        ValidateRequired(workspaceRoot, nameof(workspaceRoot));
        ValidateRequired(usId, nameof(usId));
        ValidateRequired(title, nameof(title));
        ValidateRequired(sourceText, nameof(sourceText));

        var paths = UserStoryFilePaths.FromWorkspaceRoot(workspaceRoot, usId);
        Directory.CreateDirectory(paths.RootDirectory);
        Directory.CreateDirectory(paths.PhasesDirectoryPath);

        var workflowRun = new WorkflowRun(usId, ComputeSourceHash(sourceText), WorkflowDefinition.CanonicalV1);

        await File.WriteAllTextAsync(paths.MainArtifactPath, BuildUserStoryMarkdown(usId, title, sourceText), cancellationToken);
        await File.WriteAllTextAsync(paths.TimelineFilePath, BuildInitialTimeline(usId, title), cancellationToken);
        await fileStore.SaveAsync(workflowRun, paths.RootDirectory, cancellationToken);
        return paths.RootDirectory;
    }

    public async Task ApproveCurrentPhaseAsync(
        string workspaceRoot,
        string usId,
        string? baseBranch = null,
        CancellationToken cancellationToken = default)
    {
        var paths = UserStoryFilePaths.FromWorkspaceRoot(workspaceRoot, usId);
        var workflowRun = await fileStore.LoadAsync(paths.RootDirectory, cancellationToken);
        workflowRun.ApproveCurrentPhase(baseBranch, DateTimeOffset.UtcNow);
        await fileStore.SaveAsync(workflowRun, paths.RootDirectory, cancellationToken);
        await AppendTimelineEventAsync(
            paths.TimelineFilePath,
            "phase_approved",
            "user",
            workflowRun.CurrentPhase,
            $"Phase `{WorkflowPresentation.ToPhaseSlug(workflowRun.CurrentPhase)}` approved.",
            cancellationToken);

        if (workflowRun.Branch is not null && workflowRun.CurrentPhase == PhaseId.Refinement)
        {
            await AppendTimelineEventAsync(
                paths.TimelineFilePath,
                "branch_created",
                "system",
                workflowRun.CurrentPhase,
                $"Created branch `{workflowRun.Branch.WorkBranchName}` from `{workflowRun.Branch.BaseBranch}`.",
                cancellationToken);
        }
    }

    public async Task<ContinuePhaseResult> ContinuePhaseAsync(
        string workspaceRoot,
        string usId,
        CancellationToken cancellationToken = default)
    {
        var paths = UserStoryFilePaths.FromWorkspaceRoot(workspaceRoot, usId);
        var workflowRun = await fileStore.LoadAsync(paths.RootDirectory, cancellationToken);

        workflowRun.GenerateNextPhase();

        string? artifactPath = null;
        if (HasArtifact(workflowRun.CurrentPhase))
        {
            artifactPath = await MaterializePhaseArtifactAsync(paths, workflowRun, cancellationToken);
            await AppendTimelineEventAsync(
                paths.TimelineFilePath,
                "phase_completed",
                "system",
                workflowRun.CurrentPhase,
                $"Generated artifact for phase `{WorkflowPresentation.ToPhaseSlug(workflowRun.CurrentPhase)}`.",
                cancellationToken,
                artifactPath);
        }
        else
        {
            await AppendTimelineEventAsync(
                paths.TimelineFilePath,
                "phase_started",
                "system",
                workflowRun.CurrentPhase,
                $"Transitioned to phase `{WorkflowPresentation.ToPhaseSlug(workflowRun.CurrentPhase)}`.",
                cancellationToken);
        }

        await fileStore.SaveAsync(workflowRun, paths.RootDirectory, cancellationToken);
        return new ContinuePhaseResult(workflowRun.UsId, workflowRun.CurrentPhase, workflowRun.Status, artifactPath);
    }

    private static async Task<string> MaterializePhaseArtifactAsync(
        UserStoryFilePaths paths,
        WorkflowRun workflowRun,
        CancellationToken cancellationToken)
    {
        Directory.CreateDirectory(paths.PhasesDirectoryPath);
        var artifactPath = NextAvailableArtifactPath(paths, workflowRun.CurrentPhase);
        var content = workflowRun.CurrentPhase switch
        {
            PhaseId.Refinement => BuildRefinementArtifact(workflowRun.UsId),
            PhaseId.TechnicalDesign => BuildTechnicalDesignArtifact(workflowRun.UsId),
            PhaseId.Implementation => BuildImplementationArtifact(workflowRun.UsId),
            PhaseId.Review => BuildReviewArtifact(workflowRun.UsId),
            _ => throw new WorkflowDomainException($"Phase '{workflowRun.CurrentPhase}' has no materialized artifact.")
        };

        await File.WriteAllTextAsync(artifactPath, content, cancellationToken);
        return artifactPath;
    }

    private static string NextAvailableArtifactPath(UserStoryFilePaths paths, PhaseId phaseId)
    {
        for (var version = 1; version < 100; version++)
        {
            var candidate = paths.GetPhaseArtifactPath(phaseId, version);
            if (!File.Exists(candidate))
            {
                return candidate;
            }
        }

        throw new WorkflowDomainException($"Too many versions generated for phase '{phaseId}'.");
    }

    private static bool HasArtifact(PhaseId phaseId) =>
        phaseId is PhaseId.Refinement or PhaseId.TechnicalDesign or PhaseId.Implementation or PhaseId.Review;

    private static async Task AppendTimelineEventAsync(
        string timelinePath,
        string eventCode,
        string actor,
        PhaseId phaseId,
        string summary,
        CancellationToken cancellationToken,
        string? artifactPath = null)
    {
        var timestamp = DateTimeOffset.UtcNow.ToString("O");
        var builder = new StringBuilder()
            .AppendLine()
            .AppendLine($"### {timestamp} · `{eventCode}`")
            .AppendLine()
            .AppendLine($"- Actor: `{actor}`")
            .AppendLine($"- Fase: `{WorkflowPresentation.ToPhaseSlug(phaseId)}`")
            .AppendLine($"- Resumen: {summary}");

        if (!string.IsNullOrWhiteSpace(artifactPath))
        {
            builder.AppendLine("- Artefactos:")
                .AppendLine($"  - `{artifactPath.Replace('\\', '/')}`");
        }

        await File.AppendAllTextAsync(timelinePath, builder.ToString(), cancellationToken);
    }

    private static string BuildInitialTimeline(string usId, string title)
    {
        var timestamp = DateTimeOffset.UtcNow.ToString("O");
        return string.Join(
                   Environment.NewLine,
                   new[]
                   {
                       $"# Timeline · {usId} · {title}",
                       string.Empty,
                       "## Resumen",
                       string.Empty,
                       "- Estado actual: `draft`",
                       "- Fase actual: `capture`",
                       "- Rama activa: `sin crear`",
                       $"- Última actualización: `{timestamp}`",
                       string.Empty,
                       "## Eventos",
                       string.Empty,
                       $"### {timestamp} · `us_created`",
                       string.Empty,
                       "- Actor: `user`",
                       "- Fase: `capture`",
                       "- Resumen: Se creó la US inicial y se persistieron `us.md`, `state.yaml` y `timeline.md`."
                   }) +
               Environment.NewLine;
    }

    private static string BuildUserStoryMarkdown(string usId, string title, string sourceText)
    {
        return string.Join(
                   Environment.NewLine,
                   new[]
                   {
                       $"# {usId} · {title}",
                       string.Empty,
                       "## Objetivo",
                       sourceText,
                       string.Empty,
                       "## Alcance inicial",
                       "- Incluye:",
                       "  - ...",
                       "- No incluye:",
                       "  - ..."
                   }) +
               Environment.NewLine;
    }

    private static string BuildRefinementArtifact(string usId)
    {
        return string.Join(
                   Environment.NewLine,
                   new[]
                   {
                       $"# Refinement · {usId} · v01",
                       string.Empty,
                       "## History Log",
                       $"- `{DateTimeOffset.UtcNow:O}` · Creación inicial del refinement.",
                       string.Empty,
                       "## Estado",
                       "- Estado: `pending_approval`",
                       "- Basado en: `us.md`",
                       string.Empty,
                       "## Red Team",
                       "- Riesgos: ...",
                       string.Empty,
                       "## Blue Team",
                       "- Ajustes recomendados: ..."
                   }) +
               Environment.NewLine;
    }

    private static string BuildTechnicalDesignArtifact(string usId)
    {
        return string.Join(
                   Environment.NewLine,
                   new[]
                   {
                       $"# Technical Design · {usId} · v01",
                       string.Empty,
                       "## Estado",
                       "- Estado: `pending_approval`",
                       "- Basado en: `01-refinement.md`",
                       string.Empty,
                       "## Resumen técnico",
                       "Qué solución se propone y por qué.",
                       string.Empty,
                       "## Estrategia de implementación",
                       "1. ..."
                   }) +
               Environment.NewLine;
    }

    private static string BuildImplementationArtifact(string usId)
    {
        return string.Join(
                   Environment.NewLine,
                   new[]
                   {
                       $"# Implementation · {usId} · v01",
                       string.Empty,
                       "## Estado",
                       "- Estado: `generated`",
                       "- Basado en: `02-technical-design.md`",
                       string.Empty,
                       "## Resumen",
                       "Implementación iniciada o preparada por el workflow runner."
                   }) +
               Environment.NewLine;
    }

    private static string BuildReviewArtifact(string usId)
    {
        return string.Join(
                   Environment.NewLine,
                   new[]
                   {
                       $"# Review · {usId} · v01",
                       string.Empty,
                       "## Estado",
                       "- Resultado: `pass`",
                       string.Empty,
                       "## Veredicto",
                       "- Resultado final: `pass`",
                       "- Motivo principal: revisión mínima generada por el workflow runner."
                   }) +
               Environment.NewLine;
    }

    private static string ComputeSourceHash(string sourceText)
    {
        var bytes = SHA256.HashData(Encoding.UTF8.GetBytes(sourceText));
        return $"sha256:{Convert.ToHexStringLower(bytes)}";
    }

    private static void ValidateRequired(string value, string paramName)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            throw new ArgumentException($"{paramName} is required.", paramName);
        }
    }
}
