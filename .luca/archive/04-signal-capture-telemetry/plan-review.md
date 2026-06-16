# Plan Review: 04-signal-capture-telemetry

**Status:** NEEDS_REVISION (round 1) · **Convergence:** CONVERGING (B(1)=2) · **Blocking:** 2 · **Advisory:** 4

Architecture, scope, dependency ordering, and deliverable mapping are sound — this is a verification-precision revision, not a structural redesign.

## Pre-state spot-checks (reviewer greps)
- `signal.satisfaction|signal.failure-dump|classifier.override` across packages/ → **0 matches** (ac-01/04/07/10 discriminate 0→≥1).
- TelemetryKind union (schemas.ts:26-39) = 12 members, `kind: z.string()` open (:74) — additive, no schema-version bump.
- `luca classify --json` flag exists (classify.ts:52-55) — but `--task` is REQUIRED (:30-35).
- learner.ts `signal|cluster|theme` → 0 (ac-13 discriminates); session-resume `signal` → 0 (ac-15 discriminates).
- `gate-ask` in lu/index.ts → **already present** (:121,:137 `[gate-ask]`) → ac-08.1 NON-discriminating.
- `.luca/tmp` in lu/index.ts → **already present** (:62/:67/:88) → ac-11 NON-discriminating.
- writer appendTelemetry already fail-safe (telemetry.ts:135-163) → anti-04 measures nothing.

## Findings

- **G-CRIT-001 [BLOCKING]** — ac-08.1 (`grep "gate-ask"`) and ac-11 (`grep "dumpRef|.luca/tmp"`) pass against pre-phase code (pre-existing `[gate-ask]` annotation; `.luca/tmp/roadmap.json` etc.). Fix: tie ac-08.1 to the new meta shape (`source:'gate-ask'` near a `signal.satisfaction` emit, not the bare token); ac-11 → `grep "dumpRef"` only (drop the pre-existing `.luca/tmp` alt; escape the dot if retained).
- **G-CRIT-002 [BLOCKING]** — anti-04 verifies pre-existing writer fail-safety, not the plan's delta; the new `*MetaSchema` validators are defined but never invoked, and the real emit-blocking surface is the CLI `--meta` JSON-parse path (telemetry.ts CLI :56-75) which sets `exitCode=1` on malformed meta. Fix (pick one): (a) Decision+anti line stating MetaSchemas are advisory/doc shapes NOT wired into a throwing path and the executor MUST NOT `.parse()` meta in the emit hot path; (b) retarget anti-04 to assert each MetaSchema usage is `safeParse`, no `.parse(`; (c) add a task making the CLI `emit` meta-parse fail-safe (warn + empty meta instead of exitCode=1) and verify that.
- **G-DX-001 [SHOULD-FIX]** — ac-09 PRIMARY probe couples to the prose token "PRIMARY", not behavior. The full-auto sparsity guarantee (most important goal-alignment concern) should be verifiable by construction: assert the outcome emit exists (`grep "source:'outcome'" lu/index.ts`) AND keep a doc-marker.
- **G-DX-002 [SHOULD-FIX]** — ac-14 is prose, not a runnable binary probe; pin the exact grep scoped to the learn-step signal-digest injection block (mirror the `<confidence-gate-resolutions>` injection at lu/index.ts:130-142).
- **G-CRIT-003 [NOTE]** — ac-08/ac-12 `[SPLIT → …]` parents correctly excluded from verify; ensure the verify harness grades only the live children (parents contain ` AND ` compounds).
- **G-SCOPE-001 [NOTE]** — ac-05/Task 1.2.1 must show the full `luca classify --task "<request>" --json` invocation (--task is required) so the instruction body doesn't ship a broken command (a phantom-capability regression the plan is trying to prevent).

## Cross-axis
Completeness PASS (D1-D6 map all REQ-04 sub-features + REQ-05, every D→≥1 live ac). Executability PASS (same-file lu/index.ts edits correctly serialized across waves). Dependencies PASS (schema wave → emit waves → learner/session-resume last). Verification quality FAIL (G-CRIT-001/002, G-DX-001/002 — 3 non-discriminating + 2 prose-token probes; other ~11 discriminate cleanly). Goal alignment MOSTLY PASS (conditional on G-DX-001). Risk handling PASS (telemetry-emit-only confirmed, no duplication, reframe logged as gate-ask) with the G-CRIT-002 caveat.

**Recommendation:** revise — five probe fixes; expect B(2)=0 and convergence on re-review.

---

# Plan Review Round 2 (probe-fix convergence)

**Status:** APPROVED · **Convergence:** CONVERGED (B(1)=2 → B(2)=0) · **Advisory:** 1

All 6 probe fixes verified to discriminate against as-built `lu/index.ts` (each new probe returns 0 pre-land):
- ac-08.1 `grep -qE "source:\s*'gate-ask'"` → 0 (old `[gate-ask]` annotation false-match at :121/:137 avoided). RESOLVED.
- ac-11 `grep -q "dumpRef"` → 0 (dropped `.luca/tmp` alt that matched :62/:67/:88). RESOLVED.
- anti-04 retargeted: Decisions entry (MetaSchemas advisory, not in throwing path; executor MUST-NOT `.parse()` meta in emit hot path) + probe `grep -rn "MetaSchema.parse(" …` → 0. RESOLVED.
- ac-09 `grep -qE "source:\s*'outcome'"` → 0 (behavioral emit probe, not prose token "PRIMARY"). RESOLVED.
- ac-14 `grep -qE "<signal-digest>|signal-digest"` → 0 (binary, scoped to learn-step injection mirroring `<confidence-gate-resolutions>` at :130-142). RESOLVED.
- ac-05 full invocation `luca classify --task "<request>" --json` (--task required, classify.ts:31-35); anti-03 synced. RESOLVED.
- G-CRIT-003: Decisions note confirms verify grades only live children, never `[SPLIT → …]` parents. RESOLVED.

ID-stability held (no renumbering; splits preserve parents). `## Plan Review Resolutions (round 1)` present. 6 revised criteria are single binary probes, metachars ERE-valid.

**G-DX-003 [ADVISORY]:** anti-04's probe scope is core/CLI emit path; a `.parse()` from the instruction body's emit guidance is covered only by the Decisions MUST-NOT prose, not the grep. Non-blocking — the named throwing path is the real risk surface and is guarded.

**Recommendation:** approve.

---

## Confidence Gate Resolutions

- **[gate-ask]** *Reframe REQ-04 per-message rating granularity* → **Per-decision + per-step-outcome.** Capture `signal.satisfaction` at: gate-ask answers + oversight pauses (per-decision) and verify/checks/review pass-fail + subagent crash/timeout (per-step-outcome). **Outcome signals are PRIMARY** so full-auto runs are never signal-empty. (User-selected, full-auto gate pause.)
- **[auto]** 2 design-choice entries (failure-dump home = telemetry meta / meta.dumpRef→.luca/tmp; lightweight fail-safe meta validation) routed auto.
