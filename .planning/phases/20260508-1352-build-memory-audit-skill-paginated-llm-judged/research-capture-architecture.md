# Research Capture — Architecture

**Subagent**: researcher
**Perspective**: architecture
**Timestamp**: 2026-05-08T17:53Z

## Findings

### Skill Execution Model
- Skills are **markdown prompt injections** into the calling agent — no separate process, no isolated tool registry.
- `allowedWorkspaceTools` exists only on HarnessSubagent definitions (`subagents/`).
- Researcher subagent: read-only tools only `[view, search_content, find_files, file_stat, lsp_inspect]`.
- Executor: full workspace tool access (no `allowedWorkspaceTools` field).
- **Skill invocation in `build`/`fast` mode = full access** (edit + execute + git).

### Write Tool Access
- `writePlanningFileTool` exists in `research`, `architect`, `execute`, `review` modes.
- **Absent from triage, discuss, finalize, plan modes.**
- Tool auto-creates parent dirs via `mkdirSync(dirname, {recursive: true})` (line 104).
- `scope: "root"` forces `.planning/` root (skip phase-slug routing).
- 512 KB content limit per write.
- Bare relative paths (no `.planning/` prefix).

### MuninnDB Iteration Strategy
- No single MCP call covers all engrams.
- **`muninn_get_enrichment_candidates`** — cursor-paginated, but only returns memories MISSING enrichment stages. NOT a full-vault iterator.
- `muninn_recall` — semantic search, no offset/cursor; misses low-similarity memories.
- `muninn_status` — stats only, no enumeration.
- `muninn_entities` — entity index, sparse coverage.
- **Hybrid pass design needed:**
  - Pass 1: `muninn_get_enrichment_candidates` (cursor) → unenriched memories
  - Pass 2: `muninn_recall` with diverse contexts → semantic coverage
  - Pass 3: `muninn_entities` → entity-graph health

### Cursor State Pattern
- Skills do NOT call `atomicWriteSync` directly — use `writePlanningFileTool` or tool abstractions.
- For state JSON: `writePlanningFileTool(action:"write", path:"audits/memory/state.json", scope:"root")`.

### Trust Promotion Flow
- Two-step: `remember` → capture id → `trust(id, tier, vault)`.
- `MEMORY_TIER_DISCIPLINE` enforced via `shared-prefix.ts` injection.

### Slash Command Shim
- `commands/*.md` = YAML frontmatter + body with `$ARGUMENTS`.
- `commands/memory-audit.md` does NOT exist. Must be created.

## Constraints
- Skill must run in mode that has `writePlanningFileTool`.
- /memory-audit triggered outside pipeline = `build` mode = full access.
- Inside pipeline: should NOT run from triage/finalize/discuss/plan.

## Open Q
- Sub-subagent spawning for very large vaults? `arch-audit` Step 2 spawns explore subagents.
- Demotion path (`muninn_trust(..., "untrusted")`) — supported by API but not exercised by any skill.
