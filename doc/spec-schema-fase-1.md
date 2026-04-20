# SpecForge · `01-spec.md` schema phase 1

## Goal

Define the exact schema that the approved spec baseline must satisfy before the workflow can move into technical design.

## Why This Exists

- a user story is not a contract
- the refinement phase now produces the operational baseline spec
- approval should validate structure, not only rely on human goodwill

## Required Sections

The artifact must contain these headings exactly once:

1. `## History Log`
2. `## State`
3. `## Spec Summary`
4. `## Inputs`
5. `## Outputs`
6. `## Business Rules`
7. `## Edge Cases`
8. `## Errors and Failure Modes`
9. `## Constraints`
10. `## Detected Ambiguities`
11. `## Red Team`
12. `## Blue Team`
13. `## Acceptance Criteria`
14. `## Human Approval Questions`

## Approval Rules

- the spec cannot be approved if any required section is missing
- the spec cannot be approved if any required section contains placeholder-only content
- placeholder-only content includes values such as `...`, `TODO`, `TBD`, or empty checklist placeholders
- approval still remains human, but the system rejects structurally invalid artifacts before that approval is persisted

## Semantic Intent Per Section

### `History Log`

- records when the artifact was created or materially modified

### `State`

- identifies approval state and provenance from `us.md`

### `Spec Summary`

- short executable framing of what the change is really about

### `Inputs`

- concrete inputs, actors, triggers, or upstream context

### `Outputs`

- concrete outcomes, observables, or produced effects

### `Business Rules`

- rules that must remain true in the delivered behavior

### `Edge Cases`

- non-happy-path conditions that materially affect correctness

### `Errors and Failure Modes`

- expected invalid states, rejection paths, or failure handling

### `Constraints`

- technical, operational, process, and scope guardrails

### `Detected Ambiguities`

- unresolved points that must remain visible instead of being invented away

### `Red Team`

- criticism of weak assumptions, hidden scope, or fragility

### `Blue Team`

- reconstruction of a stronger, bounded baseline after criticism

### `Acceptance Criteria`

- verifiable conditions that review and tests can map to later

### `Human Approval Questions`

- the short questions the approver should answer before freezing the baseline

## Example Skeleton

```md
# Spec · US-0001 · v01

## History Log
- `2026-04-20T10:15:00Z` · Initial spec creation.

## State
- State: `pending_approval`
- Based on: `us.md`

## Spec Summary
...

## Inputs
- ...

## Outputs
- ...

## Business Rules
- ...

## Edge Cases
- ...

## Errors and Failure Modes
- ...

## Constraints
- ...

## Detected Ambiguities
- ...

## Red Team
- ...

## Blue Team
- ...

## Acceptance Criteria
- [ ] ...

## Human Approval Questions
- ...
```

## Phase-1 Runtime Enforcement

- the approval path validates this schema before approving `refinement`
- if validation fails, the workflow stays on `refinement`
- the failure message must identify missing or placeholder-only sections
