using System.Security.Cryptography;
using System.Text;
using SpecForge.Domain.Persistence;
using SpecForge.Domain.Workflow;

namespace SpecForge.Domain.Application;

public sealed class WorkflowRunner
{
    private readonly UserStoryFileStore fileStore;
    private readonly IPhaseExecutionProvider phaseExecutionProvider;
    private readonly RepositoryCategoryCatalog repositoryCategoryCatalog;

    public WorkflowRunner()
        : this(new UserStoryFileStore(), new DeterministicPhaseExecutionProvider(), new RepositoryCategoryCatalog())
    {
    }

    public WorkflowRunner(IPhaseExecutionProvider phaseExecutionProvider)
        : this(new UserStoryFileStore(), phaseExecutionProvider, new RepositoryCategoryCatalog())
    {
    }

    internal WorkflowRunner(
        UserStoryFileStore fileStore,
        IPhaseExecutionProvider phaseExecutionProvider,
        RepositoryCategoryCatalog? repositoryCategoryCatalog = null)
    {
        this.fileStore = fileStore ?? throw new ArgumentNullException(nameof(fileStore));
        this.phaseExecutionProvider = phaseExecutionProvider ?? throw new ArgumentNullException(nameof(phaseExecutionProvider));
        this.repositoryCategoryCatalog = repositoryCategoryCatalog ?? new RepositoryCategoryCatalog();
    }

    public async Task<string> CreateUserStoryAsync(
        string workspaceRoot,
        string usId,
        string title,
        string kind,
        string category,
        string sourceText,
        CancellationToken cancellationToken = default)
    {
        ValidateRequired(workspaceRoot, nameof(workspaceRoot));
        ValidateRequired(usId, nameof(usId));
        ValidateRequired(title, nameof(title));
        ValidateRequired(kind, nameof(kind));
        ValidateRequired(category, nameof(category));
        ValidateRequired(sourceText, nameof(sourceText));
        ValidateUserStoryKind(kind);
        repositoryCategoryCatalog.EnsureCategoryIsAllowed(workspaceRoot, category);

        var paths = UserStoryFilePaths.FromWorkspaceRoot(workspaceRoot, usId);
        Directory.CreateDirectory(paths.RootDirectory);
        Directory.CreateDirectory(paths.PhasesDirectoryPath);
        Directory.CreateDirectory(paths.AttachmentsDirectoryPath);

        var workflowRun = new WorkflowRun(usId, ComputeSourceHash(sourceText), WorkflowDefinition.CanonicalV1);

        await File.WriteAllTextAsync(paths.MainArtifactPath, BuildUserStoryMarkdown(usId, title, kind, category, sourceText), cancellationToken);
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
        var metadata = await ReadUserStoryMetadataAsync(paths.MainArtifactPath, usId, cancellationToken);
        var workBranchName = BuildWorkBranchName(usId, metadata.Title, metadata.Kind);
        workflowRun.ApproveCurrentPhase(
            baseBranch,
            workBranchName,
            metadata.Kind,
            metadata.Category,
            metadata.Title,
            paths.MainArtifactPath,
            DateTimeOffset.UtcNow);
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

    public async Task<RequestRegressionResult> RequestRegressionAsync(
        string workspaceRoot,
        string usId,
        PhaseId targetPhase,
        string? reason = null,
        CancellationToken cancellationToken = default)
    {
        var paths = UserStoryFilePaths.FromWorkspaceRoot(workspaceRoot, usId);
        var workflowRun = await fileStore.LoadAsync(paths.RootDirectory, cancellationToken);
        workflowRun.RequestRegression(targetPhase);
        await fileStore.SaveAsync(workflowRun, paths.RootDirectory, cancellationToken);

        var summary = $"Workflow regressed to phase `{WorkflowPresentation.ToPhaseSlug(targetPhase)}`.";
        if (!string.IsNullOrWhiteSpace(reason))
        {
            summary = $"{summary} Reason: {reason.Trim()}.";
        }

        await AppendTimelineEventAsync(
            paths.TimelineFilePath,
            "phase_regressed",
            "user",
            workflowRun.CurrentPhase,
            summary,
            cancellationToken);

        return new RequestRegressionResult(
            workflowRun.UsId,
            WorkflowPresentation.ToStatusSlug(workflowRun.Status),
            WorkflowPresentation.ToPhaseSlug(workflowRun.CurrentPhase));
    }

    public async Task<RestartUserStoryResult> RestartUserStoryFromSourceAsync(
        string workspaceRoot,
        string usId,
        string? reason = null,
        CancellationToken cancellationToken = default)
    {
        var paths = UserStoryFilePaths.FromWorkspaceRoot(workspaceRoot, usId);
        var existingRun = await fileStore.LoadAsync(paths.RootDirectory, cancellationToken);

        if (existingRun.CurrentPhase == PhaseId.Capture)
        {
            throw new WorkflowDomainException("Restart is not allowed before refinement has started.");
        }

        var currentSourceText = await ReadSourceTextFromUserStoryAsync(paths.MainArtifactPath, cancellationToken);
        var currentSourceHash = ComputeSourceHash(currentSourceText);
        if (string.Equals(existingRun.SourceHash, currentSourceHash, StringComparison.Ordinal))
        {
            throw new WorkflowDomainException("Restart is not allowed because the source has not changed.");
        }

        var restartTimestamp = DateTimeOffset.UtcNow;
        await ArchiveDerivedArtifactsAsync(paths, existingRun, restartTimestamp, cancellationToken);

        var restartedRun = new WorkflowRun(existingRun.UsId, currentSourceHash, existingRun.Definition);
        restartedRun.GenerateNextPhase();
        var generatedArtifactPath = await MaterializePhaseArtifactAsync(workspaceRoot, paths, restartedRun, cancellationToken);
        await fileStore.SaveAsync(restartedRun, paths.RootDirectory, cancellationToken);

        await AppendTimelineEventAsync(
            paths.TimelineFilePath,
            "source_hash_mismatch_detected",
            "system",
            restartedRun.CurrentPhase,
            $"Detected source change. Previous hash `{existingRun.SourceHash}` differs from current hash `{currentSourceHash}`.",
            cancellationToken);

        var summary = "Restarted workflow from the updated source and regenerated refinement.";
        if (!string.IsNullOrWhiteSpace(reason))
        {
            summary = $"{summary} Reason: {reason.Trim()}.";
        }

        await AppendTimelineEventAsync(
            paths.TimelineFilePath,
            "us_restarted_from_source",
            "user",
            restartedRun.CurrentPhase,
            summary,
            cancellationToken,
            generatedArtifactPath);

        return new RestartUserStoryResult(
            restartedRun.UsId,
            WorkflowPresentation.ToStatusSlug(restartedRun.Status),
            WorkflowPresentation.ToPhaseSlug(restartedRun.CurrentPhase),
            generatedArtifactPath);
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
            artifactPath = await MaterializePhaseArtifactAsync(workspaceRoot, paths, workflowRun, cancellationToken);
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

    private async Task<string> MaterializePhaseArtifactAsync(
        string workspaceRoot,
        UserStoryFilePaths paths,
        WorkflowRun workflowRun,
        CancellationToken cancellationToken)
    {
        Directory.CreateDirectory(paths.PhasesDirectoryPath);
        var artifactPath = NextAvailableArtifactPath(paths, workflowRun.CurrentPhase);
        var executionContext = new PhaseExecutionContext(
            workspaceRoot,
            workflowRun.UsId,
            workflowRun.CurrentPhase,
            paths.MainArtifactPath,
            BuildPreviousArtifactMap(paths, workflowRun.CurrentPhase),
            BuildAttachmentPaths(paths));
        var result = await phaseExecutionProvider.ExecuteAsync(executionContext, cancellationToken);

        await File.WriteAllTextAsync(artifactPath, result.Content, cancellationToken);
        return artifactPath;
    }

    private static IReadOnlyDictionary<PhaseId, string> BuildPreviousArtifactMap(UserStoryFilePaths paths, PhaseId currentPhase)
    {
        var result = new Dictionary<PhaseId, string>();
        foreach (var phaseId in new[] { PhaseId.Refinement, PhaseId.TechnicalDesign, PhaseId.Implementation, PhaseId.Review })
        {
            if (phaseId == currentPhase)
            {
                continue;
            }

            var candidate = paths.GetPhaseArtifactPath(phaseId);
            if (File.Exists(candidate))
            {
                result[phaseId] = candidate;
            }
        }

        return result;
    }

    private static IReadOnlyCollection<string> BuildAttachmentPaths(UserStoryFilePaths paths)
    {
        if (!Directory.Exists(paths.AttachmentsDirectoryPath))
        {
            return [];
        }

        return Directory.GetFiles(paths.AttachmentsDirectoryPath, "*", SearchOption.TopDirectoryOnly)
            .OrderBy(static path => path, StringComparer.Ordinal)
            .ToArray();
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

    private static async Task<string> ReadSourceTextFromUserStoryAsync(string userStoryPath, CancellationToken cancellationToken)
    {
        var userStory = await File.ReadAllTextAsync(userStoryPath, cancellationToken);
        var objective = ReadMarkdownSection(userStory, "## Objetivo", "## Objective");
        return objective == "..." ? userStory.Trim() : objective;
    }

    private static string ReadMarkdownSection(string markdown, params string[] headings)
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

    private static async Task ArchiveDerivedArtifactsAsync(
        UserStoryFilePaths paths,
        WorkflowRun workflowRun,
        DateTimeOffset restartTimestamp,
        CancellationToken cancellationToken)
    {
        var archiveDirectory = paths.GetRestartArchiveDirectoryPath(restartTimestamp);
        Directory.CreateDirectory(archiveDirectory);

        if (Directory.Exists(paths.PhasesDirectoryPath) &&
            Directory.EnumerateFileSystemEntries(paths.PhasesDirectoryPath).Any())
        {
            var archivedPhasesPath = Path.Combine(archiveDirectory, "phases");
            Directory.Move(paths.PhasesDirectoryPath, archivedPhasesPath);
        }

        if (workflowRun.Branch is not null)
        {
            workflowRun.Branch.MarkSuperseded();
            var archivedBranchPath = Path.Combine(archiveDirectory, "branch.yaml");
            await File.WriteAllTextAsync(
                archivedBranchPath,
                BranchYamlSerializer.Serialize(workflowRun.UsId, workflowRun.Branch),
                cancellationToken);
        }

        var archivedStatePath = Path.Combine(archiveDirectory, "state.yaml");
        await File.WriteAllTextAsync(
            archivedStatePath,
            StateYamlSerializer.Serialize(workflowRun),
            cancellationToken);

        Directory.CreateDirectory(paths.PhasesDirectoryPath);
    }

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

    private static string BuildUserStoryMarkdown(string usId, string title, string kind, string category, string sourceText)
    {
        return string.Join(
                   Environment.NewLine,
                   new[]
                   {
                       $"# {usId} · {title}",
                       string.Empty,
                       "## Metadata",
                       $"- Kind: `{kind}`",
                       $"- Category: `{category}`",
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

    internal static async Task<UserStoryMetadata> ReadUserStoryMetadataAsync(
        string userStoryPath,
        string usId,
        CancellationToken cancellationToken)
    {
        var userStory = await File.ReadAllTextAsync(userStoryPath, cancellationToken);
        var title = ReadHeading(userStory, usId);
        var normalizedTitle = title.Replace($"{usId} · ", string.Empty, StringComparison.Ordinal)
            .Replace($"{usId} - ", string.Empty, StringComparison.Ordinal)
            .Trim();
        var kind = ReadUserStoryKind(userStory);
        var category = ReadUserStoryCategory(userStory);
        ValidateUserStoryKind(kind);
        return new UserStoryMetadata(normalizedTitle, kind, category);
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

    private static void ValidateUserStoryKind(string kind)
    {
        if (kind is not ("feature" or "bug" or "hotfix"))
        {
            throw new WorkflowDomainException($"Unsupported user story kind '{kind}'.");
        }
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

    private static string ReadUserStoryKind(string markdown)
    {
        using var reader = new StringReader(markdown);
        string? line;
        while ((line = reader.ReadLine()) is not null)
        {
            var trimmed = line.Trim();
            if (!trimmed.StartsWith("- Kind:", StringComparison.OrdinalIgnoreCase))
            {
                continue;
            }

            var value = trimmed["- Kind:".Length..].Trim().Trim('`').ToLowerInvariant();
            return string.IsNullOrWhiteSpace(value) ? "feature" : value;
        }

        return "feature";
    }

    private static string ReadUserStoryCategory(string markdown)
    {
        using var reader = new StringReader(markdown);
        string? line;
        while ((line = reader.ReadLine()) is not null)
        {
            var trimmed = line.Trim();
            if (!trimmed.StartsWith("- Category:", StringComparison.OrdinalIgnoreCase))
            {
                continue;
            }

            var value = trimmed["- Category:".Length..].Trim().Trim('`').ToLowerInvariant();
            return string.IsNullOrWhiteSpace(value) ? "uncategorized" : value;
        }

        return "uncategorized";
    }

    private static string BuildWorkBranchName(string usId, string title, string kind)
    {
        var slug = BuildShortSlug(title);
        return $"{kind}/{usId.ToLowerInvariant()}-{slug}";
    }

    private static string BuildShortSlug(string title)
    {
        var normalized = title.Normalize(NormalizationForm.FormD);
        var builder = new StringBuilder(normalized.Length);

        foreach (var character in normalized)
        {
            if (char.GetUnicodeCategory(character) == System.Globalization.UnicodeCategory.NonSpacingMark)
            {
                continue;
            }

            builder.Append(character);
        }

        var ascii = builder.ToString().Normalize(NormalizationForm.FormC).ToLowerInvariant();
        ascii = System.Text.RegularExpressions.Regex.Replace(ascii, @"[^a-z0-9]+", "-");
        ascii = System.Text.RegularExpressions.Regex.Replace(ascii, @"-+", "-").Trim('-');

        if (string.IsNullOrWhiteSpace(ascii))
        {
            return "work-item";
        }

        return ascii.Length <= 48 ? ascii : ascii[..48].Trim('-');
    }

    internal sealed record UserStoryMetadata(string Title, string Kind, string Category);
}
