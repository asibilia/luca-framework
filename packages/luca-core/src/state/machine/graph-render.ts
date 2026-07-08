/**
 * Pure visualization of the pipeline machine.
 *
 * These three functions serialize `pipelineMachine` for the `luca graph` CLI
 * verb. They are PURE: they import the module-load machine, read no `.luca/`
 * state, create no actor, and are deterministic (no `Date`/`Math.random`).
 *
 * The edge set is DERIVED from the machine's own directed graph
 * (`toDirectedGraph`) — never from the canonical transition table.
 * `toDirectedGraph` yields exactly the declared ADVANCE transitions (21, no
 * spurious "stay" self-edges — unlike `getAdjacencyMap`), so
 * `pipelineGraphEdges()` equals the golden `LEGAL_EDGE_SET` without any
 * adjacency filtering.
 */
import { toDirectedGraph } from 'xstate/graph'

import { pipelineMachine } from './pipeline-machine.ts'

/**
 * Minimal structural view of an `xstate/graph` directed-graph edge. `target`
 * is a single state node (verified empirically for this machine's edges);
 * `transition.actions` carries the fix-loop `assign` refs on the 6 budget
 * edges.
 */
interface DirectedEdge {
    source: { key: string }
    target: { key: string }
    transition: { actions?: readonly { type: string }[] }
}

/** Minimal structural view of an `xstate/graph` directed-graph node. */
interface DirectedNode {
    stateNode: { key: string; type?: string }
    children?: DirectedNode[]
    edges?: DirectedEdge[]
}

/** Recursively collect every declared edge in the directed graph. */
function collectEdges(node: DirectedNode, acc: DirectedEdge[]): void {
    for (const edge of node.edges ?? []) acc.push(edge)
    for (const child of node.children ?? []) collectEdges(child, acc)
}

/** The directed graph of the pipeline machine (cast to the structural view). */
function directedGraph(): DirectedNode {
    return toDirectedGraph(pipelineMachine) as unknown as DirectedNode
}

/**
 * The machine's declared-transition edge set as `${from}->${to}` keys.
 *
 * Equals the golden `LEGAL_EDGE_SET` (21 edges) — derived from the machine's
 * directed graph, not the canonical transition table (anti-02).
 */
export function pipelineGraphEdges(): Set<string> {
    const edges: DirectedEdge[] = []
    collectEdges(directedGraph(), edges)
    return new Set(edges.map((e) => `${e.source.key}->${e.target.key}`))
}

/** Action-type labels on an edge (fix-loop counter side-effects). */
function edgeActionLabels(edge: DirectedEdge): string[] {
    return (edge.transition.actions ?? []).map((a) => a.type)
}

/**
 * Render one `<src> --> <tgt> : ADVANCE` line, appending ` / <actions>` when
 * `annotate` is set and the edge carries fix-loop actions.
 */
function edgeLine(edge: DirectedEdge, annotate: boolean, indent: string): string {
    const labels = edgeActionLabels(edge)
    const suffix =
        annotate && labels.length > 0 ? ` / ${labels.join(', ')}` : ''
    return `${indent}${edge.source.key} --> ${edge.target.key} : ADVANCE${suffix}`
}

/**
 * Serialize the pipeline machine to a Mermaid `stateDiagram-v2`.
 *
 * Structure: `idle` is a top-level atomic leaf; each of the 4 compound parents
 * (planning/executing/reviewing/finalizing) becomes a `state <parent> { … }`
 * block declaring its leaves plus its intra-composite edges; the 10 edges that
 * cross a composite boundary are emitted at the top scope by leaf-id reference
 * (a supported `stateDiagram-v2` form).
 *
 * Deterministic: the node/edge order is the machine's own insertion order, so
 * two calls are byte-identical.
 */
export function renderPipelineMermaid(opts?: { annotate?: boolean }): string {
    const annotate = opts?.annotate ?? false
    const root = directedGraph()
    const children = root.children ?? []

    // Map every leaf to its composite parent key (top-level atomic leaves — the
    // `idle` node — map to null).
    const leafParent = new Map<string, string | null>()
    const composites: { key: string; leaves: string[] }[] = []
    for (const child of children) {
        const grandkids = child.children ?? []
        if (grandkids.length === 0) {
            leafParent.set(child.stateNode.key, null)
        } else {
            const leaves = grandkids.map((g) => g.stateNode.key)
            for (const leaf of leaves) leafParent.set(leaf, child.stateNode.key)
            composites.push({ key: child.stateNode.key, leaves })
        }
    }

    const allEdges: DirectedEdge[] = []
    collectEdges(root, allEdges)

    const isIntra = (edge: DirectedEdge): boolean => {
        const from = leafParent.get(edge.source.key) ?? null
        const to = leafParent.get(edge.target.key) ?? null
        return from !== null && from === to
    }

    const lines: string[] = ['stateDiagram-v2', '    [*] --> idle']

    // Composite blocks: leaf declarations + intra-composite edges.
    for (const composite of composites) {
        lines.push(`    state ${composite.key} {`)
        for (const leaf of composite.leaves) lines.push(`        ${leaf}`)
        for (const edge of allEdges) {
            if (leafParent.get(edge.source.key) !== composite.key) continue
            if (!isIntra(edge)) continue
            lines.push(edgeLine(edge, annotate, '        '))
        }
        lines.push('    }')
    }

    // Cross-composite edges at the top scope (leaf-id reference).
    for (const edge of allEdges) {
        if (isIntra(edge)) continue
        lines.push(edgeLine(edge, annotate, '    '))
    }

    return lines.join('\n')
}

/**
 * The machine's XState definition as pretty-printed JSON — an honest
 * `machine.toJSON()`, not a fabricated schema.
 */
export function pipelineDefinitionJson(): string {
    return JSON.stringify(pipelineMachine.toJSON(), null, 2)
}
