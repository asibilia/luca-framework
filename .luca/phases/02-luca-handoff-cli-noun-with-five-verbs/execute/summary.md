# Execution Summary — Phase 02: `luca handoff` CLI noun with five verbs

Complexity CRITICAL · 14 tasks · 3 waves · all complete · **staged, uncommitted**

## What was built

`luca handoff send | list | accept | complete | reject` — the CLI surface that makes phase 1's
foundation reachable. Plus the security fix deferred from phase 1.

| Wave | Tasks | Landed |
|---|---|---|
| 1 | 2.1.1–2.1.7 | `handoff-transport.ts` (`resolveHandoffTransport`, `formatHandoffFailure`), `luca-handoff-{send,list}.ts`, leaf `handoff.ts`, `CLI_SUBCOMMANDS`, `LUCA_NOUN_VERBS`, `WRITE_COMMAND_PHASES`, **`homedir` fail-open closed in `handle-stage-gate-hook.ts`** |
| 2 | 2.2.1–2.2.5 | `luca-handoff-{accept,complete,reject}.ts`, both registries widened `{send,list}` → five atomically |
| 3 | 2.3.1–2.3.2 | write-surface skill docs (registration point 4), full gate run |

All four registration points landed, none straddling a wave boundary.

## Gates

| Gate | Result |
|---|---|
| `bunx --bun tsc --noEmit` | exit 0 |
| `luca checks run` | **33/33 ok**, `passed: true` (8 phase-1 probes kept green + 25 added) |
| `classify-bash-command-registry.test.ts` | 98 pass / 0 fail — all 5 invariants at the five-verb boundary |
| five handler test files | 47 pass / 0 fail |
| `bun run build` | exit 0 |
| anti-01 no test-name filter | 52 criteria lines, 0 violations |
| anti-02 luca-core/handoff untouched | fenced `[]`, control 18 files (fail-closed control fired) |
| anti-03 `~/.luca/handoff` still denied | class `denied` |
| anti-04 exactly five verbs | `["accept","complete","list","reject","send"]` |
| anti-05 no PCRE/null grep | 5 grep criteria, 0 violations |
| `luca rules run` | exit 0 — **vacuous**: 0 rule files discovered, so this carries no signal |

## Two empirical fix-sensitivity observations — the headline of this phase

Both were *observed*, not argued. This is the first phase in the run to prove criteria red-before-green
rather than reasoning about it.

**ac-24 (the security fix), run before implementing task 2.1.6:**
```
pre-fix:   ac-24 decision = allow | exitCode = 0   → EXIT=1  (RED)
post-fix:  ac-24 decision = block | exitCode = 2   → EXIT=0  (GREEN)
```
Pre-fix, an unset `HOME` meant `classifyWritePath` skipped its home-deny step, fell through to class
`code`, and `EXECUTING['code-write'] === true` **allowed** a write to `~/.claude/settings.json`.

**ac-19.3 (parse-before-hop-1), by deliberate mutation:** the executor disabled the pre-hop-1 gate and
re-ran — **3 tests went RED**, including `Expected: "accepted" / Received: "in-progress"`, with the
envelope stranded exactly as the plan predicted and hop 2 then failing `corrupt: result is required`.
Scaffold reverted; `grep -n MUTATE` on the handler exits 1.

## Design decisions realized

- **`complete` drives `accepted → in-progress → complete`** (user-confirmed at the confidence gate).
  `HandoffResultSchema.safeParse` is the handler's **first statement** — before `transport.read` and
  before hop 1 — so an invalid payload changes nothing; refusal text ends `No status was changed.`
  Hop 2's CAS token comes from hop 1's returned envelope. `describeCompleteHopFailure(status)` is
  appended only when hop 1 actually ran. From `in-progress` it is a single hop.
- **`accept` vs `accept --auto`** — bare accept is unconditional human acceptance and reads no
  allowlist at all; `--auto` is refused unless `isAutoAcceptable`, with the allowlist read from
  `ctx.cwd`'s own `.luca/config.json` (fail-closed `[]`). The path taken is recorded in
  `statusHistory.note`.
- **`ctx.homedir` threading** — every handler routes through `resolveHandoffTransport`; no
  `osHomedir()` call exists outside `handoff-transport.ts`. This was a live risk: hard-wiring it would
  have made the test probes write into the developer's **real** `~/.luca/handoff/`.
- **No `--homedir` flag** — the seam is on `ToolContext`, not the input schema, so an agent cannot aim
  a command at another repo's mailbox. ac-30 proves the built CLI rejects it: `unknown flag '--homedir'`.
- **`targetRepo` has no schema default** — a Zod `.default()` cannot see `ctx`, and adding one would
  destroy the "explicitly supplied" signal the mutual-exclusion refusal needs. The `ctx.cwd` fallback
  is applied in the handler *after* the both-flags refusal.

## Deviations (all confidence-logged)

1. **Flat payload shape.** The leaf spreads the parsed `--file` object into rawArgs rather than wrapping
   it as `{ payload }`. Only the flat form makes the `inputSchema` *be* the strip-and-stamp allowlist
   that ac-10/11.1/27 verify. Wave 1 flagged this forward; wave 2's `complete` matched it, with `id`
   spread **after** so a payload key cannot shadow the flag.
2. **Result fields typed `z.unknown()` in `inputSchema`** — deliberately. Typing them there would move
   the refusal into `runWriteHandler`'s schema check and leave the handler unable to make the
   pre-hop-1 guarantee. `HandoffResultSchema` is the real gate.
3. **`origin` sentinels** — `runId: 'unknown-run'`, `phaseSlug: 'unresolved-phase'` when a bare probe
   repo cannot resolve them. Without this, `HandoffOriginSchema`'s `min(1)` requirements would make
   `send` return `corrupt` and silently break six-plus probes. This was plan-review's highest-carry
   advisory.
4. One `as never` cast in a deliberately-invalid-payload test, matching the wave-1 precedent.

## Carried forward to phase 3+

- `remove`/`prune` on `HandoffTransport` — still deferred; adding it is additive for callers but
  breaking for implementers, and phase 5 introduces the second implementer that would bear the cost.
- ISO-8601 timestamp typing and the `list` unreadable-envelope side channel — both still open from
  phase 1's audit.
- `luca rules run` is vacuous in this repo (0 rule files); it should not be counted as a gate.
