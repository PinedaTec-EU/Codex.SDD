"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.summarizeMcpDiagnosticLine = summarizeMcpDiagnosticLine;
exports.parseModelResponseDiagnosticLine = parseModelResponseDiagnosticLine;
function summarizeMcpDiagnosticLine(line) {
    const withoutTimestamp = line.replace(/^\[[^\]]+\]\s*/, "");
    const tagMatch = withoutTimestamp.match(/^\[(?<tag>[^\]]+)\]\s*(?<message>.*)$/);
    if (!tagMatch?.groups) {
        return null;
    }
    const tag = tagMatch.groups.tag;
    const message = tagMatch.groups.message ?? "";
    if (tag === "provider.model.response") {
        const provider = extractDiagnosticValue(message, "provider") ?? "model";
        const transport = extractDiagnosticValue(message, "transport") ?? "unknown";
        const mode = extractDiagnosticValue(message, "mode") ?? "complete";
        const chunk = decodeLoggedChunk(extractDiagnosticValue(message, "chunk"));
        return `${provider} ${transport} ${mode} response: ${truncateDiagnosticMessage(chunk ?? "")}`;
    }
    if (!tag.startsWith("provider.native")) {
        return null;
    }
    const provider = extractDiagnosticValue(message, "provider") ?? "native";
    const label = provider.charAt(0).toUpperCase() + provider.slice(1);
    switch (tag) {
        case "provider.native.cli":
            return `${label} CLI execution started. ${message}`;
        case "provider.native":
            return `${label} native execution selected. ${message}`;
        case "provider.native.check":
            return `${label} CLI health check finished. ${message}`;
        case "provider.native.exec.stdout":
        case "provider.native.exec.stderr": {
            const stream = tag.endsWith(".stdout") ? "stdout" : "stderr";
            const chunk = decodeLoggedChunk(extractDiagnosticValue(message, "chunk"));
            if (!chunk) {
                return `${label} ${stream} produced output.`;
            }
            return `${label} ${stream}: ${chunk}`;
        }
        case "provider.native.exec": {
            if (message.includes(" no stdout/stderr for ")) {
                return `${label} CLI still running without output. ${message}`;
            }
            if (message.includes(" started.")) {
                return `${label} process started. ${truncateDiagnosticMessage(message)}`;
            }
            if (message.includes(" exitCode=")) {
                return `${label} process finished. ${truncateDiagnosticMessage(message)}`;
            }
            if (message.includes(" canceled ")) {
                return `${label} process canceled. ${truncateDiagnosticMessage(message)}`;
            }
            return `${label} process update. ${truncateDiagnosticMessage(message)}`;
        }
        default:
            return null;
    }
}
function parseModelResponseDiagnosticLine(line) {
    const withoutTimestamp = line.replace(/^\[[^\]]+\]\s*/, "");
    const tagMatch = withoutTimestamp.match(/^\[(?<tag>[^\]]+)\]\s*(?<message>.*)$/);
    if (!tagMatch?.groups || tagMatch.groups.tag !== "provider.model.response") {
        return null;
    }
    const message = tagMatch.groups.message ?? "";
    const text = decodeLoggedChunk(extractDiagnosticValue(message, "chunk"));
    if (!text) {
        return null;
    }
    return {
        providerKind: extractDiagnosticValue(message, "provider") ?? "model",
        transport: extractDiagnosticValue(message, "transport") ?? "unknown",
        mode: extractModelResponseMode(extractDiagnosticValue(message, "mode")),
        text
    };
}
function extractModelResponseMode(value) {
    return value === "delta" ? "delta" : "complete";
}
function extractDiagnosticValue(message, key) {
    const match = message.match(new RegExp(`${key}=(\"(?:\\\\.|[^\"])*\"|\\S+)`));
    if (!match) {
        return null;
    }
    return match[1] ?? null;
}
function decodeLoggedChunk(value) {
    if (!value) {
        return null;
    }
    const trimmed = value.trim();
    if (!trimmed) {
        return null;
    }
    if (trimmed.startsWith("\"") && trimmed.endsWith("\"")) {
        try {
            return JSON.parse(trimmed);
        }
        catch {
            return trimmed.slice(1, -1).replace(/\\n/g, "\n").replace(/\\"/g, "\"");
        }
    }
    return trimmed;
}
function truncateDiagnosticMessage(message) {
    const maxLength = 240;
    if (message.length <= maxLength) {
        return message;
    }
    return `${message.slice(0, maxLength)}...`;
}
//# sourceMappingURL=mcpDiagnostics.js.map