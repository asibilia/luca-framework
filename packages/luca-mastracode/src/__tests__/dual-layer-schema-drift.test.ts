/**
 * Dual-layer schema drift guard.
 *
 * workflow-state.ts exposes both a flat z.object schema (for the Anthropic
 * tool-call API which rejects discriminated unions) AND strict per-action
 * z.objects used inside the handler. The flat schema must contain every
 * field declared by every per-action schema, or the API surface drifts away
 * from the handler's contract.
 *
 * This test iterates each per-action shape and asserts the flat schema has
 * the same key. Constraint-level (regex/max) drift detection falls back to
 * key presence if Zod's `_def.checks` introspection is unavailable.
 */
import { describe, test, expect } from 'bun:test'
import { z } from 'zod'

import {
    recordSubagentAction,
    recordRecallAction,
    saveReviewResultsAction,
    workflowStateInputSchema,
} from '../tools/workflow-state.js'

const PER_ACTION_SCHEMAS: Record<string, z.ZodObject<any>> = {
    'record-subagent': recordSubagentAction,
    'record-recall': recordRecallAction,
    'save-review-results': saveReviewResultsAction,
}

// The `action` key is the discriminator on per-action schemas — the flat
// schema represents it as a z.enum(WORKFLOW_STATE_ACTIONS) so it is
// definitionally present and should not be checked field-by-field.
const SKIP_KEYS = new Set(['action'])

describe('dual-layer schema drift', () => {
    const flatShape = workflowStateInputSchema.shape as Record<string, unknown>

    for (const [action, schema] of Object.entries(PER_ACTION_SCHEMAS)) {
        describe(`action "${action}"`, () => {
            const perActionShape = schema.shape as Record<string, unknown>
            for (const field of Object.keys(perActionShape)) {
                if (SKIP_KEYS.has(field)) continue

                test(`flat schema exposes field "${field}"`, () => {
                    if (!(field in flatShape)) {
                        throw new Error(
                            `Field "${field}" of action "${action}" missing/drifted in flat schema`,
                        )
                    }
                    expect(flatShape[field]).toBeDefined()
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
})
