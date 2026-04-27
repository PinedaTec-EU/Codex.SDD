# SpecForge · `us.md` template phase 1

## Goal

Define the minimum `us.md` template as the stable source artifact for a user story.

## Principles

- it must be brief
- it must remain stable once `spec` starts
- it must not try to contain the spec or the technical design
- it must capture intent, initial scope, and known constraints

## Proposed Template

```md
# US-0001 · <short title>

## Metadata
- Kind: `feature` | `bug` | `hotfix`
- Category: `<repo-catalog-category>`

## State
- State: `draft`
- Priority: `high`
- Source: `chat` | `markdown-import`
- Created: `2026-04-18T10:00:00Z`

## Objective
Describe what value should be delivered and for whom.

## Problem
What current problem exists and why it deserves to be solved.

## Initial Scope
- Includes:
  - ...
- Excludes:
  - ...

## Known Constraints
- ...
- ...

## Initial Assumptions
- ...
- ...

## Initial Acceptance Criteria
- [ ] ...
- [ ] ...
- [ ] ...

## Additional Context
Notes, references, internal links, or known dependencies.
```

## Usage Notes

- `us.md` is the workflow entry point
- `Kind` controls the prefix of the future work branch
- `Category` controls the operational grouping of the user story in the UI
- once `spec` starts, its contents stop mutating the workflow automatically
- if it changes and the user wants to incorporate it, the user story must be restarted
