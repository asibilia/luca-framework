# Plan Review: 07-cross-vendor-audit

**Status:** APPROVED · **Convergence:** CONVERGED · **Blocking:** 0 · **Advisory:** 2

## Pre-state probes (all discriminate)
- `cross_vendor_audit_enabled` in phase-execute/index.ts = 0 (ac-03). `independence` in reviewer.ts = 0 (ac-01). §8.6 absent (ac-04). §8.5 tribunal precedent confirmed (`c.workflow?.<flag> ?? true` + CRITICAL gate); §8.1 routing target at :1505; reviewer.ts read-only allowedTools :23.

## Criteria-quality
Phantom-capability guard PASS (anti-01 grep `gemini|openai|different vendor` returns nothing claimed real; honesty requirement met — body documents single-vendor→independence approximation). Cuttable guards PASS (anti-02 `?? false`, anti-05 CRITICAL-only, anti-04 read-only, anti-03 no-new-subagent/CLI/schema via git porcelain, anti-06 no .test.ts). Leanness PASS (1 wave, 2 disjoint-file tasks; no scope creep; over-build vectors actively rejected). Deliverables D1→ac-01/02, D2→ac-03/04/05/06.

## Findings (advisory — fold into executor context)
- **G-DX-001** reviewer.ts:38 says "one of **six** perspectives" + the :19 description enumerates six — Task 1.1.1's edit list omits :38/:19. Adding a 7th without updating "six" leaves an internal contradiction. **Fix:** executor must also update :38 ("six"→"seven") and the :19 enumeration when adding the 7th perspective.
- **G-CRIT-001** ac-05's file-wide `grep CRITICAL` is non-discriminating (matches the existing tribunal CRITICAL/HIGH gate at :1478). **Fix:** region-scope the probe to the §8.6 block (`grep -nA15 "8.6" … | grep -E 'COMPLEXITY === "CRITICAL"'`) so it fails mechanically if §8.6 omits the CRITICAL gate. anti-05 partially backstops.

## Over-engineering check (high bar)
No over-build. Ceiling matches mandate: reuse reviewer.ts (no new subagent file), no CLI verb, no luca-core schema (toggle rides the freeform `workflow.*` object like `tribunal_enabled`, no schema change). git-porcelain anti-03 enforces the two-file blast radius.

**Recommendation:** approve — fold G-DX-001 (update "six"→"seven") and G-CRIT-001 (region-scope ac-05) into executor context.
