import type { OutputParser, ParsedError } from '../schemas.ts'

/**
 * Parse TypeScript compiler (`tsc`) output into structured errors.
 *
 * Handles the standard tsc diagnostic format:
 *   `src/foo.ts(42,5): error TS2345: Argument of type ...`
 *
 * Ported from luca-mastracode `tools/parsers/tsc.ts` — pure, no I/O.
 */
const TSC_ERROR_REGEX =
    /^(.+)\((\d+),(\d+)\):\s+(error|warning)\s+(TS\d+):\s+(.+)$/

export const parseTscOutput: OutputParser = (output) => {
    const errors: ParsedError[] = []

    for (const line of output.split('\n')) {
        const match = line.match(TSC_ERROR_REGEX)
        if (match) {
            errors.push({
                file: match[1]!.trim(),
                line: parseInt(match[2]!, 10),
                column: parseInt(match[3]!, 10),
                severity: match[4] as 'error' | 'warning',
                code: match[5],
                message: match[6]!.trim(),
            })
        }
    }

    return errors
}
