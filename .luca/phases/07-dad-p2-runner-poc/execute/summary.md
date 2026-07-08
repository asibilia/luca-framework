# DAD-P2 — Persistent Runner (`luca start`) Thin POC — Execution Summary

## Decision: GO

All 5 acceptance tests pass cleanly with no red flags. A daemon holds `createActor(pipelineMachine)` as a re-derivable **position MIRROR** while routing every WRITE through the existing `decideAdvance`+`mutateState` cold path, so `state.json` parity is **code-identity**. Degradation is clean, governance is daemon-independent, lock hygiene is correct, and daemon IPC overhead is negligible (p95 delta −0.07ms; threshold +15ms). Recommend proceeding to a full runner (true daemonization, multi-run lifecycle, richer status) **as future work** — Phase 1 remains the shipped core. NO-GO was actively sought (stale-socket/EADDRINUSE flakiness, kill -9 flakiness, latency regression, lock races, governance drift) and none materialized on macOS arm64 / Bun 1.3.11.

## Acceptance test results (`runner-acceptance.test.ts` — 6 pass / 0 fail)

| # | Test | AC | Result | Evidence |
|---|------|----|--------|----------|
| 1 | Parity | ac-05 | PASS | `execute→checks→execute→checks→verify` daemon-up vs daemon-down → byte-identical `state.json`. |
| 2 | Degradation | ac-06 | PASS | `kill -9` mid-run → next advance cold: exit 0, stdout `→ 'execute'`, stderr empty. Stale-socket connect 0ms → unreachable. |
| 3 | Governance | ac-07 | PASS | `handleStageGateHook` identical daemon-up/down; owner `git commit` → block, bystander → allow. |
| 4a | Lock hygiene | ac-08 | PASS | `luca stop` removes `lock.json` + `runner.sock`. |
| 4b | Lock hygiene | ac-09.1/09.2 | PASS | Dead-pid lock lingers, cold advance exit 0; fresh `start` reaps stale lock + re-acquires under new pid. |
| 5 | Latency | ac-10 | PASS | 24 samples / 4 warmup: cold p95 0.95ms, daemon p95 0.89ms, delta −0.07ms (threshold +15ms). |

## AC probes

ac-01..ac-04 ✔; ac-05..ac-10 ✔ (table); ac-11 ✔ (guardrail: only `xstate.assign`, no entry/exit); ac-12 ✔ (JSON-serializable snapshot); ac-13 ✔ (this doc); ac-14 ✔ (`tsc --noEmit` exit 0); ac-15 ✔ (`bun test packages/luca-core` → 1026 pass / 0 fail).

## Anti-criteria (all upheld)

anti-01 protected files (`decideAdvance`/`mutateState`/`machineVerdict`/stage-gate hook) unchanged; anti-02 no agent spawn; anti-03 actor never writes `state.json`; anti-04 no `state.json.lock` held across requests; anti-05 no snapshot persisted; anti-06 cold is default when down; anti-07 socket route only inside `luca state advance`.

## Persistence caveat

Position-only mirror; fix-loop counters authoritative in `state.json` (written by `mutateState`). `luca status` reports counters from `state.json`, not the mirror context (verified: `checksFix=1` after a rework loop; mirror context `{}`). No actor snapshot is persisted — the actor is re-seeded from `state.json.pipelineStep` via `resolveState`, sidestepping the machine-structure-change invalidation caveat.

## Caveats / scope for the full build (not POC blockers)

1. `luca start` is foreground-blocking; production needs true daemonization (detach/supervisor).
2. Single-run / per-repo scope.
3. Runtime spikes (tests 2 / 4b / 5) are POSIX / unix-socket only; validated on macOS arm64 / Bun 1.3.11.

## Gate

`tsc --noEmit` exit 0; `bun test packages/luca-core` 1026 pass / 0 fail; `runner-acceptance.test.ts` 6 pass / 0 fail; `luca rules run` no findings.
