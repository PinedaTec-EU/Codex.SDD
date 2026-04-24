"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.escapeHtml = void 0;
exports.buildUserStoryDetailsHtml = buildUserStoryDetailsHtml;
const htmlEscape_1 = require("./htmlEscape");
Object.defineProperty(exports, "escapeHtml", { enumerable: true, get: function () { return htmlEscape_1.escapeHtml; } });
const PHASES = [
    "capture",
    "clarification",
    "refinement",
    "technical-design",
    "implementation",
    "review",
    "release-approval",
    "pr-preparation"
];
function buildUserStoryDetailsHtml(summary) {
    const phaseItems = PHASES.map((phase) => {
        const isCurrent = phase === summary.currentPhase;
        return `<li class="${isCurrent ? "current" : ""}">${isCurrent ? "●" : "○"} ${phase}</li>`;
    }).join("");
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>
    :root {
      color-scheme: light dark;
      font-family: ui-monospace, "SF Mono", Menlo, monospace;
    }
    body {
      padding: 20px;
      line-height: 1.5;
    }
    h1, h2 {
      font-weight: 700;
    }
    ul {
      padding-left: 18px;
    }
    .current {
      font-weight: 700;
    }
    .meta {
      margin-bottom: 16px;
    }
    code {
      font-size: 0.95em;
    }
  </style>
</head>
<body>
  <h1>${(0, htmlEscape_1.escapeHtml)(summary.usId)}</h1>
  <div class="meta">
    <div><strong>Title:</strong> ${(0, htmlEscape_1.escapeHtml)(summary.title)}</div>
    <div><strong>Category:</strong> <code>${(0, htmlEscape_1.escapeHtml)(summary.category)}</code></div>
    <div><strong>Status:</strong> <code>${(0, htmlEscape_1.escapeHtml)(summary.status)}</code></div>
    <div><strong>Current phase:</strong> <code>${(0, htmlEscape_1.escapeHtml)(summary.currentPhase)}</code></div>
    <div><strong>Branch:</strong> <code>${(0, htmlEscape_1.escapeHtml)(summary.workBranch ?? "not-created")}</code></div>
    <div><strong>Main artifact:</strong> <code>${(0, htmlEscape_1.escapeHtml)(summary.mainArtifactPath)}</code></div>
  </div>
  <h2>Workflow</h2>
  <ul>${phaseItems}</ul>
  <h2>Next action</h2>
  <p>Use <code>Continue Phase</code> when the current phase can advance, or <code>Approve Current Phase</code> only when the workflow is at a human checkpoint.</p>
</body>
</html>`;
}
//# sourceMappingURL=detailsView.js.map