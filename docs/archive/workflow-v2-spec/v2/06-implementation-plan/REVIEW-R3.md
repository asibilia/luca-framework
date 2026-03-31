# Review Round 3 (Spot-Check): 06-implementation-plan

## Reviewer: Spot-Check Reviewer (Round 3)

## Date: 2026-03-23

## Iteration: 3

## Summary Assessment

All four issues identified in Round 2 have been resolved. The seven `.planning/research/` flat path references are gone, all MAJOR severity instances are replaced with IMPORTANT, all snake_case config keys in pseudocode are now camelCase, and the orchestrator pseudocode step-number comments have an explanatory note. The section is clean and ready for implementation.

---

## Files Checked

| File                   | Checked? |
| ---------------------- | -------- |
| `README.md`            | Yes      |
| `migration-from-v1.md` | Yes      |
| `new-skills-needed.md` | Yes      |
| `new-agents-needed.md` | Yes      |
| `config-changes.md`    | Yes      |
| `phased-rollout.md`    | Yes      |

---

## Per-File Results

### README.md

**Status: CLEAN**

- No `.planning/research/` flat paths
- No MAJOR severity references
- No snake_case config keys
- `build-skill-registry.ts` listed in Modified Files table (line 47)
- `lu-config.schemas.ts` listed in Modified Files table (line 49)
- Schema locations correctly reference `src/shared/__schemas/`, `src/complexity/__schemas/` with no "or inline" option (line 37)

### migration-from-v1.md

**Status: CLEAN**

- All config keys use camelCase: `parallelResearchers` (line 66), `reviewLoop` (line 67), `maxIterations` (line 68), `continueForImportant` (line 69), `planReviewLoop` (line 75), `perTaskRecall` (line 78), `maxEngramsPerTask` (line 80), `scoringThreshold` (line 73), `autoCleanupAfterMilestone` (line 159)
- Research file path correctly uses `.planning/phases/NN-name/research/` (line 294)
- `workflow.research` vs. `research.*` distinction clearly documented (line 86)
- `--v2` flag parsing location clarified (line 57)

### new-skills-needed.md

**Status: CLEAN**

- **ISSUE-R2-001 (flat paths):** All 4 flagged lines fixed. No `.planning/research/` remains. All references use `.planning/phases/NN-name/research/` (lines 41, 88, 141, 197, 247, 253, 259, 368, 395, 514, 534, 627)
- **ISSUE-R2-002 (MAJOR -> IMPORTANT):** Lines 302, 311, 383 all now use IMPORTANT, not MAJOR
- **ISSUE-R2-003 (snake_case config):** Line 83 now reads `research.parallelResearchers: false` (camelCase), not `parallel_researchers`
- Output filenames are numbered: `01-architecture-patterns.md` through `04-pitfalls-and-risks.md` (lines 62-65), deep expansion at `05+` (lines 153, 165-166, 209, 228)
- Convergence logic uses correct severity terminology: CRITICAL/IMPORTANT/MINOR throughout (lines 202, 334, 336, 338, 340-343, 383, 386-387)

### new-agents-needed.md

**Status: CLEAN**

- **ISSUE-R2-001 (flat paths):** Line 519 fixed. Research reviewer shared sections reference `.planning/phases/NN-name/research/` (line 519)
- **ISSUE-R2-002 (MAJOR -> IMPORTANT):** All 4 flagged locations fixed:
  - Line 545: `IMPORTANT` (was MAJOR)
  - Line 593: `CRITICAL/IMPORTANT/MINOR` (was CRITICAL/MAJOR/MINOR)
  - Line 661: `CRITICAL/IMPORTANT/MINOR` (was CRITICAL/MAJOR/MINOR)
  - Line 729: `CRITICAL/IMPORTANT/MINOR` (was CRITICAL/MAJOR/MINOR)
- **Graduator is T2/warm:** Confirmed at lines 771-779. Cognition `default_tier: "T2"`, context `default_tier: "T2"`, `isolation: "warm"`. Comment at line 753 cites canonical spec from `04-agent-orchestration/graduation-agent.md`.
- **Accuracy reviewer has WebFetch:** Confirmed at line 623: `tools: ["Read", "Grep", "WebFetch"]` with override comment. Explanatory callout at lines 615-617 documents the rationale.
- **Output filenames numbered:** Each researcher agent specifies its numbered output file:
  - `01-architecture-patterns.md` (line 170, 185)
  - `02-implementation-approaches.md` (line 252, 267)
  - `03-existing-solutions.md` (line 335, 350)
  - `04-pitfalls-and-risks.md` (line 413, 428)
- Model routing presets correct: ROUTER for 4 researchers (lines 907-913), DEEP_ANALYSIS for 3 reviewers (lines 915-919), ORCHESTRATOR for graduator (lines 921-923)

### config-changes.md

**Status: CLEAN**

- All Zod schema keys use camelCase: `parallelResearchers`, `reviewLoop`, `maxIterations`, `continueForImportant`, `planReviewLoop`, `scoringThreshold`, `autoCleanupAfterMilestone`, `perTaskRecall`, `maxEngramsPerTask`, `researchReviewIterations`, `planReviewIterations`
- Convention note at line 107 explicitly references Decision 9 and explains camelCase rationale
- Precedence section at lines 240-247 documents complexity matrix vs. research config priority
- Decision 13 (always 4/3 counts) explicitly called out at lines 129, 246-247, 325, 337, 359
- Config parser updates documented in Section 7 (lines 732-751) with `lu-config.schemas.ts` integration
- Example JSON blocks consistent with schema definitions
- Iteration budget values match Decision 14 exactly

### phased-rollout.md

**Status: CLEAN**

- **ISSUE-R2-001 (flat paths):** Lines 33 and 472 fixed. Line 33 reads `.planning/phases/NN-name/research/` and line 476 reads `.planning/phases/NN-name/research/` populated
- **ISSUE-R2-003 (snake_case config):** Lines 415, 419, 433 all use camelCase: `research.parallelResearchers` (line 415), `research.reviewLoop` (line 419), `research.planReviewLoop` (line 433)
- **ISSUE-R2-004 (step numbering):** Explanatory note added at line 408 clarifying that step numbers refer to canonical pipeline numbering (Decision 1) not execution order, and explaining which steps are omitted from the pseudocode and why
- **Step number comments match canonical pipeline:**
  - Step 1 (Ideate): handled before branch (line 411)
  - Step 2 (Research): line 414
  - Step 3 (Discuss + Pre-mortem): line 426
  - Step 4 (Deep Expand): runs within review loop (line 408 note, line 418)
  - Step 5 (Review Research): line 418
  - Step 6 (Graduate): line 422
  - Step 7 (Plan): line 429
  - Step 8 (Review Plan): line 432
  - Step 9 (Execute): line 436
  - Step 10 (Verify + UAT): line 439
- `bun run build:all` step present in all 6 phases (lines 84, 146, 210, 265, 328, 470+)
- `build-skill-registry.ts` in Phases 1-4 modified files tables
- Pre-implementation compiler check in Phase 1 (lines 69-70)

---

## Canonical Decision Compliance (Full Matrix)

| Decision                    | Status        | Verification                                                                                    |
| --------------------------- | ------------- | ----------------------------------------------------------------------------------------------- |
| D1: 10-step pipeline        | Compliant     | Pseudocode step comments match canonical numbering; explanatory note added                      |
| D2: Agent names             | Compliant     | All 8 canonical agent names used consistently                                                   |
| D3: Convergence model       | **Compliant** | All MAJOR instances replaced with IMPORTANT; CRITICAL/IMPORTANT/MINOR throughout                |
| D4: Concept prefix scheme   | Compliant     | `research:*` prefixes, deferred promotion, repo vault routing all correct                       |
| D5: Graduation scoring      | Compliant     | Weighted sum formula correctly cited                                                            |
| D6: Actionability scoring   | N/A           | Runtime concern, not directly in implementation plan                                            |
| D7: Research file directory | **Compliant** | All `.planning/research/` flat paths eliminated; only `.planning/phases/NN-name/research/` used |
| D8: Gap ID format           | N/A           | Not directly relevant to implementation plan                                                    |
| D9: Config key casing       | **Compliant** | All snake_case pseudocode config refs replaced with camelCase                                   |
| D10: Model routing presets  | Compliant     | ROUTER for researchers, DEEP_ANALYSIS for reviewers, ORCHESTRATOR for graduator                 |
| D11: Researcher isolation   | Compliant     | Cold isolation stated throughout                                                                |
| D12: Research file naming   | Compliant     | Numbered filenames (01-04) used consistently                                                    |
| D13: Reviewer count         | Compliant     | Always 4/3, not complexity-dependent; explicit callouts present                                 |
| D14: Iteration budgets      | Compliant     | Matrix values match Decision 14 exactly                                                         |
| D15: Unsourced claims       | N/A           | No unsourced quantitative claims in implementation plan                                         |
| D16: Revision loop targets  | Compliant     | Deep expansion via targeted researchers within review loop                                      |
| D17: TRIVIAL handling       | Compliant     | All steps run at all levels; TRIVIAL gets fast tier, 1 iteration                                |
| D18: Missing items          | Compliant     | Skill registry, build:all, config parser all addressed                                          |
| D19: Canonical source       | Compliant     | References other sections rather than redefining                                                |

---

## Remaining Issues

**None.** All four Round 2 issues (ISSUE-R2-001 through ISSUE-R2-004) are resolved.

### Note on Graduator Cognition Tier

The R2 review marked IMP-IP-002 as "FIXED" with T1 cognition. The current file shows T2 cognition (lines 771-773) with `isolation: "warm"` (line 779). The spot-check instruction specifies T2/warm as correct, and the file's comment at line 753 cites the canonical spec from `04-agent-orchestration/graduation-agent.md`. This is consistent: the graduator needs T2 for MuninnDB read+write access during batch graduation writes. T2/warm is the correct configuration.

---

## Verdict: APPROVED

The 06-implementation-plan section passes all seven spot-check criteria:

1. No remaining `.planning/research/` flat paths -- all use `.planning/phases/NN-name/research/`
2. No remaining `MAJOR` severity -- all instances replaced with `IMPORTANT`
3. No remaining snake_case config keys in pseudocode -- all use camelCase
4. Graduator is T2/warm -- confirmed at lines 771-779
5. Accuracy reviewer has WebFetch in tool list -- confirmed at line 623
6. Output filenames are numbered -- 01 through 04 used consistently
7. Step number comments match canonical pipeline -- all 10 steps accounted for with explanatory note
