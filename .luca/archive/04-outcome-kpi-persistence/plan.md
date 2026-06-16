---
id: 04-outcome-kpi-persistence
title: Outcome KPI Persistence (REQ-14)
wave: 2
tasks: 6
---

# Plan: Outcome KPI Persistence

## Objective
Persist complexity-bucketed OUTCOME KPIs as milestone-stamped `metric:*` memories in repo vault `luca-monorepo` at milestone close, so cross-run trends survive (REQ-14). Compute is a tested pure fn behind a read-only CLI verb; persist is a finalize-body directive.

## Context
- finalize.ts ALREADY writes `metric:*` MCP-direct (Step 2 Shadow Debt Scan, ~line 134, `metric:shadow-debt-scan-<ts>`) — KPI persist follows that in-file pattern; no new role, no CLI→MCP bridge. (Step 1, lines 113-122, writes a `milestone:` session-archive concept — adjacent but not metric:*.)
- Clean per-phase sources: `confidence.jsonl` (getConfidenceSummary → {total,low}) fully bucketable; `verify.json` (per-WAVE record, `status: PASS|FAIL|STALLED`) for COARSE first-pass. slug→complexity via roadmap[].name match (RoadmapPhase has name+complexity, no slug; slug = `NN-name`).
- FULL scope (gate redirect 2026-06-16): mean-rework-iterations + re-entry-rate ALSO computed/persisted per complexity. No per-phase source today → instrument the producer: the `lu` skill body's 3 `signal.satisfaction` emit-sites (lu/index.ts:117 source:outcome, :181 gate-ask, :237 oversight-pause) pass `--run-id`/`--meta` but NOT `--slug`/`--complexity` (∴ all records slug:null/complexity:null). Stamp `--slug`/`--complexity` on them (uses EXISTING nullable telemetry fields — NO schema v bump). No mode-agent emits signal.satisfaction (grep confirmed). FORWARD-ONLY: existing records stay null; KPIs are forward trends — acceptable.
- CLI pattern: `telemetry emit`/`new-run` are plain citty leaves (`telemetry.ts`; `telemetryCommand` registered in cli.ts:29); read-only verb adds a `kpi` leaf under `telemetryCommand.subCommands` in `telemetry.ts` — no cli.ts edit.

## Phases

### Phase 1: KPI Persistence

#### Wave 1: Tracer — compute fn + CLI verb (end-to-end, testable)
- [ ] **Task 1.1.1**: Add pure fn `computeOutcomeKpis({cwd, roadmap})` in luca-core returning per-complexity buckets `{ lowConfidenceRatio, firstPassVerifyRate, meanReworkIterations, reEntryRate, sampleSize }` plus a top-level `unattributed` tally; reads confidence.jsonl + verify.json per phase. first-pass = lowest-`wave` verify.json record with `status == 'PASS'` (non-PASS == not-first-pass). Maps slug→complexity by stripping `NN-` and matching `RoadmapPhase.name`.
  - Files: `packages/luca-core/src/telemetry/outcome-kpi.ts`, `packages/luca-core/src/telemetry/index.ts`
  - Verification: ac-01, ac-02, ac-03, ac-11, ac-12.1, ac-12.2, ac-13
- [ ] **Task 1.1.2**: Unit test the fn over a synthetic fixture: phases (≥2 complexity buckets; a `NN-foo`=SIMPLE phase; a phase whose lowest-wave verify record is STALLED) + a synthetic `.luca/telemetry/<run>.jsonl` of `signal.satisfaction` source:outcome records with slug+complexity populated, one slug:null record, AND a `pr-outcomes.jsonl` file that MUST be excluded. Named describe block, real `bun test`.
  - Files: `packages/luca-core/src/telemetry/outcome-kpi.test.ts`
  - Verification: ac-04
  - Dependencies: 1.1.1
- [ ] **Task 1.1.3**: Add read-only `kpi` leaf under `telemetryCommand.subCommands`; `--json` prints `computeOutcomeKpis(...)` as JSON; reads roadmap from state. No JSONL append.
  - Files: `packages/luca-cli/src/commands/telemetry.ts`
  - Verification: ac-05, ac-06
  - Dependencies: 1.1.1

#### Wave 2: Persist wiring + scope-gap follow-up
- [ ] **Task 1.2.1**: Add finalize.ts BODY directive (Step 1 Milestone Boundary) — run `luca telemetry kpi --json`, then `mcp__muninn__muninn_remember_batch` to `luca-monorepo`, one `metric:outcome-kpi-<version>-<complexity>` per bucket; payload carries all 4 KPIs (lowConfidenceRatio, firstPassVerifyRate, meanReworkIterations, reEntryRate).
  - Files: `packages/luca-tools/src/artifacts/modes/finalize.ts`
  - Verification: ac-07, anti-01, anti-03
  - Dependencies: 1.1.3
- [ ] **Task 1.2.2**: Body-token test asserting finalize instructions contain `telemetry kpi`, `metric:outcome-kpi-`, `muninn_remember_batch`, `luca-monorepo`, `meanReworkIterations`, `reEntryRate`.
  - Files: `packages/luca-tools/src/artifacts/modes/finalize.test.ts`
  - Verification: ac-09, ac-14
  - Dependencies: 1.2.1
- [ ] **Task 1.2.3**: Stamp `--slug <currentPhaseSlug>` + `--complexity <level>` on all 3 `signal.satisfaction` emit directives in the `lu` skill body (lu/index.ts:117 source:outcome, :181 gate-ask, :237 oversight-pause); add a FORWARD-ONLY note in that body.
  - Files: `packages/luca-tools/src/artifacts/skills/lu/index.ts`
  - Verification: ac-15, ac-16
  - Dependencies: (none — producer stamp is independent of compute)

## Deliverables
- **D1**: KPI (1) first-pass verify rate, bucketed by complexity (coarse from verify.json) → ac-02, ac-04
- **D2**: KPI (2) mean rework iterations, bucketed by complexity (from stamped signal.satisfaction telemetry) → ac-11
- **D3**: KPI (3) re-entry rate, bucketed by complexity (from stamped signal.satisfaction telemetry) → ac-11, ac-12.1
- **D4**: KPI (4) low-confidence ratio, fully bucketed by complexity → ac-01, ac-04
- **D5**: Persist mechanism — milestone-stamped `metric:outcome-kpi-<version>-<complexity>` (all 4 KPIs) to repo vault `luca-monorepo` via finalize body → ac-07, ac-09, ac-14
- **D6**: Read-only compute verb `luca telemetry kpi --json` → ac-05, ac-06
- **D7**: Producer instrumentation — `--slug`/`--complexity` stamped on signal.satisfaction emits so telemetry is complexity-bucketable → ac-15, ac-16
- **D8**: Unattributable (slug:null) telemetry excluded from buckets but counted in `unattributed` (gap visible, not silently dropped) → ac-12.2

## Verification Criteria
- **ac-01**: `bun test packages/luca-core/src/telemetry/outcome-kpi.test.ts` shows lowConfidenceRatio == low/total per bucket for the fixture.
- **ac-02**: Same test shows firstPassVerifyRate per bucket = (phases whose lowest-`wave` verify.json record has `status == 'PASS'`) / (phases in bucket); any non-`PASS` status counts as not-first-pass.
- **ac-03**: A test asserts a fixture phase dir `NN-foo` whose roadmap entry `name: "foo"` has `complexity: SIMPLE` lands its KPIs in the SIMPLE bucket (slug→complexity name-suffix mapping verified by output, not token grep).
- **ac-04**: `timeout 120 bun test packages/luca-core/src/telemetry/outcome-kpi.test.ts` passes inside a named describe block (non-vacuous).
- **ac-05**: `grep -n "kpi" packages/luca-cli/src/commands/telemetry.ts` shows a `kpi` leaf registered in `telemetryCommand.subCommands`.
- **ac-06**: A test invoking the `kpi` leaf's `run()` on a temp cwd asserts ZERO write side-effect — `.luca/telemetry/` JSONL line count is identical pre-invocation vs post-invocation.
- **ac-07**: `grep -n "metric:outcome-kpi-" packages/luca-tools/src/artifacts/modes/finalize.ts` shows the milestone-stamped concept in the body directive.
- **ac-08**: [SPLIT → ac-08.1, ac-08.2]
- **ac-08.1**: [REMOVED — superseded by FULL scope, see ac-11/ac-12; deferral todo no longer applies]
- **ac-08.2**: [REMOVED — superseded by FULL scope, see ac-11/ac-13; deferral gap prose no longer applies]
- **ac-09**: `timeout 120 bun test packages/luca-tools/src/artifacts/modes/finalize.test.ts` asserts instructions contain `telemetry kpi`, `metric:outcome-kpi-`, `muninn_remember_batch`, `luca-monorepo`.
- **ac-10**: `bunx --bun tsc --noEmit` exits 0.
- **ac-11**: The test shows meanReworkIterations per bucket = mean over bucket phases of (count of `valence:"negative"` source:outcome records at `step` ∈ {checks,verify}), from the telemetry fixture.
- **ac-12**: [SPLIT → ac-12.1, ac-12.2]
- **ac-12.1**: The test shows reEntryRate per bucket = (phases having ≥1 negative source:outcome record) / (phases in bucket).
- **ac-12.2**: The test shows the slug:null fixture record contributes to no bucket yet increments the top-level `unattributed` tally.
- **ac-13**: The test asserts `pr-outcomes.jsonl` records never contribute to any KPI bucket (a planted pr-outcomes record leaves bucket counts unchanged).
- **ac-14**: `grep -n "meanReworkIterations" packages/luca-tools/src/artifacts/modes/finalize.ts` shows the rework KPI in the persisted payload shape.
- **ac-15**: `grep -n "signal.satisfaction" packages/luca-tools/src/artifacts/skills/lu/index.ts` lines also contain `--slug` on each of the 3 emit directives (source:outcome, gate-ask, oversight-pause).
- **ac-16**: `grep -n "complexity" packages/luca-tools/src/artifacts/skills/lu/index.ts` shows `--complexity` on the signal.satisfaction emit directives.

### Anti-criteria (regression guards)
- **anti-01**: MUST NOT — bump telemetry schema `v`; probe: `grep -n "z.literal(1)" packages/luca-core/src/telemetry/schemas.ts` still present, no `v: 2`.
- **anti-02**: MUST NOT — call `muninn_feedback` anywhere; probe: `grep -rn "muninn_feedback" packages/luca-tools/src packages/luca-cli/src packages/luca-core/src` returns no new hits.
- **anti-03**: MUST NOT — edit luca-mastracode `.md` instructions; probe: `git diff --name-only` shows no `packages/luca-mastracode/**/*.md` changes.

## Risks & Mitigations
- **Forward-only attribution**: stamping `--slug`/`--complexity` only fixes FUTURE runs; existing telemetry stays null and is excluded (tallied in `unattributed`). Inherent + acceptable — KPIs are forward trends.
- **Materialization**: finalize.ts AND lu/index.ts are luca-tools BODY edits; live in `~/.claude/` needs `bun run build` + `luca init` re-run — NOT an in-plan task.
- **name→slug heuristic**: exact suffix match against roadmap[].name; diverging future slug would miss (acceptable).
- **Synthetic-file leak**: telemetry enumeration MUST exclude `pr-outcomes.jsonl` (per pattern:non-run-file-leaks-into-run-keyed-enumerations) — guarded by ac-13.

## Decisions
- 2026-06-16 — FORK 1: `luca telemetry kpi --json` plain citty leaf → pure tested core fn (read-only, not a mutation handler).
- 2026-06-16 — FORK 2: source per-phase confidence.jsonl + verify.json; slug→complexity via roadmap name match.
- 2026-06-16 — FORK 3 (LOW/ask): MVP-NOW recommended — ship low-conf + first-pass, defer rework + re-entry. ~~SUPERSEDED~~.
- 2026-06-16 — GATE REDIRECT: user rejected MVP-defer; FULL scope — instrument producer (`--slug`/`--complexity` on signal.satisfaction emits) so all 4 KPIs bucket. ac-08.1/.2 tombstoned; ac-11..ac-16 added.
- 2026-06-16 — FORK 4: milestone-stamped `metric:outcome-kpi-<version>-<complexity>` batched to `luca-monorepo` via finalize body.
- 2026-06-16 — This is the LAST phase of v13.1.0; after learn the /lu loop advances to finalize, it does NOT phase-advance.
