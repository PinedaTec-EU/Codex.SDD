# SpecForge · Initial user story

This user story defines the product intent for SpecForge and references the SDD artifacts that make its scope concrete.

## Objective

Build a VS Code tool that governs AI-assisted SDD workflows with:

- repository persistence
- human checkpoints
- per-phase traceability
- controlled regression
- operational metrics

## Derived Artifacts

- [Product vision](./product-vision.md)
- [Target architecture](./architecture.md)
- [Initial domain model](./domain-model.md)
- [Implementation plan](./implementation-plan.md)

## User Story State

- State: `draft`
- Priority: `high`
- Type: `foundation`
- Primary source of truth: this `doc/` folder

## Current Working Decision

This user story no longer tries to describe everything in a single file. The work is split into:

1. product vision and value
2. architecture and component boundaries
3. minimum executable domain
4. incremental implementation plan

## Acceptance Criteria For This Definition

- Product vision is separated from the technical solution.
- Architecture defines explicit responsibilities and boundaries.
- The initial domain contains only the core needed for phase 1.
- The next plan prioritizes a canonical workflow before advanced customization.

## Notes

- Repository persistence remains a central principle.
- Workflow customization and parallel execution remain future capabilities, not mandatory phase-1 complexity.
