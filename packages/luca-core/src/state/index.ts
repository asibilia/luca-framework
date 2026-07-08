// Schemas + enums + types
export {
    ComplexityLevel,
    OversightMode,
    PipelineStep,
    PhaseStatus,
    CoarsePhase,
    RoadmapPhaseSchema,
    lucaStateSchema,
    lucaStateSchemaTolerant,
} from './schemas.ts'

export type { RoadmapPhase, LucaState } from './schemas.ts'

// Constants
export { PipelineStepValues, LEGACY_PIPELINE_STEP_MAP } from './constants.ts'

// Configs
export {
    BUDGET_BY_COMPLEXITY,
    DEFAULT_BUDGET,
} from './configs/budget-matrix.ts'
export type { BudgetLimits } from './configs/budget-matrix.ts'
export { PIPELINE_STEP_TO_COARSE_PHASE } from './configs/coarse-phase-map.ts'

// Helpers
export { resolveBudgetLimits } from './helpers/resolve-budget-limits.ts'
export { coarsePhaseOf } from './helpers/coarse-phase-of.ts'
export { isToolAllowed } from './helpers/is-tool-allowed.ts'
export type { ToolCategory } from './helpers/is-tool-allowed.ts'
export { loadCurrentState } from './helpers/load-current-state.ts'
export type { LoadCurrentStateOptions } from './helpers/load-current-state.ts'
export { loadCurrentConfig } from './helpers/load-current-config.ts'
export type { LoadCurrentConfigOptions } from './helpers/load-current-config.ts'
export { resolveActiveSlug } from './helpers/resolve-active-slug.ts'
export type {
    ResolveActiveSlugFail,
    ResolveActiveSlugOk,
    ResolveActiveSlugResult,
} from './helpers/resolve-active-slug.ts'

// Stage-gate matrix
export { STAGE_TOOL_MATRIX } from './configs/stage-tool-matrix.ts'

// Pipeline transitions
export {
    PIPELINE_TRANSITIONS,
    isLegalTransition,
} from './configs/pipeline-transitions.ts'

// Machine verdict (XState-backed transition oracle — live write-path authority)
export { machineVerdict } from './machine/machine-verdict.ts'
export type { MachineVerdict } from './machine/machine-verdict.ts'

// Per-step artifact map + write-command phase table (v13 plan, D3)
export {
    STEP_ARTIFACTS,
    WRITE_COMMAND_PHASES,
} from './configs/step-artifacts.ts'
export type { StepArtifact } from './configs/step-artifacts.ts'

// CLI invocation parsers (shared by hooks, future surfaces)
export { parseAdvanceCommand, stripQuotes } from './cli-parse.ts'

// Pipeline lock (inner single-flight protection for .luca/state.json)
export {
    acquire as acquirePipelineLock,
    release as releasePipelineLock,
    forceUnlock as forcePipelineUnlock,
    readLock as readPipelineLock,
    PipelineLockSchema,
} from './pipeline-lock.ts'
export type {
    PipelineLock,
    AcquireOptions as AcquirePipelineLockOptions,
    AcquireResult as AcquirePipelineLockResult,
    ReleaseOptions as ReleasePipelineLockOptions,
    ReleaseResult as ReleasePipelineLockResult,
    ForceUnlockOptions as ForcePipelineUnlockOptions,
    ForceUnlockResult as ForcePipelineUnlockResult,
} from './pipeline-lock.ts'
