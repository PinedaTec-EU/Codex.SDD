"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.renderMarkdownToHtml = renderMarkdownToHtml;
function renderMarkdownToHtml(markdown) {
    const normalized = markdown.replace(/\r\n/g, "\n").trim();
    if (normalized.length === 0) {
        return "<p>Artifact content unavailable.</p>";
    }
    const lines = normalized.split("\n");
    const html = [];
    let index = 0;
    while (index < lines.length) {
        const line = lines[index];
        if (!line.trim()) {
            index++;
            continue;
        }
        if (/^```/.test(line.trim())) {
            const language = line.trim().slice(3).trim();
            index++;
            const codeLines = [];
            while (index < lines.length && !/^```/.test(lines[index].trim())) {
                codeLines.push(lines[index]);
                index++;
            }
            if (index < lines.length) {
                index++;
            }
            html.push(`<pre><code${language ? ` data-language="${(0, htmlEscape_1.escapeHtmlAttr)(language)}"` : ""}>${(0, htmlEscape_1.escapeHtml)(codeLines.join("\n"))}</code></pre>`);
            continue;
        }
        if (/^#{1,6}\s/.test(line)) {
            const match = /^(#{1,6})\s+(.*)$/.exec(line);
            if (match) {
                const level = match[1].length;
                html.push(`<h${level}>${renderInlineMarkdown(match[2])}</h${level}>`);
            }
            index++;
            continue;
        }
        if (/^\s*([-*_])(?:\s*\1){2,}\s*$/.test(line)) {
            html.push("<hr />");
            index++;
            continue;
        }
        if (isMarkdownTable(lines, index)) {
            const { html: tableHtml, nextIndex } = renderMarkdownTable(lines, index);
            html.push(tableHtml);
            index = nextIndex;
            continue;
        }
        if (/^\s*>\s?/.test(line)) {
            const quoteLines = [];
            while (index < lines.length && /^\s*>\s?/.test(lines[index])) {
                quoteLines.push(lines[index].replace(/^\s*>\s?/, ""));
                index++;
            }
            html.push(`<blockquote>${renderMarkdownToHtml(quoteLines.join("\n"))}</blockquote>`);
            continue;
        }
        if (/^\s*[-*+]\s+/.test(line)) {
            const { html: listHtml, nextIndex } = renderMarkdownList(lines, index, false);
            html.push(listHtml);
            index = nextIndex;
            continue;
        }
        if (/^\s*\d+\.\s+/.test(line)) {
            const { html: listHtml, nextIndex } = renderMarkdownList(lines, index, true);
            html.push(listHtml);
            index = nextIndex;
            continue;
        }
        const paragraphLines = [];
        while (index < lines.length && lines[index].trim()) {
            if (/^```/.test(lines[index].trim())
                || /^#{1,6}\s/.test(lines[index])
                || /^\s*>\s?/.test(lines[index])
                || /^\s*[-*+]\s+/.test(lines[index])
                || /^\s*\d+\.\s+/.test(lines[index])
                || /^\s*([-*_])(?:\s*\1){2,}\s*$/.test(lines[index])
                || isMarkdownTable(lines, index)) {
                break;
            }
            paragraphLines.push(lines[index].trim());
            index++;
        }
        html.push(`<p>${renderInlineMarkdown(paragraphLines.join(" "))}</p>`);
    }
    return html.join("\n");
}
function renderMarkdownList(lines, startIndex, ordered) {
    const items = [];
    let index = startIndex;
    const pattern = ordered ? /^\s*\d+\.\s+(.*)$/ : /^\s*[-*+]\s+(.*)$/;
    while (index < lines.length) {
        const match = pattern.exec(lines[index]);
        if (!match) {
            break;
        }
        items.push(`<li>${renderInlineMarkdown(match[1].trim())}</li>`);
        index++;
    }
    return {
        html: `<${ordered ? "ol" : "ul"}>${items.join("")}</${ordered ? "ol" : "ul"}>`,
        nextIndex: index
    };
}
function isMarkdownTable(lines, index) {
    if (index + 1 >= lines.length) {
        return false;
    }
    const header = lines[index].trim();
    const separator = lines[index + 1].trim();
    return header.includes("|") && /^\|?[\s:-]+(?:\|[\s:-]+)+\|?$/.test(separator);
}
function renderMarkdownTable(lines, startIndex) {
    const headerCells = splitMarkdownTableRow(lines[startIndex]);
    let index = startIndex + 2;
    const bodyRows = [];
    while (index < lines.length && lines[index].trim().includes("|") && !/^\s*$/.test(lines[index])) {
        const rowCells = splitMarkdownTableRow(lines[index]);
        bodyRows.push(`<tr>${rowCells.map((cell) => `<td>${renderInlineMarkdown(cell)}</td>`).join("")}</tr>`);
        index++;
    }
    return {
        html: `
      <table>
        <thead><tr>${headerCells.map((cell) => `<th>${renderInlineMarkdown(cell)}</th>`).join("")}</tr></thead>
        <tbody>${bodyRows.join("")}</tbody>
      </table>
    `,
        nextIndex: index
    };
}
function splitMarkdownTableRow(row) {
    return row
        .trim()
        .replace(/^\|/, "")
        .replace(/\|$/, "")
        .split("|")
        .map((cell) => cell.trim());
}
function renderInlineMarkdown(text) {
    let html = (0, htmlEscape_1.escapeHtml)(text);
    html = html.replace(/`([^`]+)`/g, "<code>$1</code>");
    html = html.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+\"([^\"]*)\")?\)/g, (_match, label, href) => {
        const safeHref = (0, htmlEscape_1.escapeHtmlAttr)(href);
        return `<a href="${safeHref}">${label}</a>`;
    });
    html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    html = html.replace(/__([^_]+)__/g, "<strong>$1</strong>");
    html = html.replace(/(^|[\s(])\*([^*]+)\*(?=[\s).,!?:;]|$)/g, "$1<em>$2</em>");
    html = html.replace(/(^|[\s(])_([^_]+)_(?=[\s).,!?:;]|$)/g, "$1<em>$2</em>");
    return html;
}
const htmlEscape_1 = require("../htmlEscape");
//# sourceMappingURL=markdownRenderer.js.map