# Review Round 2: 04-agent-orchestration

## Reviewer: Agent Architecture Reviewer (Cold Isolation)

## Date: 2026-03-23

## Iteration: 2

---

## Round 1 Fix Verification

### CRIT-AO-001: Researcher Model Routing Preset Contradiction

**Status: FIXED in 04-agent-orchestration; NOT FIXED in 06-implementation-plan/new-agents-needed.md**

The 04-agent-orchestration section now consistently uses `ROUTER` for all 4 researchers across `research-team.md`, `orchestration-flow.md`, and `README.md`. The rationale is documented (cost savings, deliberate divergence from v1's ORCHESTRATOR) with a reference to Decision 10.

However, `new-agents-needed.md` (lines 904-910) now also correctly specifies ROUTER for researchers and includes the Decision 10 comment. The summary table at line 936-945 is also consistent. **This fix is complete across both documents.**

**Verdict: RESOLVED**

### CRIT-AO-002: Graduator Model Routing Preset Contradiction

**Status: FIXED**

`graduation-agent.md` specifies `ORCHESTRATOR` (line 60). `new-agents-needed.md` specifies `ORCHESTRATOR` at line 750 and line 919. The summary table at line 945 also says `ORCHESTRATOR`. `orchestration-flow.md` line 146 labels the graduator as `ORCHESTRATOR`. All documents agree.

**Verdict: RESOLVED**

### CRIT-AO-003: Researcher Isolation Mode Contradiction

**Status: FIXED in 04-agent-orchestration; NOT FIXED in 06-implementation-plan/new-agents-needed.md**

`research-team.md` correctly specifies `isolation: "cold"` for all 4 researchers. The shared researcher frontmatter in `new-agents-needed.md` (line 138) also correctly specifies `isolation: "cold" as const`.

**Verdict: RESOLVED**

### CRIT-AO-004: Researcher Output File Naming Conflict

**Status: PARTIALLY FIXED**

`research-team.md` uses the canonical numbered names: `01-architecture-patterns.md`, `02-implementation-approaches.md`, `03-existing-solutions.md`, `04-pitfalls-and-risks.md`. `orchestration-flow.md` uses the same numbered names at lines 303-306. `README.md` ASCII diagram at line 51 uses `01-04` reference. `multi-agent-research.md` (in 02-research-system) uses the same numbered names.

**However, `new-agents-needed.md` still uses the old non-numbered names in the agent code:**

- Line 185: `architecture.md` (should be `01-architecture-patterns.md`)
- Line 252: `implementation.md` (should be `02-implementation-approaches.md`)
- Line 335: `ecosystem.md` (should be `03-existing-solutions.md`)
- Line 428: `risk.md` (should be `04-pitfalls-and-risks.md`)

These appear in the agent description strings and role prompts (`You produce a single file: \`architecture.md\``). The revision agent likely ran out of tool budget before reaching these.

**Verdict: NOT FULLY RESOLVED -- residual contradiction in new-agents-needed.md**

### CRIT-AO-005: Pipeline Step Numbering Divergence

**Status: FIXED**

`orchestration-flow.md` now includes a canonical pipeline note at line 5: "The v1 15-step pipeline maps as sub-processes within these steps -- v1's model resolution, cognitive pre-flight, and validation happen WITHIN v2 steps (primarily Step 1), not as top-level steps. The v2 numbering is the user-facing pipeline; v1's 15-step list is the internal implementation checklist."

This explicitly reconciles the v2 10-step pipeline with v1's 15-step pipeline, and matches Decision 1.

**Verdict: RESOLVED**

---

## Round 1 Important Finding Verification

### IMP-AO-001: lu-research-synthesizer Missing Spec

**Status: FIXED**

`README.md` Enhanced Agents table (line 27) now includes an explicit entry for `lu-research-synthesizer` that states: "**Unchanged from v1** -- still combines research outputs into SUMMARY.md. Now processes 4 researcher files instead of 1, and re-runs after deep expand (Step 4). Existing agent file: `src/agents/general/lu-research-synthesizer.agent.ts`". This is exactly what the Round 1 review recommended -- explicit documentation that the agent is unchanged with a reference to the existing file.

**Verdict: RESOLVED**

### IMP-AO-002: Researcher Tool List Divergence

**Status: NOT FULLY RESOLVED**

`research-team.md` gives Context7 only to the implementation researcher. The shared frontmatter in `new-agents-needed.md` (line 119-128) gives ALL researchers Context7 and Bash. This is still a contradiction.

Additionally, `multi-agent-research.md` (line 236-244) says "All four researchers share the same tool set" including Context7, which aligns with `new-agents-needed.md` but contradicts `research-team.md`.

**The canonical source for agent specs is 04-agent-orchestration (per Decision 19).** The `research-team.md` approach (Context7 for implementation only) is the more disciplined design, but the other two documents disagree.

**Verdict: RESIDUAL CONTRADICTION -- needs decision on whether Context7 goes to all researchers or implementation-only**

### IMP-AO-003: Reviewer promotable_to T1 vs T0

**Status: NOT FIXED**

The shared reviewer frontmatter in `new-agents-needed.md` (line 494) still has `promotable_to: "T1"` for cognition. Meanwhile, `review-team.md` in 04-agent-orchestration specifies `promotable_to: "T0"` for completeness and accuracy reviewers (lines 67, 239). The actionability reviewer in `review-team.md` correctly has `promotable_to: "T1"` (line 437) since it is T1.

The shared frontmatter in `new-agents-needed.md` applies to all three reviewers uniformly, but two of the three should have `promotable_to: "T0"`. This is a structural issue: the shared frontmatter cannot represent heterogeneous cognition tiers. The individual agent specs in `new-agents-needed.md` should override the shared frontmatter for the actionability reviewer, or the shared frontmatter should use T0 with a note that actionability overrides to T1.

**Verdict: NOT FIXED**

### IMP-AO-004: Graduator Concept Prefix Scheme

**Status: FIXED**

Both `graduation-agent.md` (lines 196-221) and `new-agents-needed.md` (lines 798-811) now use the `research:*` namespace with deferred promotion, matching Decision 4. The graduation agent writes to `research:approach-*`, `research:pitfall-*`, `research:decision-*`, etc. in the repo vault. `lu-learner` handles later promotion to permanent prefixes in the default vault.

**Verdict: RESOLVED**

### IMP-AO-005: Review Loop Config Key

**Status: FIXED**

`review-team.md` (line 666) now references `research.reviewLoop.maxIterations` as the config key. `orchestration-flow.md` (line 107) also uses the same key. The iteration budget table in `review-team.md` (lines 674-681) references Decision 14 for per-complexity values.

**Verdict: RESOLVED**

### IMP-AO-006: Token Budget Discrepancy

**Status: FIXED**

`orchestration-flow.md` now includes a note at line 596: "Per-agent budgets are total input+output at MODERATE complexity. The ~20K per researcher figure aligns with the multi-agent-research spec in 02-research-system/." The research-team.md Complexity Scaling table (lines 902-908) lists `~8K per agent` at MODERATE as the _output-only_ budget, while multi-agent-research.md (line 287) explains the ~20K figure is the full context budget (input + output + tool calls). The distinction is now documented.

**Verdict: RESOLVED**

### IMP-AO-007: Reviewer Tool List Divergence

**Status: PARTIALLY FIXED**

`review-team.md` gives per-reviewer custom tool lists:

- completeness: `["Read", "Grep", "Glob", "WebSearch"]`
- accuracy: `["Read", "Grep", "WebFetch"]`
- actionability: `["Read", "Grep", "Glob"]`

`new-agents-needed.md` shared frontmatter (line 490) gives `["Read", "Grep", "Glob"]` to all reviewers. Then the individual specs do NOT override:

- completeness reviewer (line 558): uses `...sharedReviewerFrontmatter` with no tool override
- accuracy reviewer (line 620): uses `...sharedReviewerFrontmatter` with no tool override -- notably, the accuracy reviewer spec adds a long note (line 617) explaining it is "document-based assessment" and intentionally has no WebSearch/WebFetch. This contradicts `review-team.md` which gives accuracy WebFetch for source verification.
- actionability reviewer (line 684): uses `...sharedReviewerFrontmatter` with no tool override

This is a design divergence, not just a typo: `new-agents-needed.md` intentionally changed the accuracy reviewer to be document-based-only (no WebFetch), while `review-team.md` gives it WebFetch for live source verification. These represent fundamentally different review philosophies. Per Decision 19, `04-agent-orchestration/` is the canonical source for agent specs, so `review-team.md`'s approach (accuracy reviewer gets WebFetch) should be authoritative.

**Verdict: RESIDUAL CONTRADICTION between review-team.md and new-agents-needed.md**

---

## Round 1 Minor Finding Verification

### MIN-AO-001 (warm isolation footnotes): FIXED. README.md lines 140-142 now has footnotes distinguishing the two "warm" modes.

### MIN-AO-002 (T2 clarification): FIXED. README.md line 130 now includes the note about T2 including both read and write MuninnDB access.

### MIN-AO-003 (cross-reference factory/shared-sections): FIXED. `research-team.md` line 850 now includes a cross-reference to the implementation plan's shared constants approach.

### MIN-AO-004 (reviewer sees pre/post-discussion research): FIXED. `review-team.md` line 5 now explicitly states reviewers see the "post-discussion, post-deep-expand" research corpus and clarifies what they do and do not see.

### MIN-AO-005 (graduation scoring formula zero problem): FIXED. `graduation-agent.md` now uses weighted sum per Decision 5 (`confidence * 0.40 + actionability * 0.35 + uniqueness * 0.25`) instead of multiplication. Line 128 explicitly states "weighted sum (not product)". Actionability has a floor of 0.1 (line 152) ensuring pitfalls/warnings are not zeroed out.

### MIN-AO-006 (new gates tracked as impl tasks): FIXED. `orchestration-flow.md` line 448 now includes an implementation tracking note referencing 06-implementation-plan.

---

## New Issues Found

### NEW-AO-R2-001: Graduator Cognition Tier and Isolation Contradiction (new-agents-needed.md)

**Severity: IMPORTANT**
**Location: `new-agents-needed.md` lines 768-777 vs `graduation-agent.md` lines 37-49**

`graduation-agent.md` specifies the graduator as:

- `cognition.default_tier: "T2"`, `promotable_to: "T2"`
- `context.isolation: "warm"`

`new-agents-needed.md` specifies the graduator as:

- `cognition.default_tier: "T1"`, `promotable_to: "T1"` (line 769)
- `context.isolation: "none"` (line 776)

The `new-agents-needed.md` code comment (line 751) says "Cognition T1 to match existing agent conventions (IMP-IP-002: no existing agent uses T2)." This is a deliberate design choice in that document, but it directly contradicts the canonical spec in `graduation-agent.md` which provides thorough justification for T2/warm (the "Why T2 Cognition" and "Why Warm Isolation" sections).

Per Decision 19, `04-agent-orchestration/` is the canonical source for agent specifications. `graduation-agent.md`'s T2/warm is the authoritative configuration.

**Fix:** Update `new-agents-needed.md` graduator frontmatter to `T2`/`warm` to match `graduation-agent.md`.

### NEW-AO-R2-002: Gap Severity Terminology Inconsistency (new-agents-needed.md)

**Severity: IMPORTANT**
**Location: `new-agents-needed.md` lines 541-547**

Decision 3 (Convergence Model) specifies gap severity levels as **CRITICAL / IMPORTANT / MINOR**. The `04-agent-orchestration/` files (review-team.md) consistently use CRITICAL/IMPORTANT/MINOR throughout.

However, `new-agents-needed.md` uses **CRITICAL / MAJOR / MINOR** in:

- Shared reviewer scoring protocol (line 545): `**MAJOR**: Significantly impacts plan quality`
- Completeness reviewer output (line 593): `[CRITICAL/MAJOR/MINOR]`
- Accuracy reviewer output (line 659): `[CRITICAL/MAJOR/MINOR]`
- Actionability reviewer output (line 727): `[CRITICAL/MAJOR/MINOR]`

This is a terminology mismatch. The canonical term is IMPORTANT (per Decision 3 and `05-review-loops/`). MAJOR is never used in the canonical decisions.

**Fix:** Replace all instances of "MAJOR" with "IMPORTANT" in `new-agents-needed.md`.

### NEW-AO-R2-003: Accuracy Reviewer Design Philosophy Divergence

**Severity: IMPORTANT**
**Location: `new-agents-needed.md` lines 616-617 vs `review-team.md` lines 29-41, 227-421**

This is a substantive design disagreement, not just a typo:

- `review-team.md` designs the accuracy reviewer as a **live source verifier** with WebFetch access. It fetches URLs cited in research to check whether sources actually support claims. It is described as "the hallucination detector."
- `new-agents-needed.md` (line 617) explicitly redesigns it as a **document-based assessor** with no WebFetch, stating: "accuracy review is document-based assessment of whether the research files cite authoritative sources, not live source verification. This aligns with cold isolation semantics."

Both approaches have merit, but they produce materially different agents. The live-verification approach catches hallucinated URLs and outdated claims. The document-based approach is faster, cheaper, and aligns better with cold isolation (no new information introduced).

Per Decision 19, `04-agent-orchestration/review-team.md` is canonical for agent specifications.

**Fix:** `new-agents-needed.md` should align with `review-team.md`'s live-verification design, or the two documents should explicitly acknowledge the divergence and note that the implementation plan will follow the 04-agent-orchestration canonical spec.

### NEW-AO-R2-004: Deep Expand Not Reflected in multi-agent-research.md

**Severity: MINOR**
**Location: `02-research-system/multi-agent-research.md`**

While the 04-agent-orchestration section thoroughly incorporates Step 4 (Deep Expand) into its orchestration flow, sequence diagram, data flow, error handling, and model tier tables, the `multi-agent-research.md` document in 02-research-system does not mention deep expand at all. Its spawning diagram (lines 177-189) shows the flow going directly from researchers to "Synthesis + Review Loop" with no intermediate deep expand step.

This is a minor issue because `multi-agent-research.md`'s focus is the initial 4-researcher spawn pattern, and deep expand is covered in `01-workflow-steps/`. But it creates an incomplete picture for someone reading the research system section in isolation.

**Fix:** Add a brief note in `multi-agent-research.md` after the spawning diagram mentioning that deep expand (Step 4) may add additional researcher output files (05+) before the review loop, with a cross-reference to `01-workflow-steps/04-deep-expand.md`.

### NEW-AO-R2-005: Completeness Reviewer Input Contract References Wrong Path

**Severity: MINOR**
**Location: `review-team.md` line 117**

The completeness reviewer's input contract says: `Research files: All files in .planning/research/`. This uses a non-phase-scoped path. Decision 7 establishes the canonical layout as `.planning/phases/NN-name/research/`. The rest of the document (line 690-701) correctly uses the phase-scoped path.

The same issue appears in the accuracy reviewer input contract (line 289) and actionability reviewer input contract (line 489).

**Fix:** Update the three input contracts to use `.planning/phases/NN-name/research/` or a general reference like "the phase research directory."

---

## Cross-Section Consistency Check

### 04-agent-orchestration vs 01-workflow-steps

**Pipeline numbering**: Consistent. Both use the 10-step pipeline from Decision 1. Deep Expand is present as Step 4 in both orchestration-flow.md and the workflow steps section.

### 04-agent-orchestration vs 02-research-system

**Agent names**: Consistent. Both use the canonical agent names from Decision 2.

**Output file names**: Consistent within 04-agent-orchestration. `multi-agent-research.md` uses the same numbered names.

**Token budgets**: Consistent after revision. The budget distinction (context vs output-only) is now documented.

**Tool access**: INCONSISTENT. `multi-agent-research.md` gives all researchers Context7 (line 243-244). `research-team.md` gives Context7 to implementation researcher only. See IMP-AO-002 above.

### 04-agent-orchestration vs 03-muninndb-integration

**Concept prefix scheme**: Consistent. Both use `research:*` with deferred promotion per Decision 4.

**Graduation scoring**: Consistent. Weighted sum formula with threshold 0.55 per Decision 5.

**Vault routing**: Consistent. All graduation writes to repo vault.

### 04-agent-orchestration vs 05-review-loops

**Convergence model**: Consistent. Both use gap-severity (CRITICAL/IMPORTANT/MINOR) per Decision 3. The 7-dimension scoring model is not present in any 04-agent-orchestration file.

**Iteration budgets**: Consistent. Match Decision 14 values.

**Reviewer count**: Consistent. 3 reviewers at all complexity levels per Decision 13.

### 04-agent-orchestration vs 06-implementation-plan

**Model routing presets**: Consistent at the top level (researchers=ROUTER, reviewers=DEEP_ANALYSIS, graduator=ORCHESTRATOR). Both match Decision 10.

**Remaining contradictions (all in new-agents-needed.md):**

1. Graduator cognition T1/none vs T2/warm (NEW-AO-R2-001)
2. Gap severity MAJOR vs IMPORTANT (NEW-AO-R2-002)
3. Accuracy reviewer document-based vs live-verification (NEW-AO-R2-003)
4. Output file names architecture.md vs 01-architecture-patterns.md (CRIT-AO-004 residual)
5. Reviewer promotable_to T1 vs T0 (IMP-AO-003 residual)
6. Context7 for all researchers vs implementation-only (IMP-AO-002 residual)

All six residual contradictions are in `06-implementation-plan/new-agents-needed.md`, not in the 04-agent-orchestration section itself. The 04-agent-orchestration section is internally consistent and aligned with all canonical decisions.

### 04-agent-orchestration vs CANONICAL-DECISIONS.md

| Decision                            | Compliance                                                               |
| ----------------------------------- | ------------------------------------------------------------------------ |
| Decision 1 (10-step pipeline)       | COMPLIANT -- all files use 10-step numbering with v1 reconciliation note |
| Decision 2 (agent names)            | COMPLIANT -- all canonical agent names used consistently                 |
| Decision 3 (convergence model)      | COMPLIANT -- gap-severity with CRITICAL/IMPORTANT/MINOR throughout       |
| Decision 4 (concept prefixes)       | COMPLIANT -- research:\* with deferred promotion                         |
| Decision 5 (graduation scoring)     | COMPLIANT -- weighted sum, threshold 0.55                                |
| Decision 6 (actionability criteria) | COMPLIANT -- exact table reproduced in graduation-agent.md               |
| Decision 7 (file layout)            | COMPLIANT -- phase-scoped, flat, no deep/ subdir                         |
| Decision 10 (model routing)         | COMPLIANT -- ROUTER/DEEP_ANALYSIS/ORCHESTRATOR                           |
| Decision 11 (researcher isolation)  | COMPLIANT -- cold isolation throughout                                   |
| Decision 12 (file naming)           | COMPLIANT -- numbered filenames                                          |
| Decision 13 (reviewer count)        | COMPLIANT -- 3 reviewers at all levels                                   |
| Decision 14 (iteration budgets)     | COMPLIANT -- matching values                                             |
| Decision 16 (revision loop targets) | COMPLIANT -- focused re-expansion within Step 5, not re-entry to Step 4  |
| Decision 17 (TRIVIAL handling)      | COMPLIANT -- all steps run at all complexity levels                      |
| Decision 19 (canonical source)      | COMPLIANT -- 04-agent-orchestration designated for agent specs           |

---

## Domain Architecture Compliance (Codebase Rule Cross-Check)

**Entity Domain (Archetype A)**: All 8 new agents would live in `src/agents/general/` following `{name}.agent.ts` kebab-case naming. Compliant with domain-architecture.md.

**Helper files**: `researcher-shared-sections.ts` and `research-reviewer-shared-sections.ts` proposed in `src/agents/__helpers/`. Compliant with archetype A structure.

**Barrel index**: No changes to `src/agents/index.ts` barrel. Registry updates go to `build-agent-registry.ts`. Compliant with barrel invariant.

**Module boundary**: No cross-domain imports introduced. Researchers and reviewers import only from T0 (shared) and T1 (context) tiers. Compliant.

**No classes rule**: All agents use `AgentConfig` object + `createAgent()` factory function. Compliant.

**File naming**: All proposed files use kebab-case. Compliant.

---

## Verdict: APPROVED (for 04-agent-orchestration section)

The 04-agent-orchestration section itself is internally consistent, well-structured, and fully compliant with all 15 applicable canonical decisions. All five Round 1 CRITICAL findings are resolved within this section. All seven IMPORTANT findings are resolved or documented. Deep Expand (Step 4) is thoroughly integrated into the orchestration flow, sequence diagram, data flow, error handling, barrier points, model tier tables, and token budget estimates.

The remaining issues are all **cross-section contradictions in `06-implementation-plan/new-agents-needed.md`**, not in the 04-agent-orchestration section. These should be tracked as revision items for the 06-implementation-plan review, not as blockers for this section:

| Issue                | Location                                                  | Severity  | Nature                                         |
| -------------------- | --------------------------------------------------------- | --------- | ---------------------------------------------- |
| CRIT-AO-004 residual | new-agents-needed.md output file names                    | IMPORTANT | architecture.md vs 01-architecture-patterns.md |
| IMP-AO-002 residual  | new-agents-needed.md + multi-agent-research.md tool lists | IMPORTANT | Context7 for all vs implementation-only        |
| IMP-AO-003 residual  | new-agents-needed.md reviewer promotable_to               | IMPORTANT | T1 vs T0 for completeness/accuracy             |
| NEW-AO-R2-001        | new-agents-needed.md graduator frontmatter                | IMPORTANT | T1/none vs T2/warm                             |
| NEW-AO-R2-002        | new-agents-needed.md severity terminology                 | IMPORTANT | MAJOR vs IMPORTANT                             |
| NEW-AO-R2-003        | new-agents-needed.md accuracy reviewer design             | IMPORTANT | document-based vs live-verification            |
| NEW-AO-R2-004        | multi-agent-research.md deep expand mention               | MINOR     | Missing cross-reference                        |
| NEW-AO-R2-005        | review-team.md input contract paths                       | MINOR     | .planning/research/ vs phase-scoped            |
