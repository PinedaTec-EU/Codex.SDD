namespace SpecForge.Domain.Application;

public sealed record RewindWorkflowResult(
    string UsId,
    string Status,
    string CurrentPhase,
    IReadOnlyCollection<string> DeletedPaths,
    IReadOnlyCollection<string> PreservedPaths);
