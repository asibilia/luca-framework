# Research Capture — Dependencies

**Subagent**: researcher
**Perspective**: dependencies
**Timestamp**: 2026-05-08T17:53Z

## Findings

### MuninnDB Tool Catalog (live-verified signatures)

**muninn_status**
- Returns: `{vault, total_memories, health, enrichment_mode}`
- Field is `total_memories` NOT `totalCount`.

**muninn_list** — DOES NOT EXIST. 0 matches in luca-mastracode.

**muninn_get_enrichment_candidates(vault?, cursor?, limit?, stages?)**
- limit default 50, max 200.
- stages: `entities|relationships|classification|summary`.
- Returns: `{items[], stages_requested[], count, next_cursor}`.
- Pagination: pass `next_cursor` as `cursor` next call. Empty = restart.
- Order: insertion (ULID asc).
- **CAVEAT: only returns memories missing enrichment stages.** Fully-enriched vault returns 0.

**muninn_recall(context[], vault?, limit?, mode?, threshold?, since?, before?, profile?, embedding?)**
- Returns: `{memories[{id, concept, content, score, vector_score, confidence, state, created_at, last_access, source_type, trust}], total}`
- **`trust` field IS in result.** Values: verified|inferred|external|untrusted.
- No cursor/offset. Only `limit`.

**muninn_trust(id, trust, vault?)**
- Args: engram id (ULID), tier string, optional vault.
- Last-write-wins. Idempotent.
- Error semantics undocumented.

**muninn_entities(vault?, limit?, state?)**
- Returns sparse — entity index, not all engrams.

### Tool Manifest
- `muninn_*` MCP tools NOT in `TOOL_MANIFEST` — bare passthrough, ungated per-mode.
- No manifest entry needed for memory-audit.

### Naming Convention
- All skill prose uses `mcp__muninn__muninn_<func>` (double-prefix).
- Confirmed: luca-init, arch-audit, rules, commands all use this form.

### Vault Config
- `.planning/config.json` → `muninn.vault` → `resolveProjectVault()` (src/state/vault.ts:39-53) → sanitized via `slugifySegment` → fallback `"default"`.
- SUBAGENT_SHARED_PREFIX has MEMORY_TIER_DISCIPLINE but NO vault-resolution prose.
- Orchestrator interpolates `<repo_vault>` when invoking subagents.

### .planning/audits/ Status
- NOT in `ROOT_WHITELIST_DIRS`. **Will be flagged as `unknownRootDir`** by `detectStragglers()` (repo-cleanup.ts:170-239).
- `cleanup-artifacts` action recurses `.planning/phases/<slug>/` only — not `audits/`.
- Fix required: add `'audits'` to `ROOT_WHITELIST_DIRS` (lines 90-95).

## Best Iteration Strategy
- `muninn_get_enrichment_candidates` is the ONLY cursor-paginated full(ish) walk, BUT scope-limited to under-enriched memories.
- For all-memory walk: combine `muninn_recall(mode:"deep", limit:N, since/before)` time-window batching with `muninn_get_enrichment_candidates` exhaustion.
- Alternative: prompt-engineer the skill to use diverse `context[]` recall queries for broad coverage.

## Open Q
- Does the skill audit ALL memories or just under-enriched ones?
- `muninn_trust` error semantics — silent or thrown?
