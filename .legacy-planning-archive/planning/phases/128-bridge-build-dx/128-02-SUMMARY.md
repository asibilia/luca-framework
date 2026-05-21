# Phase 128-02 Summary: Document Observability Domain & Align Context Pruning

## Task 1: Document Observability Domain (#50)

**Status**: Complete

Added new section 5 ("Observability Domain") to `docs/architecture-overview.md` that documents the three-component observability layer:

1. **`src/observability/`** (T1 Core) -- Agent scorecard engine for per-agent telemetry (invocation counts, success/failure rates, timing). Consumed by the routing layer for data-driven agent selection. Operates independently from the SpacetimeDB event flow.

2. **`packages/luca-spacetime/`** (External package) -- SpacetimeDB server module with 18 tables, 21 reducers, and a cleanup scheduler. Shared backend between framework writes and observer reads.

3. **`packages/luca-observer/`** (External package) -- Next.js 15 real-time dashboard with 11 routes and 16 `useTable()` hooks. Subscribes to SpacetimeDB via WebSocket.

The section includes an event flow diagram and a relationship table showing how these components connect to the core `src/` domain tier system.

Renumbered all subsequent sections (6-14 became 6-15) to maintain consistent numbering.

## Task 2: Align Context Pruning with Domain Architecture (#59)

**Status**: Complete -- no changes needed, documented rationale

**Finding**: Context pruning is already correctly placed in `src/memory/`.

**Evidence**:

- `src/memory/__helpers/context-pruning.ts` implements R8 requirements (stale envelope digestion, section-level retention policies, critical context preservation, pruning event logging)
- `src/memory/__helpers/auto-compaction.ts` implements R9 requirements (age/relevance scoring, summary compaction, session continuity)
- Both modules use schemas from `src/memory/__schemas/memory.schemas.ts` (retentionPolicySchema, pruningConfigSchema, pruningEventSchema, pruningResultSchema, sectionScoreSchema, compactionConfigSchema, compactionResultSchema)
- Both depend on `src/memory/__helpers/token-estimator.ts` for token budget calculations
- Both are pure functions (no I/O) following the memory domain's pattern

**Rationale documented in architecture-overview.md**: Context pruning manages working memory size and token budgets, which is squarely within the memory domain's T1 Core responsibility. There is no architectural reason to extract it into a separate domain -- it shares schemas, depends on memory-internal utilities, and its entire purpose is memory management.

## Files Changed

- `docs/architecture-overview.md` -- Added Section 5 (Observability Domain), added Context Pruning subsection under Memory System (Section 4), renumbered sections 6-15
