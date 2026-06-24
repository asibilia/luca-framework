# State Management API Reference

Technical reference for the state management stack used in Luca's workflow redesign.
Gathered 2026-03-31.

---

## XState v5

**Installed:** 5.28.0 | **Latest (npm):** 5.30.0
**Docs:** https://stately.ai/docs/xstate
**Releases:** https://github.com/statelyai/xstate/releases
**Requires:** TypeScript >= 5.0

### Machine Creation with `setup()` + `createMachine()`

The v5 pattern replaces bare `createMachine()` with a chained `setup().createMachine()` call.
`setup()` declares types, actions, guards, actors, and delays upfront for full type inference.

```ts
import { setup, createActor, assign } from "xstate";

const machine = setup({
  types: {
    context: {} as { count: number },
    events: {} as { type: "INCREMENT"; value: number },
  },
  actions: {
    increment: assign({
      count: ({ context, event }) => context.count + event.value,
    }),
  },
  guards: {
    isPositive: ({ event }) => event.value > 0,
  },
}).createMachine({
  id: "counter",
  context: { count: 0 },
  initial: "idle",
  states: {
    idle: {
      on: {
        INCREMENT: {
          guard: "isPositive",
          actions: "increment",
        },
      },
    },
  },
});
```

**`setup.extend()`** (recent addition): Incrementally extend a setup configuration with
additional actions, guards, and delays. Useful for composing machine configs from base + overlay.

Ref: https://stately.ai/docs/setup

### Context Updates (`assign`)

Context is immutable. Use `assign()` action to produce new context.
All implementation functions take a single unified argument: `{ context, event, ... }`.

```ts
// Static assignment
assign({ count: 0 });

// Dynamic assignment (function form)
assign({ count: ({ context, event }) => context.count + event.value });

// Full context replacement (function returning entire context)
assign(({ context }) => ({ ...context, count: 0 }));
```

Ref: https://stately.ai/docs/context

### Guards

Defined in `setup({ guards: { ... } })` and referenced by name in transitions.
Higher-order guards available: `and([...])`, `or([...])`, `not(...)`.

```ts
setup({
  guards: {
    isValid: ({ context }) => context.valid,
    isReady: ({ context }) => context.ready,
  },
}).createMachine({
  states: {
    checking: {
      on: {
        PROCEED: {
          // Higher-order guard composition
          guard: and(["isValid", "isReady"]),
          target: "running",
        },
      },
    },
  },
});
```

Ref: https://stately.ai/docs/guards

### Persistence / Snapshot API

This is the critical API for serializing state to `state.json`.

**Save:**

```ts
const actor = createActor(machine);
actor.start();

// Get serializable snapshot (plain JSON-safe object)
const persistedState = actor.getPersistedSnapshot();

// Write to disk
await Bun.write("state.json", JSON.stringify(persistedState, null, 2));
```

**Restore:**

```ts
const restoredState = await Bun.file("state.json").json();

const actor = createActor(machine, { snapshot: restoredState });
actor.start();
// Actions from restored state are NOT re-executed
// Invocations ARE restarted; spawned actors ARE restored recursively
```

**Key behaviors:**

- `getPersistedSnapshot()` returns a plain object safe for `JSON.stringify()`
- Actors are deeply/recursively persisted (invoked + spawned actors included)
- On restore, actions are assumed already executed; invocations restart
- `output` and `error` fields default to `undefined` -- strip before serializing if targeting strict JSON consumers
- The `snapshot` option on `createActor()` accepts the persisted state directly

Ref: https://stately.ai/docs/persistence

### Recent Additions (v5.28 - v5.30)

- **Routable states**: States with `route: {}` and explicit `id` can be navigated via `{ type: 'xstate.route', to: '#id' }`
- **`getInitialMicrosteps()` / `getMicrosteps()`**: Return `[snapshot, actions]` tuples per microstep
- **`getNextTransitions(state)`**: Get all available transitions from current state
- **`setup.extend()`**: Incremental setup extension (actions, guards, delays)

### Deprecations / Breaking Changes to Watch

- No breaking changes between 5.28 and 5.30 (patch/minor releases)
- `createMachine()` without `setup()` still works but loses type inference benefits
- v4 -> v5 migration: `Machine()` removed, `interpret()` replaced by `createActor()`

---

## Bun

**Installed:** 1.2.18 | **Latest (npm):** 1.3.11
**Docs:** https://bun.sh/docs
**Releases:** https://github.com/oven-sh/bun/releases

### `Bun.file()` -- Reading State Files

```ts
// Lazy file reference (does not read until method called)
const file = Bun.file("state.json");

// Read as JSON (UTF-8 decode + JSON.parse)
const state = await file.json();

// Read as text
const text = await file.text();

// Check existence
const exists = await file.exists();

// File metadata
file.size; // bytes
file.type; // MIME type
```

Ref: https://bun.sh/docs/runtime/file-io

### `Bun.write()` -- Writing State Files

```ts
// Write string/object to file
await Bun.write("state.json", JSON.stringify(state, null, 2));

// Write from BunFile to BunFile (zero-copy where possible)
await Bun.write(Bun.file("backup.json"), Bun.file("state.json"));

// Accepts: string path, BunFile, file:// URL, Response, Blob
```

**No built-in atomic write.** For safe state persistence, use the write-to-temp-then-rename pattern:

```ts
import { randomUUID } from "crypto";

async function writeAtomic(path: string, data: string): Promise<void> {
  const tmp = `${path}.${randomUUID()}.tmp`;
  await Bun.write(tmp, data);
  const fs = await import("node:fs/promises");
  await fs.rename(tmp, path); // atomic on same filesystem
}
```

Ref: https://bun.sh/reference/bun/write

### `Bun.spawn()` -- CLI Tool Invocation

```ts
// Basic spawn
const proc = Bun.spawn(["luca-bridge", "read-status"], {
  stdout: "pipe",
  stderr: "pipe",
});

const output = await new Response(proc.stdout).text();
const exitCode = await proc.exited; // Promise<number>

// Synchronous variant
const result = Bun.spawnSync(["tsc", "--noEmit"], {
  stdout: "pipe",
  stderr: "pipe",
});
result.exitCode; // number
result.stdout; // Buffer
result.stderr; // Buffer

// With IPC channel (JSON serialization)
const child = Bun.spawn(["bun", "worker.ts"], {
  ipc: (message) => {
    /* handle message from child */
  },
  serialization: "json",
});
```

Ref: https://bun.sh/docs/api/spawn.md

### File Locking

**Bun has no built-in file locking API** (no `flock()` equivalent).

For `.pipeline-lock.json`, use one of these patterns:

1. **Atomic rename (recommended for single-machine):**

   ```ts
   // Acquire: create lock file atomically
   // fs.writeFile with { flag: 'wx' } fails if file exists
   import { writeFile, unlink } from "node:fs/promises";
   await writeFile(
     ".pipeline-lock.json",
     JSON.stringify({ pid: process.pid, ts: Date.now() }),
     { flag: "wx" },
   );
   // Release:
   await unlink(".pipeline-lock.json");
   ```

2. **Advisory flock via node:fs (if needed):**

   ```ts
   import { openSync, flockSync, closeSync } from "node:fs";
   const fd = openSync(".pipeline-lock.json", "w");
   // Note: flockSync is not available in Bun as of 1.2.x
   // Use the wx flag pattern above instead
   ```

3. **External package:** `proper-lockfile` or `write-file-atomic` (npm packages)

### Recent Additions (v1.3.x)

- Native REPL
- `--compile --target=browser` for self-contained HTML
- TC39 standard ES decorators
- Windows ARM64 support
- Barrel import optimization
- Faster event loop
- Unified SQL API (`Bun.sql`)
- Built-in Redis client (`Bun.redis`)
- Async stack traces

### Deprecations / Breaking Changes to Watch

- No breaking changes between 1.2.18 and 1.3.11 for the APIs we use
- `Bun.file().json()` and `Bun.write()` are stable
- `Bun.spawn()` IPC serialization options expanded in 1.3.x

---

## Zod

**Installed:** 4.3.6 (latest) | **Also in repo:** 3.23.8 (via some dependencies)
**Docs:** https://zod.dev
**Releases:** https://github.com/colinhacks/zod/releases
**Migration guide (v3 -> v4):** https://zod.dev/v4/changelog

### `safeParse` Patterns

```ts
import { z } from "zod";

const ResultSchema = z.object({
  phase_id: z.number(),
  status: z.enum(["passed", "failed", "skipped"]),
  errors: z.array(z.string()).default([]),
});

// safeParse returns { success, data } | { success, error }
const result = ResultSchema.safeParse(rawData);

if (result.success) {
  const { phase_id, status, errors } = result.data;
} else {
  console.error("Validation failed:", result.error.issues);
}
```

**Zod 4 change:** `safeParse()` errors no longer extend `Error` (for performance --
avoids call stack snapshot). Use `.issues` to inspect errors.

**Zod 4 change:** Error property renamed from `.error.errors` to `.error.issues`.

### Schema Composition for Extended `state.json`

```ts
// Base schema
const BaseStateSchema = z.object({
  status: z.enum(["idle", "running", "complete"]),
  phase_id: z.number().optional(),
});

// Extend with .extend() (replaces deprecated .merge())
const ExtendedStateSchema = BaseStateSchema.extend({
  pipeline: z
    .object({
      classifier_result: z.string().optional(),
      convergence_score: z.number().optional(),
    })
    .optional(),
});

// Discriminated unions
const EventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("PHASE_START"), phase_id: z.number() }),
  z.object({ type: z.literal("PHASE_COMPLETE"), summary: z.string() }),
  z.object({ type: z.literal("ERROR"), message: z.string() }),
]);

// Type inference
type ExtendedState = z.infer<typeof ExtendedStateSchema>;
type WorkflowEvent = z.infer<typeof EventSchema>;
```

### Key v3 -> v4 Breaking Changes (We Are on v4)

| Change                  | v3                                                              | v4                                        |
| ----------------------- | --------------------------------------------------------------- | ----------------------------------------- |
| Import style            | `import z from 'zod'`                                           | `import { z } from 'zod'`                 |
| `.merge()`              | Available                                                       | **Deprecated** -- use `.extend()`         |
| `.strict()`             | Method on object                                                | Use `z.strictObject()`                    |
| `.passthrough()`        | Method on object                                                | Use `z.looseObject()`                     |
| `z.record()`            | 1 arg (value only)                                              | **2 args required** (key, value)          |
| String formats          | `z.string().email()`                                            | `z.email()` (top-level)                   |
| UUID validation         | Loose                                                           | **Strict RFC 4122**                       |
| `.format()` on ZodError | Available                                                       | **Deprecated** -- use `z.treeifyError()`  |
| Default in optional     | `{ a: z.string().default('x').optional() }` parses `{}` to `{}` | Parses to `{ a: 'x' }`                    |
| Error.errors            | `.error.errors`                                                 | `.error.issues`                           |
| safeParse error         | Extends `Error`                                                 | **Does not extend `Error`** (performance) |

### Coexistence Note

The repo has both Zod 3 (via transitive deps like `@mistralai/mistralai`, `shadcn`) and
Zod 4 (direct dep). They coexist via npm/bun resolution. Import from `zod` gets v4;
transitive deps resolve their own pinned v3. No action needed unless a dep upgrades.

### Incremental Migration Path

Zod 4 exports at subpath `zod/v4` alongside `zod/v3` for incremental migration.
Community codemod available: `zod-v3-to-v4`.

---

## Summary: Version Gap Assessment

| Library | Installed | Latest | Gap        | Action                                                                          |
| ------- | --------- | ------ | ---------- | ------------------------------------------------------------------------------- |
| XState  | 5.28.0    | 5.30.0 | 2 minor    | Consider upgrading -- `setup.extend()` and routable states may be useful        |
| Bun     | 1.2.18    | 1.3.11 | Major jump | Upgrade when ready -- no breaking changes for our APIs, gains perf improvements |
| Zod     | 4.3.6     | 4.3.6  | None       | Current                                                                         |

---

## Sources

- [XState npm](https://www.npmjs.com/package/xstate)
- [XState Releases](https://github.com/statelyai/xstate/releases)
- [XState Persistence Docs](https://stately.ai/docs/persistence)
- [XState Setup Docs](https://stately.ai/docs/setup)
- [XState Context Docs](https://stately.ai/docs/context)
- [XState Guards Docs](https://stately.ai/docs/guards)
- [XState Machines Docs](https://stately.ai/docs/machines)
- [XState Actors Docs](https://stately.ai/docs/actors)
- [Bun File I/O Docs](https://bun.sh/docs/runtime/file-io)
- [Bun.file Reference](https://bun.sh/reference/bun/file)
- [Bun.write Reference](https://bun.sh/reference/bun/write)
- [Bun.spawn Reference](https://bun.sh/reference/bun/spawn)
- [Bun Blog](https://bun.sh/blog)
- [Bun v1.3.11 Release](https://bun.sh/blog/bun-v1.3.11)
- [Zod npm](https://www.npmjs.com/package/zod)
- [Zod v4 Release Notes](https://zod.dev/v4)
- [Zod v4 Migration Guide](https://zod.dev/v4/changelog)
- [Zod API Reference](https://zod.dev/api)
