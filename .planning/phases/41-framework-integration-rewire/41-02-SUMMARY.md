# 41-02 Summary: Integration Tests, Old Test Rewire & Archive

**Plan ID:** 41-02
**Phase:** 41 (Framework Integration Rewire), Wave 2
**Branch:** 16--v1.6.0-package-and-publish (GitHub Issue #16)
**Status:** COMPLETED

## Task Outcomes

### T1: Bridge CLI smoke test (COMPLETED)

- **Commands:** `ensure-init`, `read-status`, `read-complexity` from `packages/luca-state/src/bridge.ts`
- **Result:** All returned valid JSON, all exit 0
- **Confirms:** Package is fully functional as standalone CLI entry point

### T2: Old test file rewire (COMPLETED)

- **Files:** 4 test files in `src/state-machine/__tests__/`
  - `bridge.test.ts` — BRIDGE + CLI constants updated
  - `bridge-integration.test.ts` — BRIDGE + CLI constants updated
  - `hook-integration.test.ts` — BRIDGE constant updated
  - `cli.test.ts` — CLI constant updated
- **Verification:** Zero matches for `src/state-machine/(bridge|cli).ts` in old test files

### T3: Package test suite (COMPLETED)

- **Command:** `bun test packages/luca-state/src/__tests__/`
- **Result:** 347 pass, 0 fail, 816 expect() calls across 11 test files

### T4: Full project test suite (COMPLETED)

- **Command:** `bun test`
- **Result:** 2107 pass, 3 fail (pre-existing), 6 skip, 5980 expect() calls across 117 files
- **Pre-existing failures:** `parseTodos` (2) and `planner integration` (1) — not regressions

### T5: Hook script verification (COMPLETED)

- **Check:** Bridge file exists at `packages/luca-state/src/bridge.ts`
- **Check:** `$STATE_MACHINE_BRIDGE` variable resolves and produces valid JSON
- **Result:** All checks pass

### T6: Archive deprecation notice (COMPLETED)

- **File created:** `src/state-machine/README.md`
- **Content:** Deprecation notice, migration table, canonical locations
- **Note:** No files deleted — backward compatibility preserved

### T7: MEMORY.md migration entry (COMPLETED)

- **Entry added:** Bridge path rewire from `src/` to `packages/`
- **Tags:** decisions, architecture

### T8: Final comprehensive verification (COMPLETED)

- **TypeScript:** Pre-existing errors only, no new errors
- **Tests:** 2107 pass, 3 pre-existing failures
- **Build:** 327 files, exit 0
- **Drift:** None detected
- **Final sweep:** Zero old-path references in all consumer directories

## Test Counts

| Suite                | Pass | Fail             | Skip |
| -------------------- | ---- | ---------------- | ---- |
| packages/luca-state/ | 347  | 0                | 0    |
| Full project         | 2107 | 3 (pre-existing) | 6    |

## Commit

- **Hash:** `636733f`
- **Message:** `feat(41-02): integration tests, old test rewire, and archive src/state-machine`
