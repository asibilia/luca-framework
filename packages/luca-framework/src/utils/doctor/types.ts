import { z } from 'zod'

/**
 * Scope categories for doctor checks.
 *
 * - `prerequisites`: Bun runtime and platform checks
 * - `global`: MuninnDB binary and service health
 */
export type DoctorScope = 'prerequisites' | 'global'

/**
 * Internal schema: Doctor check result.
 *
 * Represents the outcome of a single doctor diagnostic check.
 * Uses camelCase -- internal-only, not an API payload.
 */
export const CheckResultSchema = z.object({
    name: z.string(),
    status: z.enum(['pass', 'fail', 'warning']),
    message: z.string(),
    fixCommand: z.string().nullable(),
    details: z.string().nullable(),
})

export type CheckResult = z.infer<typeof CheckResultSchema>

/**
 * Internal interface: Doctor check definition.
 *
 * Defines the contract for a diagnostic check that can be run
 * by the doctor command. Each check has a name and an async run method.
 */
export interface DoctorCheck {
    name: string
    scope: DoctorScope
    run(): Promise<CheckResult>
}
