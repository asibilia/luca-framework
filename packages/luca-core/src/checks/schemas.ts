import { z } from 'zod'

/** A single parsed error or warning from check-tool output. */
export const ParsedErrorSchema = z.object({
    file: z.string(),
    line: z.number().optional(),
    column: z.number().optional(),
    message: z.string(),
    code: z.string().optional(),
    severity: z.enum(['error', 'warning']),
})

export type ParsedError = z.infer<typeof ParsedErrorSchema>

/**
 * Parser signature — takes raw tool stdout and returns structured errors.
 * Every parser in `checks/helpers/` conforms to this contract.
 */
export type OutputParser = (output: string) => ParsedError[]
