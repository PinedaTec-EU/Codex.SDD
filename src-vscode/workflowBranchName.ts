function buildShortSlug(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function stripDuplicatePrefix(slug: string, prefix: string): string {
  if (!prefix) {
    return slug;
  }

  let nextSlug = slug;
  while (nextSlug === prefix || nextSlug.startsWith(`${prefix}-`)) {
    nextSlug = nextSlug === prefix
      ? ""
      : nextSlug.slice(prefix.length + 1);
  }

  return nextSlug;
}

export function buildWorkBranchProposal(usId: string, title: string, kind: string): string {
  const normalizedUsId = usId.trim().toLowerCase();
  const normalizedKind = (kind.trim().toLowerCase() || "feature");
  let slug = buildShortSlug(title);

  slug = stripDuplicatePrefix(slug, normalizedKind);
  slug = stripDuplicatePrefix(slug, normalizedUsId);
  slug = stripDuplicatePrefix(slug, normalizedKind);

  if (!slug) {
    slug = "work";
  }

  return `${normalizedKind}/${normalizedUsId}-${slug}`;
}
