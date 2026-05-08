# Review Capture — Simplification [Wave 2]

**Verdict**: APPROVE (0 MUST-FIX, 2 SHOULD-FIX)

## SHOULD-FIX
- **SIMP2-S1** SKILL.md:125-137 vs 171-183 — partial duplication of `--auto` bypass logic. L183 sentence redundant with L137. Replace with cross-reference.
- **SIMP2-S2** SKILL.md:199 — "without it, the 24-hour idempotency guard in Step 1.5 cannot fire" restates L121 logic. Truncate.

## NOTE
- N1: All 7 iteration-1 SHOULD-FIX (S1-S7) verified resolved or acceptably collapsed.
- N2: Pre-flight validation list (4 items) — all minimum necessary.
- N3: Vault drift guard prose verbose but tested.
- N4: judgedByTier/appliedByTier both load-bearing.
- N5: Citation regex 4 patterns all earning keep.
- N6: 38% byte growth (10755→14833) justified by new behavioral contracts.

## VERIFIED RESOLVED
- SIMP-S1 caveat 3× → 1+pointer.
- SIMP-S2 external/untrusted skip 4× still 4 but non-overlapping contexts.
- SIMP-S3 runId removed.
- SIMP-S4 --auto fully defined.
- SIMP-S5 readFileSync hoisted to module scope.
- SIMP-S6 failure-modes table 5→2 rows.
- SIMP-S7 totalsByTier split correctly.
