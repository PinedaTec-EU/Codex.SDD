# SpecForge · `timeline.md` phase 1

## Goal

Define the `timeline.md` format as the human-readable chronological record of a user story lifecycle.

## Purpose

`timeline.md` does not replace `state.yaml`. Its role is to:

- leave an auditable and easy-to-read trail
- explain why the user story state changed
- record decisions, approvals, regressions, and interventions
- summarize relevant events without forcing inspection of multiple files

## Main Rule

`timeline.md` records facts and brief context.

It must not duplicate:

- the full current state from `state.yaml`
- full Git metadata from `branch.yaml`
- full contents of phase artifacts

It should reference those artifacts when needed.

## Location

```text
.specs/
  us/
    us.<us-id>/
      timeline.md
```

## Proposed Structure

```md
# Timeline · US-0001 · Create SDD foundation for SpecForge

## Summary

- Current status: `waiting_user`
- Current phase: `refinement`
- Active branch: `not created`
- Last updated: `2026-04-18T10:30:00Z`

## Events

### 2026-04-18T09:00:00Z · `us_created`

- Actor: `system`
- Phase: `capture`
- Summary: The user story was created from chat and `us.md` and `state.yaml` were initialized.
- Artifacts:
  - `.specs/us/us.US-0001/us.md`
  - `.specs/us/us.US-0001/state.yaml`

### 2026-04-18T09:04:00Z · `phase_started`

- Actor: `system`
- Phase: `refinement`
- Summary: Refinement generation started.

### 2026-04-18T09:06:00Z · `phase_completed`

- Actor: `system`
- Phase: `refinement`
- Summary: Refinement was generated with `red-team` evaluation and `blue-team` reconstruction.
- Artifacts:
  - `.specs/us/us.US-0001/phases/01-refinement.md`

### 2026-04-18T09:10:00Z · `phase_approved`

- Actor: `user`
- Phase: `refinement_approval`
- Summary: The user approved the refinement and chose `main` as the base branch.

### 2026-04-18T09:11:00Z · `branch_created`

- Actor: `system`
- Phase: `refinement_approval`
- Summary: The branch `feature/us-0001-specforge-foundation` was created.
- Artifacts:
  - `.specs/us/us.US-0001/branch.yaml`
```

## Sections

### Header

It must contain:

- `usId`
- the user story short title

### `Summary`

It should only reflect a quick view:

- current status
- current phase
- active branch or absence of a branch
- last-update timestamp

This section may be rewritten on each relevant change.

### `Events`

It must be append-only at the semantic level.

Each event is added at the end and represents a fact that already happened.

## Event Format

Each event must include:

- ISO-8601 UTC timestamp
- event code
- actor
- associated phase when applicable
- short summary

It may optionally include:

- reason
- evidence
- affected artifacts
- notes

## Minimum Phase-1 Events

- `us_created`
- `phase_started`
- `phase_completed`
- `phase_approved`
- `phase_regressed`
- `manual_intervention_registered`
- `review_passed`
- `review_failed`
- `source_hash_mismatch_detected`
- `branch_created`
- `us_blocked`
- `us_waiting_user`
- `us_restarted_from_source`
- `pr_preparation_requested`

## Writing Style

- short sentences
- factual language
- no long narrative
- do not copy artifact contents
- link by path when the detail lives in another file

## Update Rules

- create `timeline.md` during `capture`
- add one event for each relevant phase transition
- add one event for each approval, regression, or human intervention
- update `Summary` when global status, current phase, or active branch changes
- if an operation fails without changing state, only record an event if it adds audit value

## When Not To Record An Event

- internal rereads with no effect
- idempotent validations with no observable change
- low-level technical steps that do not change a human understanding of the flow

## Relationship With `state.yaml`

- `state.yaml` is the structured source of current state
- `timeline.md` is the readable source of operational history
- if they diverge, `state.yaml` wins

## Open Decisions

- whether the size of `Summary` should be limited
- whether repeated technical errors should be aggregated into a single entry
- whether an additional `events.yaml` will be needed later for finer analytics
