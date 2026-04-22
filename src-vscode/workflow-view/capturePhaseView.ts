import type { UserStoryWorkflowDetails, WorkflowPhaseDetails } from "../backendClient";
import type { PhaseSectionFragments } from "./models";

interface CapturePhaseViewArgs {
  readonly workflow: UserStoryWorkflowDetails;
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
  const { workflow, selectedPhase, selectedArtifactContent, artifactPreviewHtml, buildArtifactPreviewSection } = args;
  const captureSourcePath = selectedPhase.phaseId === "capture"
    ? workflow.mainArtifactPath
    : null;
  const captureSourceSection = captureSourcePath
    ? `
      <section class="detail-card">
        <h3>User Story Source</h3>
        ${buildArtifactPreviewSection(
          captureSourcePath,
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
