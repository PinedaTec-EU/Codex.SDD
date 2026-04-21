import * as fs from "node:fs";
import * as path from "node:path";

type VersionDefinition = {
  readonly currentVersion?: string;
};

let cachedRuntimeVersion: string | null | undefined;

export async function readRuntimeVersionAsync(): Promise<string | null> {
  if (cachedRuntimeVersion !== undefined) {
    return cachedRuntimeVersion;
  }

  const rootDirectory = path.resolve(__dirname, "..");
  const versionInfoPath = path.join(rootDirectory, "version.nfo");
  const versionDefinitionPath = path.join(rootDirectory, "version_definition.json");

  const versionFromInfo = await tryReadTextFileAsync(versionInfoPath);
  if (versionFromInfo) {
    cachedRuntimeVersion = versionFromInfo;
    return cachedRuntimeVersion;
  }

  const versionDefinitionRaw = await tryReadTextFileAsync(versionDefinitionPath);
  if (versionDefinitionRaw) {
    try {
      const versionDefinition = JSON.parse(versionDefinitionRaw) as VersionDefinition;
      const version = versionDefinition.currentVersion?.trim();
      cachedRuntimeVersion = version && version.length > 0 ? version : null;
      return cachedRuntimeVersion;
    } catch {
      cachedRuntimeVersion = null;
      return cachedRuntimeVersion;
    }
  }

  cachedRuntimeVersion = null;
  return cachedRuntimeVersion;
}

async function tryReadTextFileAsync(filePath: string): Promise<string | null> {
  try {
    const content = await fs.promises.readFile(filePath, "utf8");
    const trimmed = content.trim();
    return trimmed.length > 0 ? trimmed : null;
  } catch {
    return null;
  }
}
