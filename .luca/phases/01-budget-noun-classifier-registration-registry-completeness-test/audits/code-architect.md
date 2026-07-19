PERSPECTIVE: architecture

## Verdict

MUST-FIX (REQUEST_CHANGES) — 1 must-fix, 3 should-fix, 4 notes. **[Superseded by Round 2 below: APPROVE.]**

## MUST-FIX

- [MUST-FIX] Registering `start`/`stop` in `LUCA_TOPLEVEL_WRITE` widens the stage gate for pipeline-lock mutation with NO self-enforcement backstop. The entire justification for `luca-write` being allowed in every non-IDLE phase is the invariant documented at `packages/luca-core/src/state/configs/stage-tool-matrix.ts:21-24`: "The `luca` CLI self-enforces each verb's per-step phase precondition (see WRITE_COMMAND_PHASES)". That invariant is false for these nouns: `stopCommand` (`packages/luca-cli/src/commands/runner.ts:52-84`) unconditionally calls `forcePipelineUnlock({ cwd })` (line 69) and unlinks the runner socket — it never consults `WRITE_COMMAND_PHASES` (which has no `start`/`stop` entries — verified against `packages/luca-core/src/state/configs/step-artifacts.ts:77-115`) and has no `runWriteHandler` path. Before this diff, `luca stop` fell through to unknown-command → `bash-mutate`, which the matrix blocks in PLANNING/REVIEWING/FINALIZING (`stage-tool-matrix.ts:55,75,84`). After this diff it classifies `luca-write` and is allowed everywhere non-IDLE — so a subagent in REVIEWING can now delete the pipeline lock mid-run (enabling a concurrent run to race state.json, exactly what `lock.json` exists to prevent) or kill the DAD-P2 daemon out from under the orchestrator. `start` has the same gap plus an operational hazard: it blocks in the foreground until stopped (`runner.ts:30-37`), so an agent invoking it in a gated phase hangs its own turn while holding the pipeline lock.
  File: packages/luca-cli/src/hook/helpers/classify-bash-command.ts:238-239
  Suggestion: Remove `start` and `stop` from `LUCA_TOPLEVEL_WRITE` and add them to the registry test's `DELIBERATELY_UNCLASSIFIED` set with a rationale comment ("daemon lifecycle — must stay conservative bash-mutate; no CLI self-enforcement"), restoring the pre-diff blocked-in-gated-phases behavior. Alternatively, add an explicit pipelineStep precondition inside `stopCommand`/`startCommand` (mirroring the `WRITE_COMMAND_PHASES` self-check in `runWriteHandler`) before keeping them in `LUCA_TOPLEVEL_WRITE`.
  Cross-phase: true

## SHOULD-FIX

- [SHOULD-FIX] `statusline` in `LUCA_TOPLEVEL_WRITE` allows global harness-config mutation in every non-IDLE phase. `luca statusline install` (`packages/luca-cli/src/commands/statusline.ts:39-62`) writes into `~/.claude/` and registers itself in `~/.claude/settings.json` — a mutation of the harness configuration outside the repo, previously blocked in PLANNING/REVIEWING/FINALIZING as `bash-mutate`. It is idempotent and preserves user statuslines, so the blast radius is small, but harness-config writes should not be a routine in-phase agent capability; like `start`/`stop` it has no `WRITE_COMMAND_PHASES` entry and no self-enforcement.
  File: packages/luca-cli/src/hook/helpers/classify-bash-command.ts:237
  Suggestion: Move `statusline` to `DELIBERATELY_UNCLASSIFIED` (conservative bash-mutate fallback — it is a one-time setup command run by humans, not an in-pipeline agent action), or document explicitly why in-phase agent invocation is intended.
  Cross-phase: true

- [SHOULD-FIX] The global `LUCA_READ_VERBS` leak surface (self-documented as G-ARCH-001 at `classify-bash-command.ts:244-248`) grows by three generic names — `summary`, `render`, `gate` — and the new registry test cannot catch the failure mode it creates. The registry tests verify noun/verb *registration completeness* (both drift directions, which is good) but never *disposition correctness*: a future noun registering a mutating verb named `gate`, `summary`, `render`, `read`, or `list` passes all four invariants and silently classifies `bash-readonly`. `gate` is the riskiest addition — "gate" verbs elsewhere in this codebase (budget guard, stage gate) are enforcement actions, and a future mutating `<noun> gate` is plausible. The comment-based mitigation ("check this list whenever adding verbs") is exactly the manual-vigilance pattern this phase's registry test was built to eliminate.
  File: packages/luca-cli/src/hook/helpers/classify-bash-command.ts:249-262
  Suggestion: Make read-verb disposition per-noun instead of global — e.g. change `LUCA_NOUN_VERBS` values to `{ read: Set<string>, write: Set<string> }` (or add a parallel `LUCA_NOUN_READ_VERBS: Record<string, Set<string>>`), and extend the registry test with an invariant that every registered verb appears in exactly one disposition set for its noun. This structurally deletes the cross-noun leak class instead of documenting it.
  Cross-phase: false

- [SHOULD-FIX] The three exported classifier registries and `CLI_SUBCOMMANDS` are mutable at their exported types (`Set`, plain `Record`). They are exported solely for the registry test (verified: `packages/luca-cli/src/index.ts:8-14` does not re-export them, so the public package surface is clean), but a mutable exported `Set` invites accidental runtime mutation by any future internal consumer.
  File: packages/luca-cli/src/hook/helpers/classify-bash-command.ts:216,229,266
  Suggestion: Type the exports as `ReadonlySet<string>` / `Readonly<Record<string, ReadonlySet<string>>>` (and `CLI_SUBCOMMANDS` already gets literal-key inference via `satisfies SubCommandsDef` — add `as const`-style readonly typing is not needed there).
  Cross-phase: false

## Notes

- [NOTE] Disposition spot-checks all verified correct: `budget check` → `luca-write` is right — it performs a genuine `mutateState` write of `runStartedAt` under the state lock (`packages/luca-cli/src/commands/write-surface/budget.ts:144-159`); `graph` → `LUCA_TOPLEVEL_READ` is right — pure stdout render, reads no `.luca/` state (`packages/luca-cli/src/commands/graph.ts:36-48`); `confidence summary`/`render`/`gate` → read-only is right — all three only call `readConfidenceJournal` and print (`confidence.ts:251,274,302`), while `log` (the sole writer, via `runWriteHandler`, `confidence.ts:209`) is correctly excluded from `LUCA_READ_VERBS`; `status` → read is right — socket query + `loadCurrentState`, no writes (`runner.ts:95-120`); `verification read`/`aggregate` contain no write calls.
- [NOTE] Pre-existing (not this diff): `telemetry` sits in `LUCA_TOPLEVEL_READ`, so `luca telemetry emit` (an append to `.luca/telemetry/<runId>.jsonl`) classifies `bash-readonly` in all phases. Presumably deliberate (telemetry must be emittable everywhere), but the new registry test now pins this registration without recording the rationale — worth a comment.
- [NOTE] Registry test design is solid: invariant 2's sorted-array equality catches both drift directions (new unregistered verb AND stale registered verb), invariant 3 catches dead classifier entries, and the anti-04 companion test (`classify-bash-command-registry.test.ts:106-117`) pins `hook`'s deliberate exclusion in both directions. The `resolveCommandDef` thunk resolver correctly tolerates both named-export and `m.default` module shapes (`doctor` uses `m.default`, verified at `cli.ts:36`).
- [NOTE] The `-v`-is-not-`--version` guard (`classify-bash-command.ts:312-316` + test at `classify-bash-command.test.ts:304-315`) closes a real bypass (`luca doctor --fix -v` → read-only); good catch to have pinned it with a `.not.toBe` regression test.

CONSOLIDATED:
  MUST_FIX_COUNT: 1
  SHOULD_FIX_COUNT: 3
  NOTE_COUNT: 4
  CROSS_PHASE_COUNT: 2

## Round 2

VERDICT: APPROVE

### MUST-FIX resolution — VERIFIED RESOLVED

Re-read the fixed sections; the round-1 MUST-FIX is genuinely closed, with evidence:

1. `LUCA_TOPLEVEL_WRITE` (`packages/luca-cli/src/hook/helpers/classify-bash-command.ts:242-250`) now contains only `{init, vault:init, retro, claim-verify, classify, doctor, repair}` — `start`, `stop`, and `statusline` are gone. In `classifyLucaCommand` (lines 333-339) those nouns miss `LUCA_NOUN_VERBS`, `LUCA_TOPLEVEL_READ`, and `LUCA_TOPLEVEL_WRITE`, so the function returns `undefined` and the caller falls through to the unknown-command → `bash-mutate` default — blocked in PLANNING/REVIEWING/FINALIZING per `stage-tool-matrix.ts:55,75,84`. Pre-diff conservative behavior is restored; `luca stop`'s unguarded `forcePipelineUnlock` (`runner.ts:69`) is no longer reachable as `luca-write` in gated phases.
2. The exclusion is pinned bidirectionally: `DELIBERATELY_UNCLASSIFIED` (`classify-bash-command-registry.test.ts:30-41`) is now `{hook, statusline, start, stop}` with per-noun reason comments, and the companion test (lines 119-131) asserts each excluded noun appears in NO classifier set — so re-registration without justification fails the suite. Invariant 1 (lines 73-86) still passes because the four nouns are covered by the exclusion set.
3. The invariant is now written down at the source: the `LUCA_TOPLEVEL_WRITE` comment block (`classify-bash-command.ts:228-241`) states the `luca-write` classification rests on CLI phase self-enforcement, lists the per-noun reasons (`statusline` → `~/.claude/settings.json` rewrite; `stop` → unconditional `forcePipelineUnlock`), and carries the keep-in-sync pointer to the test's set.
4. Behavioral pin flipped: `classify-bash-command.test.ts:342-352` now asserts `luca statusline` → `bash-mutate` with a rationale comment referencing the exclusion block (previously asserted `luca-write`).
5. Independently confirmed the exclusion breaks no pipeline flow: grep across `packages/` shows no luca-tools instruction body invokes `luca start|stop|statusline` — only changelogs, code comments, and `doctor` fix-hint strings (`statusline-registered.ts:162,180`). The "harness/user-invoked, never called from instruction bodies" claim in the comment is accurate.

### SHOULD-FIX dispositions

- ReadonlySet typing — **RESOLVED**: `LUCA_TOPLEVEL_READ: ReadonlySet<string>` (line 216), `LUCA_TOPLEVEL_WRITE: ReadonlySet<string>` (line 242), `LUCA_NOUN_VERBS: Readonly<Record<string, ReadonlySet<string>>>` (line 276).
- `statusline` gate-widening — **RESOLVED** (folded into the MUST-FIX fix; verified above).
- Per-noun READ_VERBS disposition (G-ARCH-001) — **NOT implemented; ACCEPTABLE RESIDUAL, non-blocking.** Rationale: (a) no *current* collision exists — re-verified that every verb in `LUCA_READ_VERBS` (`classify-bash-command.ts:259-272`) maps only to genuinely read-only leaves (`confidence.ts:251,274,302`; `verification`/`plan lint`/`pr-review`/`branch guard` all read-only), and the mutating verbs (`log`, `check`, `create`, `diff`, `advance`, …) are all excluded; (b) the leak requires a FUTURE edit to `LUCA_NOUN_VERBS`, and invariant 2's set-equality forces that edit to happen in this exact file, directly adjacent to the G-ARCH-001 warning comment (lines 254-258) — the hazard is latent and co-located with its warning, not silent; (c) the fix is a design restructure of the registry shape, out of proportion for a convergence fix wave. Keep as an open SHOULD-FIX for a future phase.

### New findings (Round 2 diff only)

No new MUST-FIX. Two notes:

- [NOTE] Invariant 4 (pairwise disjointness, `classify-bash-command-registry.test.ts:133-155`) is a sound addition and its rationale is accurate — verified against `classifyLucaCommand`'s resolution order (noun lookup at line 333 precedes the top-level fallbacks at 337-338), so dual membership would indeed make the later entry silently dead. The sorted-overlap assertion names offenders on failure. Good.
- [NOTE] Residual inconsistency in the now-explicit invariant: the exclusion rationale ("no CLI phase self-enforcement → must not be `luca-write`") also describes several *remaining* `LUCA_TOPLEVEL_WRITE` members — `doctor --fix`, `repair`, `init` are standalone commands with no `WRITE_COMMAND_PHASES` entries either (`step-artifacts.ts:77-115` lists none of them). These registrations pre-date this phase and blocking `luca repair` in gated phases was the original motivation for the set, so this is out of scope for this diff — but the comment at `classify-bash-command.ts:224-227` ("each command self-enforces its own preconditions") overstates the guarantee for the members that remain. Worth reconciling when the per-noun disposition redesign lands.

CONSOLIDATED (Round 2):
  MUST_FIX_COUNT: 0
  SHOULD_FIX_COUNT: 1 (residual: per-noun READ_VERBS disposition — accepted, non-blocking)
  NOTE_COUNT: 2
  CROSS_PHASE_COUNT: 0
