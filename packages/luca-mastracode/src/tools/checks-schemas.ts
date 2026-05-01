/**
 * Minimal check-runner types used by output parsers.
 *
 * Shared schema for check-runner output parsers. Co-located with
 * tools/ since all consumers live in tools/ and tools/parsers/.
 */

import { z } from 'zod'

/** A single parsed error/warning from tool output */
export const ParsedErrorSchema = z.object({
    file: z.string(),
    line: z.number().optional(),
    column: z.number().optional(),
    message: z.string(),
    code: z.string().optional(),
    severity: z.enum(['error', 'warning']),
})
export type ParsedError = z.infer<typeof ParsedErrorSchema>

/** Parser function signature — takes raw stdout and returns structured errors */
export type OutputParser = (output: string) => ParsedError[]
