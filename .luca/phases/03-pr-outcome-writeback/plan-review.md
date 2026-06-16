# Plan Review — Phase 3: pr-outcome-writeback

**Verdict: APPROVED · Convergence: CONVERGED (BLOCKING = 0)**

MODERATE phase. Every plan claim verified against the real codebase (no fabricated paths/APIs): `pr.outcome` rides the open `TelemetryKind` union (schemas.ts:43; `v: z.literal(1)` L74 — no bump); `pr-outcomes` is a valid runId per `RUN_ID_RE` (constants.ts:32) so `appendTelemetry({ctx:{runId:'pr-outcomes'}})` writes `.luca/telemetry/pr-outcomes.jsonl` with no writer change and the report glob auto-discovers it; handler/test mirror the `luca-confidence-log.*` precedent; `appendTelemetry`/`generateRunId` barrel-exported (index.ts:17). The central no-live-run-id tension is resolved on the tested path (fixed synthetic runId), and `reviewRounds`/`timeToMergeMs` are explicit numeric handler inputs (deterministic), not fuzzy gh derivations.

## Splitting / Independence / Vacuous-test — clean
- All 9 ac + 5 anti are single binary probes; no `&&` compounds. No ac fails the Splitting Test.
- ac-03/ac-04 share one `bun test <file>` command (round-trip vs schema-rejection) — acceptable because Task 1.1.3 task text pins the specific assertions (merged+reverted+reviewRounds+timeToMergeMs round-trip + safeParse rejection). Report token-presence acs (ac-06/07) are independent of handler acs (different files/commands).
- G-DX-003 / anti-05: CLEAN — no `bun test -t` against unnamed blocks; whole-file `bun test <path>`; report test uses a named `pr-outcomes` describe block.
- anti-01 line-anchored `^\s*v:\s*2\b` correctly excludes the `*`-prefixed doc-comment `v: 2`. anti-04 (handler no state.json mutation) is genuinely probeable — the handler uses a fixed synthetic runId and never calls loadCurrentState.

## Traceability / Deliverables — complete
All 4 REQ-15 asks → ≥1 live ac: merged/reverted→D1(ac-02,03), review-rounds→D2(ac-03), time-to-merge→D3(ac-03), report-queryable→D4(ac-06,07); D5 gates(ac-04,09). Waves coherent: 1.1.2 handler+barrel → 1.1.3 test → 1.1.4 citty leaf; Wave 2 report depends on Wave 1 kind.

## Findings (both ADVISORY — carried to executor; no blocking)

| id | issue | resolution |
|---|---|---|
| G-DX-001 | ac-03/ac-04 share one `bun test` command; assertion-level coverage is pinned only by Task 1.1.3 prose, not a probe. | **Carried to executor:** write the handler test to genuinely assert each field (merged, reverted, reviewRounds, timeToMergeMs round-trip + schema-rejection of bad enum + missing fields), mirroring the confidence-log test which asserts each field. Optionally a grep-ac for `reviewRounds`/`timeToMergeMs` assertion text would harden — not required. |
| G-DX-002 | Plan says Task 1.1.4 mirrors the confidence leaf "exactly," but that leaf lives in `commands/write-surface/` while this leaf lands in `commands/telemetry.ts` and imports helpers cross-directory. | **Carried to executor:** import `runWriteHandler`/`rejectUnknownFlags` from `commands/write-surface/__helpers/run-handler.ts` (don't look for them in `commands/telemetry.ts`). |

## Iteration 2 (post-amendment) — APPROVED · CONVERGED

After the storage gate-ask redirect, the plan was amended (added `pr.created` kind, Task 1.1.5 finalize.ts emit, ac-10/11/12, D6). Second cold review: 0 blocking, 0 new advisory. ID stability confirmed — ac-01..09 byte-for-byte unchanged, ac-10/11/12 appended-only. `pr.created` rides the open union (no v bump); finalize.ts (luca-tools `.ts`) touch trips no anti (anti-03 targets luca-mastracode `.md` only); join key `meta.prNumber` is coherent (`pr.created` runId=originRun ⋈ `pr.outcome`). Prior advisories G-DX-001/002 folded. CONVERGED — ready to execute.

## Confidence Gate Resolutions

Gate counts: auto=2, research=0, ask=2.

- **[gate-ask] `storage-correlation-model` (low, requirement-ambiguous) — REDIRECT (scope addition).** User chose **"Also persist run→PR map at PR-create"** (NOT the fixed-log-only leading rec). Resolution: keep the fixed `pr-outcomes.jsonl` synthetic-runId log for the post-merge outcome record AND ADD a finalize-side persist at PR-create time that records the run→PR mapping (originRunId + prNumber + branch + issue) so a future per-run join (this run's cost/first-pass ↔ its PR outcome) becomes possible. This adds a finalize.ts directive + a join key. Requires a plan amendment (new task + ac + deliverable) — looped plan-review → plan.
- **[gate-ask] `trigger-input-model` (low, requirement-ambiguous) — ACCEPT.** User chose **"Explicit flags only"** (leading rec). `luca pr-outcome` takes explicit flags (prNumber/result/reviewRounds/timeToMergeMs/branch?/issue?/originRunId?); deterministic, fully unit-tested, NO `gh pr view` derivation on the tested path.
- **[auto] `single-kind-design` (medium)** — single `pr.outcome` kind, result in meta, no v bump. Proceed.
- **[auto] `handler-naming-registration` (high)** — mirror luca-confidence-log handler + barrel + citty leaf under telemetryCommand.subCommands. Proceed.

## ac-ID inventory (stable)
ac-01..ac-09 (+ amendment ac for the run→PR persist, appended by the plan revision — never renumber existing); anti-01..anti-05. No renumbering downstream.
