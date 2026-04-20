# SpecForge · MCP contract phase 1

## Goal

Define the minimum MCP backend interface required to execute the canonical phase-1 workflow without mixing internal implementation details with the extension UX.

## Contract Principles

- tools operate on artifacts persisted in the repository
- MCP returns enough state so the extension does not need to infer business rules
- business errors must be explicit and actionable
- the contract aligns with `workflow-canonico-fase-1.md`, `state.yaml`, and `branch.yaml`
- phase advance is strictly linear; arbitrary jumps to future phases do not exist

## Conventions

- all user-story identifiers use `usId`
- phases use these canonical ids:
  - `capture`
  - `refinement`
  - `technical_design`
  - `implementation`
  - `review`
  - `release_approval`
  - `pr_preparation`
- responses must include at least:
  - `usId`
  - `status`
  - `currentPhase`
  - `activeArtifacts`

## Base Response Model

```yaml
usId: US-0001
status: active
currentPhase: refinement
activeArtifacts:
  us: .specs/us/us.US-0001/us.md
  refinement: .specs/us/us.US-0001/phases/01-spec.md
messages:
  - code: spec_generated
    level: info
    text: Spec generated and pending approval
```

## Minimum Tools

### `create_us_from_chat`

Purpose:

- create a new user story from free text

Minimum input:

```yaml
title: Create SDD foundation for SpecForge
sourceText: |
  I want a VS Code tool...
baseBranch: main
```

Minimum output:

```yaml
usId: US-0001
status: active
currentPhase: refinement
createdArtifacts:
  us: .specs/us/us.US-0001/us.md
  state: .specs/us/us.US-0001/state.yaml
messages:
  - code: us_created
    level: info
    text: User story created successfully
```

Business errors:

- `invalid_source_text`
- `us_storage_conflict`

### `import_us_from_markdown`

Purpose:

- adopt an existing markdown file as the initial source of a user story

Minimum input:

```yaml
sourcePath: /repo/doc/input/specforge-us.md
baseBranch: main
```

Minimum output:

- same shape as `create_us_from_chat`

Business errors:

- `source_file_not_found`
- `invalid_markdown_source`
- `us_storage_conflict`

### `list_user_stories`

Purpose:

- list known user stories with their summarized state

Minimum input:

```yaml
filter:
  status:
    - active
    - waiting_user
```

Minimum output:

```yaml
items:
  - usId: US-0001
    title: Create SDD foundation for SpecForge
    status: waiting_user
    currentPhase: refinement
    updatedAt: 2026-04-18T09:30:00Z
```

### `get_user_story_summary`

Purpose:

- retrieve the operational summary of a user story

Minimum input:

```yaml
usId: US-0001
```

Minimum output:

```yaml
usId: US-0001
status: waiting_user
currentPhase: refinement
phaseStates:
  refinement: waiting_user
activeArtifacts:
  us: .specs/us/us.US-0001/us.md
  refinement: .specs/us/us.US-0001/phases/01-spec.md
branch:
  baseBranch: main
  workBranch: null
metrics:
  regressionCount: 0
  manualInterventionCount: 0
```

Business errors:

- `us_not_found`

### `get_current_phase`

Purpose:

- retrieve the current phase and whether it can advance

Minimum input:

```yaml
usId: US-0001
```

Minimum output:

```yaml
usId: US-0001
currentPhase: refinement
status: waiting_user
canAdvance: false
requiresApproval: true
blockingReason: refinement_pending_user_approval
```

Business errors:

- `us_not_found`

### `get_user_story_runtime_status`

Purpose:

- inspect the persisted runtime state of a user story to determine whether a long-running execution is still alive or failed

Minimum input:

```yaml
usId: US-0001
```

Minimum output:

```yaml
usId: US-0001
status: running
activeOperation: generate-next-phase
currentPhase: capture
startedAtUtc: 2026-04-19T10:15:00.0000000Z
lastHeartbeatUtc: 2026-04-19T10:15:08.0000000Z
lastOutcome: running
lastCompletedAtUtc: null
message: Running 'generate-next-phase'.
isStale: false
```

Notes:

- when `status = running` and `isStale = false`, the client must not launch another `generate_next_phase` for the same user story
- when `status = failed`, the client may inspect `message` and decide whether to retry
- when `status = idle`, the client should combine this response with `get_current_phase` or `get_user_story_workflow` to decide what to do next

### `generate_next_phase`

Purpose:

- execute only the next valid linear workflow transition

Minimum input:

```yaml
usId: US-0001
requestedBy: user
```

Minimum output:

```yaml
usId: US-0001
status: waiting_user
currentPhase: refinement
generatedArtifact: .specs/us/us.US-0001/phases/01-spec.md
messages:
  - code: spec_generated
    level: info
    text: Spec generated with red-team evaluation and blue-team reconstruction
```

Business errors:

- `us_not_found`
- `phase_transition_not_allowed`
- `approval_required_before_transition`
- `source_hash_mismatch_detected`
- `workflow_blocked`
- `user_story_operation_already_running`

### `approve_phase`

Purpose:

- approve a checkpoint and unlock the next transition

Minimum input:

```yaml
usId: US-0001
phaseId: refinement
approvedBy: user
baseBranch: main
```

Notes:

- `baseBranch` is required when the approval executes `refinement`, because that is when the work branch is created
- for other checkpoints `baseBranch` is optional or not applicable
- in phase 1, branch creation is integrated into this operation and is not exposed as a separate tool

Minimum output:

```yaml
usId: US-0001
status: active
currentPhase: technical_design
branch:
  baseBranch: main
  workBranch: feature/us-0001-specforge-foundation
messages:
  - code: phase_approved
    level: info
    text: Phase approved and workflow advanced
```

Business errors:

- `us_not_found`
- `phase_not_approvable`
- `approval_not_required`
- `missing_base_branch`
- `validation_error`

### `request_regression`

Purpose:

- force an explicit regression to a valid phase

Minimum input:

```yaml
usId: US-0001
targetPhaseId: technical_design
reason: Review detected insufficient decoupling
requestedBy: user
```

Minimum output:

```yaml
usId: US-0001
status: active
currentPhase: technical_design
messages:
  - code: phase_regressed
    level: warning
    text: Workflow regressed to technical_design
```

Business errors:

- `us_not_found`
- `invalid_regression_target`
- `regression_not_allowed`

### `restart_user_story_from_source`

Purpose:

- restart a user story when the source changed and the user decides to rebuild the flow

Minimum input:

```yaml
usId: US-0001
requestedBy: user
reason: The user story changed after refinement started
```

Minimum output:

```yaml
usId: US-0001
status: active
currentPhase: refinement
messages:
  - code: us_restarted_from_source
    level: warning
    text: Derived artifacts were cleared and the flow was restarted
```

Business errors:

- `us_not_found`
- `restart_not_allowed`

### `list_user_story_files`

Purpose:

- list the persisted files of a user story, distinguishing between `context files` and `user story info`

Minimum input:

```yaml
usId: US-0001
```

Minimum output:

```yaml
usId: US-0001
contextFiles:
  - name: service.cs
    path: .specs/us/us.US-0001/context/service.cs
attachments:
  - name: api-notes.md
    path: .specs/us/us.US-0001/attachments/api-notes.md
```

Business errors:

- `us_not_found`

### `add_user_story_files`

Purpose:

- copy files from the repository or local filesystem into a user story as `context` or `attachment`

Minimum input:

```yaml
usId: US-0001
kind: context
sourcePaths:
  - src/SpecForge.Domain/Application/WorkflowRunner.cs
  - tests/SpecForge.Domain.Tests/WorkflowRunnerTests.cs
```

Notes:

- `kind` supports `context` and `attachment`
- relative paths resolve against `workspaceRoot`
- only files stored as `context` enter the model runtime by default

Minimum output:

- same shape as `list_user_story_files`

Business errors:

- `us_not_found`
- `source_file_not_found`
- `invalid_file_kind`

### `set_user_story_file_kind`

Purpose:

- move a file already persisted inside a user story between `context` and `attachment`

Minimum input:

```yaml
usId: US-0001
filePath: .specs/us/us.US-0001/attachments/api-notes.md
kind: context
```

Minimum output:

- same shape as `list_user_story_files`

Business errors:

- `us_not_found`
- `file_not_found`
- `invalid_file_kind`
- `file_not_owned_by_user_story`

## Recommended Cross-Cutting Errors

- `validation_error`
- `storage_error`
- `workflow_blocked`
- `concurrency_conflict`
- `internal_error`

## Suggested MCP Resources

- user-story summary resource by `usId`
- current-phase resource by `usId`
- active-artifacts resource by `usId`

## Open Decisions

- `generate_next_phase` remains fixed as linear sequential advance and does not accept `targetPhaseId`
- whether error summaries should be normalized with a `code/message/details` structure
