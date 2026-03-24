# Review: 04-agent-orchestration

## Reviewer: Agent Architecture Reviewer (Cold Isolation)

## Date: 2026-03-22

## Iteration: 1

## Summary Assessment

The agent orchestration section is well-structured, thorough, and demonstrates deep understanding of both the existing Luca architecture and the v2 additions. Agent specifications are detailed enough for implementation, the orchestration flow is well-reasoned with clear data flow, and the design trade-off analysis (four agents vs. parameterized) is exemplary. However, there are several model routing inconsistencies between this section and the implementation plan, an isolation mode contradiction for researchers, a missing agent that appears in the sequence diagram but has no spec, and the 10-step pipeline numbering diverges from the existing complexity-gating rule's 15-step pipeline.

## Critical Findings

- **CRIT-AO-001**: `research-team.md` vs `new-agents-needed.md` -- **Researcher model routing preset contradiction.** `research-team.md` assigns all 4 researchers the `ROUTER` preset (fast/fast/balanced/balanced/balanced), while `new-agents-needed.md` assigns them `ORCHESTRATOR` (fast/balanced/balanced/capable/capable). These produce materially different model tiers at SIMPLE (fast vs balanced) and COMPLEX/CRITICAL (balanced vs capable). The `orchestration-flow.md` sequence diagram labels researchers with `ROUTER`, matching `research-team.md`. **Resolution:** Decide on one preset and update all three documents. Given that `lu-phase-researcher` (the agent being replaced) currently uses `ORCHESTRATOR`, and the existing codebase assigns `ORCHESTRATOR` to all researcher agents, `ORCHESTRATOR` appears to be the correct choice. If `ROUTER` is intended as a cost savings measure for researchers, this must be documented as a deliberate divergence with rationale.

- **CRIT-AO-002**: `new-agents-needed.md` vs `graduation-agent.md` -- **Graduator model routing preset contradiction.** `graduation-agent.md` assigns `lu-research-graduator` the `ORCHESTRATOR` preset, while `new-agents-needed.md` assigns it `DEEP_ANALYSIS`. The summary table at the bottom of `new-agents-needed.md` also says `DEEP_ANALYSIS`. **Resolution:** Pick one. `ORCHESTRATOR` is more consistent with the graduation-agent.md rationale ("graduation is orchestration work"), while `DEEP_ANALYSIS` is more consistent with the careful distillation reasoning in `new-agents-needed.md`. Document the decision and update the inconsistent document.

- **CRIT-AO-003**: `research-team.md` vs `new-agents-needed.md` -- **Researcher isolation mode contradiction.** `research-team.md` specifies `isolation: "cold"` for all 4 researchers, which is correct per the design principles. However, `new-agents-needed.md` specifies `isolation: "none"` in the shared researcher frontmatter. Cold isolation is fundamental to the research design (the entire section argues for it), so `"none"` is almost certainly wrong. **Resolution:** Update `new-agents-needed.md` shared frontmatter to `isolation: "cold"`.

- **CRIT-AO-004**: `research-team.md` vs `new-agents-needed.md` -- **Researcher output file naming conflict.** `research-team.md` specifies numbered output files: `01-architecture-patterns.md`, `02-implementation-approaches.md`, `03-existing-solutions.md`, `04-pitfalls-and-risks.md`. `new-agents-needed.md` specifies different names: `architecture.md`, `implementation.md`, `ecosystem.md`, `risk.md`. Meanwhile, `multi-agent-research.md` (in 02-research-system) uses the same numbered convention as `research-team.md`. **Resolution:** Align all three documents on a single naming convention. The numbered convention is preferable because it defines reading order and matches the multi-agent-research doc.

- **CRIT-AO-005**: `orchestration-flow.md` -- **Pipeline step numbering diverges from existing system.** The orchestration flow defines a "10-step pipeline" (Steps 1-10), but the existing `complexity-gating.md` rule defines a 15-step pipeline. The v2 steps do not map cleanly to the v1 steps. For example, v2's "Step 5: REVIEW RESEARCH" and "Step 6: GRADUATE TO MUNINNDB" are new steps with no v1 equivalents, but the numbering implies they replace v1 steps 5-6 rather than being additions. **Resolution:** Either (a) explicitly document how v2's 10 steps map to v1's 15 steps, or (b) use the v1 numbering with new steps inserted (e.g., 4a, 4b). This is critical because the complexity-gating rule is a system-wide always-apply rule that all agents consult.

## Important Findings

- **IMP-AO-001**: `orchestration-flow.md` -- **`lu-research-synthesizer` appears in the sequence diagram (Step 3) but has no agent specification in the 04-agent-orchestration section.** It is listed in the "Enhanced Agents" table of README.md but only indirectly. There is no agent spec, no prompt template, and no clear description of how it changes in v2. Since it sits on the critical path between researchers and the review loop, its specification gap is significant. **Resolution:** Either add a specification section for the enhanced `lu-research-synthesizer` (it already exists in the codebase at `src/agents/general/lu-research-synthesizer.agent.ts`), or explicitly document that it is unchanged from v1 and reference the existing agent file.

- **IMP-AO-002**: `new-agents-needed.md` vs `research-team.md` -- **Researcher tool list divergence.** `research-team.md` gives the architecture researcher tools `["Read", "Write", "Grep", "Glob", "WebSearch", "WebFetch"]` (no Context7, no Bash). `new-agents-needed.md` gives ALL researchers tools including `"Bash"` and `"mcp__context7__*"` in the shared frontmatter. The `research-team.md` version gives Context7 only to the implementation researcher. **Resolution:** Align tool lists. The `research-team.md` approach (Context7 only for implementation researcher) is more disciplined, but `new-agents-needed.md` argues all researchers could benefit from Context7. Either way, both documents must agree. Also: `Bash` is included in `new-agents-needed.md` but absent from `research-team.md` -- decide whether researchers need shell access.

- **IMP-AO-003**: `new-agents-needed.md` -- **Reviewer shared frontmatter has `promotable_to: "T1"` for cognition but the 04-agent-orchestration docs specify T0 with no promotion.** The `review-team.md` says completeness and accuracy reviewers are T0/T0 with no promotion path, but the shared frontmatter in `new-agents-needed.md` sets `promotable_to: "T1"`. This means the implementation code would allow promotion to T1, contradicting the architectural intent of T0-only stateless review. **Resolution:** If T0-only is the design intent (which is well-argued in `review-team.md`), change `promotable_to` to `"T0"` in `new-agents-needed.md`.

- **IMP-AO-004**: `new-agents-needed.md` -- **Graduator concept prefix uses `research:*` while `graduation-agent.md` uses `pattern:*`, `pitfall:*`, `decision:*`.** This is a significant semantic divergence. The `research:*` prefix in `new-agents-needed.md` routes everything to the repo vault, while the `pattern:*`/`pitfall:*` prefixes in `graduation-agent.md` route to the default vault per vault-routing rules. These are fundamentally different vault routing decisions. **Resolution:** Decide which concept prefix scheme is correct. The `graduation-agent.md` approach (using existing prefixes like `pattern:*`, `pitfall:*`) integrates better with the existing vault-routing system and does not require inventing a new `research:*` prefix. However, `new-agents-needed.md`'s `research:*` approach has the advantage of making graduated findings easily distinguishable from execution-learned patterns.

- **IMP-AO-005**: `review-team.md` and `research-review-protocol.md` -- **Review loop iteration cap source differs.** `review-team.md` says the iteration cap comes from `planVerificationIterations` in the complexity matrix. `research-review-protocol.md` does not specify the config key name. Neither document proposes a new `researchReviewIterations` config key, which would be needed since plan verification and research review are different loops with potentially different budgets. **Resolution:** Define a dedicated config key (e.g., `research_review_iterations`) in the complexity matrix and reference it consistently.

- **IMP-AO-006**: `orchestration-flow.md` -- **Token budget estimates at MODERATE show researchers at ~8K per agent, but `multi-agent-research.md` specifies ~20K per researcher at MODERATE.** The 2.5x discrepancy suggests different assumptions about research depth. **Resolution:** Align the token budget tables or explain the difference (e.g., orchestration-flow may be counting output tokens only while multi-agent-research counts total input+output).

- **IMP-AO-007**: `review-team.md` -- **Completeness reviewer has `WebSearch` in its tool list but the shared reviewer frontmatter in `new-agents-needed.md` only gives `["Read", "Grep", "Glob"]`.** If the completeness reviewer needs to check whether alternatives exist that researchers missed, it needs WebSearch. Similarly, the accuracy reviewer needs `WebFetch` per `review-team.md` but the shared frontmatter does not include it. **Resolution:** Either give each reviewer a custom tool list (which `review-team.md` already does) or update the shared frontmatter in `new-agents-needed.md` to note that tool lists are per-reviewer, not shared.

## Minor Findings

- **MIN-AO-001**: `README.md` -- The Context Isolation Summary table lists `lu-actionability-reviewer` and `lu-research-graduator` both as "warm" isolation, but `lu-actionability-reviewer` is described as warm for codebase access while `lu-research-graduator` is warm for MuninnDB + project structure access. These are meaningfully different "warm" modes. A footnote distinguishing the two would prevent implementation confusion.

- **MIN-AO-002**: `README.md` -- The "Cognition Tier Summary" table states "No new agents require T3". This is correct but worth noting that the `lu-research-graduator` at T2 is the highest-tier new agent, and the text should clarify that T2 includes both read and write MuninnDB access (the table says "Read existing engrams for deduplication, write new engrams" which is good).

- **MIN-AO-003**: `research-team.md` -- The "Hybrid Alternative" section mentions a `createResearcherAgent` factory function in `src/agents/__helpers/create-researcher.ts`, and `new-agents-needed.md` similarly proposes shared constants in `src/agents/__helpers/researcher-shared-sections.ts`. These are essentially the same idea presented differently. Cross-reference them so an implementer sees both discussions.

- **MIN-AO-004**: `orchestration-flow.md` -- The state transition diagram shows `DISCUSSING` -> `REVIEWING_RESEARCH` -> `GRADUATING` -> `PLANNING`, but the sequence diagram shows Step 4 (Discuss) happening BEFORE Step 5 (Review). This means research produced in Step 3 passes through discussion (Step 4) before review (Step 5). This ordering is potentially problematic: discussion may lock decisions that alter the research corpus, but the review loop evaluates the pre-discussion research. Clarify whether reviewers see pre-discussion or post-discussion research, and whether discussion-driven CONTEXT.md influences what reviewers evaluate.

- **MIN-AO-005**: `graduation-agent.md` -- The graduation scoring formula uses multiplication (`confidence * actionability * uniqueness`), which means a score of 0.0 in any dimension zeros out the entire score. This is noted as intentional for duplicates (uniqueness=0.0) and unverified findings (confidence=0.0), but it also means a HIGH-confidence, novel finding that is "not actionable" (actionability=0.0) would score 0.0 and never graduate. Since pitfalls and risk warnings are often not directly "actionable" but are valuable as warnings, consider whether the actionability dimension should have a floor above 0.0 for certain finding categories.

- **MIN-AO-006**: `orchestration-flow.md` -- The "New Gates to Consider" section proposes `research_review` and `graduation` gates but does not propose adding them to `.planning/config.json` gates section or updating the `gate-enforcement.md` rule. These should be tracked as implementation tasks.

## Architecture Compliance Check

**Domain Architecture Compliance:** The new agents follow the existing entity domain structure. All 8 agents would be placed in `src/agents/general/` following the `{name}.agent.ts` naming convention, which matches the 35 existing agent files found in that directory. The agents use the `AgentConfig` type and `createAgent` factory function, consistent with every existing agent. Entity domain archetype A conventions are respected: agents live in entity dirs, use `__schemas/` for types, and `__helpers/` for shared logic.

**Module Boundary Compliance:** The proposed shared helpers (`researcher-shared-sections.ts`, `research-reviewer-shared-sections.ts`) would live in `src/agents/__helpers/`, which is the correct location per the module boundary rules. No cross-domain imports are introduced. T0/T1 boundary is respected -- researchers import nothing from T2 entity domains.

**Barrel Index Invariant:** No changes proposed to `src/agents/index.ts`. Registry updates go to `build-agent-registry.ts` in `__helpers/`, which is appropriate.

**File Naming:** All proposed files follow kebab-case: `lu-architecture-researcher.agent.ts`, `researcher-shared-sections.ts`, etc. Compliant.

**Purpose Categories:** The `PurposeCategorySchema` already includes `"researcher"`, `"reviewer"`, and `"synthesizer"`, which cover all 8 new agents. No schema changes needed.

## Agent Consolidation Analysis

**Could any of the 8 new agents be merged without losing quality?**

The documentation thoroughly addresses this question in both `research-team.md` and `review-team.md`, arriving at the correct conclusion: separate agents are preferable. The analysis is rigorous. Here is my independent assessment:

**Researchers (4 agents):** Consolidation to a parameterized agent is theoretically possible but inadvisable for three reasons well-documented in the specs: (1) different tool lists (Context7 for implementation only), (2) existing codebase pattern of separate agents, and (3) focused prompts outperform conditional prompts. The documentation's recommendation to extract shared sections via `__helpers/` constants is the right approach.

**Reviewers (3 agents):** Consolidation is structurally impossible without losing correctness. The three reviewers have different cognition tiers (T0 vs T1) and different isolation modes (cold vs warm). A single parameterized agent cannot express these differences in frontmatter. This is the strongest argument against consolidation and the documentation makes it well.

**Graduator (1 agent):** Already a single agent. No consolidation applicable.

**Cross-team consolidation:** Could a researcher also serve as its own reviewer? No -- this would violate the cold isolation principle that is the core design rationale. The documentation is clear on this.

**Could the 8 be reduced to fewer?** The only plausible reduction would be merging the ecosystem researcher into the implementation researcher (both investigate libraries), reducing researchers from 4 to 3. However, their focus areas are genuinely different: implementation asks "how do I use this library?" while ecosystem asks "should I use this library or an alternative?" This distinction matters for plan quality.

**Verdict:** 8 agents is justified. No consolidation is recommended.

## Race Condition and Deadlock Analysis

The orchestration flow has **no deadlocks** -- the dependency graph is a DAG with clear barrier points. The only cycles are the review loop and harness fix loop, both of which have explicit iteration caps with escalation.

**Potential race condition (low severity):** In the review loop's re-expansion step, targeted researchers write addenda to existing research files. If two targeted researchers are assigned to the same file (e.g., both address gaps in `01-architecture-patterns.md`), they could race on file writes. The documentation does not address this. **Mitigation:** Either (a) ensure each targeted researcher writes to a separate addendum file, or (b) serialize targeted researchers that target the same file.

**Potential timing issue (low severity):** The sequence diagram shows the research synthesizer committing research files at Step 3, but the review loop at Step 5 may trigger re-expansion that modifies those files. The commit at Step 3 means the working tree and git history diverge during review iterations. This is not a race condition per se, but it means the final commit after graduation must include the addenda. The documentation does not address when the final research corpus is committed.

## Verdict: NEEDS REVISION

The documentation is high quality overall -- well-reasoned architecture, thorough specifications, and excellent trade-off analysis. However, the five CRITICAL findings (model routing preset contradictions between documents, isolation mode contradiction, output file naming conflict, and pipeline numbering divergence) must be resolved before implementation. An implementer reading `research-team.md` and `new-agents-needed.md` back-to-back would encounter directly contradictory instructions for model routing, isolation mode, tool lists, and output file names. These are not ambiguities -- they are flat contradictions that would produce different implementations depending on which document is consulted first.

**Recommended revision priority:**

1. CRIT-AO-001 + CRIT-AO-002: Settle model routing presets across all documents
2. CRIT-AO-003: Fix isolation mode in `new-agents-needed.md`
3. CRIT-AO-004: Align output file naming
4. CRIT-AO-005: Reconcile pipeline step numbering with complexity-gating rule
5. IMP-AO-004: Settle concept prefix scheme for graduation
6. IMP-AO-001: Add `lu-research-synthesizer` v2 spec or explicit "unchanged" note
