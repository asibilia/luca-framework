# Orchestrator Design — `/luca` Top-Level Driver

> **Status:** SECOND DESIGN PASS — 2026-05-22. Locks six decisions
> (D1–D6) from the user. The second pass (D5 + D6) targets
> **kill-anytime resilience** — every step in the orchestrator loop
> ends with a single durable bridge write, so a `/clear` at any
> moment leaves a well-defined resume point. Schemas, contracts,
> telemetry, and a migration path are sketched. No code lands with
> this doc.
>
> **Audience:** future implementers of `/luca`, and anyone evolving the
> existing `/restructure-driver` prototype.
>
> **Anchor commits:** prototype validated through D-1, D-2, D-3 on the
> `refactor/repo-restructure` branch (see `git log refactor/repo-restructure`
> for the canonical reference).

---

## 1. Vision

The orchestrator is Luca's **top-level driver**. It owns the outer loop that
steps through a roadmap milestone one increment at a time, spawns a worker
for each increment, gates the worker's output with structural halt-checks
and an LLM-judged inter-iteration verifier, advances a typed cursor, and
emits telemetry — both raw JSONL for per-run forensics and a per-iteration
summary engram for cross-run learning.

Today, three layers carry the workflow:

- **`/restructure-driver`** — a meta-skill that proves the iteration loop is
  a viable pattern. It is hard-wired to the luca-framework restructure
  effort (D-1 … G-1) and uses the handoff memory's `== DRIVER CURSOR ==`
  block as its source of truth.
- **`/lu`** — the existing single-task pipeline (triage → research →
  architect → execute → review → finalize). It is a worker, not a driver
  — it knows how to run **one** full pipeline cycle, given a task and a
  branch.
- **MuninnDB engrams + `.luca/telemetry/*.jsonl`** — the existing
  observability surfaces. The telemetry contract is locked (v:1); the
  memory layer is conventionally typed (`session:*`, `pattern:*`,
  `decision:*`, `metric:*`).

This design layers a fourth surface — `/luca` — above the existing three.
MuninnDB remains the **narrative / cross-run memory**; the typed state
machine becomes **the cursor**; per-iteration JSONL is the **raw
telemetry**; MuninnDB engrams summarize each iteration for **cross-run
learning**. The `/restructure-driver` retires post-merge into a thin preset
of `/luca`. The `/lu` skill is renamed to `/phase-run` to make room.

---

## 2. Naming map

### 2.1 The rename

| Today | After this design lands |
| --- | --- |
| `/lu` (full pipeline single-task driver) | `/phase-run` (unchanged behaviour; new name) |
| `/restructure-driver` (prototype meta-skill) | `/restructure-driver` retained as a thin preset of `/luca`; retires post-Phase H |
| *(does not exist)* | `/luca` — new top-level orchestrator (this doc) |
| *(does not exist)* | `orchestrator-verifier` — new inter-iteration verifier subagent |

### 2.2 What each layer does

- **`/luca`** — outer loop. Iterates the roadmap one increment at a time.
  For each increment: read cursor → pre-flight halt-checks → spawn worker →
  capture diff → verifier subagent judges the iteration → post-flight
  halt-checks → emit telemetry → advance cursor → schedule next.
  *Knows about*: roadmap, increment manifest, cursor, halt taxonomy,
  telemetry contract, verifier contract.
  *Does NOT do*: the actual implementation work, code review at line level
  (that's PR review), planning a phase from scratch (that's `/phase-plan`).
- **`/phase-run`** (formerly `/lu`) — single-iteration worker. Runs one
  full pipeline cycle (triage → research → architect → plan → execute →
  review → learn). Returns when the cycle is complete; commits along the
  way. `/luca` is one possible parent; users can still invoke `/phase-run`
  directly for ad-hoc work without orchestration.
- **`orchestrator-verifier`** — short-lived LLM judge. One input record
  (the cursor, diff stats, worker tail). One output verdict
  (`PASS | BLOCKER | FYI` + rationale). High-level only — "did this
  iteration roughly match the plan?". Distinct from the existing
  `verifier` subagent (which is goal-backward, in-phase, runs
  `luca verification write`).
- **`/restructure-driver`** — retained as a **preset**. `lucaConfig.preset
  = "restructure"` selects (a) the 12-row increment manifest baked into
  the current prototype, (b) the D1–D4 locked decisions block, (c) the
  G→H halt boundary. Otherwise it reuses `/luca`'s machinery verbatim.
  Retires once `refactor/repo-restructure` merges and the preset is
  unused.

### 2.3 Migration mechanics (skill rename + new factories)

Three mechanical steps, all under the existing artifact-compile pipeline
(D-1 + D-2 already landed):

1. **Rename**: `git mv packages/luca-framework/skills/skills/lu/ packages/luca-framework/skills/skills/phase-run/`. Update the skill's frontmatter `name: phase-run`. Add a forwarding alias `/lu` →
   `/phase-run` in the compiler (the alias emits both `lu.skill.md` and
   `phase-run.skill.md`, with `lu` carrying a deprecation banner). Keep
   the alias for one release; drop in the release after.
2. **New skill**: author `packages/luca-tools/src/artifacts/skills/luca.skill.ts`
   via `defineSkill` (the factory already exists from D-1). The skill body
   is the loop algorithm in §5.
3. **New subagent**: author
   `packages/luca-tools/src/artifacts/subagents/orchestrator-verifier.ts`
   via `defineSubagent`. Registers in the existing `SUBAGENTS` barrel
   (`packages/luca-tools/src/artifacts/subagents/index.ts`).

User-facing deprecation:
- One release with both `/lu` and `/phase-run` (alias active). Release
  notes call out the rename. The `/lu` skill body prints a one-line
  deprecation header on every invocation.
- Following release: drop `/lu`. The alias file is removed from the
  compile manifest.

### 2.4 Naming check — open

`/luca` vs the existing `luca` CLI binary — there is a real risk of
mental-model collision. The slash-command and the CLI have different jobs
(orchestrator vs. structural write surface). Surfaced as open question
**Q6** in §10.

### 2.5 New artifact — `orchestrator.lock`

The single-flight contract introduced by Decision 6 (see §5b) adds one
new file to the `.luca/` root: **`.luca/orchestrator.lock`**. Distinct
from the existing `.luca/lock.json` (the inner-pipeline crash-recovery
lock that pairs with `state.lockPid`). Two locks, two scopes — see §5b
for the full semantics and §10 Q15 for the contract-extension obligation.

---

## 3. Increment model

The unit of orchestration is an **Increment**. The prototype's 12-row
table (D-1 … G-1 in
`~/.claude/skills/restructure-driver/SKILL.md`) is the reference shape.

### 3.1 Shape

```ts
// Sketch — not implementation.
export const IncrementSchema = z.object({
  // Stable identifier. `D-1`, `m12.0.0/p3/i2`, or any project-defined
  // pattern. Used as the cursor `last_completed` value and as the
  // telemetry meta tag.
  id: z.string().min(1),

  // Coarse arc. For the restructure: phase letters (D/E/F/G).
  // For a milestone-driven workflow: the roadmap phase name.
  phase: z.string().min(1),

  // 1-indexed step within the phase. Strictly monotonic per phase.
  step: z.number().int().positive(),

  // Optional resume hint for partial progress. Free-form string the
  // worker writes back into the cursor when it can't finish a step
  // in one run.
  substep: z.string().optional(),

  // Human-readable.
  title: z.string().min(1),
  description: z.string().min(1),

  // Read whitelist — paths the worker may read.
  source_paths: z.array(z.string()).default([]),
  // Write whitelist — paths the worker may write.
  target_paths: z.array(z.string()).default([]),
  // Deletion whitelist — the ONLY paths the worker may delete this
  // run. `[]` means no deletions allowed.
  authorized_deletions: z.array(z.string()).default([]),

  // Worker identity — which sub-agent / skill spawns the work.
  // Default is the full `/phase-run` cycle; smaller increments can
  // target a focused general-purpose agent.
  worker: z.discriminatedUnion('kind', [
    z.object({
      kind: z.literal('phase-run'),
      // Optional flag overrides to inject into /phase-run.
      flags: z.array(z.string()).default([]),
    }),
    z.object({
      kind: z.literal('subagent'),
      // The `defineSubagent` id, e.g. `executor`, `researcher`.
      subagent_id: z.string().min(1),
      prompt_template: z.string().min(1),
    }),
    z.object({
      kind: z.literal('general-purpose'),
      // Free-form prompt the orchestrator hands to the Task tool with
      // `subagent_type: general-purpose`.
      prompt_template: z.string().min(1),
    }),
  ]),

  // Hard gates. The orchestrator only marks the increment complete if
  // every predicate evaluates true after the worker returns.
  // Examples: `tsc-green`, `no-failing-checks`, `commit-on-branch`.
  gate_predicates: z.array(
    z.enum([
      'tsc-green',
      'no-failing-checks',
      'commit-on-branch',
      'cursor-advanced',
      'authorized-deletions-only',
    ]),
  ).default(['tsc-green', 'commit-on-branch', 'cursor-advanced',
            'authorized-deletions-only']),

  // Forward-compat hint. Per Decision 5 all workers spawn in the
  // BACKGROUND today, so this field is informational only — the
  // orchestrator does not gate on it yet. Future hybrid models may
  // route "short" increments to foreground for lower latency and
  // route "long" ones to background. Concrete seconds are reserved
  // for tooling that wants to surface ETAs to the user.
  expected_worker_duration: z
    .union([z.enum(['short', 'long']), z.number().int().positive()])
    .optional(),
})
export type Increment = z.infer<typeof IncrementSchema>
```

### 3.2 Provenance of increments

The increment manifest is **not** LLM-decided at run time. It comes from
one of:

- **Preset** — a baked-in manifest (the restructure preset's 12 rows).
- **Roadmap projection** — the orchestrator reads `.luca/roadmap.md`
  (or the typed roadmap in state.json) and projects each phase entry
  into one or more increments. Default projection: one phase = one
  increment, with `worker.kind = "phase-run"`. The user can override
  with a `.luca/orchestrator-manifest.json` if a finer breakdown is
  needed.
- **Programmatic** — the orchestrator config exports a function that
  returns the manifest array. Useful for monorepo-wide work where the
  increments are derived from package metadata.

The restructure prototype hard-codes its manifest in the skill body —
this design's preset mechanism (§9.3) hoists that into a typed config so
the next "drive-this-N-step-effort-end-to-end" use case can declare a
manifest without copy-pasting the skill.

### 3.3 What an increment is NOT

- **Not a wave.** A wave is an inner-loop concept inside `/phase-run`
  (execute step) — multiple parallel-safe tasks under one phase plan.
  An increment is the outer-loop unit the orchestrator iterates over.
- **Not a roadmap phase entry.** A phase may project to ONE increment
  (`worker: phase-run`) or to MANY (`worker: subagent` per sub-step,
  as in the current restructure). The projection is configurable.
- **Not a commit.** A single increment may produce 1..N commits. The
  halt-check requires `>= 1` new commit and at least one cursor
  advance per increment — but does not police commit granularity.

---

## 4. State machine schema

### 4.1 Where the cursor lives

The orchestration cursor lives **alongside** the existing
`lucaStateSchema` slices (complexity, oversight, pipelineStep,
currentPhase, …), not nested under them. The existing state schema in
`packages/luca-core/src/state/schemas.ts` is a flat object; we add one
optional top-level field, `orchestration`, whose presence indicates the
orchestrator is driving.

**Why beside, not wrap:**
- Workflows that never use `/luca` (a one-off `/phase-run` invocation,
  a bare `/quick`) leave the field undefined. The existing state
  machine semantics are untouched.
- The orchestrator owns the field; the inner `/phase-run` writes
  pipelineStep, currentPhase, etc., as it does today. The two slices
  evolve independently.
- Migration risk is minimal — adding an optional field is a strictly
  additive Zod change. `lucaStateSchemaTolerant` already passes through
  unknown fields, so reading an old state.json gives `orchestration:
  undefined` cleanly.

### 4.2 Schema sketch

The cursor encodes two levels of state:

- **Coarse status** (`status`) — between-iteration ledger. IDLE / INIT /
  RUNNING / HALTED / COMPLETE. Kept for backwards compat with the
  prototype mental model.
- **Fine-grained `iteration_state`** — intra-iteration ledger. Tracks
  which sub-step of the loop body the orchestrator was last at. This
  is the field Decision 5 + Decision 6 lean on for kill-anytime
  resilience: every state transition is a single durable bridge write,
  so a `/clear` at any point in the loop leaves the cursor pointing
  at a well-defined resume node (see §5a).

```ts
// Sketch — to land in packages/luca-core/src/state/schemas.ts.

export const OrchestrationStatus = z.enum([
  'IDLE',         // No orchestration active.
  'INIT',         // Cursor minted; first iteration not yet started.
  'RUNNING',      // A worker is in flight for the current increment.
  'VERIFYING',    // Worker returned; orchestrator-verifier is judging.
  'ADVANCED',     // Iteration complete; cursor about to point at next.
  'HALTED',       // Halt condition hit; halt_reason is non-empty.
  'COMPLETE',     // Manifest exhausted; orchestrator is done.
])
export type OrchestrationStatus = z.infer<typeof OrchestrationStatus>

// Intra-iteration state. The orchestrator writes one of these values
// at every loop step boundary; the bridge enforces legal transitions
// (table in §4.3). This is what makes the orchestrator kill-anytime
// resumable.
export const IterationState = z.enum([
  'idle',                // Between iterations, no work in flight.
  'pre_flight',          // Running environment + lock pre-flight.
  'lock_acquired',       // Single-flight lock taken.
  'worker_spawned',      // Worker subagent in flight (background).
  'worker_done',         // Worker reported back (or git reconciled).
  'verifying',           // orchestrator-verifier in flight (foreground).
  'verified',            // Verifier verdict captured.
  'post_flight',         // Running structural halt-checks.
  'telemetry_written',   // JSONL + MuninnDB engram both emitted.
  'cursor_advancing',    // About to write the cursor advance.
  'completed',           // Iteration finished cleanly; ready for next.
  'halted',              // Iteration ended in halt; user intervention.
])
export type IterationState = z.infer<typeof IterationState>

export const OrchestrationCursorSchema = z.object({
  // Manifest identity — which preset/roadmap projection is active.
  manifest_id: z.string().min(1),
  // ULID/UUID minted at INIT, stable across iterations. Doubles as the
  // telemetry `runId` so per-iteration JSONL events all land in one file
  // for the whole milestone drive.
  run_id: z.string().min(1),

  status: OrchestrationStatus.default('IDLE'),

  // --- Intra-iteration durability (D5 + D6) ---
  // Fine-grained progress within the current iteration. The single
  // source of truth for the resume protocol (§5a).
  iteration_state: IterationState.default('idle'),
  // ULID-ish identifier for the current iteration. Minted on the
  // idle → pre_flight transition; reused across all telemetry +
  // engram writes within the iteration (idempotency key). Distinct
  // from the manifest-wide `run_id`.
  iteration_run_id: z.string().optional(),
  iteration_started_at: z.iso.datetime().optional(),
  // Worker reconnect handles (D5: background workers + agentId
  // reconnect). Non-null only while iteration_state is one of
  // {worker_spawned, worker_done}.
  worker_agent_id: z.string().nullable().default(null),
  worker_spawn_at: z.iso.datetime().nullable().default(null),
  // Git reconciliation hint — regex or commit-subject prefix the
  // worker is expected to use for its commits. Allows fallback
  // reconciliation when the worker's agentId is dead/GC'd and
  // SendMessage fails. The orchestrator builds this from the
  // increment manifest (e.g. `^(feat|chore|docs)\(restructure\): `).
  worker_subject_expected: z.string().optional(),
  // PID of the process holding the single-flight orchestrator lock
  // (§5b). Mirrors `.luca/orchestrator.lock` for cheap reads; the
  // lock file is the authoritative source.
  lock_holder_pid: z.number().int().positive().nullable().default(null),

  // Pointer into the manifest.
  current_increment_id: z.string().optional(),
  current_phase: z.string().optional(),
  current_step: z.number().int().positive().optional(),
  current_substep: z.string().optional(),

  // What was last finished.
  last_completed_id: z.string().optional(),
  last_completed_commit: z.string().optional(),
  last_completed_at: z.iso.datetime().optional(),

  // Non-empty iff status === 'HALTED'.
  halt_reason: z.string().optional(),

  // Verifier ledger — last 5 FYIs (rolling), surfaces escalation
  // thresholds for §6 design call "PASS-with-followup".
  recent_fyis: z.array(z.object({
    increment_id: z.string(),
    rationale: z.string(),
    at: z.iso.datetime(),
  })).max(5).default([]),

  // Iteration counters — for telemetry summaries + cross-run reporting.
  iterations_completed: z.number().int().nonnegative().default(0),
  iterations_halted: z.number().int().nonnegative().default(0),
})
export type OrchestrationCursor = z.infer<typeof OrchestrationCursorSchema>

// Extend the existing lucaStateSchema:
export const lucaStateSchema = z.object({
  // …existing fields…
  orchestration: OrchestrationCursorSchema.optional(),
})
```

### 4.3 Legal transitions

Two transition tables now apply. Both are enforced by the bridge.

**Coarse `status` transitions** (between-iteration, unchanged from the
first design pass):

```
IDLE     → INIT       (orchestrator: start, manifest selected)
INIT     → RUNNING    (orchestrator: pick first increment, spawn worker)
RUNNING  → VERIFYING  (worker returned, awaiting verifier)
RUNNING  → HALTED     (worker silent-failure / unauthorized delete)
VERIFYING → ADVANCED  (verifier PASS or FYI)
VERIFYING → HALTED    (verifier BLOCKER)
ADVANCED → RUNNING    (next increment exists)
ADVANCED → COMPLETE   (manifest exhausted)
HALTED   → RUNNING    (operator unblocks: orchestrator clear-halt + resume)
HALTED   → IDLE       (operator aborts orchestration cleanly)
COMPLETE → IDLE       (orchestrator: clean exit)
```

**Fine-grained `iteration_state` transitions** (intra-iteration; every
edge is a single durable bridge write):

```
idle              → pre_flight         (orchestrator: begin iteration)
pre_flight        → lock_acquired      (lock file created with O_EXCL)
pre_flight        → halted             (pre-flight check fired)
lock_acquired     → worker_spawned     (Agent run_in_background → agentId)
lock_acquired     → halted             (pre-spawn invariant violation)
worker_spawned    → worker_done        (SendMessage status=complete OR
                                        git reconciliation succeeded)
worker_spawned    → halted             (reconciliation ambiguous /
                                        worker died with no commits)
worker_done       → verifying          (orchestrator-verifier spawned FG)
verifying         → verified           (verifier returned a verdict)
verifying         → halted             (verifier failure / timeout)
verified          → post_flight        (verdict was PASS or FYI)
verified          → halted             (verdict was BLOCKER)
post_flight       → telemetry_written  (structural halt-checks passed)
post_flight       → halted             (structural halt-check fired)
telemetry_written → cursor_advancing   (telemetry + engram emitted)
cursor_advancing  → completed          (cursor advance + lock release ok)
cursor_advancing  → halted             (cursor write rejected by bridge)
completed         → idle               (orchestrator resets for next loop)
halted            → idle               (operator CLEAR_HALT applied)
```

Edges NOT in this list are illegal. The bridge's
`orchestrator transition --event=…` command rejects illegal edges.

Mapping to coarse `status`: `pre_flight`/`lock_acquired`/`worker_spawned`
all roll up to `RUNNING`. `verifying`/`verified` roll up to `VERIFYING`.
`post_flight`/`telemetry_written`/`cursor_advancing` roll up to
`ADVANCED`. `completed` → `RUNNING` (ready for next increment) or
`COMPLETE` (manifest exhausted). `halted` ↔ `HALTED`. The coarse field
is a derived view; the orchestrator only writes `iteration_state` and
the bridge derives `status` from it.

This mirrors the prototype's halt-then-resume cadence but adds the
intra-iteration ledger that Decisions 5 + 6 require.

### 4.4 Bridge CLI surface

New subcommands under the existing `luca-bridge` binary (the prototype
already exposes `read-status`, `read-complexity`, `transition`,
`ensure-init`, etc.). All return JSON for shell consumption.

| Command | Args | Behaviour |
| --- | --- | --- |
| `luca-bridge orchestrator init` | `--manifest-id=<id>` | Mint a `run_id` (delegating to `generateRunId()`), set `status=INIT`, set `manifest_id`, persist. Idempotent — no-op if orchestration already INIT/RUNNING. |
| `luca-bridge orchestrator read-cursor` | — | Print the `orchestration` field of state.json, or `{ status: "IDLE" }` if absent. |
| `luca-bridge orchestrator set-increment` | `--id=<inc-id>` `--phase=<p>` `--step=<n>` `[--substep=<s>]` | Move the cursor pointer to the named increment. Used by the orchestrator at the start of each iteration. |
| `luca-bridge orchestrator transition` | `--event=<EVENT>` `[--data=<json>]` | Apply one of the legal transitions in §4.3. **Coarse events:** `WORKER_RETURNED`, `VERIFIER_PASS`, `VERIFIER_BLOCKER`, `VERIFIER_FYI`, `ADVANCE`, `HALT`, `CLEAR_HALT`, `COMPLETE`. **Fine-grained `iteration_state` events:** `BEGIN_ITERATION` (→ pre_flight), `LOCK_ACQUIRED`, `WORKER_SPAWNED` (`data: {worker_agent_id, worker_spawn_at, worker_subject_expected}`), `WORKER_DONE` (`data: {source: "send-message" \| "git-reconciliation", commits: [...]}`), `BEGIN_VERIFY`, `VERIFY_DONE` (`data: {verdict, rationale_hash}`), `BEGIN_POST_FLIGHT`, `TELEMETRY_EMITTED`, `BEGIN_CURSOR_ADVANCE`, `ITERATION_COMPLETED`. Each carries the relevant metadata in `data` (e.g. commit sha, halt reason). |
| `luca-bridge orchestrator append-fyi` | `--increment-id=<id>` `--rationale=<text>` | Append to `recent_fyis`, evicting the oldest when full. Surfaces escalation. |
| `luca-bridge orchestrator force-unlock` | `[--run-id=<id>]` | Operator-only: delete `.luca/orchestrator.lock`. Refuses unless the lock's PID is dead OR `--run-id` matches the lock's `run_id` (cheap CSRF-style guard against accidental forced unlock of a live run). See §5b. |
| `luca-bridge orchestrator clear` | — | Reset `orchestration` to `undefined`. Operator-only — for aborting cleanly. Also clears the orchestrator lock if held. |

The set is intentionally small (7 commands after this pass). Anything
beyond this should go through a higher-level subagent/skill — the bridge
is not a general programming surface, it's a typed gate.

### 4.5 Relationship to existing slices

| Slice | Owner | Orchestrator's relationship |
| --- | --- | --- |
| `pipelineStep` | `/phase-run` (worker) | The orchestrator does not touch this. `/phase-run` advances it through triage → research → … → learn within an increment. |
| `currentPhase`, `totalPhases` | Worker | Same — workers manage their own phase counters. |
| `complexity`, `oversight` | `/luca` reads, worker writes | `/luca` resolves complexity at the manifest level (one preset → one complexity), but the inner pipeline can refine per-increment. |
| `orchestration.run_id` | `/luca` | Doubles as the telemetry `runId` for every JSONL event the orchestrator emits across this milestone. |
| `roadmap` | `/luca` reads to project manifest; worker reads to plan a phase | The orchestrator's view of the roadmap is read-mostly; only roadmap-revision skills (e.g. `/milestone-new`) mutate the array. |

The pre-existing `STAGE_TOOL_MATRIX` and stage-gate hooks key off
`pipelineStep`, NOT off orchestration status. This is intentional: even
when orchestration is RUNNING, the inner pipeline still gates writes
per-step. The orchestrator does not need its own write-gate.

---

## 5. Loop algorithm

One iteration = one increment. The orchestrator runs this loop body
once per invocation; `/loop /luca` or `/schedule … /luca` re-enters
between iterations.

**Kill-anytime rule:** every step in the loop ENDS with a single
durable transition write to the bridge. The cursor's `iteration_state`
field is therefore the single source of truth for "what was the last
thing successfully done". A `/clear` of the orchestrator's session at
any moment leaves the cursor pointing at a well-defined node, and the
resume protocol in §5a maps each node to its recovery action.

### 5.1 Per-iteration steps

#### 5.1.a — ENTRY (every `/luca` invocation)

1. Read the cursor via `luca-bridge orchestrator read-cursor`.
2. Dispatch on `iteration_state`:
   - `idle` or `completed` → fresh iteration; continue to §5.1.b.
   - `pre_flight`, `lock_acquired`, `worker_spawned`, `worker_done`,
     `verifying`, `verified`, `post_flight`, `telemetry_written`,
     `cursor_advancing` → this is a RESUME. Jump into the resume
     protocol in §5a, which routes to the right step below.
   - `halted` → refuse. The operator must call
     `transition --event=CLEAR_HALT` first; then re-fire.
3. If `status === 'IDLE'` (no `orchestration` slice yet), call
   `orchestrator init` with the resolved `manifest_id` and read again.

#### 5.1.b — PRE-FLIGHT (transition `idle` → `pre_flight`)

1. Bridge: `transition --event=BEGIN_ITERATION --data='{
     "iteration_run_id": "<ULID>",
     "iteration_started_at": "<ISO>"}'`. Cursor advances to
   `pre_flight`. **Checkpoint:** durable.
2. Run environment checks:
   - `cd` to the repo root (resolved from cwd or `--repo` flag).
   - `git rev-parse --abbrev-ref HEAD` — confirm the expected branch
     (default: the manifest's `target_branch`).
   - `git status --porcelain` — assert clean tree (tolerate untracked
     `*.md` drafts as the prototype does).
   - Snapshot `PRE_AGENT_HEAD = git rev-parse HEAD` (stored in the
     ledger, not the cursor — too large/transient).
3. Pre-flight halt-checks (halt on first hit; emit
   `transition --event=HALT` with the reason):

   | # | Check | Halt reason |
   | --- | --- | --- |
   | 1 | Wrong branch / dirty modifications | Environment fault |
   | 2 | `cursor.halt_reason` non-empty | Resuming halted state |
   | 3 | `cursor.status === 'COMPLETE'` | Manifest exhausted — clean exit |
   | 4 | Cursor points at an unknown increment id | Corrupt cursor |
   | 5 | Cursor exceeds known terminal boundary (e.g. restructure preset's `G-1` end) | Preset boundary hit |
   | 6 | `bun` not on PATH | Missing toolchain |
   | 7 | MuninnDB MCP unreachable (orchestrator pings `mcp__muninn__muninn_state`) | Memory unreachable |
   | 8 | `recent_fyis.length >= 3` AND all 3 same category | FYI escalation (becomes a BLOCKER) |

#### 5.1.c — LOCK ACQUISITION (transition `pre_flight` → `lock_acquired`)

1. Atomically create `.luca/orchestrator.lock` with `open(EXCL)`
   semantics (see §5b).
2. If creation fails because the file already exists:
   - Read the lock contents. If its `pid` is a live process: refuse.
     Emit `transition --event=HALT --data='{"halt_reason":"Another
     /luca is running: run_id=<X> started at <T>. Wait or
     force-unlock."}'`. Return.
   - If `pid` is dead: it's a stale lock — log a warning, unlink the
     file, and retry the creation once. Emit the
     `orchestrator.lock.stale` telemetry event.
3. On success: bridge `transition --event=LOCK_ACQUIRED --data='{
     "lock_holder_pid": <getpid()>}'`. **Checkpoint:** durable.

#### 5.1.d — WORKER SPAWN (transition `lock_acquired` → `worker_spawned`)

1. Pick the next increment from the manifest matching
   `(current_phase, current_step[, current_substep])`. Bridge:
   `orchestrator set-increment --id=… --phase=… --step=…`.
2. Build the worker prompt from the increment definition + locked
   decisions (§9.3 preset's `baked_in_context`).
3. **Spawn in BACKGROUND** (Decision 5):

   - `worker.kind === 'phase-run'` → `Agent(subagent_type: "phase-run",
     run_in_background: true, prompt: <built-prompt>)`. The
     orchestrator passes `--orchestrated` so `/phase-run` knows not
     to mint its own roadmap/branch.
   - `worker.kind === 'subagent'` → `Agent(subagent_type:
     <subagent_id>, run_in_background: true, prompt: <substituted>)`.
   - `worker.kind === 'general-purpose'` → `Agent(subagent_type:
     "general-purpose", run_in_background: true, prompt:
     <substituted>)`.

   The Agent call returns an `agentId` immediately. The worker
   continues to run as a separate harness process, independent of
   the orchestrator's session — so a `/clear` of the orchestrator
   does NOT kill the worker.

4. Compute `worker_subject_expected` from the increment's commit
   convention (e.g. `^(feat|chore|docs)\(restructure\): `).
5. Bridge: `transition --event=WORKER_SPAWNED --data='{
     "worker_agent_id": "<agentId>",
     "worker_spawn_at": "<ISO>",
     "worker_subject_expected": "<regex>"}'`. **Checkpoint:** durable.
6. Emit telemetry: `luca telemetry emit
   --kind=orchestrator.iteration.start --run-id=<run_id> --meta='{
     "iteration_run_id": "<id>", "increment_id": "…",
     "worker_kind": "phase-run", "worker_agent_id": "<aid>"}'`.
7. **RETURN.** The orchestrator hands control back to the harness;
   the next `/luca` invocation (manual, `/loop`, or a wakeup) picks
   the iteration back up at `worker_spawned`.

#### 5.1.e — WORKER DONE DETECTION (resume path: `worker_spawned`)

This step runs on every `/luca` invocation that finds the cursor at
`worker_spawned`.

1. Probe the worker via `SendMessage(to: cursor.worker_agent_id,
   message: "status?")`. Possible outcomes:

   - **Reply with running indicator** (worker hasn't finished):
     schedule a wakeup (`ScheduleWakeup(delaySeconds:
     cursor.orchestrator.wakeup_seconds)`) and return. Do NOT
     transition — `iteration_state` stays at `worker_spawned`.
   - **Reply with completion / final-message body**: the worker
     finished. Capture the tail (~500 chars). Run §5.1.e.3 (git
     reconciliation) to confirm; transition to `worker_done`.
   - **SendMessage fails / dead agentId** (the harness has GC'd the
     agentId, or the worker process crashed): fall through to git
     reconciliation as the sole signal. See open question Q14 for
     addressability lifetime.

2. **Git reconciliation** (always runs after a completion-style
   reply OR after a SendMessage failure):
   - `POST_AGENT_HEAD = git rev-parse HEAD`.
   - `COMMITS = git log --pretty=format:"%H %s"
     <stored-PRE>..POST` where `<stored-PRE>` is recovered from the
     ledger snapshot taken at §5.1.b.
   - Filter `COMMITS` against `cursor.worker_subject_expected`.
   - Classification:

     | Signal | Meaning | Action |
     | --- | --- | --- |
     | ≥1 matching commit AND the §10 doc-update commit appears (worker's terminal step) | Worker completed | `transition --event=WORKER_DONE --data='{"source":"…","commits":[…]}'` |
     | ≥1 matching commit, NO doc-update commit | Partial — worker died mid-flight | `transition --event=HALT --data='{"halt_reason":"Reconciliation needed: worker produced <n> commits but did not finalize."}'` |
     | No matching commits | Worker died early or never spawned | `transition --event=HALT --data='{"halt_reason":"Worker silent failure — no commits since spawn."}'` |

3. On successful `transition --event=WORKER_DONE`: cursor's
   `worker_agent_id` is set to `null` by the bridge.
   **Checkpoint:** durable. Continue to §5.1.f.

#### 5.1.f — VERIFY (transition `worker_done` → `verifying`)

1. Bridge: `transition --event=BEGIN_VERIFY`. **Checkpoint:** durable.
2. Build the input record from the ledger + git diff + worker tail
   (if available — may be absent if the orchestrator was killed
   mid-worker and the worker's return was reconciled from git alone;
   see §6 for the verifier's tolerance of this case).
3. **Spawn the `orchestrator-verifier` FOREGROUND** (Decision 5
   keeps the verifier synchronous). `Agent(subagent_type:
   "orchestrator-verifier", run_in_background: false, prompt:
   <input>)`. The verifier writes its verdict to the audit file
   (§6.3) and returns it via the final message.
4. Parse the verdict. Bridge: `transition --event=VERIFY_DONE
   --data='{"verdict":"<PASS|FYI|BLOCKER>","rationale_hash":"<sha>"}'`.
   Cursor advances to `verified`. **Checkpoint:** durable.

#### 5.1.g — POST-FLIGHT (transition `verified` → `post_flight`)

1. If the verdict was `BLOCKER`: bridge `transition --event=HALT
   --data='{"halt_reason":"verifier-blocker: <rationale-tail>"}'`.
   Emit `PushNotification(status:"proactive", …)`. Return.
2. Otherwise: bridge `transition --event=BEGIN_POST_FLIGHT`.
3. Run structural halt-checks (mirror of the prototype's §6):

   | # | Check | Halt reason |
   | --- | --- | --- |
   | 1 | No new commits AND no halt marker from worker | Silent failure |
   | 2 | Cursor `last_completed` unchanged AND no substep update | Missing cursor advance |
   | 3 | `DELETIONS` includes paths outside `authorized_deletions` | Unauthorized deletion |
   | 4 | Repeated tsc fail (same hash 2 iterations) | Convergence failure |
   | 5 | `gate_predicates` evaluate false (any) | Gate not met |

   If any fire: bridge `transition --event=HALT`. Return.
4. **Checkpoint:** durable.

#### 5.1.h — TELEMETRY (transition `post_flight` → `telemetry_written`)

Both writes are idempotent on `iteration_run_id` (§7.1, §7.2). A
re-run after a `/clear` produces no duplicate engram and only
benign duplicate JSONL events.

1. JSONL: `luca telemetry emit --kind=orchestrator.iteration.end
   --run-id=<run_id> --duration-ms=<ms> --meta='{
     "iteration_run_id":"<id>", "increment_id":"…",
     "verdict":"PASS", "files_touched":<n>, "commits":<n>,
     "halt_reason":null}'`. For each FYI:
   `kind=orchestrator.verifier.verdict, meta.verdict="FYI"`.
2. MuninnDB engram: `mcp__muninn__muninn_remember(vault:
   <repo-vault>, concept: "metric:luca-iteration-<run_id>-<n>",
   op_id: "<iteration_run_id>",  // idempotency key
   content: <summary; §7.2>, type: "metric",
   summary: "<one-line>", entities: [<increment_id>, <worker>,
   <verdict>])`.
3. Bridge: `transition --event=TELEMETRY_EMITTED`.
   **Checkpoint:** durable.

#### 5.1.i — CURSOR ADVANCE (transition `telemetry_written` → `cursor_advancing` → `completed`)

1. Bridge: `transition --event=BEGIN_CURSOR_ADVANCE`. Cursor to
   `cursor_advancing`. **Checkpoint:** durable. Re-entry from this
   state is a safe no-op (see §5a — the cursor compare detects
   "already advanced" via the next-increment lookup).
2. Compute next increment from the manifest.
3. Apply the advance:
   - On PASS or FYI: `transition --event=ADVANCE --data='{
       "last_completed_id":"<id>","last_completed_commit":"<sha>",
       "next_increment_id":"<next>","next_phase":"<p>",
       "next_step":<n>}'`.
   - On manifest-exhausted: `transition --event=COMPLETE`. Status
     becomes `COMPLETE`; emit
     `kind=orchestrator.manifest.complete` telemetry.
4. Release the orchestrator lock: `unlink('.luca/orchestrator.lock')`
   and bridge `transition --event=ITERATION_COMPLETED`. Cursor
   advances to `completed`, then immediately to `idle` (per the
   transition table). **Checkpoint:** durable.

#### 5.1.j — EXIT

- ScheduleWakeup (`/loop` mode) or return (one-shot). Default
  wakeup interval 1200s, tunable per preset.
- One-line summary to caller: `"✓ <increment_id> [PASS|FYI] —
  cursor at <phase>-<step>. Next: <next_id>."`.

### 5.2 What's new versus the prototype

| Prototype step | `/luca` enhancement |
| --- | --- |
| §3 pre-flight halt-checks (8) | Adds FYI-escalation check (#8) |
| §5 sub-agent spawn (general-purpose, foreground) | **D5:** worker discriminated union — phase-run, subagent, or general-purpose; **all workers run BACKGROUND**; orchestrator stores `worker_agent_id` and reconnects via `SendMessage` |
| §6 post-flight halt-checks | Adds gate_predicates evaluation (#5) |
| §7 halt path: PushNotification + memory evolve | Adds `transition --event=HALT` so the cursor state is the typed source of truth, not the memory body |
| (no inter-iteration verifier) | **New** §5.1.f — `orchestrator-verifier` FG between worker and advance |
| (telemetry not emitted from driver) | **New** §5.1.h — JSONL + MuninnDB summary engram every iteration |
| (cursor stored as memory-body text; one resume node only) | **D6 + new state machine:** cursor in state.json with `iteration_state` enum (12 values); 12-node intra-iteration ledger; every loop step ends with a durable bridge write |
| (no single-flight guard) | **D6:** `.luca/orchestrator.lock` single-flight contract; stale-lock auto-clear by PID liveness; `force-unlock` CLI |

### 5.3 What stays the same

- **Cursor is the source of truth, not the file tree.** Just like the
  prototype, but the cursor moves from MuninnDB body-text into the
  typed state.json slice — and now records intra-iteration progress
  too.
- **One commit (or more) per iteration; no rollbacks.** The orchestrator
  observes; the worker commits. Halts surface to the operator; the
  orchestrator never reverts.
- **`bun test` is forbidden; `bunx --bun tsc` is the gate.** The
  no-tests rule applies. The `gate_predicates.tsc-green` check runs
  the per-package tsc the same way the prototype does.

### 5.4 What changed since the first design pass

The first pass said "foreground worker spawn — background workers caused
the prototype's early flake". The second pass — driven by Decision 5 —
reverses that: workers spawn in the background to gain kill-anytime
resilience. The flake risk is mitigated by:

- The `iteration_state` ledger making spawn/return ordering observable
  and resumable (no lost cursor-write race).
- Explicit reconnect via `SendMessage(agentId)` with a git-reconciliation
  fallback when the agentId is dead.
- The `worker_subject_expected` regex giving the orchestrator a
  deterministic way to know "did the worker actually do its work" even
  when no return-message is available.

The verifier stays foreground. It's short, stateless on input, and we
want the verdict before the cursor advances — which means it inherently
runs to completion within a single `/luca` invocation. A `/clear` during
verification simply re-spawns it (the verifier is idempotent on input).

---

## 5a. Resume protocol — kill-anytime resilience

Decision 5 + Decision 6 hinge on this contract: at any
`iteration_state` value, a new `/luca` invocation must be able to
resume the loop with no loss of work and no double-execution. The
table below maps each resumable state to its recovery action.

| Resumed `iteration_state` | What happened (interpretation) | Recovery action |
| --- | --- | --- |
| `pre_flight` | Orchestrator died during environment checks | Re-run §5.1.b from the top. Idempotent — env checks are pure reads. |
| `lock_acquired` | Died after taking the lock, before spawning the worker | Validate that the lock's `pid` is still our process. If dead/foreign: clear the lock, re-enter at §5.1.b. If ours: re-enter at §5.1.d (worker spawn). |
| `worker_spawned` | **Most common kill case: `/clear` mid-worker** | Run §5.1.e (Worker Done Detection). First try `SendMessage(cursor.worker_agent_id)`; on success use the reply tail. On failure fall back to git reconciliation against `worker_subject_expected`. The cursor's `worker_spawn_at` bounds the git log window. |
| `worker_done` | Died between worker completion and verifier spawn | Re-enter at §5.1.f. The worker's diff is on disk (git); the verifier rebuilds its input from git + cursor + (optional) the last `SendMessage` tail captured in the ledger. |
| `verifying` | Died mid-verifier (foreground sub-agent killed by `/clear`) | Re-spawn the verifier (§5.1.f.3). Verifier input is deterministic on (cursor, git diff, optional tail); a re-spawn produces the same verdict modulo model nondeterminism. Note: the audit file at §6.3 may exist from the previous attempt — re-spawn OVERWRITES it. |
| `verified` | Died after verdict captured, before structural halt-check | Re-enter at §5.1.g. Verdict already on cursor; halt-checks are read-only against git + cursor. |
| `post_flight` | Died mid-halt-check | Re-run §5.1.g. Halt-checks are pure reads. |
| `telemetry_written` | Died before cursor advance | Re-enter at §5.1.i. Telemetry writes were idempotent (concept-key + `op_id` for MuninnDB; `iteration_run_id` for JSONL) — no double-write. |
| `cursor_advancing` | Died mid-advance | Re-enter at §5.1.i. The advance is one bridge call; either it landed (cursor has the new `last_completed_id` already) or it didn't. The bridge's `--event=ADVANCE` is idempotent on `last_completed_id` + commit sha — applying it twice is a no-op. |
| `completed` | Iteration done; orchestrator dispatched between iterations | Treat as fresh; continue at §5.1.b. The bridge auto-resets to `idle` on the `ITERATION_COMPLETED → idle` edge. |
| `halted` | Iteration ended in halt; user must intervene | Refuse to run. Surface `halt_reason` to the user. Operator runs `luca-bridge orchestrator transition --event=CLEAR_HALT` and re-fires `/luca`. |
| `idle` | Between iterations (or first-ever run) | Fresh iteration; continue at §5.1.b. |

**Invariants the resume protocol depends on:**

1. **Every transition is one durable write.** The orchestrator never
   batches transitions; the bridge persists state.json on every
   `--event=…` call.
2. **No side-effect happens before the transition write that ENABLED
   it.** Counter-example: spawning the worker BEFORE the
   `WORKER_SPAWNED` write would leak an agentId. The orchestrator
   spawns, captures the agentId, THEN writes — this is fine because
   the spawn itself is idempotent: a re-run sees `iteration_state ==
   lock_acquired` and re-spawns. The first worker eventually GC's;
   the second worker is the live one.

   (This is the one place where strict transactionality would help.
   A future hardening is to write a `worker_spawning` intermediate
   state BEFORE the Agent call, so a kill between Agent and the
   `WORKER_SPAWNED` transition is detectable. Surfaced as open
   question Q17 in §10.)

3. **Idempotency at every external touch-point:**
   - Telemetry: `iteration_run_id` in every event; aggregators dedupe.
   - MuninnDB engram: `op_id = iteration_run_id`; repeat writes
     return the same engram ID.
   - Git: the worker's commits are content-addressed; reconciliation
     is read-only.
   - Lock file: `O_EXCL` create + PID-liveness staleness check.

---

## 5b. Lock semantics — single-flight contract

Decision 6 (verbatim): "Only ONE /luca iteration runs per repo at a
time. Lock file at `.luca/orchestrator.lock`. Second invocation while
locked: REFUSE with a clear message; don't wait."

### 5b.1 Lock file

- **Path:** `.luca/orchestrator.lock`. Distinct from
  `.luca/lock.json` (the inner-pipeline crash-recovery lock). The
  LUCA_DIR_CONTRACT in `packages/luca-core/src/luca-dir/configs.ts`
  must be extended to allowlist this file (see §10 Q15).
- **Format:** JSON.

  ```ts
  export const OrchestratorLockSchema = z.object({
    pid: z.number().int().positive(),
    acquired_at: z.iso.datetime(),
    run_id: z.string().min(1),          // matches cursor.run_id
    iteration_run_id: z.string().min(1),// matches cursor.iteration_run_id
    host: z.string().optional(),        // os.hostname() if available
  })
  ```

- **Acquisition:** atomic create-with-O_EXCL. Either `Bun.write`
  with `createIfNotExists`-only semantics, or `mkdir` of a sibling
  lock directory (POSIX mkdir is atomic across filesystems where
  `O_EXCL` may be flaky). Recommendation: `mkdir(.luca/
  orchestrator.lock.dir)` + write `.lock.dir/owner.json` — sidesteps
  any open(2) flag inconsistency. The exact mechanism is an
  implementation detail; the contract is atomic-or-fail.

### 5b.2 Stale lock detection

A lock is stale iff its `pid` is not a live process on `host`. The
orchestrator's PID-liveness check:

1. `process.kill(pid, 0)` — signal 0 doesn't kill, just probes. If
   it throws `ESRCH`, the PID is dead. If it throws `EPERM`, the PID
   exists but is owned by another user — treat as live (conservative).
2. Cross-host caveat: if `lock.host !== os.hostname()`, the
   orchestrator cannot probe the PID. Treat as live; the operator
   must `force-unlock`. (Single-developer use case — should rarely
   trigger; surfaced as a thinking-point not an open question.)

When stale: unlink the lock file, emit
`kind=orchestrator.lock.stale` telemetry with the previous holder's
metadata, and proceed. The cursor's `iteration_state` is whatever it
was — the resume protocol takes care of it.

### 5b.3 Refusal message

When the lock is held by a live PID:

```
luca orchestrator: another /luca is already running.
  run_id:           <run_id>
  iteration_run_id: <id>
  pid:              <pid>
  acquired_at:      <ISO>
  host:             <hostname>

If you're sure the other run is gone, run:
  luca-bridge orchestrator force-unlock --run-id=<run_id>

Otherwise, wait for it to finish.
```

The orchestrator emits `kind=orchestrator.lock.refused` telemetry
and returns. No state mutation happens on refusal.

### 5b.4 Force unlock

`luca-bridge orchestrator force-unlock [--run-id=<id>]`:

- If the lock file is absent: no-op, exit 0.
- If `--run-id` is provided AND matches the lock's `run_id`:
  unlink unconditionally (operator knows what they're doing).
- If `--run-id` is absent: require the lock's PID to be dead.
  Refuse with a non-zero exit if the PID is live.
- Always emits `kind=orchestrator.lock.force-unlocked` telemetry
  with the previous holder's metadata.

This guard exists to prevent the common accident of an operator
running `luca-bridge orchestrator force-unlock` in a stale terminal
while another `/luca` is actually running. Requiring either
matching-`run_id` or PID-dead means at least one of (operator
knows the run_id, PID is verifiably gone) is true.

### 5b.5 Release

The lock is released on:

- `transition --event=ITERATION_COMPLETED` (the happy path; §5.1.i).
- `transition --event=COMPLETE` (manifest exhausted).
- `transition --event=HALT` — yes, the orchestrator releases its
  lock on halt. A halted iteration is not actively progressing; the
  user fixes the issue, `CLEAR_HALT`s, and a fresh `/luca`
  invocation re-acquires.
- `transition --event=CLEAR` (operator nuke).
- `force-unlock` (operator manual).

The lock is NOT released between `worker_spawned` and `worker_done`
even though no code is actively running in the orchestrator's
session — the worker IS the active work. Re-entry on the next
`/luca` invocation re-validates the lock (a fresh PID is now ours)
and proceeds with the resume protocol. (Open question Q18 in §10 —
the lock conceptually represents "an iteration is in flight",
not "a process is running". A PID-based file is a slight model
mismatch; addressed by the §5b.4 force-unlock guard.)

---

## 6. `orchestrator-verifier` subagent contract

### 6.1 Subagent kind

Authored via `defineSubagent` (the factory landed in D-1). Lands at
`packages/luca-tools/src/artifacts/subagents/orchestrator-verifier.ts`.
Joins the existing `SUBAGENTS` barrel.

```ts
// Sketch — see the existing verifier.ts for idioms.
export const orchestratorVerifierSubagent = defineSubagent({
  id: 'orchestrator-verifier',
  name: 'Orchestrator Verifier',
  description:
    'Inter-iteration LLM judge for the /luca orchestrator. Inspects the ' +
    'increment scope, the worker diff, and the cursor advance, then ' +
    'returns PASS | BLOCKER | FYI with a one-paragraph rationale. ' +
    'High-level only — NOT a substitute for code review.',
  maxSteps: 10,                // Cheap by design.
  allowedTools: ['Read', 'Bash'],
  guidance: {
    selfVerify: true,           // Re-read at least one touched file.
    antiSycophancy: true,       // PASS requires explicit evidence.
  },
  telemetryHooks: ['verification-start', 'verification-end'],
  // No pipelineInvocations — this is OUT-OF-PIPELINE.
  instructions: `…see §6.4…`,
})
```

Note: the `telemetryHooks` enum already includes
`verification-start` / `verification-end`; we reuse them rather than
defining a new symbol. The orchestrator-verifier's JSONL events carry
`meta.scope: "orchestrator"` so aggregators can distinguish them from
the inner-pipeline verifier.

### 6.2 Input contract (what `/luca` hands the subagent)

```ts
// Sketch — the orchestrator constructs this object and serializes
// it into the subagent's prompt.
export const OrchestratorVerifierInputSchema = z.object({
  increment: z.object({
    id: z.string(),
    title: z.string(),
    description: z.string(),
    source_paths: z.array(z.string()),
    target_paths: z.array(z.string()),
    authorized_deletions: z.array(z.string()),
    gate_predicates: z.array(z.string()),
  }),
  worker: z.object({
    kind: z.enum(['phase-run', 'subagent', 'general-purpose']),
    id: z.string().optional(),       // e.g. subagent id
    // Last ~500 chars of the worker's final message. MAY BE EMPTY
    // if the orchestrator was killed mid-worker and the worker's
    // return was reconciled from git alone (no SendMessage reply
    // captured). The verifier MUST tolerate this case — see
    // prompt template note in §6.4.
    final_message_tail: z.string(),
    // True when `final_message_tail` came from a SendMessage reply.
    // False when the orchestrator reconstructed the iteration from
    // git alone (worker_agent_id was dead by the time the next
    // /luca invocation ran).
    tail_from_send_message: z.boolean().default(false),
  }),
  commits: z.array(z.object({
    sha: z.string(),
    subject: z.string(),
  })),
  diff_stat: z.string(),             // raw `git diff --stat` output
  deletions: z.array(z.string()),
  cursor_pre: z.object({
    current_phase: z.string(),
    current_step: z.number(),
    last_completed_id: z.string().optional(),
  }),
  cursor_post: z.object({
    current_phase: z.string(),
    current_step: z.number(),
    last_completed_id: z.string().optional(),
    substep: z.string().optional(),
  }),
  // For escalation context.
  recent_fyis: z.array(z.object({
    increment_id: z.string(),
    rationale: z.string(),
  })),
})
```

### 6.3 Output contract

```ts
export const OrchestratorVerifierOutputSchema = z.object({
  verdict: z.enum(['PASS', 'BLOCKER', 'FYI']),
  rationale: z.string().min(1).max(800),  // One paragraph cap.
  issues: z.array(z.object({
    severity: z.enum(['blocker', 'concern', 'info']),
    kind: z.enum([
      'scope-creep',                  // Wrote outside target_paths.
      'missing-scope',                // Didn't address description.
      'unauthorized-deletion',        // Already a structural halt;
                                      //   listed here for FYI escalation.
      'gate-not-met',                 // tsc/checks reported in worker tail.
      'cursor-mismatch',              // Cursor advance ≠ what description implied.
      'no-substantive-diff',          // Commit with empty/whitespace-only diff.
      'other',
    ]),
    file: z.string().optional(),
    note: z.string().min(1),
  })).default([]),
  next_advice: z.string().optional(),    // Free-form, used for §10 Q5.
})
```

The subagent writes the JSON to `.luca/phases/<active-slug>/audits/
orchestrator-verifier.md` (a code block containing the JSON) so the
output is on disk and parseable by `luca-telemetry-report`. The
orchestrator parses the same file rather than relying on the Task tool's
text return.

### 6.4 Prompt template (sketch)

```
You are the Luca Orchestrator Verifier. You judge whether the just-
completed iteration matched its described scope. You are NOT a code
reviewer — line-level review happens at PR time. You produce a JSON
verdict + one-paragraph rationale, then exit.

== INCREMENT ==
ID: {{increment.id}}
Title: {{increment.title}}
Description:
{{increment.description}}

Source paths (read whitelist): {{increment.source_paths}}
Target paths (write whitelist): {{increment.target_paths}}
Authorized deletions: {{increment.authorized_deletions}}

== WORKER ==
Kind: {{worker.kind}} ({{worker.id ?? "n/a"}})
Final-message tail (last ~500 chars):
{{worker.final_message_tail || "(none — reconstructed from git only;
the worker's session was lost before its return was captured. Judge
the iteration from the diff + cursor advance alone.)"}}
Tail source: {{worker.tail_from_send_message ? "send-message reply" : "git reconciliation"}}

== DIFF ==
Commits since PRE_AGENT_HEAD:
{{#each commits}} {{sha}}  {{subject}}{{/each}}

`git diff --stat`:
{{diff_stat}}

Deletions: {{deletions}}

== CURSOR ==
PRE:  phase={{cursor_pre.current_phase}} step={{cursor_pre.current_step}}
POST: phase={{cursor_post.current_phase}} step={{cursor_post.current_step}}
      substep={{cursor_post.substep ?? "(none)"}}

== RECENT FYIS (rolling 5) ==
{{#each recent_fyis}}- [{{increment_id}}] {{rationale}}{{/each}}

== YOUR JOB ==
1. Read 1–3 representative changed files to confirm the diff matches
   the description. Pick the largest changes from the diff_stat.
2. Decide:
   - PASS    — the iteration roughly matched the plan. The diff
               touches the right paths; the description is addressed;
               the cursor advance is consistent.
   - FYI     — minor concern that doesn't block. The orchestrator
               records it and continues. Three same-category FYIs in
               a row escalate to BLOCKER on the orchestrator side.
   - BLOCKER — substantive mismatch. Scope creep, missing scope, or
               a structural failure not caught by mechanical halt-
               checks. Halts the loop.
3. Write the JSON output to
   .luca/phases/<active-slug>/audits/orchestrator-verifier.md as
   a single fenced JSON code block. No surrounding prose.

== BUDGET ==
- ≤ 10 Read calls.
- ≤ 1 Bash call (for `git show` of one suspect commit if needed).
- No Writes outside the audit file.
- One paragraph rationale — strict 800-char cap.
```

### 6.5 Halt semantics

- **PASS** continues the loop.
- **FYI** continues the loop AND appends to `recent_fyis`. Three
  same-category FYIs in a row (rolling window of 5, but 3 consecutive)
  escalate the next iteration's pre-flight check #8 to a BLOCKER. This
  is the design's answer to "minor concerns that compound."
- **BLOCKER** halts immediately. The rationale becomes the cursor's
  `halt_reason`. The operator must resolve before the next `/luca`
  invocation.

### 6.6 Token budget

Target: ~5–10k tokens per verification.
- Prompt: ~2k (template + serialized input).
- Tool calls: 1–3 Reads × ~500 tokens each = ~1.5k.
- Output: ~500 tokens (one paragraph + JSON).
- Headroom: ~3k.

Cheap enough to run every iteration; explicitly NOT a full reviewer.
PR review is still the final gate at merge time.

### 6.7 Model routing

Per the existing routing presets in
`src/complexity/__helpers/model-routing.ts`. **Recommendation:**
`ROUTER` preset — fast at TRIVIAL/SIMPLE, balanced at MODERATE+. The
verifier's job is structural judgement, not deep analysis; a balanced
model at CRITICAL avoids missing nuance, but TRIVIAL increments
shouldn't pay opus rates.

This is one of the open questions — see §10 Q3.

---

## 7. Telemetry design

### 7.1 Per-event JSONL — new event kinds

The existing `TelemetryKind` union is intentionally open (`string &
{}`), so adding kinds is non-breaking. New kinds the orchestrator
emits:

| Kind | Emitted when | Required `meta` fields |
| --- | --- | --- |
| `orchestrator.iteration.start` | §5.1.5 (worker spawn) | `increment_id`, `worker_kind`, `worker_id?`, `phase`, `step` |
| `orchestrator.iteration.end` | §5.1.9 (advance or FYI) | `increment_id`, `verdict`, `commits_count`, `files_touched`, `duration_ms`, `worker_kind` |
| `orchestrator.verifier.verdict` | §5.1.7 (always; carries verdict + rationale) | `increment_id`, `verdict`, `rationale_hash`, `issue_count`, `issues[].kind` |
| `orchestrator.halt` | §5.1.7 or §5.1.8 (any HALTED transition) | `increment_id`, `halt_reason`, `halt_source` (`verifier` \| `pre-flight` \| `post-flight`) |
| `orchestrator.manifest.complete` | §5.1.10 (manifest exhausted) | `manifest_id`, `iterations_completed`, `iterations_halted`, `total_duration_ms` |
| `orchestrator.cursor.transition` | Every bridge `orchestrator transition` call | `from_status`, `to_status`, `event` |

All carry the standard `v:1` envelope: `ts`, `runId`, `phase`, `slug`,
`wave`, `complexity`, `oversight`, `durationMs`, `meta`. `phase` is set
to the increment's `phase` field; `slug` is the active phase slug if
one exists.

**Idempotency (kill-anytime durability):** every orchestrator-emitted
event carries `meta.iteration_run_id` (the ULID minted at §5.1.b).
JSONL is append-only and a kill-mid-emit may result in a duplicate
event on resume; the cross-run aggregator (`luca-telemetry-report`
and any future sibling) MUST de-duplicate by
`(runId, iteration_run_id, kind)` rather than by raw position. This
keeps the JSONL write path itself simple (no journaling, no rewrite)
while still presenting a clean per-iteration view to readers.

New kinds added by §5b for lock observability:

| Kind | Emitted when | Required `meta` fields |
| --- | --- | --- |
| `orchestrator.lock.acquired` | §5.1.c after successful create | `pid`, `iteration_run_id` |
| `orchestrator.lock.refused` | §5.1.c when lock held by live PID | `held_by_pid`, `held_by_run_id`, `held_acquired_at` |
| `orchestrator.lock.stale` | §5.1.c when lock auto-cleared | `prev_pid`, `prev_run_id`, `prev_acquired_at` |
| `orchestrator.lock.force-unlocked` | `force-unlock` CLI invocation | `prev_pid`, `prev_run_id`, `forced_by` |

### 7.2 Per-iteration MuninnDB engram

One engram per iteration, written at §5.1.9.

- **Vault routing:** repo vault. `metric:*` is on the repo-vault
  routing list per the vault-routing rule, since per-project process
  metrics are scoped.
- **Concept:** `metric:luca-iteration-<run_id>-<iteration_index>`.
  E.g. `metric:luca-iteration-01KW7Y…-7`.
- **Idempotency key:** pass `op_id: <iteration_run_id>` on the
  `muninn_remember` call (per MuninnDB's standard op-id semantics).
  Multiple writes for the same iteration — which happen any time a
  `/clear` killed the orchestrator AFTER telemetry but BEFORE the
  cursor advance — return the same engram ID. This is what makes the
  resume protocol's §5a `telemetry_written → cursor_advancing` re-run
  safe.
- **Tags / entities:** `increment_id`, `phase`, `worker_kind`,
  `verdict`. `entities[]` per MuninnDB semantics; the iteration
  engram links to the prior iteration via `muninn_link` so a chain
  emerges naturally per run.
- **Content shape** (markdown body):

```markdown
# Iteration <n> — <increment_id>

- run_id: <run_id>
- manifest_id: <manifest_id>
- phase: <phase>
- step: <step>
- started_at: <ISO>
- ended_at: <ISO>
- duration_ms: <ms>
- worker_kind: <phase-run | subagent | general-purpose>
- worker_id: <id, if applicable>
- verdict: <PASS | FYI | BLOCKER>
- halt_reason: <string or empty>
- commits: [<sha-1>, <sha-2>, …]
- files_touched: <n>
- deletions: <n>
- verifier_rationale_hash: <sha256 of rationale>
- fyi_categories: [<kind>, …]
```

The rationale itself is NOT stored in the engram (token cost; the
JSONL has it). Only the hash, for deduplication across runs.

### 7.3 Cross-run query patterns enabled

Five useful queries the summary engrams support:

1. **Halt rate by phase.**
   `mcp__muninn__muninn_recall(vault: <repo>, context: "metric:luca-
   iteration verdict BLOCKER phase D", mode: "semantic")` →
   percentage of iterations that halted in Phase D over the last N
   runs. Surfaces phases that need plan refinement.

2. **Average iteration duration trend.**
   Recall all `metric:luca-iteration-*` engrams in date range, group
   by phase, average `duration_ms`. Reveals when a phase is getting
   slower run-over-run (a signal that the codebase is outgrowing the
   manifest's per-step scope).

3. **FYI category drift.**
   Recall the last 30 days of iterations, group by
   `fyi_categories[]`. Surfaces recurring concerns (e.g. "scope-creep
   is up 40% in Phase F") that justify a plan rewrite.

4. **Worker mix per milestone.**
   Recall all iterations under one `manifest_id`, group by
   `worker_kind`. Useful when deciding the next preset's worker
   distribution.

5. **Re-iteration chains.**
   Follow `muninn_link` edges from one iteration to the next; identify
   chains that ended in `BLOCKER` vs. ones that reached `COMPLETE`.
   Feeds the next manifest's expected difficulty heuristic.

### 7.4 `luca-telemetry-report` interaction

Today, `/luca-telemetry-report` aggregates JSONL only and is read-only
over `.luca/telemetry/`. After this design lands, it gains two things
**without changing its scope-guard**:

- New JSONL kinds (§7.1) are recognized and bucketed in the report's
  output sections (`Orchestrator iterations`, `Orchestrator halts`,
  `Verifier verdicts`).
- A new optional argument `--orchestrator-only` filters to events
  with `meta.scope: "orchestrator"` (or `kind` starting with
  `orchestrator.`).

The MuninnDB summary engrams are NOT consumed by
`/luca-telemetry-report` — that skill remains read-only over the
telemetry dir. A separate cross-run report skill (out of scope for
this design) would query the engrams. Surfaced as Q9 in §10.

---

## 8. Halt taxonomy

Twelve halt conditions. The first eight come from the prototype; #9 is
new from the first design pass; #10-#12 are new from this second pass.

| # | Halt | Detection | PushNotification template | Resume procedure |
| --- | --- | --- | --- | --- |
| 1 | Pre-flight environment fault | Wrong branch / dirty modifications / missing bun (§5.1.b table #1, #6) | `"luca orchestrator halted: environment fault (<detail>). See state.json orchestration.halt_reason."` | Operator fixes branch/cleans tree; re-fires `/luca`. |
| 2 | Cursor halt_reason non-empty (prior halt) | §5.1.b table #2 | `"luca orchestrator resuming halted state: <reason>. Run `luca-bridge orchestrator transition --event=CLEAR_HALT` to retry."` | Operator inspects, calls `CLEAR_HALT`, re-fires. |
| 3 | Manifest exhausted / terminal boundary | §5.1.b table #3, #5 | `"luca orchestrator complete: manifest <id> finished after <n> iterations (<m> halted)."` | None — clean exit. |
| 4 | Worker silent failure | §5.1.g table #1 (no commits, no halt marker) | `"luca orchestrator halted at <increment>: worker returned with no diff and no halt marker."` | Operator investigates worker logs; re-fires after fix. |
| 5 | Missing cursor advance | §5.1.g table #2 | `"luca orchestrator halted at <increment>: worker did not advance cursor."` | Operator inspects state.json + memory; re-fires. |
| 6 | Unauthorized deletion | §5.1.g table #3 | `"luca orchestrator halted at <increment>: worker deleted <paths> outside authorized_deletions."` | Operator triages — typically revert and re-fire with a refined whitelist. |
| 7 | Repeated tsc fail | §5.1.g table #4 (hash repeats two iterations) | `"luca orchestrator halted at <increment>: tsc failure hash <h> repeated twice."` | Operator fixes tsc; re-fires. |
| 8 | Cursor points at unknown increment | §5.1.b table #4 | `"luca orchestrator halted: cursor points at <phase>-<step> which is not a defined increment."` | Operator reconciles cursor (typically via `set-increment`); re-fires. |
| 9 | **Verifier BLOCKER** | §5.1.f / §5.1.g | `"luca orchestrator halted at <increment>: verifier verdict BLOCKER. Rationale: <one-line>."` | Operator reads verifier audit; either accepts and adjusts the manifest, or fixes the worker output and re-fires. |
| 10 | **Reconciliation needed** | §5.1.e classification: ≥1 matching commit but no doc-update / terminal commit | `"luca orchestrator halted at <increment>: worker produced partial commits (<n>) but did not finalize. Git reconciliation could not confirm completion."` | Operator inspects the partial commits, either finalizes manually + `CLEAR_HALT`, or reverts + `CLEAR_HALT` + re-fires for a clean retry. |
| 11 | **Stale lock cleared** | §5b.2 (lock present with dead PID) | *(Not a halt — logged + telemetry only; auto-recovers and continues.)* | None — automatic. The previous run is implicitly abandoned; the cursor's `iteration_state` is whatever it was, and §5a resumes from that node. |
| 12 | **Cursor inconsistency** | Bridge detects state.json + git/MuninnDB divergence the orchestrator can't auto-resolve (e.g. `cursor.last_completed_commit` doesn't exist in `git log`, or `iteration_state` transition is illegal given the current value) | `"luca orchestrator halted: cursor inconsistency (<detail>). Manual reconciliation required."` | Operator inspects state.json + `luca-bridge orchestrator read-cursor`; uses `set-increment` / `transition --event=CLEAR_HALT` to bring the cursor in line; re-fires. |

Every halt (except #11, which is non-halting by design):
1. Calls `transition --event=HALT` (or the verdict-specific event)
   with the reason in `data`. The bridge sets `iteration_state` to
   `halted` and `status` to `HALTED`.
2. Fires `PushNotification(status: "proactive", message: <template>)`.
3. Emits `kind=orchestrator.halt` telemetry with
   `meta.iteration_run_id` and `meta.halt_kind` (one of the 12 rows
   above).
4. Evolves the iteration-summary engram with `verdict: BLOCKER` and
   the rationale hash.
5. Releases the `.luca/orchestrator.lock` (per §5b.5).

The operator-side `clear-halt` flow: read state.json's orchestration
slice, decide whether the halt is resolvable; if so, call
`luca-bridge orchestrator transition --event=CLEAR_HALT` and re-fire
`/luca`. The orchestration re-enters at the same increment and step.

---

## 9. Migration path from `/restructure-driver`

### 9.0 Durability gap vs the prototype

The `/restructure-driver` prototype tracks state at the granularity of
`iteration_state ∈ {idle, halted, completed}` only — i.e. it captures
the cursor's between-iteration position durably (in the handoff memory
body) but has no checkpoint WITHIN an iteration. If a `/clear` lands
mid-worker today, the next iteration must INFER what happened from
git log and the handoff memory's narrative — a soft-best-effort
reconciliation rather than a typed resume.

The `/luca` orchestrator closes this gap by adding the 12-value
`iteration_state` enum, the `worker_agent_id` reconnect handle, and the
single-flight lock. Everything else from the prototype carries over
unchanged (see §9.1).

### 9.1 What generalizes

These pieces of `/restructure-driver` become `/luca` machinery, unchanged
in spirit:

- The iteration-loop structure (§5).
- The halt taxonomy 1–8 (§8).
- The cursor format — though the storage moves from a MuninnDB body
  block into the typed state.json slice (§4.2) and gains the
  `iteration_state` ledger.
- The "no rollback; halt and surface" stance.
- The 1200-second `/loop` cadence (configurable per preset).
- The PushNotification + memory-evolve cadence on halt.

Explicitly NOT carried over (changed by this design pass):

- **Foreground-sub-agent decision.** Reversed by Decision 5 — workers
  now spawn background to gain kill-anytime resilience. The verifier
  stays foreground. See §5.4.
- **Cursor-as-memory-body.** Replaced by the typed state.json slice.
  The handoff memory keeps the narrative; the cursor moves to
  state.json.

### 9.2 What stays restructure-specific

These pieces become **preset data** rather than `/luca` machinery:

- The 12-row increment manifest (D-1 through G-1).
- The D1–D4 locked design decisions block (currently the prototype
  bakes this into every agent prompt).
- The handoff memory `session:repo-restructure-handoff` and its
  `== DRIVER CURSOR ==` body block. After `/luca` lands, the cursor
  moves into state.json's `orchestration` slice and the handoff memory
  retains only the narrative / decision log.
- The G→H terminal boundary (Phase H is user-only, destructive).

### 9.3 Preset mechanism sketch

```ts
// Sketch — to land in packages/luca-tools/src/orchestrator/presets/.

export const RestructurePreset: OrchestratorPreset = {
  id: 'restructure',
  manifest_id: 'luca-framework-restructure-v13',
  target_branch: 'refactor/repo-restructure',
  repo_vault: 'luca-framework',
  default_complexity: 'COMPLEX',
  wakeup_seconds: 1200,
  // Inline manifest — the prototype's 12 rows expressed as
  // IncrementSchema objects.
  manifest: [
    { id: 'D-1', phase: 'D', step: 1, title: '…',
      worker: { kind: 'general-purpose', prompt_template: '…' },
      source_paths: [], target_paths: ['packages/luca-tools/src/define/'],
      authorized_deletions: [], gate_predicates: [
        'tsc-green', 'commit-on-branch', 'cursor-advanced',
        'authorized-deletions-only',
      ],
      description: '…' },
    // …D-2 through G-1…
  ],
  // Decisions block injected into every worker prompt.
  baked_in_context: `
D1. Subagent porting = RESTORE + IMPROVE.
D2. Audit F1 (confidence schema) = ALIGN THE WRITER.
D3. Audit F4/F5 = PER-ACTION JUDGEMENT.
D4. Halt = PushNotification + handoff-memory update.
  `,
  // Terminal boundary — for the G→H halt.
  terminal_boundary: {
    when: { phase: 'G', last_completed_id: 'G-1' },
    halt_reason: 'Phase G complete — ready for Phase H (user-only).',
  },
}
```

`lucaConfig.orchestrator.preset = "restructure"` selects this preset.
The skill body of `/restructure-driver` becomes one line:

```
Skill(skill: "luca", args: "--preset=restructure")
```

### 9.4 Timing — non-blocking

This migration is a **future-effort scope**. The prototype keeps driving
Phase F and G until the user merges the restructure. After merge:

1. Author the `RestructurePreset` (one-time effort, mechanical).
2. Author the `/luca` skill and `orchestrator-verifier` subagent.
3. Author the `OrchestrationCursorSchema` extension to luca-state.
4. Author the bridge subcommands (§4.4).
5. Replace `/restructure-driver` skill body with the one-liner above.
6. After one release window with the preset in place, drop the
   `/restructure-driver` skill entirely.

The work-order is roughly: schema first → bridge second → subagent
third → skill last. Each step lands as one increment under `/luca`
itself, which gives us the meta-pleasing property that `/luca` is
implemented BY `/luca`.

### 9.5 What about non-restructure workflows?

The "roadmap projection" projection (§3.2) is the path for non-preset
workflows. A user with a populated `.luca/roadmap.md` invokes
`/luca` with no preset; the orchestrator projects each roadmap phase
into one increment with `worker: phase-run` and runs the loop. This
is the steady-state usage post-restructure.

---

## 10. Open questions for the user

Numbered. Each item is a real choice this design pass declines to
make on its own.

1. **Increment granularity.** Is the orchestrator's iteration unit always
   sub-phase-sized (like the restructure's D-1, D-2, …), or can a
   single iteration span a whole phase (`/luca` → one `/phase-run`
   call = one increment = a whole roadmap phase)? Both modes work
   under the current design — the question is which is the **default**
   for roadmap-projected manifests. Smaller increments → more
   verifier checkpoints, more halt opportunities. Larger increments →
   fewer cycles, less orchestration overhead.

2. **Worker scheduling — parallelism.** The current loop is strictly
   sequential. For roadmap projections where `target_paths` don't
   conflict between increments, do we want parallel increments? E.g.
   under a CRITICAL milestone, run two `/phase-run` workers
   concurrently in separate git worktrees. This is a substantive
   change — the cursor model assumes one increment in flight at a
   time. Parallelism would require a per-increment status field
   (RUNNING_A, RUNNING_B, …) and a join step.

3. **Verifier model tier.** §6.7 recommends `ROUTER`
   (fast→balanced). Alternatives:
   - `FAST_PROMOTED` — fast across the board, balanced at CRITICAL.
     Cheapest. Risk: missed concerns at MODERATE/COMPLEX.
   - `DEEP_ANALYSIS` — fast→balanced→capable. Most expensive. Likely
     overkill for what is meant to be a high-level structural check.
   The right answer probably depends on the verifier's empirical
   accuracy in the first few weeks — start with `ROUTER`, adjust on
   data.

4. **Oversight-level integration.** Luca has three oversight modes
   (`full-auto`, `checkpoint`, `human-in-loop`). How does the
   orchestrator interact with them?
   - In `full-auto`, the loop self-paces (as today).
   - In `checkpoint`, does the orchestrator pause at each
     `ADVANCED → RUNNING` transition for a user prompt?
   - In `human-in-loop`, does the verifier need human confirmation
     of PASS verdicts?
   Suggesting all three modes apply at the iteration boundary, but
   the user should sanity-check that mapping.

5. **PASS-with-followup verdict.** Should `orchestrator-verifier` have
   a fourth verdict — `PASS-with-followup` — that drafts a new
   increment to address an FYI, appended to the manifest? Mechanically
   feasible (the manifest is read-mostly but mutable). Risk: the
   verifier starts inventing work the user didn't approve. The
   current design rejects this — FYIs accumulate in `recent_fyis`
   and escalate at 3-in-a-row, which forces a human decision rather
   than a robotic backlog growth. But the option is real.

6. **`/luca` name collision.** Does `/luca` collide with the `luca`
   CLI binary from a user-mental-model standpoint? Alternatives:
   `/luca-run`, `/conduct`, `/drive`, `/march`, `/cadence`. The
   author of this design likes `/luca` — it reads as "ask Luca to do
   the thing" — but the user is the final mental-model arbiter.

7. **Deprecation runway for `/lu` → `/phase-run`.** §2.3 sketches "one
   release with both, then drop". Is one release the right window? If
   `/lu` is muscle-memory'd into the user's daily flow, two releases
   may be safer. The deprecation banner cost is near-zero either way.

8. **Manifest storage.** Roadmap-projected manifests are derived; preset
   manifests are inline TypeScript. Should there also be a
   **persisted** manifest format — `.luca/orchestrator-manifest.json`
   — that user-edited workflows can hand-roll without authoring a
   preset? This would close the loop for "I want orchestration but
   I'm not authoring a preset and the roadmap doesn't project
   correctly."

9. **Cross-run report skill.** §7.4 notes that the per-iteration
   engrams are NOT consumed by `/luca-telemetry-report` (which is
   JSONL-only, by contract). Should we author a sibling skill
   `/luca-orchestration-report` that queries the engrams and emits
   the cross-run queries from §7.3? It would have to be allowed to
   read MuninnDB (which `/luca-telemetry-report` is not).

10. **Verifier audit file location.** §6.3 places the verifier output
    at `.luca/phases/<active-slug>/audits/orchestrator-verifier.md`.
    But the orchestrator's verifier is OUT-OF-PIPELINE — it doesn't
    belong to a specific phase. Alternatives:
    `.luca/orchestration/audits/<iteration>.md`, or no file at all
    (verdict only in telemetry + state.json). File-on-disk is good
    for grep-ability, but only if the location is logical.

11. **What if the worker is `/phase-run` and it ALSO halts internally?**
    `/phase-run` has its own halt semantics (the inner verifier failing
    twice, plan-reviewer rejecting twice, etc.). When the inner
    pipeline halts, does the worker return a HALT marker that becomes
    the outer cursor's `halt_reason`, or does the outer
    `orchestrator-verifier` rediscover the halt from the worker's
    final-message tail? The current design says the latter; the
    former might be cleaner with a typed return contract from
    `/phase-run`.

12. **Lock contention.** The orchestrator takes a lock at §5.1.c; the
    inner `/phase-run` also has internal locking (per `state.json`
    `lockPid`/`lockAcquiredAt`). Two locks layered. Is that fine, or
    do we want the orchestrator to be lock-aware and surrender its
    lock to the worker? Defer until §5.1.d worker-kind = phase-run
    actually exists. (Decision 6 makes the orchestrator lock a
    separate file from `lock.json`, which sidesteps file-contention
    but not semantic confusion — two locks remain.)

### New from the second design pass (D5 + D6 driven)

13. **SendMessage to a completed agentId.** What does the harness
    return when you `SendMessage(to: agentId)` to an agent that has
    already finished but whose record hasn't been garbage-collected
    yet? Does it return the final message? An "agent has exited"
    status? An error? The resume protocol (§5.1.e) assumes the
    happy case returns the final message; we need a small probe
    step in the implementation milestone to verify. If the answer
    is "error", the resume protocol falls through to git
    reconciliation immediately — still works, but the `SendMessage`
    path becomes mostly-cosmetic-and-rarely-useful.

14. **agentId addressability lifetime.** How long does the harness
    keep an agentId addressable? Across the same /clear-survived
    session, yes (the prototype already relies on this). Across days?
    Across machine reboots? If the addressability window is "as long
    as the worker process is alive plus a short GC tail", a
    long-running worker — say, a multi-hour `/phase-run` — is
    reachable as long as it runs but unreachable shortly after it
    finishes. The orchestrator's git-reconciliation fallback handles
    "agentId is gone but commits exist". If the window is "session
    only", a user who closes their terminal and reopens it tomorrow
    loses the addressability — every resume becomes a git
    reconciliation. Either way the design works; the difference is
    how often the cheaper `SendMessage` path actually runs.

15. **LUCA_DIR_CONTRACT extension for `.luca/orchestrator.lock`.**
    The current contract in
    `packages/luca-core/src/luca-dir/configs.ts` allowlists
    `.luca/lock.json` as `root.lock` and does NOT allow
    `.luca/orchestrator.lock`. The `LucaArtifactKind` enum and the
    `isValidLucaPath` matcher both need a new kind — proposed name
    `root.orchestrator-lock` — added to keep the new file in-contract.
    Otherwise the stage-gate hook will refuse the write. This is a
    schema change on the critical path of the implementation
    milestone, not a design open question, BUT calling it out here
    so the implementer doesn't trip on it. Risk: low (additive
    schema change).

16. **`--dry-run` flag.** Should the orchestrator support
    `/luca --dry-run` that runs every step EXCEPT the worker spawn
    and the cursor advance? Useful for:
    - Smoke-testing the verifier + telemetry path on a synthetic
      diff (operator stages some changes, runs `--dry-run`, sees
      what the verifier would say).
    - Validating the lock + pre-flight + post-flight checks on a
      real repo state without committing to an iteration.
    Mechanically straightforward — the worker spawn becomes a
    no-op that returns a synthetic "completed" signal; the cursor
    advance becomes a printf-don't-write. Risk: the dry-run state
    machine path diverges from the real one if not carefully kept
    in lock-step. Probably worth it for testability.

17. **`worker_spawning` intermediate state.** The §5a "Invariants"
    note flagged a small race: the orchestrator spawns the Agent
    (gets `agentId`), then transitions to `worker_spawned`. A `/clear`
    between these two operations leaks the worker — the orchestrator
    wakes up at `lock_acquired`, re-spawns, and now TWO background
    workers race to commit. Mitigation: add a `worker_spawning`
    intermediate state, written BEFORE the Agent call. On resume
    from `worker_spawning`, the orchestrator scans recent agentIds
    (if the harness exposes a list) or just lets the leaked worker
    die naturally and re-spawns. The narrow window probably doesn't
    matter in practice, but flagging it for the implementation
    review.

18. **Lock model mismatch — process vs iteration.** §5b uses a
    PID-based file lock to enforce single-flight, but the conceptual
    object being locked is "an iteration in flight", not "a process
    running". An iteration spans many `/luca` invocations (each in
    a fresh process), so a strict PID lock would naively refuse the
    second invocation. The design papers over this by releasing the
    lock on ITERATION_COMPLETED / HALT / COMPLETE, but a kill of
    the orchestrator's process WITHOUT a halt leaves the lock with
    a dead PID — which §5b.2 cleans up automatically. The mismatch
    is contained but real. Alternative: use a `run_id`-based lock
    (no PID), with stale-detection by checking `iteration_started_at
    > N hours ago`. More forgiving across processes, more brittle
    across true-stuck iterations. The current PID-based design is
    fine for v1; flag for revisit if false-positive refusal becomes
    a thing.

19. **Lock storage — file vs lock directory.** §5b.1 sketches
    `mkdir(.luca/orchestrator.lock.dir/)` as an alternative to a
    plain file with `O_EXCL`. The lock directory is more portable
    (POSIX `mkdir` is reliably atomic; `O_EXCL` has historical
    quirks on NFS). But the LUCA_DIR_CONTRACT models root-level
    entries as files, not directories. If we go the directory
    route, the contract needs a new entry type. Recommended: stick
    with the file; Bun on macOS/Linux/Windows is well-behaved with
    `O_EXCL`.

20. **Verifier idempotency on re-spawn.** §5a says the verifier is
    "idempotent on input" — same cursor + same git diff → same
    verdict. But the verifier reads 1-3 representative files; if
    the worker amended a commit between the first verifier attempt
    and the resume (it shouldn't, but…), the verifier sees a
    different file body. Model nondeterminism aside, this could
    produce a different verdict on resume. Probably fine — the
    re-spawn case is rare and the verifier's output is advisory
    plus the structural halt-checks are the real gate — but flag
    it.

---

## Appendix A — Cross-references

- Prototype: `~/.claude/skills/restructure-driver/SKILL.md`.
- Worker (current `/lu`): `packages/luca-framework/.claude/skills/lu/SKILL.md`.
- Existing state machine: `packages/luca-core/src/state/schemas.ts`,
  `packages/luca-core/src/state/configs/pipeline-transitions.ts`.
- Existing telemetry: `packages/luca-core/src/telemetry/`.
- Bridge implementation: `packages/luca-cli/src/commands/write-surface/state.ts`
  (and siblings).
- Subagent factories: `packages/luca-tools/src/define/subagent.ts`.
- Subagent registry: `packages/luca-tools/src/artifacts/subagents/index.ts`.
- Cross-run reader skill: `~/.claude/skills/luca-telemetry-report/SKILL.md`.
- The active work driving the prototype:
  `docs/repo-restructure-plan.md` §6 and §10.

## Appendix B — Locked decisions (verbatim)

These are the six decisions the design pass treats as given (D1–D4
from the first pass; D5–D6 from the second). They are NOT re-debated
in this doc.

> **D1 — Layering + naming swap.**
> The new top-level orchestrator skill is named `/luca`. The CURRENT
> `/lu` skill (which today runs the full single-task pipeline —
> triage→research→architect→execute→review→finalize) gets RENAMED to
> `/phase-run`. `/luca` LAYERS ABOVE `/phase-run`. The orchestrator's
> main loop is: for each increment in the roadmap → spawn the
> appropriate worker (often `/phase-run` for a full pipeline cycle,
> sometimes a focused sub-agent for a smaller increment) → verify →
> advance cursor → telemetry → next. `/restructure-driver` becomes a
> thin alias / preset of `/luca` for the current restructure work,
> then retires post-merge.

> **D2 — `orchestrator-verifier` subagent gates each iteration.**
> Distinct from the existing `verifier` (which is goal-backward +
> checks-fix-loop, in-phase). Inputs: the increment's described scope
> from the cursor + the worker's git diff + the cursor advancement +
> any HALT marker. Outputs: PASS / BLOCKER / FYI plus a one-paragraph
> rationale. The orchestrator halts the loop on BLOCKER. FYIs are
> recorded in telemetry; PASS continues the loop. Verification is
> HIGH-LEVEL — "did this iteration roughly match the plan?" — not
> line-by-line review. PR review is the final gate.

> **D3 — Telemetry: both per-run JSONL + MuninnDB summary.**
> Keep `.luca/telemetry/<runId>.jsonl` for raw events (existing
> contract — `luca telemetry emit` already writes this). ALSO emit a
> summarized engram per iteration into the repo vault (concept like
> `metric:orchestrator-iteration-<runId>-<n>` or
> `metric:luca-iteration-<runId>-<n>` — pick the most natural
> concept-prefix per the vault-routing rule). Engram carries: phase,
> step, started_at, ended_at, duration_ms, halt_reason, files_touched
> count, commit shas, worker subagent name, verifier verdict, FYI
> list. JSONL is ephemeral detail per-run. MuninnDB engrams are
> persistent for cross-run learning.

> **D4 — Extend the luca-core typed state machine for the
> orchestration cursor.**
> Add an `orchestration` slice to the existing typed state machine
> (`packages/luca-core/src/state/`). Expose via the existing
> `luca-bridge` CLI — new commands like `luca-bridge orchestrator
> read-cursor`, `set-cursor`, `transition --event=...`. Cursor schema
> is the TYPED source of truth (Zod-validated, legal-transition
> table). MuninnDB still holds the SEMANTIC handoff memory (the
> narrative). The bridge owns the cursor; MuninnDB owns the story.

> **D5 — Worker process model = BACKGROUND + agentId reconnect.**
> Worker subagents (the ones doing the actual increment work) run
> with `run_in_background: true`. They SURVIVE a `/clear` of the
> orchestrator's session because they're separate harness processes.
> The orchestrator stores the worker's agentId in the cursor when it
> spawns. On every `/luca` invocation, the orchestrator checks if
> there's an in-flight worker (`cursor.worker_agent_id` is non-empty
> and `iteration_state` is `worker_spawned`). If yes, it RECONNECTS
> via `SendMessage(to: agentId, ...)` to ping for status / fetch the
> final result. Dead-agent detection: if `SendMessage` fails (agentId
> gone, GC'd, whatever), fall back to git reconciliation per the
> worker's known commit pattern. The verifier subagent
> (`orchestrator-verifier`) STAYS FOREGROUND — it's short, stateless
> on input, and we want the verdict before the cursor advances.

> **D6 — Concurrency = SINGLE-FLIGHT via lock.**
> Only ONE `/luca` iteration runs per repo at a time. Lock file at
> `.luca/orchestrator.lock` (distinct from the existing
> `.luca/lock.json`, which is the inner-pipeline crash-recovery
> lock). Lock contents: `{ pid, acquired_at, run_id, host? }`.
> Second invocation while locked: REFUSE with a clear message; don't
> wait. The user can manually delete the lock if they're sure it's
> stale (with a documented `luca-bridge orchestrator force-unlock`
> CLI).

— End of design pass. Implementation lands incrementally per §9.4.
