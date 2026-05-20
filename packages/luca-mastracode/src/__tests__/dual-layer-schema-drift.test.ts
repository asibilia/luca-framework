/**
 * Dual-layer schema drift guard.
 *
 * workflow-state.ts exposes both a flat z.object schema (for the Anthropic
 * tool-call API which rejects discriminated unions) AND strict per-action
 * z.objects used inside the handler. The flat schema must contain every
 * field declared by every per-action schema, AND every `.regex(...)`
 * constraint on a per-action field MUST appear on the same field in the flat
 * schema. If the flat schema drops a regex, an adversarial caller can submit
 * an injection-prone value (CR/LF, uppercase, etc.) past the published API
 * surface — the per-action layer catches it eventually, but the published
 * contract has silently weakened.
 *
 * This file uses Zod v4 internals (`_zod.def.checks`) to introspect regex
 * patterns. The injected-drift smoke test at the end proves that the drift
 * comparison helper actually fails when a regex is missing — so a key-
 * presence-only pass cannot silently approve constraint drift.
 */
import { describe, test, expect } from 'bun:test'
import { z } from 'zod'

import {
    WORKFLOW_ACTION_SCHEMAS,
    workflowStateInputSchema,
} from '../tools/workflow-state.js'

// Consume the live registry from workflow-state.ts — the source of truth.
// Adding a new constraint-bearing per-action schema to that registry
// automatically extends this drift guard's coverage; a hand-curated list
// here would recreate the very class of drift the test exists to prevent.
const PER_ACTION_SCHEMAS: Record<
    string,
    z.ZodObject<any>
> = WORKFLOW_ACTION_SCHEMAS

// The `action` key is the discriminator on per-action schemas — the flat
// schema represents it as a z.enum(WORKFLOW_STATE_ACTIONS) so it is
// definitionally present and should not be checked field-by-field.
const SKIP_KEYS = new Set(['action'])

// ---------------------------------------------------------------------------
// Zod v4 introspection helpers
// ---------------------------------------------------------------------------

/**
 * Walk a Zod schema node, peeling off `.optional()` / `.nullable()` / array
 * wrappers, and return the inner string-like node so regex checks can be
 * compared. Returns `null` if the field is not (or does not contain) a string.
 */
function unwrapToString(node: unknown): unknown | null {
    let cur = node as any
    // Defensive cap on unwrap depth so a cyclic/unknown wrapper can't loop.
    for (let i = 0; i < 10; i++) {
        if (!cur || typeof cur !== 'object') return null
        const def = cur._zod?.def ?? cur._def
        if (!def) return null
        const type = def.type
        if (type === 'string') return cur
        if (type === 'optional' || type === 'nullable' || type === 'default') {
            cur = def.innerType ?? def.inner ?? def.schema
            continue
        }
        if (type === 'array') {
            cur = def.element ?? def.type?.element
            continue
        }
        return null
    }
    return null
}

/**
 * Collect every regex pattern source applied to a string-typed Zod node.
 * Returns an empty array when the node has no regex checks (or is not a
 * string node).
 */
function regexPatterns(node: unknown): string[] {
    const str = unwrapToString(node)
    if (!str) return []
    const checks: any[] =
        (str as any)._zod?.def?.checks ?? (str as any)._def?.checks ?? []
    const out: string[] = []
    for (const c of checks) {
        const def = c?._zod?.def ?? c
        if (def?.format === 'regex' && def.pattern instanceof RegExp) {
            out.push(def.pattern.source)
        }
    }
    return out
}

/**
 * Compare regex parity for a single field. Returns the missing pattern
 * sources (i.e. patterns present on the per-action side but not on the flat
 * side). Empty array == parity holds.
 */
export function missingRegexPatterns(
    perActionField: unknown,
    flatField: unknown
): string[] {
    const want = regexPatterns(perActionField)
    if (want.length === 0) return []
    const have = new Set(regexPatterns(flatField))
    return want.filter((p) => !have.has(p))
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('dual-layer schema drift', () => {
    const flatShape = workflowStateInputSchema.shape as Record<string, unknown>

    for (const [action, schema] of Object.entries(PER_ACTION_SCHEMAS)) {
        describe(`action "${action}"`, () => {
            const perActionShape = schema.shape as Record<string, unknown>
            for (const field of Object.keys(perActionShape)) {
                if (SKIP_KEYS.has(field)) continue

                test(`flat schema exposes field "${field}"`, () => {
                    expect(
                        field in flatShape,
                        `Field "${field}" of action "${action}" is missing from flat schema`
                    ).toBe(true)
                    expect(flatShape[field]).toBeDefined()
                })

                test(`flat schema mirrors regex constraints on "${field}"`, () => {
                    if (!(field in flatShape)) return
                    const missing = missingRegexPatterns(
                        perActionShape[field],
                        flatShape[field]
                    )
                    expect(
                        missing,
                        `Field "${field}" of action "${action}" drifted: per-action has regex(es) [${missing.join(', ')}] missing from flat schema`
                    ).toEqual([])
                })
            }
        })
    }

    test('flat schema is a z.object (has .shape)', () => {
        expect(workflowStateInputSchema.shape).toBeDefined()
        expect(typeof workflowStateInputSchema.shape).toBe('object')
    })

    test('every per-action schema is a z.object (has .shape)', () => {
        for (const [action, schema] of Object.entries(PER_ACTION_SCHEMAS)) {
            expect(schema.shape, `${action} should be z.object`).toBeDefined()
        }
    })

    // -----------------------------------------------------------------------
    // Injected-drift smoke test.
    //
    // Defines two synthetic schemas where the "per-action" side has a regex
    // constraint that the "flat" side is missing. The comparison helper MUST
    // surface that drift — otherwise the parametric loop above would be
    // worthless and silently approve real drift on day-one merge.
    // -----------------------------------------------------------------------
    describe('injected-drift smoke test (proves the helper fails on real drift)', () => {
        test('missingRegexPatterns reports a regex present on per-action but absent on flat', () => {
            const perActionField = z
                .string()
                .min(1)
                .regex(/^x+$/, 'all-x literal')
                .optional()
            const flatField = z.string().max(64).optional() // regex deliberately omitted

            const missing = missingRegexPatterns(perActionField, flatField)
            expect(missing).toEqual(['^x+$'])
        })

        test('missingRegexPatterns returns empty when both sides carry the same regex', () => {
            const re = /^[a-z]+$/
            const a = z.string().regex(re, 'lower').optional()
            const b = z.string().regex(re, 'lower').max(64).optional()
            expect(missingRegexPatterns(a, b)).toEqual([])
        })

        test('missingRegexPatterns inspects array element regex', () => {
            const perAction = z
                .array(
                    z
                        .string()
                        .regex(/^[a-z0-9_-]+$/, 'kebab')
                        .max(64)
                )
                .optional()
            const flat = z.array(z.string().max(64)).optional() // element regex dropped
            const missing = missingRegexPatterns(perAction, flat)
            expect(missing).toEqual(['^[a-z0-9_-]+$'])
        })

        test('missingRegexPatterns returns [] when per-action has no regex at all', () => {
            const a = z.string().max(64).optional()
            const b = z.string().optional()
            expect(missingRegexPatterns(a, b)).toEqual([])
        })

        // ───────────────────────────────────────────────────────────────────
        // Zod-internals canary.
        //
        // The introspection helpers (`unwrapToString`, `regexPatterns`) reach
        // into Zod v4's `_zod.def.checks` shape. If Zod v5+ relocates these
        // internals (or `_zod?.def ?? _def` resolves to `null`), every call
        // to `regexPatterns()` would return [] and the parametric drift loop
        // above would pass vacuously — degrading silently to a no-op.
        //
        // This canary asserts that introspection of a known regex-bearing
        // schema produces a NON-EMPTY pattern list. If Zod internals shift,
        // this test fails loudly and points at the helpers needing an
        // upgrade — instead of letting drift detection rot in the dark.
        // ───────────────────────────────────────────────────────────────────
        test('canary: introspection of a known regex-bearing schema returns non-empty patterns', () => {
            const canary = z
                .string()
                .regex(/^canary-[a-z]+$/, 'canary literal')
                .optional()
            const patterns = missingRegexPatterns(
                canary,
                z.string().optional() // flat side has NO regex
            )
            expect(
                patterns,
                'Zod internals canary: helpers returned [] for a schema that DEFINITELY has a regex. ' +
                    'This means `_zod.def.checks` (or the fallback `_def`) no longer exposes regex checks — ' +
                    'the drift detector is silently degraded. Update `unwrapToString` / `regexPatterns` in this file.'
            ).not.toEqual([])
            expect(patterns).toContain('^canary-[a-z]+$')
        })
    })
})
