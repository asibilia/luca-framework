# Review Round 2: 01-workflow-steps

## Reviewer: Workflow Completeness Reviewer (Round 2)

## Date: 2026-03-23

## Iteration: 2

## Summary Assessment

The Round 1 revision addressed the three critical findings (step numbering, revision loop targets, agent names) and most important/minor findings. The section now uses canonical agent names, references external canonical sources instead of redefining convergence models, and correctly documents that all 10 steps run at all complexity levels. However, several issues remain: Step 6 has a significant internal contradiction (claims `research:*` namespace but actually writes `pattern:*`/`pitfall:*`/`decision:*` directly), Step 8 still uses a 7-dimension scoring model that contradicts Decision 3, and a few minor consistency issues persist. The running example is coherent across all 10 steps.

---

## Round 1 Fix Verification

### CRIT-WS-001: Step numbering mismatch

**FIXED.** README.md now uses the canonical 10-step numbering from Decision 1 (Ideate, Research, Discuss, Deep Expand, Review Research, Graduate, Plan, Review Plan, Execute, Verify). The data flow diagram in README.md correctly shows all 10 steps including Deep Expand at position 4. The step overview table matches the canonical numbering.

### CRIT-WS-002: Revision loop targets wrong step

**FIXED.** Section 5.5 of `05-review-research.md` now explicitly states (lines 186-188): "Per Decision 16: when findings target deep expansion files (from Step 4), the revision spawns targeted researcher agents for those specific gaps. The revision does NOT re-enter Step 4 as a whole -- it is a focused re-expansion within the Step 5 review loop." This directly implements Decision 16.

### CRIT-WS-003: Agent names inconsistent

**FIXED.** All step documents now use the canonical agent names from Decision 2:

- Step 2: `lu-architecture-researcher`, `lu-implementation-researcher`, `lu-ecosystem-researcher`, `lu-risk-researcher` (not `lu-phase-researcher`)
- Step 5: `lu-completeness-reviewer`, `lu-accuracy-reviewer`, `lu-actionability-reviewer` (not `lu-verifier`)
- Step 6: `lu-research-graduator` is named correctly in 6.3 (line 51)
- Step 5 revision cycle (5.5) correctly uses researcher agent types for revisions
- `lu-phase-researcher` appears only in v1 comparison text (Step 2 v1 Mapping, Step 5 v1 Mapping), which is appropriate

### IMP-WS-001: TRIVIAL skip-path ambiguity

**FIXED.** README.md Complexity Scaling section (lines 111-117) now explicitly states: "All 10 steps run at all complexity levels (preserving the v1 invariant). No steps are skipped based on complexity alone." Step 1 failure mode table (line 164) now says TRIVIAL runs all steps with `fast` tier, minimal facets, and 1-iteration review loops instead of claiming steps 2-8 are skipped. Step 4 (line 207) shows TRIVIAL gets 1 deep-dive topic with `fast` tier and notes "step still runs". This aligns with Decision 17.

### IMP-WS-002: Research file naming convention

**FIXED.** All step documents now consistently use numbered filenames (`01-architecture-patterns.md`, `02-implementation-approaches.md`, `03-existing-solutions.md`, `04-pitfalls-and-risks.md`). Step 2 research output examples (lines 189-194) and Step 4 file placement (lines 47-57) are consistent. README.md File Conventions section (lines 122-134) documents the canonical layout. This aligns with Decision 12.

### IMP-WS-003: Review files not specified in outputs

**PARTIALLY FIXED.** Step 5 now includes `REVIEW-LOG.md` in its outputs table (line 271) and mentions it at line 265. Step 8 still lists review scores as "In-memory (logged to session)" in its outputs table (line 223). The inconsistency between Step 5 (file-based REVIEW-LOG.md) and Step 8 (in-memory) remains -- see NEW-WS-002 below.

### IMP-WS-004: GRADUATION-REPORT.md artifact

**FIXED.** README.md step overview table (line 22) now includes `GRADUATION-REPORT.md` in Step 6 outputs. The Step 6 graduation prompt (line 82) instructs the graduator to "Write GRADUATION-REPORT.md to research directory."

### IMP-WS-005: Orchestration flow omits Deep Expand

**FIXED.** This was a restatement of CRIT-WS-001. The step numbering is now consistent and the data flow diagram includes Deep Expand.

### IMP-WS-006: Step 9/10 boundary overlap

**PARTIALLY ADDRESSED.** Step 10 section 10.1 (lines 26-28) now explains: "The lu-verifier agent was spawned at the end of Step 9. Its VERIFICATION.md output is available." This acknowledges the overlap. However, Step 9 still spawns `lu-learner` (section 9.11) AND Step 10 also spawns `lu-learner` (section 10.6). The text does not explicitly state that these are two distinct lu-learner invocations with different purposes (execution learnings vs post-UAT learnings). See NEW-WS-003 below.

### IMP-WS-007: lu-verifier overloaded with multiple roles

**FIXED.** Step 5 now uses dedicated reviewer agents (`lu-completeness-reviewer`, `lu-accuracy-reviewer`, `lu-actionability-reviewer`) per Decision 2. `lu-verifier` is only used for goal-backward verification in Steps 9/10, which is its appropriate role.

### MIN-WS-001: Context7 undefined

**FIXED.** Step 2 (line 124) now includes a parenthetical: "Context7 is an MCP tool that provides library-specific documentation lookups; see the MCP tool configuration for setup details."

### MIN-WS-002: session:info concept prefix collision

**NOT FIXED.** Step 7 (line 56) still uses `session:info` with generic content. This is minor and does not block implementation, but the concept could collide with other session info writes.

### MIN-WS-003: README overview table formatting

**FIXED.** The README overview table (lines 15-26) renders correctly with consistent column counts.

### MIN-WS-004: Structured intent indentation

**FIXED.** Step 1 structured intent example (lines 203-215) now has Prior art and Appetite as top-level fields under the `## Current Task` section, properly formatted.

### MIN-WS-005: Link count discrepancy

**NOT FIXED.** Step 6 section 6.5 (lines 149-169) shows exactly 3 `muninn_link` calls. Section 6.6 (line 177) says "5 links created." Section 6.7 (line 200) says "Links: 5 (state machine -> timer cleanup, backoff, pitfall)." Only 3 links are shown in the code. The discrepancy between 3 shown and 5 claimed persists.

### MIN-WS-006: Appetite enforcement missing

**NOT FIXED.** Step 9 lists appetite in inputs (line 17) and passes it to executor prompts (line 79) but the execution process never describes how the appetite ceiling is enforced. No budget check, context percentage monitoring, or early termination on budget exhaustion is documented.

### MIN-WS-007: procedure:\* vault routing

**NOT FIXED.** Step 10 section 10.6 (line 232) stores `procedure:ws-reconnection-implementation` in the repo vault (`luca-framework`). The vault routing table says `procedure:*` should go to the default vault. Step 10 outputs table (line 276) hedges with "MuninnDB repo vault or default vault" but the actual code example routes to repo vault. The canonical write routing table (Decision 4 scope, vault-routing rule) says `procedure:*` -> default vault.

---

## New Issues Found

### NEW-WS-001 (CRITICAL): Step 6 graduation namespace contradiction

**Location:** `06-graduate.md` sections 6.2, 6.3, 6.4

Step 6 claims to use the `research:*` namespace per Decision 4 (lines 5, 37). Section 6.2 (lines 38-47) shows the classification table with `research:*` prefixed concepts (e.g., `research:pitfall-bun-ws-close-not-on-network-disconnect`, `research:pattern-ws-reconnection-state-machine`). The introductory text (lines 6-7) explicitly states: "Graduation writes to `research:*` prefixes in the repo vault."

However, the actual MuninnDB batch operations in section 6.4 (lines 98-145) write to **`pattern:*`**, **`pitfall:*`**, and **`decision:*`** namespaces directly -- NOT `research:*`. For example:

- `pitfall:bun-ws-close-not-on-network-disconnect` (line 107, default vault)
- `pattern:ws-reconnection-state-machine` (line 111, default vault)
- `decision:bun-ws-close-code-reconnection-map` (line 132, repo vault)

This directly contradicts Decision 4 which states: "Graduation does NOT write directly to `pattern:*`/`pitfall:*`/`decision:*`." Decision 4 requires graduation to write `research:approach-*`, `research:api-*`, `research:pitfall-*`, etc., with promotion to permanent namespaces happening in Step 10 via `lu-learner`.

Additionally, section 6.4 is introduced as "The `lu-learner` agent writes engrams" (line 97) despite section 6.3 establishing that `lu-research-graduator` (not `lu-learner`) performs graduation. The Agents Involved table (line 223) also incorrectly lists `lu-learner (adapted)` instead of `lu-research-graduator`.

**Impact:** An implementer following sections 6.2-6.3 (use `research:*` prefix, use `lu-research-graduator`) would produce different behavior than following section 6.4 and the agents table (use permanent namespaces, use `lu-learner`). This also breaks the deferred promotion model: if Step 6 already writes to `pattern:*`/`pitfall:*`, then Step 10's promotion step (lu-learner promoting `research:*` to permanent) is meaningless.

**Fix required:**

1. Change all batch operations in 6.4 to use `research:*` prefixes in the repo vault (matching the classification table in 6.2)
2. Change the vault in section 6.4 to repo vault for ALL engrams (per Decision 4: "Graduation writes to `research:*` prefixes in REPO vault")
3. Change "The `lu-learner` agent writes engrams" to "The `lu-research-graduator` agent writes engrams"
4. Change the Agents Involved table from `lu-learner (adapted)` to `lu-research-graduator`
5. Update the model tier from `fast (FAST_PROMOTED preset)` to `balanced (ORCHESTRATOR preset)` per Decision 10

### NEW-WS-002 (IMPORTANT): Step 8 uses 7-dimension scoring model, violates Decision 3

**Location:** `08-review-plan.md` sections 8.1, 8.2, 8.3, 8.4

Decision 3 explicitly states: "The 7-dimension scoring model (scores 1-10, thresholds >= 7/10) from `01-workflow-steps/05-review-research.md` is REMOVED." Decision 19 designates `05-review-loops/convergence-criteria.md` as the canonical source for convergence criteria.

Step 8 still uses numeric scoring:

- Section 8.1 (lines 28-33): Reviewer counts that contradict Decision 13 (shows 1-3 reviewers scaling with complexity instead of 3 at all levels)
- Section 8.1: Convergence thresholds expressed as "scores >= 7/10" and "scores >= 8/10"
- Section 8.2 (lines 57-69): "Score each dimension 1-10" with 8 evaluation dimensions
- Section 8.3 (lines 97-135): Reviewer output as numeric scores per dimension
- Section 8.4 (lines 139-143): "All dimension scores >= 7/10 across ALL reviewers"

While Decision 3 primarily targets Step 5's research review, the convergence model should be consistent. Step 5 was correctly updated to use the gap-severity model (CRITICAL/IMPORTANT/MINOR findings, reviewer-prefixed gap IDs). Step 8 should follow the same model or explicitly document why it uses a different one. Currently the two review steps use incompatible convergence models with no explanation.

Additionally, the reviewer count in Step 8 section 8.1 does not match Decision 13 ("3 reviewers at all complexity levels"). Step 8 shows 1 reviewer at TRIVIAL/SIMPLE, 2 at MODERATE, and 2-3 at COMPLEX. The Agents Involved table (line 232) says "2 (reviewers)" for MODERATE, but Decision 13 says 3 at all levels. The plan review uses `lu-plan-checker` (not the 3 specialized reviewers from Decision 2's plan review row: `code-architect`, `dx-advocate`, `security-auditor`). The README overview table (line 24) correctly lists `code-architect`, `dx-advocate`, `security-auditor` as Step 8 agents, but the actual Step 8 document uses `lu-plan-checker`.

**Fix required:**

1. Align Step 8 reviewer count to 3 at all complexity levels per Decision 13, or explicitly document an exception
2. Align Step 8 reviewer agents with Decision 2 (`code-architect`, `dx-advocate`, `security-auditor`) or document why `lu-plan-checker` is used instead
3. Either adopt gap-severity model for plan review (matching Step 5) or add a note explaining the different convergence model for plan review vs research review

### NEW-WS-003 (IMPORTANT): Dual lu-learner invocation undocumented

**Location:** `09-execute.md` section 9.11, `10-verify.md` section 10.6

Step 9 spawns `lu-learner` (section 9.11, lines 273-289) to "Extract validated learnings and write to MuninnDB." Step 10 also spawns `lu-learner` (section 10.6, lines 180-209) for "Final learning capture." Neither document acknowledges that this is two separate invocations with different inputs and purposes. An implementer would not know:

- Are these the same or different lu-learner instances?
- Do they write to the same or different concept prefixes?
- Does the Step 10 invocation supersede or supplement Step 9's?
- Could Step 9's learnings be overwritten by Step 10's?

**Fix required:** Add a note in either Step 9 or Step 10 (or both) explicitly stating that there are two lu-learner invocations: one post-execution (Step 9, captures implementation findings) and one post-UAT (Step 10, captures the full learning loop including UAT results and code review findings).

### NEW-WS-004 (IMPORTANT): Step 7 references stale research paths

**Location:** `07-plan.md` section 7.2, 7.3

Section 7.2 (line 68) references `.planning/research/SUMMARY.md` (flat path). The canonical layout from Decision 7 is `.planning/phases/{NN}-{name}/research/SUMMARY.md` (phase-scoped). Section 7.3 (line 103) references `@research(.planning/research/deep/state-machine-deep.md#state-transitions)` which uses both the old flat `.planning/research/` path AND the removed `deep/` subdirectory. Line 103 uses `state-machine-deep.md` when the canonical filename from Step 4 is `08-state-machine.md`.

The same stale paths appear in the plan example (lines 169, 186, 202-203) and in Step 9 (lines 116-123, 339-340) which references `@research(.planning/research/deep/state-machine-deep.md)` and `@research(.planning/research/deep/timer-safety-deep.md)`.

**Fix required:** Update all research file paths to use the canonical phase-scoped layout:

- `.planning/research/SUMMARY.md` -> `.planning/phases/{NN}-{name}/research/SUMMARY.md`
- `.planning/research/deep/state-machine-deep.md` -> `.planning/phases/{NN}-{name}/research/08-state-machine.md`
- `.planning/research/deep/timer-safety-deep.md` -> `.planning/phases/{NN}-{name}/research/07-timer-safety.md`
- `.planning/research/reconnection-patterns.md` -> `.planning/phases/{NN}-{name}/research/01-architecture-patterns.md`

### NEW-WS-005 (MINOR): Step 8 iteration budgets don't match Decision 14

**Location:** `08-review-plan.md` section 8.1

Decision 14 specifies Plan Review Max iterations as: TRIVIAL=1, SIMPLE=1, MODERATE=2, COMPLEX=2, CRITICAL=3. Step 8 section 8.1 (lines 26-33) shows: TRIVIAL=1, SIMPLE=1, MODERATE=2, COMPLEX=3, CRITICAL=4. The COMPLEX (3 vs 2) and CRITICAL (4 vs 3) values do not match the canonical iteration budgets.

**Fix required:** Update Step 8's iteration budget table to match Decision 14.

### NEW-WS-006 (MINOR): Step 3 auto-mode research reference uses stale path

**Location:** `03-discuss.md` section 3.5

Line 105 references `.planning/research/bun-websocket-api.md` which is the old flat, facet-named path. The canonical path would be `.planning/phases/{NN}-{name}/research/02-implementation-approaches.md`.

### NEW-WS-007 (MINOR): Step 6 links use default vault but some source engrams may be in repo vault

**Location:** `06-graduate.md` section 6.5

Section 6.5 (lines 152-169) creates links in the default vault between `pattern:ws-reconnection-state-machine` and other engrams. But per the NEW-WS-001 issue, the graduation should write to `research:*` in the repo vault. Even under the current (incorrect) implementation, the links reference concepts across different vaults (patterns in default vault, decisions in repo vault) but all `muninn_link` calls specify only the default vault. Cross-vault linking behavior is not documented.

---

## Canonical Decision Compliance

| Decision                           | Status              | Notes                                                                                                                                                                                                      |
| ---------------------------------- | ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 (step numbering)                 | COMPLIANT           | All 10 steps correctly numbered across all files                                                                                                                                                           |
| 2 (agent names)                    | MOSTLY COMPLIANT    | Correct in Steps 2, 4, 5. Step 6 agents table still says `lu-learner (adapted)` instead of `lu-research-graduator`. Step 8 uses `lu-plan-checker` instead of the 3 plan reviewers from Decision 2's table. |
| 3 (gap-severity, no 7-dim scoring) | PARTIALLY COMPLIANT | Step 5 correctly uses gap-severity. Step 8 still uses 7-dimension numeric scoring (see NEW-WS-002).                                                                                                        |
| 4 (research:\* prefixes)           | NOT COMPLIANT       | Step 6 describes `research:*` in text but batch operations write `pattern:*`/`pitfall:*`/`decision:*` directly (see NEW-WS-001).                                                                           |
| 5 (weighted sum formula)           | COMPLIANT           | Step 6 section 6.3 shows the correct formula.                                                                                                                                                              |
| 6 (actionability scoring)          | COMPLIANT           | Step 6 references the full scoring spec in `03-muninndb-integration/`.                                                                                                                                     |
| 7 (research file layout)           | MOSTLY COMPLIANT    | README and Steps 2, 4, 5 use phase-scoped flat layout. Steps 7 and 9 have stale paths (see NEW-WS-004).                                                                                                    |
| 8 (G-COMP-001 gap IDs)             | COMPLIANT           | Step 5 uses reviewer-prefixed IDs correctly (G-COMP-, G-ACC-, G-ACT-).                                                                                                                                     |
| 9 (camelCase config keys)          | NOT TESTED          | No config keys shown in this section; deferred to `06-implementation-plan/`.                                                                                                                               |
| 10 (model routing presets)         | MOSTLY COMPLIANT    | Steps 2, 5 use correct presets. Step 6 agents table shows wrong preset (FAST_PROMOTED instead of ORCHESTRATOR).                                                                                            |
| 11 (cold isolation)                | COMPLIANT           | All researcher and reviewer agents documented as cold isolation.                                                                                                                                           |
| 12 (numbered filenames)            | COMPLIANT           | All files use numbered format (01- through 08-).                                                                                                                                                           |
| 13 (3 reviewers at all levels)     | PARTIALLY COMPLIANT | Step 5 correct (3 at all levels). Step 8 shows 1-3 scaling with complexity (see NEW-WS-002).                                                                                                               |
| 14 (iteration budgets)             | PARTIALLY COMPLIANT | Step 5 matches. Step 8 has wrong values for COMPLEX and CRITICAL (see NEW-WS-005).                                                                                                                         |
| 15 (unsourced claims)              | COMPLIANT           | No unsourced quantitative claims found in this section.                                                                                                                                                    |
| 16 (revision loop targets)         | COMPLIANT           | Step 5 section 5.5 correctly implements Decision 16.                                                                                                                                                       |
| 17 (all steps at all levels)       | COMPLIANT           | README, Step 1, Step 4 all state no steps are skipped. TRIVIAL runs with fast tier and 1-iteration caps.                                                                                                   |
| 18 (missing impl items)            | NOT TESTED          | Deferred to `06-implementation-plan/`.                                                                                                                                                                     |
| 19 (reference, don't redefine)     | MOSTLY COMPLIANT    | README convergence section references `05-review-loops/convergence-criteria.md`. Step 5 references convergence criteria externally. Step 8 redefines its own convergence model instead of referencing.     |

---

## Running Example Consistency

The WebSocket reconnection running example flows coherently across all 10 steps. The core narrative is intact:

**Consistent elements (verified):**

- Raw intent ("WebSocket reconnection with exponential backoff") preserved Steps 1-10
- `decision:ws-native` constraint from Step 1 correctly constrains research in Step 2
- 4 research facets consistently referenced across Steps 2-5
- 4 deep-dive topics (close codes, heartbeat, timer safety, state machine) consistent Steps 4-5
- State machine (6 states, 14 transitions) consistent across Steps 4, 5, 6, 7, 9
- Close code mapping consistent across Steps 4, 6, 9
- Heartbeat config (30s ping, EWMA timeout) consistent across Steps 3, 4, 6, 7
- Graduated engrams recalled and applied in Step 9
- UAT tests trace back to CONTEXT.md decisions and plan deliverables
- Learnings in Step 10 reference actual session findings from Step 9

**Remaining inconsistency:**

- **Research file paths**: Steps 7 and 9 reference `@research(.planning/research/deep/state-machine-deep.md)` and similar paths that use the old flat directory + `deep/` subdirectory convention. Steps 2 and 4 correctly use `.planning/phases/{NN}-{name}/research/08-state-machine.md`. This creates a disconnect where the plan references files that don't exist under the canonical layout. See NEW-WS-004.

---

## Verdict: NEEDS REVISION

### Must-fix (blocks approval):

1. **NEW-WS-001** (CRITICAL): Step 6 graduation namespace. The batch operations in 6.4 must use `research:*` prefixes per Decision 4. The agent must be `lu-research-graduator` (not `lu-learner`). The routing preset must be ORCHESTRATOR per Decision 10.

2. **NEW-WS-002** (IMPORTANT): Step 8 convergence model. Either align to gap-severity (matching Step 5 and Decision 3) or document the exception. Fix reviewer count to 3 at all levels per Decision 13. Resolve agent name conflict (README says `code-architect`/`dx-advocate`/`security-auditor`, Step 8 body says `lu-plan-checker`).

3. **NEW-WS-004** (IMPORTANT): Stale research file paths in Steps 7 and 9. All `@research` annotations must use the canonical phase-scoped layout from Decision 7.

### Should-fix:

4. **NEW-WS-003**: Document dual lu-learner invocation between Steps 9 and 10.
5. **NEW-WS-005**: Fix Step 8 iteration budgets to match Decision 14.
6. **MIN-WS-005** (unfixed from R1): Fix link count discrepancy in Step 6 (3 shown vs 5 claimed).
7. **MIN-WS-007** (unfixed from R1): Fix `procedure:*` vault routing in Step 10.

### Nice-to-have:

8. **MIN-WS-002** (unfixed from R1): Consider more specific concept than `session:info`.
9. **MIN-WS-006** (unfixed from R1): Document appetite enforcement or mark as advisory.
10. **NEW-WS-006**: Fix stale research path in Step 3 auto-mode.
11. **NEW-WS-007**: Clarify cross-vault linking behavior.
