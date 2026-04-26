import * as vscode from "vscode";

function escapeCssCustomPropertyValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, "\\\"");
}

export function getEditorTypographyCssVars(): string {
  const editorConfig = vscode.workspace.getConfiguration("editor");
  const vars: string[] = [];
  const fontFamily = editorConfig.get<string>("fontFamily", "").trim();
  const fontSize = editorConfig.get<number>("fontSize");
  const lineHeight = editorConfig.get<number>("lineHeight");
  const fontLigatures = editorConfig.get<string | boolean>("fontLigatures");

  if (fontFamily) {
    vars.push(`--specforge-editor-font-family: ${escapeCssCustomPropertyValue(fontFamily)};`);
  }

  if (typeof fontSize === "number" && Number.isFinite(fontSize) && fontSize > 0) {
    vars.push(`--specforge-editor-font-size: ${fontSize}px;`);
  }

  if (typeof lineHeight === "number" && Number.isFinite(lineHeight)) {
    if (lineHeight > 8) {
      vars.push(`--specforge-editor-line-height: ${lineHeight}px;`);
    } else if (lineHeight > 0) {
      vars.push(`--specforge-editor-line-height: ${lineHeight};`);
    }
  }

  if (typeof fontLigatures === "string" && fontLigatures.trim().length > 0) {
    vars.push(`--specforge-editor-font-feature-settings: ${fontLigatures.trim()};`);
  } else if (typeof fontLigatures === "boolean") {
    vars.push(`--specforge-editor-font-variant-ligatures: ${fontLigatures ? "normal" : "none"};`);
  }

  return vars.join("\n      ");
}

export function buildWebviewTypographyRootCss(typographyCssVars = ""): string {
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
