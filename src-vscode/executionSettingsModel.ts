import type { SpecForgeModelProfile, SpecForgePhaseModelAssignments } from "./extensionSettings";

export function requiresDefaultFallback(
  modelProfiles: readonly Pick<SpecForgeModelProfile, "name">[],
  phaseModelAssignments: Pick<SpecForgePhaseModelAssignments, "defaultProfile">
): boolean {
  const nonEmptyProfiles = modelProfiles.filter((profile) => profile.name.trim().length > 0);
  return nonEmptyProfiles.length > 1 && !(phaseModelAssignments.defaultProfile?.trim());
}
