PERSPECTIVE: correctness + simplification
VERDICT: APPROVE

Scope reviewed: `actor-handle.ts` (+test), `runner/protocol.ts`, `runner/daemon.ts`,
`commands/runner.ts`, `commands/write-surface/state.ts` (routing), `run.ts`, plus the
supporting `pipeline-lock.ts`, `luca-state-advance.ts` handler, `step-artifacts.ts`
(`WRITE_COMMAND_PHASES`), `runner-acceptance.test.ts`. POC constraints (foreground-blocking
`luca start`, single-run) treated as accepted per plan.

FINDINGS:

- [NOTE] Lost-ACK ⇒ spurious error, NOT double-apply (concern 1/2). If the daemon's
  advance write succeeds but the response frame is lost (socket.write throws at
  daemon.ts:225, or the 500ms client timeout fires), `sendRequest` returns `Unreachable`
  and `state.ts:71` falls through to the cold handler, which re-runs `decideAdvance` with
  the SAME `toStep`. Verified this cannot double-apply: `decideAdvance`
  (luca-state-advance.ts:134) delegates to `machineVerdict`, which rejects the retry as an
  illegal/same-step transition from the already-advanced position (forward edges are
  monotonic; the only legal re-target is a documented self-loop like `research→research`,
  which is idempotent for position/counters). Net worst case: a user sees a rejection for
  an advance that actually succeeded. state.json is never advanced twice and the write
  always happens BEFORE the mirror `.send` (daemon.ts:196 then :202), so state.json is
  correct regardless of mirror outcome. Acceptable at-least-once gap for a POC; document
  it so a future daemon adds a request-id/idempotency key.

- [SHOULD-FIX] Missing `.catch` on the daemon dispatch chain (concern 2, robustness).
  File: packages/luca-cli/src/runner/daemon.ts:223
  `void handleRequest(line).then((resp) => …)` has no `.catch`. The `advance` branch swallows
  its own errors (the handler returns `{ isError }` — verified luca-state-advance.ts:220-230),
  but the `status` branch calls `loadCurrentState` (daemon.ts:154) UN-try/caught, and
  `handle.send` (daemon.ts:202) is uncaught. A corrupt/unreadable state.json during a
  `status` request (or any future throwing handler) rejects the promise: no response is
  written (client hangs to timeout, then cold-falls) AND an unhandledRejection can down the
  daemon. In practice `xstate` `.send` won't throw and `status` corruption is rare, so this
  is not a blocker.
  Suggestion: wrap the chain — `.then(write).catch(() => socket.write(JSON.stringify({ ok:false, kind:'error', text:'internal error' })+'\n'))` — or move `loadCurrentState` inside handleRequest's try. This keeps the daemon a clean state-holder that never crashes on a bad read.
  Cross-phase: false

- [SHOULD-FIX] Concurrent `luca start` can unlink the winner's live socket (concern 3).
  File: packages/luca-cli/src/runner/daemon.ts:83-89
  The stale-socket unlink runs BEFORE lock acquisition (line 93). In a two-`start` race
  where neither holds the lock at guard time (both pass the guard at :64-79), the lock
  loser still unlinks the socket at :83 before it discovers (at :93) it cannot acquire the
  lock — orphaning the winner's socket file (winner keeps listening on an unlinked path;
  clients get ENOENT and silently cold-fall). The lock itself is safe: `forceUnlock`
  without runId refuses a live holder (pipeline-lock.ts:273-284), so the winner's lock is
  never clobbered — only its socket file. The normal "second start while one is running"
  case is safe (guard at :64-79 throws before reaching :83, verified). Only the tight
  concurrent-start window is exposed, which the POC declares out of scope, and it degrades
  to the cold path (no state.json corruption).
  Suggestion: move the socket unlink (:83-89) to AFTER a successful `acquirePipelineLock`
  (:93-103), making the atomic `openSync(wx)` lock the sole mutual-exclusion gate — the
  winner then owns both lock and socket.
  Cross-phase: false

- [NOTE] `RunnerRequest.advance.session_id` (protocol.ts:22) is never sent by the client
  (`state.ts:67` sends `{cmd,to}` only) and never read by the daemon — governance is
  hook-driven (test 3 confirms). Dead speculative field; drop it or wire it if a future
  slice needs per-request owner attribution.

- [NOTE] Lock lifecycle (concern 4) verified SAFE. Daemon `cleanup` releases with runId
  and force-reaps with runId (daemon.ts:125-127); `release` is runId-gated
  (pipeline-lock.ts:218-231) and `forceUnlock` path-1 is runId-gated (:267-269).
  `luca stop`'s `forcePipelineUnlock({cwd})` without runId (runner.ts:69) only reaps
  dead-pid/corrupt locks and REFUSES a live holder (:273-284) — cannot reap a different
  live run. Locks + sockets are per-cwd, so multi-repo is naturally isolated. No
  cross-run reaping path exists.

- [NOTE] Actor purity (concern 5) verified SAFE. `contextSnapshot()` returns plain
  `{step, context}` with no xstate refs (actor-handle.ts:75-81); JSON round-trip is
  locked by the ac-12 test (actor-handle.test.ts:110-119). `stop()` delegates to
  `actor.stop()` (idempotent in xstate v5) and every daemon call site wraps it in
  try/catch. On daemon crash the in-memory actor dies with the process (no leak); the
  leftover lock/socket are reaped by the start-guard and `luca stop` (acceptance test 4b
  proves re-acquire under a new pid). The purity guardrail test (actor-handle.test.ts:53-83)
  locks the actor-vs-cold parity invariant (no entry/exit actions; assign-only), which is
  what makes the position mirror sound.

- [NOTE] Simplification (concern 6): protocol/daemon are minimal and each moving part is
  justified (newline framing, `Unreachable` never-throw sentinel, per-connection WeakMap
  buffer for partial frames). Not over-built. `run.ts` (9 lines) is a clean source-level
  spawn seam used by the acceptance suite to run real `luca` processes without a build
  step (CLI const at runner-acceptance.test.ts:44) — it is NOT a duplicate of the built
  bin (which runs `dist/`); it re-exports the single `runMain` from cli.ts. Parity is
  code-identity: the daemon calls `lucaStateAdvanceTool.handler` directly, and
  `WRITE_COMMAND_PHASES['state advance'] = []` (step-artifacts.ts:104) means the cold
  path's `runWriteHandler` phase self-check is a no-op for advance, so bypassing it in the
  daemon introduces no divergence — confirmed by test 1's byte-identical state.json.

CONSOLIDATED:
  MUST_FIX_COUNT: 0
  SHOULD_FIX_COUNT: 2
  NOTE_COUNT: 5
  CROSS_PHASE_COUNT: 0
