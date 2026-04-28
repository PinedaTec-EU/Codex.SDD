"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.readUserWorkspacePreferences = readUserWorkspacePreferences;
exports.writeUserWorkspacePreferences = writeUserWorkspacePreferences;
exports.setStarredUserStory = setStarredUserStory;
exports.setPausedWorkflowPhaseIds = setPausedWorkflowPhaseIds;
exports.getUserWorkspacePreferencesPath = getUserWorkspacePreferencesPath;
const fs = __importStar(require("node:fs"));
const os = __importStar(require("node:os"));
const path = __importStar(require("node:path"));
const defaultPreferences = {
    starredUserStoryId: null,
    pausedWorkflowPhaseIdsByUsId: {}
};
async function readUserWorkspacePreferences(workspaceRoot) {
    const filePath = getUserWorkspacePreferencesPath(workspaceRoot);
    try {
        const raw = await fs.promises.readFile(filePath, "utf8");
        const parsed = JSON.parse(raw);
        return {
            starredUserStoryId: typeof parsed?.starredUserStoryId === "string" && parsed.starredUserStoryId.trim().length > 0
                ? parsed.starredUserStoryId.trim()
                : null,
            pausedWorkflowPhaseIdsByUsId: normalizePausedWorkflowPhaseIdsByUsId(parsed?.pausedWorkflowPhaseIdsByUsId)
        };
    }
    catch {
        return defaultPreferences;
    }
}
async function writeUserWorkspacePreferences(workspaceRoot, preferences) {
    const filePath = getUserWorkspacePreferencesPath(workspaceRoot);
    await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
    await fs.promises.writeFile(filePath, `${JSON.stringify(preferences, null, 2)}\n`, "utf8");
}
async function setStarredUserStory(workspaceRoot, usId) {
    const preferences = await readUserWorkspacePreferences(workspaceRoot);
    await writeUserWorkspacePreferences(workspaceRoot, {
        ...preferences,
        starredUserStoryId: usId?.trim() || null
    });
}
async function setPausedWorkflowPhaseIds(workspaceRoot, usId, phaseIds) {
    const preferences = await readUserWorkspacePreferences(workspaceRoot);
    const normalizedUsId = usId.trim();
    if (!normalizedUsId) {
        return;
    }
    const nextPausedWorkflowPhaseIdsByUsId = {
        ...preferences.pausedWorkflowPhaseIdsByUsId
    };
    const normalizedPhaseIds = [...new Set(phaseIds
            .map((phaseId) => phaseId.trim())
            .filter((phaseId) => phaseId.length > 0))];
    if (normalizedPhaseIds.length > 0) {
        nextPausedWorkflowPhaseIdsByUsId[normalizedUsId] = normalizedPhaseIds;
    }
    else {
        delete nextPausedWorkflowPhaseIdsByUsId[normalizedUsId];
    }
    await writeUserWorkspacePreferences(workspaceRoot, {
        ...preferences,
        pausedWorkflowPhaseIdsByUsId: nextPausedWorkflowPhaseIdsByUsId
    });
}
function normalizePausedWorkflowPhaseIdsByUsId(value) {
    if (!value || typeof value !== "object") {
        return {};
    }
    const result = {};
    for (const [usId, phaseIds] of Object.entries(value)) {
        if (typeof usId !== "string" || !Array.isArray(phaseIds)) {
            continue;
        }
        const normalizedUsId = usId.trim();
        const normalizedPhaseIds = [...new Set(phaseIds
                .filter((phaseId) => typeof phaseId === "string")
                .map((phaseId) => phaseId.trim())
                .filter((phaseId) => phaseId.length > 0))];
        if (!normalizedUsId || normalizedPhaseIds.length === 0) {
            continue;
        }
        result[normalizedUsId] = normalizedPhaseIds;
    }
    return result;
}
function getUserWorkspacePreferencesPath(workspaceRoot) {
    return path.join(workspaceRoot, ".specs", "users", normalizeUserSegment(os.userInfo().username), "vscode-preferences.json");
}
function normalizeUserSegment(userName) {
    return userName
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9._-]+/g, "-")
        .replace(/^-+|-+$/g, "")
        || "unknown-user";
}
//# sourceMappingURL=userWorkspacePreferences.js.map