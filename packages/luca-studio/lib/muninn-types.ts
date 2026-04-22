/**
 * Shared MuninnDB API response types.
 *
 * Single source of truth for MuninnDB REST API shapes used by both
 * server-side code (muninn-config.ts) and client-side hooks (use-memory.ts).
 *
 * Field set is the superset of both server and client needs.
 * Uses snake_case for all properties per API conventions.
 */

/** A single MuninnDB engram (knowledge unit). */
export interface MuninnEngram {
    id: string
    concept: string
    content: string
    confidence: number
    tags: string[]
    vault: string
    created_at: number
    /** Embedding dimension (server-side metadata). */
    embed_dim?: number
    /** Memory type classification (e.g., "pattern", "decision", "pitfall"). */
    memory_type?: string
    /** Engram lifecycle state (e.g., "active", "dormant"). */
    state?: string
    /** Last updated timestamp. */
    updated_at?: number
}

/** A semantic recall activation result from MuninnDB. */
export interface MuninnActivation {
    id: string
    concept: string
    content: string
    score: number
    confidence: number
    /** Breakdown of score components (e.g., semantic, recency, frequency). */
    score_components?: Record<string, number>
    /** Whether the engram is dormant. */
    dormant?: boolean
    /** Source type classification. */
    source_type?: string
    /** Tags associated with the activated engram. */
    tags?: string[]
    /** Memory type classification. */
    memory_type?: string
    /** Explanation of why this engram was activated. */
    why?: string
}

/** A single session activity entry from MuninnDB. */
export interface MuninnSessionEntry {
    id: string
    concept: string
    content: string
    created_at: number
}

/** Vault statistics response from MuninnDB. */
export interface MuninnStatsResponse {
    engram_count: number
    vault_count: number
    index_size: number
    storage_bytes: number
    /** Per-vault coherence metrics. */
    coherence?: Record<
        string,
        {
            score: number
            orphan_ratio: number
            contradiction_density: number
            duplication_pressure: number
            temporal_variance: number
            total_engrams: number
        }
    >
}

// -- Phase 03 additions -------------------------------------------------------

/** Entity aggregate from MuninnDB. */
export interface MuninnEntity {
    name: string
    type: string
    confidence: number
    state: string
    mention_count: number
    first_seen: string | null
    updated_at: string | null
    engrams: Array<{ id: string; concept: string; created_at: string }>
    /** Raw relationship data from MuninnDB links endpoint (shape varies). */
    relationships: unknown[]
    co_occurring: Array<{ entity_name: string; count: number }>
}

/** Entity timeline entry. */
export interface MuninnTimelineEntry {
    engram_id: string
    concept: string
    created_at: string
    summary: string
}

/** Entity timeline response. */
export interface MuninnEntityTimeline {
    entity: string
    first_seen: string | null
    mention_count: number
    timeline: MuninnTimelineEntry[]
    count: number
}

/** Find-by-entity result engram. */
export interface MuninnEntityEngram {
    id: string
    concept: string
    summary: string
    state: string
}

/** Contradiction pair from MuninnDB. */
export interface MuninnContradiction {
    id_a: string
    id_b: string
    concept_a: string
    concept_b: string
    reason: string
}

/** Graph traversal node. */
export interface MuninnTraverseNode {
    id: string
    concept: string
    depth: number
}

/** Explain score breakdown. */
export interface MuninnExplainResult {
    engram_id: string
    concept: string
    final_score: number
    components: {
        full_text_relevance: number
        semantic_similarity: number
        decay_factor: number
        hebbian_boost: number
        access_frequency: number
        confidence: number
    }
    fts_matches: unknown
    assoc_path: unknown
    would_return: boolean
    threshold: number
}

/** Entity cluster co-occurrence pair. */
export interface MuninnEntityCluster {
    entity_a: string
    entity_b: string
    count: number
}
