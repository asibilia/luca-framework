# Phase 29 Wave 2: Drift Test Helpers, Plugin Spec Migration

## Objective

Extract drift test helpers to DRY up check-drift.test.ts (TEST-02), and migrate plugin spec tests from sync node:fs to Bun APIs (TEST-03).

## Requirements Addressed

- TEST-02: Extract drift test helpers
- TEST-03: Migrate plugin spec tests to Bun APIs

## Tasks

### Task 1: Extract drift test helpers

DRY up repetitive patterns in check-drift.test.ts.

**Patterns to extract:**

- File existence + content comparison loop (appears ~9 times)
- Orphan detection loop (appears ~8 times)

**Files:**

- `scripts/check-drift.test.ts` — refactor to use helpers
- `scripts/test-helpers.ts` (new, if needed) — or inline helpers at top of test file

**Verification:** Tests pass. Net reduction of ~100-150 lines.

### Task 2: Migrate plugin spec tests to Bun APIs

Replace sync `node:fs` calls with Bun equivalents.

**Replacements:**

- `readFileSync()` → `await Bun.file(path).text()`
- `existsSync()` → `await Bun.file(path).exists()`
- `readdirSync()` → `await readdir()` (from `fs/promises`)
- `statSync()` → `await lstat()` (from `fs/promises`)

**Files:**

- `scripts/plugin-spec-structure.test.ts`
- `scripts/plugin-spec-hooks-format.test.ts`
- `scripts/plugin-spec-e2e.test.ts`

**Verification:** All plugin spec tests pass with async Bun APIs. No sync fs imports remain.

## Success Criteria

- [ ] Drift test helpers reduce check-drift.test.ts by 100+ lines
- [ ] No `readFileSync`/`existsSync`/`statSync`/`readdirSync` in plugin spec tests
- [ ] 982+ tests pass, zero drift
