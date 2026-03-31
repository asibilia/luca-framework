# Review: 08-open-questions

## Reviewer: External Research / Open Questions Reviewer (Cold Isolation)

## Date: 2026-03-22

## Iteration: 1

## Summary Assessment

The open questions document is exceptionally well-structured. Each of 14 questions follows a rigorous format: problem statement, options with tabular trade-off analysis, recommended direction with numbered reasoning, counter-arguments, resolution criteria, and impact assessment. The decision dependency diagram and phased resolution timeline demonstrate mature systems thinking. The recommendations are generally well-reasoned and internally consistent.

However, the document has two significant gaps: (1) several design tensions surfaced in other v2 sections are not represented here, and (2) the trade-off analysis for a few questions is subtly biased toward the recommended option, with alternative options receiving thinner analysis.

**Overall quality**: HIGH. This is the most operationally useful section of the v2 documentation -- it gives an implementer a clear decision framework and a prioritized resolution path.

---

## Critical Findings

- **CRIT-OQ-001**: **Missing question: Step numbering inconsistency across v2 sections.** The `02-research-system/README.md` describes Research as "Step 4" in a 10-step pipeline (Parse & Route, Cognitive Pre-Flight, Complexity Classification, Research, Discussion, Planning, Execution, Verification, Learning, Commit). The `01-workflow-steps/README.md` describes it as "Step 2" in a different 10-step pipeline (Ideate, Research, Discuss + Pre-mortem, Deep Expand, Review Research, Graduate to MuninnDB, Plan, Review Plan, Execute, Verify + UAT). The `03-muninndb-integration/README.md` uses yet another numbering (Research as Step 4, Graduation as Step 6). These are three different pipeline models in three different sections of the same documentation set.

  This is not merely a documentation inconsistency -- it is an unresolved architectural question: **what is the canonical step sequence?** The two models are structurally different: one includes Parse/Route and Cognitive Pre-Flight as explicit steps; the other folds them into the orchestrator and starts with Ideate. An implementer cannot build the pipeline without knowing which model is correct.

  The `00-design-principles/REVIEW.md` already flagged this as CRIT-DP-001, indicating it was identified but not resolved. It should be tracked as an open question with options and a recommended direction.

  **Resolution**: Add as Q15 or resolve by declaring the canonical step numbering and updating all sections to match.

- **CRIT-OQ-002**: **Missing question: Isolation level contradiction for TRIVIAL tasks.** The `00-design-principles/agent-isolation-patterns.md` states that TRIVIAL tasks have "None (no research phase)" and "None (no plan phase)" for isolation. But the `complexity-gating.md` rule states "ALL workflow steps run at every complexity level." The `00-design-principles/REVIEW.md` flagged this as IMP-DP-003 and it remains unresolved.

  Q3 (Complexity gating interaction) partially addresses this by recommending that TRIVIAL tasks skip steps 2-6, but it does not explicitly acknowledge or resolve the contradiction with the existing v1 invariant that "all steps always run." Q3's reasoning at line 240 attempts to redefine the invariant ("Research is a new capability, not verification. Skipping research for TRIVIAL tasks is not the same as skipping verification"), but this is a significant philosophical change from v1 that deserves explicit treatment as a first-class design decision rather than a parenthetical justification.

  **Resolution**: Either (a) elevate this into a standalone question about updating the v1 "all steps always run" invariant, or (b) add a section to Q3 that explicitly acknowledges and retires the v1 invariant for non-verification steps, with reasoning for why this is acceptable.

---

## Important Findings

- **IMP-OQ-001**: **Q1 trade-off analysis is biased toward Option B (parameterized).** The analysis for Option A (separate agents) lists "7 new agent files" as a maintenance cost but does not quantify the actual per-file cost (each agent file in the codebase is ~50-80 lines of configuration, not a heavyweight artifact). Meanwhile, Option B's "slightly more complex prompt construction" is described as invisible to the model, downplaying the engineering complexity of the parameterization machinery.

  The counter-argument at line 78 ("If researchers ever need different tool sets, different model routing presets, or fundamentally different output structures, parameterization becomes forced abstraction") is exactly the scenario that the `04-agent-orchestration/research-team.md` describes -- the four researchers have meaningfully different focus prompts, different tool usage patterns (risk researcher emphasizes WebSearch for vulnerability databases; implementation researcher emphasizes Context7 for API docs), and the `04-agent-orchestration/review-team.md` shows the three reviewers have different structured output schemas. The counter-argument is not a hypothetical -- it describes the current design.

  **Resolution**: Rebalance the analysis. Acknowledge that Option B requires a prompt composition engine (a non-trivial infrastructure investment) and that the current agent specs in `04-agent-orchestration/` already show specialization divergence. If the recommendation remains parameterized, justify it against the specific divergences that already exist, not against a hypothetical future.

- **IMP-OQ-002**: **Q5 edge cases are well-identified but the fallback chain at lines 401-415 has a gap.** The chain goes: MuninnDB recall -> read referenced files -> read any research files -> proceed without context. Step 3 ("read any research files in .planning/research/") does not distinguish between current-phase files and stale files from prior phases. If cross-phase files exist (per Q6's recommendation to allow recall with staleness warnings), an executor falling back to level 3 could load stale research from 3 phases ago without any staleness indicator. The fallback chain erases the staleness metadata that Q6 carefully adds to MuninnDB engrams.

  **Resolution**: Add phase metadata to research files (in their YAML frontmatter) or restrict the level 3 fallback to files from the current phase only.

- **IMP-OQ-003**: **Q7 resolution strategy uses a count-based threshold ("total IMPORTANT findings >= 3") that is arbitrary.** The threshold of 3 is not derived from any data or principle. Why not 2? Why not 4? The count-based approach also fails to account for severity distribution: three IMPORTANT findings from the same reviewer (all about accuracy) represent a systemic issue, while one IMPORTANT from each of three reviewers may represent three independent minor gaps. Count alone is insufficient.

  **Resolution**: Justify the threshold (e.g., "based on v1 data showing 2.3 average legitimate important findings per review") or replace it with a more principled criterion (e.g., "if any single reviewer has 2+ IMPORTANT findings in the same research file, iterate").

- **IMP-OQ-004**: **Q10 break-even analysis depends on v1 hallucination data that is not cited.** Line 736 states "Based on v1 data showing 3-8 hallucinations per COMPLEX session." The `00-design-principles/REVIEW.md` already flagged similar unsourced claims (CRIT-DP-002, IMP-DP-002). If this v1 data exists, it should be referenced. If it is an estimate, it should be labeled as such. The entire economic justification for v2 depends on this number.

  **Resolution**: Either cite the v1 session data that produced the 3-8 hallucinations/session figure, or qualify it as an assumption: "We estimate, based on informal v1 observations, that..."

- **IMP-OQ-005**: **Missing question: Research synthesizer role and failure modes.** The `01-workflow-steps/README.md` step overview table mentions `lu-research-synthesizer` as a key agent in Step 2. The `02-research-system/README.md` describes synthesis as a post-research aggregation step. But neither the open questions document nor the `04-agent-orchestration/README.md` agent catalog mentions a synthesizer agent. The agent orchestration section lists 4 researchers, 3 reviewers, and 1 graduator -- no synthesizer.

  This raises an untracked design question: Is there a synthesis step between parallel research and review? If so, who performs it? Is it a new agent, or does the orchestrator handle it? What happens if the synthesizer introduces errors or loses nuance from the individual research files? The external research section's Theme 3 (Parallel Agents with External Aggregation) explicitly calls for a "separate aggregation step" -- but this step is not represented in the agent catalog or the open questions.

  **Resolution**: Add as a new open question addressing: (a) whether synthesis is a separate step or folded into the review, (b) who performs it, and (c) what isolation level applies to the synthesizer.

- **IMP-OQ-006**: **Missing question: Error handling and retry semantics for research agents.** The `07-external-research/claude-workflow-patterns.md` explicitly recommends "failure handling and retry logic per step" and asks "Research agent fails? Use cached/prior research." The `07-external-research/langchain-open-swe.md` recommends "safety net middleware" for when agents fail to produce output. But the open questions document has no question about what happens when a research agent fails mid-execution, times out, or produces empty output.

  Relevant failure modes: (a) WebSearch/WebFetch times out or returns no results, (b) Context7 MCP is unavailable, (c) a researcher produces findings with zero sources, (d) a researcher exceeds its token budget before completing all facets.

  **Resolution**: Add as a new open question or fold into Q10 (Token Budget) as a subsection on failure handling.

- **IMP-OQ-007**: **Decision dependency diagram is incomplete.** The diagram at lines 1099-1123 correctly identifies 6 dependency chains, but misses at least two:
  1. **Q1 (Parameterized agents) -> Q8 (Reviewer freshness)**: If reviewers are parameterized (a single agent spawned with different configs), "same reviewer" in Q8 means "same parameterized agent with same config" -- the identity semantics change.
  2. **Q7 (Reviewer disagreement) -> Q10 (Token budget)**: If the disagreement resolution strategy triggers additional review iterations, this directly impacts the token budget calculations. A more aggressive disagreement resolution (iterate on every IMPORTANT) increases per-phase cost by 30-50%.

  **Resolution**: Add the two missing edges to the dependency diagram.

---

## Minor Findings

- **MIN-OQ-001**: **Q6 staleness thresholds (< 1 week FRESH, 1-4 weeks AGING, > 4 weeks STALE) are presented without justification.** Why 1 week? Why 4 weeks? These feel like reasonable defaults but the reasoning is absent. For a rapidly moving project, 1 week could already be stale if a major refactor happened. For a stable project, 4-week-old research might still be perfectly valid.

  **Resolution**: Note that these are initial defaults that should be tuned based on project velocity, and add a config path (`.planning/config.json`) for overriding them.

- **MIN-OQ-002**: **Q14 commit convention uses `chore(research)` prefix.** The existing codebase uses conventional commit prefixes (`feat`, `fix`, `chore`, `docs`). Using `chore(research)` is consistent but could be confused with other chore commits. Consider `docs(research)` since research files are documentation artifacts, not code changes.

- **MIN-OQ-003**: **The Resolution Timeline (lines 1127-1168) is well-organized but does not reference the implementation plan phases in `06-implementation-plan/README.md`.** The open questions phasing (Phase 1-5) is independent of the implementation plan phasing (also Phase 1-6). An implementer must cross-reference both to understand which design decisions must be made before which implementation work. A mapping table between the two phasing systems would help.

  **Resolution**: Add a note mapping open question phases to implementation plan phases, or consolidate into a single phasing reference.

- **MIN-OQ-004**: **Q11 time estimates (2.5-5 minutes for full research cycle) do not account for MCP latency.** The estimates list 60-90 seconds per researcher, but Context7 MCP calls, WebSearch, and WebFetch all have network latency. If Context7 is slow (3-5 seconds per call) and a researcher makes 5-10 calls, that alone adds 15-50 seconds per researcher. The real-world timing could be 50-100% longer than estimated.

  **Resolution**: Add a note that the time estimates assume fast MCP response times and could be longer in practice, especially with WebFetch of large pages.

- **MIN-OQ-005**: **Q12 (Non-code tasks) recommends adapting researcher specializations by task type but does not address how task type is determined.** Is it inferred by the router? Specified by the user? Determined by the ideation step? If the task type classification is wrong, the researchers get the wrong specializations. This is a secondary design question that Q12 assumes has been answered elsewhere.

---

## Verdict: NEEDS REVISION

The document is structurally excellent and the majority of its 14 questions are well-analyzed with balanced trade-offs and defensible recommendations. However, the two critical findings -- a missing question about the canonical step numbering inconsistency and a missing question about the v1 "all steps always run" invariant contradiction -- represent genuine architectural ambiguities that an implementer would need resolved before building v2. Additionally, the missing questions about the research synthesizer role (IMP-OQ-005) and research agent failure handling (IMP-OQ-006) leave meaningful gaps in the coverage of the v2 design space.

Revision scope: Add 2-4 new questions (step numbering, invariant update, synthesizer role, failure handling), rebalance Q1's trade-off analysis, fix the Q5 fallback chain staleness gap, justify Q7's threshold, and complete the dependency diagram. The existing 14 questions need no structural changes -- they are well-written and the recommendations are sound.
