import type { WorkflowPhaseDetails } from "../backendClient";
import type { PhaseSectionFragments } from "./models";

interface CapturePhaseViewArgs {
  readonly selectedPhase: WorkflowPhaseDetails;
  readonly selectedArtifactContent: string | null;
  readonly artifactPreviewHtml: string | null;
  readonly buildArtifactPreviewSection: (
    artifactPath: string,
    artifactPreviewHtml: string | null,
    artifactContent: string,
    options?: {
      readonly rawArtifact?: boolean;
      readonly footerNote?: string;
    }
  ) => string;
}

export function buildCapturePhaseSections(args: CapturePhaseViewArgs): PhaseSectionFragments {
  const { selectedPhase, selectedArtifactContent, artifactPreviewHtml, buildArtifactPreviewSection } = args;
  const captureSourceSection = selectedPhase.phaseId === "capture" && selectedPhase.artifactPath
    ? `
      <section class="detail-card">
        <h3>User Story Source</h3>
        ${buildArtifactPreviewSection(
          selectedPhase.artifactPath,
          artifactPreviewHtml,
          selectedArtifactContent ?? "Artifact content unavailable."
        )}
      </section>
    `
    : "";

  return {
    beforeArtifact: captureSourceSection ? [captureSourceSection] : [],
    afterArtifact: []
  };
}
