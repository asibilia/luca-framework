import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

import {
    loadCurrentState,
    phasePathFor,
    resolveActiveSlug,
    type VerificationRef,
} from '@alecsibilia/luca-core'

export interface ValidateVerificationRefOptions {
    cwd: string
    ref: VerificationRef
}

export interface ValidationError {
    code:
        | 'NO_ACTIVE_PHASE'
        | 'VERIFY_FILE_MISSING'
        | 'VERIFY_FILE_INVALID'
        | 'CRITERION_NOT_FOUND'
        | 'CRITERION_UNMET'
        | 'CRITERION_NO_EVIDENCE'
        | 'VERIFY_NOT_PASS'
    message: string
}

/**
 * Confirm that a VerificationRef points at a met, evidence-backed
 * criterion inside the active phase's verify.json AND that the parent
 * verification run was a PASS overall. Returns null on success or a
 * structured error payload describing exactly which check failed.
 *
 * Used by luca_todo_update to prevent agents from marking work "done"
 * without machine-checkable evidence — a safety property the legacy
 * mastracode manageTodos tool enforced and we want to preserve.
 */
export async function validateVerificationRef(
    opts: ValidateVerificationRefOptions
): Promise<ValidationError | null> {
    const state = await loadCurrentState({ cwd: opts.cwd })
    const slug = resolveActiveSlug(state)
    if (!slug.ok) {
        return {
            code: 'NO_ACTIVE_PHASE',
            message: slug.error,
        }
    }

    const verifyPath = join(opts.cwd, phasePathFor(slug.slug, 'verify'))
    if (!existsSync(verifyPath)) {
        return {
            code: 'VERIFY_FILE_MISSING',
            message: `verify.json not found for phase ${slug.slug}. Run luca-verifier first and persist via luca_phase_write_verify.`,
        }
    }

    let parsed: unknown
    try {
        parsed = JSON.parse(await readFile(verifyPath, 'utf-8'))
    } catch (err) {
        return {
            code: 'VERIFY_FILE_INVALID',
            message: `verify.json could not be parsed: ${(err as Error).message}`,
        }
    }

    const result = parsed as {
        status?: string
        criteria?: Array<{
            criterionId?: string
            met?: boolean
            evidence?: string
        }>
    }
    const criteria = Array.isArray(result.criteria) ? result.criteria : []
    const found = criteria.find((c) => c.criterionId === opts.ref.criterionId)
    if (!found) {
        return {
            code: 'CRITERION_NOT_FOUND',
            message: `criterion "${opts.ref.criterionId}" not present in ${slug.slug}/verify.json. Existing ids: ${
                criteria
                    .map((c) => c.criterionId)
                    .filter(Boolean)
                    .join(', ') || '(none)'
            }.`,
        }
    }
    if (!found.met) {
        return {
            code: 'CRITERION_UNMET',
            message: `criterion "${opts.ref.criterionId}" is recorded as met=false. Cannot mark a todo done against an unmet criterion.`,
        }
    }
    if (!found.evidence || !found.evidence.trim()) {
        return {
            code: 'CRITERION_NO_EVIDENCE',
            message: `criterion "${opts.ref.criterionId}" has empty evidence. Re-run verification with concrete evidence (file:line or test name) before marking the todo done.`,
        }
    }
    if (result.status !== 'PASS') {
        return {
            code: 'VERIFY_NOT_PASS',
            message: `verify.json status is "${result.status}", not "PASS". Cannot mark a todo done against a failing/stalled verification run.`,
        }
    }
    return null
}
