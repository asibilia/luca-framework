# Execution Summary: 04-outcome-kpi-persistence (CAPSTONE)

**Status:** Complete (2 waves, 6 tasks). `bunx --bun tsc --noEmit` exit 0. New tests green (outcome-kpi 8/8, telemetry-cli 2/2, finalize 6/6; record-recall regression 10/10). Staged-only (EXECUTING blocks commits).

REQ-14 — persist complexity-bucketed outcome KPIs as `metric:*` at milestone close. FULL scope (gate redirect): all 4 KPIs instrumented. Deterministic compute (tested pure fn behind a read-only CLI verb) + LLM-orchestrated MCP persist (finalize body) + producer-side telemetry stamping. No schema `v` bump, no muninn_feedback, no luca-mastracode `.md` edits.

## Waves

| Wave | Tasks | What it built |
|------|-------|---------------|
| 1 | 1.1.1–1.1.3 | **1.1.1** pure `computeOutcomeKpis({cwd,roadmap})` in `luca-core/telemetry/outcome-kpi.ts` (barrel-exported) → per-complexity `{ lowConfidenceRatio, firstPassVerifyRate, meanReworkIterations, reEntryRate, sampleSize }` + top-level `unattributed`; sources confidence.jsonl (low/total), verify.json (lowest-wave status==PASS coarse first-pass), telemetry signal.satisfaction source:outcome (negative@checks/verify → rework; ≥1 negative → re-entry), slug→complexity by stripping `NN-` + matching RoadmapPhase.name; telemetry glob EXCLUDES `pr-outcomes.jsonl`; unattributable → `unattributed` tally. **1.1.2** `outcome-kpi.test.ts` synthetic fixture (≥2 buckets, NN-foo=SIMPLE, STALLED lowest-wave, slug:null record, pr-outcomes exclusion) — 8 pass. **1.1.3** read-only `kpi` leaf under `telemetryCommand.subCommands` (`--json` prints compute output; NO append) + `telemetry.test.ts` (ac-05 registered, ac-06 zero-write via pre/post JSONL line count). |
| 2 | 1.2.1–1.2.3 | **1.2.1** finalize.ts BODY directive (Step 1 Milestone Boundary): run `luca telemetry kpi --json` → `muninn_remember_batch` to `luca-monorepo`, one `metric:outcome-kpi-<version>-<complexity>` per bucket carrying all 4 KPIs. **1.2.2** `finalize.test.ts` body-token test (telemetry kpi, metric:outcome-kpi-, muninn_remember_batch, luca-monorepo, meanReworkIterations, reEntryRate) — 6 pass. **1.2.3** stamped `--slug`/`--complexity` on all 3 `lu/index.ts` signal.satisfaction emit directives (source:outcome line 117, gate-ask 183, oversight-pause 239) + FORWARD-ONLY note. |

## Acceptance (all pass)
- ac-01 lowConfidenceRatio ✓ · ac-02 firstPassVerifyRate (lowest-wave PASS) ✓ · ac-03 NN-foo→SIMPLE ✓ · ac-04 outcome-kpi.test passes ✓ · ac-05 kpi leaf ✓ · ac-06 zero-write ✓ · ac-07 metric:outcome-kpi- in finalize ✓
- ac-09 finalize.test tokens ✓ · ac-10 tsc exit 0 ✓ · ac-11 meanReworkIterations ✓ · ac-12.1 reEntryRate ✓ · ac-12.2 slug:null→unattributed ✓ · ac-13 pr-outcomes excluded ✓ · ac-14 meanReworkIterations in finalize ✓ · ac-15 --slug on 3 emits ✓ · ac-16 --complexity on 3 emits ✓
- anti-01 (no v bump, z.literal(1) intact) ✓ · anti-02 (no muninn_feedback) ✓ · anti-03 (no luca-mastracode .md) ✓
- ac-08.1 / ac-08.2 — TOMBSTONED (superseded by FULL scope per gate redirect)

## Deliverables
- **D1** first-pass verify rate (coarse) → ac-02,04 ✓ · **D2** mean rework iterations → ac-11 ✓ · **D3** re-entry rate → ac-11,12.1 ✓ · **D4** low-confidence ratio → ac-01,04 ✓
- **D5** persist milestone-stamped metric:* (all 4 KPIs) → ac-07,09,14 ✓ · **D6** read-only `luca telemetry kpi --json` → ac-05,06 ✓
- **D7** producer instrumentation (--slug/--complexity stamped) → ac-15,16 ✓ · **D8** unattributed tally → ac-12.2 ✓

## Files changed (staged, not committed)
- `packages/luca-core/src/telemetry/outcome-kpi.ts` (new), `…/telemetry/index.ts` (barrel)
- `packages/luca-core/src/telemetry/outcome-kpi.test.ts` (new)
- `packages/luca-cli/src/commands/telemetry.ts` (kpi leaf), `…/commands/telemetry.test.ts` (new)
- `packages/luca-tools/src/artifacts/modes/finalize.ts` (KPI persist directive), `…/modes/finalize.test.ts` (new)
- `packages/luca-tools/src/artifacts/skills/lu/index.ts` (emit stamping)

## Notes
- **first-pass-verify source:** verify.json is a single per-phase record (no cross-wave verify-history file in the contract) → that record IS the lowest-wave record; non-PASS (FAIL/STALLED) = not-first-pass. Logged as medium/requirement-ambiguous confidence entry.
- **Forward-only attribution:** stamping `--slug`/`--complexity` fixes FUTURE runs only; existing telemetry stays null and is tallied in `unattributed`. Inherent + acceptable (KPIs are forward trends).
- **Materialization:** finalize.ts + lu/index.ts are luca-tools BODY edits → reach `~/.claude/` via `bun run build` + `luca init` re-run (NOT an in-plan task).
- `git add` only; commits deferred to finalize. Phase 1-3 staged changes (schemas.ts, luca-telemetry-report) left untouched — no v:2 bump anywhere.
