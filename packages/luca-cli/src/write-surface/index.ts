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
export { writeAtomicFile } from './helpers/write-atomic.ts'
export { buildMuninnInstruction } from './helpers/build-muninn-instruction.ts'
export type {
    MuninnInstruction,
    MuninnInstructionInput,
} from './helpers/build-muninn-instruction.ts'
export { validateVerificationRef } from './helpers/validate-verification-ref.ts'
export type {
    ValidateVerificationRefOptions,
    ValidationError,
} from './helpers/validate-verification-ref.ts'
export * from '@alecsibilia/luca-core/review-analysis'

// Handlers — the 27 tool descriptors
export { lucaBranchGuardTool } from './handlers/luca-branch-guard.ts'
export { lucaChecksRunTool } from './handlers/luca-checks-run.ts'
export { lucaConfidenceLogTool } from './handlers/luca-confidence-log.ts'
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
export { lucaPrReviewDetectConvergenceTool } from './handlers/luca-pr-review-detect-convergence.ts'
export { lucaPrReviewFilterStaleTool } from './handlers/luca-pr-review-filter-stale.ts'
export { lucaPrReviewRegressionCheckTool } from './handlers/luca-pr-review-regression-check.ts'
export { lucaPreferencesReadTool } from './handlers/luca-preferences-read.ts'
export { lucaPreferencesWriteTool } from './handlers/luca-preferences-write.ts'
export { lucaRepoCleanupApplyTool } from './handlers/luca-repo-cleanup-apply.ts'
export { lucaRoadmapCreateTool } from './handlers/luca-roadmap-create.ts'
export { lucaRoadmapReadTool } from './handlers/luca-roadmap-read.ts'
export { lucaStateAdvanceTool } from './handlers/luca-state-advance.ts'
export { lucaStateReadTool } from './handlers/luca-state-read.ts'
export { lucaTodoAddTool } from './handlers/luca-todo-add.ts'
export { lucaTodoListTool } from './handlers/luca-todo-list.ts'
export { lucaTodoUpdateTool } from './handlers/luca-todo-update.ts'
export { lucaWorkflowResetTool } from './handlers/luca-workflow-reset.ts'
