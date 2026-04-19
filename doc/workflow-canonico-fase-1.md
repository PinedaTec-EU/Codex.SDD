# SpecForge · Canonical workflow phase 1

## Goal

Define the minimum governable and usable flow that justifies the existence of SpecForge before introducing advanced customization.

## Phase-1 Scope

Includes:

- creation or import of a user story
- sequential execution of core phases
- explicit human checkpoints
- regression from review to an allowed previous phase
- persistence of artifacts and minimum state
- creation of the work branch after the first approved refinement

Does not include:

- visual workflow editing
- intra-user-story parallelization
- real PR integration
- real issue integration
- advanced multi-agent assignment per phase

## Workflow Phases

### 1. `capture`

Purpose:

- register the initial user story and create its base context

Input:

- free text from chat or imported markdown

Output:

- `us.md`
- minimum user-story metadata

Definition of Done:

- stable user-story identity exists
- primary artifact exists and is persisted
- the workflow is initialized
- the initial source-content hash is recorded

Checkpoint:

- not required

### 2. `refinement`

Purpose:

- turn the initial intent into a more precise functional specification
- subject the proposal to structured criticism before fixing the final refinement

Input:

- `us.md`
- additional user context when available

Output:

- `phases/01-refinement.md`

Definition of Done:

- goals, scope, and constraints are explicit
- ambiguities and assumptions are identified
- a `red-team` evaluation exists
- a `blue-team` reconstruction over relevant findings exists
- the output enables design without inventing critical requirements

Checkpoint:

- mandatory human approval

Operational Notes:

- once this phase starts, `us.md` stops being a mutable source of truth for the running workflow
- the system must compare the source-content hash to detect later manual changes
- if the user story changes after `refinement` starts, those changes are not incorporated automatically
- if the user wants to restart from the new user story, the system must clean already-processed derived work and reinitialize the flow
- every agent modification to the refinement file must add a `history log` block at the top with date and a short multiline summary

### 3. `refinement_approval`

Purpose:

- fix the approved refinement as the operational baseline of the user story
- create the work branch that isolates implementation

Input:

- `phases/01-refinement.md`
- user decision

Output:

- approved refinement
- work branch created from `main` or from the user-selected base branch

Definition of Done:

- explicit user approval exists
- a work branch exists and is associated with the user story
- the approved refinement is frozen as the baseline

Checkpoint:

- mandatory

### 4. `technical_design`

Purpose:

- define the technical solution and implementation boundaries

Input:

- approved refinement output
- repository constraints

Output:

- `phases/02-technical-design.md`

Definition of Done:

- affected components are identified
- implementation strategy is defined
- risks and open decisions are documented

Checkpoint:

- mandatory human approval

Operational Notes:

- if this phase was already approved or surpassed and must be regenerated because of a regression, a new version is created, for example `phases/02-technical-design.v02.md`
- the previous version remains preserved as history and stops being the active one

### 5. `implementation`

Purpose:

- execute repository changes according to the technical design

Input:

- approved technical design

Output:

- code changes
- implementation summary in `phases/03-implementation.md`

Definition of Done:

- the change implements the approved scope
- modified artifacts remain traceable
- a verifiable implementation result exists

Checkpoint:

- not required before review

Operational Notes:

- if this phase already produced a previous output and must be redone, a new file version is generated and the previous one is archived as inactive

### 6. `review`

Purpose:

- verify functional and technical compliance against previous artifacts

Input:

- user story
- approved refinement
- approved design
- implementation result

Output:

- `phases/04-review.md`
- structured findings when applicable

Definition of Done:

- an explicit `pass` or `fail` verdict exists
- if it fails, each finding points to a target correction phase

Checkpoint:

- mandatory when the result is `pass`

### 7. `release_approval`

Purpose:

- ask for final human confirmation before preparing the PR

Input:

- review with `pass` result
- current branch state

Output:

- final user approval or explicit block

Definition of Done:

- a final user decision exists
- the system knows whether it can move to PR preparation

Checkpoint:

- mandatory

### 8. `pr_preparation`

Purpose:

- prepare the PR from the work branch and the approved artifacts

Input:

- `release_approval` approval

Output:

- prepared PR metadata
- final change summary ready for publication

Definition of Done:

- a PR payload consistent with the user story and approved artifacts exists

Checkpoint:

- not required in phase 1 because real GitHub integration is still postponed

## Valid Transitions

- `capture -> refinement`
- `refinement -> refinement_approval`
- `refinement_approval -> technical_design`
- `technical_design -> implementation`
- `implementation -> review`
- `review -> release_approval`
- `release_approval -> pr_preparation`
- `pr_preparation -> completed`

## Valid Regressions

- `review -> refinement`
- `review -> technical_design`
- `review -> implementation`
- `release_approval -> refinement`
- `release_approval -> technical_design`
- `release_approval -> implementation`

## Operational Rules

- more than one phase cannot be in `running` state
- a phase with a mandatory checkpoint cannot advance without approval
- every regression must record reason and evidence
- every human intervention must be associated with a phase or checkpoint
- if a phase fails repeatedly without new information, the user story moves to `waiting_user`
- if a user story is already `completed` and the user wants to change `us.md`, `refinement`, or equivalent artifacts, the system should recommend creating a new user story
- `us.md` is the source of truth only to start the flow, not to silently mutate an already started execution

## Initial Escalation Policy

Escalate to the user when one of these conditions happens:

- critical ambiguity cannot be resolved with existing artifacts
- two consecutive regressions target the same phase for the same reason
- conflict between manual edits and generated output remains unreconciled
- a change is detected in `us.md` after `refinement` started

## Minimum Persistence Per User Story

Convention:

- `markdown` for work artifacts and human review
- `yaml` for state, configuration, and technical metadata
- `input.md` is not created by default if the phase input can be inferred from the previously approved baseline and active state
- an explicit input artifact is materialized only when needed to freeze a non-inferable snapshot or attach extraordinary context

Input resolution by phase:

- `refinement` takes `us.md`
- `technical_design` takes the approved active version of `01-refinement.md`
- `implementation` takes the approved active version of `02-technical-design*.md`
- `review` takes `us.md` and the active versions of `refinement`, `technical_design`, and `implementation`
- `release_approval` and `pr_preparation` take the active version of `04-review.md` and branch metadata

```text
.specs/
  us/
    us.<us-id>/
      us.md
      state.yaml
      timeline.md
      phases/
        01-refinement.md
        02-technical-design.md
        02-technical-design.v02.md
        03-implementation.md
        04-review.md
      branch.yaml
```

Location rule:

- each user story lives under `.specs/us/us.<us-id>/`
- this convention prioritizes visibility at the workspace root and clear separation from product code

## Minimum `state.yaml` State

```yaml
usId: US-0001
workflowId: canonical-v1
status: active
currentPhase: refinement
sourceHash: sha256:...
activeArtifacts:
  refinement: phases/01-refinement.md
  technicalDesign: phases/02-technical-design.md
  implementation: phases/03-implementation.md
  review: phases/04-review.md
approvedPhases:
  - refinement
phaseStates:
  refinement: waiting_user
  refinementApproval: pending
  technicalDesign: pending
  implementation: pending
  review: pending
  releaseApproval: pending
  prPreparation: pending
metrics:
  regressionCount: 0
  manualInterventionCount: 0
  reviewFailCount: 0
  reviewPassCount: 0
```

## Minimum Events

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

## Open Decisions

- whether `timeline` will remain markdown or also migrate to `yaml`
- whether `capture` should be modeled as a persisted phase or as workflow bootstrap
- whether review should incorporate automated validations in addition to agent analysis
