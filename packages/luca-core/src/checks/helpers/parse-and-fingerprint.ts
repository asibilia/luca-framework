import { createHash } from 'node:crypto'

import { parserRegistry } from './parser-registry.ts'

import type { ParsedError } from '../schemas.ts'

/** A {@link ParsedError} with a stable fingerprint for convergence tracking. */
export interface FingerprintedError extends ParsedError {
    fingerprint: string
}

/**
 * Run the registered parser for `checkName` and attach a SHA-256 fingerprint
 * (`file:line:message`, truncated to 12 hex chars) to each error.
 *
 * Equal fingerprints across iterations mean the same error — the signal the
 * convergence detector uses. Returns `[]` (with a warning) for an unknown
 * check name.
 *
 * Ported from luca-mastracode `tools/check-parsers.ts` — pure, no I/O.
 */
export function parseAndFingerprint(
    checkName: string,
    output: string
): FingerprintedError[] {
    const parserFactory = parserRegistry[checkName]
    if (!parserFactory) {
        console.warn(
            `[checks] No parser registered for "${checkName}" — output left unparsed`
        )
        return []
    }

    const parser = parserFactory()
    return parser(output).map((err) => ({
        ...err,
        fingerprint: createHash('sha256')
            .update(`${err.file}:${err.line ?? 0}:${err.message}`)
            .digest('hex')
            .slice(0, 12),
    }))
}
