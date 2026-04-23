"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requiresDefaultFallback = requiresDefaultFallback;
function requiresDefaultFallback(modelProfiles, phaseModelAssignments) {
    const nonEmptyProfiles = modelProfiles.filter((profile) => profile.name.trim().length > 0);
    return nonEmptyProfiles.length > 1 && !(phaseModelAssignments.defaultProfile?.trim());
}
//# sourceMappingURL=executionSettingsModel.js.map