"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildCapturePhaseSections = buildCapturePhaseSections;
function buildCapturePhaseSections(args) {
    const { workflow, selectedPhase, selectedArtifactContent, artifactPreviewHtml, buildArtifactPreviewSection } = args;
    const captureSourcePath = selectedPhase.phaseId === "capture"
        ? workflow.mainArtifactPath
        : null;
    const captureSourceSection = captureSourcePath
        ? `
      <section class="detail-card">
        <h3>User Story Source</h3>
        ${buildArtifactPreviewSection(captureSourcePath, artifactPreviewHtml, selectedArtifactContent ?? "Artifact content unavailable.")}
      </section>
    `
        : "";
    return {
        beforeArtifact: captureSourceSection ? [captureSourceSection] : [],
        afterArtifact: []
    };
}
//# sourceMappingURL=capturePhaseView.js.map