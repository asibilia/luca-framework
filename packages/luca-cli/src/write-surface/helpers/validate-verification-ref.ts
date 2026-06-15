import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

import {
    loadCurrentState,
    phasePathFor,
    resolveActiveSlug,
    type VerificationRef,
} from '@alecsibilia/luca-core'
import {
    VerificationResultSchema,
    findCriterion,
} from '@alecsibilia/luca-core/verification'

import { sanitizeControlChars } from './sanitize-control-chars.ts'

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
        | 'CRITERION_DEFERRED'
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

    // Echoed in every error message — the criterion id is caller-supplied.
    const safeCriterionId = sanitizeControlChars(opts.ref.criterionId)

    let raw: unknown
    try {
        raw = JSON.parse(await readFile(verifyPath, 'utf-8'))
    } catch (err) {
        return {
            code: 'VERIFY_FILE_INVALID',
            message: `verify.json could not be parsed: ${sanitizeControlChars(
                err instanceof Error ? err.message : String(err)
            )}`,
        }
    }

    // Validate against the schema rather than trusting a raw `as` cast — a
    // schema-invalid verify.json is a hard VERIFY_FILE_INVALID, not a silent
    // pass with undefined fields.
    const parsed = VerificationResultSchema.safeParse(raw)
    if (!parsed.success) {
        return {
            code: 'VERIFY_FILE_INVALID',
            message: `verify.json does not match VerificationResultSchema: ${sanitizeControlChars(
                parsed.error.issues
                    .map(
                        (issue) =>
                            `${issue.path.join('.') || '(root)'}: ${
                                issue.message
                            }`
                    )
                    .join('; ')
            )}`,
        }
    }
    const result = parsed.data

    // Reuse the core findCriterion lookup (wrapping the single result in a
    // one-element array) so the verdict-resolution logic lives in one place.
    const hit = findCriterion({
        results: [result],
        criterionId: opts.ref.criterionId,
    })
    if (!hit) {
        return {
            code: 'CRITERION_NOT_FOUND',
            message: `criterion "${safeCriterionId}" not present in ${slug.slug}/verify.json. Existing ids: ${
                sanitizeControlChars(
                    result.criteria
                        .map((c) => c.criterionId)
                        .filter(Boolean)
                        .join(', ')
                ) || '(none)'
            }.`,
        }
    }
    const found = hit.criterion
    // Deferred check runs REGARDLESS of `met` — a malformed
    // `deferred: true, met: true` record must still be rejected.
    if (found.deferred === true) {
        return {
            code: 'CRITERION_DEFERRED',
            message: `criterion "${safeCriterionId}" is deferred to a later probe${
                found.deferredFollowUp
                    ? ` (follow-up todo ${sanitizeControlChars(
                          found.deferredFollowUp
                      )})`
                    : ''
            }. Cannot mark a todo done against a deferred criterion until the deferred probe runs.`,
        }
    }
    if (!found.met) {
        return {
            code: 'CRITERION_UNMET',
            message: `criterion "${safeCriterionId}" is recorded as met=false. Cannot mark a todo done against an unmet criterion.`,
        }
    }
    if (!found.evidence || !found.evidence.trim()) {
        return {
            code: 'CRITERION_NO_EVIDENCE',
            message: `criterion "${safeCriterionId}" has empty evidence. Re-run verification with concrete evidence (file:line or test name) before marking the todo done.`,
        }
    }
    if (result.status !== 'PASS') {
        return {
            code: 'VERIFY_NOT_PASS',
            message: `verify.json status is "${sanitizeControlChars(
                result.status
            )}", not "PASS". Cannot mark a todo done against a failing/stalled verification run.`,
        }
    }
    return null
}
