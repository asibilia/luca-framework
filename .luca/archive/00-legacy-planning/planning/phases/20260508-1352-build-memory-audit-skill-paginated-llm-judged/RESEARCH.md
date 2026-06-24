# Research: /memory-audit skill

## Summary

Build a markdown skill (`skills/memory-audit/SKILL.md` + `commands/memory-audit.md`) that paginates the active MuninnDB vault, LLM-judges each engram against the tier-decision rule, and applies trust corrections via `muninn_trust`. Three spec corrections required (no `BUNDLED_SKILLS` array, `ROOT_WHITELIST_DIRS` not `ROOT_WHITELIST`, no `muninn_list` MCP tool). Critical risk is LLM false-`verified` promotion → mandate dry-run + citation-presence check + per-memory confirm gate.

## Scope

**NEW files:**
- `packages/luca-mastracode/skills/memory-audit/SKILL.md`
- `packages/luca-mastracode/commands/memory-audit.md`
- `packages/luca-mastracode/src/__tests__/memory-audit.test.ts`

**MOD files:**
- `packages/luca-mastracode/src/tools/repo-cleanup.ts` — one-line add `'audits'` to `ROOT_WHITELIST_DIRS` (lines 90-95).

**Runtime artifacts (created by skill at runtime, no code change):**
- `.planning/audits/memory/<ISO>.md` (per-run reports)
- `.planning/audits/memory/state.json` (cursor)

**Spec corrections vs todo:**
1. Todo says "BUNDLED_SKILLS" — does NOT exist. Symlink-based discovery at `installSkills()` (install-bundled-assets.ts:171). No installer change needed.
2. Todo says "ROOT_WHITELIST" — actual target is `ROOT_WHITELIST_DIRS` (line 90-95).
3. Todo references `muninn_list` — does NOT exist. Use `muninn_get_enrichment_candidates` (cursor) + `muninn_recall` (semantic) hybrid.

## Architecture

- **Skills are markdown prompt injections** into calling agent. No separate process. Tool surface = caller's tool surface.
- **Slash command in build/fast mode** = full workspace tools.
- **`writePlanningFileTool`** auto-mkdirs parents (line 104). `scope:"root"` for `.planning/` root. Bare relative paths.
- **No `muninn_list`.** Pagination strategies:
  - `muninn_get_enrichment_candidates(cursor, limit)` — opaque cursor, ULID asc order, max 200/call. **Only returns under-enriched memories** (caveat).
  - `muninn_recall(context[], limit, since/before)` — semantic, no cursor. Time-windowed batching possible.
- **Trust two-step:** `remember` → capture id → `trust(id, tier, vault)`. `muninn_trust` last-write-wins.
- **`muninn_recall` returns `trust` field per result** — skill can read current tier without separate lookup.

## Patterns

**SKILL.md structure (mirror luca-init):**
- YAML frontmatter (full: `name` + multi-line `description`).
- `## Step N — Name` headings.
- `mcp__muninn__muninn_<func>` double-prefix call notation in prose.
- `<!-- Tier: inferred -->` HTML comment line immediately before any `muninn_remember` block (callsite test scans `skills/`).
- Vault one-liner: `Vault from .planning/config.json → muninn.vault, fallback "default".`
- Failure-modes table at bottom.
- ask_user gated by oversight check; abort = "Write nothing. Stop the skill."

**Slash command shim** (mirror commands/luca-init.md):
```
---
name: memory-audit
description: One-line
---
Activate the `memory-audit` skill. Optional args (--vault, --dry-run, --resume, --limit):

$ARGUMENTS
```

**State persistence:** writePlanningFileTool with `scope:"root"`, `path:"audits/memory/state.json"`. Schema: `{vault, cursor, lastRunAt, totalsByTier, runId}`. Write AFTER trust calls succeed (idempotent retry on crash).

**Report markdown:** Mirror REVIEW-{wave}.md table format. Per-run file `.planning/audits/memory/<ISO>.md`. Capture `{id, concept, previous_trust, proposed_trust, rationale}` per memory.

## Dependencies

**MuninnDB tool signatures (live-verified):**
- `muninn_status` → `{vault, total_memories, health, enrichment_mode}`. Field `total_memories` (NOT totalCount).
- `muninn_get_enrichment_candidates(vault?, cursor?, limit≤200, stages?)` → `{items[{id,concept,content,summary,...}], next_cursor, count}`. ULID asc.
- `muninn_recall(context[], vault?, limit?, mode?, threshold?, since?, before?)` → `{memories[{id,trust,...}], total}`. **Trust field present.**
- `muninn_trust(id, trust, vault?)` — engram id ULID, tier string. Last-write-wins.
- `muninn_provenance(id)` — recovers prior trust if needed.

**Tool gating:** `muninn_*` tools NOT in TOOL_MANIFEST — bare passthrough, ungated per-mode. No manifest entry needed.

**Vault config:** `.planning/config.json` → `muninn.vault` → `resolveProjectVault()` → `slugifySegment` → fallback `"default"`. SUBAGENT_SHARED_PREFIX has tier-discipline but NO vault-resolution prose. Skill provides one-liner.

## Risks

**R1 — LLM false-verified promotion (CRITICAL):**
- Cold archived memories lack original context.
- Mandate: `--dry-run` default ON. `--apply` flag required for actual mutations.
- Hard rule: skill emits ONLY `verified` or `inferred`. Prohibit `untrusted` (discipline line 20). Leave `external` untouched.
- Citation-presence check: `verified` requires file path / PR id / URL / quoted source in content.
- Per-memory confirm gate for `verified` promotions in non-full-auto oversight.

**R2 — Scope creep to muninn_remember/forget/consolidate (HIGH):**
- Hard-prohibition block in SKILL.md.
- Test: regex-scan SKILL.md asserts absence of `muninn_forget|muninn_consolidate|muninn_remember\b|muninn_evolve`.

**R3 — Cursor split-brain (HIGH):**
- Safe ordering: trust calls FIRST, advance cursor SECOND.
- Use `atomicWriteSync` semantics if direct write; writePlanningFileTool's non-atomic write OK because re-trust is idempotent.

**R4 — Whitelist gap (HIGH):**
- One-line fix: add `'audits'` to `ROOT_WHITELIST_DIRS` (repo-cleanup.ts:90-95).

**R5–R10:** vault-pinning at start, idempotency via cursor-terminal detection, drift logged in reports, batch size 10-15, sequential per-id trust acceptable, inherit verified-followup test scanner.

## Recommendations

1. **3-wave plan:**
   - W1: SKILL.md + slash-command shim. Tier markers. Hard-prohibition block. Citation rule. Dry-run default.
   - W2: ROOT_WHITELIST_DIRS one-line update.
   - W3: tests — file existence, no-forbidden-tools regex, prose contracts present.

2. **Pagination strategy:** primary loop `muninn_get_enrichment_candidates(cursor)` until exhausted. Fallback semantic walk via `muninn_recall(mode:"deep", since/before)` time-window batching for full-vault coverage. Document explicitly that current MCP surface cannot guarantee exhaustive enumeration.

3. **Trust tier emission rules** (codified in SKILL.md):
   - `verified`: only with citation evidence + per-memory confirm (non-full-auto) or `--allow-verified-batch` flag (full-auto, with logged warning).
   - `inferred`: default for any pattern/lesson/opinion/prediction.
   - `external`: NEVER touched.
   - `untrusted`: NEVER assigned (discipline rule).

4. **State file schema:**
   ```json
   {
     "vault": "<resolved-vault-name>",
     "cursor": "<opaque-string-or-empty>",
     "runId": "<ISO-timestamp>",
     "lastRunAt": "<ISO>",
     "totalsByTier": {"verified": 0, "inferred": 0, "external": 0, "untrusted": 0},
     "totalProcessed": 0,
     "complete": false
   }
   ```

5. **Report path:** `.planning/audits/memory/<ISO>.md` (per-run, history preserved).

6. **No new MuninnDB writes from skill** — read-then-trust only.

## Open Questions

1. Audit scope: ALL memories vs only under-enriched? `muninn_get_enrichment_candidates` only covers latter. → Recommend hybrid (primary cursor pass + semantic complement) but acknowledge non-exhaustive limitation in SKILL.md.
2. Demotion to `untrusted` — prohibit per discipline.
3. `external` tier handling — leave untouched.
4. Concurrent runs same vault — out of scope; document single-run assumption.
5. Report retention/pruning — out of scope; `.planning/audits/memory/` accumulates per-run files.
