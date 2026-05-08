# Research Capture — Scope

**Subagent**: researcher
**Perspective**: scope
**Timestamp**: 2026-05-08T17:53Z

## Findings

### Asset System
- **No `BUNDLED_SKILLS` array exists.** `installSkills()` (src/integration/install-bundled-assets.ts:171) symlinks the entire `packages/luca-mastracode/skills/` directory. Adding `skills/memory-audit/SKILL.md` auto-exposes the skill — zero installer code change.
- Same for commands: `installSlashCommands()` line 162 symlinks `packages/luca-mastracode/commands/`.
- Tests at `src/__tests__/install-bundled-assets.test.ts` use generic `readdirSync(...).length > 0` (line 106) — no enumerated list.

### ROOT_WHITELIST vs ROOT_WHITELIST_DIRS
- **`ROOT_WHITELIST_DIRS`** (src/tools/repo-cleanup.ts:90-95): `Set<string>` of directory names. Current: `['phases','todos','runs']`. **THIS is the correct target** for adding `'audits'`.
- `ROOT_WHITELIST` (lines 60-87): files only. Wrong target.
- Consumed at line 217: `if (!ROOT_WHITELIST_DIRS.has(name))` — straggler detection branch.

### Existing Skill Templates
- `skills/luca-init/SKILL.md` — full frontmatter (name + description), Phase 1-4 numbered.
- `skills/arch-audit/SKILL.md` — description-only frontmatter.
- `commands/luca-init.md` — 270 bytes; `name`+`description` frontmatter, "Activate the X skill" + `$ARGUMENTS`.

### MuninnDB MCP Surface
- `muninn_recall`, `muninn_trust`, `muninn_status`, `muninn_get_enrichment_candidates`, `muninn_entities`, `muninn_contradictions` — all available.
- **`muninn_list` does NOT exist.** Pagination only via `muninn_get_enrichment_candidates(cursor)`.

### Existing Tests
- No prior per-skill test file (no arch-audit.test.ts etc.). memory-audit.test.ts would be first.
- `memory-tier-callsite.test.ts` already scans `skills/` — new SKILL.md tier markers required from day 1.

## Spec Corrections Needed
1. Spec says "ROOT_WHITELIST" — actual target is `ROOT_WHITELIST_DIRS`.
2. Spec says "BUNDLED_SKILLS array" — does not exist; symlink mechanism instead.
3. Spec says "muninn_list" — use `muninn_get_enrichment_candidates` cursor.

## Deliverable Mapping
| # | Path | Type |
|---|------|------|
| 1 | `packages/luca-mastracode/skills/memory-audit/SKILL.md` | NEW |
| 2 | `packages/luca-mastracode/commands/memory-audit.md` | NEW |
| 3 | `.planning/audits/memory/<ISO>.md` | runtime artifact |
| 4 | `.planning/audits/memory/state.json` | runtime artifact |
| 5 | `packages/luca-mastracode/src/tools/repo-cleanup.ts` | MOD (one-line ROOT_WHITELIST_DIRS add) |
| 6 | `packages/luca-mastracode/src/__tests__/install-bundled-assets.test.ts` | maybe MOD (assert dir exists) |
| 7 | `packages/luca-mastracode/src/__tests__/memory-audit.test.ts` | NEW |
