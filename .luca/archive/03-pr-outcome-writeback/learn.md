# Learn — Phase 03 pr-outcome-writeback (REQ-15, MODERATE)

Milestone v13.1.0 (Telemetry Impact & Attribution). Verification: PASS after one
review→execute fix loop. 12/12 ac · 5/5 anti · 6/6 deliverables; re-review APPROVE/CONVERGED.

---

## pattern: synthetic-runId fixed-log for out-of-band telemetry

- **Confidence:** HIGH
- **Conjectured:** Telemetry events always originate inside a live pipeline run, so an
  emitter can rely on `ctx.runId` pointing at the active run's `<runId>.jsonl`.
- **Refuted by:** The post-merge `pr.outcome` signal fires AFTER merge with NO live run-id —
  the first telemetry signal originating outside a live run. There is no active run to key on.
- **Learned:** Pick a FIXED synthetic runId that is a legal runId
  (`RUN_ID_RE = /^[A-Za-z0-9_-]+$/`) and write to it with the unchanged writer:
  `appendTelemetry({ ctx: { runId: 'pr-outcomes' } })` lands in
  `.luca/telemetry/pr-outcomes.jsonl` with NO writer change, and the report's `*.jsonl` glob
  auto-discovers it. Origin context (e.g. originating run, PR number) lives in `meta`, not the
  filename — the filename is just a stable bucket.
- **Criterion now:** For any out-of-band emitter, assert the synthetic runId matches
  `RUN_ID_RE` and that NO downstream run-level enumeration treats the fixed log as a run (see
  the pitfall below).

## pattern: two-kind create⋈outcome join via a stable business key

- **Confidence:** HIGH
- **Conjectured:** A single merge-time `pr.outcome` kind (result in `meta`) is enough to
  attribute outcomes.
- **Refuted by:** A merge outcome has no live run-id, so it can't be tied back to the
  originating run's cost / first-pass KPIs from the outcome record alone.
- **Learned:** Emit TWO kinds on the open `TelemetryKind` union (no `v` bump): `pr.created`
  at create-time from `finalize.ts` with the LIVE originating runId (lands in that run's
  `<runId>.jsonl`), and `pr.outcome` at merge-time (lands in `pr-outcomes.jsonl`). Join on a
  stable BUSINESS key `meta.prNumber`:
  `pr.created(runId=originRun, meta.prNumber) ⋈ pr.outcome(meta.prNumber)` correlates the
  merge outcome back to the originating run. The business key bridges the run-id gap.
- **Criterion now:** When a signal spans two lifecycle moments with no shared run-id, define
  the join key as a stable domain identifier and assert round-trip of it in tests (here the
  `originRunId`/`prNumber` correlation fields were initially un-asserted and caught in review).

## pattern: gate-redirect that expands scope → plan amendment, not just an executor directive

- **Confidence:** HIGH
- **Conjectured:** A plan-review gate redirect can be absorbed by handing the executor an
  extra directive at execute-time.
- **Refuted by:** The user REDIRECTED the storage model at the gate — "also persist run→PR map
  at PR-create" — a real scope addition (the `pr.created` kind + finalize directive + new
  acceptance criteria + a deliverable) beyond the fixed-log-only leading rec.
- **Learned:** When a gate-ask EXPANDS scope, loop plan-review→plan and AMEND the plan: add the
  new kind, the finalize directive, ac-10/11/12 and D6 for traceability — and do it WITHOUT
  renumbering existing ac-IDs (append-only), then re-review (CONVERGED). New behavior needs new
  acceptance criteria so verification can attest it; an out-of-band executor directive leaves
  the addition untraceable.
- **Criterion now:** If a gate redirect changes the artifact set or adds behavior, require a
  plan amendment with appended (never renumbered) ac-IDs before execution proceeds.

## pitfall: a non-run file in a run-keyed telemetry dir leaks into run-level enumerations

- **Confidence:** HIGH
- **Conjectured:** Special-casing the `pr.outcome` RECORDS in the report (Step 3 dispatch) is
  enough to integrate the new fixed log cleanly.
- **Refuted by:** First review caught a MEDIUM correctness regression — the report's Step 2
  enumerates EVERY `.luca/telemetry/*.jsonl` as a pipeline run (mtime-sort, `--runs N` window,
  Run Inventory, run count). The new high-mtime `pr-outcomes.jsonl` got swept in, able to
  EVICT a real run from the window, show a bogus inventory row, and inflate the run count. The
  executor handled the records but not the FILE.
- **Learned:** Introducing a non-run file into a run-keyed directory requires excluding it from
  EVERY run-level enumeration (file discovery / sort / window / inventory / count), not just
  record-level dispatch. Fixed by a Step-2 file-exclusion in a review→execute loop.
- **Criterion now:** When adding a fixed/synthetic file to a directory consumed by globs, grep
  every consumer for the directory glob and add the exclusion at FILE-discovery level; add a
  test asserting the fixed log does not appear in run inventory / count / window.

## decision: pr.outcome + pr.created kinds, fixed pr-outcomes.jsonl storage, explicit-flags trigger

- **Confidence:** HIGH
- **Conjectured (alternatives weighed):** (a) single `pr.outcome` kind only; (b) per-run
  storage only; (c) inferred/auto trigger.
- **Refuted by:** (a) can't correlate to the originating run (no run-id at merge); inferred
  triggers were rejected as requirement-ambiguous at the gate.
- **Learned:** Decided TWO kinds on the open union with NO `v` bump; merge-time outcomes in a
  fixed `.luca/telemetry/pr-outcomes.jsonl`, create-time events in the originating run's log;
  join on `meta.prNumber`. User ACCEPTED the explicit-flags-only trigger and REDIRECTED storage
  to also persist a run→PR map at create-time.
- **Criterion now:** New telemetry kinds that extend the open union and don't change record
  shape do NOT bump `v`; correlation across lifecycle moments uses a `meta` business key.

## convention: luca-cli write-surface handler + citty leaf + test checklist

- **Confidence:** HIGH
- **Conjectured:** A new CLI mutation can be authored ad hoc.
- **Refuted by:** luca-cli has an established write-surface shape; deviating risks failing the
  stage-gate and DX review (G-DX-002 flagged import path expectations).
- **Learned:** Mirror the `luca-confidence-log.*` precedent exactly:
  - Handler at `packages/luca-cli/src/write-surface/handlers/luca-<name>.ts`;
    citty leaf at `packages/luca-cli/src/commands/write-surface/<name>.ts`.
  - Cross-dir helper import is `commands/write-surface/__helpers/run-handler.ts`.
  - Friendly `--<enum>` pre-check (here `--result`) mirrors the confidence leaf's
    `--resolution` guard — run it AFTER `rejectUnknownFlags`, BEFORE the surviving Zod
    validation.
  - REAL bun test (not token-presence): `tool.handler(payload, { cwd })` against a `mkdtemp`
    cwd, JSONL readback, schema-rejection via `inputSchema.safeParse`. Assert optional-field
    round-trip (incl. the correlation key `originRunId`), omitted-optional ABSENCE, and
    `toHaveLength(1)`.
- **Criterion now:** Every new write-surface leaf ships handler + citty leaf + bun test
  following the confidence-log layout; reviewer confirms the `__helpers/run-handler` import and
  the post-`rejectUnknownFlags` enum guard.

---

## Signal Synthesis

Derived solely from the orchestrator-injected `<signal-digest>`.

**Recurring failure themes**
- One MEDIUM correctness regression on pass-1 review: the synthetic-runId log leaked into the
  report's run-level enumeration (Step 2). Single root cause = record-level dispatch handled,
  file-level enumeration not. Drove the one review→execute loop. Pass-2 review: 0 new issues.
- Two requirement-ambiguity LOW-confidence dips at the plan-review gate (storage model, trigger
  input model) — both surfaced as gate-asks, not silent assumptions.

**Satisfaction valence trends by step/source**
- `satisfaction:gate-ask` (plan-review): mixed — one NEGATIVE (storage REDIRECT) + one positive
  (trigger accepted). Gate is doing its job: surfacing scope-shaping decisions to the user.
- `satisfaction:outcome` (checks/verify): uniformly positive across both passes (tsc + handler
  7→9, report 11; 12 ac / 5 anti / 6 deliverables held).
- `satisfaction:outcome` (review): NEGATIVE pass-1 (3 APPROVE but 1 MEDIUM regression + 2 cheap
  MEDIUM) → positive pass-2 (APPROVE/CONVERGED). Review is the friction hotspot but converged
  in one loop.

**Cross-cutting patterns**
- Confidence journal: HIGH where the work mirrored a known precedent (handler/citty mirror
  luca-confidence-log); MEDIUM/LOW where it broke new ground (single-kind storage; ambiguous
  requirements). The novel-territory dips are exactly where review caught the regression —
  confidence self-report correlated with where defects landed.

---

## Carried follow-up (one low-priority cleanup candidate)

Bundle for the phase-4 capstone or a later touch (single LOW-priority item):
- Phase-2: 5-item LOW-advisory report cleanup.
- Phase-1: `record-recall.test.ts` hardening.
- Phase-3 LOW advisories: handler/`PrOutcomeMetaSchema` duplication; lone `--pr` alias.
