# Review Round 3 (Spot-Check): 08-open-questions

## Reviewer: External Research / Open Questions Reviewer (Cold Isolation)

## Date: 2026-03-23

## Iteration: 3 (spot-check on Q15 fix only)

## Files Checked

| File                               | Purpose                                                      |
| ---------------------------------- | ------------------------------------------------------------ |
| `08-open-questions/README.md`      | Fixed file under review (Q15 rewrite)                        |
| `04-agent-orchestration/README.md` | Authority source for `lu-research-synthesizer` documentation |
| `CANONICAL-DECISIONS.md`           | Authority source for all canonical decisions                 |
| `08-open-questions/REVIEW-R2.md`   | Round 2 review with IMP-OQ-R2-001 finding                    |

---

## Verification Results

### Check 1: Q15 no longer claims `lu-research-synthesizer` is missing/unspecified

**PASS.** The old premise ("the agent catalog lists 4 researchers, 3 reviewers, and 1 graduator -- no synthesizer") has been completely removed. Line 1009 now reads:

> "The `lu-research-synthesizer` is documented in the agent catalog at `04-agent-orchestration/README.md` as an **Enhanced Agent** (existing from v1). It combines the 4 parallel researcher outputs into `SUMMARY.md`, sits between research output and the discuss step in the pipeline, and re-runs after deep expand (Step 4). Its role and identity are established -- what remains open are operational details around isolation, error propagation, and re-run behavior."

This is factually accurate. The agent catalog at `04-agent-orchestration/README.md` line 27 confirms `lu-research-synthesizer` is listed as an Enhanced Agent with exactly the description Q15 references.

### Check 2: Q15 correctly acknowledges the synthesizer is documented in agent orchestration

**PASS.** Q15 now includes an explicit link to `04-agent-orchestration/README.md` and characterizes the synthesizer as an "Enhanced Agent (existing from v1)." This matches the agent catalog's Enhanced Agents table where `lu-research-synthesizer` is described as "Unchanged from v1" with its role and source file path documented.

### Check 3: Q15 is narrowed to genuinely open sub-questions

**PASS.** The three remaining sub-questions are all genuinely open:

1. **Isolation level** (sub-question 1): Confirmed genuinely open. The Context Isolation Summary table at `04-agent-orchestration/README.md` lines 134-138 lists cold agents (4 researchers, 3 reviewers) and warm agents (`lu-actionability-reviewer`, `lu-research-graduator`), but does NOT list `lu-research-synthesizer`. Q15 correctly identifies this gap and recommends warm classification. This is a real omission in the agent orchestration section.

2. **Error detection protocol** (sub-question 2): Confirmed genuinely open. No canonical decision or existing section specifies how reviewers should compare `SUMMARY.md` against source files or flag synthesizer-introduced distortions. Q15's recommendation to use `G-ACC-*` gap IDs is consistent with Decision 8 (Gap ID Format).

3. **Re-run after review-triggered revisions** (sub-question 3): Confirmed genuinely open. The agent catalog states the synthesizer "re-runs after deep expand (Step 4)" but says nothing about re-runs after review-loop-triggered targeted re-expansion (Decision 16). Q15 correctly identifies this gap and presents three options with trade-offs.

The old sub-questions about "Is synthesis a separate step or folded into review?" and "Who performs synthesis?" (which were already answered by the agent catalog) have been removed. The question title has been updated from the generic "Research Synthesizer Role" to the specific "Research Synthesizer Isolation, Error Propagation, and Re-Run Semantics."

### Check 4: Dependency diagram edges for Q15 are updated

**PASS.** Two dependency edges involve Q15:

- **Q2 -> Q15** (lines 1077-1079): "The orchestrator design determines how the synthesizer re-run is triggered (after deep expand, after review convergence)." This is valid -- the orchestrator location (Q2) directly affects how and when the synthesizer re-run is invoked.

- **Q15 -> Q16** (lines 1103-1105): "The synthesizer's error propagation model (Q15 sub-question 2) must be consistent with the broader research agent error handling (Q16)." This is valid -- the synthesizer error detection protocol must align with the general research agent error handling strategy.

Both edges reference the narrowed Q15 sub-questions (re-run timing and error propagation), not the old "missing agent" framing. The edges are accurate and relevant to the updated question scope.

### Check 5: Resolution timeline references are consistent

**PASS.** Q15 appears in the Resolution Timeline under Phase 2 (line 1138):

> "Q15 (Synthesizer semantics) | Isolation and re-run timing needed before research pipeline is built"

This maps to "Implementation Plan Phase 2 (Research Agents) and Phase 3 (Review System)" per line 1131. This is correct -- the synthesizer's isolation and re-run behavior must be decided before the research pipeline is built, and the error detection protocol must be decided before the review system is built.

The Status Summary table at line 25 shows Q15 as:

> `| Q15 | Research synthesizer isolation and error propagation | Architecture | **NEW** (narrowed) | Isolation level, error propagation, re-run semantics (recommended) |`

The "(narrowed)" qualifier correctly signals that this question was rewritten from its original form, distinguishing it from Q16 which is simply "NEW."

---

## Cross-Reference Consistency

### Q15 vs. 04-agent-orchestration/README.md

- Q15 line 1009 states synthesizer "combines the 4 parallel researcher outputs into SUMMARY.md" -- **matches** agent catalog line 27.
- Q15 line 1009 states synthesizer "re-runs after deep expand (Step 4)" -- **matches** agent catalog line 27.
- Q15 line 1013 states the isolation summary table "does not explicitly list `lu-research-synthesizer`'s isolation mode" -- **confirmed accurate** by inspecting the table at lines 134-138 of agent orchestration README. Only `lu-actionability-reviewer` and `lu-research-graduator` are listed in the warm row.
- Q15 line 1017 references Decision 16 for review-triggered revisions -- **consistent** with `CANONICAL-DECISIONS.md` Decision 16.

### Q15 vs. CANONICAL-DECISIONS.md

- Q15 references Decision 16 (revision loop targets) for re-run semantics -- **correct** reference.
- Q15 references Decision 8 (Gap ID Format) implicitly via the `G-ACC-*` recommendation -- **consistent** with the reviewer-prefixed ID format.
- No Q15 content contradicts any canonical decision.

---

## Remaining Issues

**None.** The IMP-OQ-R2-001 finding from Round 2 has been fully addressed. Q15 is now factually accurate, properly scoped to genuinely open sub-questions, and consistent with all cross-referenced sections.

---

## Verdict: APPROVED

The Q15 rewrite correctly resolves the sole Round 2 issue (IMP-OQ-R2-001). The question now:

1. Acknowledges `lu-research-synthesizer` as a documented Enhanced Agent in the agent catalog
2. Is narrowed to three genuinely open operational questions (isolation level, error detection, re-run timing)
3. Has accurate dependency diagram edges reflecting the narrowed scope
4. Has consistent resolution timeline mappings
5. Introduces no new cross-section inconsistencies

The `08-open-questions/README.md` document is approved with no further revisions needed.
