import test from "node:test";
import assert from "node:assert/strict";
import { extractArtifactQuestionBlock } from "../src-vscode/workflow-view/artifactQuestions";

test("extractArtifactQuestionBlock ignores answer option lists inside Questions", () => {
  const block = extractArtifactQuestionBlock(`
## State
- State: \`pending_approval\`

## Decision
needs_refinement

## Reason
The answer captured provider-specific options that are explicitly out of scope.

## Questions
si, conviene dejar el modelo preparado para parametros provider-specific, pero fuera de alcance para esta historia. Candidatos razonables:

topK
presencePenalty
frequencyPenalty
repetitionPenalty
seed
maxOutputTokens
stopSequences
provider-specific raw options o metadata validada por proveedor
`);

  assert.deepEqual(block?.questions, []);
});

test("extractArtifactQuestionBlock keeps concrete pending questions", () => {
  const block = extractArtifactQuestionBlock(`
## Decision
needs_refinement

## Questions
1. Should provider-specific parameters be stored now?
2. Confirm whether max output tokens must be user configurable.
- Specify the validation owner for provider metadata.
`);

  assert.deepEqual(block?.questions, [
    "Should provider-specific parameters be stored now?",
    "Confirm whether max output tokens must be user configurable.",
    "Specify the validation owner for provider metadata."
  ]);
});
