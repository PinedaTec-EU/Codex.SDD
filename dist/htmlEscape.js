"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.escapeHtml = escapeHtml;
exports.escapeHtmlAttr = escapeHtmlAttr;
function escapeHtml(value) {
    return value
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll("\"", "&quot;")
        .replaceAll("'", "&#39;");
}
function escapeHtmlAttr(value) {
    return escapeHtml(value);
}
//# sourceMappingURL=htmlEscape.js.map