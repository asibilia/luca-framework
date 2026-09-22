/**
 * Tests for the pure pipeline visualization.
 *
 * THE GATE is the golden byte-equality pair: `../__golden__/pipeline-graph.mermaid`
 * and `../__golden__/pipeline-graph.annotated.mermaid` were captured from the
 * PRE-DELETION machine-backed renderer. The table-driven renderer must reproduce
 * them byte-for-byte — not "look the same".
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, test } from 'bun:test'

import { PIPELINE_TRANSITIONS } from '../configs/pipeline-transitions.ts'
import { PipelineStepValues } from '../constants.ts'
import { pipelineGraphEdges, renderPipelineMermaid } from './graph-render.ts'

const GOLDEN_DIR = join(import.meta.dir, '..', '__golden__')

/** Read a golden file, stripping the single trailing newline the CLI adds. */
function golden(name: string): string {
    return readFileSync(join(GOLDEN_DIR, name), 'utf8').replace(/\n$/, '')
}

describe('renderPipelineMermaid — GOLDEN byte-equality (pre-deletion capture)', () => {
    test('default output is byte-identical to pipeline-graph.mermaid', () => {
        expect(renderPipelineMermaid()).toBe(golden('pipeline-graph.mermaid'))
    })

    test('--annotate output is byte-identical to pipeline-graph.annotated.mermaid', () => {
        expect(renderPipelineMermaid({ annotate: true })).toBe(
            golden('pipeline-graph.annotated.mermaid')
        )
    })

    test('two calls are byte-identical (deterministic)', () => {
        expect(renderPipelineMermaid()).toBe(renderPipelineMermaid())
        expect(renderPipelineMermaid({ annotate: true })).toBe(
            renderPipelineMermaid({ annotate: true })
        )
    })
})

describe('renderPipelineMermaid — structure', () => {
    const mermaid = renderPipelineMermaid()

    test('first line is stateDiagram-v2', () => {
        expect(mermaid.split('\n')[0]).toBe('stateDiagram-v2')
    })

    test('declares each of the 13 leaves as a boundary-matched token', () => {
        for (const leaf of PipelineStepValues) {
            // Line-anchored `<leaf> -->` — NOT a bare substring, so `review`
            // does not false-pass on `plan-review`.
            const re = new RegExp(
                `(^|\\n)\\s*${leaf.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} -->`
            )
            expect(re.test(mermaid)).toBe(true)
        }
    })

    test('contains the 4 composite state blocks', () => {
        for (const block of [
            'state planning {',
            'state executing {',
            'state reviewing {',
            'state finalizing {',
        ]) {
            expect(mermaid).toContain(block)
        }
    })

    test('contains the research self-loop', () => {
        expect(mermaid).toContain('research --> research : ADVANCE')
    })

    test('emits exactly one ADVANCE line per table edge', () => {
        const advanceLines = mermaid
            .split('\n')
            .filter((l) => l.includes(' : ADVANCE')).length
        const tableEdges = Object.values(PIPELINE_TRANSITIONS).reduce(
            (n, nexts) => n + nexts.length,
            0
        )
        expect(advanceLines).toBe(tableEdges)
        expect(advanceLines).toBe(21)
    })

    test('annotate labels only the 6 fix-loop edges', () => {
        const annotated = renderPipelineMermaid({ annotate: true })
        expect(annotated).toContain('checks --> execute : ADVANCE / incFixLoop')
        expect(annotated).toContain('checks --> verify : ADVANCE / resetFixLoop')
        expect(
            annotated.split('\n').filter((l) => l.includes(' / ')).length
        ).toBe(6)
        // Default omits the suffix entirely.
        expect(renderPipelineMermaid()).not.toContain(' / ')
    })
})

describe('pipelineGraphEdges', () => {
    test('equals the 21 edges of PIPELINE_TRANSITIONS', () => {
        const expected = new Set(
            Object.entries(PIPELINE_TRANSITIONS).flatMap(([from, nexts]) =>
                nexts.map((to) => `${from}->${to}`)
            )
        )
        expect(pipelineGraphEdges()).toEqual(expected)
        expect(pipelineGraphEdges().size).toBe(21)
    })
})
