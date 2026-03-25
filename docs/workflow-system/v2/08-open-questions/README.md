# Open Questions & Design Decisions

> Catalog of design decisions for Luca Workflow v2. Questions that have been answered by canonical decisions are documented in the **Resolved Decisions** section with references. Genuinely unresolved issues remain in the **Remaining Open Questions** section.

---

## Status Summary

| ID  | Question                                             | Category     | Status                                      | Resolution                                                         |
| --- | ---------------------------------------------------- | ------------ | ------------------------------------------- | ------------------------------------------------------------------ |
| Q1  | Separate agents vs. parameterized agents?            | Architecture | **RESOLVED** (Decision 2)                   | Separate agents (new specialized agents)                           |
| Q2  | Where does the orchestrator live?                    | Architecture | **RESOLVED** (Decision 20)                  | Enhanced lu.skill.ts (not separate file)                           |
| Q3  | How does complexity gating interact with v2?         | Architecture | **RESOLVED** (Decision 17)                  | All 10 steps run at all complexity levels                          |
| Q4  | Research engram lifecycle                            | MuninnDB     | **RESOLVED** (Decision 21)                  | Clean up after phase completion                                    |
| Q5  | Research files vs. MuninnDB -- when to read which?   | MuninnDB     | Open                                        | Phase-dependent with fallback chain (recommended)                  |
| Q6  | Cross-phase research reuse                           | MuninnDB     | Open                                        | Recall with staleness warning (recommended)                        |
| Q7  | What if reviewers disagree?                          | Review Loops | **RESOLVED** (Decision 22)                  | Best judgment; escalate if genuinely uncertain                     |
| Q8  | Reviewer freshness across iterations                 | Review Loops | Open                                        | Same agent with delta + prior summary (recommended)                |
| Q9  | Review scope on re-expansion                         | Review Loops | Open                                        | Delta review with integration check (recommended)                  |
| Q10 | Token budget reality check                           | Practical    | Partially resolved (Decision 17 constrains) | Full flow at all levels; budget scales with complexity             |
| Q11 | User experience during research                      | Practical    | Open                                        | Respect existing oversight levels (recommended)                    |
| Q12 | Research for non-code tasks                          | Practical    | Open                                        | Adapt researcher specializations by task type (recommended)        |
| Q13 | When initial research is sufficient                  | Practical    | **RESOLVED** (Decision 23)                  | Never skip Deep Expand — always run it                             |
| Q14 | Research file retention policy                       | Practical    | **RESOLVED** (Decision 24)                  | Archive after graduation; separate cleanup system later            |
| Q15 | Research synthesizer isolation and error propagation | Architecture | **NEW** (narrowed)                          | Isolation level, error propagation, re-run semantics (recommended) |
| Q16 | Error handling and retry semantics for researchers   | Practical    | **NEW**                                     | Needs discussion                                                   |

---

## Resolved Decisions

These questions have been answered by canonical decisions in [CANONICAL-DECISIONS.md](../CANONICAL-DECISIONS.md). They are documented here for completeness and to preserve the original analysis.

### RQ1: Canonical Step Numbering (was CRIT-OQ-001)

**Resolved by**: [Decision 1 (Canonical Step Numbering)](../CANONICAL-DECISIONS.md#decision-1-canonical-step-numbering)

**Original question**: Multiple v2 sections used different step numbering schemes. `02-research-system/README.md` described Research as "Step 4" in a 10-step pipeline (Parse & Route, Cognitive Pre-Flight, Complexity Classification, Research, Discussion, Planning, Execution, Verification, Learning, Commit). `01-workflow-steps/README.md` described it as "Step 2" in a different 10-step pipeline (Ideate, Research, Discuss, Deep Expand, Review Research, Graduate, Plan, Review Plan, Execute, Verify). `03-muninndb-integration/README.md` used yet another numbering.

**Resolution**: The canonical 10-step pipeline is defined in Decision 1. v1's 15-step list (model resolution, cognitive pre-flight, validation, etc.) is the internal implementation checklist; v2's 10-step list is the user-facing pipeline. All sections must use the Decision 1 numbering.

---

### RQ2: Separate Agents vs. Parameterized Agents (was Q1)

**Resolved by**: [Decision 2 (Canonical Agent Names)](../CANONICAL-DECISIONS.md#decision-2-canonical-agent-names)

**Original question**: Should the research and review teams be implemented as separate named agents or as a single parameterized agent?

**Original recommended direction**: Parameterized (Option B).

**Canonical resolution**: **Separate named agents (Option A)**. Decision 2 specifies new specialized agents: `lu-architecture-researcher`, `lu-implementation-researcher`, `lu-ecosystem-researcher`, `lu-risk-researcher` for research; `lu-completeness-reviewer`, `lu-accuracy-reviewer`, `lu-actionability-reviewer` for review; and a dedicated `lu-research-graduator` for graduation.

**Why the recommendation changed**: The original analysis underweighted the specialization divergence that already existed in the `04-agent-orchestration/` specs. The four researchers have meaningfully different focus prompts, different tool usage patterns (the risk researcher emphasizes WebSearch for vulnerability databases; the implementation researcher emphasizes Context7 for API docs), and the three reviewers have different structured output schemas. These divergences make separate agents the cleaner architecture. The "7 new agent files" maintenance cost is modest -- each agent file in this codebase is ~50-80 lines of configuration, not a heavyweight artifact. Meanwhile, a parameterized approach would require a prompt composition engine (a non-trivial infrastructure investment) to handle the divergences that already exist.

**Downstream impact**: Q12 (non-code task research) is now constrained: adding task-type-specific specializations requires creating new agent files rather than config entries. This is more work but provides clearer separation of concerns.

---

### RQ3: TRIVIAL Complexity Handling (was Q3 + CRIT-OQ-002)

**Resolved by**: [Decision 17 (TRIVIAL Complexity Handling)](../CANONICAL-DECISIONS.md#decision-17-trivial-complexity-handling)

**Original question**: Should complexity gate which steps run? The original Q3 recommended Option C (user-chosen via flag with sensible defaults), which included skipping steps 2-6 for TRIVIAL tasks. Separately, a contradiction existed: `00-design-principles/agent-isolation-patterns.md` stated TRIVIAL tasks have "None (no research phase)" and "None (no plan phase)" for isolation, but `complexity-gating.md` stated "ALL workflow steps run at every complexity level."

**Canonical resolution**: **All 10 steps run at all complexity levels** (preserving v1 invariant). For TRIVIAL:

- Researchers use `fast` tier, reduced token budgets
- Review loops max at 1 iteration
- Graduation still runs (but may graduate 0 engrams)
- No steps are skipped based on complexity alone

The v1 principle "all steps always run" is NOT retired. Research is not an exception to this principle -- it is a new step that runs at all levels, scaled by model tier and loop budgets just like every other step. The original Q3 Option A analysis was correct that this matches v1 philosophy. The overhead concern at TRIVIAL (30-40K tokens) is addressed by using `fast` model tier, not by skipping steps.

**User override flags** (`--skip-research`, `--deep-research`, `--quick`) remain valid as explicit overrides -- they follow the same pattern as existing `--skip-review` and `--skip-uat` flags. The difference from the original Q3 recommendation is that the **default** for TRIVIAL is to run all steps (scaled down), not to skip steps.

---

### RQ4: Orchestrator Location (was Q2)

**Resolved by**: [Decision 20 (Orchestrator Location)](../CANONICAL-DECISIONS.md#decision-20-orchestrator-location)

**Original question**: Should the v2 orchestrator be a new `lu-v2.skill.ts`, or an enhanced `lu.skill.ts` with a v2 branch?

**Canonical resolution**: **Enhanced `lu.skill.ts`**. The v2 pipeline is gated by `workflow.version: "v2"` in config.json. When v2 is not enabled, v1 behavior is unchanged. This avoids maintaining two parallel orchestrators and keeps the `/lu` entry point unified.

---

### RQ5: Research Engram Lifecycle (was Q4)

**Resolved by**: [Decision 21 (Research Engram Lifecycle)](../CANONICAL-DECISIONS.md#decision-21-research-engram-lifecycle)

**Original question**: When should `research:*` engrams be cleaned up?

**Canonical resolution**: **After phase completion.** lu-learner promotes high-value `research:*` engrams to permanent `pattern:*`/`pitfall:*`/`decision:*` in DEFAULT vault, then remaining `research:*` engrams are deleted via `muninn_forget`. Controlled by `research.graduation.autoCleanupAfterPhase` (default: `true`).

---

### RQ6: Reviewer Disagreement Resolution (was Q7)

**Resolved by**: [Decision 22 (Reviewer Disagreement Resolution)](../CANONICAL-DECISIONS.md#decision-22-reviewer-disagreement-resolution)

**Original question**: How to resolve when reviewers disagree on IMPORTANT findings?

**Canonical resolution**: CRITICAL from any reviewer always blocks. For IMPORTANT findings, the orchestrator uses best judgment — treat clearly actionable findings as blocking, log ambiguous ones as advisory notes in REVIEW-LOG.md. Escalate to user only if genuinely uncertain.

---

### RQ7: Deep Expand Is Mandatory (was Q13)

**Resolved by**: [Decision 23 (Deep Expand Is Mandatory)](../CANONICAL-DECISIONS.md#decision-23-deep-expand-is-mandatory)

**Original question**: Can we skip Deep Expand if initial research passes review on first try?

**Canonical resolution**: **No — always run Deep Expand.** Initial research covers breadth (4 facets); Deep Expand covers depth (specialist topics from discussion). The review loop provides the quality gate, not skipping steps. At TRIVIAL complexity, Deep Expand runs with `fast` tier — cheap enough to always include.

---

### RQ8: Research File Archival (was Q14)

**Resolved by**: [Decision 24 (Research File Archival)](../CANONICAL-DECISIONS.md#decision-24-research-file-archival)

**Original question**: What happens to research files after graduation?

**Canonical resolution**: **Archive after graduation.** Research file contents move to `research/archive/` subdirectory. GRADUATION-REPORT.md and REVIEW-LOG.md remain in `research/`. Files are not deleted — a separate cleanup system will handle purging later.

---

## Remaining Open Questions

### Architecture Decisions

#### Q2: Where Does the Orchestrator Live?

**Question:** The v2 workflow introduces 4 new steps (Deep Expand, Review Research, Graduate to MuninnDB, Review Plan as a multi-reviewer loop). Where does the orchestration logic for these steps live?

The current v1 orchestrator is `lu.skill.ts`. It already manages the full v1 pipeline (cognitive pre-flight, routing, discussion, planning, execution, verification, learning). Adding v2's research pipeline, review loops, and graduation step would significantly increase its complexity.

##### Options

**Option A: Feature flag in lu.skill.ts**

Add a `--v2` flag (or read from config) and branch within `lu.skill.ts`:

```
if (v2Enabled) {
  // Steps 1-6: ideate, research, discuss, deep expand, review, graduate
} else {
  // v1 path: discuss, plan, execute
}
// Steps 7-10: shared between v1 and v2
```

| Aspect       | Assessment                                                                                                                                             |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Proximity    | All orchestration logic in one file. Easy to see the full flow.                                                                                        |
| Complexity   | `lu.skill.ts` is already the most complex skill file. Adding v2 branching could push it past maintainable size (estimated 800+ lines with both paths). |
| Shared logic | Steps that are common between v1 and v2 (execution, verification, learning) naturally share code.                                                      |
| Migration    | When v2 is stable and v1 is deprecated, the v1 branch can be deleted. Clean eventual convergence.                                                      |
| Risk         | A bug in the v2 branch could affect v1 if shared state is mismanaged.                                                                                  |

**Option B: Separate lu-v2.skill.ts**

A completely independent orchestrator for v2:

| Aspect          | Assessment                                                                                                                                               |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Isolation       | v1 and v2 are fully independent. Changes to v2 cannot break v1.                                                                                          |
| Duplication     | Steps 7-10 (plan, execute, verify, learn) are substantially identical between v1 and v2. This approach would duplicate them or require a shared library. |
| User experience | Two entry points (`/lu` for v1, `/lu-v2` for v2). Could be confusing during transition.                                                                  |
| Migration       | When v2 is stable, deprecating v1 means deleting `lu.skill.ts` entirely. Clean.                                                                          |
| Discovery       | Two orchestrator files clearly communicates "these are different workflows."                                                                             |

**Option C: Shared orchestrator core with v1/v2 strategy pattern**

Extract the shared steps (execution, verification, learning, commit) into a core module. `lu.skill.ts` and `lu-v2.skill.ts` both import from this core but define their own pre-execution pipeline:

```
src/skills/luca/
  __helpers/
    orchestrator-core.ts    # Shared: execute, verify, learn, commit
  lu.skill.ts               # v1: discuss -> plan -> [core]
  lu-v2.skill.ts            # v2: ideate -> research -> discuss -> expand -> review -> graduate -> plan -> review -> [core]
```

| Aspect              | Assessment                                                                                                           |
| ------------------- | -------------------------------------------------------------------------------------------------------------------- |
| DRY                 | Shared steps are defined once. Each version owns its unique pre-execution pipeline.                                  |
| Isolation           | v1 and v2 pre-execution paths are fully independent. Shared core is stable and well-tested.                          |
| Complexity          | Neither orchestrator becomes unmanageably large. The core module is focused on stable, proven logic.                 |
| Migration           | When v2 is stable, delete `lu.skill.ts` and rename or keep `lu-v2.skill.ts`. Core remains.                           |
| Implementation cost | Requires extracting shared logic from `lu.skill.ts` into `orchestrator-core.ts`. This is a refactoring prerequisite. |

##### Recommended Direction: Option C (shared core with strategy pattern)

**Reasoning:**

1. **`lu.skill.ts` is already complex.** Adding the full v2 pre-execution pipeline (4 new steps, 2 review loops, graduation) into the same file would make it harder to reason about either flow.

2. **The shared steps are genuinely shared.** Execution, verification, learning, and commit are identical between v1 and v2. Duplicating them creates a synchronization problem.

3. **The unique steps are genuinely different.** v1's pre-execution is `discuss -> plan`. v2's pre-execution is `ideate -> research -> discuss -> deep-expand -> review-research -> graduate -> plan -> review-plan`. These are different enough to warrant separate files.

4. **Migration path is clean.** When v2 proves itself, v1's orchestrator can be retired without touching the shared core.

**Counter-argument worth tracking:** If the shared core turns out to be thin (execution is actually quite different between v1 and v2 due to per-task recall), Option C becomes Option B with extra indirection. Measure the actual overlap before committing to the extraction.

##### What Would Resolve It Definitively

Map every line of `lu.skill.ts` to one of three categories: v1-only, v2-only, shared. If shared > 40% of the file, Option C is justified. If shared < 20%, Option B is simpler. If v2-only < 30%, Option A might work.

##### Impact if Wrong: High

The orchestrator is the central coordination point for the entire workflow. If it becomes unmaintainable (Option A with too much complexity) or if shared logic drifts between duplicated copies (Option B without proper extraction), the entire workflow becomes fragile. This decision shapes the maintainability of every future enhancement.

---

### MuninnDB Questions

#### Q4: Research Engram Lifecycle

**Question:** When should `research:*` engrams be cleaned up from MuninnDB?

The graduation step (Step 6) writes `research:*` engrams to MuninnDB for per-task recall during execution. After execution completes, these engrams remain in the vault. Over time, a project accumulates research engrams from every phase, and some become stale (researched APIs get deprecated, library versions change, patterns become outdated).

##### Options

**Option A: Clean up after phase completion (aggressive)**

Delete all `research:*` engrams for the phase when Step 10 completes.

| Aspect            | Assessment                                                                    |
| ----------------- | ----------------------------------------------------------------------------- |
| Space efficiency  | No accumulation. Vault stays lean.                                            |
| Cross-phase reuse | Impossible. Phase 7 cannot recall Phase 5's WebSocket research.               |
| Simplicity        | Clear lifecycle: graduated at Step 6, consumed at Step 9, deleted at Step 10. |
| Risk              | If a future phase needs the same research, it must be re-done from scratch.   |

**Option B: Clean up after milestone completion (moderate)**

Delete all `research:*` engrams for the milestone when the milestone ships.

| Aspect             | Assessment                                                                                                                |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| Cross-phase reuse  | Phases within the same milestone can recall each other's research.                                                        |
| Space efficiency   | Moderate. Engrams accumulate within a milestone but are cleaned between milestones.                                       |
| Milestone boundary | Aligns with the natural lifecycle of a feature: research is relevant while the feature is being built, less so afterward. |
| Risk               | Milestones can span weeks. Long milestones accumulate significant research that may go stale mid-milestone.               |

**Option C: Never clean up (let confidence decay handle it)**

MuninnDB has a built-in confidence decay mechanism. Let it naturally reduce the relevance score of old engrams over time. They will stop appearing in recall results as newer, higher-confidence engrams take priority.

| Aspect            | Assessment                                                                                                                                                    |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Zero maintenance  | No cleanup logic needed. MuninnDB handles everything.                                                                                                         |
| Gradual fading    | Old research fades naturally rather than disappearing abruptly.                                                                                               |
| Vault size        | Unbounded growth. A project with 50 phases accumulates hundreds of research engrams, most stale.                                                              |
| Recall noise      | Even with confidence decay, old engrams may still appear in recall results, adding noise to per-task context.                                                 |
| MuninnDB reliance | Depends on MuninnDB's decay algorithm being well-tuned. If decay is too slow, stale engrams pollute recall. If too fast, valuable long-term research is lost. |

**Option D: Promote valuable engrams, delete the rest**

At the end of Step 10, `lu-learner` reviews `research:*` engrams and promotes valuable ones to permanent concept prefixes (`pattern:*`, `pitfall:*`, `decision:*`). The remaining `research:*` engrams are deleted.

| Aspect            | Assessment                                                                                                                                                                       |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Quality filtering | Only the most valuable research survives long-term. Patterns become permanent; one-off findings are discarded.                                                                   |
| Concept evolution | A `research:approach-ws-reconnect` finding that proves useful becomes `pattern:ws-reconnect-exponential-backoff`. The concept prefix signals its maturity.                       |
| Cross-phase reuse | Promoted engrams are available to all future phases under their permanent concept prefix. Non-promoted engrams are gone.                                                         |
| Implementation    | Requires `lu-learner` to evaluate each `research:*` engram for promotion worthiness. This is additional work but aligns with what lu-learner already does for session learnings. |
| Risk              | If `lu-learner` misjudges and deletes a valuable engram, it is gone. Mitigation: keep research files as backup (see Q14).                                                        |

##### Recommended Direction: Option D (promote valuable, delete rest)

**Reasoning:**

1. **Aligns with MuninnDB's intended use.** MuninnDB is a semantic memory system, not a document store. It should contain distilled, validated knowledge -- not raw research artifacts. Promoting research to `pattern:*` or `pitfall:*` is the natural lifecycle.

2. **Leverages existing lu-learner capabilities.** `lu-learner` already evaluates session context for promotion to permanent engrams. Extending it to evaluate `research:*` engrams is a natural capability expansion.

3. **Solves cross-phase reuse without noise.** A promoted `pattern:ws-reconnect-exponential-backoff` is available to any future phase that needs WebSocket patterns. It does not carry the baggage of raw research context.

4. **Bounded vault growth.** The vault grows by the number of promoted patterns and pitfalls, not by the total volume of research. This scales sustainably.

**Counter-argument worth tracking:** Promotion is a lossy compression. The original `research:*` engram may contain context (source URLs, confidence reasoning, alternative approaches) that the promoted `pattern:*` engram omits. If that context is needed later, it is gone. Mitigation: keep research files in git history (see Q14).

##### What Would Resolve It Definitively

Track 20 phases through the full lifecycle. After each phase, record:

- How many `research:*` engrams were promoted vs. deleted
- How often a future phase needed a deleted engram (measured by re-researching the same topic)
- Vault size growth rate under this policy

If re-research rate is < 5%, the promotion policy is working well.

##### Impact if Wrong: Medium

If we clean up too aggressively (Option A), we waste tokens re-researching. If we never clean up (Option C), recall quality degrades from noise. Option D balances these, but if promotion criteria are too strict, we lose valuable research; if too loose, the vault still grows. The safety net is that research files exist in git history regardless.

---

#### Q5: Research Files vs. MuninnDB -- When to Read Which?

**Question:** After graduation, research exists in two forms: full-detail files on disk and distilled engrams in MuninnDB. Which source should each consumer read?

##### The Current Design

| Consumer  | Step                     | Source          | Rationale                                                                 |
| --------- | ------------------------ | --------------- | ------------------------------------------------------------------------- |
| Reviewers | Step 5 (Review Research) | Files directly  | Need full detail to evaluate quality, citations, confidence reasoning     |
| Planner   | Step 7 (Plan)            | Files directly  | Needs full detail to create accurate task breakdowns and research refs    |
| Executor  | Step 9 (Execute)         | MuninnDB recall | Needs targeted, minimal context -- only findings relevant to current task |
| Verifier  | Step 10 (Verify)         | MuninnDB recall | Checks implementation against known patterns and pitfalls                 |

This is straightforward for the happy path. The question arises for edge cases.

##### Edge Case 1: Re-planning after failed verification

If verification (Step 10) fails and the orchestrator re-enters the planning phase, should the planner:

- **Read files directly** (same as initial planning) -- but what if files have been modified during execution?
- **Recall from MuninnDB** (graduated engrams) -- but these are distilled and lack the detail needed for planning?
- **Both** -- read files for detail, recall engrams for any post-graduation learnings?

**Recommended direction:** Read files as primary source, recall MuninnDB as supplement. Files are the authoritative detailed source. MuninnDB may contain session learnings captured during execution that the files do not have. Use both, with files taking precedence on conflicts.

##### Edge Case 2: Research files deleted or archived but engrams remain

If research files are cleaned up (moved to archive, deleted from working tree) but MuninnDB engrams persist:

- The planner loses access to full-detail research but can still recall distilled engrams.
- This is acceptable for future phases (distilled engrams are sufficient for recall).
- This is NOT acceptable for re-planning within the same phase (planner needs full detail).

**Recommended direction:** Never delete research files until the phase is fully complete (all verification passes, no re-planning possible). Archive after phase completion, not during.

##### Edge Case 3: MuninnDB is unavailable but files exist

If MuninnDB is down or the vault is corrupted:

- Executors lose per-task recall but can fall back to reading research files directly.
- This degrades to the v1 model (full research corpus in context) but is still functional.

**Recommended direction:** Implement a fallback chain: MuninnDB recall -> file read -> proceed without research context. Log a warning at each fallback level.

##### The Fallback Chain

```
Per-task context loading:
1. Try: MuninnDB recall for task's research refs
   Success -> use engrams (optimal: minimal, targeted)
   Fail ->
2. Try: Read referenced research files from disk
   Success -> use full files (degraded: more context than needed, but accurate)
   Fail ->
3. Try: Read research files from current phase directory only
   (.planning/phases/NN-name/research/)
   Success -> use current-phase files (further degraded: untargeted, but current)
   Note: Do NOT load files from prior phase directories at this fallback level.
   Cross-phase research reuse is handled by MuninnDB recall (level 1), which
   includes staleness metadata per Q6. Loading raw files from prior phases at
   this fallback level would bypass the staleness indicators that Q6 carefully
   adds to MuninnDB engrams.
   Fail ->
4. Proceed without research context (worst case: equivalent to v1)
   Log WARNING: "No research context available for task {task_id}"
```

##### What Would Resolve It Definitively

Implement the fallback chain and monitor which level is used in practice. If level 1 (MuninnDB recall) handles > 95% of cases, the edge case handling is validated. If levels 2-4 are triggered frequently, investigate the root cause (MuninnDB reliability, premature file deletion, etc.).

##### Impact if Wrong: High

If executors read the wrong source (e.g., stale files instead of updated engrams, or distilled engrams when they need full detail), the quality of implementation degrades. This directly undermines the core value proposition of v2's research pipeline. Getting the source selection right is critical to the "grounded decisions" design principle.

---

#### Q6: Cross-Phase Research Reuse

**Question:** If Phase 5 researches WebSocket patterns and Phase 7 also involves WebSocket work, should Phase 7 reuse Phase 5's research engrams?

This is a practical question about MuninnDB recall semantics. When Phase 7's researchers or executors issue a recall query like `"WebSocket reconnection exponential backoff"`, should Phase 5's graduated `research:approach-ws-reconnect` engram appear in results?

##### Options

**Option A: Yes, auto-recall based on semantic similarity**

MuninnDB's recall is already semantic. If Phase 5's research is relevant to Phase 7's query, it will naturally surface. No special handling needed.

| Aspect         | Assessment                                                                                                                                                                      |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Simplicity     | Zero implementation cost. MuninnDB's existing recall handles this automatically.                                                                                                |
| Reuse          | Previous research is available without re-investigation. Saves tokens and time.                                                                                                 |
| Staleness risk | Phase 5's research may be weeks old. APIs change, library versions update, the project's architecture may have shifted. Using stale research is worse than no research.         |
| Contamination  | Phase 5's decisions may not apply to Phase 7's context. If Phase 5 chose approach X for reason Y, and Phase 7 has different constraints, blindly reusing approach X is harmful. |

**Option B: No, each phase does fresh research**

Phase 7's researchers do not recall `research:*` engrams from prior phases. They start fresh.

| Aspect              | Assessment                                                                                             |
| ------------------- | ------------------------------------------------------------------------------------------------------ |
| Freshness guarantee | Every phase works from current information. No staleness risk.                                         |
| Token cost          | Phases re-research topics that were already investigated. This is the most expensive option.           |
| Isolation purity    | Aligns with the cold isolation principle -- prior phase context does not contaminate current phase.    |
| Discovery           | Fresh research may discover new information that Phase 5 missed (library updates, new best practices). |

**Option C: Recall with staleness warning (recommended)**

Phase 7's agents CAN recall Phase 5's `research:*` engrams, but they are flagged with metadata indicating:

- Which phase produced them
- When they were graduated
- A staleness indicator based on elapsed time

The consuming agent decides whether to trust or re-verify the finding.

| Aspect               | Assessment                                                                                                                                                  |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Informed reuse       | Agents see prior research but know it may be stale. They can choose to use it as a starting point and verify, rather than researching from scratch.         |
| Implementation       | Requires adding `phase_id` and `graduated_at` metadata to research engrams during graduation. Recall results include this metadata for consumer inspection. |
| Agent responsibility | The consuming agent must reason about staleness. This adds cognitive load to the agent prompt but avoids both blind reuse and wasteful re-research.         |
| Token efficiency     | Moderate. Agents may re-verify some findings but skip basic discovery that prior research already covered.                                                  |

##### Recommended Direction: Option C (recall with staleness warning)

**Reasoning:**

1. **Research is expensive.** Re-doing a full research cycle for a topic already investigated wastes the investment made in Phase 5.

2. **Blind reuse is dangerous.** A 3-week-old research finding about a library API may reference a version that has since been updated.

3. **Staleness metadata is cheap to add.** Adding `phase_id` and `graduated_at` to the engram content is trivial during graduation. The consuming agent can inspect these fields to decide trust level.

4. **This matches how humans work.** An engineer starting Phase 7 would check whether prior research exists, review it for currency, and re-verify anything that seems stale. Option C models this behavior.

##### Staleness Thresholds

| Elapsed Time | Staleness Level | Agent Guidance                                                           |
| ------------ | --------------- | ------------------------------------------------------------------------ |
| < 1 week     | FRESH           | Safe to use without re-verification                                      |
| 1-4 weeks    | AGING           | Verify source URLs still resolve, check for version updates              |
| > 4 weeks    | STALE           | Treat as a hint only; re-research if the finding is critical to the plan |

These thresholds are initial defaults intended for a moderately active project. They should be configurable in `.planning/config.json` under `research.staleness` so that projects with different velocities can tune them. A rapidly moving project (daily deploys, active refactoring) may want a FRESH window of 3 days; a stable project may extend FRESH to 2 weeks.

##### What Would Resolve It Definitively

Track 10 cross-phase research reuse scenarios. Measure:

- How often recalled research from a prior phase was still accurate
- How often it was stale and led to incorrect decisions
- Token savings from reuse vs. fresh research

If accuracy is > 80% for FRESH engrams and > 50% for AGING engrams, the staleness model is validated.

##### Impact if Wrong: Low

If we enable reuse when we should not, the review loop (Step 5) catches stale findings before they reach execution. If we disable reuse when it would help, we waste tokens on re-research. Neither outcome is catastrophic because the review loop serves as a safety net.

---

### Review Loop Questions

#### Q7: What If Reviewers Disagree?

**Question:** The review loop (Steps 5 and 8) uses three parallel reviewers (completeness, accuracy, actionability). What happens when they produce conflicting assessments?

**Note on convergence model:** The canonical convergence model is defined in [05-review-loops/](../05-review-loops/). This question addresses the specific scenario of inter-reviewer disagreement within that model.

##### The Clear Case: CRITICAL from Any Reviewer

A CRITICAL finding from any reviewer blocks the loop regardless of other reviewers' assessments. This is already established in the convergence model:

- Completeness says "APPROVED" but Accuracy says "CRITICAL: Source URL returns 404, finding may be fabricated" -- **blocked**.
- Accuracy says "APPROVED" but Actionability says "CRITICAL: No code examples provided, executor cannot implement" -- **blocked**.

This is unambiguous. CRITICAL = blocks.

##### The Ambiguous Case: Conflicting IMPORTANT Findings

Conflict occurs when reviewers disagree at the IMPORTANT level:

- Completeness says "IMPORTANT: Missing error handling research" but Accuracy says "APPROVED: All sources verified"
- Actionability says "IMPORTANT: Needs more specific Bun API examples" but Completeness says "APPROVED: All topics covered"

These are not contradictions -- each reviewer is evaluating a different dimension. But they create a tension: should the loop iterate to address IMPORTANT findings from one reviewer when other reviewers are satisfied?

##### Resolution Strategy

**Recommended approach: Weighted resolution with dimension priority**

1. **CRITICAL from any reviewer: always iterate.** No exceptions.

2. **IMPORTANT findings: aggregate and assess distribution.**
   - If any single reviewer has 2+ IMPORTANT findings in the same research file, iterate. This signals a systemic issue in that file, not isolated gaps.
   - If total IMPORTANT findings across all reviewers >= 3, iterate. This signals that the research has multiple dimensions of incompleteness.
   - Otherwise (1-2 scattered IMPORTANT findings across different reviewers and files), proceed with the IMPORTANT findings logged as accepted residual risk.

   _Rationale for the thresholds_: The "2+ from one reviewer in one file" criterion catches concentrated quality issues that indicate a section needs rework. The "total >= 3" criterion is an initial default that should be validated against real review data. If early v2 runs show that legitimate IMPORTANT findings average higher or lower, adjust the threshold accordingly.

3. **Dimension priority for tie-breaking:**
   - Accuracy > Completeness > Actionability
   - Rationale: An inaccurate finding is worse than an incomplete one (it actively misleads). An incomplete finding is worse than a non-actionable one (the executor can fill in details, but cannot fill in missing topics).

4. **Conflicting assessments on the same finding:**
   - If Accuracy says "this finding is verified" and Completeness says "this finding is insufficient" -- the finding is verified but incomplete. The revision request is to expand, not to re-verify. Both reviewers are correct; they are evaluating different dimensions.

##### What Would Resolve It Definitively

Run 15+ review loops and record every disagreement. Categorize them:

- How often are disagreements genuine conflicts vs. dimension-specific assessments?
- Does the weighted resolution strategy produce reasonable outcomes?
- How often does a human override the automated resolution?

If human overrides are < 10%, the strategy is working.

##### Impact if Wrong: Medium

If we iterate too aggressively (resolve every IMPORTANT as "block"), review loops take extra iterations and waste tokens. If we iterate too conservatively (proceed despite important gaps), executors receive incomplete research. The verification loop at Step 10 serves as a final safety net, but catching issues there is more expensive than catching them during research review.

---

#### Q8: Reviewer Freshness Across Iterations

**Question:** When the review loop iterates (research is revised based on reviewer feedback), should the same reviewer agents review the revision, or should new reviewer agents be spawned?

##### Options

**Option A: Same reviewers (continuity)**

The same `lu-completeness-reviewer`, `lu-accuracy-reviewer`, and `lu-actionability-reviewer` agents that reviewed iteration 1 also review iteration 2.

| Aspect             | Assessment                                                                                                                                                                   |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Context continuity | Reviewers remember what they flagged in iteration 1. They can check whether their specific concerns were addressed.                                                          |
| Efficiency         | No need to re-evaluate everything. Reviewers can focus on the changes.                                                                                                       |
| Blind spot risk    | Reviewers may develop blind spots from reviewing the same material twice. They may miss new issues introduced by the revision because they are focused on their prior flags. |
| Implementation     | Requires maintaining reviewer state across iterations. In Claude Code, this means keeping the reviewer's conversation alive.                                                 |

**Option B: New reviewers (fresh eyes)**

Spawn entirely new reviewer agents for iteration 2. They have never seen the material before.

| Aspect            | Assessment                                                                                                             |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Fresh perspective | Truly independent evaluation. No blind spots from prior review.                                                        |
| Duplication risk  | New reviewers may re-raise issues that were already addressed in revision 1. They do not know what was changed or why. |
| Token cost        | Full re-review of the entire corpus, not just the delta. Most expensive option.                                        |
| Implementation    | Simplest -- just spawn new agents. No state management.                                                                |

**Option C: Same agent with delta + prior review summary (recommended)**

The same reviewer agent reviews iteration 2, but receives an explicit input package:

1. **Delta:** What changed between iteration 1 and iteration 2 (new content, modified content, removed content).
2. **Prior review summary:** The reviewer's own findings from iteration 1, formatted as a checklist of "was this addressed?"
3. **Full corpus:** The complete research corpus (for context, but the reviewer is directed to focus on the delta).

| Aspect                | Assessment                                                                                                           |
| --------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Focused review        | Reviewer can efficiently check whether prior concerns were addressed while also evaluating new content.              |
| Blind spot mitigation | The delta highlights exactly what changed, reducing the chance of missing new issues in revised sections.            |
| Efficiency            | Faster than full re-review because the reviewer is directed to focus on changes.                                     |
| Implementation        | Requires computing a delta between iterations and formatting the prior review summary. Moderate implementation cost. |

##### Recommended Direction: Option C (same agent with delta + prior summary)

**Reasoning:**

1. **Context of prior review is valuable.** A reviewer who knows what they flagged can verify whether the revision actually addressed the concern or merely rephrased the same content.

2. **Delta focus prevents blind spots.** By explicitly showing what changed, the reviewer's attention is directed to the most relevant sections. This is better than hoping they notice changes by re-reading the full corpus.

3. **Token efficiency matters in review loops.** If the loop runs 2-3 iterations, full re-review at each iteration triples the review cost. Delta-focused review is proportional to the size of the revision.

4. **Prior summary as checklist prevents re-raising.** The reviewer sees their own prior findings and checks them off. This eliminates the "re-raised already-addressed issue" failure mode of Option B.

##### What Would Resolve It Definitively

A/B test 10 review loops: 5 with Option B (fresh reviewers) and 5 with Option C (same reviewer + delta). Measure:

- Number of re-raised already-addressed issues (should be lower with Option C)
- Number of new issues found in revisions (should be comparable)
- Token cost per iteration (should be lower with Option C)
- Final convergence quality (should be comparable or better with Option C)

##### Impact if Wrong: Medium

If we use fresh reviewers when continuity was better, we waste tokens on re-evaluation and risk re-raising resolved issues. If we use the same reviewer when fresh eyes were needed, we risk missing new issues in revisions. The maximum iteration cap prevents infinite loops in either case.

---

#### Q9: Review Scope on Re-Expansion

**Question:** When research is expanded or revised after review feedback, should reviewers re-review the entire research corpus or only the new/changed files?

**Note:** Per [Decision 16 (Revision Loop Targets)](../CANONICAL-DECISIONS.md#decision-16-revision-loop-targets), when Step 5 review identifies gaps in deep expansion files, the revision spawns targeted researcher agents for those specific gaps. The revision does NOT re-enter Step 4 as a whole. This question addresses what the reviewers see when they evaluate the targeted revision output.

##### Options

**Option A: Full re-review**

Reviewers evaluate the complete research corpus on every iteration.

| Aspect               | Assessment                                                                                 |
| -------------------- | ------------------------------------------------------------------------------------------ |
| Regression detection | Catches cases where revising file A introduces inconsistencies with file B.                |
| Token cost           | Most expensive. Full re-review of potentially 4-6 research files at 2000-4000 tokens each. |
| Redundancy           | Reviewers re-evaluate unchanged files that they already approved.                          |

**Option B: Delta-only review**

Reviewers evaluate only new or modified files.

| Aspect           | Assessment                                                                           |
| ---------------- | ------------------------------------------------------------------------------------ |
| Efficiency       | Proportional to the revision scope. If only 1 file changed, only 1 file is reviewed. |
| Integration risk | May miss contradictions between the revised file and unchanged files.                |
| Implementation   | Requires tracking which files changed between iterations.                            |

**Option C: Delta review with integration check (recommended)**

Reviewers evaluate the delta (new/changed files) in full detail. They also perform a lightweight "integration check" against the unchanged files: does the new content contradict or invalidate any existing approved findings?

| Aspect             | Assessment                                                                                                                                    |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Efficiency         | Full review on changes, lightweight scan on unchanged. Best balance of cost and coverage.                                                     |
| Integration safety | Explicitly checks for cross-file contradictions. Catches the most dangerous failure mode of delta-only review.                                |
| Implementation     | Requires structuring the review prompt to include: (1) full review of changed files, (2) integration check questions against unchanged files. |

The integration check is not a full re-review. It is a focused set of questions:

- Does the new content reference the same APIs/versions as the existing content?
- Does the new content contradict any finding in the existing content?
- Does the new content duplicate any finding in the existing content?
- Does the new content change the recommended approach in a way that affects unchanged files?

##### Recommended Direction: Option C (delta review with integration check)

**Reasoning:**

1. **Cross-file contradictions are the real danger.** If the architecture researcher recommends a state machine approach and the implementation researcher's revised file switches to an event-driven approach, those files are now inconsistent. A delta-only review would miss this.

2. **Full re-review is wasteful.** If 3 out of 4 research files were approved in iteration 1 and only 1 was revised, re-reviewing all 4 is 3x the necessary work.

3. **The integration check is cheap.** It is a targeted set of questions, not a full evaluation. It adds ~500-1000 tokens to the review prompt, not 4000-8000.

##### What Would Resolve It Definitively

Track 10 review iterations where files were revised. Check whether the integration check catches issues that delta-only review would miss. If it catches 0 issues, it may not be worth the overhead. If it catches 2+, it is essential.

##### Impact if Wrong: Low

If we do full re-review (Option A) when delta + integration check was sufficient, we waste tokens but do not lose quality. If we do delta-only (Option B) when integration checking was needed, we risk inconsistent research reaching the planner -- but the plan review loop (Step 8) serves as a second safety net.

---

### Practical Questions

#### Q10: Token Budget Reality Check

**Question:** V2 adds significant token overhead. Is the full research + review flow sustainable for every invocation?

**Note:** Per [Decision 17](../CANONICAL-DECISIONS.md#decision-17-trivial-complexity-handling), all 10 steps run at all complexity levels. TRIVIAL tasks are NOT excluded from research -- they use `fast` model tier and reduced budgets. This changes the framing of the original question: instead of "reserve full flow for MODERATE+," the question becomes "what are the realistic token costs at each complexity level given scaled-down model tiers?"

##### The Numbers

Estimated token costs per complexity level:

| Component                    | TRIVIAL (fast tier) | SIMPLE (fast/balanced) | MODERATE (balanced) | COMPLEX (balanced/capable) | CRITICAL (capable) |
| ---------------------------- | ------------------- | ---------------------- | ------------------- | -------------------------- | ------------------ |
| 4 parallel researchers       | ~12K                | ~20K                   | ~32K                | ~40K                       | ~50K               |
| 3 parallel reviewers         | ~6K                 | ~12K                   | ~18K (x1-3 iter)    | ~24K (x1-3 iter)           | ~30K (x1-3 iter)   |
| Deep expansion               | ~8K                 | ~12K                   | ~20K                | ~28K                       | ~36K               |
| Graduation                   | ~4K                 | ~6K                    | ~10K                | ~12K                       | ~14K               |
| Plan review (multi-reviewer) | ~4K                 | ~8K                    | ~12K (x1-2 iter)    | ~16K (x1-2 iter)           | ~20K (x1-3 iter)   |
| **Total v2 overhead**        | **~34K**            | **~58K**               | **~92-150K**        | **~120-210K**              | **~150-360K**      |

For comparison, v1's total overhead for the equivalent steps (single researcher, single plan checker) is approximately 20-30K tokens.

##### Is It Worth It?

The design principles doc presents the break-even analysis as a design assumption (per [Decision 15](../CANONICAL-DECISIONS.md#decision-15-unsourced-quantitative-claims)):

- We assume catching a hallucination in research costs ~500-1000 tokens to fix.
- We assume catching it in code review costs ~2000-5000 tokens.
- We assume catching it in verification costs ~5000-15000 tokens.
- Not catching it costs unbounded time.

For v2 to break even at MODERATE complexity, it needs to prevent approximately 5-10 executor hallucinations per phase (at the code-review-level cost). Based on informal v1 observations, we estimate 3-8 hallucinations per COMPLEX session. This makes the break-even plausible for MODERATE+ and marginal for SIMPLE. At TRIVIAL, the overhead is reduced (~34K with fast tier) but the benefit is also reduced (fewer hallucination opportunities in simple changes).

##### Recommended Direction: Full flow at all levels, scaled by complexity

This aligns with Decision 17:

| Complexity | Research Overhead | Model Tier       | Review Iterations | Break-Even Assessment                              |
| ---------- | ----------------- | ---------------- | ----------------- | -------------------------------------------------- |
| TRIVIAL    | ~34K              | fast             | max 1             | Marginal; fast tier keeps cost low                 |
| SIMPLE     | ~58K              | fast/balanced    | max 2             | Marginal; light version is proportionate           |
| MODERATE   | ~92-150K          | balanced         | max 2             | Likely breaks even (3+ hallucinations prevented)   |
| COMPLEX    | ~120-210K         | balanced/capable | max 3             | Almost certainly breaks even (5+ hallucinations)   |
| CRITICAL   | ~150-360K         | capable          | max 3             | Definitely breaks even (critical errors prevented) |

##### What Would Resolve It Definitively

Track actual token costs and hallucination rates across 30+ phases at various complexity levels. Build a cost-benefit model:

```
ROI = (hallucinations_prevented * avg_fix_cost) - v2_overhead
```

If ROI > 0 at MODERATE+, the core value proposition is validated. If ROI < 0 at TRIVIAL after 20+ runs, consider adding `--skip-research` as a recommended default for TRIVIAL (as an explicit user override, not a system default -- per Decision 17).

##### Impact if Wrong: High

If research overhead at TRIVIAL proves consistently wasteful, the accumulated token cost across many TRIVIAL tasks adds up. If research at MODERATE is skipped when it IS worth it, we lose the quality improvement that justifies v2's existence. The per-complexity budget tuning is the most impactful economic decision in v2.

---

#### Q11: User Experience During Research

**Question:** Research can take significant time (multiple web fetches, review iterations, graduation). Should the user be involved between research iterations?

##### The Time Problem

A full research cycle at MODERATE complexity involves:

| Step                  | Estimated Time     | Can Run Parallel?    | Notes                                                          |
| --------------------- | ------------------ | -------------------- | -------------------------------------------------------------- |
| 4 researchers         | 60-90 seconds each | Yes (all 4 parallel) | Assumes fast MCP response times (< 3s per call)                |
| 3 reviewers           | 30-60 seconds each | Yes (all 3 parallel) |                                                                |
| Revision (if needed)  | 30-60 seconds      | No (sequential)      |                                                                |
| Re-review (if needed) | 30-60 seconds      | Yes (parallel)       |                                                                |
| Graduation            | 20-40 seconds      | No (sequential)      |                                                                |
| **Total**             | **~2.5-5 minutes** |                      | Could be 50-100% longer with slow MCP/network (see note below) |

**Note on MCP latency:** The time estimates above assume fast MCP response times. Context7 MCP calls, WebSearch, and WebFetch all have network latency. If Context7 is slow (3-5 seconds per call) and a researcher makes 5-10 calls, that alone adds 15-50 seconds per researcher. Real-world timing could be significantly longer, especially with WebFetch of large pages. Monitor actual timings and adjust expectations accordingly.

For comparison, v1's single-researcher step takes 30-60 seconds.

##### Options

**Option A: Full auto (no involvement during research)**

The research pipeline runs from Step 2 through Step 6 without user interaction. User sees a progress indicator and final results.

| Aspect          | Assessment                                                                                   |
| --------------- | -------------------------------------------------------------------------------------------- |
| Speed           | No human delays between steps. Pipeline runs at machine speed.                               |
| User trust      | User must trust the system to research correctly without oversight.                          |
| Alignment risk  | If research goes in the wrong direction, 2-5 minutes are wasted before the user can correct. |
| Current pattern | Matches v1's fully automatic approach for most phases.                                       |

**Option B: User approval at step boundaries**

User must approve before advancing from research to review, from review to graduation, and from graduation to planning.

| Aspect    | Assessment                                                                                       |
| --------- | ------------------------------------------------------------------------------------------------ |
| Control   | User can redirect research at every boundary.                                                    |
| Speed     | Depends on user responsiveness. A 30-second human delay at each of 3 boundaries adds 90 seconds. |
| Fatigue   | Frequent approval prompts for routine work cause approval fatigue. Users start rubber-stamping.  |
| Alignment | Best alignment between user intent and research direction.                                       |

**Option C: Respect existing oversight levels (recommended)**

V1 already has four oversight levels. Use them:

| Oversight Level | Research Behavior                                                                              |
| --------------- | ---------------------------------------------------------------------------------------------- |
| `full-auto`     | Research runs Steps 2-6 without user interaction. User sees progress updates.                  |
| `milestone`     | Research runs without interaction. User reviews at milestone boundaries (not step boundaries). |
| `phase`         | User approves after research completion (end of Step 6) before planning begins.                |
| `flagged`       | User is consulted when review loop raises CRITICAL findings or when complexity is COMPLEX+.    |

| Aspect         | Assessment                                                                                                              |
| -------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Consistency    | Matches the existing oversight model. No new concepts for users to learn.                                               |
| Flexibility    | Users who want hands-off get it. Users who want control get it.                                                         |
| Implementation | The oversight framework already exists. Research steps just need to check the current oversight level before prompting. |

##### Recommended Direction: Option C (respect existing oversight levels)

**Reasoning:**

1. **The oversight framework exists for exactly this purpose.** v1 already solved the "how much user involvement" question. v2 should reuse the answer, not invent a new one.

2. **Different users want different levels.** A solo developer shipping fast wants `full-auto`. A developer working on a critical security feature wants `phase` or `flagged`. One policy cannot serve both.

3. **Research-specific involvement is overkill.** Research is a means to an end (better execution). The user cares about the output (plan quality, code quality), not the intermediate steps. The plan review step (Step 8) is where user involvement has the highest ROI.

4. **Progress updates are sufficient for most cases.** Showing "Researching: architecture patterns... (2/4 researchers complete)" keeps the user informed without demanding attention.

##### What Would Resolve It Definitively

Run 10 sessions at each oversight level and survey user satisfaction:

- Did you feel informed about research progress?
- Did research go in a direction you would have corrected?
- Would you have preferred more or less involvement?

If > 80% of users at each oversight level are satisfied, the policy is validated.

##### Impact if Wrong: Medium

If we provide too little user involvement, research may go in a wrong direction and waste 2-5 minutes. If we provide too much, users experience approval fatigue and the pipeline slows down. Neither outcome is catastrophic -- the plan review step and the user's ability to override at any time serve as safety nets.

---

#### Q12: Research for Non-Code Tasks

**Question:** V2's research system is designed for code implementation research (architecture patterns, library APIs, ecosystem alternatives, risk/pitfalls). What about non-code tasks?

**Note on task type determination:** This question assumes the task type is known. How task type is determined (inferred by the router, specified by the user, determined by the ideation step) is a secondary design question. The current assumption is that the router infers task type during complexity classification (Step 1 in v1's internal pipeline), but this should be validated during implementation. If the task type classifier is unreliable, the default code-implementation specializations serve as a safe fallback.

##### Non-Code Task Types

| Task Type      | Example                                         | Research Relevance                                               |
| -------------- | ----------------------------------------------- | ---------------------------------------------------------------- |
| Documentation  | "Write API documentation for the auth module"   | Low -- needs codebase reading, not external research             |
| Infrastructure | "Set up CI/CD pipeline for the monorepo"        | Medium -- needs tool research (GitHub Actions vs. others)        |
| Refactoring    | "Refactor the state machine to use XState"      | High -- needs library research, migration patterns               |
| Configuration  | "Add PostHog feature flags to the dashboard"    | Medium -- needs API research for the specific tool               |
| Bug fix        | "Fix the WebSocket timeout issue in production" | Variable -- may need deep investigation or may be a one-line fix |

##### Options

**Option A: One-size-fits-all (use the same 4 researchers for everything)**

| Aspect     | Assessment                                                                                                                                      |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Simplicity | No task-type detection needed. Same pipeline for everything.                                                                                    |
| Waste      | Architecture researcher investigating documentation tasks produces little value. Risk researcher evaluating a typo fix is overhead.             |
| Quality    | Researcher specializations are tuned for code implementation. Their prompts may produce poor results for documentation or infrastructure tasks. |

**Option B: Skip research for non-code tasks**

| Aspect         | Assessment                                                                                                                             |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Efficiency     | Non-code tasks proceed directly to planning.                                                                                           |
| Risk           | Some non-code tasks benefit enormously from research (e.g., infrastructure setup, tool migration). Blanket skipping is too aggressive. |
| Classification | Requires a task-type classifier, which adds its own complexity and error potential.                                                    |

**Option C: Adapt researcher specializations by task type (recommended)**

Maintain the 4-researcher parallel model but swap the specializations based on task type:

| Task Type           | Researchers Used                                                              |
| ------------------- | ----------------------------------------------------------------------------- |
| Code implementation | Architecture, Implementation, Ecosystem, Risk (default)                       |
| Infrastructure      | Tool comparison, Configuration patterns, Platform constraints, Migration risk |
| Documentation       | Codebase analysis, API surface mapping, Example patterns, Coverage gaps       |
| Refactoring         | Target architecture, Migration patterns, Compatibility constraints, Risk      |
| Bug fix             | Reproduction analysis, Root cause patterns, Fix strategies, Regression risk   |

| Aspect              | Assessment                                                                                                                                                                                                                                                                                                          |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Targeted research   | Each task type gets researchers whose specializations match the domain.                                                                                                                                                                                                                                             |
| Implementation cost | Requires defining new agent files for each task-type specialization (per Decision 2, agents are separate, not parameterized). This is a larger investment than if agents were parameterized, but provides clearer separation of concerns and allows each specialization to have its own tool set and output format. |
| Quality             | Researchers ask the right questions for the task type, producing higher-quality findings.                                                                                                                                                                                                                           |

##### Recommended Direction: Option C (adapt specializations by task type)

**Reasoning:**

1. **Infrastructure and refactoring tasks genuinely benefit from research.** Setting up CI/CD without researching current best practices leads to outdated configurations. Migrating to XState without researching migration patterns leads to avoidable bugs.

2. **Documentation tasks need a fundamentally different kind of "research."** Instead of web searches for library APIs, documentation tasks need codebase analysis to understand what to document. The research framework still applies -- it just uses different tools (Read/Grep/Glob instead of WebSearch/WebFetch).

3. **This is a future enhancement, not a launch requirement.** V2 can launch with the default code-implementation researchers. Task-type-specific researchers can be added incrementally as the system matures.

##### What Would Resolve It Definitively

Run 5 non-code tasks (2 infra, 2 docs, 1 refactoring) through:

- The default code-implementation researchers
- Task-type-adapted researchers

Compare research quality and execution outcomes. If adapted researchers produce measurably better research for non-code tasks, the approach is validated.

##### Impact if Wrong: Low

If we use code-implementation researchers for all task types, the worst case is that some researchers produce low-value findings for non-code tasks. The review loop filters out low-quality research. The wasted tokens are bounded by the research budget. This is an optimization, not a correctness issue.

---

#### Q13: When Initial Research Is Sufficient

**Question:** Sometimes Step 2 (initial research) produces comprehensive, high-quality findings. Should Step 4 (deep expand) be skippable if all reviewers approve on the first pass?

##### The Scenario

Step 2 produces research files. Step 5 reviews them. All three reviewers give APPROVED with no CRITICAL or IMPORTANT findings. The research is complete.

In the current design, Step 4 (deep expand) runs between research and review, always spawning specialist agents to add implementation details. But if the initial research is already detailed enough, this step produces redundant content.

##### Options

**Option A: Always run deep expand (current design)**

| Aspect       | Assessment                                                                                                        |
| ------------ | ----------------------------------------------------------------------------------------------------------------- |
| Consistency  | Deep expand always runs. No conditional logic.                                                                    |
| Completeness | Even if initial research looks good, deep expand may surface details that reviewers would have flagged otherwise. |
| Waste        | For well-researched topics, deep expand may add little value.                                                     |

**Option B: Skip deep expand if reviewers approve first pass (recommended)**

If all three reviewers approve initial research without CRITICAL or IMPORTANT findings, skip Step 4 and proceed directly to graduation (Step 6).

| Aspect     | Assessment                                                                                                                                                 |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Efficiency | Saves ~20K tokens and 30-60 seconds when initial research is sufficient.                                                                                   |
| Detection  | Reviewer approval is the signal. If reviewers are satisfied, the research is ready for graduation.                                                         |
| Risk       | Reviewers may approve research that is good enough to review but not detailed enough to plan from. The gap between "reviewable" and "plannable" is subtle. |

**Option C: Run a lightweight "sufficiency check" instead of full deep expand**

Instead of spawning full specialist agents, run a quick check: "Does this research contain enough implementation detail for the planner to create task-level specifications?" If yes, skip. If no, run deep expand.

| Aspect         | Assessment                                                                                                     |
| -------------- | -------------------------------------------------------------------------------------------------------------- |
| Precision      | More targeted than using reviewer approval as a proxy for sufficiency.                                         |
| Implementation | Requires defining "enough implementation detail" -- which is subjective and domain-dependent.                  |
| Cost           | The sufficiency check itself costs tokens (~2-3K), partially offsetting the savings from skipping deep expand. |

##### Recommended Direction: Option B (skip if all reviewers approve first pass)

**Reasoning:**

1. **Reviewers already evaluate completeness and actionability.** If `lu-completeness-reviewer` says all topics are covered and `lu-actionability-reviewer` says the research is specific enough to plan from, there is no reason to expand further.

2. **Deep expand is the most expensive optional step.** Spawning 2-3 specialist agents at ~8K tokens each for content that reviewers already approved is waste.

3. **The planner serves as a second check.** If the planner cannot create task-level specs from the research, it flags the gap. This is a natural fallback that catches cases where reviewers approved prematurely.

4. **This follows the diminishing returns principle.** If the first review pass produces zero findings, additional research passes will produce zero or near-zero findings. The convergence signal is clear: stop.

##### What Would Resolve It Definitively

Track 15 phases where reviewers approved on first pass. Compare outcomes:

- 8 phases run deep expand anyway
- 7 phases skip deep expand

Measure plan quality and execution success rate. If they are comparable, skipping is validated.

##### Impact if Wrong: Low

If we always run deep expand (Option A), the worst case is ~20K wasted tokens per phase where initial research was sufficient. If we skip when we should not have, the planner may produce a less detailed plan -- but the plan review loop (Step 8) catches plan-level gaps. The cost of getting this wrong is bounded by one extra plan review iteration.

---

#### Q14: Research File Retention Policy

**Question:** After MuninnDB graduation (Step 6), research files exist in two forms: on disk and as engrams in MuninnDB. What should happen to the disk files after the phase completes?

##### Options

**Option A: Keep in place**

Research files remain at `.planning/phases/NN-name/research/*.md` indefinitely.

| Aspect            | Assessment                                                                                                                                |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Human readability | Developers can always open a research file and read it. Good for understanding past decisions.                                            |
| Disk cost         | Negligible. Research files are small (~2-4KB each).                                                                                       |
| Clutter           | Over time, phase directories accumulate research from every phase. Without context, it is unclear which files are current vs. historical. |
| Conflict risk     | Phase-scoped directories (per Decision 7) prevent naming conflicts across phases.                                                         |

**Option B: Move to archive/ subdirectory**

After phase completion, move research files to `.planning/phases/NN-name/research/archive/`.

| Aspect         | Assessment                                                                                    |
| -------------- | --------------------------------------------------------------------------------------------- |
| Organization   | Current research is in the phase directory, past research is in `archive/`. Clear separation. |
| Accessibility  | Archived files are still accessible but out of the way.                                       |
| Naming         | Phase-scoped directories already prevent naming conflicts.                                    |
| Implementation | Requires a file-move step after phase completion.                                             |

**Option C: Delete entirely**

Remove research files from disk after graduation. Rely entirely on MuninnDB engrams.

| Aspect                   | Assessment                                                                                                                                     |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Clean working tree       | No research file clutter.                                                                                                                      |
| Loss of detail           | MuninnDB engrams are distilled. The full citations, alternative approaches, confidence reasoning, and examples in the original files are lost. |
| No human-readable backup | If MuninnDB engrams are insufficient for a future phase, the detailed research must be re-done from scratch.                                   |
| Risk                     | Permanent information loss. If `lu-learner` misjudges a promotion decision (Q4), the original detail is irrecoverable.                         |

**Option D: Git-commit then delete from working tree (recommended)**

After phase completion, commit research files to git (preserving them in repo history), then delete them from the working tree.

| Aspect                | Assessment                                                                                         |
| --------------------- | -------------------------------------------------------------------------------------------------- |
| Permanent record      | Full research detail is preserved in git history forever. Recoverable via `git show` or `git log`. |
| Clean working tree    | No file clutter after phase completion.                                                            |
| Human-recoverable     | A developer can always retrieve the original research with full detail if needed.                  |
| MuninnDB independence | Even if MuninnDB engrams are lost or corrupted, the original research exists in git.               |
| Implementation        | Requires a commit step after graduation. Can be automated as part of the phase-completion commit.  |

##### Recommended Direction: Option D (git-commit then delete from working tree)

**Reasoning:**

1. **Git is the natural archive for a code project.** Research files are text. Git handles text perfectly. The research becomes part of the project's history, alongside the code it informed.

2. **Working tree cleanliness matters.** A developer opening a phase's research directory should see only the current phase's research, not artifacts from 20 previous phases.

3. **MuninnDB is not a backup system.** Engrams are distilled summaries optimized for recall, not full-fidelity copies of the original research. Git preserves the full-fidelity version.

4. **Recovery is straightforward.** `git log --all -- .planning/phases/*/research/` shows every research file ever created. `git show {commit}:.planning/phases/NN-name/research/{file}` retrieves it. This is standard git workflow, not a custom mechanism.

5. **Aligns with the three-stage memory model.** Stage 1 (files) is ephemeral, Stage 2 (MuninnDB) is persistent-distilled, and git provides a Stage 0 (permanent-full-fidelity) backstop.

##### Commit Convention

Research files should be committed with a recognizable pattern. Consider using `docs(research)` instead of `chore(research)` since research files are documentation artifacts, not code changes:

```
docs(research): archive phase {NN} research files

Research for phase {NN}-{name} graduated to MuninnDB.
Files preserved in git history, removed from working tree.

Engrams: research:approach-ws-reconnect, research:api-bun-websocket, ...
```

This makes it easy to find archived research with `git log --grep="docs(research)"`.

##### What Would Resolve It Definitively

Run 10 phases with this policy. Track:

- How often a developer retrieves archived research from git (frequency of actual need)
- Whether the commit convention makes retrieval easy
- Whether MuninnDB engrams are sufficient for cross-phase recall without file access

If retrieval from git is needed < 10% of the time, the policy is working. If needed > 30%, consider keeping files on disk (Option B) instead.

##### Impact if Wrong: Low

If we keep files on disk (Option A/B) when deletion was fine, the only cost is minor clutter. If we delete files when we should have kept them, the research is still in git -- recovery takes a `git show` command, not a re-research cycle. The worst case is a minor inconvenience, not data loss.

---

### New Questions (Identified in Review Round 1)

#### Q15: Research Synthesizer Isolation, Error Propagation, and Re-Run Semantics

**Context:** The `lu-research-synthesizer` is documented in the agent catalog at [`04-agent-orchestration/README.md`](../04-agent-orchestration/README.md) as an **Enhanced Agent** (existing from v1). It combines the 4 parallel researcher outputs into `SUMMARY.md`, sits between research output and the discuss step in the pipeline, and re-runs after deep expand (Step 4). Its role and identity are established -- what remains open are operational details around isolation, error propagation, and re-run behavior.

##### Sub-Questions

1. **What isolation level does the synthesizer use?** The synthesizer must read all 4 research files by design, which means it cannot use cold isolation. The `04-agent-orchestration/` context isolation summary table does not explicitly list `lu-research-synthesizer`'s isolation mode. Warm isolation (project structure + research files, no session narrative) is the most likely fit, consistent with the agent's cross-file aggregation role and analogous to `lu-research-graduator`'s warm classification. This should be confirmed and added to the isolation summary table.

2. **How are synthesizer errors detected and corrected?** If the synthesizer simplifies or mischaracterizes a researcher's finding, the error propagates to all downstream consumers (reviewers, planner, executor). The review team (Step 5) serves as the primary safety net -- reviewers see both the original research files and `SUMMARY.md`, so they can flag discrepancies. However, no explicit protocol exists for reviewers to compare `SUMMARY.md` against source files and report synthesizer-introduced distortions as a specific gap type.

3. **Should the synthesizer re-run after review-triggered revisions?** The agent catalog notes that `lu-research-synthesizer` re-runs after deep expand (Step 4). But when the review loop (Step 5) triggers targeted re-expansion via [Decision 16](../CANONICAL-DECISIONS.md#decision-16-revision-loop-targets), the synthesizer's re-run behavior is unspecified. Options:
   - **Re-run after every revision**: Keeps `SUMMARY.md` current but adds latency per review iteration.
   - **Re-run only after deep expand, not after review revisions**: Simpler, but `SUMMARY.md` becomes stale relative to the latest research files during review iterations.
   - **Re-run once after review convergence**: Deferred synthesis update; downstream consumers (planner, executor) get the final consolidated view.

##### Recommended Direction: Warm isolation, reviewer comparison protocol, deferred re-run

1. **Isolation**: Classify `lu-research-synthesizer` as **warm** in the isolation summary table. It reads all research files and project structure but has no session narrative or MuninnDB write access.
2. **Error detection**: Add a synthesizer-accuracy check to reviewer protocols: reviewers should flag `G-ACC-*` gaps when `SUMMARY.md` misrepresents source file content.
3. **Re-run timing**: Re-run the synthesizer once after review convergence (not after each review iteration). During review iterations, reviewers work from the original research files directly. After convergence, one final synthesis run updates `SUMMARY.md` for downstream consumers.

##### Impact if Wrong: Medium

If the isolation level is misclassified, it could either over-restrict the synthesizer (breaking its ability to aggregate) or under-restrict it (leaking session state into synthesis). If synthesizer errors go undetected, distorted findings propagate to planning and execution. If re-run timing is wrong, either token cost increases (re-run per iteration) or downstream consumers work from stale summaries.

---

#### Q16: Error Handling and Retry Semantics for Research Agents

**Question:** What happens when a research agent fails mid-execution, times out, or produces empty output?

The `07-external-research/` section explicitly recommends "failure handling and retry logic per step" and "safety net middleware." But the current v2 design does not specify error handling for research agents.

##### Relevant Failure Modes

| Failure Mode                                | Example                                                    | Impact                                                |
| ------------------------------------------- | ---------------------------------------------------------- | ----------------------------------------------------- |
| MCP tool timeout                            | WebSearch/WebFetch times out or returns no results         | Researcher produces findings without external sources |
| MCP tool unavailable                        | Context7 MCP server is down                                | Researcher cannot access documentation                |
| Empty output                                | Researcher produces 0 findings (e.g., no relevant results) | Research file is empty or missing                     |
| Token budget exceeded                       | Researcher exceeds budget before completing all facets     | Partial research (some facets covered, others not)    |
| Researcher produces findings with 0 sources | All findings are unverified speculation                    | Accuracy reviewer will flag, but token cost is wasted |

##### Sub-Questions

1. **Retry semantics:** Should a failed researcher be retried? If so, how many times? With what backoff?
2. **Graceful degradation:** If 1 of 4 researchers fails, should the pipeline continue with 3 research files? Or should it retry until all 4 succeed?
3. **Partial results:** If a researcher produces partial output (2 of 5 expected facets), should this be accepted or retried?
4. **MCP fallback:** If WebSearch is unavailable, should researchers fall back to Context7 only? Or proceed with codebase analysis only (no external sources)?

##### Recommended Direction: Needs discussion

This should be folded into the research system implementation. A reasonable starting point:

- **Retry once** on timeout or empty output, with the retry using a different query or approach.
- **Continue with N-1 researchers** if one researcher fails after retry. Log a warning. The review loop will flag the gap.
- **Accept partial results** and let the review loop identify what is missing.
- **Fall back gracefully** through available tools: WebSearch -> Context7 -> codebase analysis only.

##### Impact if Wrong: Medium

If error handling is too aggressive (retry 3 times, block on any failure), the pipeline stalls on transient issues. If too lenient (accept empty results, no retry), the research quality degrades silently. The review loop serves as a safety net, but repeated failures waste significant tokens before the review loop catches the problem.

---

## Decision Dependencies

Several questions are interdependent. Resolving one constrains or informs others:

```
Q2 (Orchestrator location) ────> Q15 (Synthesizer semantics)
    The orchestrator design determines how the synthesizer
    re-run is triggered (after deep expand, after review convergence).

Q4 (Engram lifecycle) ────> Q6 (Cross-phase reuse)
    If engrams are promoted and deleted (Q4 Option D), cross-phase reuse
    depends on promoted pattern:*/pitfall:* engrams, not research:* engrams.

Q5 (Files vs. MuninnDB) ────> Q14 (File retention)
    If files are the primary source for re-planning (Q5), they must not
    be deleted until the phase is fully complete (constrains Q14).

Q7 (Reviewer disagreement) ────> Q10 (Token budget)
    If the disagreement resolution strategy triggers additional review
    iterations, this directly impacts the token budget calculations.
    A more aggressive disagreement resolution (iterate on every IMPORTANT)
    increases per-phase cost by 30-50%.

Q8 (Reviewer freshness) ────> Q9 (Review scope on re-expansion)
    If same reviewer with delta (Q8 Option C), the delta scope (Q9) is
    naturally communicated through the reviewer's input package.

Q10 (Token budget) ────> Q13 (When initial research is sufficient)
    If token costs are a concern, skipping deep expand when reviewers
    approve first pass (Q13) becomes more important.

Q15 (Synthesizer semantics) ────> Q16 (Error handling)
    The synthesizer's error propagation model (Q15 sub-question 2)
    must be consistent with the broader research agent error handling (Q16).
```

**Resolved dependency chains** (no longer active):

- Q1 (Separate vs. parameterized) -> Q12 (Non-code tasks): Resolved by Decision 2. Separate agents are canonical; Q12 must account for the cost of new agent files per task type.
- Q3 (Complexity gating) -> Q10 (Token budget): Resolved by Decision 17. All steps run at all levels; Q10 now models scaled budgets per complexity, not step skipping.

---

## Resolution Timeline

Not all questions need to be resolved before implementation begins. Recommended ordering, mapped to the implementation plan phases in [06-implementation-plan/](../06-implementation-plan/):

### Phase 1: Must resolve before any v2 implementation

_Maps to: Implementation Plan Phase 1 (Foundation)_

| Question                   | Why                                                     |
| -------------------------- | ------------------------------------------------------- |
| Q2 (Orchestrator location) | Determines where v2 code lives and how it relates to v1 |

**Already resolved in Phase 1:** Q1 (Decision 2), Q3 (Decision 17), step numbering (Decision 1).

### Phase 2: Resolve during research system implementation

_Maps to: Implementation Plan Phase 2 (Research Agents) and Phase 3 (Review System)_

| Question                                 | Why                                                                  |
| ---------------------------------------- | -------------------------------------------------------------------- |
| Q5 (Files vs. MuninnDB source selection) | Needed before executors can consume research                         |
| Q7 (Reviewer disagreement)               | Needed before the review loop can converge                           |
| Q10 (Token budget)                       | Needed to set research budgets in config                             |
| Q15 (Synthesizer semantics)              | Isolation and re-run timing needed before research pipeline is built |
| Q16 (Error handling)                     | Needed before researchers can fail gracefully                        |

### Phase 3: Resolve during review loop implementation

_Maps to: Implementation Plan Phase 3 (Review System)_

| Question                          | Why                                                          |
| --------------------------------- | ------------------------------------------------------------ |
| Q8 (Reviewer freshness)           | Determines review loop iteration design                      |
| Q9 (Review scope on re-expansion) | Determines what reviewers see on iteration 2+                |
| Q13 (Skip deep expand)            | Determines whether the deep expand step has a skip condition |

### Phase 4: Resolve during MuninnDB integration

_Maps to: Implementation Plan Phase 4 (MuninnDB Integration)_

| Question               | Why                                                       |
| ---------------------- | --------------------------------------------------------- |
| Q4 (Engram lifecycle)  | Determines cleanup strategy for research:\* engrams       |
| Q6 (Cross-phase reuse) | Determines staleness metadata requirements for graduation |
| Q14 (File retention)   | Determines post-graduation file management                |

### Phase 5: Resolve after initial v2 deployment

_Maps to: Implementation Plan Phase 5-6 (Integration and Polish)_

| Question              | Why                                         |
| --------------------- | ------------------------------------------- |
| Q11 (User experience) | Can iterate based on real user feedback     |
| Q12 (Non-code tasks)  | Enhancement that can be added incrementally |

---

## Related Documentation

- [Canonical Decisions](../CANONICAL-DECISIONS.md) -- Resolved cross-section conflicts that answer several questions above
- [Design Principles](../00-design-principles/) -- The foundational principles that inform these decisions
- [Workflow Steps](../01-workflow-steps/) -- The 10-step pipeline these questions apply to
- [Research System](../02-research-system/) -- Multi-agent research design
- [MuninnDB Integration](../03-muninndb-integration/) -- Graduation model and per-task recall
- [Agent Orchestration](../04-agent-orchestration/) -- Agent ecosystem and team composition
- [Review Loops](../05-review-loops/) -- Convergence-based review patterns
- [Implementation Plan](../06-implementation-plan/) -- Phased implementation with config schema
- [Complexity Gating](../../../../.claude/rules/complexity-gating.md) -- v1 complexity matrix and model routing
