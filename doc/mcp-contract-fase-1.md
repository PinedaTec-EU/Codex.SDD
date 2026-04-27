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
  - `spec`
  - `technical-design`
  - `implementation`
  - `review`
  - `release-approval`
  - `pr-preparation`
- responses must include at least:
  - `usId`
  - `status`
  - `currentPhase`
  - `activeArtifacts`

## Base Response Model

```yaml
usId: US-0001
status: waiting-user
currentPhase: refinement
blockingReason: refinement_pending_answers
```

## Minimum Tools

### `create_us_from_chat`

Purpose:

- create a new user story from free text

Minimum input:

```yaml
workspaceRoot: /repo/SpecForge.AI
usId: US-0001
title: Create SDD foundation for SpecForge
kind: feature
category: workflow
sourceText: |
  I want a VS Code tool...
```

Minimum output:

```yaml
usId: US-0001
rootDirectory: /repo/SpecForge.AI/.specs/us/workflow/US-0001
mainArtifactPath: /repo/SpecForge.AI/.specs/us/workflow/US-0001/us.md
```

Business errors:

- `invalid_source_text`
- `us_storage_conflict`

### `import_us_from_markdown`

Purpose:

- adopt an existing markdown file as the initial source of a user story

Minimum input:

```yaml
workspaceRoot: /repo/SpecForge.AI
usId: US-0001
sourcePath: /repo/doc/input/specforge-us.md
title: Create SDD foundation for SpecForge
kind: feature
category: workflow
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
workspaceRoot: /repo/SpecForge.AI
```

Minimum output:

```yaml
items:
  - usId: US-0001
    title: Create SDD foundation for SpecForge
    category: workflow
    status: waiting-user
    currentPhase: refinement
    directoryPath: /repo/SpecForge.AI/.specs/us/workflow/US-0001
    mainArtifactPath: /repo/SpecForge.AI/.specs/us/workflow/US-0001/us.md
    workBranch: null
```

### `get_user_story_summary`

Purpose:

- retrieve the operational summary of a user story

Minimum input:

```yaml
workspaceRoot: /repo/SpecForge.AI
usId: US-0001
```

Minimum output:

```yaml
usId: US-0001
status: waiting-user
currentPhase: refinement
category: workflow
directoryPath: /repo/SpecForge.AI/.specs/us/workflow/US-0001
mainArtifactPath: /repo/SpecForge.AI/.specs/us/workflow/US-0001/us.md
workBranch: null
```

### `get_user_story_workflow`

Purpose:

- retrieve the workflow DTO used by the extension, including phases, controls, refinement state, audit trail, and attached files

Minimum input:

```yaml
workspaceRoot: /repo/SpecForge.AI
usId: US-0001
```

Minimum output:

```yaml
usId: US-0001
status: waiting-user
currentPhase: refinement
directoryPath: /repo/SpecForge.AI/.specs/us/workflow/US-0001
mainArtifactPath: /repo/SpecForge.AI/.specs/us/workflow/US-0001/us.md
timelinePath: /repo/SpecForge.AI/.specs/us/workflow/US-0001/timeline.md
controls:
  canContinue: false
  canApprove: false
  requiresApproval: false
  blockingReason: refinement_pending_answers
  canRestartFromSource: true
  regressionTargets: []
  rewindTargets: []
refinement:
  status: waiting-user
  tolerance: balanced
  reason: missing_required_detail
  items:
    - index: 1
      question: Which repository area owns the workflow graph?
      answer: null
contextFiles: []
attachments: []
```

Business errors:

- `us_not_found`

### `get_current_phase`

Purpose:

- retrieve the current phase and whether it can advance

Minimum input:

```yaml
workspaceRoot: /repo/SpecForge.AI
usId: US-0001
```

Minimum output:

```yaml
usId: US-0001
currentPhase: refinement
status: waiting-user
canAdvance: false
canApprove: false
requiresApproval: false
blockingReason: refinement_pending_answers
```

Business errors:

- `us_not_found`

### `get_user_story_runtime_status`

Purpose:

- inspect the persisted runtime state of a user story to determine whether a long-running execution is still alive or failed

Minimum input:

```yaml
workspaceRoot: /repo/SpecForge.AI
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
workspaceRoot: /repo/SpecForge.AI
usId: US-0001
actor: user
```

Minimum output:

```yaml
usId: US-0001
status: waiting-user
currentPhase: refinement
generatedArtifactPath: /repo/SpecForge.AI/.specs/us/workflow/US-0001/phases/00-refinement.md
usage:
  inputTokens: 0
  outputTokens: 0
  totalTokens: 0
execution: null
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
workspaceRoot: /repo/SpecForge.AI
usId: US-0001
actor: alice
baseBranch: main
```

Notes:

- `baseBranch` is required when approving `spec`, because that is when the work branch is created
- for other checkpoints `baseBranch` is optional or not applicable
- in phase 1, branch creation is integrated into this operation and is not exposed as a separate tool
- this operation marks the current phase as approved but does not itself advance to the next phase

Minimum output:

```yaml
usId: US-0001
status: active
title: Create SDD foundation for SpecForge
category: workflow
directoryPath: /repo/SpecForge.AI/.specs/us/workflow/US-0001
mainArtifactPath: /repo/SpecForge.AI/.specs/us/workflow/US-0001/us.md
currentPhase: spec
workBranch: feature/us-0001-specforge-foundation
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
workspaceRoot: /repo/SpecForge.AI
usId: US-0001
targetPhase: technical-design
reason: Review detected insufficient decoupling
actor: alice
```

Minimum output:

```yaml
usId: US-0001
status: active
currentPhase: technical-design
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
workspaceRoot: /repo/SpecForge.AI
usId: US-0001
actor: alice
reason: The user story changed after spec started
```

Minimum output:

```yaml
usId: US-0001
status: waiting-user
currentPhase: refinement
generatedArtifactPath: /repo/SpecForge.AI/.specs/us/workflow/US-0001/phases/00-refinement.md
```

Business errors:

- `us_not_found`
- `restart_not_allowed`

### `rewind_workflow`

Purpose:

- move the workflow state back to an earlier executed phase, optionally deleting later derived artifacts

Minimum input:

```yaml
workspaceRoot: /repo/SpecForge.AI
usId: US-0001
targetPhase: spec
actor: alice
destructive: false
```

Minimum output:

```yaml
usId: US-0001
status: waiting-user
currentPhase: spec
deletedPaths: []
preservedPaths:
  - /repo/SpecForge.AI/.specs/us/workflow/US-0001/phases/02-technical-design.md
```

Business errors:

- `us_not_found`
- `validation_error`

### `reset_user_story_to_capture`

Purpose:

- return the workflow to `capture` and remove all derived artifacts and branch metadata

Minimum input:

```yaml
workspaceRoot: /repo/SpecForge.AI
usId: US-0001
```

Minimum output:

```yaml
usId: US-0001
status: active
currentPhase: capture
deletedPaths:
  - /repo/SpecForge.AI/.specs/us/workflow/US-0001/refinement.md
  - /repo/SpecForge.AI/.specs/us/workflow/US-0001/phases/00-refinement.md
preservedPaths:
  - /repo/SpecForge.AI/.specs/us/workflow/US-0001/us.md
  - /repo/SpecForge.AI/.specs/us/workflow/US-0001/state.yaml
```

Business errors:

- `us_not_found`

### `submit_refinement_answers`

Purpose:

- persist ordered answers for the current refinement session so the workflow can continue from `refinement`

Minimum input:

```yaml
workspaceRoot: /repo/SpecForge.AI
usId: US-0001
answers:
  - The workflow graph lives in src-vscode/workflowView.ts
  - Use the existing shared button styles
actor: alice
```

Minimum output:

```yaml
{}
```

Business errors:

- `us_not_found`
- `validation_error`

### `submit_approval_answer`

Purpose:

- persist a human answer into the current spec approval questions without invoking a model run

Minimum input:

```yaml
workspaceRoot: /repo/SpecForge.AI
usId: US-0001
question: Should this include branch auto-creation for non-git workspaces?
answer: No. Record metadata only outside git workspaces.
actor: alice
```

Minimum output:

```yaml
usId: US-0001
status: waiting-user
currentPhase: spec
generatedArtifactPath: /repo/SpecForge.AI/.specs/us/workflow/US-0001/phases/01-spec.v02.md
```

Business errors:

- `us_not_found`
- `validation_error`

### `operate_current_phase_artifact`

Purpose:

- apply a prompt over the current artifact, generate a new artifact version, and persist the full operation trace

Minimum input:

```yaml
workspaceRoot: /repo/SpecForge.AI
usId: US-0001
actor: alice
prompt: |
  Keep the current spec bounded to article ingestion only.
  Do not expand into publishing workflows.
```

Minimum output:

```yaml
usId: US-0001
status: waiting-user
currentPhase: spec
operationLogPath: /repo/SpecForge.AI/.specs/us/workflow/US-0001/phases/01-spec.ops.md
sourceArtifactPath: /repo/SpecForge.AI/.specs/us/workflow/US-0001/phases/01-spec.md
generatedArtifactPath: /repo/SpecForge.AI/.specs/us/workflow/US-0001/phases/01-spec.v02.md
```

Business errors:

- `us_not_found`
- `phase_transition_not_allowed`
- `validation_error`

### `list_user_story_files`

Purpose:

- list the persisted files of a user story, distinguishing between `context files` and `user story info`

Minimum input:

```yaml
workspaceRoot: /repo/SpecForge.AI
usId: US-0001
```

Minimum output:

```yaml
usId: US-0001
contextFiles:
  - name: service.cs
    path: /repo/SpecForge.AI/.specs/us/workflow/US-0001/context/service.cs
attachments:
  - name: api-notes.md
    path: /repo/SpecForge.AI/.specs/us/workflow/US-0001/attachments/api-notes.md
```

Business errors:

- `us_not_found`

### `add_user_story_files`

Purpose:

- copy files from the repository or local filesystem into a user story as `context` or `attachment`

Minimum input:

```yaml
workspaceRoot: /repo/SpecForge.AI
usId: US-0001
kind: context
sourcePaths:
  - /repo/SpecForge.AI/src/SpecForge.Domain/Application/WorkflowRunner.cs
  - /repo/SpecForge.AI/tests/SpecForge.Domain.Tests/WorkflowRunnerTests.cs
```

Notes:

- `kind` supports `context` and `attachment`
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
workspaceRoot: /repo/SpecForge.AI
usId: US-0001
filePath: /repo/SpecForge.AI/.specs/us/workflow/US-0001/attachments/api-notes.md
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
- workflow details resource by `usId`

## Open Decisions

- `generate_next_phase` remains fixed as linear sequential advance and does not accept `targetPhaseId`
- whether error summaries should be normalized with a `code/message/details` structure
