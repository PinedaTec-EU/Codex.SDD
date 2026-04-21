import * as fs from "node:fs";
import * as path from "node:path";

export function asErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return "Unknown error.";
}

export async function getNextAttachmentPathAsync(directoryPath: string, fileName: string): Promise<string> {
  const extension = path.extname(fileName);
  const baseName = extension.length > 0 ? fileName.slice(0, -extension.length) : fileName;

  for (let version = 1; version <= 100; version++) {
    const suffix = version === 1 ? "" : `.v${String(version).padStart(2, "0")}`;
    const candidate = path.join(directoryPath, `${baseName}${suffix}${extension}`);
    try {
      await fs.promises.access(candidate, fs.constants.F_OK);
    } catch {
      return candidate;
    }
  }

  throw new Error(`Unable to allocate path for '${fileName}' after 100 attempts.`);
}
