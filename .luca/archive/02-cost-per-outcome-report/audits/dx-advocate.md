# DX Review — Phase 2: cost-per-outcome-report

**Verdict: APPROVE** · 0 must-fix · 0 HIGH · 3 LOW (advisory)

Filenames kebab/conventional; imports grouped per import-standards; meta keys are camelCase internal telemetry fields (snake_case API rule N/A); model rates explicitly framed operator-editable/non-authoritative (index.ts:103,112); test reads the real `.body` export — justified single-export deviation from the `readFileSync` sibling, preserves per-block independence.

## LOW findings (carried, non-blocking)
1. **index.ts:89-90 — planning vocab leaked into LLM-facing prose.** Cross-refs `(for Task 1.1.3 below)` / `(Task 1.1.3)` are undefined forward-references an executing LLM can't resolve; every other section cross-refs by section name. Fix: replace with `(see Structure vs Executor Attribution below)`.
2. **index.ts:88-90 — `byRole` vs `costByRole` key drift.** Two role-keyed accumulators use different key expressions (`role` vs `meta.role`) for the same dimension. Fix: normalize both to `meta.role` so the Subagent Costs / Cost Summary tables join cleanly.
3. **index.ts:93,134 — first-pass Step-3 retention not stated.** Step 4 derives first-pass-success from the per-phase `review.iteration` series, but the Step 3 accumulator list never tells the aggregator to retain per-phase verdict+count state. Workable (LLM back-derives in Step 4) but a one-line Step-3 note ("retain per-phase verdict+count series") would make the derivation input explicit. *Most substantive of the three.*
