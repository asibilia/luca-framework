# Plan 74-A: Hook Script Portability

## Objective

Make hook scripts work in both monorepo and installed-package contexts by adding PATH exports and cascading bridge resolution.

## Tasks

### T1: Add PATH export to all 9 hook scripts

Add `export PATH="${CLAUDE_PROJECT_DIR:-.}/node_modules/.bin:$PATH"` after `set -euo pipefail` in:

- context-check-throttled.sh
- context-monitor.sh
- post-edit-format.sh
- post-edit-typecheck.sh
- pre-commit-drift-check.sh
- pre-commit-gate.sh
- session-persist.sh
- session-start.sh
- snapshot-sync.sh

### T2: Add cascading bridge lookup to bridge-using scripts

Replace hardcoded `packages/luca-framework/src/state/bridge.ts` paths with `run_bridge()` function:

1. Try `luca-bridge` bin (installed package via PATH)
2. Try `bun run` monorepo source path
3. Skip silently (bridge not available)

Scripts: snapshot-sync.sh, pre-commit-gate.sh, session-start.sh

### T3: Sync .claude/hooks/ to .cursor/hooks/ and .pi/hooks/

Copy all 9 updated scripts to the other two harness directories.

### T4: Verify @asibilia references (already done in Phase 71)

Confirm no remaining @asibilia in code (only in planning docs).

## Verification

- `bunx --bun tsc --noEmit` passes
- `bun test` passes
- All 27 scripts have PATH export
- Bridge-using scripts have cascading lookup
- `grep -r "@asibilia" packages/` returns zero results

## Requirements Addressed

R4.1, R4.2, R4.3
