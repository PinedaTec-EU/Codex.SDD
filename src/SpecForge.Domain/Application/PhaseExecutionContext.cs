using SpecForge.Domain.Workflow;

namespace SpecForge.Domain.Application;

public sealed record PhaseExecutionContext(
    string UsId,
    PhaseId PhaseId,
    string UserStoryPath,
    IReadOnlyDictionary<PhaseId, string> PreviousArtifactPaths);
