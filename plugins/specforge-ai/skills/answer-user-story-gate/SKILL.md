---
name: answer-user-story-gate
description: Submit refinement or approval answers for a SpecForge user story through MCP.
---

# Answer User Story Gate

Use `specforge_action`.

For refinement answers:

```json
{
  "workspaceRoot": "<absolute repo path>",
  "usId": "US-123",
  "action": "submit_refinement_answers",
  "params": {
    "answers": ["answer 1", "answer 2"],
    "actor": "user"
  }
}
```

For one approval question:

```json
{
  "workspaceRoot": "<absolute repo path>",
  "usId": "US-123",
  "action": "submit_approval_answer",
  "params": {
    "question": "Question text",
    "answer": "Answer text",
    "actor": "user"
  }
}
```

After submitting, read `workflow` again and report remaining unresolved questions.
