---
name: regress-user-story
description: Regress, rewind, restart, reopen, or repair a SpecForge user story through MCP.
---

# Regress User Story

Use `specforge_query` with `query: "workflow"` first to identify valid targets.

Use `specforge_action` for state changes:

- `request_regression` for normal regression to a previous phase.
- `rewind_workflow` for rewinding executed phase history.
- `restart_from_source` after source user-story edits.
- `reopen_completed` for completed workflows with a typed reason.
- `repair_lineage` when lineage analysis reports inconsistencies.

Only pass `destructive: true` when the user explicitly accepts deleting later derived artifacts.
