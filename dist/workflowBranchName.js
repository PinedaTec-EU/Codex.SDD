"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildWorkBranchProposal = buildWorkBranchProposal;
function buildShortSlug(value) {
    return value
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "");
}
function stripDuplicatePrefix(slug, prefix) {
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
function buildWorkBranchProposal(usId, title, kind) {
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
//# sourceMappingURL=workflowBranchName.js.map