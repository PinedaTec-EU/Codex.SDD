# SpecForge.AI Provider Notes

## UI Conventions

- Treat the workflow graph as the primary surface. The current phase must be visually unmistakable in the graph with a strong persistent indicator, not only by selection state.
- Attention states must use the repo's egg-yellow highlight. This applies in particular to `waiting-user`, `needs-user-input`, `runner:paused`, and `needs_clarification`.
- In clarification, keep the raw artifact preview visible alongside the structured questions. The raw artifact provides model context that should not be hidden behind the form.
- All clickable actions must derive from the same shared button foundation and then vary only by semantic modifier. Do not introduce ad hoc button looks per panel.
- Workflow-advancing actions must use bottle green. This includes actions such as play, approve, submit answers, apply via model, configure settings, or any other action that pushes the workflow forward.
- Cancellation, stop, reset, rejection, or regression actions must use red.
- Open, inspect, attach, or add-doc/context actions must use blue. This includes opening artifacts or prompts, opening workflow files, and attaching or adding repo context/docs.
- When updating UI in this repo, prefer extending the existing design tokens and shared classes over adding one-off colors or isolated component-specific button rules.

## Model Output Conventions

- Every model call must request structured JSON output governed by an explicit JSON schema.
- Human-facing markdown artifacts are rendered from the structured JSON after the model response is parsed and validated.
- Do not ask a model to produce markdown as the primary response format unless the call is explicitly outside the SpecForge workflow contract and the deviation is documented locally.
