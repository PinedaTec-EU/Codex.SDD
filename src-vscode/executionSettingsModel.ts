import type { SpecForgeModelProfile, SpecForgePhaseModelAssignments } from "./extensionSettings";

export function requiresDefaultFallback(
  modelProfiles: readonly Pick<SpecForgeModelProfile, "name">[],
  phaseModelAssignments: Pick<SpecForgePhaseModelAssignments, "defaultProfile">
): boolean {
  const nonEmptyProfiles = modelProfiles.filter((profile) => profile.name.trim().length > 0);
  return nonEmptyProfiles.length > 1 && !(phaseModelAssignments.defaultProfile?.trim());
}

type ModelDrivenPhaseAssignmentKey =
  | "clarificationProfile"
  | "refinementProfile"
  | "technicalDesignProfile"
  | "implementationProfile"
  | "reviewProfile";

type PhasePermissionRequirement = {
  readonly assignmentKey: ModelDrivenPhaseAssignmentKey;
  readonly label: string;
  readonly requiredRepositoryAccess: "read" | "read-write";
};

export type PhasePermissionIssue = {
  readonly assignmentKey: ModelDrivenPhaseAssignmentKey;
  readonly label: string;
  readonly profileName: string | null;
  readonly requiredRepositoryAccess: "read" | "read-write";
  readonly actualRepositoryAccess: string;
  readonly message: string;
};

const modelDrivenPhaseRequirements: readonly PhasePermissionRequirement[] = [
  { assignmentKey: "clarificationProfile", label: "Clarification", requiredRepositoryAccess: "read" },
  { assignmentKey: "refinementProfile", label: "Refinement", requiredRepositoryAccess: "read" },
  { assignmentKey: "technicalDesignProfile", label: "Technical Design", requiredRepositoryAccess: "read" },
  { assignmentKey: "implementationProfile", label: "Implementation", requiredRepositoryAccess: "read-write" },
  { assignmentKey: "reviewProfile", label: "Review", requiredRepositoryAccess: "read-write" }
];

export function validatePhasePermissionAssignments(
  modelProfiles: readonly Pick<SpecForgeModelProfile, "name" | "repositoryAccess">[],
  phaseModelAssignments: Pick<
    SpecForgePhaseModelAssignments,
    "defaultProfile" | ModelDrivenPhaseAssignmentKey
  >
): readonly PhasePermissionIssue[] {
  const profilesByName = new Map(
    modelProfiles
      .map((profile) => ({
        name: profile.name.trim(),
        repositoryAccess: profile.repositoryAccess.trim()
      }))
      .filter((profile) => profile.name.length > 0)
      .map((profile) => [profile.name, profile] as const)
  );
  const implicitDefaultProfileName = modelProfiles.length === 1
    ? modelProfiles[0]?.name.trim() || null
    : null;
  const defaultProfileName = phaseModelAssignments.defaultProfile?.trim() || implicitDefaultProfileName;
  const issues: PhasePermissionIssue[] = [];

  for (const requirement of modelDrivenPhaseRequirements) {
    const profileName = phaseModelAssignments[requirement.assignmentKey]?.trim() || defaultProfileName || null;
    if (!profileName) {
      continue;
    }

    const profile = profilesByName.get(profileName);
    if (!profile) {
      continue;
    }

    if (hasRequiredRepositoryAccess(profile.repositoryAccess, requirement.requiredRepositoryAccess)) {
      continue;
    }

    issues.push({
      assignmentKey: requirement.assignmentKey,
      label: requirement.label,
      profileName,
      requiredRepositoryAccess: requirement.requiredRepositoryAccess,
      actualRepositoryAccess: profile.repositoryAccess || "none",
      message: `${requirement.label} requires repository access '${requirement.requiredRepositoryAccess}', but profile '${profileName}' only grants '${profile.repositoryAccess || "none"}'.`
    });
  }

  return issues;
}

function hasRequiredRepositoryAccess(actual: string, required: "read" | "read-write"): boolean {
  if (required === "read") {
    return actual === "read" || actual === "read-write";
  }

  return actual === "read-write";
}
