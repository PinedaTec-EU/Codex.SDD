---
name: inspect-user-story
description: Inspect SpecForge user stories, workflow state, current phase, runtime status, lineage, and files through MCP.
---

# Inspect User Story

Use `specforge_query`.

Common calls:

```json
{ "workspaceRoot": "<absolute repo path>", "query": "list_user_stories" }
```

```json
{ "workspaceRoot": "<absolute repo path>", "query": "workflow", "usId": "US-123" }
```

```json
{ "workspaceRoot": "<absolute repo path>", "query": "current_phase", "usId": "US-123" }
```

Prefer concise summaries: current phase, status, blocking reason, pending questions, artifact paths, and latest timeline events.
