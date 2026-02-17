---
title: "Replace Node.js fs APIs with Bun equivalents in luca-framework package"
area: dependencies
priority: medium
created: 2026-02-16
source: repo-audit
---

## Context

The project convention is Bun-first, but 9 files in `packages/luca-framework/src/` use Node.js `fs` and `fs/promises` APIs. Additionally, `src/harness/runner.ts` imports `'path'` instead of `'pathe'`.

## Task

1. **Fix `src/harness/runner.ts` line 12**: Change `import { join } from 'path'` to `import { join } from 'pathe'`

2. **Migrate 9 files in `packages/luca-framework/src/`** from `fs`/`fs/promises` to Bun.file() equivalents:
   - `utils/detect.ts` — existsSync
   - `utils/template.ts` — readFile, writeFile, readdir, copyFile, mkdir
   - `utils/doctor/checks/config-validation.ts` — existsSync, readFile
   - `utils/doctor/checks/cursor-ide.ts` — existsSync
   - `utils/wizard.ts` — readFile
   - `utils/manifest.ts` — readFile, writeFile, existsSync
   - `utils/version-check.ts` — readFile
   - `utils/files.ts` — rm, mkdir, readdir, copyFile, readFile, writeFile, chmod, existsSync
   - `commands/update.ts` — readFile, writeFile, cp, rm, mkdir, existsSync

## Notes

- The luca-framework package is the CLI distribution — may need Node.js fs for portability on systems without Bun. Evaluate whether Bun-only is acceptable for the CLI.
- `src/` (core framework) already uses Bun ~75% of the time
