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
exports.getRepoPromptsStatusAsync = getRepoPromptsStatusAsync;
const fs = __importStar(require("node:fs"));
const path = __importStar(require("node:path"));
async function getRepoPromptsStatusAsync(workspaceRoot) {
    const checkedPaths = [
        path.join(workspaceRoot, ".specs", "config.yaml"),
        path.join(workspaceRoot, ".specs", "prompts", "prompts.yaml"),
        path.join(workspaceRoot, ".specs", "prompts", "system-prompt-hashes.json"),
        path.join(workspaceRoot, ".specs", "prompts", "shared", "system.md"),
        path.join(workspaceRoot, ".specs", "prompts", "shared", "style.md"),
        path.join(workspaceRoot, ".specs", "prompts", "shared", "output-rules.md"),
        path.join(workspaceRoot, ".specs", "prompts", "phases", "refinement.execute.system.md"),
        path.join(workspaceRoot, ".specs", "prompts", "phases", "refinement.execute.md"),
        path.join(workspaceRoot, ".specs", "prompts", "phases", "spec.execute.system.md"),
        path.join(workspaceRoot, ".specs", "prompts", "phases", "spec.execute.md"),
        path.join(workspaceRoot, ".specs", "prompts", "phases", "spec.approve.system.md"),
        path.join(workspaceRoot, ".specs", "prompts", "phases", "spec.approve.md"),
        path.join(workspaceRoot, ".specs", "prompts", "phases", "technical-design.execute.system.md"),
        path.join(workspaceRoot, ".specs", "prompts", "phases", "technical-design.execute.md"),
        path.join(workspaceRoot, ".specs", "prompts", "phases", "implementation.execute.system.md"),
        path.join(workspaceRoot, ".specs", "prompts", "phases", "implementation.execute.md"),
        path.join(workspaceRoot, ".specs", "prompts", "phases", "review.execute.system.md"),
        path.join(workspaceRoot, ".specs", "prompts", "phases", "review.execute.md"),
        path.join(workspaceRoot, ".specs", "prompts", "phases", "release-approval.execute.system.md"),
        path.join(workspaceRoot, ".specs", "prompts", "phases", "release-approval.execute.md"),
        path.join(workspaceRoot, ".specs", "prompts", "phases", "release-approval.approve.system.md"),
        path.join(workspaceRoot, ".specs", "prompts", "phases", "release-approval.approve.md"),
        path.join(workspaceRoot, ".specs", "prompts", "phases", "pr-preparation.execute.system.md"),
        path.join(workspaceRoot, ".specs", "prompts", "phases", "pr-preparation.execute.md"),
        path.join(workspaceRoot, ".specs", "prompts", "phases", "refinement.auto-answer.system.md")
    ];
    void workspaceRoot;
    return {
        initialized: true,
        message: null,
        missingPaths: [],
        checkedPaths
    };
}
async function pathExistsAsync(filePath) {
    try {
        await fs.promises.access(filePath, fs.constants.F_OK);
        return true;
    }
    catch {
        return false;
    }
}
//# sourceMappingURL=repoPromptsStatus.js.map