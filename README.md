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
- minimal MCP server over `stdio`
- OpenAI-compatible phase provider infrastructure

Not implemented yet:

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
- MCP layer:
  - `stdio` MCP server with `initialize`, `tools/list`, and `tools/call`
  - orchestration boundary between extension and backend execution
  - base for future provider abstraction and richer backend execution

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

The npm scripts invoke the local TypeScript compiler entrypoint directly, so the extension and test builds do not depend on a global `tsc`.

### Run .NET tests

```bash
dotnet test SpecForge.AI.slnx
```

### Run TypeScript tests

```bash
npm run test:ts
```

## Provider Configuration

By default, phase execution uses a deterministic local provider.

To enable an OpenAI-compatible provider:

```bash
export SPECFORGE_PHASE_PROVIDER=openai-compatible
export SPECFORGE_OPENAI_BASE_URL=https://api.openai.com/v1
export SPECFORGE_OPENAI_API_KEY=<your-api-key>
export SPECFORGE_OPENAI_MODEL=gpt-4.1-mini
```

For local testing with Ollama:

```bash
export SPECFORGE_PHASE_PROVIDER=openai-compatible
export SPECFORGE_OPENAI_BASE_URL=http://localhost:11434/v1
export SPECFORGE_OPENAI_API_KEY=ollama-local
export SPECFORGE_OPENAI_MODEL=llama3.1
```

The provider targets the OpenAI-compatible chat completions shape, so OpenAI and Ollama can share the same backend integration path.

Before executing real provider-backed phases, initialize the repository prompt set through the MCP backend. This materializes `.specs/config.yaml` and `.specs/prompts/`, and the engine will fail fast if the required prompt files are missing.

## Usage

### Domain core

The .NET core already supports:

- creating a user story root
- persisting `state.yaml` and `branch.yaml`
- validating explicit user-story categories against the repo catalog in `.specs/config.yaml`
- advancing to the next valid phase
- approving approval-required phases
- creating the work branch metadata on refinement approval using `<kind>/us-xxxx-short-slug`
- generating minimal phase artifacts and timeline entries
- initializing versioned repo prompts under `.specs/prompts/`
- requiring prompt initialization for real provider-backed phase execution
- composing effective phase prompts from repo templates and runtime artifacts

### VS Code extension

The extension currently provides:

- a `SpecForge` activity bar view
- a `User Stories` tree sourced from `.specs/us/`
- `Create User Story`
- `Import User Story`
- `Initialize Repo Prompts`
- `Open Prompt Templates`
- `Open Main Artifact`
- `Continue Phase`
- explicit `feature` / `bug` / `hotfix` selection when creating or importing a US
- explicit category selection from the repo category catalog when creating or importing a US
- lightweight TypeScript tests for explorer grouping, detail rendering, MCP client payload/parsing, and extension command wiring

Current limitation:

- the extension can initialize repo prompts and request regressions, but it still does not provide a richer prompt editor, diffing, or effective prompt inspection UX

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
- [x] add an OpenAI-compatible provider layer usable with OpenAI or Ollama
- [x] export versioned prompts per phase into `.specs/prompts/`
- [x] require repo prompt initialization before executing real providers
- [x] compose effective per-phase prompts from repo templates plus runtime context
- [x] expose explicit phase regression through domain, MCP, and VS Code
- [x] implement safe restart from source and archive superseded derived state
- [x] derive branch names from explicit US kind plus short slug
- [x] validate explicit US categories against a repo-configured catalog
- [x] group the VS Code explorer by user-story category
- [ ] finalize richer branch lifecycle rules and Git/PR metadata
- [ ] add richer phase detail UI and graph visualization
- [ ] add issue and PR preparation integration
- [ ] support customizable workflows and agent profiles

## MVP Roadmap

The current target is an MVP, not a feature-complete product.

### MVP scope

- [x] create and import user stories
- [x] persist workflow state and artifacts under `.specs/`
- [x] advance the canonical phase workflow with approvals
- [x] expose the workflow through a local MCP backend
- [x] support repo-initialized prompts and an OpenAI-compatible provider path
- [x] support explicit regression to an earlier valid phase
- [x] support safe restart from the original source

### Post-MVP

- [ ] graph visualization and richer workflow observability
- [ ] prompt diffing and effective prompt inspection UX
- [ ] GitHub PR / issue integration
- [ ] customizable workflows and agent profiles

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
