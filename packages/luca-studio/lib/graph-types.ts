/**
 * Type definitions for the Knowledge Graph Explorer.
 *
 * Defines node/link shapes for ForceGraph2D, cluster state management,
 * entity type classification, and display metadata (colors, labels).
 *
 * Canonical source for entity type classification, used by both graph-types
 * and use-vault-health.ts (which imports KNOWN_ENTITY_TYPES from here).
 */

// -- Entity type classification -----------------------------------------------

/**
 * Known MuninnDB entity types for graph node classification.
 *
 * Canonical type union for entity classification across the app.
 */
export type EntityType =
    | 'pattern'
    | 'decision'
    | 'pitfall'
    | 'preference'
    | 'fact'
    | 'observation'
    | 'procedure'
    | 'identity'
    | 'session'
    | 'brain'
    | 'reference'
    | 'other'

/**
 * Known entity types set for runtime membership checks.
 *
 * Canonical source -- imported by hooks/use-vault-health.ts for engram
 * type categorization.
 */
export const KNOWN_ENTITY_TYPES = new Set<string>([
    'pattern',
    'decision',
    'pitfall',
    'preference',
    'fact',
    'observation',
    'procedure',
    'identity',
    'session',
    'brain',
    'reference',
])

// -- Color mapping ------------------------------------------------------------

/**
 * Hex color strings for each entity type.
 *
 * Used by ForceGraph2D node rendering to color-code nodes by type.
 */
export const TYPE_COLORS: Record<EntityType, string> = {
    pattern: '#22c55e', // green
    decision: '#3b82f6', // blue
    pitfall: '#f97316', // orange
    preference: '#a855f7', // purple
    fact: '#6b7280', // gray
    observation: '#9ca3af', // light gray
    procedure: '#14b8a6', // teal
    identity: '#eab308', // gold
    session: '#06b6d4', // cyan
    brain: '#ec4899', // pink
    reference: '#6b7280', // gray
    other: '#6b7280', // gray
}

/**
 * Display metadata for each entity type (label + color).
 *
 * Used by the graph legend and tooltips.
 */
export const TYPE_DISPLAY: Record<
    EntityType,
    { label: string; color: string }
> = {
    pattern: { label: 'Patterns', color: '#22c55e' },
    decision: { label: 'Decisions', color: '#3b82f6' },
    pitfall: { label: 'Pitfalls', color: '#f97316' },
    preference: { label: 'Preferences', color: '#a855f7' },
    fact: { label: 'Facts', color: '#6b7280' },
    observation: { label: 'Observations', color: '#9ca3af' },
    procedure: { label: 'Procedures', color: '#14b8a6' },
    identity: { label: 'Identity', color: '#eab308' },
    session: { label: 'Sessions', color: '#06b6d4' },
    brain: { label: 'Brain', color: '#ec4899' },
    reference: { label: 'References', color: '#6b7280' },
    other: { label: 'Other', color: '#6b7280' },
}

// -- Graph data types ---------------------------------------------------------

/**
 * A single node in the knowledge graph.
 *
 * Represents either an individual entity or a cluster supernode
 * (when types are collapsed). ForceGraph2D reads `id`, `val`, `x`, `y`.
 */
export interface GraphNode {
    /** Unique identifier (entity name or cluster type key). */
    id: string
    /** Display name. */
    name: string
    /** Resolved entity type. */
    type: EntityType
    /** Whether this node is a cluster supernode (collapsed type group). */
    is_cluster: boolean
    /** Number of child nodes when this is a cluster. */
    child_count: number
    /** Number of engrams associated with this entity. */
    engram_count: number
    /** Earliest engram timestamp (epoch seconds). */
    first_seen: number | null
    /** Latest engram timestamp (epoch seconds). */
    last_seen: number | null
    /** Node size value for ForceGraph2D (derived from engram_count). */
    val: number
    /** Optional x position (ForceGraph2D). */
    x?: number
    /** Optional y position (ForceGraph2D). */
    y?: number
}

/**
 * A single link (edge) in the knowledge graph.
 *
 * Represents a co-occurrence relationship between two entities.
 * ForceGraph2D reads `source` and `target` as node IDs.
 */
export interface GraphLink {
    /** Source node ID. */
    source: string
    /** Target node ID. */
    target: string
    /** Co-occurrence weight (count). */
    weight?: number
    /** Relationship type classification. */
    type?: string
}

/**
 * Complete graph dataset ready for ForceGraph2D.
 */
export interface GraphData {
    nodes: GraphNode[]
    links: GraphLink[]
}

// -- UI state types -----------------------------------------------------------

/**
 * Set of expanded entity type strings.
 *
 * When a type is in this set, its individual nodes are shown.
 * When absent, nodes of that type collapse into a cluster supernode.
 */
export type ClusterState = Set<string>

// -- Resolve helper -----------------------------------------------------------

/**
 * Resolve entity type from a MuninnDB engram.
 *
 * Uses the same hybrid strategy as use-vault-health.ts resolveEngramType:
 * 1. memory_type field if it matches a known type
 * 2. Concept prefix (text before first `:`) if known
 * 3. "other" as fallback
 *
 * @param memoryType - Optional memory_type field from engram
 * @param concept - Engram concept string
 * @returns Resolved entity type
 */
export function resolveEntityType(
    memoryType: string | undefined,
    concept: string
): EntityType {
    if (memoryType && KNOWN_ENTITY_TYPES.has(memoryType)) {
        return memoryType as EntityType
    }

    const colonIndex = concept.indexOf(':')
    if (colonIndex > 0) {
        const prefix = concept.slice(0, colonIndex).toLowerCase().trim()
        if (KNOWN_ENTITY_TYPES.has(prefix)) {
            return prefix as EntityType
        }
    }

    return 'other'
}
