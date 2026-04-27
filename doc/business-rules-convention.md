# Business Rules Convention

## Goal

Keep workflow business rules centralized in the .NET domain/application layer so they are deterministic, reusable, and directly testable.

## Rule Of Thumb

- Backend owns workflow decisions.
- Frontend renders backend decisions.
- Markdown and YAML are artifacts, not decision engines.

## What Counts As A Business Rule

- whether a phase can continue
- whether a phase can be approved
- whether a question is resolved or unresolved
- whether a phase expects human intervention
- phase transition eligibility
- blocking reasons and approval gates

## Required Placement

- Canonical rule logic must live in `src/SpecForge.Domain/`.
- If the UI needs a rule outcome, the backend must expose it explicitly in the MCP DTO.
- Reusable rule helpers should be implemented once and consumed from there.

Examples:

- `WorkflowPresentation.ExpectsHumanIntervention(...)`
- `SpecJson.IsResolved(...)`
- `CurrentPhaseControls.CanApprove`
- `CurrentPhaseControls.BlockingReason`

## Forbidden Pattern

Do not recompute workflow state in `src-vscode/` from:

- markdown headings or checkbox syntax
- yaml values already interpreted by the backend
- phase-id heuristics when the backend can expose the canonical flag
- duplicated string checks such as `"resolved"` or `"waiting-user"` to rebuild domain meaning

The UI may still parse artifacts for preview-only rendering, but not to decide workflow behavior.

## Testing Rule

- Domain rules must have .NET tests.
- UI tests should verify rendering against canonical DTO fields, not reconstructed state from artifact text.

## Workflow Execution Entry Convention

- `play`, `continue`, `rerun`, direct phase replay, and future workflow execution triggers must pass through one execution entry point in `src-vscode/workflowPanel.ts`.
- That entry point owns the shared execution side effects:
  - choosing between autoplay and replay of the current phase;
  - focusing the graph/detail selection on the phase targeted by the action;
  - setting playback state and transient execution phase;
  - showing execution overlay and active graph state;
  - logging the execution request and blocked/no-op cases;
  - applying the same refresh path before and after execution.
- Individual command handlers must not duplicate this decision tree inline.
- If a new trigger needs different behavior, extend the centralized execution entry with explicit options instead of branching ad hoc in the caller.

## Workflow Action Focus Convention

- Phase and workflow actions must move the graph/detail focus to the phase they operate on before the operation runs.
- This includes `play`, `continue`, `rerun`, `approve`, `reject`, `rewind`, `regress`, and reset-like actions.
- Focus changes must go through shared helpers in `src-vscode/workflowPanel.ts`; command handlers must not manage `selectedPhaseId` ad hoc.

## Review Checklist

When adding or reviewing workflow features:

1. Is the decision already computed in the backend?
2. If not, should it be added to the workflow DTO instead of recomputed in the UI?
3. Is there a domain test proving the rule?
4. Is the frontend only consuming the canonical result?
