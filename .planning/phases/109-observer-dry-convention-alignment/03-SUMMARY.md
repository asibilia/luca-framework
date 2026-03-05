# 109-03 Summary: Migrate File Readers from node:fs to Bun.file API

## Status: COMPLETE

## Changes Made

### Task 109-03-1: file-watcher.ts (luca-observer)

- **Removed** `import { readFile } from "node:fs/promises"`
- **Replaced** 6 `readFile(path, "utf-8")` calls with `Bun.file(path).text()`:
  - `readJsonSnapshot` (1 call)
  - `readWorkflowState` (1 call)
  - `readMemoryFiles` (3 calls)
  - `readMetrics` (1 call)
  - `readLedgerEntries` (1 call)
- **Replaced** `readIterationHistory`'s dynamic `readdir` import + `readFile` with `Bun.Glob("*.json").scan()` + `Bun.file().text()`
- **Result**: Zero `node:fs` imports remaining in this file

### Task 109-03-2: notes/route.ts (luca-observer)

- **Replaced** `readFile(path, "utf-8")` with `Bun.file(path).text()` in `readNotes` inner function
- **Replaced** `writeFile(path, content, "utf-8")` with `Bun.write(path, content)` in POST handler
- **Kept** `readdir` and `mkdir` from `node:fs/promises` as documented exceptions (Bun has no standalone mkdir equivalent; readdir is simpler than Bun.Glob for listing + slicing a bounded set)
- **Result**: Only `readdir` and `mkdir` remain from node:fs/promises

### Task 109-03-3: ledger.ts (luca-framework)

- **Removed** `import { mkdirSync, existsSync } from "node:fs"` (sync APIs eliminated)
- **Replaced** `existsSync(dir)` + `mkdirSync(dir, { recursive: true })` with `await mkdir(dir, { recursive: true })` (idempotent, no check needed)
- **Kept** `appendFile` from `node:fs/promises` as documented exception (Bun.write lacks native append mode; read-then-write is not atomic for a concurrent-append ledger)
- **Added** `mkdir` from `node:fs/promises` for async directory creation
- **Updated** JSDoc to document the appendFile exception
- **Result**: No sync `node:fs` imports remain; only `appendFile` and `mkdir` from `node:fs/promises`

## Documented Exceptions

| File           | API Kept     | Reason                                                            |
| -------------- | ------------ | ----------------------------------------------------------------- |
| notes/route.ts | `readdir`    | Simpler than Bun.Glob for listing + slicing bounded file sets     |
| notes/route.ts | `mkdir`      | No Bun equivalent for directory creation                          |
| ledger.ts      | `appendFile` | Bun.write lacks native append mode; read-then-write is not atomic |
| ledger.ts      | `mkdir`      | No Bun equivalent for directory creation                          |

## Verification

- TypeScript type check: PASS (0 errors)
- luca-observer tests: 20/20 PASS
- ledger tests: 38/38 PASS (100% line coverage on ledger.ts)

## Files Modified

- `packages/luca-observer/lib/file-watcher.ts`
- `packages/luca-observer/app/api/notes/route.ts`
- `packages/luca-framework/src/state/ledger.ts`
