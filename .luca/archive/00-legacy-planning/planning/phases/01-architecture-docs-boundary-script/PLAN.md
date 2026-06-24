---
phase: 1
plan: 1
type: improvement
autonomous: true
wave: 1
depends_on: []
---

# Phase 1 Plan 1: Architecture Docs + Boundary Script

## Objective

Register three new domains — `workflow` (T1 Core), `eval` (T1 Core), and `adapters` (T3 Build) — in architecture documentation and the automated boundary check script before any implementation begins. All changes are mechanical edits to docs and config; zero risk to existing functionality.

## Context

- @.claude/rules/domain-architecture.md
- @.claude/rules/module-boundary.md
- @scripts/check-domain-boundaries.ts
- @.planning/phases/01-architecture-docs-boundary-script/01-CONTEXT.md

## Tasks

### 1. X01: Update Architecture Rule Files

**Type:** auto
**TDD:** false
**Depends on:** none

Edit two rule files to register the three new domains:

**`.claude/rules/domain-architecture.md`** — 3 table edits:

- Archetype B table: add `workflow` row (Purpose: DAG engine, step contracts, phase pipeline) and `eval` row (Purpose: evaluation framework, graders, runners, reporters)
- Archetype C table: add `adapters` row (Purpose: IDE-specific compilation, Cursor/Windsurf/VSCode adapters)
- Four Dependency Tiers table: add `workflow`, `eval` to T1 Core domains row; add `adapters` to T3 Build domains row

**`.claude/rules/module-boundary.md`** — 2 edits:

- Tier map code block: add `workflow`, `eval` to T1 Core line; add `adapters` to T3 Build line
- Import examples: add one `workflow` (T1 importing T0) and one `adapters` (T3, terminal) example in the existing import direction examples section

**Files to create/edit:**

- `/Users/alecsibilia/Github/luca-framework/.claude/rules/domain-architecture.md`
- `/Users/alecsibilia/Github/luca-framework/.claude/rules/module-boundary.md`

**Verification:**

- Both files contain `workflow`, `eval`, and `adapters` entries
- Tier assignments are consistent across both files: workflow=T1, eval=T1, adapters=T3
- No existing rows were removed or modified

### 2. X02: Add Domain Tier Entries to Boundary Script

**Type:** auto
**TDD:** false
**Depends on:** Task 1

Add 3 entries to the `DOMAIN_TIER` map in `scripts/check-domain-boundaries.ts`:

- `workflow: 1`
- `eval: 1`
- `adapters: 3`

Follow the existing map entry format exactly (match indentation and quoting style of adjacent entries).

**Files to create/edit:**

- `/Users/alecsibilia/Github/luca-framework/scripts/check-domain-boundaries.ts`

**Verification:**

- `DOMAIN_TIER` map contains all three new entries with correct tier numbers
- Run `bun run scripts/check-domain-boundaries.ts` — exits 0, output references no unknown-domain warnings for workflow/eval/adapters (domains will be silently skipped until their `src/` directories exist, which is the correct behavior)

## Verification

1. Grep both rule files for `workflow`, `eval`, `adapters` — all three present in correct tier sections
2. Tier assignments are consistent: workflow=T1, eval=T1, adapters=T3 across all three files
3. `bun run scripts/check-domain-boundaries.ts` exits 0

## Success Criteria

- Three domains registered in `.claude/rules/domain-architecture.md` Archetype B/C tables and Four Dependency Tiers table
- Three domains registered in `.claude/rules/module-boundary.md` tier map and import examples
- Three entries added to `DOMAIN_TIER` in `scripts/check-domain-boundaries.ts`
- Boundary script exits 0 with no regressions

## Output Specification

- Modified: `.claude/rules/domain-architecture.md`
- Modified: `.claude/rules/module-boundary.md`
- Modified: `scripts/check-domain-boundaries.ts`
