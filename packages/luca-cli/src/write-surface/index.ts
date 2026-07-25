// Barrel for the write-surface domain — runtime-agnostic write logic
// consumed by the `luca` CLI commands (v13 plan). Re-exports only.

// Schemas + types
export type {
    ToolContext,
    ToolDescriptor,
    WriteResult,
    WriteResultContent,
} from './__schemas/write-surface.schemas.ts'
export { z } from './__schemas/write-surface.schemas.ts'

// Helpers
//
// resolveActiveSlug moved to @alecsibilia/luca-core (v13 Phase C) — it is a
// pure state -> slug derivation now consumed by the stage-gate hook. The
// write-surface barrel re-exports it so existing importers keep working.
export {
    resolveActiveSlug,
    type ResolveActiveSlugFail,
    type ResolveActiveSlugOk,
    type ResolveActiveSlugResult,
} from '@alecsibilia/luca-core'
export { resolveRepoVault } from './helpers/resolve-repo-vault.ts'
export type { ResolveRepoVaultOptions } from './helpers/resolve-repo-vault.ts'
export { resolveBacklogRoot } from './helpers/resolve-backlog-root.ts'
export type {
    BacklogRoot,
    ResolveBacklogRootOptions,
} from './helpers/resolve-backlog-root.ts'
export { resolveBrainRoot } from './helpers/resolve-brain-root.ts'
export type {
    BrainRoot,
    ResolveBrainRootOptions,
} from './helpers/resolve-brain-root.ts'
export { writeAtomicFile } from './helpers/write-atomic.ts'
export {
    formatHandoffFailure,
    resolveHandoffTransport,
} from './helpers/handoff-transport.ts'
export type {
    ResolveHandoffTransportOptions,
    ResolvedHandoffTransport,
} from './helpers/handoff-transport.ts'
export {
    buildMuninnInstruction,
    buildMuninnProcedure,
    ROOT_ID_PLACEHOLDER,
    TODO_ENGRAM_ID_PLACEHOLDER,
} from './helpers/build-muninn-instruction.ts'
export type {
    MuninnInstruction,
    MuninnInstructionInput,
    MuninnProcedure,
    MuninnProcedureInput,
    MuninnProcedureStep,
} from './helpers/build-muninn-instruction.ts'
export { validateVerificationRef } from './helpers/validate-verification-ref.ts'
export type {
    ValidateVerificationRefOptions,
    ValidationError,
} from './helpers/validate-verification-ref.ts'
export * from '@alecsibilia/luca-core/review-analysis'

// Handlers — the tool descriptors
export { lucaBrainRecallRootTool } from './handlers/luca-brain-recall-root.ts'
export { lucaBrainSetRootTool } from './handlers/luca-brain-set-root.ts'
export { lucaBranchGuardTool } from './handlers/luca-branch-guard.ts'
export { lucaChecksRunTool } from './handlers/luca-checks-run.ts'
export { lucaConfidenceLogTool } from './handlers/luca-confidence-log.ts'
export { lucaHandoffAcceptTool } from './handlers/luca-handoff-accept.ts'
export {
    describeCompleteHopFailure,
    lucaHandoffCompleteTool,
} from './handlers/luca-handoff-complete.ts'
export { lucaHandoffListTool } from './handlers/luca-handoff-list.ts'
export { lucaHandoffRejectTool } from './handlers/luca-handoff-reject.ts'
export { lucaHandoffSendTool } from './handlers/luca-handoff-send.ts'
export { lucaPhaseAdvanceTool } from './handlers/luca-phase-advance.ts'
export { lucaPhaseArchiveTool } from './handlers/luca-phase-archive.ts'
export { lucaPhaseCurrentTool } from './handlers/luca-phase-current.ts'
export { lucaPhaseWriteAuditTool } from './handlers/luca-phase-write-audit.ts'
export { lucaPhaseWriteContextTool } from './handlers/luca-phase-write-context.ts'
export { lucaPhaseWriteLearnTool } from './handlers/luca-phase-write-learn.ts'
export { lucaPhaseWritePlanReviewTool } from './handlers/luca-phase-write-plan-review.ts'
export { lucaPhaseWritePlanTool } from './handlers/luca-phase-write-plan.ts'
export { lucaPhaseWriteResearchTool } from './handlers/luca-phase-write-research.ts'
export { lucaPhaseWriteSummaryTool } from './handlers/luca-phase-write-summary.ts'
export { lucaPhaseWriteVerifyTool } from './handlers/luca-phase-write-verify.ts'
export { lucaPhaseWriteWaveTool } from './handlers/luca-phase-write-wave.ts'
export { lucaPlanLintTool } from './handlers/luca-plan-lint.ts'
export { lucaPrOutcomeTool } from './handlers/luca-pr-outcome.ts'
export { lucaPrReviewDetectConvergenceTool } from './handlers/luca-pr-review-detect-convergence.ts'
export { lucaPrReviewFilterStaleTool } from './handlers/luca-pr-review-filter-stale.ts'
export { lucaPrReviewRegressionCheckTool } from './handlers/luca-pr-review-regression-check.ts'
export { lucaPreferencesReadTool } from './handlers/luca-preferences-read.ts'
export { lucaPreferencesWriteTool } from './handlers/luca-preferences-write.ts'
export { lucaRepoCleanupApplyTool } from './handlers/luca-repo-cleanup-apply.ts'
export { lucaRoadmapCreateTool } from './handlers/luca-roadmap-create.ts'
export { lucaRoadmapReadTool } from './handlers/luca-roadmap-read.ts'
export { lucaSnapshotCreateTool } from './handlers/luca-snapshot-create.ts'
export { lucaSnapshotDiffTool } from './handlers/luca-snapshot-diff.ts'
export { lucaStateAdvanceTool } from './handlers/luca-state-advance.ts'
export { lucaStateClaimOwnerTool } from './handlers/luca-state-claim-owner.ts'
export { lucaStateReadTool } from './handlers/luca-state-read.ts'
export { lucaStateSetCurrentPhaseTool } from './handlers/luca-state-set-current-phase.ts'
export { lucaTodoAddTool } from './handlers/luca-todo-add.ts'
export { lucaTodoListTool } from './handlers/luca-todo-list.ts'
export { lucaTodoMigrateTool } from './handlers/luca-todo-migrate.ts'
export { lucaTodoSetRootTool } from './handlers/luca-todo-set-root.ts'
export { lucaTodoUpdateTool } from './handlers/luca-todo-update.ts'
export { lucaWorkflowResetTool } from './handlers/luca-workflow-reset.ts'
