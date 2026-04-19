# SpecForge · Implementation Plan

## Proposed Sequence

### ✅ Step 1. Lock the canonical workflow

Deliverables:

- ✅ initial phases
- ✅ input and output contracts per phase
- ✅ mandatory checkpoints
- ✅ regression criteria
- ✅ artifact versioning rules
- ✅ practical source immutability rule once `refinement` starts
- ✅ work-branch creation timing

### ✅ Step 2. Define minimum persistence

Deliverables:

- ✅ `doc/` folder structure and runtime state persisted in the repo
- ✅ `state.yaml` format
- ✅ `branch.yaml` format
- ✅ timeline or event format
- ✅ essential markdown templates
- ✅ cross-phase input inference rule to avoid redundant `input.md`

### ✅ Step 3. Design the initial MCP contract

Deliverables:

- ✅ `create_us_from_chat`
- ✅ `import_us_from_markdown`
- ✅ `list_user_stories`
- ✅ `get_user_story_summary`
- ✅ `get_current_phase`
- ✅ `get_user_story_runtime_status`
- ✅ `generate_next_phase`
- ✅ `approve_phase`
- ✅ `request_regression`
- ✅ `restart_user_story_from_source`
- ✅ `list_user_story_files`
- ✅ `add_user_story_files`
- ✅ `set_user_story_file_kind`
- ✅ branch creation integrated into `approve_phase`

### ✅ Step 4. Implement the workflow engine core

Deliverables:

- ✅ domain model
- ✅ transition validation
- ✅ local persistence
- ✅ domain tests

### ✅ Step 5. Add a minimum VS Code extension

Deliverables:

- ✅ user-story view
- ✅ create/import command
- ✅ continue-phase command
- ✅ primary-artifact opening

Notes:

- the minimum extension already exists and compiles
- the automation core already exists through a workflow runner
- `continue phase` in the extension still needed wiring to that runner or to the final MCP backend

### ✅ Step 5.1. Wire the extension to the local workflow runner

Deliverables:

- ✅ invoke `WorkflowRunner` from extension commands
- ✅ make `continue phase` execute a real workflow advance
- ✅ refresh the tree after state and artifact changes
- ✅ open the generated artifact when applicable

### ✅ Step 5.2. Introduce a stable application/MCP layer

Deliverables:

- ✅ define a stable boundary between extension and backend
- ✅ encapsulate `WorkflowRunner` behind application services
- ✅ align real operations with `mcp-contract-fase-1.md`
- ✅ prepare replacement of the local runner with an MCP backend without breaking the UI

### ✅ Step 5.3. Replace placeholder generation with real phase execution

Deliverables:

- ✅ replace example artifacts with execution based on previous artifacts and workflow rules
- ✅ persist real phase results
- ✅ record failures, blocks, and regressions in timeline and state
- ✅ maintain traceability between artifacts and decisions

### ✅ Step 5.4. Enrich the minimum UX

Deliverables:

- ✅ selected-phase detail
- ✅ contextual actions per phase
- ✅ clear feedback for errors and blocks
- ✅ minimum base for a future workflow graph view

## Recommended Order After This User Story

1. ✅ define the canonical phase-1 workflow
2. ✅ define the real `doc/` structure and runtime artifacts
3. ✅ define the minimum MCP contract
4. ✅ start domain and persistence implementation
5. ✅ lock branch naming strategy and safe user-story restart
6. ✅ introduce the real MCP backend behind the current boundary
7. ✅ enrich phase execution with real providers/agents
8. ✅ materialize versioned prompts per phase in `.specs/prompts/`
9. ✅ initialize the repo with required prompts and `config.yaml`
10. ✅ require prompts in real phase execution
11. ✅ compose effective per-phase prompts using runtime context
12. ✅ expose `request_regression` end to end in domain, MCP, and extension
13. ✅ implement safe restart from source
14. ✅ close the baseline branch-naming strategy for phase 1
15. ✅ introduce explicit user-story category with a configurable repo catalog
16. ✅ group the VS Code explorer by user-story category
17. ✅ introduce a minimum TypeScript test project for the extension
18. ✅ extend UX with graph view and richer phase detail
19. [ ] complete a richer prompt editor/inspector from the extension
20. [ ] enrich branch lifecycle with real Git/PR integration

## Risks To Watch

- overdesigning workflows before validating the base flow
- introducing too many domain entities too early
- mixing human state, technical state, and prompts without clear boundaries
- making the extension too smart and the backend too weak

## Deferred Decisions

- full visual workflow editing
- intra-user-story parallel slicing
- real PR integration
- real issue integration
- advanced multi-provider strategies

## Current State

Phase 5 is resolved at its minimum scope:

1. the extension already invokes the local backend
2. a stable boundary exists between UI and backend
3. phase execution already generates real artifacts derived from state
4. the minimum UX already offers detail, contextual actions, and basic feedback

The next leap is not more base infrastructure. The minimum MCP backend already exists and the OpenAI-compatible provider with repo-versioned prompts is already operational. What remains to reach a usable MVP is to close the explicit-workflow gaps and make that real scope visible in documentation and UX.

## MVP Roadmap

Goal:

- deliver a functional MVP to execute a sequential SDD workflow inside VS Code with persisted state, human checkpoints, and an interoperable local backend

Included in the MVP:

- ✅ user-story creation and import
- ✅ linear phase advance with approval where required
- ✅ local persistence in `.specs/`
- ✅ minimum MCP backend
- ✅ repo-versioned prompts and OpenAI-compatible provider
- ✅ explicit phase regression from UI and backend
- ✅ safe restart of a user story from source
- ✅ explicit branch naming by `kind` with `<kind>/us-xxxx-short-slug`
- ✅ explicit user-story category with a configurable catalog from `.specs/config.yaml`
- ✅ coherent operational roadmap between `doc/` and `README`
- ✅ minimum TypeScript test project for pure extension logic
- ✅ primary workflow view opened from the explorer with per-phase detail and visible audit
- ✅ extension settings for provider, connection, and watcher
- ✅ visible warning in the extension when the active provider is not configured, with a direct link to settings
- ✅ optional watcher with attention notifications and `play/pause/stop` controls
- ✅ extension sidebar with a single empty-state CTA and embedded creation form
- ✅ visible distinction in UI and documentation between automatic phases and user checkpoints
- ✅ compact action in the sidebar header to initialize or rebootstrap versioned repo prompts
- ✅ initial visibility focused on active user stories and workflows in the sidebar and main views
- ✅ access from workflow view to prompts associated with the selected phase
- ✅ separation between `context files` and `user story info` within a user story
- ✅ only `context files` are reused as model runtime context
- ✅ management of `context files` and `user story info` through MCP as well as through the extension
- ✅ local `context files` suggestions during `clarification` using heuristics and repo neighborhood
- ✅ extension feature flag to enable or disable those suggestions, enabled by default
- ✅ persisted runtime status per user story to detect long-running executions and block duplicate reentry
- ✅ per-user starring of a user story with disk persistence and auto-reopen when VS Code is reopened

Does not block the MVP:

- ✅ workflow graph view
- [ ] rich detail panel with diff, navigable timeline, or effective prompt inspection
- [ ] real PR/issues integration
- [ ] customizable workflows and advanced agent profiles
- [ ] show completed user stories through an explicit UI switch
- [ ] add search over user stories/workflows in the side view
- [ ] link with ticketing tools (Jira, etc.)

Recently completed subtask:

- ✅ add commands and affordances in the extension to initialize `.specs/prompts/`, detect uninitialized repos, and open templates from the UI
- ✅ make it explicit in `README` and roadmap which phases are automatic and which require human intervention

Recently completed subtasks:

- ✅ add an MCP initialization tool that exports `.specs/prompts/` and `.specs/config.yaml`
- ✅ lock the minimum prompt set per phase: `execute` and `approve` where applicable
- ✅ make the engine fail if the repo is not initialized or required prompts are missing
- ✅ load and compose the effective prompt from repo-versioned artifacts
- ✅ use that effective prompt from the OpenAI-compatible provider for OpenAI and Ollama
- ✅ expose `request_regression` in domain, application, MCP, and extension
- ✅ invalidate obsolete approvals when regressing to a previous phase
- ✅ implement `restart_user_story_from_source` with archived artifacts and superseded previous branch
- ✅ lock explicit `kind` in the user story and branch naming `<kind>/us-xxxx-short-slug`
- ✅ introduce explicit `category` in the user story and validate it against the global repo catalog
- ✅ group the VS Code explorer by user-story category
- ✅ add minimum TypeScript tests for parsing, grouping, and safe rendering of the detail panel
- ✅ extend TypeScript tests to explorer grouping and MCP client payload/parsing
- ✅ add a lightweight integration harness for extension command wiring
- ✅ open each user story from the explorer in a central workflow view with per-phase detail and visible audit
- ✅ expose extension settings for provider, OpenAI-compatible connection, API key, model, and watcher
- ✅ auto-refresh from `.specs/us/**` changes when the watcher is enabled
- ✅ add `play/pause/stop` controls with best-effort `stop` on the local MCP backend
- ✅ replace the side button bar with a sidebar webview with embedded creation form
- ✅ lock the initial UX focus on active user stories; history and search stay post-MVP
- ✅ allow attaching files to a user story from workflow view and opening them from the same screen
- ✅ expose buttons to open the selected phase `execute` and `approve` prompts when they exist
- ✅ allow a user story to be marked as `starred` per user and automatically reopened in visual mode when the workspace is reopened
- ✅ suggest adding `context files` when a user story enters `clarification` because repo context is missing
- ✅ suggest `context files` candidates using local heuristics and file neighborhood
- ✅ expose persisted runtime status through MCP so a model can check whether a user story is still running
- ✅ block a second `generate_next_phase` while a recent live execution exists for the same user story
- [ ] complete rich prompt inspection/editing from the extension with diff or visible effective prompt

Pending subtasks before the MVP is considered complete:

- [ ] enrich `branch.yaml` lifecycle with real Git/PR metadata

Persistence artifacts already defined or being defined:

- ✅ `state.yaml`
- ✅ `branch.yaml`
- ✅ `timeline.md`
- ✅ essential markdown templates
