/**
 * Tests for the pure pipeline-machine visualization (DAD-P1d).
 *
 * The renderer must serialize the machine faithfully: its edge set equals the
 * 21 golden legal edges, its Mermaid output declares all 13 leaves + 4
 * composite blocks + the research self-loop, and it is byte-deterministic. The
 * JSON form must parse to a definition with exactly 21 flattened ADVANCE
 * transitions.
 */
import { describe, expect, test } from 'bun:test'

import { EXPECTED_LEGAL_COUNT, LEGAL_EDGE_SET } from './fixtures.ts'
import {
    pipelineDefinitionJson,
    pipelineGraphEdges,
    renderPipelineMermaid,
} from './graph-render.ts'

/** The 13 leaf state ids (idle atomic + 12 nested across 4 compound parents). */
const LEAF_IDS = [
    'idle',
    'triage',
    'research',
    'discuss',
    'architect',
    'plan',
    'plan-review',
    'execute',
    'checks',
    'verify',
    'review',
    'learn',
    'finalize',
] as const

/** The 4 compound parent block headers. */
const COMPOSITE_BLOCKS = [
    'state planning {',
    'state executing {',
    'state reviewing {',
    'state finalizing {',
] as const

/** Escape a leaf id for use in a RegExp (only `plan-review` has a metachar). */
function escapeRegex(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

describe('pipelineGraphEdges — machine-derived edge set (ac-06)', () => {
    test('equals the 21 golden legal edges', () => {
        const edges = pipelineGraphEdges()
        expect(edges.size).toBe(EXPECTED_LEGAL_COUNT)
        expect(edges).toEqual(LEGAL_EDGE_SET)
    })
})

describe('renderPipelineMermaid — structure (ac-03/04/05/07)', () => {
    const mermaid = renderPipelineMermaid()

    test('first line is stateDiagram-v2 (ac-03)', () => {
        expect(mermaid.split('\n')[0]).toBe('stateDiagram-v2')
    })

    test('declares each of the 13 leaves as a boundary-matched token (ac-04)', () => {
        for (const leaf of LEAF_IDS) {
            // Line-anchored `<leaf> -->` — NOT a bare substring, so `review`
            // does not false-pass on `plan-review`.
            const re = new RegExp(`(^|\\n)\\s*${escapeRegex(leaf)} -->`)
            expect(re.test(mermaid)).toBe(true)
        }
    })

    test('boundary match rejects the substring trap', () => {
        // Sanity: a `review -->` line must exist, but it must be `review`, not
        // the `plan-review` prefix.
        const reviewRe = /(^|\n)\s*review -->/
        expect(reviewRe.test(mermaid)).toBe(true)
        expect(/(^|\n)\s*plan-review -->/.test(mermaid)).toBe(true)
    })

    test('contains the 4 composite state blocks (ac-05)', () => {
        for (const block of COMPOSITE_BLOCKS) {
            expect(mermaid).toContain(block)
        }
    })

    test('contains the research self-loop (ac-07)', () => {
        expect(mermaid).toContain('research --> research : ADVANCE')
    })
})

describe('renderPipelineMermaid — determinism + annotate (ac-10)', () => {
    test('two calls are byte-identical', () => {
        expect(renderPipelineMermaid()).toBe(renderPipelineMermaid())
    })

    test('annotate appends fix-loop action labels', () => {
        const annotated = renderPipelineMermaid({ annotate: true })
        expect(annotated).toContain('checks --> execute : ADVANCE / incFixLoop')
        expect(annotated).toContain('checks --> verify : ADVANCE / resetFixLoop')
        // Default (no annotate) omits the action suffix.
        expect(renderPipelineMermaid()).toContain(
            'checks --> execute : ADVANCE'
        )
        expect(renderPipelineMermaid()).not.toContain('/ incFixLoop')
    })
})

describe('pipelineDefinitionJson — machine.toJSON() (ac-08)', () => {
    test('parses and has exactly 21 flattened ADVANCE transitions', () => {
        const def = JSON.parse(pipelineDefinitionJson())
        expect(def).toBeDefined()

        const countAdvance = (states: unknown): number => {
            let n = 0
            for (const value of Object.values(
                (states ?? {}) as Record<string, unknown>
            )) {
                const node = value as {
                    on?: { ADVANCE?: unknown }
                    states?: unknown
                }
                const adv = node.on?.ADVANCE
                if (Array.isArray(adv)) n += adv.length
                else if (adv !== undefined) n += 1
                if (node.states) n += countAdvance(node.states)
            }
            return n
        }

        expect(countAdvance((def as { states?: unknown }).states)).toBe(
            EXPECTED_LEGAL_COUNT
        )
    })
})
