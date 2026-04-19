# SpecForge · `01-refinement.md` template phase 1

## Goal

Define the refinement template as the consolidated functional artifact produced after `red-team` criticism and `blue-team` reconstruction.

## Principles

- it must contain the best operational version of the user story
- it must make ambiguities and risks explicit
- it must include a `history log` at the top when the agent modifies it
- it must clearly expose what still needs human approval

## Proposed Template

```md
# Refinement · US-0001 · v01

## History Log
- `2026-04-18T10:15:00Z` · Initial refinement creation.

## State
- State: `pending_approval`
- Based on: `us.md`

## Executive Summary
Condensed version of the refined user story.

## Refined Objective
What the system must achieve exactly when this user story is complete.

## Refined Scope
- Includes:
  - ...
- Excludes:
  - ...

## Functional Rules
- ...
- ...
- ...

## Constraints
- Technical:
  - ...
- Operational:
  - ...
- Process:
  - ...

## Detected Ambiguities
- ...
- ...

## Red Team
### Risks
- ...
- ...

### Objections
- ...
- ...

### Weak Points
- ...
- ...

## Blue Team
### Recommended Adjustments
- ...
- ...

### Reinforcing Decisions
- ...
- ...

### Consolidated Refinement
Explain how the proposal changes or improves after red-team and blue-team.

## Refined Acceptance Criteria
- [ ] ...
- [ ] ...
- [ ] ...

## Human Approval Questions
- ...
- ...
```

## Usage Notes

- this file becomes the functional baseline of the user story after approval
- if an approved version already existed and must be redone, it must be versioned
- the level of detail must be actionable, not narrative
