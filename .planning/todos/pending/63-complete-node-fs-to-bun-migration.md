---
title: Complete node:fs to Bun API migration
area: dx
created: 2026-03-05
source: v2.8.0 done-todo audit (partial: migrate-node-fs-to-bun)
---

## Context

Todo `migrate-node-fs-to-bun` was marked done but 7 files in `packages/luca-framework/src` still import from `node:fs` or `node:fs/promises`. The migration was partial.

## Partial Completion

The following WAS migrated:

- Harness runner.ts uses `Bun.file` for reads
- Many source files converted to Bun APIs

## Gaps

The following still use node:fs:

- Files importing `node:fs/promises` (unlink, readFile, writeFile patterns)
- Approximately 7 files in `packages/luca-framework/src/` with remaining `node:fs` imports

## Task

1. Run `grep -r "from 'node:fs" packages/luca-framework/src/` to identify all remaining imports
2. For each file, replace with Bun equivalents:
   - `readFile` -> `Bun.file(path).text()`
   - `writeFile` -> `Bun.write(path, content)`
   - `unlink` -> keep using `node:fs/promises` unlink (no safe Bun equivalent)
   - `node:path` -> keep (Bun re-exports node:path, no migration needed)
3. Test affected files after migration

## Notes

`node:path` imports are fine — Bun re-exports them natively. Focus on `node:fs` and `node:fs/promises` imports only. Some uses like `unlink` have no Bun equivalent and may need to stay as `node:fs`.
