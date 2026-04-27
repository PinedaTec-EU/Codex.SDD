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
            [paths.RefinementExecuteSystemPromptPath] = BuildRefinementExecuteSystemPrompt(),
            [paths.RefinementExecutePromptPath] = BuildRefinementExecutePrompt(),
            [paths.SpecExecuteSystemPromptPath] = BuildSpecExecuteSystemPrompt(),
            [paths.SpecExecutePromptPath] = BuildSpecExecutePrompt(),
            [paths.SpecApproveSystemPromptPath] = BuildSpecApproveSystemPrompt(),
            [paths.SpecApprovePromptPath] = BuildSpecApprovePrompt(),
            [paths.TechnicalDesignExecuteSystemPromptPath] = BuildTechnicalDesignExecuteSystemPrompt(),
            [paths.TechnicalDesignExecutePromptPath] = BuildTechnicalDesignExecutePrompt(),
            [paths.ImplementationExecuteSystemPromptPath] = BuildImplementationExecuteSystemPrompt(),
            [paths.ImplementationExecutePromptPath] = BuildImplementationExecutePrompt(),
            [paths.ReviewExecuteSystemPromptPath] = BuildReviewExecuteSystemPrompt(),
            [paths.ReviewExecutePromptPath] = BuildReviewExecutePrompt(),
            [paths.ReleaseApprovalExecuteSystemPromptPath] = BuildReleaseApprovalExecuteSystemPrompt(),
            [paths.ReleaseApprovalExecutePromptPath] = BuildReleaseApprovalExecutePrompt(),
            [paths.ReleaseApprovalApproveSystemPromptPath] = BuildReleaseApprovalApproveSystemPrompt(),
            [paths.ReleaseApprovalApprovePromptPath] = BuildReleaseApprovalApprovePrompt(),
            [paths.PrPreparationExecuteSystemPromptPath] = BuildPrPreparationExecuteSystemPrompt(),
            [paths.PrPreparationExecutePromptPath] = BuildPrPreparationExecutePrompt(),
            [paths.AutoRefinementAnswersSystemPromptPath] = BuildAutoRefinementAnswersSystemPrompt()
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

        if (File.Exists(paths.PromptSystemHashesPath) && !overwrite)
        {
            skippedFiles.Add(paths.PromptSystemHashesPath);
        }
        else
        {
            await PromptSystemHashManifest.WriteAsync(paths, cancellationToken);
            createdFiles.Add(paths.PromptSystemHashesPath);
        }

        return new InitializeRepoPromptsResult(
            workspaceRoot,
            paths.ConfigFilePath,
            paths.PromptManifestPath,
            paths.PromptSystemHashesPath,
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
        phases:
          refinement:
            execute:
              system: .specs/prompts/phases/refinement.execute.system.md
              user: .specs/prompts/phases/refinement.execute.md
          spec:
            execute:
              system: .specs/prompts/phases/spec.execute.system.md
              user: .specs/prompts/phases/spec.execute.md
            approve:
              system: .specs/prompts/phases/spec.approve.system.md
              user: .specs/prompts/phases/spec.approve.md
          technical_design:
            execute:
              system: .specs/prompts/phases/technical-design.execute.system.md
              user: .specs/prompts/phases/technical-design.execute.md
          implementation:
            execute:
              system: .specs/prompts/phases/implementation.execute.system.md
              user: .specs/prompts/phases/implementation.execute.md
          review:
            execute:
              system: .specs/prompts/phases/review.execute.system.md
              user: .specs/prompts/phases/review.execute.md
          release_approval:
            execute:
              system: .specs/prompts/phases/release-approval.execute.system.md
              user: .specs/prompts/phases/release-approval.execute.md
            approve:
              system: .specs/prompts/phases/release-approval.approve.system.md
              user: .specs/prompts/phases/release-approval.approve.md
          pr_preparation:
            execute:
              system: .specs/prompts/phases/pr-preparation.execute.system.md
              user: .specs/prompts/phases/pr-preparation.execute.md
        internalCalls:
          autoRefinementAnswers:
            system: .specs/prompts/phases/refinement.auto-answer.system.md
        """;

    private static string BuildSharedSystemPrompt() =>
        """
        You are SpecForge's phase execution engine for this repository.

        Act strictly within the requested phase contract.
        Return structured JSON that conforms to the response schema supplied by the caller.
        Human-facing markdown is rendered later from the validated JSON.
        Do not invent missing repository facts.
        """;

    private static string BuildRefinementExecuteSystemPrompt() =>
        """
        This is the system prompt for the refinement execute template.

        Diagnose readiness for spec conservatively and keep every unresolved gap explicit.
        Ask only concrete blocking questions, and never invent answers that were not provided by the repository context.
        """;

    private static string BuildSpecExecuteSystemPrompt() =>
        """
        This is the system prompt for the spec execute template.

        Convert the story into an auditable, implementation-ready specification.
        Keep section completeness and schema fidelity above narrative style, and do not hide missing business facts.
        """;

    private static string BuildSpecApproveSystemPrompt() =>
        """
        This is the system prompt for the spec approve template.

        Evaluate readiness for technical design strictly against ambiguity, hidden scope, and unanswered approval questions.
        Preserve blocking issues explicitly rather than softening them.
        """;

    private static string BuildTechnicalDesignExecuteSystemPrompt() =>
        """
        This is the system prompt for the technical design execute template.

        Produce a repository-grounded design that is implementable in the current codebase.
        Prefer concrete component impact, validation strategy, and delivery sequencing over generic architecture prose.
        """;

    private static string BuildImplementationExecuteSystemPrompt() =>
        """
        This is the system prompt for the implementation execute template.

        Focus on repository-realistic implementation work, preserving traceability back to the approved design and spec.
        Do not substitute planning text for actual implementation evidence.
        The implementation artifact must remain auditable from repository evidence, touched files, and validation actually performed.
        """;

    private static string BuildReviewExecuteSystemPrompt() =>
        """
        This is the system prompt for the review execute template.

        Review against the approved artifacts and repository evidence.
        Surface material findings, missing validation, and release risks without inventing work that was not inspected.
        Never pass review when implementation evidence is missing, empty, or disconnected from the repository delta under review.
        Review must validate every item listed in the Technical Design `Validation Strategy`.
        The review artifact must contain a `validationChecklist` entry for each Technical Design validation strategy item, marked `pass` only when there is concrete code, artifact, or validation evidence.
        If the Technical Design validation strategy is missing, empty, or cannot be inspected, the review result must be `fail`.
        """;

    private static string BuildReleaseApprovalApproveSystemPrompt() =>
        """
        This is the system prompt for the release approval approve template.

        Judge release readiness from evidence, operational risk, and unresolved findings.
        Do not approve when the evidence is incomplete or materially contradictory.
        """;

    private static string BuildReleaseApprovalExecuteSystemPrompt() =>
        """
        This is the system prompt for the release approval execute template.

        Produce a final release-readiness brief from repository evidence and prior workflow artifacts.
        Summarize only what can be grounded in the user story, implementation evidence, review result, and recorded workflow outputs.
        Do not fabricate validations, changed files, or merged scope.
        """;

    private static string BuildPrPreparationExecuteSystemPrompt() =>
        """
        This is the system prompt for the PR preparation execute template.

        Produce a complete pull-request handoff artifact that another engineer could use directly.
        Keep it repository-grounded, explicit about validation and risk, and detailed enough to survive async review.
        Never leave required sections empty or placeholder-only.
        The final artifact must be publishable as a draft PR without manual reconstruction.
        """;

    private static string BuildAutoRefinementAnswersSystemPrompt() =>
        """
        This is the system prompt for the internal auto refinement answer task.

        Resolve pending refinement questions only from grounded repository evidence.
        Return resolvable answers only when the provided context supports them directly enough to retry refinement without user input.
        If the evidence is insufficient, preserve uncertainty explicitly instead of guessing.
        """;

    private static string BuildSharedStylePrompt() =>
        """
        Write in English unless the repository artifacts are already in another language.
        Keep string fields concise, technical, and directly usable in rendered artifacts.
        Avoid filler, motivational language, and broad product marketing phrasing.
        """;

    private static string BuildSharedOutputRulesPrompt() =>
        """
        Return only JSON that conforms to the response schema supplied by the caller.
        Do not wrap the response in code fences.
        Do not return prose outside the structured payload.
        Preserve the expected semantic fields of the target artifact.
        If required context is missing or contradictory, state it explicitly inside the structured payload instead of hiding the issue.
        """;

    private static string BuildRefinementExecutePrompt() =>
        """
        Role: refinement analyst.

        Goal:
        - inspect `us.md` and decide whether the story is ready for spec
        - if it is not ready, ask only the minimum concrete questions needed
        - if it is ready, say so explicitly and avoid inventing new questions

        Required sections:
        - State
        - Decision
        - Reason
        - Questions

        Decision rules:
        - use `ready_for_spec` when the story is concrete enough to produce a meaningful spec
        - use `needs_refinement` when actors, business behavior, inputs, outputs, rules, or acceptance intent are too vague
        - if there are already answers in `refinement.md`, use them as first-class context
        - keep the questions concrete and answerable by the user inside the extension
        """;

    private static string BuildSpecExecutePrompt() =>
        """
        Role: spec analyst.

        Goal:
        - transform `us.md` into a formalized `01-spec.md`
        - force a practical spec instead of narrative-only spec
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

    private static string BuildSpecApprovePrompt() =>
        """
        Role: approval assistant for spec.

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
        - make the implementation artifact auditable for the next phase by naming the repository evidence, touched files, and validations that actually happened
        - if the phase produced no repository delta, say so explicitly instead of fabricating an execution narrative
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
        - inspect the implementation evidence produced by the previous phase, not only the narrative artifact
        - if implementation evidence shows zero touched files, the review must fail and explain why the user story cannot be considered implemented
        - derive the Validation Checklist from the Technical Design `Validation Strategy`; use one checklist item per validation strategy bullet
        - never return `pass` if the Validation Checklist is missing, empty, incomplete, or contains any failed item
        Behave as reviewer, not as author.
        """;

    private static string BuildReleaseApprovalApprovePrompt() =>
        """
        Role: release approval assistant.

        Goal:
        - summarize readiness, residual risks, and what the user is being asked to approve
        - help the final human checkpoint before PR preparation
        """;

    private static string BuildReleaseApprovalExecutePrompt() =>
        """
        Role: release readiness summarizer.

        Goal:
        - synthesize the approved scope, implementation evidence, and review outcome
        - prepare a concise but complete brief for the human release checkpoint
        - make explicit what was validated, what remains risky, and what is being approved

        Required sections:
        - State
        - Based On
        - Release Summary
        - Implemented Scope
        - Validation Evidence
        - Residual Risks
        - Approval Checklist
        - Recommendation
        """;

    private static string BuildPrPreparationExecutePrompt() =>
        """
        Role: pull request preparation assistant.

        Goal:
        - prepare a complete PR handoff from the approved workflow artifacts
        - summarize the delivered scope, validation, risks, and reviewer guidance
        - produce a PR body that is detailed enough to publish with minimal manual rewriting

        Required sections:
        - State
        - Based On
        - PR Title
        - PR Summary
        - Branch Summary
        - Participants
        - Change Narrative
        - Validation Summary
        - Reviewer Checklist
        - Risks and Follow Ups
        - PR Body

        Output rules:
        - return only structured JSON that conforms to the response schema supplied by the caller
        - do not return markdown outside the structured payload
        - do not leave required fields empty
        - do not use placeholder-only values such as `...`, `TODO`, or empty bullet lists
        - every list-valued field in this phase must be a JSON array of strings
        - `PR Title` must be directly usable for a draft PR
        - `PR Summary` must describe the delivered scope concretely
        - `PR Body` must be a JSON array of strings, with one markdown line per array item
        - `PR Body` must be complete reviewer-ready markdown, not a template stub
        """;
}
