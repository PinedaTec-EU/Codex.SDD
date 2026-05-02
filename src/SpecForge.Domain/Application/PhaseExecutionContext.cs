using SpecForge.Domain.Workflow;

namespace SpecForge.Domain.Application;

public sealed record PhaseExecutionContext(
    string WorkspaceRoot,
    string UsId,
    PhaseId PhaseId,
    string UserStoryPath,
    IReadOnlyDictionary<PhaseId, string> PreviousArtifactPaths,
    IReadOnlyCollection<string> ContextFilePaths,
    // When both CurrentArtifactPath and OperationPrompt are non-null, the provider must apply
    // the operation on top of the existing artifact instead of generating a new one from scratch.
    // Only supported for Spec today; other phases ignore both fields.
    string? CurrentArtifactPath = null,
    string? OperationPrompt = null,
    // The artifact phase remains PhaseId. ModelRoutingPhaseId lets a transition use the model
    // assigned to the source phase while still producing the destination phase artifact.
    PhaseId? ModelRoutingPhaseId = null);
