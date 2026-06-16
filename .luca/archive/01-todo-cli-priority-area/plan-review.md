# Plan Review: 01-todo-cli-priority-area

**Status:** APPROVED · **Convergence:** CONVERGED (B(1)=1 → B(2)=0) · **Rounds:** 2
**Plan:** plan.md revision 2 (95 lines, 3 waves, 7 tasks, 18 criteria ac-01..ac-17 + ac-10b)

## Round 1 — NEEDS_REVISION (1 blocking, 5 advisory)

| ID | Sev | Finding | Resolution (verified round 2) |
|---|---|---|---|
| G-SCOPE-001 | BLOCKING | `todo list` never got --area/--priority on CLI leaf or handler inputSchema; Zod strips unknown keys → silent-drop reproduced; rejectUnknownFlags would hard-error the documented usage | Task 2.2 covers all 3 layers (listCommand args, list handler schema fields, filter description); new criterion ac-10b (source-run list probe) |
| G-DX-001 | advisory | Wave 2 "parallel" contradicted Task 2.2 deps:2.1 | Header sequences 2.1 → 2.2; 2.3/2.4/2.5 parallel (disjoint files) |
| G-DX-002 | advisory | Runtime probes could hit stale linked CLI | Blockquote mandates source-run or rebuild+relink for ac-08/09/10b/12 |
| G-ARCH-001 | advisory | rawArgs scan could reject citty built-in --help/--version | help/version + aliases in allowed set; ac-04 probes; Risks line added |
| G-DX-003 | advisory | ac-12 importer-count rationale miscounted helper location | Corrected: ≥12 = todo.ts + 11 leaves; helper in __helpers/ unmatched by glob |
| G-SCOPE-002 | advisory | ac-14 absence-only check would pass deletion-without-replacement; full-replace warning missing from CLI --help surface | Positive grep added for first-class flags in gh-issue-triage prose; warning mirrored in update CLI arg descriptions (ac-08) |

## Round 2 — APPROVED (0 blocking, 0 advisory)

All six round-1 findings verified resolved at plan.md lines 31/34/36/38/47-56/64/72/93. Re-checked invariants hold: tsc-only gate (never bun test), all 7 prose sites covered, context.md decisions 1-4 each map to tasks, core→cli wave ordering intact, no same-file conflicts among parallel tasks, backfill orchestrator-only with full-replace handling.

**Recommendation:** approve → proceed to confidence gate + execute.

## Round 3 — fix-cycle addendum (wave 4) — APPROVED (0 blocking, 5 advisory)

Scope: review of "Wave 4 — review fixes (cycle 2)" only (plan revision 3; ac-18..ac-24). Convergence: B(2)=0 → B(3)=0.

Verified: SEC-01 MUST-FIX fully planned (JSON.stringify at the exact luca-todo-list.ts:57 seam + runtime injection probe ac-20 asserting SAFE behavior); SEC-02 regex at schema source + all 3 independently-declaring handler schemas; AR-01 at all 3 todo.ts sites via TodoPriority.options; warning consolidation closes dx+simplifier SHOULD-FIXes without losing the warning (ac-23/ac-24). Every audit MUST-FIX/SHOULD-FIX planned or explicitly deferred (AR-02/DX-02 → follow-up todo, plan line 112). ID-stability intact (ac-01..ac-17 + ac-10b untouched).

Advisories (fold at execution, no re-review needed):
- G-DX-004: sequence 4.1 → 4.2 (both touch luca-todo-update.ts inputSchema region) — orchestrator runs wave 4 as a single sequenced executor.
- G-DX-005: frontmatter criteria should read 25 (ac-10b uncounted).
- G-DX-006: ac-22 exact-count grep → treat as ≥3 + no-literal-array.
- G-SCOPE-003: reconcile "10 backfilled" (correct; plan's 9 predates the 10th todo) and confirm stored areas re-parse under the new regex.
- G-ARCH-002: prefer shared TodoAreaSchema export from luca-core over 4 regex copies (TodoPriority precedent).

## Confidence Gate Resolutions

All entries auto (3 plan-time + execution-time entries all high/medium → auto bucket; counts: research=0, ask=0). No researcher spawns, no user asks. Recorded for resume idempotency.
