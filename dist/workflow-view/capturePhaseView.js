"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildCapturePhaseSections = buildCapturePhaseSections;
function buildCapturePhaseSections(args) {
    const { selectedPhase, selectedArtifactContent, artifactPreviewHtml, buildArtifactPreviewSection } = args;
    const captureSourceSection = selectedPhase.phaseId === "capture" && selectedPhase.artifactPath
        ? `
      <section class="detail-card">
        <h3>User Story Source</h3>
        ${buildArtifactPreviewSection(selectedPhase.artifactPath, artifactPreviewHtml, selectedArtifactContent ?? "Artifact content unavailable.")}
      </section>
    `
        : "";
    return {
        beforeArtifact: captureSourceSection ? [captureSourceSection] : [],
        afterArtifact: []
    };
}
//# sourceMappingURL=capturePhaseView.js.map