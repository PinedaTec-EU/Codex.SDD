using SpecForge.Domain.Application;
using SpecForge.Domain.Persistence;
using SpecForge.Domain.Workflow;

namespace SpecForge.Domain.Tests;

public sealed class WorkflowIterationDetailsBuilderTests : IDisposable
{
    private readonly string rootDirectory = Path.Combine(Path.GetTempPath(), Guid.NewGuid().ToString("N"));

    [Fact]
    public async Task Build_UsesOperationLogSourceAndReviewContextForImplementationRetries()
    {
        Directory.CreateDirectory(rootDirectory);
        var paths = new UserStoryFilePaths(rootDirectory);
        Directory.CreateDirectory(paths.PhasesDirectoryPath);
        await File.WriteAllTextAsync(paths.MainArtifactPath, "# US");
        await File.WriteAllTextAsync(paths.GetPhaseArtifactPath(PhaseId.TechnicalDesign), "# TD");
        await File.WriteAllTextAsync(paths.GetPhaseArtifactPath(PhaseId.Implementation), "# Impl v1");
        await File.WriteAllTextAsync(paths.GetPhaseArtifactPath(PhaseId.Implementation, 2), "# Impl v2");
        await File.WriteAllTextAsync(paths.GetPhaseArtifactPath(PhaseId.Review), "# Review v1");
        await File.WriteAllTextAsync(paths.GetPhaseOperationLogPath(PhaseId.Implementation), """
            # Artifact Operation Log · implementation

            This file records direct model-assisted operations over the current artifact.

            ## 2026-04-25T10:05:00.0000000+00:00 · `alice`

            - Source Artifact: `/tmp/source/03-implementation.md`
            - Result Artifact: `/tmp/source/03-implementation.v02.md`
            - Context Artifacts:
              - `/tmp/source/04-review.md`
            - Prompt:
            ```text
            Apply the failed review corrections.
            ```
            """);

        var events = new[]
        {
            new TimelineEventDetails(
                "2026-04-25T10:00:00.0000000+00:00",
                "phase_completed",
                "system",
                "technical-design",
                "Generated technical design artifact.",
                [paths.GetPhaseArtifactPath(PhaseId.TechnicalDesign)],
                null,
                500,
                null),
            new TimelineEventDetails(
                "2026-04-25T10:01:00.0000000+00:00",
                "phase_completed",
                "system",
                "implementation",
                "Generated implementation artifact.",
                [paths.GetPhaseArtifactPath(PhaseId.Implementation)],
                null,
                1000,
                null),
            new TimelineEventDetails(
                "2026-04-25T10:03:00.0000000+00:00",
                "phase_completed",
                "system",
                "review",
                "Generated failed review artifact.",
                [paths.GetPhaseArtifactPath(PhaseId.Review)],
                null,
                800,
                null),
            new TimelineEventDetails(
                "2026-04-25T10:05:00.0000000+00:00",
                "artifact_operated",
                "alice",
                "implementation",
                "Applied review corrections.",
                ["/tmp/source/03-implementation.v02.md"],
                null,
                1200,
                null)
        };

        var implementationIterations = WorkflowIterationDetailsBuilder.Build(paths, events)
            .Where(iteration => iteration.PhaseId == "implementation")
            .OrderBy(iteration => iteration.Attempt)
            .ToArray();

        Assert.Equal(2, implementationIterations.Length);
        Assert.Equal(paths.GetPhaseArtifactPath(PhaseId.TechnicalDesign), implementationIterations[0].InputArtifactPath);
        Assert.Equal("/tmp/source/03-implementation.md", implementationIterations[1].InputArtifactPath);
        Assert.Equal(["/tmp/source/04-review.md"], implementationIterations[1].ContextArtifactPaths);
        Assert.Equal("Apply the failed review corrections.", implementationIterations[1].OperationPrompt);
    }

    public void Dispose()
    {
        if (Directory.Exists(rootDirectory))
        {
            Directory.Delete(rootDirectory, true);
        }
    }
}
