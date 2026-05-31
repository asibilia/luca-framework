import type { OutputParser, ParsedError } from '../schemas.ts'

/**
 * Generic fallback parser for build output and unrecognized check formats.
 *
 * Matches two shapes:
 *   1. Structured — `file:line:col: error: message`
 *   2. Bare       — `error: message` (no file location → file is "unknown")
 *
 * Ported from luca-mastracode `tools/parsers/generic.ts` — pure, no I/O.
 */
const GENERIC_ERROR_REGEX =
    /^(.+?):(\d+)(?::(\d+))?:\s*(?:error|Error|ERROR)[:\s]+(.+)$/
const BARE_ERROR_REGEX = /^(?:error|Error|ERROR)[:\s]+(.+)$/

export const parseGenericOutput: OutputParser = (output) => {
    const errors: ParsedError[] = []

    for (const line of output.split('\n')) {
        const structuredMatch = line.match(GENERIC_ERROR_REGEX)
        if (structuredMatch) {
            errors.push({
                file: structuredMatch[1]!.trim(),
                line: parseInt(structuredMatch[2]!, 10),
                column: structuredMatch[3]
                    ? parseInt(structuredMatch[3], 10)
                    : undefined,
                message: structuredMatch[4]!.trim(),
                severity: 'error',
            })
            continue
        }

        const bareMatch = line.match(BARE_ERROR_REGEX)
        if (bareMatch) {
            errors.push({
                file: 'unknown',
                message: bareMatch[1]!.trim(),
                severity: 'error',
            })
        }
    }

    return errors
}
