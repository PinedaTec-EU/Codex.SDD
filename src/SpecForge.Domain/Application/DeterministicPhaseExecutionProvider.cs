using SpecForge.Domain.Workflow;

namespace SpecForge.Domain.Application;

public sealed class DeterministicPhaseExecutionProvider : IPhaseExecutionProvider
{
    public PhaseExecutionReadiness GetPhaseExecutionReadiness(PhaseId phaseId) =>
        new(
            phaseId,
            CanExecute: true,
            RequiredPermissions: PhaseExecutionPermissionCatalog.Describe(phaseId),
            AssignedModelSecurity: new PhaseExecutionModelSecurity(
                "deterministic",
                "deterministic",
                "deterministic",
                "read-write",
                NativeCliRequired: false,
                NativeCliAvailable: true),
            ValidationMessage: "Phase permission precheck passed for the deterministic provider.");

    public async Task<AutoRefinementAnswersResult?> TryAutoAnswerRefinementAsync(
        PhaseExecutionContext context,
        RefinementSession session,
        CancellationToken cancellationToken = default)
    {
        if (session.Items.Count == 0)
        {
            return null;
        }

        var userStory = await File.ReadAllTextAsync(context.UserStoryPath, cancellationToken);
        var objective = MarkdownHelper.ReadSection(userStory, "## Objective", "## Objetivo");
        if (objective.Contains("sample", StringComparison.OrdinalIgnoreCase)
            || objective.Contains("...", StringComparison.Ordinal)
            || objective.Contains("todo", StringComparison.OrdinalIgnoreCase)
            || objective.Contains("tbd", StringComparison.OrdinalIgnoreCase))
        {
            return null;
        }

        var answers = session.Items
            .OrderBy(static item => item.Index)
            .Select(item => BuildDeterministicRefinementAnswer(item.Question, objective))
            .Cast<string?>()
            .ToArray();

        return new AutoRefinementAnswersResult(
            true,
            answers,
            "Deterministic provider inferred refinement answers from the current user story objective.",
            Execution: new PhaseExecutionMetadata("deterministic", "deterministic"));
    }

    public async Task<PhaseExecutionResult> ExecuteAsync(
        PhaseExecutionContext context,
        CancellationToken cancellationToken = default)
    {
        var content = context.PhaseId switch
        {
            PhaseId.Refinement => await ComposeRefinementAsync(context, cancellationToken),
            PhaseId.Spec => await ComposeSpecAsync(context, cancellationToken),
            PhaseId.TechnicalDesign => await ComposeTechnicalDesignAsync(context, cancellationToken),
            PhaseId.Implementation => await ComposeImplementationAsync(context, cancellationToken),
            PhaseId.Review => await ComposeReviewAsync(context, cancellationToken),
            PhaseId.ReleaseApproval => await ComposeReleaseApprovalAsync(context, cancellationToken),
            PhaseId.PrPreparation => await ComposePrPreparationAsync(context, cancellationToken),
            _ => throw new WorkflowDomainException($"Phase '{context.PhaseId}' has no materialized artifact.")
        };

        return new PhaseExecutionResult(
            content,
            ExecutionKind: "deterministic",
            Execution: new PhaseExecutionMetadata("deterministic", "deterministic"));
    }

    private static async Task<string> ComposeRefinementAsync(
        PhaseExecutionContext context,
        CancellationToken cancellationToken)
    {
        var userStory = await File.ReadAllTextAsync(context.UserStoryPath, cancellationToken);
        var objective = MarkdownHelper.ReadSection(userStory, "## Objective", "## Objetivo");
        var refinement = await ReadRefinementSessionAsync(context.UserStoryPath, cancellationToken);
        var hasAnswers = refinement is not null && refinement.Items.Any(item => !string.IsNullOrWhiteSpace(item.Answer));
        var looksPlaceholder = objective.Contains("sample", StringComparison.OrdinalIgnoreCase)
            || objective.Contains("...", StringComparison.Ordinal)
            || objective.Contains("todo", StringComparison.OrdinalIgnoreCase)
            || objective.Contains("tbd", StringComparison.OrdinalIgnoreCase);
        var isReady = !looksPlaceholder || hasAnswers;

        var questions = isReady
            ? []
            : new[]
            {
                "Which actor or role executes this functionality?",
                "What concrete inputs come in, and what observable result must come out?",
                "What business rule or acceptance criterion must be satisfied for this user story to be valid?"
            };

        return string.Join(
                   Environment.NewLine,
                   new[]
                   {
                       $"# Refinement · {context.UsId} · v01",
                       string.Empty,
                       "## State",
                       $"- State: `{(isReady ? "ready" : "pending_user_input")}`",
                       string.Empty,
                       "## Decision",
                       isReady ? "ready_for_spec" : "needs_refinement",
                       string.Empty,
                       "## Reason",
                       isReady
                           ? "The current user story plus recorded refinement answers are concrete enough to proceed to spec."
                           : "The current user story still reads like a placeholder and needs minimum business detail before spec can be useful.",
                       string.Empty,
                       "## Questions",
                       questions.Length == 0 ? "1. No refinement questions remain." : string.Join(Environment.NewLine, questions.Select((question, index) => $"{index + 1}. {question}"))
                   }) +
               Environment.NewLine;
    }

    private static string BuildDeterministicRefinementAnswer(string question, string objective)
    {
        if (question.Contains("actor", StringComparison.OrdinalIgnoreCase)
            || question.Contains("role", StringComparison.OrdinalIgnoreCase))
        {
            return $"The actor should be treated as the role implied by the current objective: {objective}";
        }

        if (question.Contains("input", StringComparison.OrdinalIgnoreCase)
            || question.Contains("output", StringComparison.OrdinalIgnoreCase)
            || question.Contains("result", StringComparison.OrdinalIgnoreCase))
        {
            return $"The observable behavior should stay bounded to this objective and its direct outcome: {objective}";
        }

        return $"Use the current objective as the governing refinement answer unless the repository later proves otherwise: {objective}";
    }

    private static async Task<string> ComposeSpecAsync(
        PhaseExecutionContext context,
        CancellationToken cancellationToken)
    {
        if (!string.IsNullOrWhiteSpace(context.CurrentArtifactPath) &&
            !string.IsNullOrWhiteSpace(context.OperationPrompt) &&
            File.Exists(context.CurrentArtifactPath))
        {
            var currentArtifact = await File.ReadAllTextAsync(context.CurrentArtifactPath, cancellationToken);
            return ApplyDeterministicArtifactOperation(
                SpecMarkdownImporter.Import(currentArtifact),
                context.UsId,
                context.OperationPrompt);
        }

        var userStory = await File.ReadAllTextAsync(context.UserStoryPath, cancellationToken);
        var title = MarkdownHelper.ReadHeading(userStory, fallback: context.UsId);
        var objective = MarkdownHelper.ReadSection(userStory, "## Objective", "## Objetivo");
        var initialScope = MarkdownHelper.TryReadSection(userStory, "## Initial Scope")
            ?? MarkdownHelper.TryReadSection(userStory, "## Alcance inicial");
        var ambiguity = string.IsNullOrWhiteSpace(initialScope)
            ? "The source does not yet distinguish clearly between in-scope behavior and deliberate exclusions."
            : "The source identifies baseline scope, but edge cases and non-functional expectations still need explicit validation.";

        return SpecJson.RenderMarkdown(
            new SpecDocument(
                Title: title,
                HistoryLog: [$"`{DateTimeOffset.UtcNow:O}` · Initial spec generated from `us.md`."],
                State: "pending_approval",
                BasedOn: "us.md",
                SpecSummary: $"User story `{title}` has been normalized into an executable baseline spec.",
                Inputs:
                [
                    "Source intent from `us.md`.",
                    "Refinement answers when available."
                ],
                Outputs:
                [
                    "A bounded implementation target for technical design.",
                    "Explicit acceptance criteria that can be validated later in review and tests."
                ],
                BusinessRules:
                [
                    $"The system must satisfy this objective: {objective}",
                    "The delivered behavior must stay within the approved scope and avoid silently expanding into roadmap work.",
                    "Repository changes must remain traceable to this spec and its downstream design."
                ],
                EdgeCases:
                [
                    "Missing repository context must be surfaced instead of guessed as settled fact.",
                    "Scope items that imply architectural expansion must be escalated before implementation."
                ],
                ErrorsAndFailureModes:
                [
                    "If the spec leaves business-critical ambiguity unresolved, technical design must stop and request refinement or regression.",
                    "If implementation cannot be validated against these criteria, review must fail and point to the correction phase."
                ],
                Constraints:
                [
                    "Keep the first implementation pass bounded to the current repository and workflow phase.",
                    "Treat external integrations, security policy changes, and cross-cutting architecture shifts as explicit decisions, not defaults."
                ],
                DetectedAmbiguities:
                [
                    ambiguity,
                    "Non-functional thresholds are not explicit unless the user story or refinement already makes them explicit."
                ],
                RedTeam:
                [
                    "The current request may still hide implicit assumptions around actor responsibilities or approval boundaries.",
                    "Missing explicit exclusions could expand the implementation scope beyond the approved phase.",
                    "Some acceptance expectations may still read as intent rather than as verifiable checks."
                ],
                BlueTeam:
                [
                    "Keep the approved scope constrained to the current workflow and visible persisted artifacts.",
                    "Translate assumptions into explicit criteria before implementation continues.",
                    "Use this spec as the operational baseline instead of returning to the raw user story."
                ],
                AcceptanceCriteria:
                [
                    "The implementation maps to the approved objective without inventing new business behavior.",
                    "Technical design can derive concrete component impact, contracts, and validation from this spec.",
                    "Review can verify whether the delivered change matches the approved scope and error handling expectations."
                ],
                HumanApprovalQuestions:
                [
                    new("Is the scope precise enough to avoid a second interpretation pass during technical design?", "pending", null, null, null),
                    new("Are any hidden business rules, exclusions, or edge cases still missing from the baseline?", "pending", null, null, null)
                ]),
            context.UsId,
            version: 1);
    }

    private static async Task<string> ComposeTechnicalDesignAsync(
        PhaseExecutionContext context,
        CancellationToken cancellationToken)
    {
        var spec = await File.ReadAllTextAsync(
            GetRequiredPath(context, PhaseId.Spec),
            cancellationToken);
        var specSummary = MarkdownHelper.ReadSection(spec, "## Spec Summary");
        var businessRules = MarkdownHelper.ReadSection(spec, "## Business Rules");
        var constraints = MarkdownHelper.ReadSection(spec, "## Constraints");

        return string.Join(
                   Environment.NewLine,
                   new[]
                   {
                       $"# Technical Design · {context.UsId} · v01",
                       string.Empty,
                       "## State",
                       "- State: `generated`",
                       "- Based on: `01-spec.md`",
                       string.Empty,
                       "## Technical Summary",
                       specSummary,
                       string.Empty,
                       "## Technical Objective",
                       businessRules,
                       string.Empty,
                       "## Affected Components",
                       "- Component impact to be derived from the approved spec and repository structure.",
                       "- Cross-cutting concerns (auth, persistence, API boundaries) must be identified before implementation starts.",
                       string.Empty,
                       "## Proposed Design",
                       "### Architecture",
                       "The extension delegates execution to a backend boundary, which routes to the application services and workflow runner.",
                       string.Empty,
                       "### Primary Flow",
                       "1. Load persisted user story state.",
                       "2. Validate the next allowed transition.",
                       "3. Generate or update the corresponding artifact.",
                       "4. Persist state, branch metadata, and timeline.",
                       string.Empty,
                       "### Constraints and Guardrails",
                       constraints,
                       string.Empty,
                       "## Implementation Strategy",
                       "1. Keep all workflow invariants in the domain core.",
                       "2. Use application services as the stable backend surface.",
                       "3. Let the extension consume the backend through explicit commands.",
                       string.Empty,
                       "## Validation Strategy",
                       "- Domain tests must validate transitions, approvals, regressions, and persisted state.",
                       "- Extension tests must keep user-facing workflow labels and affordances aligned with the updated flow.",
                       "- Review must compare implementation back to the approved spec before final release approval."
                   }) +
               Environment.NewLine;
    }

    private static async Task<string> ComposeImplementationAsync(
        PhaseExecutionContext context,
        CancellationToken cancellationToken)
    {
        var technicalDesign = await File.ReadAllTextAsync(
            GetRequiredPath(context, PhaseId.TechnicalDesign),
            cancellationToken);
        var objective = MarkdownHelper.ReadSection(technicalDesign, "## Technical Objective", "## Objetivo técnico");

        return string.Join(
                   Environment.NewLine,
                   new[]
                   {
                       $"# Implementation · {context.UsId} · v01",
                       string.Empty,
                       "## State",
                       "- State: `generated`",
                       "- Based on: `02-technical-design.md`",
                       string.Empty,
                       "## Implemented Objective",
                       objective,
                       string.Empty,
                       "## Planned or Executed Changes",
                       "- Update workflow orchestration logic.",
                       "- Persist resulting state and derived artifacts.",
                       "- Expose the action through the selected backend boundary.",
                       string.Empty,
                       "## Planned Verification",
                       "- Domain tests must cover the transition and persistence path.",
                       "- Extension feedback must reflect the generated artifact and new phase."
                   }) +
               Environment.NewLine;
    }

    private static Task<string> ComposeReviewAsync(
        PhaseExecutionContext context,
        CancellationToken cancellationToken)
    {
        var specExists = context.PreviousArtifactPaths.ContainsKey(PhaseId.Spec);
        var technicalDesignExists = context.PreviousArtifactPaths.ContainsKey(PhaseId.TechnicalDesign);
        var implementationExists = context.PreviousArtifactPaths.ContainsKey(PhaseId.Implementation);
        var result = specExists && technicalDesignExists && implementationExists ? "pass" : "fail";
        var recommendation = result == "pass"
            ? "Advance to `release_approval`."
            : "Regress to the missing or inconsistent phase before continuing.";

        return Task.FromResult(string.Join(
                   Environment.NewLine,
                   new[]
                   {
                       $"# Review · {context.UsId} · v01",
                       string.Empty,
                       "## State",
                       $"- Result: `{result}`",
                       string.Empty,
                       "## Validation Checklist",
                       $"- \u2705 Review must compare implementation back to the approved spec before final release approval. \u2014 Evidence: Spec artifact present: `{specExists}`; technical design artifact present: `{technicalDesignExists}`; implementation artifact present: `{implementationExists}`.",
                       string.Empty,
                       "## Findings",
                       result == "pass"
                           ? "- No blocking findings in deterministic review."
                           : "- Required workflow artifacts are incomplete.",
                       string.Empty,
                       "## Verdict",
                       $"- Final result: `{result}`",
                       $"- Primary reason: the workflow artifacts required for review are {(result == "pass" ? "present" : "incomplete")}.",
                       string.Empty,
                       "## Recommendation",
                       $"- {recommendation}"
                   }) +
               Environment.NewLine);
    }

    private static async Task<string> ComposeReleaseApprovalAsync(
        PhaseExecutionContext context,
        CancellationToken cancellationToken)
    {
        var review = await File.ReadAllTextAsync(GetRequiredPath(context, PhaseId.Review), cancellationToken);
        var reviewResult = MarkdownHelper.ReadSection(review, "## Verdict");

        return ReleaseApprovalArtifactJson.RenderMarkdown(
            new ReleaseApprovalArtifactDocument(
                State: "pending_approval",
                BasedOn: ["04-review.md", "03-implementation.md", "02-technical-design.md", "01-spec.md"],
                ReleaseSummary: "This release approval artifact summarizes the implemented scope, the review outcome, and the remaining decision surface before PR preparation.",
                ImplementedScope:
                [
                    "Implementation and review artifacts exist and can be traced back to the approved workflow.",
                    "The release checkpoint is evaluating whether the reviewed scope is acceptable for PR handoff."
                ],
                ValidationEvidence:
                [
                    $"Review verdict section captured: {reviewResult}",
                    "Workflow artifacts required by the deterministic provider are present."
                ],
                ResidualRisks:
                [
                    "Deterministic release approval does not inspect live repository diffs beyond the recorded workflow artifacts.",
                    "Any operational or rollout concern not captured during review must still be surfaced by the approving human."
                ],
                ApprovalChecklist:
                [
                    "Reviewed scope matches what should enter the PR",
                    "Validation evidence is credible enough for handoff",
                    "Known risks are acceptable or explicitly tracked"
                ],
                Recommendation: "Approve only if the review artifact and implementation evidence tell a consistent story with no missing release blockers."),
            context.UsId,
            version: 1);
    }

    private static Task<string> ComposePrPreparationAsync(
        PhaseExecutionContext context,
        CancellationToken cancellationToken)
        => Task.FromResult(PrPreparationArtifactJson.RenderMarkdown(
            PrPreparationArtifactFactory.Compose(context),
            context.UsId,
            version: 1));

    private static string GetRequiredPath(PhaseExecutionContext context, PhaseId phaseId)
    {
        if (!context.PreviousArtifactPaths.TryGetValue(phaseId, out var path))
        {
            throw new WorkflowDomainException($"Previous artifact for phase '{phaseId}' was not found.");
        }

        return path;
    }

    private static async Task<RefinementSession?> ReadRefinementSessionAsync(
        string userStoryPath,
        CancellationToken cancellationToken)
    {
        var refinementPath = Path.Combine(Path.GetDirectoryName(userStoryPath)!, "refinement.md");
        if (File.Exists(refinementPath))
        {
            var refinementMarkdown = await File.ReadAllTextAsync(refinementPath, cancellationToken);
            var session = UserStoryRefinementMarkdown.Parse(refinementMarkdown);
            if (session is not null)
            {
                return session;
            }
        }

        var userStoryMarkdown = await File.ReadAllTextAsync(userStoryPath, cancellationToken);
        return UserStoryRefinementMarkdown.Parse(userStoryMarkdown);
    }

    private static string ApplyDeterministicArtifactOperation(SpecDocument currentArtifact, string usId, string operationPrompt)
    {
        var summary = NormalizeOperationSummary(operationPrompt);
        var history = currentArtifact.HistoryLog.ToList();
        history.Insert(0, $"`{DateTimeOffset.UtcNow:O}` · Applied artifact operation: {summary}");
        return SpecJson.RenderMarkdown(currentArtifact with { HistoryLog = history }, usId, version: 1);
    }

    private static string NormalizeOperationSummary(string operationPrompt)
    {
        var singleLine = string.Join(" ", operationPrompt
            .Replace("\r\n", "\n", StringComparison.Ordinal)
            .Split('\n', StringSplitOptions.RemoveEmptyEntries)
            .Select(static line => line.Trim()));

        if (string.IsNullOrWhiteSpace(singleLine))
        {
            return "No summary provided.";
        }

        return singleLine.Length <= 180 ? singleLine : $"{singleLine[..177]}...";
    }
}
