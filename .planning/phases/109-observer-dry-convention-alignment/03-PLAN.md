---
id: "109-03"
title: "Migrate file readers from node:fs/promises to Bun.file API"
phase: 109
wave: 2
complexity: SIMPLE
depends_on: ["109-02"]
tasks:
  - id: "109-03-1"
    title: "Migrate file-watcher.ts from node:fs/promises to Bun.file"
    goal: "Replace all readFile calls in file-watcher.ts with Bun.file().text() per project conventions"
    verify: "No 'node:fs/promises' import remains in file-watcher.ts; all reads use Bun.file; bunx --bun tsc --noEmit passes"
  - id: "109-03-2"
    title: "Migrate notes/route.ts from node:fs/promises to Bun.file"
    goal: "Replace readFile/writeFile/readdir/mkdir in notes/route.ts with Bun equivalents"
    verify: "No 'node:fs/promises' import remains in notes/route.ts; bunx --bun tsc --noEmit passes"
  - id: "109-03-3"
    title: "Migrate ledger.ts from mixed node:fs to consistent Bun.file"
    goal: "Replace appendFile and mkdirSync/existsSync in ledger.ts with Bun.write and Bun.file().exists()"
    verify: "No 'node:fs/promises' or 'node:fs' imports remain in ledger.ts; all I/O uses Bun APIs; bunx --bun tsc --noEmit passes"
---

# 109-03: Migrate File Readers from node:fs/promises to Bun.file API

## Goal

Migrate three files from `node:fs/promises` (and `node:fs`) to the Bun.file API per project conventions. The project rule `.claude/rules/bun-preference.md` mandates: "Prefer `Bun.file` over `node:fs`'s readFile/writeFile."

## Context

@packages/luca-observer/lib/file-watcher.ts -- Uses readFile from node:fs/promises for all file reads
@packages/luca-observer/app/api/notes/route.ts -- Uses readFile, writeFile, readdir, mkdir from node:fs/promises
@packages/luca-framework/src/state/ledger.ts -- Already partially uses Bun.file but mixes with node:fs appendFile, mkdirSync, existsSync

**Important note:** Item 3 from the audit (DRY resolveProjectDir) was ALREADY completed in Phase 108. The resolveProjectDir function is already in `packages/luca-observer/lib/resolve-project-dir.ts` and both file-watcher.ts and notes/route.ts already import from it. No work needed there.

**Migration rules:**

- `readFile(path, "utf-8")` -> `Bun.file(path).text()`
- `writeFile(path, content, "utf-8")` -> `Bun.write(path, content)`
- `appendFile(path, content, "utf-8")` -> `Bun.write(path, content)` with existing content prepended, OR `Bun.write(Bun.file(path), content)` for append mode
- `readdir(path)` -> This one has no direct Bun equivalent. Use `new Bun.Glob("*.json").scan({ cwd: path })` or keep readdir as an exception.
- `mkdir(path, { recursive: true })` -> `Bun.write` auto-creates parent dirs. But for standalone dir creation, `import { mkdir } from "node:fs/promises"` can remain as a documented exception, or use `Bun.$\`mkdir -p ${path}\``.
- `mkdirSync(path, { recursive: true })` -> Same as above.
- `existsSync(path)` -> `await Bun.file(path).exists()`

**Note on Next.js context:** The observer runs as a Next.js app using `bun run dev`, so Bun APIs are available in both API routes and server-side code.

## Tasks

### Task 109-03-1: Migrate file-watcher.ts from node:fs/promises to Bun.file

Replace all `readFile` calls in `packages/luca-observer/lib/file-watcher.ts` with `Bun.file().text()`.

**Current imports to replace:**

```typescript
import { readFile } from "node:fs/promises";
```

**Changes:**

1. Remove the `import { readFile } from "node:fs/promises"` line
2. Replace all `await readFile(path, "utf-8")` with `await Bun.file(path).text()`
3. The `readdir` import in `readIterationHistory` (dynamic import of `node:fs/promises`) should be replaced with `Bun.Glob` or kept as a documented exception

**Affected functions:**

- `readWorkflowState` -- `readFile(statePath, "utf-8")` -> `Bun.file(statePath).text()`
- `readMemoryFiles` -- Three `readFile` calls -> Three `Bun.file().text()` calls
- `readMetrics` -- `readFile(metricsPath, "utf-8")` -> `Bun.file(metricsPath).text()`
- `readLedgerEntries` -- `readFile(ledgerPath, "utf-8")` -> `Bun.file(ledgerPath).text()`
- `readJsonSnapshot` (from 109-02) -- `readFile(filePath, "utf-8")` -> `Bun.file(filePath).text()`
- `readIterationHistory` -- Multiple `readFile` calls + `readdir`

**For readIterationHistory's readdir:**

Option A (preferred): Use `Bun.Glob`:

```typescript
const glob = new Bun.Glob("*.json");
const jsonFiles: string[] = [];
for await (const file of glob.scan({ cwd: checkpointsDir })) {
  jsonFiles.push(file);
}
```

Option B: Keep readdir as documented exception (simpler, less risk).

Choose Option A if it works cleanly; fall back to Option B if issues arise.

**Verify:**

- [ ] No `readFile` from `node:fs/promises` in file-watcher.ts
- [ ] All file reads use `Bun.file().text()`
- [ ] readdir replaced with Bun.Glob or documented as exception
- [ ] All existing error handling preserved (try/catch still returns defaults)
- [ ] `bunx --bun tsc --noEmit` passes

### Task 109-03-2: Migrate notes/route.ts from node:fs/promises to Bun.file

Replace `node:fs/promises` APIs in `packages/luca-observer/app/api/notes/route.ts`.

**Current imports:**

```typescript
import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
```

**Changes:**

1. `readFile(path, "utf-8")` -> `Bun.file(path).text()`
2. `writeFile(path, content, "utf-8")` -> `Bun.write(path, content)`
3. `readdir(dirPath)` -> `Bun.Glob("*.md").scan({ cwd: dirPath })` or keep as exception
4. `mkdir(notesDir, { recursive: true })` -> `import { mkdir } from "node:fs/promises"` (keep as exception since Bun has no standalone mkdir equivalent, or use `Bun.$\`mkdir -p ${path}\``)

**Practical approach:** Replace readFile and writeFile with Bun equivalents. For readdir and mkdir, keep the `node:fs/promises` import but only for those two functions. Document in a comment that readdir and mkdir have no direct Bun.file equivalent.

**Verify:**

- [ ] `readFile` and `writeFile` replaced with Bun equivalents
- [ ] `readdir` and `mkdir` either replaced or documented as exceptions
- [ ] File reading and writing behavior unchanged
- [ ] `bunx --bun tsc --noEmit` passes

### Task 109-03-3: Migrate ledger.ts from mixed node:fs to consistent Bun.file

Migrate `packages/luca-framework/src/state/ledger.ts` to use Bun APIs consistently.

**Current state (mixed):**

- Uses `Bun.file()` in `getNextSequenceNumber` and `readLedger` (good)
- Uses `appendFile` from `node:fs/promises` in `appendLedgerEntry` (should migrate)
- Uses `mkdirSync` and `existsSync` from `node:fs` in `appendLedgerEntry` (should migrate)

**Changes:**

1. Remove `import { appendFile } from "node:fs/promises"`
2. Remove `import { mkdirSync, existsSync } from "node:fs"`
3. Keep `import { dirname } from "node:path"` (no Bun equivalent needed)

**Replace appendFile with Bun.write append pattern:**

The ledger requires atomic append-only writes. `Bun.write` overwrites by default. For append behavior:

Option A: Read existing + append:

```typescript
const file = Bun.file(ledgerPath);
const existing = (await file.exists()) ? await file.text() : "";
await Bun.write(ledgerPath, existing + line);
```

Option B: Use `Bun.$` shell:

```typescript
await Bun.$`echo ${line} >> ${ledgerPath}`;
```

Option C: Keep `appendFile` from `node:fs/promises` as a documented exception because Bun.write does not support native append mode, and reading-then-writing is not atomic.

**Recommended:** Option C. The `appendFile` from node:fs provides atomic append semantics (O_APPEND flag) that cannot be replicated with Bun.write without race conditions. Document this as a known exception.

**Replace existsSync/mkdirSync:**

```typescript
// Before:
if (!existsSync(dir)) {
  mkdirSync(dir, { recursive: true });
}

// After:
const dirFile = Bun.file(join(dir, ".keep"));
if (!(await Bun.file(dir).exists())) {
  await Bun.$`mkdir -p ${dir}`;
}
```

Or simpler: use `import { mkdirSync, existsSync } from "node:fs"` as documented exceptions for directory operations.

**Practical approach:** Replace `existsSync` with `Bun.file().exists()`, make the function async-compatible. For `mkdirSync`, use `Bun.$` or keep as exception. For `appendFile`, keep as documented exception with a comment explaining why.

**Verify:**

- [ ] `readLedger` and `getNextSequenceNumber` already use Bun.file (no change needed)
- [ ] `existsSync` replaced with async Bun equivalent or documented exception
- [ ] `mkdirSync` replaced with async Bun equivalent or documented exception
- [ ] `appendFile` kept with documented exception explaining atomic append requirement
- [ ] No behavioral changes to append or read operations
- [ ] `bunx --bun tsc --noEmit` passes

## Success Criteria

- [ ] file-watcher.ts uses Bun.file for all file reads
- [ ] notes/route.ts uses Bun.file for read/write operations
- [ ] ledger.ts uses Bun APIs where possible, with documented exceptions for atomic append and directory operations
- [ ] No regressions in file reading/writing behavior
- [ ] `bunx --bun tsc --noEmit` passes for both packages
