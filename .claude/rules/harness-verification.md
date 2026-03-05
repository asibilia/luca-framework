---
description: "Harness/Hook verification boundary: when full harness runs vs lightweight hooks"
globs:
  - "*.ts"
  - "*.sh"
  - .planning/config.json
alwaysApply: true
---

# Harness/Hook verification boundary: when full harness runs vs lightweight hooks

## rule

# Harness/Hook Verification Boundary

## Two-Layer Verification

Luca uses two complementary verification layers:

| Layer | Mechanism | When | Checks | Output |
|-------|-----------|------|--------|--------|
| **Hooks** (lightweight) | Shell scripts via Claude Code/Cursor hooks | Every commit, every file edit | test + typecheck | Raw stderr/stdout, pass/fail |
| **Harness** (comprehensive) | TypeScript module via \`src/harness/runner.ts\` | Phase boundaries (after wave execution) | test + typecheck + lint + build | Structured JSON with parsed errors |

## When Hooks Run

- **post-edit-typecheck**: After every file edit (Edit/Write tool). Checks single file. Async.
- **pre-commit-gate**: Before every commit (git commit/bun run commit). Runs test + typecheck. Blocks on failure.

Hooks are fast (< 30s), deterministic, and fire automatically. They catch issues early.

## When Harness Runs

- **Phase boundary**: After all waves in a phase complete (phase-execute Step 6.5)
- **Before agent verification**: Harness runs before lu-verifier to catch mechanical failures
- **Failure-to-fix loop**: If harness fails, spawns executor to fix, re-runs (max 3 iterations)

The harness is thorough (runs all 4 check types), produces structured output, and feeds the verification pipeline.

## They Are Complementary

- Hooks catch issues **during development** (per-edit, per-commit)
- Harness catches issues **at phase boundaries** (comprehensive, with auto-fix)
- Both run the same underlying commands (bun test, tsc) but differ in scope and output format

## Configuration

- Hooks: Configured in \`hooks\` section of \`.planning/config.json\`
- Harness: Configured in \`harness\` section of \`.planning/config.json\`
- Both follow Bun-first conventions (bun test, bunx --bun tsc)