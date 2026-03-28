# Phase 216 Context — Git Routes Runtime Fix

## Decisions

### Approach: child_process over sidecar

- **Selected:** Option 1 — Replace `Bun.$` with `node:child_process` `execSync`
- **Rationale:** Simplest fix. Only 7 Bun.$ calls across 3 files. Sidecar approach (Option 2) is architecturally cleaner but adds 3 new HTTP endpoints + error handling for a problem that `execSync` solves in a few lines each. All git commands are synchronous operations (status, add, commit, log, diff-tree, checkout).
- **Pattern:** Use `execSync(cmd, { cwd, encoding: 'utf-8' })` and handle stderr/exit codes
- **Files:** publish/route.ts (4 calls), revert/route.ts (1 call), history/route.ts (2 calls)
- **Note:** This also fixes the pre-existing TS2532 errors in history/route.ts and revert/route.ts (Object possibly undefined from Bun.$ output handling)

---

_Context created: 2026-03-27 — Phase 216 (SIMPLE complexity)_
