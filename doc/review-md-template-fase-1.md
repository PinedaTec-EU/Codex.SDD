# SpecForge · `04-review.md` template phase 1

## Goal

Define the review template as the final validation artifact before human release approval.

## Principles

- it must be clear and actionable
- it must prioritize findings and verdict
- it must reference the user story, refinement, design, and implementation
- it must not hide residual risks

## Proposed Template

```md
# Review · US-0001 · v01

## State
- Result: `pass` | `fail`
- Based on:
  - `us.md`
  - `01-refinement.md`
  - `02-technical-design.md`
  - `03-implementation.md`

## Summary
Short review conclusion.

## Checks Performed
- [ ] Matches the user story
- [ ] Matches the refinement
- [ ] Respects the technical design
- [ ] Respects repository constraints
- [ ] Has sufficient validation

## Findings
### Finding 1
- Severity: `high` | `medium` | `low`
- Type: `functional` | `technical` | `process`
- Description: ...
- Evidence: ...
- Target correction phase: `refinement` | `technical_design` | `implementation`

### Finding 2
- Severity: ...
- Type: ...
- Description: ...
- Evidence: ...
- Target correction phase: ...

## Residual Risks
- ...
- ...

## Verdict
- Final result: `pass` | `fail`
- Primary reason: ...

## Recommendation
- If `pass`: advance to `release_approval`
- If `fail`: regress to `<phase>`
```

## Usage Notes

- findings must be structured and unambiguous
- if the review fails, the target regression phase must be clear
- if it passes, the jump to `release_approval` must be ready
