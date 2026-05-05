---
name: create-user-story
description: Create or import a SpecForge user story through MCP without touching .specs files directly.
---

# Create User Story

Use `specforge_action`.

For free text:

```json
{
  "workspaceRoot": "<absolute repo path>",
  "action": "create_user_story",
  "params": {
    "usId": "US-123",
    "title": "Short title",
    "kind": "feature",
    "category": "core",
    "sourceText": "User-story intent",
    "actor": "user"
  }
}
```

For an existing Markdown file, use `action: "import_user_story"` with `sourcePath`, `usId`, `title`, `kind`, and `category`.

Never create `.specs/us/**` folders or files by hand.
