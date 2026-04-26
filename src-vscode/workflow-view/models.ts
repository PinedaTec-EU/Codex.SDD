import type { SuggestedContextFile } from "../contextSuggestions";

export interface WorkflowViewState {
  readonly selectedPhaseId: string;
  readonly selectedIterationKey?: string | null;
  readonly expandedIterationPhaseIds?: readonly string[];
  readonly selectedArtifactContent: string | null;
  readonly selectedIterationContextArtifacts?: readonly {
    readonly path: string;
    readonly content: string | null;
  }[];
  readonly selectedOperationContent?: string | null;
  readonly contextSuggestions: readonly SuggestedContextFile[];
  readonly settingsConfigured: boolean;
  readonly settingsMessage: string | null;
  readonly modelProfiles?: readonly {
    readonly name: string;
    readonly model: string;
  }[];
  readonly phaseModelAssignments?: {
    readonly defaultProfileName: string | null;
    readonly captureProfileName: string | null;
    readonly clarificationProfileName: string | null;
    readonly refinementProfileName: string | null;
    readonly technicalDesignProfileName: string | null;
    readonly implementationProfileName: string | null;
    readonly reviewProfileName: string | null;
    readonly releaseApprovalProfileName: string | null;
    readonly prPreparationProfileName: string | null;
  };
  readonly runtimeVersion?: string | null;
  readonly executionPhaseId?: string | null;
  readonly pausedPhaseIds?: readonly string[];
  readonly completedPhaseIds?: readonly string[];
  readonly playbackStartedAtMs?: number | null;
  readonly executionSettingsPending?: boolean;
  readonly executionSettingsPendingMessage?: string | null;
  readonly maxImplementationReviewCycles?: number | null;
  readonly debugMode?: boolean;
  readonly graphScrollTop?: number;
  readonly detailScrollTop?: number;
  readonly approvalBaseBranchProposal?: string | null;
  readonly approvalWorkBranchProposal?: string | null;
  readonly requireExplicitApprovalBranchAcceptance?: boolean;
  readonly reviewRegressionDraft?: string | null;
  readonly reviewRegressionIncludeArtifact?: boolean;
  readonly completedUsLockOnCompleted?: boolean;
}

export interface ApprovalQuestionItem {
  readonly index: number;
  readonly question: string;
  readonly answer: string | null;
  readonly resolved: boolean;
  readonly answeredBy: string | null;
  readonly answeredAtUtc: string | null;
}

export interface PhaseIterationItem {
  readonly iterationKey: string;
  readonly attempt: number;
  readonly phaseId: string;
  readonly timestampUtc: string;
  readonly code: string;
  readonly actor: string | null;
  readonly summary: string | null;
  readonly inputArtifactPath: string | null;
  readonly contextArtifactPaths: readonly string[];
  readonly outputArtifactPath: string;
  readonly operationLogPath: string | null;
  readonly operationPrompt: string | null;
  readonly usage: { inputTokens: number; outputTokens: number; totalTokens: number } | null;
  readonly durationMs: number | null;
  readonly execution?: {
    readonly providerKind: string;
    readonly model: string;
    readonly profileName: string | null;
    readonly baseUrl: string | null;
  } | null;
}

export interface PhaseSectionFragments {
  readonly beforeArtifact: readonly string[];
  readonly afterArtifact: readonly string[];
}
