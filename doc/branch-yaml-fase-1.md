# SpecForge · `branch.yaml` phase 1

## Goal

Define the technical artifact that persists the Git anchor of a user story without mixing it with the functional workflow state.

## Purpose

`branch.yaml` exists to answer these questions in a stable way:

- which base branch the work branch came from
- which branch is currently active for the user story
- when it was created
- what its operational state is inside the workflow
- which minimum metadata can be reused later during PR preparation

## Phase-1 Scope

Includes:

- persistence of the base branch selected by the user
- persistence of the work branch name
- temporal traceability of creation
- minimum branch state relative to the workflow

Does not include:

- CI state
- enrichment with external review metadata

## Relationship With Other Artifacts

- `state.yaml` governs the user story lifecycle
- `branch.yaml` governs its operational Git context
- `04-review.md` and future PR preparation may read `branch.yaml`, but must not duplicate its data

## Creation Time

`branch.yaml` must be created in `refinement`, when:

- the user approves the spec baseline for the first time
- the system can already open an isolated work branch

## Location

```text
.specs/
  us/
    us.<us-id>/
      branch.yaml
```

## Proposed Minimum Schema

```yaml
usId: US-0001
kind: feature
category: workflow
baseBranch: main
workBranch: feature/us-0001-specforge-foundation
status: active
createdAt: 2026-04-17T10:30:00Z
createdFromPhase: refinement
strategy: single-branch-per-user-story
titleSnapshot: Group specs explorer by category
sourceUsPath: .specs/us/us.US-0001/us.md
pullRequest:
  status: not_requested
  targetBaseBranch: main
```

## Fields

### `usId`

Stable identifier of the user story that owns the branch.

### `baseBranch`

Base branch selected by the user when approving the first spec baseline.

### `kind`

Explicit user-story type that controls the branch prefix.

Phase-1 values:

- `feature`
- `bug`
- `hotfix`

### `workBranch`

Name of the branch created to isolate work for the user story.

Locked convention for phase 1:

- format `<kind>/us-0001-short-slug`
- `usId` is the stable anchor
- `short-slug` derives from the current user-story title
- the slug improves readability, but is not the source of truth
- the branch is not renamed automatically if the user-story title changes

### `category`

Explicit user-story category derived from the repository catalog.

It is used to:

- group stories in the UI
- improve functional traceability of the branch
- avoid free-form taxonomies and category explosion

### `status`

Operational state of the branch.

Recommended initial values:

- `active`
- `superseded`
- `merged`
- `abandoned`

### `createdAt`

Timestamp when the branch was created.

### `createdFromPhase`

Workflow phase that originated branch creation. In phase 1 it must be `refinement`.

### `strategy`

Applied branching strategy. In phase 1 it is fixed as `single-branch-per-user-story`.

### `pullRequest`

Reserved block to connect with future PR preparation without forcing real integration yet.

Minimum fields:

- `status`
- `targetBaseBranch`
- `title`
- `artifactPath`
- `draft`
- `number`
- `url`
- `remoteBranch`
- `headCommitSha`
- `publishedAt`

Initial `pullRequest.status` values:

- `not_requested`
- `prepared`
- `draft`
- `published`

## Invariants

- an active user story has at most one active `branch.yaml`
- `workBranch` cannot exist without `baseBranch`
- `workBranch` cannot exist without `kind`
- `workBranch` cannot exist without `category`
- `branch.yaml` is not created before the initial spec approval
- if a user story is restarted from source, the previous branch must be marked as `superseded` or `abandoned`, never silently reused

## Closed Decisions

- `workBranch` convention: `<kind>/us-0001-short-slug`
- active branch strategy in phase 1: `single-branch-per-user-story`
- a single active branch per user story
- manual branch rename is postponed; there is no automatic rename in phase 1

## Open Decisions

- whether `branch.yaml` should include the local `headCommit` in phase 1 or postpone it
- whether `merged` should remain in phase 1 or be reserved for future real PR integration
