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
            [paths.ClarificationExecutePromptPath] = BuildClarificationExecutePrompt(),
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
        categories:
          - workflow
          - ux
          - prompts
          - mcp
          - providers
          - branching
          - review
          - integrations
          - infra
        """;

    private static string BuildPromptManifestYaml() =>
        """
        version: 1
        shared:
          system: .specs/prompts/shared/system.md
          style: .specs/prompts/shared/style.md
          outputRules: .specs/prompts/shared/output-rules.md
        phases:
          clarification:
            execute: .specs/prompts/phases/clarification.execute.md
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
        Write in English unless the repository artifacts are already in another language.
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

    private static string BuildClarificationExecutePrompt() =>
        """
        Role: clarification analyst.

        Goal:
        - inspect `us.md` and decide whether the story is ready for refinement
        - if it is not ready, ask only the minimum concrete questions needed
        - if it is ready, say so explicitly and avoid inventing new questions

        Required sections:
        - State
        - Decision
        - Reason
        - Questions

        Decision rules:
        - use `ready_for_refinement` when the story is concrete enough to produce a meaningful refinement
        - use `needs_clarification` when actors, business behavior, inputs, outputs, rules, or acceptance intent are too vague
        - if there are already answers in the clarification log inside `us.md`, use them as first-class context
        - keep the questions concrete and answerable by the user inside the extension
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
        - State
        - Executive Summary
        - Refined Objective
        - Refined Scope
        - Functional Rules
        - Constraints
        - Detected Ambiguities
        - Red Team
        - Blue Team
        - Refined Acceptance Criteria
        - Human Approval Questions
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
        - State
        - Technical Summary
        - Technical Objective
        - Affected Components
        - Proposed Design
        - Alternatives Considered
        - Technical Risks
        - Expected Impact
        - Implementation Strategy
        - Validation Strategy
        - Open Decisions
        - Required Approval
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
