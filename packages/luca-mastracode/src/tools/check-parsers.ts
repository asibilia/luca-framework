/**
 * check-parsers — fingerprinting wrapper around the per-check parser registry.
 *
 * Pure helpers used by the run-checks tool. SHA256 fingerprints let us detect
 * convergence across iterations (same fingerprint = same error).
 */
import { createHash } from 'node:crypto'

import type { ParsedError } from './__schemas/checks.schemas'
import { parserRegistry } from './parsers/parser-registry'

export interface FingerprintedError extends ParsedError {
    fingerprint: string
}

/** Run the canonical parser for `checkName` and attach SHA256 fingerprints. */
export function parseAndFingerprint(
    checkName: string,
    output: string
): FingerprintedError[] {
    const parserFactory = parserRegistry[checkName]
    if (!parserFactory) {
        console.warn(
            `[run-checks] No parser found for check "${checkName}" — raw output will not be parsed`
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
