// Barrel exports for the analysis domain.
// Post-run analysis. Recurrence-driven rule promotion lands in a following
// increment.

export { snapshotWorkingTree, computePhaseDiff } from './phase-diff.ts'
export type { PhaseSnapshot, PhaseDiff } from './phase-diff.ts'

export {
    analyzeRun,
    computePostmortemExitCode,
    renderPostmortemMarkdown,
} from './postmortem.ts'
export type {
    AnalyzeRunInput,
    PhaseSummary,
    PostmortemReport,
    Violation,
    ViolationCode,
    ViolationSeverity,
} from './postmortem.ts'
