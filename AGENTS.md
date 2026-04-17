# AGENTS

This repository consumes shared skills from `../ai-skills-shared`.

## Official Source

- The valid shared rules live in `../ai-skills-shared/AGENTS.md`.
- The shared skills live in `../ai-skills-shared/.shared-skills/skills/*`.
- Do not duplicate or edit domain rules in this repository unless the deviation is local and explicit.

## Active Skills For This Repository

- `../ai-skills-shared/.shared-skills/skills/terraform/SKILL.md`
- `../ai-skills-shared/.shared-skills/skills/terraform/k3s-environments.md`
- `../ai-skills-shared/.shared-skills/skills/terraform/k8s-modules.md`

## Local Process Skill

- `./.codex/skills/sdd-phase-agents/SKILL.md`
- This local skill applies only to the repository's SDD engineering workflow.
- It does not replace or duplicate shared domain skills.

## Local Rules

- In local development, runtime environment variables must come from the `.env` file referenced by `.vscode/launch.json`. Do not duplicate those variables in `launchSettings.json`, `tasks.json`, or tracked configuration files unless there is an exceptional and explicit need.

## Priority Order

1. System or tool-session instructions.
2. Provider-specific instructions (`CLAUDE.md`, `COPILOT.md`, `CODEX.md`, `.codex/AGENTS.md`).
3. This `AGENTS.md` file.
4. `../ai-skills-shared/AGENTS.md`.
5. Applicable shared skills in `../ai-skills-shared/.shared-skills/skills/*`.
6. The user prompt for the current task.
