/**
 * Barrel exports for the orchestration domain.
 *
 * Pure validation/decision helpers for pipeline orchestration. Each
 * helper is a pure function the hook layer (in `luca-tools`) calls
 * after gathering its inputs from the Claude Code harness payload +
 * `.luca/state.json`. No I/O lives in this domain.
 *
 * Ported from `luca-mastracode/src/orchestration/` minus the Mastra
 * delivery machinery — the algorithms survive, the subscription model
 * does not.
 */

export {
    checkPipelineGuard,
    type PipelineGuardInput,
    type PipelineGuardReason,
    type PipelineGuardTelemetry,
    type PipelineGuardVerdict,
} from './pipeline-guard.ts'

export {
    enforceReadOnly,
    READ_ONLY_STEPS,
    READ_ONLY_TOOL_CLASS_BY_NAME,
    type ReadOnlyEnforcementInput,
    type ReadOnlyEnforcementReason,
    type ReadOnlyEnforcementTelemetry,
    type ReadOnlyEnforcementVerdict,
    type ReadOnlyToolClass,
} from './read-only-enforcement.ts'

export {
    computeContinuationMessage,
    type ContinuationInput,
    type ContinuationReason,
    type ContinuationSeverity,
    type ContinuationTelemetry,
    type ContinuationVerdict,
} from './continuation-messages.ts'

export {
    computeContextRefresher,
    type ContextRefresherCarryState,
    type ContextRefresherInput,
    type ContextRefresherReason,
    type ContextRefresherSeverity,
    type ContextRefresherTelemetry,
    type ContextRefresherVerdict,
} from './context-refresher.ts'

export {
    CONTEXT_REFRESHER_DEFAULTS,
    type ContextRefresherThresholds,
} from './context-refresher-config.ts'
