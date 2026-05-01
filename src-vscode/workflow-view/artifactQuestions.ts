export interface ArtifactQuestionBlock {
  readonly state: string | null;
  readonly decision: string | null;
  readonly reason: string | null;
  readonly questions: readonly string[];
}

export function extractArtifactQuestionBlock(markdown: string | null | undefined): ArtifactQuestionBlock | null {
  if (!markdown) {
    return null;
  }

  const normalized = markdown.replace(/\r\n/g, "\n");
  const state = readLooseMarkdownSection(normalized, ["State"]);
  const decision = readLooseMarkdownSection(normalized, ["Decision"]);
  const reason = readLooseMarkdownSection(normalized, ["Reason"]);
  const questionsSection = readLooseMarkdownSection(normalized, ["Questions"]);
  const questions = extractLooseQuestionLines(questionsSection);

  if (!state && !decision && !reason && questions.length === 0) {
    return null;
  }

  return {
    state,
    decision,
    reason,
    questions
  };
}

function readLooseMarkdownSection(markdown: string, sectionNames: readonly string[]): string | null {
  const lines = markdown.split("\n");
  const normalizedNames = sectionNames.map((name) => name.trim().toLowerCase());
  const startIndex = lines.findIndex((line) => {
    const trimmed = normalizeLooseSectionHeading(line);

    return trimmed !== null && normalizedNames.includes(trimmed);
  });

  if (startIndex < 0) {
    return null;
  }

  const content: string[] = [];

  for (let index = startIndex + 1; index < lines.length; index += 1) {
    const line = lines[index];
    const trimmed = line.trim();

    if (normalizeLooseSectionHeading(line) !== null) {
      break;
    }

    if (trimmed.length === 0) {
      if (content.length > 0) {
        content.push("");
      }

      continue;
    }

    content.push(trimmed);
  }

  return content.join("\n").trim() || null;
}

function normalizeLooseSectionHeading(line: string): string | null {
  const trimmed = line.trim();
  const match = trimmed.match(/^(?:##+\s*)?([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ\s-]+):?$/);

  if (!match) {
    return null;
  }

  return match[1].trim().toLowerCase();
}

function extractLooseQuestionLines(section: string | null): string[] {
  if (!section) {
    return [];
  }

  return section
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => line.replace(/^(?:[-*]\s+|\d+\.\s+)/, "").trim())
    .filter((line) => line.length > 0 && looksLikeUserQuestion(line));
}

function looksLikeUserQuestion(line: string): boolean {
  const normalized = line.trim();
  if (!normalized) {
    return false;
  }

  if (/[?¿]\s*$/.test(normalized)) {
    return true;
  }

  return /^(?:what|which|who|where|when|why|how|should|shall|can|could|would|will|must|is|are|do|does|did|confirm|clarify|decide|define|describe|provide|select|specify|que|qué|cual|cuál|quien|quién|donde|dónde|cuando|cuándo|por que|por qué|como|cómo|debe|deberia|debería|puede|podria|podría|sera|será|es|son|confirma|aclara|decide|define|describe|proporciona|selecciona|especifica)\b/i.test(normalized);
}
