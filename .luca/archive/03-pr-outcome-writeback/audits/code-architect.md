# Architecture Review — Phase 3: pr-outcome-writeback

**Verdict: APPROVE (with 1 MEDIUM correctness finding routed to a fix loop)**

Core design verified sound: synthetic-runId storage is contract-legal (`RUN_ID_RE` accepts `pr-outcomes`; `telemetryPathFor`→`pr-outcomes.jsonl`; `isValidLucaPath`→`telemetry.run`); two-kind split (`pr.created` create-time in live `<runId>.jsonl` vs `pr.outcome` merge-time in `pr-outcomes.jsonl`) is correct; `meta.prNumber` join is coherent and achievable (`pr.created` top-level runId=originRun ⋈ `pr.outcome` meta.prNumber); module boundaries OK; no hazard to other telemetry consumers (`gather-run-artifacts` is runId-keyed, doesn't enumerate the telemetry dir).

## MEDIUM — FIX (correctness regression in the report deliverable)
**index.ts Step 2 counts `pr-outcomes.jsonl` as a pipeline run.** The skill enumerates every `.luca/telemetry/*.jsonl`, sorts by mtime, takes the first `--runs N`, and emits one Run Inventory row per file. `pr-outcomes.jsonl` (frequently appended → high mtime) is swept in with no exclusion: (a) it can consume a top-N `--runs` slot, EVICTING a real run from the window; (b) it appears as a bogus inventory row (null complexity/oversight, no phases); (c) it inflates the "runs aggregated" count. Step 3 correctly special-cased the `pr.outcome` RECORDS but nothing excludes the FILE from Step 2's run-level enumeration. **Fix:** exclude the literal `pr-outcomes.jsonl` from the run-file set BEFORE the mtime sort + `--runs N` slice (and from Run Inventory + count); read it separately as the dedicated PR-outcome source for the PR Outcomes section.

## Re-review (post-fix, iteration 1) — APPROVE / CONVERGED
All 3 MEDIUM fixes verified correct, 0 new issues: (1) Step 2 exclusion placed BEFORE the mtime sort/`--runs N` slice (index.ts:78-80), literal `pr-outcomes.jsonl` match only, PR Outcomes section keeps its separate source (:82), Step 3/Step 4 `pr.outcome`/`pr.created` prose intact; (2) handler tests genuinely assert optional round-trip + omitted-optional absence + `toHaveLength(1)` against real readback; (3) `--result` guard runs after `rejectUnknownFlags`, exits non-zero with friendly message, doesn't shadow the surviving Zod validation. CONVERGED.

## LOW (carried, non-blocking)
- handler `inputSchema` re-declares the PR-outcome shape independently of luca-core's advisory `PrOutcomeMetaSchema` — two hand-maintained copies that can drift. Optional: add paired-maintenance comments on both (sanitizeJsonParse pattern), or derive one from the other.
