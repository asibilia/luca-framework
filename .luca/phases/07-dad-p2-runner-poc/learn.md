# DAD-P2 — Persistent Runner POC — Learnings

Final phase of the "Deterministic Agentic Development" migration. Built a thin
persistent-runner (`luca start`) POC: a Bun unix-socket daemon that holds
`createActor(pipelineMachine)` and passed a GATED go/no-go (decision **GO**).
luca-core 1026/0, tsc 0, runner-acceptance 6/0, latency p95 delta −0.07ms.

---

## pattern: mirror-over-pure-write-path (HIGH)

**Type:** pattern · **Concept:** `pattern:persistent-layer-mirror-over-pure-write-path` · **Confidence:** HIGH

- **Conjectured:** Adding a persistent/daemon layer over an existing stateless write
  path means the daemon becomes a second stateful authority — so you inherit a
  parity burden (daemon-written state must match cold-written state) and a
  persistence burden (the daemon's in-memory state must survive restarts).
- **Refuted by:** `daemon.ts:201-207` — every WRITE is routed through the unchanged
  `lucaStateAdvanceTool.handler` (the same cold handler the CLI already calls); the
  in-memory actor is `.send()`-updated as a position MIRROR **only after** a successful
  write, and is re-seeded from `state.json` on every connect (`daemon.ts:110-113`,
  `actor-handle.ts` `resolveState`). anti-01/03/04/05 confirm the cold path, its write
  fn, and `state.json.lock` are untouched and no snapshot is persisted. Parity test
  (ac-05) is byte-identical because the write is code-identical, not re-implemented.
- **Learned:** To add a persistent/daemon layer over a pure write path WITHOUT a
  parity or persistence burden: route the authoritative WRITE through the existing
  pure function, and hold the stateful in-memory object (actor / cache) purely as a
  **re-derivable MIRROR** re-seeded from the durable store on connect — never as a
  second source of truth. Consequences fall out for free: parity becomes
  code-identity; graceful degradation becomes "fall back to the exact function the
  non-daemon path already calls" (`state.ts:67-84` cold fallthrough); the durable
  store stays sole authority.
- **Criterion now:** Guard it additive-only — assert the cold path + its write fn are
  ABSENT from the changeset (git `--name-status`), the mirror never writes the store,
  and no snapshot is persisted (grep `getPersistedSnapshot`). A test must lock the
  mirror's re-derivability invariant (here: machine declares assign-only actions, no
  entry/exit — `actor-handle.test.ts:53-83`) so the mirror can be rebuilt from the
  store alone.

## pitfall: unix-socket daemon robustness (HIGH)

**Type:** pitfall · **Concept:** `pitfall:unix-socket-daemon-robustness` · **Confidence:** HIGH

Two recurring bugs in a Bun/unix-socket daemon, both surfaced as SHOULD-FIX in review
(`audits/code-review.md:26-54`) and both fixed:

- **Conjectured (a):** A fire-and-forget `void handleRequest(line).then(write)` on a
  socket data handler is fine because the happy path writes a reply.
- **Refuted by (a):** `daemon.ts:228` had no `.catch`. A throwing handler branch (e.g.
  `status` reading a corrupt `state.json`, `loadCurrentState` un-try/caught) rejects the
  promise → no reply is written (client hangs to timeout) AND an unhandledRejection can
  down the daemon.
- **Learned (a):** Always `.catch` a fire-and-forget socket-handler promise and reply
  with an error frame (`daemon.ts:241-252`), so a bad read degrades to a clean
  per-request error instead of a hung client + crashed daemon.

- **Conjectured (b):** Unlinking a stale socket file at startup is safe housekeeping,
  order-independent of lock acquisition.
- **Refuted by (b):** Original code unlinked the stale socket BEFORE `acquirePipelineLock`.
  In a two-`start` race where neither holds the lock at guard time, the lock LOSER still
  unlinks the socket before discovering it can't acquire the lock — orphaning the
  WINNER's live socket (winner listens on an unlinked path; clients get ENOENT and
  silently cold-fall).
- **Learned (b):** Unlink the stale socket only AFTER winning the atomic lock
  (`daemon.ts:81-108`), making the `openSync(wx)`-style atomic lock the sole
  mutual-exclusion gate — the winner then owns both lock and socket.
- **Criterion now:** For any socket daemon: (1) grep that every `.then` on a handler
  promise has a sibling `.catch`; (2) verify the stale-socket unlink is textually AFTER
  lock acquisition. These are one "unix-socket-daemon robustness" class (both are
  "the daemon must stay a crash-free single owner"), kept as one pitfall.

## process: gated POC earns GO by disproof (HIGH)

**Type:** process · **Concept:** `process:gated-poc-go-by-disproving-red-flags` · **Confidence:** HIGH

- **Conjectured:** A go/no-go POC earns GO when the happy path passes (feature works,
  tests green).
- **Refuted by:** The DAD-P2 POC's GO rests on runtime SPIKES that actively sought
  failure modes — stale-socket/EADDRINUSE flakiness, `kill -9` mid-run, latency
  regression, concurrent-start lock races, governance drift (`summary.md:5`,
  `verify.json` ac-06/09/10). GO was recorded as "NO-GO actively sought and none
  materialized on macOS arm64 / Bun 1.3.11" — i.e. earned by disproof, scoped to a
  platform.
- **Learned:** A gated POC earns GO by DISPROVING an enumerated set of operational red
  flags (platform / timing / race), not by the happy path passing. Enumerate the
  failure modes up front, test each as a real runtime spike (spawned processes, real
  `kill -9`, real sockets — not mocks), and document which were sought-and-not-found
  plus the platform scope.
- **Criterion now:** The go/no-go artifact must (1) list the specific red flags sought,
  (2) cite a runtime spike per flag, and (3) record the platform/runtime scope — so a
  later NO-GO on a different platform is an informed re-test, not a contradiction of
  the recorded GO.

---

## Signal Synthesis

Source: orchestrator-injected `<signal-digest>` (satisfaction:outcome + headline events).

- **Recurring failure themes:** None. Single bounded review fix-loop for the two daemon
  SHOULD-FIXes (missing `.catch`, unlink-before-lock); both resolved, no MUST-FIX.
  Zero error fingerprints in verify; convergence resolved.
- **Satisfaction valence trend:** Uniformly positive across all steps (checks / verify /
  review all green). One negative→positive transition at the review step (2 should-fixes
  → fixed), no negative residual.
- **Cross-cutting patterns:** The "mirror over pure write path" architecture is the
  systemic win — it collapsed three would-be burdens (parity, persistence, degradation)
  into "reuse the existing function," which is why the phase stayed additive-only and
  the gate stayed green. Promoted to the pattern above.
