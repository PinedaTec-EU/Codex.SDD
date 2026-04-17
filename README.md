# SpecForge.AI

SpecForge.AI is an early-stage developer tool for running structured SDD workflows inside VS Code.

The project focuses on governing how AI-assisted development happens, not only on generating code. It introduces explicit phases, persisted artifacts, human checkpoints, regressions, timeline tracking, and a minimal execution core that can evolve into a full MCP-backed workflow system.

## Status

This repository is currently a working foundation, not a finished product.

Implemented today:

- documented phase-1 workflow and persistence model
- .NET domain core for workflow rules and transitions
- local YAML persistence for `state.yaml` and `branch.yaml`
- local timeline and artifact generation via a workflow runner
- minimal VS Code extension scaffold
- user story explorer over `.specs/us/`

Not implemented yet:

- full MCP backend wiring
- real LLM-driven phase execution
- full PR integration
- rich VS Code phase details and graph UI

## Features

- Canonical user story workflow:
  - `capture`
  - `refinement`
  - `technical_design`
  - `implementation`
  - `review`
  - `release_approval`
  - `pr_preparation`
- Explicit approval gates and regression rules
- Local workspace persistence under `.specs/us/us.<us-id>/`
- Human-readable artifacts in Markdown
- Technical state in YAML
- Minimal workflow automation through a .NET runner
- Minimal VS Code extension for creating, importing, listing, and opening user stories

## Repository Layout

```text
.
├── doc/                       # Product, architecture, workflow, templates, roadmap
├── media/                     # VS Code extension assets
├── src-vscode/                # VS Code extension source
├── src/SpecForge.Domain/      # Workflow domain and application core
├── tests/SpecForge.Domain.Tests/
├── .specs/                    # Runtime user story persistence in the workspace
├── package.json               # VS Code extension manifest
└── SpecForge.AI.slnx          # .NET solution
```

## Architecture

The current design is intentionally split into layers:

- VS Code extension:
  - user-facing commands and explorer UI
  - workspace interaction
  - artifact opening and local user story discovery
- Domain and application core:
  - workflow rules
  - approval requirements
  - regression validation
  - local artifact and YAML persistence
  - minimal workflow runner
- Future MCP layer:
  - orchestration boundary between extension and backend execution
  - provider abstraction
  - future integration with LLMs, PRs, and issues

See the detailed design documents in:

- [doc/product-vision.md](doc/product-vision.md)
- [doc/architecture.md](doc/architecture.md)
- [doc/workflow-canonico-fase-1.md](doc/workflow-canonico-fase-1.md)
- [doc/mcp-contract-fase-1.md](doc/mcp-contract-fase-1.md)
- [doc/implementation-plan.md](doc/implementation-plan.md)

## Installation

### Prerequisites

- .NET SDK 10
- Node.js 23+
- npm 10+
- VS Code 1.100+

### Clone

```bash
git clone <your-fork-or-repo-url>
cd SpecForge.AI
```

### Install Node dependencies

```bash
npm install
```

### Build the VS Code extension sources

```bash
npm run compile
```

### Run .NET tests

```bash
dotnet test SpecForge.AI.slnx
```

## Usage

### Domain core

The .NET core already supports:

- creating a user story root
- persisting `state.yaml` and `branch.yaml`
- advancing to the next valid phase
- approving approval-required phases
- creating the work branch metadata on refinement approval
- generating minimal phase artifacts and timeline entries

### VS Code extension

The extension currently provides:

- a `SpecForge` activity bar view
- a `User Stories` tree sourced from `.specs/us/`
- `Create User Story`
- `Import User Story`
- `Open Main Artifact`
- `Continue Phase`

Current limitation:

- `Continue Phase` is present in the extension surface, but the extension is not yet wired to the backend runner or a future MCP service

### Running the extension locally

1. Open the repository in VS Code.
2. Run `npm run compile`.
3. Start the extension from the VS Code Extension Development Host workflow.
4. Use the `SpecForge` activity bar view.

## Persistence Model

Each user story lives under:

```text
.specs/us/us.<us-id>/
```

Typical contents:

```text
.specs/us/us.US-0001/
  us.md
  state.yaml
  branch.yaml
  timeline.md
  phases/
    01-refinement.md
    02-technical-design.md
    03-implementation.md
    04-review.md
```

## Roadmap

### Phase 1 foundation

- [x] define workflow, persistence, and templates
- [x] implement workflow domain rules
- [x] implement local YAML persistence
- [x] implement minimal workflow runner
- [x] create minimal VS Code extension scaffold

### Next

- [x] wire the VS Code extension to the local workflow runner
- [x] introduce a stable application/MCP boundary between UI and backend
- [x] replace placeholder artifact generation with real phase execution
- [x] refresh the explorer and open generated artifacts after workflow actions
- [x] add approval and user-story detail actions to the extension
- [ ] introduce a real MCP backend behind the current boundary
- [ ] plug real providers/agents into phase execution
- [ ] add richer phase detail UI and graph visualization
- [ ] add issue and PR preparation integration
- [ ] support customizable workflows and agent profiles

## Development

Useful commands:

```bash
npm install
npm run compile
dotnet test SpecForge.AI.slnx
```

The repository also contains local VS Code task files and tool manifests. Some of them may still reflect older local conventions and should not be treated as the primary source of truth over the documents in `doc/` and the current codebase.

## Contributing

This repository is still in early design and foundation stages. If you contribute:

- keep the workflow model explicit
- prefer persisted state over implicit conversational state
- avoid adding hidden environment-specific behavior
- update the design docs when you change workflow semantics

## License

[MIT](LICENSE)
