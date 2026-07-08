/**
 * STRUCTURAL DRIFT GUARD.
 *
 * Complements the verdict-level parity harness with a graph-level check: the
 * machine's reachable transition graph must equal the 21 legal edges of
 * `PIPELINE_TRANSITIONS`, and its hierarchy must be the 13-leaf shape carried
 * by the machine's coarse-phase structure (`meta.coarsePhase`: idle atomic +
 * 12 across 4 compound parents). If someone adds/removes a leaf or an edge in
 * the machine without a matching table change, this fails.
 *
 * Spike-6 note: `getAdjacencyMap` records a "stay" self-edge for EVERY state
 * under events that match no transition (XState keeps the snapshot when no
 * guard fires). So the raw adjacency contains spurious self-edges. We recover
 * the REAL edge set by filtering each `(state, event)` through the snapshot
 * `.can` oracle — exactly the transitions the machine would actually take.
 */
import { describe, expect, test } from 'bun:test'
import { getAdjacencyMap, adjacencyMapToArray, toDirectedGraph } from 'xstate/graph'

import { PipelineStepValues } from '../constants.ts'
import { pipelineMachine, stateValueToLeaf } from './pipeline-machine.ts'
import {
    edgeKey,
    EXPECTED_LEGAL_COUNT,
    LEGAL_EDGE_SET,
} from './fixtures.ts'

/** All ADVANCE events (one per candidate destination step). */
const ADVANCE_EVENTS = PipelineStepValues.map((to) => ({
    type: 'ADVANCE' as const,
    to,
}))

/**
 * Derive the machine's REAL edge set from `getAdjacencyMap`, filtering the
 * spurious "stay" self-edges via `.can` (spike 6).
 */
function machineEdgeSet(): Set<string> {
    const adjacency = getAdjacencyMap(pipelineMachine, {
        events: ADVANCE_EVENTS,
    })
    const rows = adjacencyMapToArray(adjacency)
    const edges = new Set<string>()
    for (const { state, event } of rows) {
        // Only count an edge when the machine would actually take it.
        if (state.can(event)) {
            const from = stateValueToLeaf(state.value)
            edges.add(edgeKey(from, event.to))
        }
    }
    return edges
}

describe('pipeline-machine graph — adjacency edge set (ac-16)', () => {
    test('real edge set equals the 21 legal-pair edges', () => {
        const edges = machineEdgeSet()
        expect(edges.size).toBe(EXPECTED_LEGAL_COUNT)
        expect(edges).toEqual(LEGAL_EDGE_SET)
    })

    test('includes the legal research->research self-loop', () => {
        expect(machineEdgeSet().has('research->research')).toBe(true)
    })
})

describe('pipeline-machine graph — directed-graph hierarchy snapshot', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    type DirectedNode = { children?: DirectedNode[]; stateNode?: { key?: string } }

    function countLeaves(node: DirectedNode): number {
        const kids = node.children ?? []
        if (kids.length === 0) return 1
        return kids.reduce((sum, c) => sum + countLeaves(c), 0)
    }

    test('has 13 leaves (idle atomic + 12 across 4 compound parents)', () => {
        const dg = toDirectedGraph(pipelineMachine) as unknown as DirectedNode
        expect(countLeaves(dg)).toBe(13)
    })

    test('top-level children are the 5 coarse phases', () => {
        const dg = toDirectedGraph(pipelineMachine) as unknown as DirectedNode
        const topLevel = (dg.children ?? []).map((c) => c.stateNode?.key)
        expect(topLevel).toEqual([
            'idle',
            'planning',
            'executing',
            'reviewing',
            'finalizing',
        ])
    })
})
