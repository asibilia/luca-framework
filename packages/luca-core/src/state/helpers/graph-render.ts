/**
 * Pure visualization of the pipeline.
 *
 * Serializes the canonical `PIPELINE_TRANSITIONS` table to a Mermaid
 * `stateDiagram-v2` for the `luca graph` CLI verb. PURE: reads no `.luca/`
 * state, and deterministic (no `Date`/`Math.random`) — two calls are
 * byte-identical.
 *
 * HISTORY: the edge set + hierarchy used to be read off the generated pipeline
 * machine's `toDirectedGraph()`. That machine was itself GENERATED from
 * `PIPELINE_TRANSITIONS` (edges) and carried the coarse-phase grouping on
 * `meta.coarsePhase`, so this renderer reads the same two sources directly. The
 * output is pinned byte-for-byte against the pre-deletion capture in
 * `../__golden__/pipeline-graph{,.annotated}.mermaid`.
 *
 * ORDERING (load-bearing for the golden — matches the machine's own insertion
 * order):
 *  - composites appear in first-appearance order over `PipelineStepValues`,
 *  - leaves inside a composite in `PipelineStepValues` order,
 *  - edges in declaration order: source step in `PipelineStepValues` order,
 *    targets in `PIPELINE_TRANSITIONS[from]` order.
 */
import { STEP_TO_COARSE_PHASE } from '../configs/coarse-phases.ts'
import { FIX_LOOP_EDGES } from '../configs/fix-loop-edges.ts'
import { PIPELINE_TRANSITIONS } from '../configs/pipeline-transitions.ts'
import { PipelineStepValues } from '../constants.ts'
import type { CoarsePhase, PipelineStep } from '../schemas.ts'

/**
 * Coarse phase → the Mermaid composite block that contains its steps, or
 * `null` when the phase's step is rendered as a top-level ATOMIC leaf.
 *
 * A literal transcription of the deleted machine's hierarchy: `idle` was a
 * top-level atomic node (the IDLE phase is one leaf and got no `state { … }`
 * wrapper); every other phase was a compound parent whose key is the lowercased
 * phase name.
 */
const COARSE_PHASE_CONTAINER = {
    IDLE: null,
    PLANNING: 'planning',
    EXECUTING: 'executing',
    REVIEWING: 'reviewing',
    FINALIZING: 'finalizing',
} satisfies Record<CoarsePhase, string | null>

/** A declared transition of the pipeline table. */
interface Edge {
    from: PipelineStep
    to: PipelineStep
}

/** The composite block a step renders inside, or `null` if it is atomic. */
function containerOf(step: PipelineStep): string | null {
    return COARSE_PHASE_CONTAINER[STEP_TO_COARSE_PHASE[step]]
}

/** Every declared edge, in machine-insertion (= table declaration) order. */
function allEdges(): Edge[] {
    return PipelineStepValues.flatMap((from) =>
        PIPELINE_TRANSITIONS[from].map((to) => ({ from, to }))
    )
}

/**
 * The pipeline's declared-transition edge set as `${from}->${to}` keys — the 21
 * legal edges of `PIPELINE_TRANSITIONS`.
 */
export function pipelineGraphEdges(): Set<string> {
    return new Set(allEdges().map((e) => `${e.from}->${e.to}`))
}

/** True when both endpoints live inside the SAME composite block. */
function isIntra(edge: Edge): boolean {
    const from = containerOf(edge.from)
    return from !== null && from === containerOf(edge.to)
}

/**
 * Render one `<src> --> <tgt> : ADVANCE` line, appending ` / <action>` when
 * `annotate` is set and the edge carries a fix-loop counter action.
 */
function edgeLine(edge: Edge, annotate: boolean, indent: string): string {
    const action = FIX_LOOP_EDGES[`${edge.from}->${edge.to}`]?.action
    const suffix = annotate && action !== undefined ? ` / ${action}` : ''
    return `${indent}${edge.from} --> ${edge.to} : ADVANCE${suffix}`
}

/**
 * Serialize the pipeline to a Mermaid `stateDiagram-v2`.
 *
 * Structure: `idle` is a top-level atomic leaf; each of the 4 coarse-phase
 * composites (planning/executing/reviewing/finalizing) becomes a
 * `state <parent> { … }` block declaring its leaves plus its intra-composite
 * edges; the 10 edges that cross a composite boundary are emitted at the top
 * scope by leaf-id reference (a supported `stateDiagram-v2` form).
 */
export function renderPipelineMermaid(opts?: { annotate?: boolean }): string {
    const annotate = opts?.annotate ?? false
    const edges = allEdges()

    // Composites in first-appearance order; leaves in canonical step order.
    const composites: { key: string; leaves: PipelineStep[] }[] = []
    const byKey = new Map<string, PipelineStep[]>()
    for (const step of PipelineStepValues) {
        const key = containerOf(step)
        if (key === null) continue
        let leaves = byKey.get(key)
        if (leaves === undefined) {
            leaves = []
            byKey.set(key, leaves)
            composites.push({ key, leaves })
        }
        leaves.push(step)
    }

    const lines: string[] = ['stateDiagram-v2', '    [*] --> idle']

    // Composite blocks: leaf declarations + intra-composite edges.
    for (const composite of composites) {
        lines.push(`    state ${composite.key} {`)
        for (const leaf of composite.leaves) lines.push(`        ${leaf}`)
        for (const edge of edges) {
            if (containerOf(edge.from) !== composite.key) continue
            if (!isIntra(edge)) continue
            lines.push(edgeLine(edge, annotate, '        '))
        }
        lines.push('    }')
    }

    // Cross-composite edges at the top scope (leaf-id reference).
    for (const edge of edges) {
        if (isIntra(edge)) continue
        lines.push(edgeLine(edge, annotate, '    '))
    }

    return lines.join('\n')
}
