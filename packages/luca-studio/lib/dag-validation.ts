/**
 * DAG (Directed Acyclic Graph) validation utilities.
 *
 * Provides cycle detection for pipeline editor connection operations.
 * Used by the `onConnect` handler to reject edges that would create
 * cycles in the workflow graph.
 */

// -- Types --------------------------------------------------------------------

/** Minimal edge shape for cycle detection (source -> target). */
interface DirectedEdge {
    source: string
    target: string
}

// -- Public API ---------------------------------------------------------------

/**
 * Detect whether a directed graph contains a cycle.
 *
 * Uses Kahn's algorithm (topological sort via in-degree tracking).
 * Returns `true` if the graph has at least one cycle, `false` if it
 * is a valid DAG.
 *
 * @param nodeIds - Array of all node IDs in the graph.
 * @param edges - Array of directed edges (source -> target).
 * @returns `true` if the graph contains a cycle.
 *
 * @example
 * ```typescript
 * const hasLoop = hasCycle(
 *   ["a", "b", "c"],
 *   [{ source: "a", target: "b" }, { source: "b", target: "c" }]
 * );
 * // hasLoop === false (valid DAG)
 *
 * const hasLoop2 = hasCycle(
 *   ["a", "b", "c"],
 *   [
 *     { source: "a", target: "b" },
 *     { source: "b", target: "c" },
 *     { source: "c", target: "a" },
 *   ]
 * );
 * // hasLoop2 === true (cycle: a -> b -> c -> a)
 * ```
 */
export function hasCycle(nodeIds: string[], edges: DirectedEdge[]): boolean {
    // Build adjacency list and in-degree map
    const adjacency = new Map<string, string[]>()
    const inDegree = new Map<string, number>()

    for (const id of nodeIds) {
        adjacency.set(id, [])
        inDegree.set(id, 0)
    }

    for (const edge of edges) {
        const neighbors = adjacency.get(edge.source)
        if (neighbors) {
            neighbors.push(edge.target)
        }
        inDegree.set(edge.target, (inDegree.get(edge.target) ?? 0) + 1)
    }

    // Initialize queue with zero in-degree nodes
    const queue: string[] = []
    for (const [id, degree] of inDegree) {
        if (degree === 0) {
            queue.push(id)
        }
    }

    // Process nodes in topological order
    let processedCount = 0
    while (queue.length > 0) {
        const node = queue.shift()!
        processedCount++

        const neighbors = adjacency.get(node) ?? []
        for (const neighbor of neighbors) {
            const newDegree = (inDegree.get(neighbor) ?? 1) - 1
            inDegree.set(neighbor, newDegree)
            if (newDegree === 0) {
                queue.push(neighbor)
            }
        }
    }

    // If not all nodes were processed, a cycle exists
    return processedCount !== nodeIds.length
}
