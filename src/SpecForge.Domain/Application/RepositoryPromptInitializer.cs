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
        Directory.CreateDirectory(paths.SystemPromptsDirectoryPath);
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
            [paths.PhaseExecutionSystemPromptPath] = BuildPhaseExecutionSystemPrompt(),
            [paths.AutoClarificationAnswersSystemPromptPath] = BuildAutoClarificationAnswersSystemPrompt(),
            [paths.ClarificationExecutePromptPath] = BuildClarificationExecutePrompt(),
            [paths.RefinementExecutePromptPath] = BuildRefinementExecutePrompt(),
            [paths.RefinementApprovePromptPath] = BuildRefinementApprovePrompt(),
            [paths.TechnicalDesignExecutePromptPath] = BuildTechnicalDesignExecutePrompt(),
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
        version: 2
        shared:
          system: .specs/prompts/shared/system.md
          style: .specs/prompts/shared/style.md
          outputRules: .specs/prompts/shared/output-rules.md
        systemCalls:
          phaseExecution: .specs/prompts/system/phase-execution.md
          autoClarificationAnswers: .specs/prompts/system/auto-clarification-answers.md
        phases:
          clarification:
            execute: .specs/prompts/phases/clarification.execute.md
          refinement:
            execute: .specs/prompts/phases/refinement.execute.md
            approve: .specs/prompts/phases/refinement.approve.md
          technical_design:
            execute: .specs/prompts/phases/technical-design.execute.md
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

    private static string BuildPhaseExecutionSystemPrompt() =>
        """
        This is a model-backed phase execution call.

        Treat repository prompt templates and runtime artifacts as the authoritative contract for the current run.
        Apply the current phase instructions exactly as provided in the user message.
        Never omit schema-critical sections or silently downgrade the requested phase contract.
        """;

    private static string BuildAutoClarificationAnswersSystemPrompt() =>
        """
        This is a model-backed auto clarification resolution call.

        Resolve pending clarification questions only from grounded repository evidence.
        Return resolvable answers only when the provided context supports them directly enough to retry clarification without user input.
        If the evidence is insufficient, preserve uncertainty explicitly instead of guessing.
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
        - if there are already answers in `clarification.md`, use them as first-class context
        - keep the questions concrete and answerable by the user inside the extension
        """;

    private static string BuildRefinementExecutePrompt() =>
        """
        Role: refinement analyst.

        Goal:
        - transform `us.md` into a formalized `01-spec.md`
        - force a practical spec instead of narrative-only refinement
        - include red-team criticism
        - include blue-team corrections
        - leave a concrete, reviewable spec that can anchor technical design

        Required sections:
        - History Log
        - State
        - Spec Summary
        - Inputs
        - Outputs
        - Business Rules
        - Edge Cases
        - Errors and Failure Modes
        - Constraints
        - Detected Ambiguities
        - Red Team
        - Blue Team
        - Acceptance Criteria
        - Human Approval Questions

        Schema rules:
        - every required section must exist exactly once with the same heading text
        - do not leave placeholder-only content such as `...`, `TODO`, or empty bullet lists in required sections
        - the resulting artifact must be approvable without inventing missing business facts later
        """;

    private static string BuildRefinementApprovePrompt() =>
        """
        Role: approval assistant for refinement.

        Goal:
        - evaluate whether the spec is precise enough for technical design
        - identify blocking ambiguities, hidden scope, or acceptance gaps
        - recommend approve or hold, but never mutate the user decision

        Approval guardrails:
        - approval must fail if required schema sections are missing
        - approval must fail if required sections still contain placeholder-only content
        """;

    private static string BuildTechnicalDesignExecutePrompt() =>
        """
        Role: technical designer.

        Goal:
        - derive a practical technical design from the approved spec
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
        """;

    private static string BuildImplementationExecutePrompt() =>
        """
        Role: implementation planner.

        Goal:
        - execute or describe the intended implementation delta for this phase
        - stay aligned with the approved spec and derived technical design
        - keep the output grounded in repository components and validation steps

        Execution guardrails:
        - if the assigned executor cannot read and write the repository, do not pretend implementation happened
        - fail closed when repository access, file edit capability, or validation execution is missing
        - never mark repository changes as executed unless they were actually performed against this workspace
        """;

    private static string BuildReviewExecutePrompt() =>
        """
        Role: critical reviewer.

        Goal:
        - compare user story, spec, technical design, and implementation outputs
        - identify deviations, risks, and missing validation
        - emit findings with clear severity and a pass or fail recommendation

        Review guardrails:
        - if the assigned reviewer cannot inspect repository artifacts or diffs, do not claim code review happened
        - fail closed when repository evidence is missing, inaccessible, or indirect
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
