---
id: dad-p2-runner-poc
title: DAD-P2 — Persistent runner (luca start) thin POC (GATED)
trace_id: DAD-P2
complexity: COMPLEX
waves:
  - wave: 1
    tasks: [t1]
  - wave: 2
    tasks: [t2, t3]
  - wave: 3
    tasks: [t4]
  - wave: 4
    tasks: [t5]
---

# DAD-P2 — Persistent Runner (`luca start`) Thin POC — GATED go/no-go

Goal: a THIN, ADDITIVE POC that holds `createActor(pipelineMachine)` on a per-repo unix socket for one run and routes one command daemon-if-up/cold-if-down — to empirically settle 5 acceptance tests and produce an explicit **go/no-go** decision. **Stopping at Phase 1 is an allowed, spec-endorsed outcome if the operational edges prove fiddly.** Research: Muninn `research:dad-p2-runner-poc`. Locked: the daemon holds the actor as a re-derivable MIRROR but routes the WRITE through the existing `decideAdvance`+`mutateState` (byte-identical `state.json`); socket at `.luca/tmp/runner.sock` (gitignored, no contract change); `Bun.listen` raw JSON; no snapshot persistence.

## Tasks

### Wave 1 — Actor handle (luca-core)
- **t1 — Opaque actor handle.** In luca-core, export `createPipelineActorHandle(step): { send(to): void; contextSnapshot(): object; stop(): void }` — an OPAQUE wrapper over `createActor(pipelineMachine).start()` seeded via `resolveState({value: STEP_TO_STATE_VALUE[step]})`, so xstate never leaks into luca-cli. Add a guardrail test asserting the machine has ONLY `assign` actions (a future non-`assign` `entry` would diverge the actor path from the cold `transition()` path).
  Verification: ac-01, ac-11, anti-03

### Wave 2 — Runner + client routing (luca-cli)
- **t2 — `luca start` / `stop` / `status`.** New citty verbs in luca-cli (registered in `cli.ts`). `start`: spawn a resident Bun process — `rm` a stale `.luca/tmp/runner.sock` (guarded by PID-liveness so it never unlinks a live daemon), `Bun.listen({unix})`, acquire `.luca/lock.json` via `pipeline-lock.acquire({runId})`, hold `createPipelineActorHandle(currentStep)`. On a socket `{cmd:'advance', to, session_id}` request: call the EXISTING `lucaStateAdvanceTool.handler` (decideAdvance+mutateState) for the write, `handle.send(to)` to mirror, respond with the result. `stop`: `handle.stop()` + `release()` + a `forceUnlock` sweep. `status`: report the actor context + persisted step. The daemon does NOT spawn agents; does NOT hold `state.json.lock` across requests; the actor NEVER writes `state.json`.
  Verification: ac-02, ac-03, anti-02, anti-04, anti-05
- **t3 — Daemon-if-up / cold-if-down client routing.** In the `luca state advance` client path, probe `.luca/tmp/runner.sock` via `Bun.connect` with a short timeout; if reachable, route the advance over the socket; on `ENOENT`/`ECONNREFUSED`/timeout, fall through to the UNCHANGED `lucaStateAdvanceTool.handler` (cold path). Purely additive — cold is the default. The socket route is reached ONLY inside `luca state advance` (so the PreToolUse hook still stamps `ownerSessionId` on the command); no bypassing raw client.
  Verification: ac-04, anti-01, anti-06, anti-07

### Wave 3 — The 5 acceptance tests
- **t4 — POC acceptance tests** (Design/02 §7). (1 parity) daemon-up and daemon-down produce byte-identical `state.json` for the same event sequence. (2 degradation) `kill -9` the daemon mid-run → the next advance succeeds via the cold path, exit 0, no error surfaced. (3 governance) `ownerSessionId` bystander exemption is identical daemon-vs-cold (hook-driven). (4 lock hygiene) `luca stop` removes `.luca/lock.json`; after `kill -9`, a cold advance still exits 0 AND `forceUnlock` reaps the stale dead-PID `.luca/lock.json` so a fresh `luca start` re-acquires. (5 latency) daemon advance p95 (≥20 samples post-warmup) ≤ cold p95 + 15ms. Tests 2/4b/5 are POSIX-only runtime spikes feeding the go/no-go — a miss is a NO-GO input, not a hard blocker.
  Verification: ac-05, ac-06, ac-07, ac-08, ac-09.1, ac-09.2, ac-10

### Wave 4 — Gate + go/no-go decision
- **t5 — Gate + explicit decision.** `bunx --bun tsc --noEmit` exit 0; `bun test packages/luca-core` green; the acceptance tests run. Confirm `context` is JSON-serializable (persistence caveat) and NO actor snapshot is persisted. Document in the go/no-go caveats that the mirror actor tracks POSITION only (re-seeded from `state.json.pipelineStep`); the fix-loop counters remain authoritative in `state.json` (written by `mutateState`), so `luca status` reports counters from `state.json`, not the mirror context. Write an explicit **go/no-go decision** to `execute/summary.md`: PASS-CLEANLY (all 5 tests green, no red flags) → recommend proceeding to a full runner; else NO-GO → stop at Phase 1 (documented, with the specific red flag). Both outcomes are valid.
  Verification: ac-12, ac-13, ac-14, ac-15

## Verification Criteria
- **ac-01**: `createPipelineActorHandle` is exported from luca-core as an opaque handle (luca-cli imports it without importing `xstate`).
- **ac-02**: `luca start` holds `createActor(pipelineMachine)` bound to `.luca/tmp/runner.sock` for the run.
- **ac-03**: `luca start`/`stop`/`status` are registered in `cli.ts`.
- **ac-04**: the state-advance client routes over the socket when the daemon is up, else falls back to `lucaStateAdvanceTool.handler`.
- **ac-05**: test 1 — the same event sequence yields a byte-identical `state.json` whether the daemon is up or down.
- **ac-06**: test 2 (runtime spike) — killing the daemon mid-run leaves the next advance succeeding via the cold path (exit 0, no error text). POSIX-only.
- **ac-07**: test 3 — the `ownerSessionId` bystander exemption is identical daemon-vs-cold.
- **ac-08**: test 4a — `luca stop` removes `.luca/lock.json`.
- **ac-09.1**: test 4b — after `kill -9`, a cold-path advance exits 0 (`state.json.lock` is independent of the daemon lock).
- **ac-09.2**: test 4b — `forceUnlock` reaps the stale dead-PID `.luca/lock.json` so a fresh `luca start` re-acquires it.
- **ac-10**: test 5 (runtime spike) — daemon-path advance p95 (≥20 samples after a warmup call) ≤ cold p95 + 15ms. POSIX-only; may flake under CI load → a miss is a legitimate NO-GO input, not a hard blocker.
- **ac-11**: a test asserts the machine declares only `assign` actions (no non-`assign` entry/exit) — the actor-vs-cold parity guardrail.
- **ac-12**: the machine `context` is JSON-serializable (no functions/actor-refs).
- **ac-13**: an explicit written go/no-go decision exists in `execute/summary.md`.
- **ac-14**: `bunx --bun tsc --noEmit` exits 0.
- **ac-15**: `timeout 120 bun test packages/luca-core` passes (bounded; `tsc --noEmit` is the pipeline gate proper).
- **anti-01**: MUST NOT modify `decideAdvance`, `mutateState`, `machineVerdict`, or the stage-gate hook — `git diff` shows those files unchanged (purely additive).
- **anti-02**: the daemon MUST NOT spawn agents/subagents — it is a state-holder only (`grep` the runner for Task/subagent spawn = 0).
- **anti-03**: the actor MUST NOT write `state.json` — only `mutateState` does (the actor is a mirror).
- **anti-04**: the daemon MUST NOT hold `.luca/state.json.lock` across requests (only per-mutation, via `mutateState`).
- **anti-05**: MUST NOT persist the actor snapshot — the actor is re-seeded from `state.json` on (re)connect.
- **anti-06**: when the daemon is down, the cold path remains the default working advance — the degradation test (ac-06) proves it.
- **anti-07**: the daemon route is entered ONLY from within the `luca state advance` command (so the hook still stamps `ownerSessionId`) — never a raw socket client that bypasses the command.

## Deliverables
- **D1**: (P2.1) runner is a state-holder — `createActor` per run on the socket, spawns no agents → ac-01, ac-02, ac-03, anti-02
- **D2**: (P2.2) the 5 acceptance tests pass, incl. graceful degradation → ac-04, ac-05, ac-06, ac-07, ac-08, ac-09.1, ac-09.2, ac-10, anti-06, anti-07
- **D3**: (P2.3) persistence caveats honored plus an explicit go/no-go decision → ac-11, ac-12, ac-13, anti-03, anti-05
- **D4**: additive-only, gate green → ac-14, ac-15, anti-01, anti-04

## Notes / Decisions (locked from research)
- The daemon reuses the cold `decideAdvance`+`mutateState` write path → `state.json` parity is code-identity, not re-implementation. The actor is an introspection mirror, re-derivable from `state.json`.
- Socket at `.luca/tmp/runner.sock` (gitignored, created by `Bun.listen` not a Write tool → no `.luca/` contract violation).
- Governance (test 3) is near-free: `ownerSessionId` lives in the daemon-independent PreToolUse hook.
- **NO-GO is a legitimate outcome.** Red flags: stale-socket/`EADDRINUSE` flakiness, latency regression, lock races, governance drift. If any make the POC fiddly, the go/no-go stops at Phase 1 (documented).
