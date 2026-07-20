# Plan Review — Phase 01: resolve stage-gate/finalize contract contradiction

**Iteration:** 2 (FINAL) · **Complexity:** COMPLEX · cold isolation
Trajectory: round 0 → 5 blocking · round 1 → 2 blocking · round 2 → 0 blocking. No churn on settled ground.

```
STATUS: APPROVED
CONVERGENCE: CONVERGED
BLOCKING_COUNT: 0
ADVISORY_COUNT: 5
RECOMMENDATION: approve
```

## Job 1 — the two iteration-1 blockers

**G-SEC-001(a) — RESOLVED.** `SEVERITY` is confirmed module-private at `packages/luca-cli/src/hook/helpers/classify-bash-command.ts:372` (`const SEVERITY: Record<BashCategory, number>`, no `export`). It is now third in Task 1.2.4's export list (`plan.md:92`) with ac-20.3 (`plan.md:186`). Post-export the probe runs: `SEVERITY` is a plain module-scope const, so a named re-export is sufficient. ac-20.3 fails today (binding error) — falsifiable. Task 1.2.1 depends on 1.2.4, so ac-21.x has its import by the time it runs.

**G-SEC-001(b) — RESOLVED, and the map is safe. Every pair was walked.**

Live map (`:372-382`): `bash-readonly:0, luca-write:1, bash-mutate:1, bash-commit:2, denied:3`.
Proposed (`plan.md:59-60`): `bash-readonly:0, bash-stage:1, luca-write:2, bash-mutate:2, bash-commit:3, denied:4`.

The proposed map is an **order-preserving embedding** of the current one — every existing pairwise relation, including the deliberate `luca-write === bash-mutate` tie at `:374-377`, is identical under the new numbering. `SEVERITY`'s sole consumer is `maxCategory` at `:384-386`, which reads only the ordering (`SEVERITY[a] >= SEVERITY[b] ? a : b`), never the magnitudes, and the merge loop at `:792-799` seeds the accumulator at `bash-readonly` and passes it as `a` — so ties keep the first-seen, exactly as the plan states. **No existing classification changes.**

Pairs of specific interest:
- **`bash-readonly` + `luca-write`**: `0 < 2` → `luca-write`, same result as today's `0 < 1`. Unchanged.
- **`bash-readonly` + `bash-stage`**: `0 < 1` → `bash-stage`. Correct — a compound like `git status && git add .` escalates rather than laundering to read-only. `bash-stage` at 1 sits correctly above `bash-readonly`.
- **`bash-stage` + `luca-write`**: `1 < 2` → `luca-write`. `luca-write` is `true` in every non-IDLE phase (`stage-tool-matrix.ts:57, 66, 77, 86`), so `git add . && luca phase advance` becomes allowed in FINALIZING where it is denied today. This is a loosening, but strictly *inside* the phase's stated intent — `git add` is precisely what `bash-stage` is being created to permit in FINALIZING. No path is opened that `bash-stage` alone would not already open.
- **`bash-stage` + `bash-mutate`**: `1 < 2` → `bash-mutate`, pinned by anti-07. The laundering hole is closed.
- Nothing is tightened. Removing `add` from `GIT_MUTATE_SUBCOMMANDS` (`:107`) changes `git add` only in FINALIZING (`bash-mutate:false` → `bash-stage:true`); PLANNING/REVIEWING stay `false`, EXECUTING/IDLE stay `true`.

ac-21.1–21.5 pin all five relations; `bash-readonly < luca-write` follows transitively. anti-09's probe is correct and load-bearing: `luca checks run` → `luca-write` (`:365`, `checks.run` absent from `LUCA_READ_VERBS` at `:259-272`), `rm -f x` → `bash-mutate`, tie → first-seen `luca-write`. A bump-mutate-only renumber flips it. Good guard.

**G-DX-001 — RESOLVED.** `plan.md:73` reads `Dependencies: 1.1.1, 1.2.4`; Task 1.2.4 (`plan.md:90-97`) carries no `Dependencies:` line. Edge correctly inverted, and Wave 2 is annotated sequential at `plan.md:55` (closing G-DX-002).

## Job 2/3 — this round's new edits

No execution-fatal defect found. Each new criterion checked against source:

- **ac-22** (`plan.md:187`) — `is-valid-luca-path.ts:111` reads `'tmp/ contains <kebab-name>.json handoff files or previews/<name>.<ext> only'`. `grep -q 'handoff files or previews'` matches today → criterion fails today. Falsifiable. ✓
- **ac-20.3** — fails today (not exported). ✓
- **ac-21.1 / 21.2** — fail today (`SEVERITY['bash-stage']` undefined; comparison is `NaN`-false even if the import worked). ✓
- **ac-21.3 / 21.4 / 21.5, anti-09** — pass today by construction. Correct: these are *preservation* invariants, and they cannot run at all until 1.2.4 exports `SEVERITY`, so they are not vacuous tripwires — they fail exactly on the mis-renumber they exist to catch.
- **Task 1.2.2 file growth** — `is-valid-luca-path.ts` is a genuine second consumer (`:108`); confirmed via grep that `TMP_FILE_RE` (`constants.ts:38`) has exactly two consumers, both now in the task's file list.
- **Task 1.3.2 growth** — `finalize.ts:286` is live and matches ac-12.1's `draft .{0,4}\.luca/rules` alternative (the intervening `` \` `` is 2 chars). `:22` matches `promotes? .{0,40}to draft`. Both now enumerated. ac-13 (`:159`), ac-12.3 (`:306-308`), ac-14 (`:43`, `:159`, not `:416`) all still fail today.

## Job 4 — execution readiness

The build has a real safety net: `bashCategoryToToolCategory` (`handle-stage-gate-hook.ts:537-553`) is an exhaustive `switch` over `BashCategory` with a declared return type and **no `default`**. Adding `bash-stage` to the union without adding the arm is a `tsc` error, so ac-19 mechanically forces it. Same for the four `Record<ToolCategory, boolean>` literals (`is-tool-allowed.test.ts:22, 43, 65, 86`), both carried by the touching tasks.

No literal reading of any task was found that widens a permission beyond its stated intent.

## ADVISORY (rides into execution)

- **G-DX-003** — Task 1.2.1 (`plan.md:56`) says "Add a `bash-stage` **ToolCategory**", but the executor must add the member to *both* `BashCategory` (`classify-bash-command.ts`) and `ToolCategory` (`stage-tool-matrix.ts:13-25`). Forced by ac-07 + tsc; prose imprecision only.
- **G-SCOPE-004** — `finalize.ts:288` ("Drafts are **not** auto-applied — they are starting templates, not finished rules") is the same false claim as `:22`/`:286` but matches **none** of ac-12.1's three alternatives. Task 1.3.2 doesn't enumerate it. The executor will correct `:22`/`:286` and leave `:288` asserting drafts that are never written. Cosmetic inconsistency, not a permission or build defect.
- **G-SCOPE-005** — After the `TMP_FILE_RE` widening, two more docblocks go stale and no criterion covers them: `classify-write-path.ts:119` and `:124` (both say `.luca/tmp/<kebab-name>.json`), and the hook comment at `handle-stage-gate-hook.ts:420-424`. ac-22 covers only `is-valid-luca-path.ts:111`.
- **G-SEC-002** — Noted for the record, not a change request: `TMP_PATH_PATTERN`'s allow at `handle-stage-gate-hook.ts:425-427` is **unconditional across every `pipelineStep`** (it returns before the `STEP_ARTIFACTS` gate). Widening to `.md` therefore legalizes `.luca/tmp/*.md` writes in *all* steps, not just FINALIZING. Within intent (gitignored, non-artifact, anchored basename with no nesting per anti-05), but it is a broader grant than the plan's prose implies.
- **G-CRIT-004** — anti-05 remains the weak guard flagged in iteration 1 (G-CRIT-002); the sharpened `.luca/tmp/sub/x.md` form at `plan.md:200` is an improvement but still passes both before and after. Acceptable tripwire.

## What the executor should watch

1. In Task 1.2.1, `'add'` must be **removed** from `GIT_MUTATE_SUBCOMMANDS` (`classify-bash-command.ts:107`) — a new `bash-stage` branch placed *after* the `GIT_MUTATE_SUBCOMMANDS.has(sub1)` check at `:490` is unreachable and ac-07 will fail.
2. Model the new branch on the **mutate** branch (`:490-498`), not the commit branch (`:484-489`): the commit branch returns `targetsFromRedirect` only and would silently drop the `lastNonFlag(rest)` target the hook's always-denied path check consumes. anti-08 pins this.
3. Write the `SEVERITY` map wholesale from `plan.md:59-60` rather than incrementally bumping keys — the ordering is only safe as a complete substitution.
