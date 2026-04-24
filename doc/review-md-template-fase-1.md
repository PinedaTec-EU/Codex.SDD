# SpecForge · `04-review.md` template phase 1

## Goal

Define the review template as the final validation artifact before human release approval.

## Principles

- it must be clear and actionable
- it must prioritize findings and verdict
- it must reference the user story, approved spec, design, and implementation
- it must derive its validation checklist from `02-technical-design.md` > `Validation Strategy`
- it must not hide residual risks

## Proposed Template

```md
# Review · US-0001 · v01

## State
- Result: `pass` | `fail`
- Based on:
  - `us.md`
  - `01-spec.md`
  - `02-technical-design.md`
  - `03-implementation.md`

## Summary
Short review conclusion.

## Validation Checklist
- ✅ Technical Design validation strategy item 1 — Evidence: concrete code, artifact, diff, or validation evidence.
- ❌ Technical Design validation strategy item 2 — Evidence: missing or insufficient evidence.

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
- every Technical Design `Validation Strategy` item must appear in `Validation Checklist`
- if `Validation Strategy` is missing, empty, or not reviewable, the review must fail
- if any checklist item is ❌, the review must fail
- if the review fails, the target regression phase must be clear
- if it passes, the jump to `release_approval` must be ready
