// Barrel exports for the analysis domain.
// Post-run analysis. The postmortem analyzer and recurrence-driven rule
// promotion land in following increments.

export { snapshotWorkingTree, computePhaseDiff } from './phase-diff.ts'
export type { PhaseSnapshot, PhaseDiff } from './phase-diff.ts'
