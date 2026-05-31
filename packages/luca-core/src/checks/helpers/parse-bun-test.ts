import type { OutputParser, ParsedError } from '../schemas.ts'

/**
 * Parse `bun test` output into structured errors.
 *
 * Handles failure markers, assertion details, stack-trace locations,
 * compile/parse errors, and per-file header lines.
 *
 * Ported from luca-mastracode `tools/parsers/bun-test.ts` — pure, no I/O.
 */

// "✗ test name [timing]" / "✘ test name [timing]"
const FAIL_MARKER_REGEX = /^\s*[✗✘×]\s+(.+?)(?:\s+\[[\d.]+(?:ms|s)\])?\s*$/

// "at /path/file.ts:line:col"
const STACK_LOCATION_REGEX = /^\s+at\s+(.+?):(\d+):(\d+)\s*$/

// "error: <message>" / "SyntaxError: ..." at the start of a line
const COMPILE_ERROR_REGEX =
    /^(?:error|SyntaxError|TypeError|ReferenceError):\s+(.+)$/

// "path/to/file.test.ts:" — the test-file header
const FILE_HEADER_REGEX = /^(\S+\.(?:test|spec)\.\w+):$/

export const parseBunTestOutput: OutputParser = (output) => {
    const errors: ParsedError[] = []
    const lines = output.split('\n')

    let currentTestName = ''
    let currentFile = ''
    let assertionDetails: string[] = []
    let foundLocation = false

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i]!

        // Track the current test file from a header line.
        const fileMatch = line.match(FILE_HEADER_REGEX)
        if (fileMatch) {
            currentFile = fileMatch[1]!
            continue
        }

        // A failed-test marker.
        const failMatch = line.match(FAIL_MARKER_REGEX)
        if (failMatch) {
            // A prior failure that never found a location — emit it now.
            if (currentTestName && !foundLocation) {
                errors.push({
                    file: currentFile || 'unknown',
                    message:
                        currentTestName +
                        (assertionDetails.length
                            ? ': ' + assertionDetails.join(' ')
                            : ''),
                    severity: 'error',
                })
            }

            currentTestName = failMatch[1]!
            assertionDetails = []
            foundLocation = false
            continue
        }

        // Inside a failure block: collect assertion details + a location.
        if (currentTestName && !foundLocation) {
            const trimmed = line.trim()
            if (
                trimmed.startsWith('Expected:') ||
                trimmed.startsWith('Received:') ||
                trimmed.startsWith('error:') ||
                trimmed.startsWith('expect(')
            ) {
                assertionDetails.push(trimmed)
            }

            const locMatch = line.match(STACK_LOCATION_REGEX)
            if (locMatch) {
                foundLocation = true
                errors.push({
                    file: locMatch[1]!,
                    line: parseInt(locMatch[2]!, 10),
                    column: parseInt(locMatch[3]!, 10),
                    message:
                        currentTestName +
                        (assertionDetails.length
                            ? ': ' + assertionDetails.join(' ')
                            : ''),
                    severity: 'error',
                })
                currentTestName = ''
                assertionDetails = []
            }
        }

        // A compile/parse error (the file failed before tests ran).
        const compileMatch = line.match(COMPILE_ERROR_REGEX)
        if (compileMatch && !currentTestName) {
            const nextLine = lines[i + 1] ?? ''
            const locMatch = nextLine.match(STACK_LOCATION_REGEX)
            errors.push({
                file: locMatch ? locMatch[1]! : currentFile || 'unknown',
                line: locMatch ? parseInt(locMatch[2]!, 10) : undefined,
                column: locMatch ? parseInt(locMatch[3]!, 10) : undefined,
                message: compileMatch[1]!,
                severity: 'error',
            })
        }
    }

    // Flush a trailing failure that never found a location.
    if (currentTestName && !foundLocation) {
        errors.push({
            file: currentFile || 'unknown',
            message:
                currentTestName +
                (assertionDetails.length
                    ? ': ' + assertionDetails.join(' ')
                    : ''),
            severity: 'error',
        })
    }

    return errors
}
