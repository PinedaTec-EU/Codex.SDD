using SpecForge.Domain.Workflow;

namespace SpecForge.Domain.Application;

public sealed class DeterministicPhaseExecutionProvider : IPhaseExecutionProvider
{
    public PhaseExecutionReadiness GetPhaseExecutionReadiness(PhaseId phaseId) =>
        new(phaseId, CanExecute: true);

    public async Task<AutoClarificationAnswersResult?> TryAutoAnswerClarificationAsync(
        PhaseExecutionContext context,
        ClarificationSession session,
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
            .Select(item => BuildDeterministicClarificationAnswer(item.Question, objective))
            .Cast<string?>()
            .ToArray();

        return new AutoClarificationAnswersResult(
            true,
            answers,
            "Deterministic provider inferred clarification answers from the current user story objective.",
            Execution: new PhaseExecutionMetadata("deterministic", "deterministic"));
    }

    public async Task<PhaseExecutionResult> ExecuteAsync(
        PhaseExecutionContext context,
        CancellationToken cancellationToken = default)
    {
        var content = context.PhaseId switch
        {
            PhaseId.Clarification => await ComposeClarificationAsync(context, cancellationToken),
            PhaseId.Refinement => await ComposeRefinementAsync(context, cancellationToken),
            PhaseId.TechnicalDesign => await ComposeTechnicalDesignAsync(context, cancellationToken),
            PhaseId.Implementation => await ComposeImplementationAsync(context, cancellationToken),
            PhaseId.Review => await ComposeReviewAsync(context, cancellationToken),
            _ => throw new WorkflowDomainException($"Phase '{context.PhaseId}' has no materialized artifact.")
        };

        return new PhaseExecutionResult(
            content,
            ExecutionKind: "deterministic",
            Execution: new PhaseExecutionMetadata("deterministic", "deterministic"));
    }

    private static async Task<string> ComposeClarificationAsync(
        PhaseExecutionContext context,
        CancellationToken cancellationToken)
    {
        var userStory = await File.ReadAllTextAsync(context.UserStoryPath, cancellationToken);
        var objective = MarkdownHelper.ReadSection(userStory, "## Objective", "## Objetivo");
        var clarification = await ReadClarificationSessionAsync(context.UserStoryPath, cancellationToken);
        var hasAnswers = clarification is not null && clarification.Items.Any(item => !string.IsNullOrWhiteSpace(item.Answer));
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
                       $"# Clarification · {context.UsId} · v01",
                       string.Empty,
                       "## State",
                       $"- State: `{(isReady ? "ready" : "pending_user_input")}`",
                       string.Empty,
                       "## Decision",
                       isReady ? "ready_for_refinement" : "needs_clarification",
                       string.Empty,
                       "## Reason",
                       isReady
                           ? "The current user story plus recorded clarification answers are concrete enough to proceed to refinement."
                           : "The current user story still reads like a placeholder and needs minimum business detail before refinement can be useful.",
                       string.Empty,
                       "## Questions",
                       questions.Length == 0 ? "1. No clarification questions remain." : string.Join(Environment.NewLine, questions.Select((question, index) => $"{index + 1}. {question}"))
                   }) +
               Environment.NewLine;
    }

    private static string BuildDeterministicClarificationAnswer(string question, string objective)
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

        return $"Use the current objective as the governing clarification answer unless the repository later proves otherwise: {objective}";
    }

    private static async Task<string> ComposeRefinementAsync(
        PhaseExecutionContext context,
        CancellationToken cancellationToken)
    {
        if (!string.IsNullOrWhiteSpace(context.CurrentArtifactPath) &&
            !string.IsNullOrWhiteSpace(context.OperationPrompt) &&
            File.Exists(context.CurrentArtifactPath))
        {
            var currentArtifact = await File.ReadAllTextAsync(context.CurrentArtifactPath, cancellationToken);
            return ApplyDeterministicArtifactOperation(
                RefinementSpecMarkdownImporter.Import(currentArtifact),
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

        return RefinementSpecJson.Serialize(
            new RefinementSpecDocument(
                Title: title,
                HistoryLog: [$"`{DateTimeOffset.UtcNow:O}` · Initial spec generated from `us.md`."],
                State: "pending_approval",
                BasedOn: "us.md",
                SpecSummary: $"User story `{title}` has been normalized into an executable baseline spec.",
                Inputs:
                [
                    "Source intent from `us.md`.",
                    "Clarification answers when available."
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
                    "If the spec leaves business-critical ambiguity unresolved, technical design must stop and request clarification or regression.",
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
                    "Non-functional thresholds are not explicit unless the user story or clarification already makes them explicit."
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
                ]));
    }

    private static async Task<string> ComposeTechnicalDesignAsync(
        PhaseExecutionContext context,
        CancellationToken cancellationToken)
    {
        var refinement = await File.ReadAllTextAsync(
            GetRequiredPath(context, PhaseId.Refinement),
            cancellationToken);
        var specSummary = MarkdownHelper.ReadSection(refinement, "## Spec Summary");
        var businessRules = MarkdownHelper.ReadSection(refinement, "## Business Rules");
        var constraints = MarkdownHelper.ReadSection(refinement, "## Constraints");

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
        var refinementExists = context.PreviousArtifactPaths.ContainsKey(PhaseId.Refinement);
        var technicalDesignExists = context.PreviousArtifactPaths.ContainsKey(PhaseId.TechnicalDesign);
        var implementationExists = context.PreviousArtifactPaths.ContainsKey(PhaseId.Implementation);
        var result = refinementExists && technicalDesignExists && implementationExists ? "pass" : "fail";
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
                       "## Checks Performed",
                       $"- [x] Spec artifact present: `{refinementExists}`",
                       $"- [x] Technical design artifact present: `{technicalDesignExists}`",
                       $"- [x] Implementation artifact present: `{implementationExists}`",
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

    private static string GetRequiredPath(PhaseExecutionContext context, PhaseId phaseId)
    {
        if (!context.PreviousArtifactPaths.TryGetValue(phaseId, out var path))
        {
            throw new WorkflowDomainException($"Previous artifact for phase '{phaseId}' was not found.");
        }

        return path;
    }

    private static async Task<ClarificationSession?> ReadClarificationSessionAsync(
        string userStoryPath,
        CancellationToken cancellationToken)
    {
        var clarificationPath = Path.Combine(Path.GetDirectoryName(userStoryPath)!, "clarification.md");
        if (File.Exists(clarificationPath))
        {
            var clarificationMarkdown = await File.ReadAllTextAsync(clarificationPath, cancellationToken);
            var session = UserStoryClarificationMarkdown.Parse(clarificationMarkdown);
            if (session is not null)
            {
                return session;
            }
        }

        var userStoryMarkdown = await File.ReadAllTextAsync(userStoryPath, cancellationToken);
        return UserStoryClarificationMarkdown.Parse(userStoryMarkdown);
    }

    private static string ApplyDeterministicArtifactOperation(RefinementSpecDocument currentArtifact, string operationPrompt)
    {
        var summary = NormalizeOperationSummary(operationPrompt);
        var history = currentArtifact.HistoryLog.ToList();
        history.Insert(0, $"`{DateTimeOffset.UtcNow:O}` · Applied artifact operation: {summary}");
        return RefinementSpecJson.Serialize(currentArtifact with { HistoryLog = history });
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
