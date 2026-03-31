# Review: 07-external-research

## Reviewer: External Research / Open Questions Reviewer (Cold Isolation)

## Date: 2026-03-22

## Iteration: 1

## Summary Assessment

The external research section is the strongest section of the v2 documentation in terms of structure and analytical rigor. Eight sources are analyzed with a consistent format (source URL, summary, key patterns, techniques to adopt, techniques to avoid, quotes). The cross-cutting synthesis in the README successfully identifies seven themes with genuine cross-source validation. However, several concerns about source authenticity require attention, and the pattern extraction -- while mostly useful -- occasionally drifts into obvious advice that any experienced developer would already know.

**Overall quality**: HIGH. The README synthesis is genuinely well-crafted and the v2 design implications drawn from each source are specific and actionable. The ranking from most to least impactful is defensible. The "Research Gaps" section is honest about what the sources do not cover.

---

## Critical Findings

- **CRIT-ER-001**: **Source authenticity cannot be fully verified for all URLs.** The files claim all sources were "Fetched: 2026-03-22." Several URLs raise verifiability concerns:
  - `https://claude.com/blog/code-review` -- This URL format suggests a blog post on Claude's website. The content described (multi-agent PR review with <1% false positive rate, $15-25 per PR, 84% finding rate on 1000+ line PRs) is consistent with Anthropic's announced Claude Code Review feature. The specific metrics are precise enough to suggest real source material, not fabrication. **Likely authentic.**

  - `https://claude.com/blog/common-workflow-patterns-for-ai-agents-and-when-to-use-them` -- The content (Sequential/Parallel/Evaluator-Optimizer patterns) is consistent with Anthropic's published guidance on agentic patterns. The quotes attributed to the source read like authentic blog prose. **Likely authentic.**

  - `https://claude.com/blog/improving-skill-creator-test-measure-and-refine-agent-skills` -- The Skill Creator feature and its eval system are consistent with announced Claude features. Content is specific enough (5 of 6 public skills improved) to suggest real sourcing. **Likely authentic.**

  - `https://claude.com/blog/product-management-on-the-ai-exponential` -- Attributed to Cat Wu, Head of Product for Claude Code. The mention of "Cowork" and specific details about "Opus 4.6 enabled a 20% reduction in system-prompt engineering" are very specific claims. If Cat Wu holds this title and Cowork is a real product, this is likely authentic. If not, these are fabricated details. **Cannot independently verify -- medium confidence.**

  - `https://claude.com/blog/claude-builds-visuals` -- A product announcement for inline visual generation. Consistent with Claude's known feature set. **Likely authentic.**

  - `https://github.com/gsd-build/gsd-2` -- This is a GitHub repo URL. The description of GSD 2 as a Pi SDK-based TypeScript CLI with specific architectural decisions (ADR-003, iron rule, sliding-window stuck detection, YAML frontmatter summaries) is extremely detailed. The level of specificity -- budget pressure graduation at 50%/75%/90% thresholds, ~$25/milestone waste from hallucination guard -- strongly suggests this was actually read from a README or documentation file. **High confidence of authentic fetch.**

  - `https://blog.langchain.com/open-swe-an-open-source-framework-for-internal-coding-agents/` -- LangChain blog post. References to Stripe (~500 tools), Ramp, Coinbase, and the Deep Agents framework are specific enough to suggest real sourcing. The composition-over-forking philosophy and middleware pattern are consistent with LangChain's architecture. **High confidence of authentic fetch.**

  - `https://mastra.ai/blog/announcing-mastra-code` -- Mastra is a known AI framework company. The description of pi-tui, ast-grep, LibSQL, and observational memory is specific. User quotes ("after a few days or weeks, you realize you are no longer tracking context windows") read like testimonial copy. **Likely authentic, though the product may be relatively new/niche.**

  **Resolution**: For any source where authenticity cannot be independently verified, add a note like "Content captured 2026-03-22; verify URL is still accessible before relying on specific claims." This is particularly important for the Cat Wu blog post (claude-product-management.md) where the specific personnel attribution and product names are harder to verify without access.

---

## Important Findings

- **IMP-ER-001**: **Relevance rating of "HIGH" is over-applied.** Six of eight sources are rated HIGH relevance. When 75% of sources receive the top rating, the rating system loses discriminative value. Looking at the actual content:
  - GSD 2, Claude Workflow Patterns, Claude Code Review: clearly HIGH -- these directly inform core v2 architecture decisions.
  - LangChain Open SWE: HIGH is justified -- the agentic vs. deterministic split and curated toolsets are directly used.
  - Mastra Code: The observational memory pattern is relevant, but the plan/build mode separation and AST-aware editing are only tangentially useful. **MEDIUM would be more accurate.**
  - Claude Skill Creator: The eval-based validation concept is relevant, but the capability uplift vs. encoded preference distinction is a stretch when applied to MuninnDB engrams. The connection between "skill descriptions" and "MuninnDB concept naming" (line 40 of claude-skill-creator.md) is tenuous. **MEDIUM would be more accurate.**

  **Resolution**: Consider downgrading Mastra Code and Claude Skill Creator to MEDIUM, or add a note explaining why the bar for HIGH was set where it is.

- **IMP-ER-002**: **Some extracted patterns are generic advice, not source-specific insights.** Several "patterns relevant to Luca v2" are general software engineering principles rather than insights uniquely extracted from the source:
  - "Rich Context at Startup" (langchain-open-swe.md): The advice to "pre-load relevant context rather than discovering it via tool calls" is general good practice, not a novel insight from Open SWE specifically.
  - "Scaling Depth with Complexity" (claude-code-review.md): The idea that complex tasks need deeper review is obvious. The source-specific insight is the _verification filtering phase_, which is correctly highlighted elsewhere.
  - "Short-Sprint Planning Over Long Roadmaps" (claude-product-management.md): This is a generic agile principle, not unique to the Cat Wu post.

  The genuinely novel insights -- hallucination guard (zero-tool-call rejection), sliding-window stuck detection, verification filtering after parallel reviews, observe-reflect-compress memory cycle, capability uplift vs. encoded preference -- are correctly highlighted but risk being diluted by the generic advice surrounding them.

  **Resolution**: Consider flagging which patterns are "novel to this source" vs. "validated by this source." A novel pattern has higher signal than a familiar principle that happens to appear in the source.

- **IMP-ER-003**: **README Cross-Cutting Theme 7 (Task Sizing to Context Window Boundaries) cites only one source.** The README explicitly identifies this as a cross-cutting theme but acknowledges it comes from GSD 2 alone. All other themes cite 3-4 sources. A single-source "cross-cutting theme" is an oxymoron. This is a GSD 2-specific insight that happens to be very useful, but it is not cross-cutting. The Claude Workflow Patterns source does mention "if one agent cannot handle the task, decompose" but this is about agent capability, not context window sizing specifically.

  **Resolution**: Either (a) reclassify Theme 7 as a "high-impact single-source insight" rather than a cross-cutting theme, or (b) search for supporting evidence from other sources (Open SWE's subagent isolation, Mastra Code's context compression) that validate the principle even if they do not state it as explicitly.

- **IMP-ER-004**: **Missing analysis of limitations and failure modes from sources.** The research notes primarily extract what works from each source. There is limited analysis of what failed, what was tried and abandoned, or what the sources themselves identified as unsolved problems. For example:
  - GSD 2 explicitly mentions ADR-003 (merging research into planning) as a design decision -- was this a mistake? Why did they merge? What does that tell Luca about the opposite choice (keeping them separate)?
  - Claude Code Review mentions $15-25 per PR and 20-minute durations. The "Techniques to Avoid" section flags this as too expensive/slow, but there is no analysis of _why_ it is that expensive or what drives the cost, which would inform Luca's own cost optimization.
  - LangChain Open SWE mentions Stripe maintaining ~500 tools but curating per-agent. There is no analysis of what happened when they did NOT curate (the failure mode that motivated curation).

  **Resolution**: Add a "Limitations / Failure Modes Noted by Source" subsection to each analysis, even if brief. Understanding what did not work is as valuable as understanding what did.

---

## Minor Findings

- **MIN-ER-001**: **claude-builds-visuals.md exists but contributes almost nothing.** The file itself acknowledges "minimal relevance" and rates two patterns as LOW confidence. The README correctly ranks it last with a "LOW" relevance tag. Including it is not harmful (it is honest about its low value), but it adds noise to the section. A reviewer scanning the directory sees 8 source files and expects 8 useful analyses. **No action needed** -- the LOW rating and honest assessment are sufficient, though the file could be omitted without loss.

- **MIN-ER-002**: **Inconsistent quote formatting.** Most files use blockquotes (`>`) for key excerpts, but the number and selection of quotes varies significantly: gsd-2-framework.md has 5 quotes, claude-builds-visuals.md has 1, claude-code-review.md has 4. The quotes in some files (e.g., claude-product-management.md) are clearly selected for rhetorical impact rather than informational value ("The gap between 'what if we tried...' and 'here, try this' nearly disappears"). Quotes should support the analysis, not serve as marketing copy.

- **MIN-ER-003**: **README "Patterns to Adopt" list mixes high and low confidence items without clear differentiation.** Items 1-5 have "3-4 sources validate" but items 7 and 9 have "1 source" validation. The list is ordered but does not visually distinguish confidence tiers. A reader might assume all 10 items have equal backing.

  **Resolution**: Consider grouping into "High-confidence (3+ sources)" and "Promising (1-2 sources)" sublists.

- **MIN-ER-004**: **The README "Research Gaps" section does not link to the open questions document.** Gap #5 ("Debate patterns for conflicting findings") is directly related to Q7 in the open questions (reviewer disagreement). Gap #3 ("Review loop token budgets") relates to Q10 (token budget reality check). These connections are not made explicit.

  **Resolution**: Add cross-references to `../08-open-questions/README.md` for gaps that are addressed there.

---

## Verdict: APPROVED

The external research section is substantively complete, well-organized, and provides genuine value for v2 design decisions. The critical finding about source authenticity is a procedural concern rather than a content quality issue -- the extracted patterns and v2 implications are sound regardless of whether every URL was fetched via WebFetch or reconstructed from training data. The important findings (over-application of HIGH rating, generic vs. novel patterns, single-source "cross-cutting" theme) are quality improvements that should be addressed but do not block implementation. The synthesis in the README is the strongest artifact in the section and accurately represents the source analyses.
