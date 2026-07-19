# Research: budget noun classifier registration + registry-completeness test

## Summary

Confirmed the reported gap: `budget` is registered in cli.ts (L95-98) but absent from all three classifier registries in classify-bash-command.ts, so `luca budget check` falls through unknown-command → `bash-mutate` and is stage-gate-blocked in PLANNING, REVIEWING, FINALIZING — exactly where the /lu loop invokes it (`skills/lu/index.ts:103`, `commands/lu.ts:58`). The audit found the gap is NOT unique: `graph`, `statusline`, `start`, `stop`, `status` are also unregistered, and `confidence` has verb-set drift (1 of 5 verbs registered). cli.ts import is side-effect-free (lazy thunks) → export the subCommands map and assert registry coverage in a colocated bun test.

## Dimension 1 — budget command surface

- **HIGH** — `budget` has exactly one verb, `check` (`commands/write-surface/budget.ts:222-224`).
- **HIGH** — `budget check` is NOT purely read-only: lazily stamps `runStartedAt` into `.luca/state.json` via `mutateState` under the state lock when unset (budget.ts:139-159). Always exits 0 (advisory) but performs a genuine state write on first invocation of a run.
- **HIGH** — Correct classification: **`luca-write`** — add `budget: new Set(['check'])` to `LUCA_NOUN_VERBS` (classify-bash-command.ts:248), do NOT add `check` to `LUCA_READ_VERBS` (mirrors the documented `snapshot` precedent at :269-273; a global read-`check` would leak read semantics to future nouns). `luca-write` is allowed in every non-IDLE phase (stage-tool-matrix.ts:48,57,66,77,86) → unblocks all call sites.
- **HIGH** — Broken call sites today: /lu loop step 1a (PLANNING/REVIEWING boundaries); phase-execute §4.5 runs in EXECUTING (bash-mutate allowed) so not actively broken there.
- **HIGH** — Block mechanism verified: classifyLucaCommand returns undefined for unknown noun (:299-305) → fall through (:489-504) → step 9 unknown → bash-mutate (:618-622) → matrix denies in PLANNING/REVIEWING/FINALIZING (stage-tool-matrix.ts:55,75,84).

## Dimension 2 — full registry audit (30 cli.ts nouns)

- **HIGH** — Covered correctly (24): version/telemetry/rules (TOPLEVEL_READ:216); init/vault:init/retro/claim-verify/classify/doctor/repair (TOPLEVEL_WRITE:223-231); state/phase/plan/roadmap/preferences/todo/brain/pr-review/repo/checks/branch/snapshot/workflow/verification (LUCA_NOUN_VERBS:248-274, verb sets verified against write-surface modules).
- **HIGH** — **Missing nouns (6)**: `budget` (cli.ts:95), `graph` (:32), `statusline` (:36), `start`/`stop`/`status` (:42-44, DAD-P2 runner POC). All fall through to bash-mutate. `hook` (:34) is the one DOCUMENTED deliberate omission (classifier comment :221-222).
- **MEDIUM** — Dispositions: `graph` = pure read/report (graph.ts:20-21) → TOPLEVEL_READ. `statusline`/`start`/`stop` → TOPLEVEL_WRITE, `status` → TOPLEVEL_READ (no instruction-body call sites found; registering is safer than excluding).
- **HIGH** — **Verb drift**: `confidence` registers only `log` (:264) but CLI has 5 leaves: log, read, summary, render, gate (confidence.ts:315-321). Not blocked today (unknown-verb conservative path → luca-write) but read-intent invocations in PLANNING (architect.ts:444 `confidence read`/`gate`) and REVIEWING (review.ts:63-64 `summary`/`read`) are misclassified. Fix: register all 5 verbs; `read` already ∈ LUCA_READ_VERBS (:235); recommend adding `summary` + `gate` to LUCA_READ_VERBS (stdout-only reporters, confidence.ts:6-10, gate leaf :281-288); `render` either way.
- **MEDIUM** — Intentional quirk, do NOT "fix": `telemetry` ∈ TOPLEVEL_READ though `emit` appends (deliberate per comment :213-215). Completeness test asserts membership, not read/write correctness, for top-level commands.

## Dimension 3 — completeness-test design

- **HIGH** — **Recommended: import cli.ts** — side-effect-free (imports citty + utils/manifest only; subCommands values are lazy thunks; sole import-time effect is manifest.ts:28 read-only resolveVersion). cli.ts must export the subCommands map (e.g. `CLI_SUBCOMMANDS`) or `main`. Reject static source parse (fragile) and shared NOUN constant (doesn't compose with thunks).
- **HIGH** — The three registry sets are module-private (:216-274) — must be exported for the test.
- **HIGH** — **Verb-level equality check feasible**: awaiting each thunk yields the command def with eagerly-defined subCommands (verified all 16 noun files). Assert registered verb set EQUALS Object.keys(def.subCommands) — equality catches both drift directions (would have caught the confidence drift). No circular imports (classify-bash-command.ts imports only shell-quote; chain test → cli.ts → ... → classify-bash-command.ts acyclic).
- **HIGH** — Placement: new colocated `packages/luca-cli/src/hook/helpers/classify-bash-command-registry.test.ts` (heavier cross-layer imports than the behavioral test). Invariants: (1) every cli.ts noun ∈ keys(LUCA_NOUN_VERBS) ∪ TOPLEVEL_READ ∪ TOPLEVEL_WRITE ∪ explicit commented `DELIBERATELY_UNCLASSIFIED` (⊇ {hook}); (2) per-noun verb-set equality; (3) converse — every registered noun exists in cli.ts (catches dead entries). Plus behavioral cases in the existing test (`luca budget check` → luca-write; `luca confidence read` → bash-readonly).

## Dimension 4 — risk

- **HIGH** — Only `hook` documented as deliberate exclusion; the other 5 read as the same drift class as budget.
- **HIGH** — No circular-import hazard; no .luca/ writes from the test; thunk resolution executes nothing.
- **LOW** — `luca status` vs Windows `start` in READONLY_COMMANDS (:78) — unrelated code path, no conflict; noted so the executor doesn't confuse the two.

## Implications for planning

1. Core fix (1 line): `budget: new Set(['check'])` + comment (runStartedAt stamp justifies luca-write).
2. Scope decision (the completeness test FORCES it): close all 6 gaps + confidence drift, or register only budget and list the rest as documented exclusions. Recommended: fix all — graph→READ, statusline/start/stop→WRITE, status→READ, confidence all 5 verbs (+summary/gate to LUCA_READ_VERBS).
3. Exports: subCommands map from cli.ts; three registry sets from classify-bash-command.ts.
4. Tests: new registry test + behavioral cases in existing test.
5. Gate: `bunx --bun tsc --noEmit`; bounded `timeout 120 bun test <registry test>`.

## Open questions

None requiring the user beyond the scope decision; LUCA_READ_VERBS membership for summary/render/gate is a planner call (all safe either way).
