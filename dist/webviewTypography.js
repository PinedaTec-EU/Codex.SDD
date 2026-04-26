"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getEditorTypographyCssVars = getEditorTypographyCssVars;
exports.buildWebviewTypographyRootCss = buildWebviewTypographyRootCss;
function escapeCssCustomPropertyValue(value) {
    return value.replace(/\\/g, "\\\\").replace(/"/g, "\\\"");
}
function getEditorTypographyCssVars() {
    const vscode = require("vscode");
    const editorConfig = vscode.workspace.getConfiguration("editor");
    const vars = [];
    const fontFamily = editorConfig.get("fontFamily", "").trim();
    const fontSize = editorConfig.get("fontSize");
    const lineHeight = editorConfig.get("lineHeight");
    const fontLigatures = editorConfig.get("fontLigatures");
    if (fontFamily) {
        vars.push(`--specforge-editor-font-family: ${escapeCssCustomPropertyValue(fontFamily)};`);
    }
    if (typeof fontSize === "number" && Number.isFinite(fontSize) && fontSize > 0) {
        vars.push(`--specforge-editor-font-size: ${fontSize}px;`);
    }
    if (typeof lineHeight === "number" && Number.isFinite(lineHeight)) {
        if (lineHeight > 8) {
            vars.push(`--specforge-editor-line-height: ${lineHeight}px;`);
        }
        else if (lineHeight > 0) {
            vars.push(`--specforge-editor-line-height: ${lineHeight};`);
        }
    }
    if (typeof fontLigatures === "string" && fontLigatures.trim().length > 0) {
        vars.push(`--specforge-editor-font-feature-settings: ${fontLigatures.trim()};`);
    }
    else if (typeof fontLigatures === "boolean") {
        vars.push(`--specforge-editor-font-variant-ligatures: ${fontLigatures ? "normal" : "none"};`);
    }
    return vars.join("\n      ");
}
function buildWebviewTypographyRootCss(typographyCssVars = "") {
    return `color-scheme: light dark;
      --specforge-editor-font-family: var(--vscode-editor-font-family, var(--vscode-font-family, "Segoe UI", ui-sans-serif, sans-serif));
      --specforge-editor-font-size: var(--vscode-editor-font-size, 13px);
      --specforge-editor-line-height: var(--vscode-editor-line-height, 1.5);
      --specforge-editor-font-feature-settings: normal;
      --specforge-editor-font-variant-ligatures: normal;
      --specforge-mono-font-family: ui-monospace, "SF Mono", Menlo, monospace;
      ${typographyCssVars}
      font-family: var(--specforge-editor-font-family);
      font-size: var(--specforge-editor-font-size);
      line-height: var(--specforge-editor-line-height);
      font-feature-settings: var(--specforge-editor-font-feature-settings);
      font-variant-ligatures: var(--specforge-editor-font-variant-ligatures);`;
}
//# sourceMappingURL=webviewTypography.js.map