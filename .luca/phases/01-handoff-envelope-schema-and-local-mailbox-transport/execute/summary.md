# Execution Summary — Phase 01: Handoff envelope schema and local mailbox transport

Complexity CRITICAL · 15 tasks · 3 waves · all complete · **uncommitted in worktree**

## What was built

`packages/luca-core/src/handoff/` — the luca-core foundation for cross-repo handoff. An agent
running Luca in repo A can emit a scoped work order to an agent in repo B; B triages it into its own
roadmap. This phase is the schema + transport layer only: no CLI noun, no daemon, no skills.

| Wave | Tasks | Files |
|---|---|---|
| 1 | 1.1.1–1.1.6 | `constants.ts`, `schemas.ts`, `configs/handoff-transitions.ts`, `helpers/generate-envelope-id.ts`, `helpers/mailbox-path-for.ts`, `index.ts` + package.json exports + root barrel |
| 2 | 1.2.1–1.2.7 | `helpers/create-local-mailbox-transport.ts`, `helpers/create-remote-transport.ts`, `helpers/is-auto-acceptable.ts`, barrel extension |
| 3 | 1.3.1–1.3.2 | guard test in `luca-dir/helpers/classify-write-path.test.ts` |

16 `.ts` files under `handoff/`, plus one guard test in `luca-dir/`.

## Gate results

| Criterion | Command | Result |
|---|---|---|
| ac-01 | `bunx --bun tsc --noEmit` | exit 0 |
| ac-02 | `timeout 120 bun test packages/luca-core/src/handoff` | exit 0 — **106 pass / 0 fail**, 206 assertions, 7 files |
| ac-03 | luca-cli subpath import probe (4 symbols) | exit 0 |
| ac-19 | `grep -qF "/.luca/handoff/" …/classify-write-path.test.ts` | exit 0 (**exit 1 at HEAD** — non-vacuous) |
| ac-25 | `timeout 120 bun test …/classify-write-path.test.ts` | exit 0 — 42 pass (was 41) |
| ac-35 | `wx` duplicate rejection, runtime probe | exit 0 — observed `duplicate-id` |
| ac-36 | CAS conflict, runtime probe | exit 0 — second write with a stale token → `conflict` |
| ac-37 | `0o700` mailbox mode, runtime probe | exit 0 — mode `700` |
| ac-38 | corrupt-skip, runtime probe | exit 0 — count 1 with a `not json` sibling present |
| checks | `luca checks run --file .luca/tmp/checks.json` | `passed: true` |
| anti-01..05, 07, 08 | as written in plan | all clean, no matches |
| anti-06 | `grep -rzPn …` | **could not execute** — see caveat below |

ac-35–38 were the four unfakeable runtime probes. The plan shipped them with a `globalThis.__e`
placeholder that was not runnable; the executor fixed them **up** with a real schema-valid envelope
literal, and each probe additionally asserts the *first* operation succeeded, so a silently-failing
`send` cannot make one pass.

## Caveat — anti-06 could not run as written

`grep -rzPn` fails on the subagent's `grep` (BSD, `invalid option -- P`, exit 2). Because the
criterion's pass condition is "returns no matches", a non-executing command would have reported
clean — exactly the always-passes failure mode the review rounds existed to eliminate. The executor
reported this honestly and substituted an equivalent Bun-side scan of the same regex
`/\{[^{}]*?=[^{}=]*?\}\s*=/` across all 16 `handoff/*.ts` files: **0 matches**. The guard's intent
(no defaults in destructuring) is satisfied; the literal command is not portable.

Round 2's plan-review raised this (G-DX-002) and the orchestrator **refuted it** after testing
`grep -P` in its own shell, where it works. The subagents resolve a different `grep`. The refutation
over-generalized from one environment. anti-06 should be rewritten portably — carried to `learn`.

## Deviations (all confidence-logged)

1. **`mailboxDirFor` added** (wave 1, task 1.1.5) — wave 2's transport needs the mailbox directory
   for `mkdir(0o700)` and `list`. Keeping both builders in one module keeps traversal-guarded path
   construction in a single place.
2. **`send(envelope: unknown)`** rather than the `send(env: HandoffEnvelope)` sketch in context.md —
   a typed parameter makes the mandated `send invalid` test untypeable, and the schema parse is the
   real trust boundary.
3. **`chmodSync(dir, 0o700)` after `mkdirSync`** — `mkdirSync`'s mode argument is ignored when
   `~/.luca` already exists, so L4's `0o700` guarantee would have silently not held. Caught by the
   executor while writing ac-37. This is a genuine correctness fix, not a style change.
4. **Extra schema surface** required by the research field table but not spelled out in task text:
   `HandoffCallbackTransport`, `HandoffOutcome`, `HandoffStatusHistoryEntrySchema`, `HandoffFailure`.
   No `reason` members were invented — the union is exactly 8.

## Locked-decision coverage

| Decision | Where it landed |
|---|---|
| L4 mailbox `~/.luca/handoff/` mode 0700, no carve-out | `constants.ts`, `create-local-mailbox-transport.ts`, guard test (ac-19, ac-37) |
| E1 `RemoteTransport` resolves, never throws | `create-remote-transport.ts` (ac-17) |
| E2 flat layout, status in-file | `mailbox-path-for.ts` |
| E4 no lock file, `wx` create | `create-local-mailbox-transport.ts` (ac-35, anti-08) |
| D1 mutate-in-place callback + CAS on `updatedAt` | `updateStatus` (ac-36) |
| D2 allowlist auto-accept, convenience-not-security | `is-auto-acceptable.ts` (ac-18) |
| D3 untrusted free-text fields | schema docstrings (ac-29) |
| G-SEC-001 path-traversal guard | `mailboxPathFor` → `null`; all id-taking methods short-circuit to `not-found` without revealing target existence (ac-32) |

## Blocked

**`git commit` is stage-gate-blocked at `pipelineStep=execute`** (`bash-commit` not allowed in
`EXECUTING`). All three waves reported the same block. The phase-execute skill instructs executors to
commit atomically per task, which the stage-gate forbids at that step — a live contract contradiction
in the framework itself, closely related to the work shipped in HEAD (`be715aa4 fix(core): legalize
finalize writes via bash-stage + release-artifact`). All work is intact in the worktree; the
orchestrator commits from an allowed step. Carried to `learn`.
