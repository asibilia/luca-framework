/**
 * Doctor check orchestration
 *
 * Pure barrel file — re-exports only. All logic lives in run-doctor.ts.
 */

export { executeDoctor } from './run-doctor'
export type {
    DoctorScope,
    CheckResult,
    DoctorCheck,
    DoctorFixResult,
} from './types'
