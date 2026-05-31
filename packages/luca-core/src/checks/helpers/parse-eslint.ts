import type { OutputParser, ParsedError } from '../schemas.ts'

/**
 * Parse ESLint output into structured errors.
 *
 * Supports two formats:
 *   1. JSON — `eslint --format json` (primary path).
 *   2. The default human-readable output (regex fallback).
 *
 * Ported from luca-mastracode `tools/parsers/eslint.ts` — pure, no I/O.
 */
const ESLINT_DEFAULT_REGEX =
    /^\s+(\d+):(\d+)\s+(error|warning)\s+(.+?)\s{2,}(\S+)\s*$/
const ESLINT_FILE_REGEX = /^(\/\S+|\S+\.\w+)$/

interface EslintJsonMessage {
    line: number
    column: number
    message: string
    ruleId: string | null
    severity: 1 | 2
}

interface EslintJsonResult {
    filePath: string
    messages: EslintJsonMessage[]
}

export const parseEslintOutput: OutputParser = (output) => {
    const errors: ParsedError[] = []
    const trimmed = output.trim()

    // Primary path: `eslint --format json`.
    if (trimmed.startsWith('[')) {
        try {
            const results: EslintJsonResult[] = JSON.parse(trimmed)
            for (const result of results) {
                for (const msg of result.messages) {
                    errors.push({
                        file: result.filePath,
                        line: msg.line,
                        column: msg.column,
                        message: msg.message,
                        code: msg.ruleId ?? undefined,
                        severity: msg.severity === 2 ? 'error' : 'warning',
                    })
                }
            }
            return errors
        } catch {
            // Not valid JSON — fall through to the regex fallback.
        }
    }

    // Fallback: regex parsing of the default ESLint output.
    let currentFile = ''
    for (const line of output.split('\n')) {
        const fileMatch = line.match(ESLINT_FILE_REGEX)
        if (fileMatch) {
            currentFile = fileMatch[1]!
            continue
        }

        const msgMatch = line.match(ESLINT_DEFAULT_REGEX)
        if (msgMatch && currentFile) {
            errors.push({
                file: currentFile,
                line: parseInt(msgMatch[1]!, 10),
                column: parseInt(msgMatch[2]!, 10),
                severity: msgMatch[3] as 'error' | 'warning',
                message: msgMatch[4]!.trim(),
                code: msgMatch[5],
            })
        }
    }

    return errors
}
