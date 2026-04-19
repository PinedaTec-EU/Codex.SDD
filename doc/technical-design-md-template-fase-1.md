# SpecForge · `02-technical-design.md` template phase 1

## Goal

Define the minimum technical design template that serves as the direct input to implementation.

## Principles

- it must be practical and executable
- it must identify real impact on components
- it must document alternatives, risks, and validation strategy
- it must not turn into an academic document

## Proposed Template

```md
# Technical Design · US-0001 · v01

## State
- State: `pending_approval`
- Based on: `01-refinement.md`

## Technical Summary
What solution is being proposed and why.

## Technical Objective
What must change in the system to satisfy the approved refinement.

## Affected Components
- ...
- ...
- ...

## Proposed Design
### Architecture
Describe pieces, responsibilities, and boundaries.

### Primary Flow
1. ...
2. ...
3. ...

### Persistence
- ...
- ...

### Contracts and Interfaces
- ...
- ...

## Alternatives Considered
- Option A:
  - Pros:
  - Cons:
- Option B:
  - Pros:
  - Cons:

## Technical Risks
- ...
- ...

## Expected Impact
- Code:
  - ...
- Documentation:
  - ...
- Tests:
  - ...

## Implementation Strategy
1. ...
2. ...
3. ...

## Validation Strategy
- Unit tests:
  - ...
- Integration tests:
  - ...
- Manual validation:
  - ...

## Open Decisions
- ...
- ...

## Required Approval
- [ ] Design validated for implementation
```

## Usage Notes

- if the phase is redone after a regression, a new version must be generated
- the output must enable implementation without reinterpreting basic functionality
