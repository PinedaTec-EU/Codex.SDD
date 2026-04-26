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
- creation of the work branch after the first approved spec baseline

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

Operational Notes:

- `capture` is persisted as the initial state in `state.yaml`, but it does not produce a dedicated phase artifact
- the next linear transition from `capture` is always `clarification`

### 2. `clarification`

Purpose:

- determine whether the source user story is specific enough to enter refinement
- persist open questions and human answers without mutating `us.md`

Input:

- `us.md`
- current clarification tolerance
- attached `context files` when available
- attached `user story info` files for operator context

Output:

- `clarification.md`
- `phases/00-clarification.md` when a clarification artifact is generated for the workflow phase

Definition of Done:

- either the clarification log contains the required questions and answers
- or the workflow can prove that no additional clarification is needed and advance directly to refinement semantics

Checkpoint:

- no formal approval gate, but the workflow may stop in `waiting-user` until all clarification answers are present

Operational Notes:

- `clarification` is a first-class persisted phase in the canonical workflow
- `clarification.md` accumulates the question and answer log across iterations
- `us.md` remains the stable source artifact and is not rewritten on each clarification round
- only files classified as `context` are injected into model-backed runtime context by default

### 3. `refinement`

Purpose:

- turn the initial intent into an approved baseline spec
- subject the proposal to structured criticism before fixing the final operational artifact

Input:

- `us.md`
- additional user context when available
- optional model-assisted operations over the current spec, traced in `phases/01-spec.ops.md`

Output:

- `phases/01-spec.md`

Definition of Done:

- inputs, outputs, business rules, edge cases, and constraints are explicit
- ambiguities and assumptions are identified
- a `red-team` evaluation exists
- a `blue-team` reconstruction over relevant findings exists
- the output enables design without inventing critical requirements
- the artifact satisfies the required schema defined in `doc/spec-schema-fase-1.md`

Checkpoint:

- mandatory human approval

Operational Notes:

- once this phase starts, `us.md` stops being a mutable source of truth for the running workflow
- the system must compare the source-content hash to detect later manual changes
- if the user story changes after `refinement` starts, those changes are not incorporated automatically
- if the user wants to restart from the new user story, the system must clean already-processed derived work and reinitialize the flow
- every agent modification to the spec file must add a `history log` block at the top with date and a short multiline summary
- model-assisted operations over the current spec must persist actor, UTC timestamp, source artifact, prompt text, and result artifact as one traceable unit
- approving this phase freezes the spec baseline and creates the work branch that isolates implementation
- approval must fail if the spec is structurally invalid or still contains placeholder-only required sections

### 4. `technical-design`

Purpose:

- define the technical solution and implementation boundaries

Input:

- approved spec output
- repository constraints

Output:

- `phases/02-technical-design.md`

Definition of Done:

- affected components are identified
- implementation strategy is defined
- risks and open decisions are documented

Checkpoint:

- not required by default in phase 1

Operational Notes:

- if this phase was already approved or surpassed and must be regenerated because of a regression, a new version is created, for example `phases/02-technical-design.v02.md`
- the previous version remains preserved as history and stops being the active one
- this artifact is derived from the approved spec and should remain short, implementable, and bounded

### 5. `implementation`

Purpose:

- execute repository changes according to the technical design

Input:

- approved spec and active technical design

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
- approved spec
- active design
- implementation result

Output:

- `phases/04-review.md`
- structured findings when applicable

Definition of Done:

- an explicit `pass` or `fail` verdict exists
- if it fails, each finding points to a target correction phase

Checkpoint:

- not a manual approval checkpoint

Operational Notes:

- the phase output must still record an explicit `pass` or `fail` verdict
- when review fails, the operator can request regression to `refinement`, `technical-design`, or `implementation`

### 7. `release-approval`

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

### 8. `pr-preparation`

Purpose:

- prepare the PR from the work branch and the approved artifacts

Input:

- `release-approval` approval

Output:

- prepared PR metadata
- final change summary ready for publication
- published draft PR metadata when repository publication succeeds

Definition of Done:

- a PR payload consistent with the user story and approved artifacts exists
- the work branch has been committed and pushed
- a draft PR exists or the workflow reports a publication error without silently completing

Checkpoint:

- not required; publication happens automatically from the prepared artifact and remains traceable through `branch.yaml` and timeline events

## Valid Transitions

- `capture -> clarification`
- `clarification -> refinement`
- `refinement -> technical-design`
- `technical-design -> implementation`
- `implementation -> review`
- `review -> release-approval`
- `release-approval -> pr-preparation`
- `pr-preparation -> completed`

## Valid Regressions

- `review -> refinement`
- `review -> technical-design`
- `review -> implementation`
- `release-approval -> refinement`
- `release-approval -> technical-design`
- `release-approval -> implementation`

## Operational Rules

- more than one phase cannot be in `running` state
- a phase with a mandatory checkpoint cannot advance without approval
- every regression must record reason and evidence
- every human intervention must be associated with a phase or checkpoint
- if a phase fails repeatedly without new information, the user story moves to `waiting-user`
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
- when an explicit artifact operation log exists, it must record actor identity, UTC timestamp, source artifact, exact prompt text, and result artifact

Input resolution by phase:

- `clarification` takes `us.md`
- `refinement` takes `us.md`
- `technical-design` takes the approved active version of `01-spec.md`
- `implementation` takes the approved active version of `02-technical-design*.md`
- `review` takes `us.md` and the active versions of `refinement`, `technical-design`, and `implementation`
- `release-approval` and `pr-preparation` take the active version of `04-review.md` and branch metadata

```text
.specs/
  us/
    <category>/
      US-0001/
        us.md
        clarification.md
        state.yaml
        runtime.yaml
        timeline.md
        branch.yaml
        context/
        attachments/
        restarts/
        phases/
          00-clarification.md
          01-spec.md
          01-spec.ops.md
          02-technical-design.md
          02-technical-design.v02.md
          03-implementation.md
          04-review.md
```

Location rule:

- each user story lives under `.specs/us/<category>/<US-ID>/`
- this convention prioritizes visibility at the workspace root and clear separation from product code
- `timeline.md` is the mandatory audit trail for who acted, when it happened, and which phase was affected

## Minimum `state.yaml` State

```yaml
usId: US-0001
workflowId: canonical-v1
status: waiting-user
currentPhase: clarification
sourceHash: sha256:...
approvedPhases:
  []
```

## Minimum Events

- `us_created`
- `phase_started`
- `phase_completed`
- `phase_approved`
- `phase_regressed`
- `artifact_operated`
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
- whether review should incorporate automated validations in addition to agent analysis
