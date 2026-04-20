# SpecForge · Target Architecture

## Components

### 1. VS Code Extension

Responsibilities:

- present user stories and their state
- trigger user actions
- open markdown artifacts
- observe manual changes in relevant artifacts
- show the current flow and active phase
- act as the client for the MCP backend

Non-responsibilities:

- deciding transitions
- executing workflow logic
- persisting domain rules outside defined contracts

### 2. MCP Server

Responsibilities:

- govern the SDD workflow
- validate transitions and regressions
- apply approval policies
- invoke LLM providers through an abstraction
- persist and recover technical state
- emit traceable results and events

### 3. Repository As Source Of Truth

Responsibilities:

- store human-facing artifacts in markdown
- store minimum technical state
- version workflows, templates, and decisions
- allow context reconstruction in another environment

## Main Design Rule

The extension orchestrates interaction. The MCP decides lifecycle. The repository preserves traceability.

## Initial Canonical Workflow

1. Create or import a user story.
2. Generate clarification if needed.
3. Generate the formalized spec during refinement.
4. Approve the spec baseline and create the work branch.
5. Generate technical design.
6. Implement.
7. Review.
8. Regress or advance based on findings.

## Recommended Minimum Persistence

- markdown for human-readable artifacts
- `yaml` for transactional state, configuration, and user-story technical metadata
- `timeline.md` for human-readable audit history, with the option to evaluate `yaml` later if additional structured processing becomes necessary

Practical rule:

- do not duplicate phase inputs in `input.md` if the system can infer them from the previously approved phase and the active state pointers

## Open Stack Decision

Viable MCP options:

- `TypeScript`: lower initial friction and alignment with the extension
- `C#`: stronger support for complex domain logic and contracts

For a serious product base, the preferred option is `C#` in the backend and `TypeScript` in the extension, while keeping contract-level decoupling through MCP.
