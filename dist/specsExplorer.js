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
exports.SpecsExplorerProvider = exports.UserStoryTreeItem = void 0;
exports.createUserStoryFromInput = createUserStoryFromInput;
exports.importUserStoryFromMarkdown = importUserStoryFromMarkdown;
exports.openMainArtifact = openMainArtifact;
exports.continuePhase = continuePhase;
const fs = __importStar(require("node:fs"));
const path = __importStar(require("node:path"));
const vscode = __importStar(require("vscode"));
const SPECS_RELATIVE_DIR = path.join(".specs", "us");
class UserStoryTreeItem extends vscode.TreeItem {
    summary;
    contextValue = "userStory";
    constructor(summary) {
        super(summary.usId, vscode.TreeItemCollapsibleState.None);
        this.summary = summary;
        this.description = `${summary.currentPhase} · ${summary.status}`;
        this.tooltip = summary.title;
        this.command = {
            command: "specForge.openMainArtifact",
            title: "Open Main Artifact",
            arguments: [summary]
        };
    }
}
exports.UserStoryTreeItem = UserStoryTreeItem;
class SpecsExplorerProvider {
    onDidChangeTreeDataEmitter = new vscode.EventEmitter();
    onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event;
    refresh() {
        this.onDidChangeTreeDataEmitter.fire(undefined);
    }
    getTreeItem(element) {
        return element;
    }
    async getChildren() {
        const workspaceRoot = getWorkspaceRoot();
        if (!workspaceRoot) {
            return [];
        }
        const summaries = await loadUserStories(workspaceRoot);
        return summaries.map((summary) => new UserStoryTreeItem(summary));
    }
}
exports.SpecsExplorerProvider = SpecsExplorerProvider;
async function createUserStoryFromInput() {
    const workspaceRoot = getWorkspaceRoot();
    if (!workspaceRoot) {
        void vscode.window.showWarningMessage("Open a workspace folder before creating a user story.");
        return;
    }
    const title = await vscode.window.showInputBox({
        prompt: "User story title",
        ignoreFocusOut: true,
        validateInput: (value) => value.trim().length > 0 ? undefined : "Title is required."
    });
    if (!title) {
        return;
    }
    const sourceText = await vscode.window.showInputBox({
        prompt: "User story objective or initial source text",
        ignoreFocusOut: true,
        validateInput: (value) => value.trim().length > 0 ? undefined : "Source text is required."
    });
    if (!sourceText) {
        return;
    }
    const usId = await nextUserStoryId(workspaceRoot);
    const userStoryDir = path.join(workspaceRoot, SPECS_RELATIVE_DIR, `us.${usId}`);
    const phasesDir = path.join(userStoryDir, "phases");
    await fs.promises.mkdir(phasesDir, { recursive: true });
    await fs.promises.writeFile(path.join(userStoryDir, "us.md"), buildUserStoryMarkdown(usId, title, sourceText), "utf8");
    await fs.promises.writeFile(path.join(userStoryDir, "state.yaml"), buildInitialStateYaml(usId, sourceText), "utf8");
    await fs.promises.writeFile(path.join(userStoryDir, "timeline.md"), buildInitialTimelineMarkdown(usId, title), "utf8");
    await openTextDocument(path.join(userStoryDir, "us.md"));
}
async function importUserStoryFromMarkdown() {
    const workspaceRoot = getWorkspaceRoot();
    if (!workspaceRoot) {
        void vscode.window.showWarningMessage("Open a workspace folder before importing a user story.");
        return;
    }
    const selection = await vscode.window.showOpenDialog({
        canSelectFiles: true,
        canSelectFolders: false,
        canSelectMany: false,
        openLabel: "Import user story markdown",
        filters: {
            Markdown: ["md"]
        }
    });
    const sourceUri = selection?.[0];
    if (!sourceUri) {
        return;
    }
    const sourceText = await fs.promises.readFile(sourceUri.fsPath, "utf8");
    const firstHeading = sourceText.split(/\r?\n/).find((line) => line.startsWith("# ")) ?? "# Imported user story";
    const title = firstHeading.replace(/^#\s+/, "").trim();
    const usId = await nextUserStoryId(workspaceRoot);
    const userStoryDir = path.join(workspaceRoot, SPECS_RELATIVE_DIR, `us.${usId}`);
    const phasesDir = path.join(userStoryDir, "phases");
    await fs.promises.mkdir(phasesDir, { recursive: true });
    await fs.promises.writeFile(path.join(userStoryDir, "us.md"), sourceText, "utf8");
    await fs.promises.writeFile(path.join(userStoryDir, "state.yaml"), buildInitialStateYaml(usId, sourceText), "utf8");
    await fs.promises.writeFile(path.join(userStoryDir, "timeline.md"), buildInitialTimelineMarkdown(usId, title), "utf8");
    await openTextDocument(path.join(userStoryDir, "us.md"));
}
async function openMainArtifact(summary) {
    if (!summary) {
        void vscode.window.showInformationMessage("Select a user story first.");
        return;
    }
    await openTextDocument(summary.mainArtifactPath);
}
async function continuePhase(summary) {
    if (!summary) {
        void vscode.window.showInformationMessage("Select a user story first.");
        return;
    }
    void vscode.window.showWarningMessage(`Continue phase is registered for ${summary.usId}, but execution still requires MCP backend wiring.`);
}
function getWorkspaceRoot() {
    return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}
async function loadUserStories(workspaceRoot) {
    const specsRoot = path.join(workspaceRoot, SPECS_RELATIVE_DIR);
    try {
        const entries = await fs.promises.readdir(specsRoot, { withFileTypes: true });
        const summaries = await Promise.all(entries
            .filter((entry) => entry.isDirectory() && entry.name.startsWith("us."))
            .map(async (entry) => loadUserStorySummary(path.join(specsRoot, entry.name))));
        return summaries.sort((left, right) => left.usId.localeCompare(right.usId));
    }
    catch (error) {
        if (isNodeError(error) && error.code === "ENOENT") {
            return [];
        }
        throw error;
    }
}
async function loadUserStorySummary(userStoryDir) {
    const mainArtifactPath = path.join(userStoryDir, "us.md");
    const statePath = path.join(userStoryDir, "state.yaml");
    const [mainArtifactContent, stateContent] = await Promise.all([
        fs.promises.readFile(mainArtifactPath, "utf8"),
        readIfExists(statePath)
    ]);
    const title = mainArtifactContent.split(/\r?\n/).find((line) => line.startsWith("# "))?.replace(/^#\s+/, "").trim()
        ?? path.basename(userStoryDir);
    const usId = parseScalar(stateContent, "usId") ?? path.basename(userStoryDir).replace(/^us\./, "");
    const currentPhase = parseScalar(stateContent, "currentPhase") ?? "capture";
    const status = parseScalar(stateContent, "status") ?? "draft";
    return {
        usId,
        title,
        directoryPath: userStoryDir,
        mainArtifactPath,
        currentPhase,
        status
    };
}
async function nextUserStoryId(workspaceRoot) {
    const summaries = await loadUserStories(workspaceRoot);
    const maxValue = summaries
        .map((summary) => /^US-(\d+)$/.exec(summary.usId))
        .filter((match) => match !== null)
        .map((match) => Number.parseInt(match[1], 10))
        .reduce((currentMax, value) => Math.max(currentMax, value), 0);
    return `US-${String(maxValue + 1).padStart(4, "0")}`;
}
async function readIfExists(filePath) {
    try {
        return await fs.promises.readFile(filePath, "utf8");
    }
    catch (error) {
        if (isNodeError(error) && error.code === "ENOENT") {
            return "";
        }
        throw error;
    }
}
function parseScalar(yaml, key) {
    const pattern = new RegExp(`^${escapeRegExp(key)}:\\s*(.+)$`, "m");
    const match = pattern.exec(yaml);
    return match?.[1]?.trim();
}
function buildUserStoryMarkdown(usId, title, sourceText) {
    return [
        `# ${usId} · ${title}`,
        "",
        "## Objective",
        sourceText,
        "",
        "## Initial Scope",
        "- Includes:",
        "  - ...",
        "- Excludes:",
        "  - ..."
    ].join("\n");
}
function buildInitialStateYaml(usId, sourceText) {
    return [
        `usId: ${usId}`,
        "workflowId: canonical-v1",
        "status: draft",
        "currentPhase: capture",
        `sourceHash: local:${Buffer.from(sourceText, "utf8").toString("base64url")}`,
        "approvedPhases:",
        "  []"
    ].join("\n") + "\n";
}
function buildInitialTimelineMarkdown(usId, title) {
    const timestamp = new Date().toISOString();
    return [
        `# Timeline · ${usId} · ${title}`,
        "",
        "## Resumen",
        "",
        "- Estado actual: `draft`",
        "- Fase actual: `capture`",
        "- Rama activa: `sin crear`",
        `- Última actualización: \`${timestamp}\``,
        "",
        "## Eventos",
        "",
        `### ${timestamp} · \`us_created\``,
        "",
        "- Actor: `user`",
        "- Fase: `capture`",
        "- Resumen: Se creó la US inicial y se persistieron `us.md`, `state.yaml` y `timeline.md`."
    ].join("\n");
}
async function openTextDocument(filePath) {
    const document = await vscode.workspace.openTextDocument(filePath);
    await vscode.window.showTextDocument(document, { preview: false });
}
function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function isNodeError(error) {
    return typeof error === "object" && error !== null && "code" in error;
}
//# sourceMappingURL=specsExplorer.js.map