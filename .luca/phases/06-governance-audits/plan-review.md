# Plan Review: 06-governance-audits

**Status:** APPROVED · **Convergence:** CONVERGED · **Blocking:** 0 · **Advisory:** 4

## Discrimination probes (as-built confirmed)
| Probe | Expected | Actual | Verdict |
|---|---|---|---|
| `grep -cE "todo move\|move-batch\|retro postmortem gate"` execute.ts + finalize.ts | 5→0 | execute.ts:411 (1) + finalize.ts:227/470/474/476 (4) = 5 | ac-07 discriminates ✓ |
| relaxation-paths.ts exists | absent | Glob → no file | ac-03/04/05 discriminate ✓ |
| `--skip-verify` real | phase-plan:119 | confirmed | anti-phantom ✓ |
| review.ts load-bearing tokens | survive | ac-NN/deferred/verificationRef real at :73/:86/:296 | anti-04 guards real tokens ✓ |

Every ac fails against as-built; every anti guards a real token; no phantom verbs/flags in the plan. execute.ts + finalize.ts (touched by BOTH REQ-09 trim + phantom fix) merged under one owner (Task 2.B.1) — no intra-wave conflict. Wave A (docs + luca-core) ⟂ Wave B (luca-tools). Over-trim hazard has a concrete survival anti-criterion (anti-04), not just "trim carefully". agent-constraints.ts fenced (anti-06). anti-01 (no new CLI verb), anti-02 (no Zod), anti-03/05 (no phantom in doc/const) present.

## Advisories (fold into executor context)
- **G-DX-001** ac-10 (`grep -c "CRITICAL CONSTRAINT"` review.ts, baseline=1) is knife-edge: trimming other banners but leaving that one literal → false-UNMET. Broaden to a density signal (count ALL-CAPS banner lines or directive-array length) so a real trim that misses one token still registers. Executor target is explicit (Caveman line :43 + CRITICAL blocks), so low-risk.
- **G-DX-002** ac-08 (`grep -c "init\|vault:init"`) false-positives on `initial`/`initialize`. Anchor on `grep -c "vault:init"` (colon form) or `grep -ci "excluded scope"`.
- **G-DX-003** ac-02 greps bare basenames (`retro\.ts`) — won't catch a wrong DIRECTORY in a file:line citation. Task 1.A.1 must verify each cited `file:line` resolves to the EXACT path at authoring (retro.ts = packages/luca-cli/src/commands/retro.ts; postmortem exit logic = packages/luca-core/src/analysis/postmortem.ts, NOT a `postmortem gate` subcommand). anti-03 (manual cross-check) is the real guard.
- **G-DX-004** ac-05 (`≥5 floors`) is a floor not a completeness check; "CLOSED enumeration" rests on anti-03 (no phantom) + ac-02 (doc covers every inventory gate) + the human audit. Acceptable by design — note it.

## Checklist
Completeness ✓ (D1 doc + D2 const + D3 skip-verify + D4 trims across 7 bodies + D5 phantom fix; every D→≥1 live ac; ac-06 correctly `[SPLIT → ac-06.1, ac-06.2]`). Atomicity/parallel-safety ✓. Verification quality ✓ (audit deliverables have STRUCTURAL probes, not "an audit exists"; all 5 required guards present). Scope ✓ (init/vault:init excluded, boundary stated). ID-stability ✓.

**Recommendation:** approve — fold the 4 probe-robustness advisories into executor context.
