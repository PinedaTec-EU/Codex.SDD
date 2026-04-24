export function summarizeMcpDiagnosticLine(line: string): string | null {
  const withoutTimestamp = line.replace(/^\[[^\]]+\]\s*/, "");
  const tagMatch = withoutTimestamp.match(/^\[(?<tag>[^\]]+)\]\s*(?<message>.*)$/);
  if (!tagMatch?.groups) {
    return null;
  }

  const tag = tagMatch.groups.tag;
  const message = tagMatch.groups.message ?? "";
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
        return `${label} process started. ${message}`;
      }

      if (message.includes(" exitCode=")) {
        return `${label} process finished. ${message}`;
      }

      if (message.includes(" canceled ")) {
        return `${label} process canceled. ${message}`;
      }

      return `${label} process update. ${message}`;
    }
    default:
      return null;
  }
}

function extractDiagnosticValue(message: string, key: string): string | null {
  const match = message.match(new RegExp(`${key}=(\"(?:\\\\.|[^\"])*\"|\\S+)`));
  if (!match) {
    return null;
  }

  return match[1] ?? null;
}

function decodeLoggedChunk(value: string | null): string | null {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  if (trimmed.startsWith("\"") && trimmed.endsWith("\"")) {
    try {
      return JSON.parse(trimmed) as string;
    } catch {
      return trimmed.slice(1, -1).replace(/\\n/g, "\n").replace(/\\"/g, "\"");
    }
  }

  return trimmed;
}
