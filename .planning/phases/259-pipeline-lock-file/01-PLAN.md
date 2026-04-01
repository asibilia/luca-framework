---
phase: 259
plan: 1
type: feature
autonomous: true
wave: 1
depends_on: []
---

# Phase 259 Plan 1: Pipeline Lock File

## Objective

Introduce a `.planning/.pipeline-lock.json` file that prevents concurrent `/lu` sessions and provides deterministic crash-recovery state. Today, if a session crashes mid-pipeline, the only recovery signal is state.json plus LLM interpretation. This phase adds a lightweight, high-frequency lock file (separate from state.json) that is atomically written on every pipeline step transition so crash recovery always knows the exact resume point. It also detects stale locks (dead PID or 24-hour staleness) and blocks concurrent sessions (same live PID).

The lock file is intentionally separate from state.json: it is written ~20 times per phase (vs ~5 for state.json), it is deleted on clean exit, and it must survive a crash intact for recovery.

## Context

@packages/luca-framework/src/state/bridge.ts
@packages/luca-framework/src/state/types.ts
@packages/luca-framework/src/state/index.ts
@packages/luca-framework/src/state/\_\_helpers/pipeline-position.ts
@packages/luca-framework/src/state/persistence.ts
@src/skills/luca/lu.skill.ts

## Tasks

### 1. Lock File Schema and Manager

**Type:** auto
**TDD:** false
**Depends on:** none

Create the Zod schema and pure functional manager for the pipeline lock file. This is the infrastructure layer — no bridge integration yet.

**Files to create/edit:**

- `packages/luca-framework/src/state/__schemas/pipeline-lock.schemas.ts` — Zod schema for the lock file (PipelineLockSchema, PipelineLock type), and a const for the lock file path (`PIPELINE_LOCK_PATH = ".planning/.pipeline-lock.json"`)
- `packages/luca-framework/src/state/__helpers/pipeline-lock.ts` — functional manager with five exported functions:
  - `acquireLock(sessionId: string, pipelineStep: string, phaseStep: string, phaseId?: number): Promise<Result<PipelineLock>>` — writes lock atomically (tmp + rename via `node:fs/promises` `rename`), returns conflict result if a live lock exists
  - `updateLock(patch: Partial<Pick<PipelineLock, 'pipeline_step' | 'phase_step' | 'phase_id'>>): Promise<Result<PipelineLock>>` — reads existing lock, applies patch, writes atomically
  - `releaseLock(): Promise<Result<void>>` — deletes the lock file (clean exit)
  - `readLock(): Promise<PipelineLock | null>` — reads and parses the lock file, returns null if absent or unparseable
  - `checkLockStatus(): Promise<{ status: 'clear' | 'live' | 'stale'; lock: PipelineLock | null; reason?: string }>` — PID liveness check via `process.kill(pid, 0)` catching ESRCH; 24-hour staleness threshold

**Schema (snake_case per API conventions):**

```typescript
export const pipelineLockSchema = z.object({
  session_id: z.string(),
  pid: z.number().int().positive(),
  started_at: z.string(), // ISO 8601
  pipeline_step: z.string().default("init"),
  phase_step: z.string().default(""),
  phase_id: z.number().int().nonnegative().optional(),
  lock_acquired_at: z.string(), // ISO 8601
});
```

**Implementation notes:**

- Use `Bun.file` / `Bun.write` for reads; use `node:fs/promises` `writeFile` + `rename` for atomic writes (write to `.pipeline-lock.json.tmp`, rename to `.pipeline-lock.json`)
- PID liveness: `process.kill(pid, 0)` throws with `code === 'ESRCH'` when the process is dead; wraps in try/catch
- Staleness: `Date.now() - new Date(lock.lock_acquired_at).getTime() > 24 * 60 * 60 * 1000`
- All functions return `Result<T>` (the discriminated union already in `types.ts`)
- Use Bun APIs over Node equivalents where possible; `rename` for atomicity requires `node:fs/promises`
- JSDoc all exported functions with `@example` blocks

**Verification:**

- `bunx --bun tsc --noEmit` passes on both new files
- All five exported functions are type-correct (no `any` casts)
- Schema fields match the spec lock schema exactly
- `PIPELINE_LOCK_PATH` constant is exported from schema file

---

### 2. Bridge Subcommands: lock-acquire, lock-update, lock-release, lock-status

**Type:** auto
**TDD:** false
**Depends on:** 1

Extend `bridge.ts` with four new subcommands that expose the lock manager to the shell environment. Follow the existing pattern (`handleReadComplexity`, etc.) — each subcommand is a standalone async function, registered in `VALID_SUBCOMMANDS`, dispatched in the main `switch` block, and documented in `HELP_TEXT`.

**Files to edit:**

- `packages/luca-framework/src/state/bridge.ts` — add four handler functions + dispatch entries + help text
- `packages/luca-framework/src/state/index.ts` — re-export the four new handler functions and the schema/type from the new files

**New handler function signatures:**

- `handleLockAcquire(): Promise<void>` — reads `--session-id`, `--pipeline-step`, `--phase-step`, `--phase-id` args; calls `acquireLock()`; prints JSON result; exits code 2 on live conflict
- `handleLockUpdate(): Promise<void>` — reads `--pipeline-step`, `--phase-step`, `--phase-id` args; calls `updateLock()`; prints JSON result
- `handleLockRelease(): Promise<void>` — calls `releaseLock()`; prints `{"released":true}` or error
- `handleLockStatus(): Promise<void>` — calls `checkLockStatus()`; prints JSON with `status`, `lock`, and optional `reason`

**Exit code behavior:**

- `lock-acquire` exits with code 2 when a live lock exists (enables shell `if luca-bridge lock-acquire ...; then` pattern)
- All other subcommands exit 0 on success, 2 on error

**Help text additions (append to existing sections):**

```
Lock commands:
  lock-acquire           Acquire pipeline lock (--session-id=ID --pipeline-step=STEP --phase-step=STEP [--phase-id=N])
  lock-update            Update lock step fields (--pipeline-step=STEP [--phase-step=STEP] [--phase-id=N])
  lock-release           Release pipeline lock (clean exit)
  lock-status            Read lock status (clear | live | stale)
```

**Verification:**

- `bunx --bun tsc --noEmit` passes on modified bridge.ts and index.ts
- `VALID_SUBCOMMANDS` array includes all four new names
- Each handler function is exported from index.ts
- `pipelineLockSchema` and `PipelineLock` type are re-exported from index.ts

---

### 3. Orchestrator Integration in lu.skill.ts

**Type:** auto
**TDD:** false
**Depends on:** 2

Wire lock acquire, per-step updates, and release into `lu.skill.ts` (LOCK-01, LOCK-02, LOCK-03). All lock operations are inline bash — no Agent() calls.

**Files to edit:**

- `src/skills/luca/lu.skill.ts` — add lock lifecycle bash blocks at the three integration points below

**Integration point A — Step 1 (Parse Args, Crash Recovery, Initialize):**

After `luca-bridge ensure-init`, add lock check and acquire:

```bash
# Step 0c: Pipeline lock — prevent concurrent sessions and enable crash recovery
LOCK_STATUS=$(luca-bridge lock-status 2>/dev/null | bun -e "const r=JSON.parse(await Bun.stdin.text()); console.log(r.status)" 2>/dev/null || echo "clear")
if [ "$LOCK_STATUS" = "live" ]; then
  LOCK_PID=$(luca-bridge lock-status 2>/dev/null | bun -e "const r=JSON.parse(await Bun.stdin.text()); console.log(r.lock?.pid || 'unknown')" 2>/dev/null || echo "unknown")
  if echo "$ARGS" | grep -q -- "--force"; then
    echo "WARNING: Overriding live lock (PID $LOCK_PID) due to --force flag"
    luca-bridge lock-release 2>/dev/null || true
  else
    echo "ERROR: Another /lu session is already running (PID $LOCK_PID). Use --force to override."
    exit 1
  fi
elif [ "$LOCK_STATUS" = "stale" ]; then
  echo "INFO: Stale pipeline lock detected. Clearing for recovery."
  luca-bridge lock-release 2>/dev/null || true
fi
SESSION_ID=$(luca-bridge read-field --field=session_id 2>/dev/null | bun -e "const r=JSON.parse(await Bun.stdin.text()); console.log(r.value || '')" 2>/dev/null || echo "")
if [ -z "$SESSION_ID" ]; then SESSION_ID=$(cat /dev/urandom | base64 | tr -dc 'a-z0-9' | head -c 12 2>/dev/null || echo "unknown"); fi
luca-bridge lock-acquire --session-id="$SESSION_ID" --pipeline-step="init" --phase-step="" 2>/dev/null || true
```

**Integration point B — Step transitions (per-step lock updates):**

Add `luca-bridge lock-update` calls after each major step transition. These are inline bash one-liners placed after existing `luca-bridge transition` or `luca-bridge write-status` calls. Add at minimum:

- After Step 2 (cognitive pre-flight + classify): `luca-bridge lock-update --pipeline-step="routed" --phase-step="" 2>/dev/null || true`
- After Step 4 (configure session): `luca-bridge lock-update --pipeline-step="configured" --phase-step="" 2>/dev/null || true`
- After Step 5 (backlog scan): `luca-bridge lock-update --pipeline-step="scanned" --phase-step="" 2>/dev/null || true`
- At Phase Loop start (Step 7, PHASE_START): `luca-bridge lock-update --pipeline-step="phase-loop" --phase-step="start" --phase-id=PHASE_NUMBER 2>/dev/null || true`
- At 7e (discussion): `luca-bridge lock-update --pipeline-step="phase-loop" --phase-step="discuss" --phase-id=PHASE_NUMBER 2>/dev/null || true`
- At 7g (planning): `luca-bridge lock-update --pipeline-step="phase-loop" --phase-step="plan" --phase-id=PHASE_NUMBER 2>/dev/null || true`
- At 7h (execution): `luca-bridge lock-update --pipeline-step="phase-loop" --phase-step="execute" --phase-id=PHASE_NUMBER 2>/dev/null || true`
- At 7i (harness): `luca-bridge lock-update --pipeline-step="phase-loop" --phase-step="harness" --phase-id=PHASE_NUMBER 2>/dev/null || true`
- After verify + learn: `luca-bridge lock-update --pipeline-step="phase-loop" --phase-step="verify" ...` and `"learn"` respectively

**Integration point C — Clean exit:**

At every exit path (after Step 8 milestone boundary, after non-phase-execute route handler, after any early exit on success), add:

```bash
luca-bridge lock-release 2>/dev/null || true
```

Note: all lock operations use `|| true` so a bridge failure never blocks the pipeline.

**Verification:**

- `bunx --bun tsc --noEmit` passes on modified lu.skill.ts
- `lock-acquire` call is present in Step 1 section
- At least 8 `lock-update` calls are present across the pipeline steps
- `lock-release` call is present at the clean exit path

## Verification

1. Run `bunx --bun tsc --noEmit` from the repo root — zero new errors
2. Manual smoke test:
   - Start `/lu` → `.planning/.pipeline-lock.json` created with correct fields
   - Inspect lock file: `cat .planning/.pipeline-lock.json` — contains `session_id`, `pid`, `pipeline_step`, `lock_acquired_at`
   - Kill session mid-run → lock file persists
   - Start `/lu` again with no `--force` → exits with "another session running" message
   - Start `/lu` with `--force` → proceeds after clearing stale lock
   - Complete `/lu` normally → `.planning/.pipeline-lock.json` is deleted

## Success Criteria

- SC-1: Starting `/lu` creates `.planning/.pipeline-lock.json` with PID, session ID, and current step; file updates on every step transition
- SC-2: Starting a second `/lu` while one is running prints a warning with PID and exits (unless `--force`)
- SC-3: Starting `/lu` after a crash detects the stale lock (dead PID or 24-hour threshold), reports it, and allows recovery

## Output Specification

**Files created:**

- `packages/luca-framework/src/state/__schemas/pipeline-lock.schemas.ts`
- `packages/luca-framework/src/state/__helpers/pipeline-lock.ts`

**Files modified:**

- `packages/luca-framework/src/state/bridge.ts` (four new subcommands)
- `packages/luca-framework/src/state/index.ts` (re-exports for new types and handlers)
- `src/skills/luca/lu.skill.ts` (lock lifecycle bash blocks)
