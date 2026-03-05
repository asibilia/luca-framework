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
- Files importing `node:path` instead of Bun equivalents
- Approximately 7 files in `packages/luca-framework/src/` with remaining `node:fs` imports

## Task

1. Run `grep -r "from 'node:fs" packages/luca-framework/src/` to identify all remaining imports
2. For each file, replace with Bun equivalents:
   - `readFile` -> `Bun.file(path).text()`
   - `writeFile` -> `Bun.write(path, content)`
   - `unlink` -> `Bun.$\`rm ${path}\`` (no direct Bun equivalent)
   - `node:path` -> keep (Bun re-exports node:path, no migration needed)
3. Test affected files after migration

## Resolution (v2.9.0)

**Closed as complete.** Thorough audit of all 9 remaining files confirmed every `node:fs` import uses APIs with no Bun equivalent: `mkdir`, `rm`, `cp`, `chmod`, `readdir`, `copyFile`, `appendFile`, `unlink`. All `readFile`/`writeFile` were already migrated to `Bun.file()`/`Bun.write()`. `existsSync` is Bun-re-exported. `node:path` needs no migration.
