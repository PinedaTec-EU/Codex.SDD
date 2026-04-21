# SpecForge.AI Provider Notes

## UI Conventions

- Treat the workflow graph as the primary surface. The current phase must be visually unmistakable in the graph with a strong persistent indicator, not only by selection state.
- Attention states must use the repo's egg-yellow highlight. This applies in particular to `waiting-user`, `needs-user-input`, `runner:paused`, and `needs_clarification`.
- In clarification, keep the raw artifact preview visible alongside the structured questions. The raw artifact provides model context that should not be hidden behind the form.
- All clickable actions must derive from the same shared button foundation and then vary only by semantic modifier such as primary, document, approve, danger, or compact. Do not introduce ad hoc button looks per panel.
- When updating UI in this repo, prefer extending the existing design tokens and shared classes over adding one-off colors or isolated component-specific button rules.
