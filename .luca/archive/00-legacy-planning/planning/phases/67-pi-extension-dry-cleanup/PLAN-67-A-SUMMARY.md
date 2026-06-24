# PLAN-67-A Summary: Extract Shared Helpers from Pi Extensions

## Status: COMPLETE

## What Was Done

Created 4 new helper modules in `src/hooks/pi-extensions/__helpers/` alongside the existing `sanitize.ts` (from Phase 66), plus a barrel index and comprehensive tests.

### Files Created

| File                            | Purpose                      | Functions                                                              |
| ------------------------------- | ---------------------------- | ---------------------------------------------------------------------- |
| `__helpers/response.ts`         | Pi tool response wrappers    | `createTextResponse`, `createJsonResponse`, `ToolResponse` type        |
| `__helpers/frontmatter.ts`      | YAML frontmatter parser      | `parseFrontmatter`, `extractFrontmatterField`, `AgentFrontmatter` type |
| `__helpers/exec.ts`             | Shell command execution      | `runShellCommand`, `ExecResult` type, `ExecOptions` type               |
| `__helpers/registry.ts`         | Generic Map registry factory | `createRegistry<T>`                                                    |
| `__helpers/index.ts`            | Barrel re-exports            | All 4 new modules + existing sanitize                                  |
| `__tests__/response.test.ts`    | Response helper tests        | 15 tests                                                               |
| `__tests__/frontmatter.test.ts` | Frontmatter parser tests     | 16 tests                                                               |
| `__tests__/exec.test.ts`        | Exec helper tests            | 10 tests                                                               |
| `__tests__/registry.test.ts`    | Registry factory tests       | 16 tests                                                               |

### DRY Violations Addressed

| Severity | Pattern                  | Helper           | Occurrences Targeted          |
| -------- | ------------------------ | ---------------- | ----------------------------- |
| CRITICAL | JSON response wrapper    | `response.ts`    | 88 across 11 files            |
| CRITICAL | YAML frontmatter parsing | `frontmatter.ts` | 3 files (roles, teams, chain) |
| CRITICAL | Shell command execution  | `exec.ts`        | 2 files (harness, tilldone)   |
| HIGH     | Map-based registry       | `registry.ts`    | 7 Maps across 6 files         |

### Verification Results

- **Tests**: 127 pass, 0 fail (57 new + 70 existing sanitize)
- **Coverage**: 100% functions, 100% lines across all helper files
- **Type Check**: Zero type errors in new files (`bunx --bun tsc --noEmit`)
- **No new dependencies**: Uses only `child_process` (Node.js built-in)

### Key Design Decisions

1. **parseFrontmatter does NOT normalize tool names** -- this matches the luca-teams behavior where tools are stored raw. Normalization is the caller's responsibility (luca-roles applies `normalizeToolName` separately).
2. **runShellCommand timeout detection** uses duration heuristic (within 100ms of timeout) matching the existing luca-harness pattern.
3. **createRegistry** exposes `name` as a direct property for error message composition, not a getter.
4. **No modifications to existing extensions** -- this plan only creates the helpers. Plan 67-B will refactor extensions to consume them.

## Next Steps

- **Plan 67-B**: Refactor all 11 Pi extensions to use the new helpers
- **Plan 67-C**: Update build pipeline to copy `__helpers/` to `.pi/extensions/__helpers/`
