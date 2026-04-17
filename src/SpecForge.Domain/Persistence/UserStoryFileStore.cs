using System.Text;
using SpecForge.Domain.Workflow;

namespace SpecForge.Domain.Persistence;

public sealed class UserStoryFileStore
{
    public async Task SaveAsync(WorkflowRun workflowRun, string rootDirectory, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(workflowRun);

        var paths = new UserStoryFilePaths(rootDirectory);
        Directory.CreateDirectory(paths.RootDirectory);

        await File.WriteAllTextAsync(
            paths.StateFilePath,
            StateYamlSerializer.Serialize(workflowRun),
            Encoding.UTF8,
            cancellationToken);

        if (workflowRun.Branch is null)
        {
            if (File.Exists(paths.BranchFilePath))
            {
                File.Delete(paths.BranchFilePath);
            }

            return;
        }

        await File.WriteAllTextAsync(
            paths.BranchFilePath,
            BranchYamlSerializer.Serialize(workflowRun.UsId, workflowRun.Branch),
            Encoding.UTF8,
            cancellationToken);
    }

    public async Task<WorkflowRun> LoadAsync(string rootDirectory, CancellationToken cancellationToken = default)
    {
        var paths = new UserStoryFilePaths(rootDirectory);

        if (!File.Exists(paths.StateFilePath))
        {
            throw new FileNotFoundException("state.yaml was not found.", paths.StateFilePath);
        }

        var stateContent = await File.ReadAllTextAsync(paths.StateFilePath, cancellationToken);
        var stateDocument = StateYamlSerializer.Deserialize(stateContent);
        var workflowRun = new WorkflowRun(
            stateDocument.UsId,
            stateDocument.SourceHash,
            new WorkflowDefinition(stateDocument.WorkflowId));

        foreach (var approvedPhase in stateDocument.ApprovedPhases)
        {
            workflowRun.RestoreApproval(approvedPhase);
        }

        workflowRun.RestoreState(stateDocument.CurrentPhase, stateDocument.Status);

        if (File.Exists(paths.BranchFilePath))
        {
            var branchContent = await File.ReadAllTextAsync(paths.BranchFilePath, cancellationToken);
            var branch = BranchYamlSerializer.Deserialize(branchContent);
            workflowRun.RestoreBranch(branch);
        }

        return workflowRun;
    }
}
