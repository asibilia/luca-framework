# Phase 202: Pre-Mortem Risk Brief

**Complexity:** COMPLEX | **Appetite:** Large (200k tokens)

## Risk 1: Config Draft Atom Collision With SSE Re-Hydration

**Scenario:** SSE file-change handler re-sets `configAtom` on any config.json change. If user is editing Gates tab while Luca CLI writes config.json, the `configEtagAtom` silently updates to the new file's ETag. Subsequent PUT with stale draft body + fresh ETag bypasses optimistic concurrency, writing a config that merges partial edits with outdated base.

**Mitigation:** On SSE config re-hydration, compare incoming ETag against `configEtagAtom`; if changed while `dirtySetAtom` contains `"config"`, show conflict toast and block save until user resolves (refresh or force-save).

**Plan constraint:** Config page MUST include SSE conflict-detection mechanism before enabling saves.

## Risk 2: Memory Tab Consolidation Breaks Performance

**Scenario:** Absorbing 5+ standalone pages into one tabbed view causes all hooks to mount simultaneously — `useMemory`, `useMemoryHealth`, `useObservations`, `useEntityClusters`, `useLearningEvolution`, `useSemanticSearch`, `useVaultHealth` — creating waterfall fetches that block initial render.

**Mitigation:** Use conditional rendering (`{activeTab === "learning" && <LearningTab />}`) to mount/unmount per active tab, preventing 8+ concurrent API fetches on page load.

**Plan constraint:** Memory consolidation MUST use conditional tab rendering, not CSS-hidden panels.

## Risk 3: Skills/Rules Save Hook Field Map Mismatch

**Scenario:** `useAgentSave` contains hardcoded `FIELD_KEY_MAP` and `mergeFieldOverrides` for agent-specific fields. Copy-pasting to skill/rule save hooks without updating field maps causes form edits to silently fail — save appears to succeed but field overrides are not merged.

**Mitigation:** Extract `mergeFieldOverrides` into shared helper accepting `fieldKeyMap` parameter. Define per-entity-type field maps. Verify after merge that at least one replacement was made when draft has changed fields.

**Plan constraint:** Skills/Rules save hooks MUST NOT copy use-agent-save.ts verbatim. Parameterize field-merge logic first.
