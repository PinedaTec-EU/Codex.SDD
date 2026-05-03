"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requiresDefaultFallback = requiresDefaultFallback;
exports.validatePhasePermissionAssignments = validatePhasePermissionAssignments;
function requiresDefaultFallback(agentProfiles, phaseAgentAssignments) {
    const nonEmptyProfiles = agentProfiles.filter((profile) => profile.name.trim().length > 0);
    return nonEmptyProfiles.length > 1 && !(phaseAgentAssignments.defaultAgent?.trim());
}
const modelDrivenPhaseRequirements = [
    { assignmentKey: "refinementAgent", label: "Refinement", requiredRepositoryAccess: "read" },
    { assignmentKey: "specAgent", label: "Spec", requiredRepositoryAccess: "read" },
    { assignmentKey: "technicalDesignAgent", label: "Technical Design", requiredRepositoryAccess: "read" },
    { assignmentKey: "implementationAgent", label: "Implementation", requiredRepositoryAccess: "read-write" },
    { assignmentKey: "reviewAgent", label: "Review", requiredRepositoryAccess: "read-write" },
    { assignmentKey: "releaseApprovalAgent", label: "Release Approval", requiredRepositoryAccess: "read" },
    { assignmentKey: "prPreparationAgent", label: "PR Preparation", requiredRepositoryAccess: "read" }
];
function validatePhasePermissionAssignments(agentProfiles, phaseAgentAssignments) {
    const agentsByName = new Map(agentProfiles
        .map((profile) => ({
        name: profile.name.trim(),
        repositoryAccess: profile.repositoryAccess.trim()
    }))
        .filter((profile) => profile.name.length > 0)
        .map((profile) => [profile.name, profile]));
    const implicitDefaultAgentName = agentProfiles.length === 1
        ? agentProfiles[0]?.name.trim() || null
        : null;
    const defaultAgentName = phaseAgentAssignments.defaultAgent?.trim() || implicitDefaultAgentName;
    const issues = [];
    for (const requirement of modelDrivenPhaseRequirements) {
        const agentName = phaseAgentAssignments[requirement.assignmentKey]?.trim() || defaultAgentName || null;
        if (!agentName) {
            continue;
        }
        const agent = agentsByName.get(agentName);
        if (!agent) {
            continue;
        }
        if (hasRequiredRepositoryAccess(agent.repositoryAccess, requirement.requiredRepositoryAccess)) {
            continue;
        }
        issues.push({
            assignmentKey: requirement.assignmentKey,
            label: requirement.label,
            profileName: agentName,
            requiredRepositoryAccess: requirement.requiredRepositoryAccess,
            actualRepositoryAccess: agent.repositoryAccess || "none",
            message: `${requirement.label} requires repository access '${requirement.requiredRepositoryAccess}', but agent '${agentName}' only grants '${agent.repositoryAccess || "none"}'.`
        });
    }
    return issues;
}
function hasRequiredRepositoryAccess(actual, required) {
    if (required === "read") {
        return actual === "read" || actual === "read-write";
    }
    return actual === "read-write";
}
//# sourceMappingURL=executionSettingsModel.js.map