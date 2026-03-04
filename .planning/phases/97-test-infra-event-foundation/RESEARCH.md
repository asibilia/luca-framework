# Phase 97 Research: Test Infrastructure & Event Foundation

## 1. Observer Test Infrastructure

### 1.1 Current Root Test Configuration

**File:** `/bunfig.toml`

```toml
[test]
root = "."
coverage = true
coverageDir = "coverage"
coverageReporter = ["text", "lcov"]
coverageThreshold = { line = 80 }
```

- Root `bun test` discovers tests from `.` (the repo root).
- 80% line coverage threshold enforced.
- No preload scripts configured at root level.
- No `happy-dom` or `jsdom` installed anywhere in the monorepo (confirmed: neither appears in any `package.json`).

### 1.2 Root tsconfig Excludes Observer

**File:** `/tsconfig.json`

```json
"exclude": [
  "packages/luca-framework/templates/harness",
  "packages/luca-observer"
]
```

The observer is fully excluded from root type-checking. It has its own standalone `tsconfig.json` with `DOM` lib and `~/` path alias pointing to `./src/*`.

### 1.3 Observer tsconfig

**File:** `/packages/luca-observer/tsconfig.json`

- Includes `"lib": ["DOM", "DOM.Iterable", "ESNext"]` -- needed for React/browser APIs.
- Has `"plugins": [{ "name": "next" }]` for Next.js type support.
- Uses `"jsx": "preserve"` (Next.js convention).
- Standalone: does NOT extend the root tsconfig.

### 1.4 Root package.json Build Filter

**File:** `/package.json`

```json
"build": "bun run --filter '!@alecsibilia/luca-observer' build"
```

The root `build` script already explicitly excludes the observer. The observer has its own `build` via `next build`.

### 1.5 Existing Test Patterns

Tests live at `__tests__/packages/luca-framework/` mirroring the source path structure. Key patterns observed:

- **Imports:** `import { describe, test, expect } from 'bun:test'` (no jest)
- **Import paths:** Relative paths from test file to source, e.g., `'../../../../../packages/luca-framework/src/utils/branding'`
- **Fixtures:** Shared fixtures in `__tests__/utils/fixtures.ts`
- **Structure:** `describe()` blocks with nested `describe()` for subsections, `test()` for individual cases
- **No mocking framework:** Tests are pure-logic oriented; no `jest.fn()`, `mock()`, or spying utilities used in the sample files
- **No DOM testing:** Zero React component tests exist anywhere in the monorepo

### 1.6 Bun DOM Testing Support

Bun supports DOM testing via `happy-dom` (recommended) or `@happy-dom/global-registrator`. Setup requires:

1. **Install:** `bun add -d @happy-dom/global-registrator`
2. **Preload script** (`happydom.ts`):
   ```typescript
   import { GlobalRegistrator } from "@happy-dom/global-registrator";
   GlobalRegistrator.register();
   ```
3. **Observer-local `bunfig.toml`:**
   ```toml
   [test]
   preload = ["./happydom.ts"]
   ```
4. **For React Testing Library:**
   ```bash
   bun add -d @testing-library/react @testing-library/jest-dom
   ```

### 1.7 Recommendation: Test Structure for Observer

**Recommended approach:** Package-local `__tests__/` directory inside `packages/luca-observer/`.

**Rationale:**

- Observer is excluded from root tsconfig and root build -- it is a standalone package.
- Observer tests need DOM globals (`document`, `window`) via happy-dom preload.
- Root tests do NOT need DOM globals -- mixing would break existing 3150+ tests.
- Observer uses `~/` path alias pointing to `./src/*` which differs from root `~/` -> `./src/*`.

**Proposed structure:**

```
packages/luca-observer/
  __tests__/
    lib/
      db.test.ts
      sse.test.ts
      file-watcher.test.ts
      types.test.ts
    hooks/
      use-event-stream.test.ts
      use-workflow-state.test.ts
      use-metrics.test.ts
    stores/
      sidebar.test.ts
      session.test.ts
      filters.test.ts
    components/
      shared/
        event-badge.test.tsx
        status-indicator.test.tsx
        json-viewer.test.tsx
    api/
      events.test.ts
      stream.test.ts
      state.test.ts
  bunfig.toml          # Observer-specific test config with happy-dom preload
  happydom.ts          # Preload script for DOM globals
```

**Run commands:**

- Observer tests only: `cd packages/luca-observer && bun test`
- All tests (root): `bun test` (will NOT pick up observer tests if observer has its own `bunfig.toml` with `root` set)

**Isolation strategy:**
The root `bunfig.toml` has `root = "."` which means it discovers tests everywhere. To exclude observer tests from root runs, two options:

1. **Option A (recommended):** Add observer to root test exclusion. Root `bunfig.toml` does not have an exclude pattern for test discovery. We would need to run observer tests separately: `bun test --filter '!observer'` or use the root `package.json` test script to exclude the observer directory.

2. **Option B:** Add a root-level test filter. Bun supports `testFilter` patterns but the configuration is limited. The simplest approach is to add `"test:observer": "cd packages/luca-observer && bun test"` to root `package.json`.

**Priority for Phase 97:** Start with non-DOM tests (lib/db.ts, lib/sse.ts, lib/types.ts, stores) that do NOT need happy-dom. These can use standard `bun:test` imports. DOM tests for React components can be added incrementally.

---

## 2. Observer Scaffolding Cleanup

### 2.1 Empty machines/ Directory

**Path:** `/packages/luca-observer/src/machines/`

**Status:** Empty directory (confirmed: only `.` and `..` entries). No XState machines have been created yet despite `xstate` being in `package.json` dependencies.

**Action:** Remove the empty `machines/` directory. If XState machines are needed later, recreate it.

### 2.2 .gitignore Coverage for .next/

**File:** `/.gitignore` (root)

```
# next.js
.next
```

The root `.gitignore` already covers `.next` at any depth. However, the observer's `.next/` directory currently exists on disk (confirmed: 13 entries inside). The `.gitignore` pattern `.next` should match `packages/luca-observer/.next/` correctly since `.next` without a leading slash matches anywhere in the tree.

**Action:** Verify that `packages/luca-observer/.next/` is properly gitignored (it should be). If any `.next/` files appear in `git status`, they were added before the gitignore rule and need `git rm --cached`.

### 2.3 Tailwind build:styles Script

**File:** `/packages/luca-observer/package.json`

```json
"build:styles": "bunx @tailwindcss/cli -i ./tailwind/base.css -o ./app/globals.css"
```

**Issues found:**

1. **Input path `./tailwind/base.css` does not exist.** The `tailwind/` directory does not exist in the observer package. This script will fail if run.
2. **Output path `./app/globals.css` is wrong.** The actual CSS file is at `./src/app/globals.css` (the `app/` dir is inside `src/`).
3. **The script is unnecessary.** The observer uses Tailwind CSS v4 with PostCSS integration (`@tailwindcss/postcss` in `postcss.config.ts`). With this setup, Tailwind is processed automatically by Next.js during build/dev -- no separate CLI build step is needed.
4. **The `globals.css` already uses Tailwind v4 `@import "tailwindcss"` syntax**, which is the correct v4 approach (processed by the PostCSS plugin during Next.js compilation).

**Action:** Remove the `build:styles` script from `package.json`. The PostCSS plugin handles Tailwind compilation automatically.

### 2.4 Unused Dependencies Assessment

**File:** `/packages/luca-observer/package.json`

| Dependency                  | Status     | Notes                                       |
| --------------------------- | ---------- | ------------------------------------------- |
| `next` (^15)                | Used       | Core framework                              |
| `react` (^19)               | Used       | Core                                        |
| `react-dom` (^19)           | Used       | Core                                        |
| `tailwindcss` (^4)          | Used       | Via PostCSS                                 |
| `@tailwindcss/postcss` (^4) | Used       | In postcss.config.ts                        |
| `zod` (^3.23.8)             | Used       | Schema validation in types.ts               |
| `lodash` (^4.17.23)         | **Unused** | No imports found in observer source files   |
| `jotai` (^2)                | Used       | Stores (sidebar.ts, session.ts, filters.ts) |
| `xstate` (^5)               | **Unused** | machines/ dir is empty, no XState imports   |

**Dev deps:**
| Dependency | Status |
|---|---|
| `@types/react` (^19) | Used |
| `@types/react-dom` (^19) | Used |
| `@types/lodash` (^4.17.23) | **Unused** (matches lodash being unused) |
| `typescript` (^5) | Used |

**Action:** Remove `xstate`, `lodash`, and `@types/lodash` from observer package.json. They can be re-added when actually needed. Keep `tailwindcss` even though it is consumed via PostCSS -- it may be needed for the `@import "tailwindcss"` directive resolution.

### 2.5 globals.css Assessment

**File:** `/packages/luca-observer/src/app/globals.css`

The CSS file is well-structured with Tailwind v4:

- Uses `@import "tailwindcss"` (correct v4 syntax)
- Defines theme tokens via `@theme { ... }` (correct v4 approach)
- Has custom color variables for event types, status colors, etc.
- Clean and minimal -- no issues found

**No changes needed** to globals.css itself.

### 2.6 PostCSS Configuration

**File:** `/packages/luca-observer/postcss.config.ts`

```typescript
const config = {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};
export default config;
```

Correctly configured for Tailwind v4 PostCSS integration. No changes needed.

---

## 3. Observer-Emitter Tests

### 3.1 observer-emitter.ts API Surface

**File:** `/packages/luca-framework/src/state/observer-emitter.ts`

Single exported function:

```typescript
export function emitObserverEvent(
  eventType: string,
  data: Record<string, unknown> = {},
): void;
```

**Behavior:**

1. Reads `process.env.LUCA_OBSERVER_URL` -- returns immediately if not set.
2. Constructs a payload: `{ event_type, timestamp, ...data }`.
3. Fires `fetch()` POST to `${url}/api/events` with 2-second abort timeout.
4. `.catch(() => {})` -- silently swallows all errors (fire-and-forget).

**Key characteristics:**

- No return value (void)
- Fire-and-forget (no await)
- Silently fails
- Environment-gated (LUCA_OBSERVER_URL)
- Uses global `fetch()` and `process.env`

### 3.2 Existing State Domain Tests

**No tests exist** for the state domain. The `__tests__/packages/luca-framework/state/` directory does not exist (confirmed by glob search returning no results). All existing luca-framework tests are under `src/adapters/`, `src/commands/`, and `src/utils/`.

### 3.3 Test Strategy for observer-emitter.ts

**Test file location:** `__tests__/packages/luca-framework/src/state/observer-emitter.test.ts`

**Test cases:**

1. **No-op when LUCA_OBSERVER_URL is unset:**
   - Set `process.env.LUCA_OBSERVER_URL = undefined`
   - Call `emitObserverEvent("test.event")`
   - Verify fetch was NOT called (mock fetch)

2. **Sends correct payload when URL is set:**
   - Set `process.env.LUCA_OBSERVER_URL = "http://localhost:3456"`
   - Mock global `fetch`
   - Call `emitObserverEvent("state.transition", { session_id: "abc" })`
   - Verify fetch was called with correct URL, method, headers, and body

3. **Silently handles fetch failure:**
   - Set URL, mock fetch to reject
   - Call `emitObserverEvent(...)` -- should not throw

4. **Includes timestamp in payload:**
   - Verify the payload contains a valid ISO timestamp

5. **Respects 2-second timeout (AbortSignal):**
   - Verify `AbortSignal.timeout(2000)` is passed in the fetch options

**Mocking approach:** Since Bun does not have built-in mocking, use manual mock patterns:

```typescript
import { describe, test, expect, beforeEach, afterEach } from "bun:test";

let fetchCalls: { url: string; init: RequestInit }[] = [];
const originalFetch = globalThis.fetch;

beforeEach(() => {
  fetchCalls = [];
  globalThis.fetch = (url: any, init?: any) => {
    fetchCalls.push({ url: String(url), init });
    return Promise.resolve(new Response("ok"));
  };
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  delete process.env.LUCA_OBSERVER_URL;
});
```

Note: Bun 1.0+ supports `mock()` from `bun:test`:

```typescript
import { mock } from "bun:test";
const mockFetch = mock(() => Promise.resolve(new Response("ok")));
```

However, since `emitObserverEvent` uses the global `fetch`, overriding `globalThis.fetch` is the cleanest approach.

---

## 4. Append-Only Session Ledger

### 4.1 Specification from Todo #6

**File:** `/.planning/todos/pending/06-append-only-session-ledger.md`

Key requirements from the spec:

- Every state transition appended as JSONL with `id` and `parent_id` to `.planning/session-ledger.jsonl`
- Extend `TransitionRecord` schema with `sequence_number` and `parent_id`
- After `persistActor()` in bridge.ts, append to ledger
- New bridge subcommands: `read-ledger` (tail, filter-by-event-type, time-range)
- New file: `packages/luca-framework/src/state/ledger.ts`
- lu-learner consumes ledger for richer pattern extraction

### 4.2 Existing TransitionRecord Schema

**File:** `/packages/luca-framework/src/state/types.ts` (lines 428-438)

```typescript
export const transitionRecordSchema = z.object({
  previous_state: z.string(),
  current_state: z.string(),
  event_type: z.string(),
  event_data: z.record(z.string(), z.unknown()).default({}),
  actions_executed: z.array(z.string()).default([]),
  context: z.record(z.string(), z.unknown()).default({}),
  timestamp: z.string().default(""),
  session_id: z.string().default(""),
});
```

### 4.3 Existing buildTransitionRecord Function

**File:** `/packages/luca-framework/src/state/events.ts` (lines 103-123)

The function already creates a `TransitionRecord` from transition data. The ledger needs to:

1. Extend this with `sequence_number` and `parent_id`
2. Append the extended record to the JSONL file
3. Track sequence numbers per session

### 4.4 Bridge Integration Points

**File:** `/packages/luca-framework/src/state/bridge.ts`

The `handleTransition()` function (lines 461-524) is the primary integration point. After line 523 (`console.log(JSON.stringify(record, null, 2))`), the ledger append should happen.

The `handleSetField()` function (lines 362-448) also modifies state and should optionally write to the ledger (as a "field_set" event type).

### 4.5 Ledger Schema Design

**Extended schema (proposed):**

```typescript
export const ledgerEntrySchema = transitionRecordSchema.extend({
  sequence_number: z.number().int().nonnegative(),
  parent_id: z.number().int().nonnegative().nullable().default(null),
});
export type LedgerEntry = z.infer<typeof ledgerEntrySchema>;
```

**JSONL format:**

```
{"sequence_number":0,"parent_id":null,"previous_state":"idle","current_state":"preflight","event_type":"START",...}
{"sequence_number":1,"parent_id":0,"previous_state":"preflight","current_state":"routing","event_type":"PREFLIGHT_COMPLETE",...}
```

### 4.6 Ledger File Design (`ledger.ts`)

**Proposed API:**

```typescript
/** Append a transition record to the session ledger. */
export async function appendLedgerEntry(
  record: TransitionRecord,
): Promise<LedgerEntry>;

/** Read ledger entries with optional filters. */
export async function readLedger(filters?: {
  session_id?: string;
  event_type?: string;
  since?: string; // ISO timestamp
  limit?: number;
  tail?: number; // Read last N entries
}): Promise<LedgerEntry[]>;

/** Get the current sequence number (for parent_id tracking). */
export function getNextSequenceNumber(): number;
```

**Implementation patterns from the codebase:**

1. **File I/O pattern** (from `persistence.ts` and `suspend-checkpoint.ts`):
   - Use `Bun.file()` for reading
   - Use `Bun.write()` for writing
   - Use `Bun.file().exists()` for existence checks

2. **JSONL append pattern:**

   ```typescript
   const file = Bun.file(LEDGER_PATH);
   const existing = (await file.exists()) ? await file.text() : "";
   const line = JSON.stringify(entry) + "\n";
   await Bun.write(LEDGER_PATH, existing + line);
   ```

   Note: Bun does not have a native append mode for `Bun.write()`. Two approaches:
   - **Option A:** Read + append + write (simple, OK for reasonable file sizes)
   - **Option B:** Use `node:fs` appendFile:
     ```typescript
     import { appendFile } from "node:fs/promises";
     await appendFile(LEDGER_PATH, line);
     ```
     Option B is preferred for append-only semantics (atomic, no read needed, handles concurrent writes better).

3. **JSONL read pattern:**

   ```typescript
   const text = await Bun.file(LEDGER_PATH).text();
   const lines = text.trim().split("\n").filter(Boolean);
   return lines.map((line) => ledgerEntrySchema.parse(JSON.parse(line)));
   ```

4. **Schema validation** (from `sanitize.ts` pattern): Use `safeParse()` for reading external data, `.parse()` for internal construction.

### 4.7 Bridge CLI Commands Design

New subcommands for `bridge.ts`:

| Command        | Description                            | Options                                                                |
| -------------- | -------------------------------------- | ---------------------------------------------------------------------- |
| `read-ledger`  | Read ledger entries (default: last 20) | `--session=id`, `--event=type`, `--since=iso`, `--limit=N`, `--tail=N` |
| `ledger-stats` | Get ledger statistics                  | `--session=id`                                                         |

**Integration with bridge.ts dispatcher:**
Add cases to the main `switch` in `runBridgeCli()` (line 892):

```typescript
case "read-ledger":
  await handleReadLedger(args);
  break;
```

### 4.8 Ledger Path Convention

Following the `.planning/` directory convention:

- **Ledger file:** `.planning/session-ledger.jsonl`
- Consistent with `state.json` at `.planning/state.json`
- Consistent with checkpoints at `.planning/checkpoints/`

### 4.9 Sequence Number Tracking

Two approaches for sequence numbers:

1. **File-based:** Read the ledger on startup, find max sequence_number, increment from there. Simple but requires reading the full file on first write.

2. **In-memory counter with file seed:** On first append, read the last line of the ledger to get the latest sequence_number. Cache in a module-level variable. Reset on process restart (re-seeded from file).

Approach 2 is preferred for performance. The counter can be initialized lazily:

```typescript
let _nextSeq: number | null = null;

async function getNextSequenceNumber(): Promise<number> {
  if (_nextSeq !== null) return _nextSeq++;

  const file = Bun.file(LEDGER_PATH);
  if (!(await file.exists())) {
    _nextSeq = 1;
    return 0;
  }

  const text = await file.text();
  const lines = text.trim().split("\n").filter(Boolean);
  if (lines.length === 0) {
    _nextSeq = 1;
    return 0;
  }

  const lastLine = lines[lines.length - 1]!;
  const lastEntry = JSON.parse(lastLine);
  _nextSeq = (lastEntry.sequence_number ?? 0) + 2;
  return _nextSeq - 1;
}
```

### 4.10 Domain Architecture Classification

The ledger belongs to the **state domain** (`packages/luca-framework/src/state/`), which is Archetype B (Core Domain) at T1 in the dependency tier system. The ledger file (`ledger.ts`) should:

- Live at `packages/luca-framework/src/state/ledger.ts`
- Be re-exported from `packages/luca-framework/src/state/index.ts`
- Import only from within the state domain (`./types`, `./events`, `./sanitize`) and T0 (`zod`)
- Follow snake_case for all schema properties

### 4.11 Barrel Export

Add to `/packages/luca-framework/src/state/index.ts`:

```typescript
// ─── Ledger ─────────────────────────────────────────────────────────────────
export {
  appendLedgerEntry,
  readLedger,
  ledgerEntrySchema,
  LEDGER_PATH,
} from "./ledger";
export type { LedgerEntry } from "./ledger";
```

---

## 5. Cross-Cutting Concerns

### 5.1 Observer Package Isolation

The observer is intentionally isolated from the root:

- Excluded from root `tsconfig.json`
- Excluded from root `build` script
- Has its own `node_modules/` (workspace package)
- Has its own `tsconfig.json` (standalone, not extending root)
- Uses `~/` path alias to its own `./src/*`

This means observer tests should also be isolated with their own `bunfig.toml`.

### 5.2 No Shared Test Utilities Needed

The observer tests (Phase 97 scope) will test:

- Pure TypeScript utility functions (`db.ts`, `sse.ts`, `file-watcher.ts`, `types.ts`)
- Jotai stores (atom definitions)
- API route handlers (Next.js route handlers)

None of these require shared fixtures from the root `__tests__/utils/` directory.

### 5.3 Test Isolation for Root `bun test`

**Critical concern:** The root `bun test` with `root = "."` will discover tests in `packages/luca-observer/__tests__/` too. This could cause failures because:

1. Observer tests may need happy-dom preload (root doesn't have it)
2. Observer `~/` imports resolve differently than root `~/` imports

**Solution options (in order of preference):**

1. **Create observer-local `bunfig.toml` and run observer tests separately:**
   - Add `"test:observer": "cd packages/luca-observer && bun test"` to root `package.json`
   - Add `"test:all": "bun test && bun run test:observer"` to root `package.json`
   - Root `bun test` still picks up observer tests but they should work for non-DOM tests since they use relative imports

2. **Name observer test files with a distinguishing pattern** and filter at root:
   - Not feasible with current Bun test configuration options

3. **Move observer tests to a path that root test ignores:**
   - Use `packages/luca-observer/tests/` (no double underscore) and configure observer's `bunfig.toml` to use that as root

**Recommended:** Option 1 combined with ensuring non-DOM observer tests use relative imports (not `~/` aliases) so they work under both root and observer-local test runners. For Phase 97, focus on non-DOM tests first.

### 5.4 Connection Between Ledger and Observer

The ledger (`.planning/session-ledger.jsonl`) serves as the persistent event store that feeds the observer dashboard. The data flow:

```
State Machine Transition
  -> bridge.ts handleTransition()
    -> persistActor() (state.json)
    -> appendLedgerEntry() (session-ledger.jsonl)  [NEW]
    -> emitObserverEvent() (HTTP POST to observer)  [EXISTING]
    -> updateStateMd() (STATE.md)
```

The observer currently uses an in-memory event store (`db.ts`). In future phases, the observer can read the ledger file for historical data on startup, providing persistence that the in-memory store lacks.

### 5.5 File Naming Conventions

All new files follow kebab-case:

- `ledger.ts` (single word, no kebab needed)
- `observer-emitter.test.ts`
- `happydom.ts` (or `happy-dom.ts` if we want strict kebab-case for the preload)
- `bunfig.toml` (tool convention)

---

## 6. Implementation Priority Order

Based on dependencies and complexity:

| Order | Item                                             | Depends On                    | Complexity |
| ----- | ------------------------------------------------ | ----------------------------- | ---------- |
| 1     | Observer scaffolding cleanup                     | Nothing                       | TRIVIAL    |
| 2     | Observer test infrastructure setup               | Cleanup done                  | SIMPLE     |
| 3     | observer-emitter.ts tests                        | Test infra exists             | SIMPLE     |
| 4     | Ledger schema + ledger.ts                        | Understanding of state domain | MODERATE   |
| 5     | Ledger bridge CLI commands                       | ledger.ts done                | MODERATE   |
| 6     | Ledger integration in bridge.ts handleTransition | ledger.ts done                | SIMPLE     |

---

## 7. Key File References

| File                                                        | Purpose                    | Relevance                             |
| ----------------------------------------------------------- | -------------------------- | ------------------------------------- |
| `/bunfig.toml`                                              | Root test configuration    | Understand root test setup            |
| `/tsconfig.json`                                            | Root TypeScript config     | Observer exclusion                    |
| `/package.json`                                             | Root monorepo config       | Build scripts, workspace config       |
| `/.gitignore`                                               | Root gitignore             | .next coverage                        |
| `/packages/luca-observer/package.json`                      | Observer deps/scripts      | Cleanup targets                       |
| `/packages/luca-observer/tsconfig.json`                     | Observer TypeScript config | Standalone, DOM lib                   |
| `/packages/luca-observer/postcss.config.ts`                 | Tailwind v4 PostCSS        | Replaces build:styles                 |
| `/packages/luca-observer/src/app/globals.css`               | Tailwind theme             | No changes needed                     |
| `/packages/luca-observer/src/lib/types.ts`                  | Observer event schemas     | Test targets                          |
| `/packages/luca-observer/src/lib/db.ts`                     | In-memory event store      | Test target, ledger integration point |
| `/packages/luca-observer/src/lib/sse.ts`                    | SSE broadcaster            | Test target                           |
| `/packages/luca-observer/src/lib/file-watcher.ts`           | State file reader          | Test target                           |
| `/packages/luca-observer/src/machines/`                     | Empty directory            | Remove                                |
| `/packages/luca-framework/src/state/observer-emitter.ts`    | Fire-and-forget emitter    | Test target                           |
| `/packages/luca-framework/src/state/bridge.ts`              | State bridge CLI           | Ledger integration point              |
| `/packages/luca-framework/src/state/types.ts`               | TransitionRecord schema    | Ledger extends this                   |
| `/packages/luca-framework/src/state/events.ts`              | buildTransitionRecord      | Ledger uses this                      |
| `/packages/luca-framework/src/state/index.ts`               | State barrel exports       | Add ledger exports                    |
| `/packages/luca-framework/src/state/persistence.ts`         | File I/O patterns          | Reference for ledger I/O              |
| `/packages/luca-framework/src/state/suspend-checkpoint.ts`  | Checkpoint patterns        | Reference for ledger patterns         |
| `/.planning/todos/pending/06-append-only-session-ledger.md` | Ledger specification       | Requirements source                   |
